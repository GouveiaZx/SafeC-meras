import { spawn } from 'child_process';
import logger from '../utils/logger.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Carregar variáveis de ambiente
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '..', '..', '.env');
dotenv.config({ path: envPath });

/**
 * Serviço para extração de metadados de vídeo
 */
class VideoMetadataService {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  /**
   * Extrair metadados de vídeo usando ffprobe
   * @param {string} filePath - Caminho do arquivo de vídeo
   * @returns {Promise<Object>} - Metadados do vídeo
   */
  async extractVideoMetadata(filePath) {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        '-select_streams', 'v:0',
        filePath
      ]);

      let output = '';
      let errorOutput = '';

      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code === 0) {
          try {
            const metadata = JSON.parse(output);
            const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
            const format = metadata.format;

            if (!videoStream) {
              reject(new Error('Nenhum stream de vídeo encontrado'));
              return;
            }

            // Mapear codec para valores aceitos pelo banco
            let codec = videoStream.codec_name || null;
            if (codec === 'hevc') {
              codec = 'h265';
            } else if (codec === 'h264') {
              codec = 'h264';
            } else if (codec === 'mjpeg') {
              codec = 'mjpeg';
            } else {
              // Para outros codecs, usar h264 como padrão
              codec = 'h264';
            }

            const result = {
              width: parseInt(videoStream.width) || null,
              height: parseInt(videoStream.height) || null,
              duration: parseFloat(format.duration) || parseFloat(videoStream.duration) || null,
              fps: this.calculateFPS(videoStream),
              codec: codec,
              bitrate: parseInt(format.bit_rate) || parseInt(videoStream.bit_rate) || null,
              fileSize: parseInt(format.size) || null,
              resolution: videoStream.width && videoStream.height 
                ? `${videoStream.width}x${videoStream.height}` 
                : null
            };

            logger.info(`[VideoMetadataService] Metadados extraídos: ${JSON.stringify(result)}`);
            resolve(result);
          } catch (error) {
            logger.error(`[VideoMetadataService] Erro ao parsear metadados: ${error.message}`);
            reject(error);
          }
        } else {
          logger.error(`[VideoMetadataService] ffprobe falhou: ${errorOutput}`);
          reject(new Error(`ffprobe falhou com código ${code}: ${errorOutput}`));
        }
      });

      ffprobe.on('error', (error) => {
        if (error.code === 'ENOENT') {
          logger.error('[VideoMetadataService] ffprobe não encontrado. Instale o FFmpeg.');
          reject(new Error('ffprobe não encontrado. Instale o FFmpeg.'));
        } else {
          logger.error(`[VideoMetadataService] Erro ao executar ffprobe: ${error.message}`);
          reject(error);
        }
      });
    });
  }

  /**
   * Calcular FPS do vídeo
   * @param {Object} videoStream - Stream de vídeo
   * @returns {number|null} - FPS calculado
   */
  calculateFPS(videoStream) {
    if (videoStream.r_frame_rate) {
      const [num, den] = videoStream.r_frame_rate.split('/');
      if (den && parseInt(den) !== 0) {
        return Math.round(parseInt(num) / parseInt(den));
      }
    }
    
    if (videoStream.avg_frame_rate) {
      const [num, den] = videoStream.avg_frame_rate.split('/');
      if (den && parseInt(den) !== 0) {
        return Math.round(parseInt(num) / parseInt(den));
      }
    }
    
    return null;
  }

  /**
   * Atualizar metadados de gravação no banco de dados
   * @param {string} recordingId - ID da gravação
   * @param {Object} metadata - Metadados extraídos
   * @returns {Promise<boolean>} - Sucesso da operação
   */
  async updateRecordingMetadata(recordingId, metadata) {
    try {
      const updateData = {
        file_size: metadata.fileSize,
        duration: metadata.duration ? Math.round(metadata.duration) : null,
        resolution: metadata.resolution,
        fps: metadata.fps,
        bitrate: metadata.bitrate,
        codec: metadata.codec,
        updated_at: new Date().toISOString()
      };

      // Remover campos null/undefined
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === null || updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      const { error } = await this.supabase
        .from('recordings')
        .update(updateData)
        .eq('id', recordingId);

      if (error) {
        throw error;
      }

      logger.info(`[VideoMetadataService] Metadados atualizados para gravação ${recordingId}`);
      return true;
    } catch (error) {
      logger.error(`[VideoMetadataService] Erro ao atualizar metadados: ${error.message}`);
      throw error;
    }
  }

  /**
   * Processar arquivo de vídeo e atualizar metadados
   * @param {string} recordingId - ID da gravação
   * @param {string} filePath - Caminho do arquivo
   * @returns {Promise<Object>} - Metadados extraídos
   */
  async processVideoFile(recordingId, filePath) {
    try {
      logger.info(`[VideoMetadataService] Processando arquivo: ${filePath}`);
      
      // Extrair metadados
      const metadata = await this.extractVideoMetadata(filePath);
      
      // Atualizar no banco de dados
      await this.updateRecordingMetadata(recordingId, metadata);
      
      return metadata;
    } catch (error) {
      logger.error(`[VideoMetadataService] Erro ao processar arquivo ${filePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verificar se arquivo existe
   * @param {string} filePath - Caminho do arquivo
   * @returns {Promise<boolean>}
   */
  async fileExists(filePath) {
    try {
      const fs = await import('fs/promises');
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Encontrar arquivo de gravação em múltiplos locais possíveis
   * @param {Object} recording - Objeto da gravação
   * @returns {Promise<string|null>} - Caminho do arquivo encontrado ou null
   */
  async findRecordingFile(recording) {
    const path = await import('path');
    
    // Caminhos possíveis onde o arquivo pode estar
    const possiblePaths = [
      // Caminho original do banco
      recording.file_path,
      // Caminho relativo ao projeto
      path.resolve(process.cwd(), '..', recording.file_path),
      // Caminho no storage principal
      path.resolve(process.cwd(), '..', 'storage', 'www', 'record', 'live', recording.camera_id, recording.filename),
      // Caminho com data extraída do filename
      (() => {
        const dateMatch = recording.filename.match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
          return path.resolve(process.cwd(), '..', 'storage', 'www', 'record', 'live', recording.camera_id, dateMatch[1], recording.filename);
        }
        return null;
      })(),
      // Caminho absoluto se já for um
      path.isAbsolute(recording.file_path) ? recording.file_path : null
    ].filter(Boolean);

    // Testar cada caminho possível
    for (const filePath of possiblePaths) {
      if (await this.fileExists(filePath)) {
        return filePath;
      }
    }

    return null;
  }

  /**
   * Processar todas as gravações sem metadados
   * @returns {Promise<number>} - Número de gravações processadas
   */
  async processAllRecordingsWithoutMetadata() {
    try {
      logger.info('[VideoMetadataService] Buscando gravações sem metadados...');
      
      // Buscar gravações que não têm metadados completos
      const { data: recordings, error } = await this.supabase
        .from('recordings')
        .select('id, filename, file_path, camera_id')
        .or('duration.is.null,resolution.is.null,file_size.is.null')
        .eq('status', 'completed')
        .limit(50); // Processar em lotes

      if (error) {
        throw error;
      }

      if (!recordings || recordings.length === 0) {
        logger.info('[VideoMetadataService] Nenhuma gravação sem metadados encontrada');
        return 0;
      }

      logger.info(`[VideoMetadataService] Encontradas ${recordings.length} gravações para processar`);
      
      let processedCount = 0;
      
      for (const recording of recordings) {
        try {
          // Usar o novo método para encontrar o arquivo
          const filePath = await this.findRecordingFile(recording);
          
          if (!filePath) {
            logger.warn(`[VideoMetadataService] Arquivo não encontrado para gravação ${recording.id}`);
            continue;
          }
          
          await this.processVideoFile(recording.id, filePath);
          processedCount++;
          
          // Pequena pausa para não sobrecarregar o sistema
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          logger.error(`[VideoMetadataService] Erro ao processar gravação ${recording.id}: ${error.message}`);
        }
      }
      
      logger.info(`[VideoMetadataService] Processamento concluído: ${processedCount} gravações processadas`);
      return processedCount;
    } catch (error) {
      logger.error(`[VideoMetadataService] Erro no processamento em lote: ${error.message}`);
      throw error;
    }
  }
}

export default new VideoMetadataService();