/**
 * RecordingSyncService - Sincronização contínua entre arquivos físicos e banco de dados
 * 
 * Este serviço executa a cada 60 segundos e:
 * 1. Verifica arquivos MP4 órfãos no filesystem
 * 2. Vincula arquivos aos registros correspondentes
 * 3. Atualiza metadados de arquivos existentes
 * 4. Remove registros órfãos muito antigos
 */

import { createModuleLogger } from '../config/logger.js';
import { supabaseAdmin } from '../config/database.js';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class RecordingSyncService {
  constructor() {
    this.logger = createModuleLogger('RecordingSync');
    this.isRunning = false;
    this.interval = null;
    this.storageBasePath = path.resolve(process.cwd(), 'storage/www/record/live');
    
    this.logger.info('🔄 RecordingSyncService inicializado');
  }

  async start() {
    if (this.isRunning) {
      this.logger.warn('⚠️ Sync já está executando');
      return;
    }

    this.logger.info('🔄 Iniciando RecordingSyncService...');
    this.isRunning = true;

    // Executar primeira sincronização imediatamente
    await this.runSyncCycle();

    // Configurar intervalo de 60 segundos
    this.interval = setInterval(async () => {
      try {
        await this.runSyncCycle();
      } catch (error) {
        this.logger.error('❌ Erro no ciclo de sincronização:', error);
      }
    }, 60000);

    this.logger.info('✅ RecordingSyncService iniciado - ciclo de 60s');
  }

  async stop() {
    if (!this.isRunning) return;

    this.logger.info('🛑 Parando RecordingSyncService...');
    this.isRunning = false;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.logger.info('✅ RecordingSyncService parado');
  }

  async runSyncCycle() {
    try {
      this.logger.debug('🔄 Executando ciclo de sincronização...');

      // 1. Sincronizar arquivos órfãos
      await this.syncOrphanFiles();

      // 2. Atualizar metadados de arquivos existentes
      await this.updateFileMetadata();

      // 3. Limpar registros órfãos muito antigos
      await this.cleanupOldOrphans();

      this.logger.debug('✅ Ciclo de sincronização concluído');

    } catch (error) {
      this.logger.error('❌ Erro no ciclo de sincronização:', error);
    }
  }

  async syncOrphanFiles() {
    try {
      // Buscar arquivos MP4 no filesystem
      const filesInStorage = await this.findAllRecordingFiles();
      
      if (filesInStorage.length === 0) {
        this.logger.debug('📁 Nenhum arquivo MP4 encontrado no storage');
        return;
      }

      this.logger.debug(`📁 Encontrados ${filesInStorage.length} arquivos MP4 no storage`);

      let linkedFiles = 0;

      for (const fileInfo of filesInStorage) {
        try {
          // Verificar se arquivo já está vinculado no banco
          const { data: existingRecord } = await supabaseAdmin
            .from('recordings')
            .select('id, status')
            .eq('camera_id', fileInfo.cameraId)
            .eq('filename', fileInfo.filename)
            .single();

          if (!existingRecord) {
            // Tentar vincular a registro órfão
            const linked = await this.linkOrphanFile(fileInfo);
            if (linked) {
              linkedFiles++;
              this.logger.info(`🔗 Arquivo vinculado: ${fileInfo.filename}`);
            }
          }

        } catch (error) {
          this.logger.debug(`⚠️ Erro ao processar ${fileInfo.filename}: ${error.message}`);
        }
      }

      if (linkedFiles > 0) {
        this.logger.info(`✅ Sincronização: ${linkedFiles} arquivos vinculados`);
      }

    } catch (error) {
      this.logger.error('❌ Erro ao sincronizar arquivos órfãos:', error);
    }
  }

  async findAllRecordingFiles() {
    const files = [];

    try {
      const cameraFolders = await fs.readdir(this.storageBasePath);
      
      for (const cameraFolder of cameraFolders) {
        // Verificar se é UUID válido (pasta de câmera)
        if (!this.isValidUUID(cameraFolder)) continue;

        const cameraPath = path.join(this.storageBasePath, cameraFolder);
        
        try {
          const dateFolders = await fs.readdir(cameraPath);
          
          for (const dateFolder of dateFolders) {
            const datePath = path.join(cameraPath, dateFolder);
            
            try {
              const fileList = await fs.readdir(datePath);
              
              for (const filename of fileList) {
                if (filename.endsWith('.mp4') && !filename.startsWith('.')) {
                  const fullPath = path.join(datePath, filename);
                  const stats = await fs.stat(fullPath);
                  
                  files.push({
                    cameraId: cameraFolder,
                    date: dateFolder,
                    filename: filename,
                    fullPath: fullPath,
                    relativePath: path.relative(process.cwd(), fullPath).replace(/\\/g, '/'),
                    size: stats.size,
                    modified: stats.mtime,
                    created: stats.birthtime
                  });
                }
              }
            } catch (err) {
              continue;
            }
          }
        } catch (err) {
          continue;
        }
      }

    } catch (error) {
      this.logger.error('❌ Erro ao buscar arquivos MP4:', error);
    }

    return files;
  }

  async linkOrphanFile(fileInfo) {
    try {
      // Extrair timestamp do nome do arquivo
      const fileTime = this.extractTimeFromFilename(fileInfo.filename);
      if (!fileTime) {
        this.logger.debug(`⚠️ Não foi possível extrair timestamp de: ${fileInfo.filename}`);
        return false;
      }

      // Buscar registro órfão próximo no tempo (±10 minutos)
      const timeStart = new Date(fileTime.getTime() - 10 * 60000).toISOString();
      const timeEnd = new Date(fileTime.getTime() + 10 * 60000).toISOString();

      const { data: orphanRecording } = await supabaseAdmin
        .from('recordings')
        .select('id, start_time, created_at')
        .eq('camera_id', fileInfo.cameraId)
        .or('status.eq.recording,status.eq.completed')
        .or('file_path.is.null,filename.is.null')
        .gte('created_at', timeStart)
        .lte('created_at', timeEnd)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (orphanRecording) {
        // Vincular arquivo ao registro órfão
        const { error } = await supabaseAdmin
          .from('recordings')
          .update({
            filename: fileInfo.filename,
            file_path: fileInfo.relativePath,
            local_path: fileInfo.relativePath,
            file_size: fileInfo.size,
            status: 'completed',
            end_time: fileTime.toISOString(),
            metadata: {
              ...orphanRecording.metadata,
              synced_by: 'RecordingSyncService',
              synced_at: new Date().toISOString(),
              file_modified: fileInfo.modified.toISOString()
            },
            updated_at: new Date().toISOString()
          })
          .eq('id', orphanRecording.id);

        if (!error) {
          this.logger.debug(`🔗 Arquivo ${fileInfo.filename} vinculado ao registro ${orphanRecording.id}`);
          return true;
        } else {
          this.logger.error(`❌ Erro ao vincular arquivo: ${error.message}`);
        }
      }

      return false;

    } catch (error) {
      this.logger.error(`❌ Erro ao vincular arquivo órfão ${fileInfo.filename}:`, error);
      return false;
    }
  }

  async updateFileMetadata() {
    try {
      // Buscar registros com arquivos que podem ter mudado de tamanho
      const { data: recordingsToCheck } = await supabaseAdmin
        .from('recordings')
        .select('id, filename, file_path, file_size, camera_id')
        .not('filename', 'is', null)
        .not('file_path', 'is', null)
        .eq('status', 'completed')
        .limit(50); // Verificar até 50 por ciclo

      if (!recordingsToCheck || recordingsToCheck.length === 0) return;

      let updatedCount = 0;

      for (const recording of recordingsToCheck) {
        try {
          const fullPath = path.resolve(process.cwd(), recording.file_path);
          const stats = await fs.stat(fullPath);

          // Verificar se tamanho mudou
          if (stats.size !== recording.file_size) {
            const { error } = await supabaseAdmin
              .from('recordings')
              .update({
                file_size: stats.size,
                metadata: {
                  ...recording.metadata,
                  size_updated_by: 'RecordingSyncService',
                  size_updated_at: new Date().toISOString(),
                  previous_size: recording.file_size
                },
                updated_at: new Date().toISOString()
              })
              .eq('id', recording.id);

            if (!error) {
              updatedCount++;
              this.logger.debug(`📊 Tamanho atualizado para ${recording.filename}: ${recording.file_size} → ${stats.size}`);
            }
          }

        } catch (error) {
          // Arquivo não existe mais
          if (error.code === 'ENOENT') {
            this.logger.warn(`⚠️ Arquivo não encontrado: ${recording.file_path}`);
            
            // Marcar como erro
            await supabaseAdmin
              .from('recordings')
              .update({
                status: 'error',
                metadata: {
                  ...recording.metadata,
                  error: 'Arquivo físico não encontrado',
                  error_detected_at: new Date().toISOString()
                },
                updated_at: new Date().toISOString()
              })
              .eq('id', recording.id);
          }
        }
      }

      if (updatedCount > 0) {
        this.logger.info(`📊 Metadados atualizados: ${updatedCount} registros`);
      }

    } catch (error) {
      this.logger.error('❌ Erro ao atualizar metadados:', error);
    }
  }

  async cleanupOldOrphans() {
    try {
      // Remover registros órfãos com mais de 24 horas
      const oldThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data: oldOrphans } = await supabaseAdmin
        .from('recordings')
        .select('id')
        .eq('status', 'recording')
        .is('filename', null)
        .is('file_path', null)
        .lt('created_at', oldThreshold);

      if (oldOrphans && oldOrphans.length > 0) {
        const { error } = await supabaseAdmin
          .from('recordings')
          .update({
            status: 'error',
            metadata: {
              error: 'Registro órfão antigo removido',
              cleaned_up_at: new Date().toISOString(),
              cleaned_up_by: 'RecordingSyncService'
            },
            updated_at: new Date().toISOString()
          })
          .in('id', oldOrphans.map(r => r.id));

        if (!error) {
          this.logger.info(`🧹 Limpeza: ${oldOrphans.length} registros órfãos antigos marcados como erro`);
        }
      }

    } catch (error) {
      this.logger.error('❌ Erro ao limpar registros órfãos antigos:', error);
    }
  }

  extractTimeFromFilename(filename) {
    // Extrair timestamp de nomes como: 2025-08-21-04-06-25-0.mp4
    const match = filename.match(/^(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})/);
    if (match) {
      const timeStr = match[1];
      const [year, month, day, hour, minute, second] = timeStr.split('-');
      return new Date(year, month - 1, day, hour, minute, second);
    }
    return null;
  }

  isValidUUID(str) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }

  async getStatus() {
    return {
      isRunning: this.isRunning,
      intervalMs: this.interval ? 60000 : null,
      lastRun: new Date().toISOString()
    };
  }
}

export default new RecordingSyncService();