/**
 * Script para corrigir metadados de gravações retroativamente
 * - Calcula duração para gravações com duration NULL
 * - Enfileira uploads pendentes para processamento
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import { createModuleLogger } from '../config/logger.js';
import { supabaseAdmin } from '../config/database.js';
import UploadQueueService from '../services/UploadQueueService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const logger = createModuleLogger('FixRecordingMetadata');

class RecordingMetadataFixer {
  constructor() {
    this.supabase = supabaseAdmin;
    this.processed = 0;
    this.fixed = 0;
    this.errors = 0;
    this.enqueued = 0;
  }

  /**
   * Executar ffprobe para obter metadados do arquivo
   */
  async getVideoMetadata(filePath) {
    return new Promise((resolve) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'quiet',
        '-show_entries', 'format=duration:stream=width,height,r_frame_rate,codec_name,bit_rate',
        '-of', 'json',
        filePath
      ]);
      
      let output = '';
      let errorOutput = '';
      
      ffprobe.stdout.on('data', (data) => output += data);
      ffprobe.stderr.on('data', (data) => errorOutput += data);
      
      ffprobe.on('close', (code) => {
        if (code === 0 && output.trim()) {
          try {
            const result = JSON.parse(output.trim());
            resolve({ success: true, data: result });
          } catch (e) {
            resolve({ success: false, error: 'JSON parse error' });
          }
        } else {
          resolve({ success: false, error: errorOutput.trim() || 'Process failed' });
        }
      });
      
      ffprobe.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    });
  }

  /**
   * Buscar arquivo de gravação usando os mesmos padrões do sistema
   */
  async findRecordingFile(recording) {
    const searchPaths = [];
    
    // 1. Usar file_path e local_path se existir
    if (recording.file_path) {
      const projectRoot = process.cwd().includes('backend') 
        ? path.join(process.cwd(), '..')
        : process.cwd();
      
      if (recording.file_path.startsWith('storage/')) {
        searchPaths.push(path.join(projectRoot, recording.file_path));
      } else {
        searchPaths.push(recording.file_path);
      }
    }
    
    if (recording.local_path && recording.local_path !== recording.file_path) {
      const projectRoot = process.cwd().includes('backend') 
        ? path.join(process.cwd(), '..')
        : process.cwd();
      
      if (recording.local_path.startsWith('storage/')) {
        searchPaths.push(path.join(projectRoot, recording.local_path));
      } else {
        searchPaths.push(recording.local_path);
      }
    }
    
    // 2. Buscar no diretório processed
    if (recording.filename) {
      const basePath = process.cwd().includes('backend') 
        ? path.join(process.cwd(), '..') 
        : process.cwd();
      
      searchPaths.push(
        path.join(basePath, 'storage', 'www', 'record', 'live', 'processed', recording.filename),
        path.join(basePath, 'storage', 'www', 'record', 'live', recording.filename)
      );
    }
    
    // Testar cada path
    for (const testPath of searchPaths) {
      try {
        const stats = await fs.stat(testPath);
        if (stats.isFile()) {
          return { path: testPath, size: stats.size };
        }
      } catch (error) {
        // Arquivo não encontrado, continuar
      }
    }
    
    return null;
  }

  /**
   * Corrigir metadados de uma gravação específica
   */
  async fixRecordingMetadata(recording) {
    logger.info(`🔧 Processando gravação: ${recording.id}`, {
      filename: recording.filename,
      duration: recording.duration,
      file_size: recording.file_size,
      status: recording.status
    });

    try {
      // Encontrar o arquivo
      const fileInfo = await this.findRecordingFile(recording);
      
      if (!fileInfo) {
        logger.warn(`⚠️ Arquivo não encontrado para gravação ${recording.id}`);
        return { success: false, reason: 'file_not_found' };
      }

      let needsUpdate = false;
      const updateData = {};

      // Verificar se precisa calcular duração
      if (!recording.duration || recording.duration === 0) {
        logger.info(`📊 Calculando duração para ${recording.filename}`);
        
        const metadata = await this.getVideoMetadata(fileInfo.path);
        
        if (metadata.success && metadata.data.format?.duration) {
          const duration = Math.round(parseFloat(metadata.data.format.duration));
          updateData.duration = duration;
          
          // Calcular end_time baseado na duração
          if (recording.started_at || recording.start_time) {
            const startTime = new Date(recording.started_at || recording.start_time);
            updateData.end_time = new Date(startTime.getTime() + (duration * 1000)).toISOString();
          }
          
          // Extrair metadados do stream de vídeo
          const videoStream = metadata.data.streams?.find(s => s.codec_type === 'video');
          if (videoStream) {
            updateData.width = videoStream.width;
            updateData.height = videoStream.height;
            updateData.resolution = `${videoStream.width}x${videoStream.height}`;
            
            // Codec
            const codecName = videoStream.codec_name?.toLowerCase();
            if (codecName === 'hevc' || codecName === 'h265') {
              updateData.codec = 'h265';
            } else if (codecName === 'mjpeg') {
              updateData.codec = 'mjpeg';
            } else {
              updateData.codec = 'h264';
            }
            
            // FPS
            if (videoStream.r_frame_rate) {
              const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
              if (den && den !== 0) {
                updateData.fps = Math.round(num / den);
              }
            }
            
            // Bitrate
            if (videoStream.bit_rate) {
              updateData.bitrate = Math.round(parseInt(videoStream.bit_rate) / 1000);
              
              // Quality baseada no bitrate
              if (updateData.bitrate > 2000) {
                updateData.quality = 'high';
              } else if (updateData.bitrate > 1000) {
                updateData.quality = 'medium';
              } else {
                updateData.quality = 'low';
              }
            }
          }
          
          needsUpdate = true;
          logger.info(`✅ Metadados calculados:`, { 
            duration,
            resolution: updateData.resolution,
            codec: updateData.codec,
            fps: updateData.fps,
            bitrate: updateData.bitrate
          });
        } else {
          logger.warn(`⚠️ Falha ao obter metadados via ffprobe: ${metadata.error}`);
          
          // Fallback: usar estimativa baseada no tamanho do arquivo
          if (fileInfo.size > 100000) {
            const estimatedDuration = Math.round(fileInfo.size / (1024 * 1024) * 60);
            updateData.duration = estimatedDuration;
            needsUpdate = true;
            logger.info(`📊 Duração estimada baseada no tamanho: ${estimatedDuration}s`);
          }
        }
      }

      // Verificar se precisa atualizar file_size
      if (!recording.file_size && fileInfo.size) {
        updateData.file_size = fileInfo.size;
        needsUpdate = true;
      }

      // Atualizar banco se necessário
      if (needsUpdate) {
        updateData.updated_at = new Date().toISOString();
        
        const { error } = await this.supabase
          .from('recordings')
          .update(updateData)
          .eq('id', recording.id);

        if (error) {
          logger.error(`❌ Erro ao atualizar gravação ${recording.id}:`, error);
          return { success: false, reason: 'database_error', error };
        }

        logger.info(`✅ Gravação ${recording.id} atualizada com sucesso`);
        return { success: true, updated: updateData };
      }

      return { success: true, reason: 'no_update_needed' };

    } catch (error) {
      logger.error(`❌ Erro ao processar gravação ${recording.id}:`, error);
      return { success: false, reason: 'processing_error', error: error.message };
    }
  }

  /**
   * Enfileirar uploads pendentes
   */
  async enqueueUploads() {
    logger.info('📤 Verificando uploads pendentes...');

    try {
      // Buscar gravações completed com upload_status pending
      const { data: pendingUploads, error } = await this.supabase
        .from('recordings')
        .select('id, filename')
        .eq('status', 'completed')
        .eq('upload_status', 'pending')
        .limit(50);

      if (error) {
        logger.error('❌ Erro ao buscar uploads pendentes:', error);
        return;
      }

      if (!pendingUploads || pendingUploads.length === 0) {
        logger.info('✅ Nenhum upload pendente encontrado');
        return;
      }

      logger.info(`📤 Encontrados ${pendingUploads.length} uploads pendentes`);

      for (const recording of pendingUploads) {
        try {
          const result = await UploadQueueService.enqueue(recording.id, {
            priority: 'normal',
            source: 'metadata_fix_script'
          });

          if (result.success) {
            logger.info(`✅ ${recording.filename} enfileirado para upload`);
            this.enqueued++;
          } else {
            logger.warn(`⚠️ Falha ao enfileirar ${recording.filename}: ${result.reason}`);
          }
        } catch (enqueueError) {
          logger.error(`❌ Erro ao enfileirar ${recording.filename}:`, enqueueError.message);
        }
      }

    } catch (error) {
      logger.error('❌ Erro geral no enfileiramento de uploads:', error);
    }
  }

  /**
   * Executar correção de metadados
   */
  async run() {
    logger.info('🚀 Iniciando correção de metadados de gravações...');

    try {
      // Buscar gravações com duração NULL ou 0
      const { data: recordings, error } = await this.supabase
        .from('recordings')
        .select('*')
        .or('duration.is.null,duration.eq.0')
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        logger.error('❌ Erro ao buscar gravações:', error);
        return;
      }

      if (!recordings || recordings.length === 0) {
        logger.info('✅ Nenhuma gravação precisa de correção de metadados');
      } else {
        logger.info(`📊 Encontradas ${recordings.length} gravações para corrigir`);

        for (const recording of recordings) {
          this.processed++;
          
          const result = await this.fixRecordingMetadata(recording);
          
          if (result.success) {
            if (result.updated) {
              this.fixed++;
            }
          } else {
            this.errors++;
          }

          // Pequena pausa entre processamentos
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Enfileirar uploads pendentes
      await this.enqueueUploads();

      // Relatório final
      logger.info('🎉 Correção de metadados concluída:', {
        processadas: this.processed,
        corrigidas: this.fixed,
        erros: this.errors,
        uploads_enfileirados: this.enqueued
      });

    } catch (error) {
      logger.error('❌ Erro geral no script de correção:', error);
    }
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  const fixer = new RecordingMetadataFixer();
  
  fixer.run()
    .then(() => {
      logger.info('✅ Script concluído com sucesso');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ Script falhou:', error);
      process.exit(1);
    });
}

export default RecordingMetadataFixer;