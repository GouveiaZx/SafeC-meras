/**
 * RecordingService melhorado com validação robusta de arquivos
 * Implementa múltiplas estratégias de busca para garantir localização correta
 */

import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import { createReadStream } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import logger from '../utils/logger.js';

class ImprovedRecordingService {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    this.recordingsPath = process.env.RECORDINGS_PATH || path.join(process.cwd(), 'recordings');
    this.zlmApiUrl = process.env.ZLMEDIAKIT_API_URL || 'http://localhost:8080';
    this.zlmSecret = process.env.ZLMEDIAKIT_SECRET;
    
    // Garantir que o diretório de gravações existe
    this.ensureRecordingsDirectory();
  }

  /**
   * Garantir que o diretório de gravações existe
   */
  async ensureRecordingsDirectory() {
    try {
      await fs.mkdir(this.recordingsPath, { recursive: true });
      logger.info(`[ImprovedRecordingService] Diretório de gravações garantido: ${this.recordingsPath}`);
    } catch (error) {
      logger.error(`[ImprovedRecordingService] Erro ao criar diretório de gravações:`, error);
    }
  }

  /**
   * ESTRATÉGIA ROBUSTA DE LOCALIZAÇÃO DE ARQUIVOS
   * Implementa múltiplas estratégias para encontrar arquivos de gravação
   */
  async locateRecordingFile(recording) {
    const strategies = [
      this.strategy1_LocalPath.bind(this),
      this.strategy2_FileName.bind(this),
      this.strategy3_FilePath.bind(this),
      this.strategy4_TimestampSearch.bind(this),
      this.strategy5_CameraIdSearch.bind(this),
      this.strategy6_FuzzySearch.bind(this)
    ];

    logger.info(`🔍 [LOCATE] Iniciando busca robusta para gravação ${recording.id}:`, {
      filename: recording.filename,
      file_path: recording.file_path,
      local_path: recording.local_path,
      camera_id: recording.camera_id
    });

    for (let i = 0; i < strategies.length; i++) {
      const strategyName = strategies[i].name.replace('bound ', '');
      
      try {
        logger.info(`🔍 [LOCATE] Executando ${strategyName}...`);
        const result = await strategies[i](recording);
        
        if (result.found) {
          logger.info(`✅ [LOCATE] ${strategyName} SUCESSO:`, {
            filePath: result.filePath,
            fileSize: result.fileSize,
            strategy: strategyName
          });
          
          // Atualizar local_path no banco se necessário
          if (!recording.local_path || recording.local_path !== result.relativePath) {
            await this.updateRecordingLocalPath(recording.id, result.relativePath);
          }
          
          return result;
        } else {
          logger.debug(`❌ [LOCATE] ${strategyName} falhou: ${result.reason}`);
        }
      } catch (error) {
        logger.error(`❌ [LOCATE] ${strategyName} erro:`, error);
      }
    }

    logger.error(`❌ [LOCATE] TODAS as estratégias falharam para gravação ${recording.id}`);
    return { found: false, reason: 'Arquivo não encontrado em nenhuma estratégia' };
  }

  /**
   * Estratégia 1: Buscar por local_path (prioridade máxima)
   */
  async strategy1_LocalPath(recording) {
    if (!recording.local_path) {
      return { found: false, reason: 'local_path não definido' };
    }

    const filePath = path.isAbsolute(recording.local_path) 
      ? recording.local_path 
      : path.join(this.recordingsPath, recording.local_path);

    try {
      const stats = await fs.stat(filePath);
      if (stats.isFile()) {
        return {
          found: true,
          filePath,
          relativePath: recording.local_path,
          fileSize: stats.size,
          strategy: 'local_path'
        };
      }
    } catch (error) {
      // Arquivo não encontrado
    }

    return { found: false, reason: 'Arquivo local_path não existe' };
  }

  /**
   * Estratégia 2: Buscar por filename direto
   */
  async strategy2_FileName(recording) {
    if (!recording.filename) {
      return { found: false, reason: 'filename não definido' };
    }

    const possiblePaths = [
      path.join(this.recordingsPath, recording.filename),
      path.join(this.recordingsPath, `${recording.filename}.mp4`),
      path.join(this.recordingsPath, recording.camera_id, recording.filename),
      path.join(this.recordingsPath, recording.camera_id, `${recording.filename}.mp4`)
    ];

    for (const filePath of possiblePaths) {
      try {
        const stats = await fs.stat(filePath);
        if (stats.isFile()) {
          const relativePath = path.relative(this.recordingsPath, filePath);
          return {
            found: true,
            filePath,
            relativePath,
            fileSize: stats.size,
            strategy: 'filename'
          };
        }
      } catch (error) {
        // Continuar para próximo caminho
      }
    }

    return { found: false, reason: 'Arquivo filename não encontrado' };
  }

  /**
   * Estratégia 3: Buscar por file_path normalizado
   */
  async strategy3_FilePath(recording) {
    if (!recording.file_path) {
      return { found: false, reason: 'file_path não definido' };
    }

    let normalizedPath = recording.file_path;
    
    // Normalizar caminhos problemáticos
    if (normalizedPath.startsWith('record/live/')) {
      normalizedPath = normalizedPath.replace('record/live/', '');
    } else if (normalizedPath.startsWith('record/')) {
      normalizedPath = normalizedPath.substring(7);
    } else if (normalizedPath.startsWith('live/')) {
      normalizedPath = normalizedPath.substring(5);
    }

    const filePath = path.isAbsolute(normalizedPath) 
      ? normalizedPath 
      : path.join(this.recordingsPath, normalizedPath);

    try {
      const stats = await fs.stat(filePath);
      
      if (stats.isFile()) {
        const relativePath = path.relative(this.recordingsPath, filePath);
        return {
          found: true,
          filePath,
          relativePath,
          fileSize: stats.size,
          strategy: 'file_path'
        };
      } else if (stats.isDirectory()) {
        // Procurar arquivos de vídeo no diretório
        const files = await fs.readdir(filePath);
        const videoFiles = files.filter(file => 
          file.endsWith('.mp4') || file.endsWith('.mkv') || file.endsWith('.avi')
        );
        
        if (videoFiles.length > 0) {
          const videoFile = videoFiles[0];
          const videoPath = path.join(filePath, videoFile);
          const videoStats = await fs.stat(videoPath);
          const relativePath = path.relative(this.recordingsPath, videoPath);
          
          return {
            found: true,
            filePath: videoPath,
            relativePath,
            fileSize: videoStats.size,
            strategy: 'file_path_directory'
          };
        }
      }
    } catch (error) {
      // Arquivo não encontrado
    }

    return { found: false, reason: 'Arquivo file_path não encontrado' };
  }

  /**
   * Estratégia 4: Buscar por timestamp no filename
   */
  async strategy4_TimestampSearch(recording) {
    if (!recording.filename) {
      return { found: false, reason: 'filename não definido para busca por timestamp' };
    }

    const timestampMatch = recording.filename.match(/(\d{13})/);
    if (!timestampMatch) {
      return { found: false, reason: 'timestamp não encontrado no filename' };
    }

    const timestamp = timestampMatch[1];

    try {
      const files = await fs.readdir(this.recordingsPath);
      const matchingFiles = files.filter(file => 
        file.includes(timestamp) && (file.endsWith('.mp4') || file.endsWith('.mkv') || file.endsWith('.avi'))
      );

      if (matchingFiles.length > 0) {
        const matchedFile = matchingFiles[0];
        const filePath = path.join(this.recordingsPath, matchedFile);
        const stats = await fs.stat(filePath);
        const relativePath = path.relative(this.recordingsPath, filePath);
        
        return {
          found: true,
          filePath,
          relativePath,
          fileSize: stats.size,
          strategy: 'timestamp_search'
        };
      }
    } catch (error) {
      // Erro ao ler diretório
    }

    return { found: false, reason: 'Arquivo com timestamp não encontrado' };
  }

  /**
   * Estratégia 5: Buscar por camera_id em subdiretórios
   */
  async strategy5_CameraIdSearch(recording) {
    if (!recording.camera_id) {
      return { found: false, reason: 'camera_id não definido' };
    }

    const cameraDir = path.join(this.recordingsPath, recording.camera_id);
    
    try {
      const stats = await fs.stat(cameraDir);
      if (stats.isDirectory()) {
        const files = await fs.readdir(cameraDir);
        const videoFiles = files.filter(file => 
          file.endsWith('.mp4') || file.endsWith('.mkv') || file.endsWith('.avi')
        );
        
        // Procurar arquivo que corresponda ao filename ou timestamp
        let targetFile = null;
        
        if (recording.filename) {
          targetFile = videoFiles.find(file => 
            file.includes(recording.filename) || 
            recording.filename.includes(file.replace(/\.[^/.]+$/, ''))
          );
        }
        
        if (!targetFile && videoFiles.length > 0) {
          // Pegar o arquivo mais recente
          const filesWithStats = await Promise.all(
            videoFiles.map(async file => {
              const filePath = path.join(cameraDir, file);
              const stats = await fs.stat(filePath);
              return { file, mtime: stats.mtime, size: stats.size };
            })
          );
          
          filesWithStats.sort((a, b) => b.mtime - a.mtime);
          targetFile = filesWithStats[0].file;
        }
        
        if (targetFile) {
          const filePath = path.join(cameraDir, targetFile);
          const stats = await fs.stat(filePath);
          const relativePath = path.relative(this.recordingsPath, filePath);
          
          return {
            found: true,
            filePath,
            relativePath,
            fileSize: stats.size,
            strategy: 'camera_id_search'
          };
        }
      }
    } catch (error) {
      // Diretório da câmera não existe
    }

    return { found: false, reason: 'Arquivo no diretório da câmera não encontrado' };
  }

  /**
   * Estratégia 6: Busca fuzzy em todo o diretório de gravações
   */
  async strategy6_FuzzySearch(recording) {
    try {
      const allFiles = await this.getAllVideoFiles(this.recordingsPath);
      
      // Critérios de busca fuzzy
      const searchCriteria = [
        recording.filename,
        recording.camera_id,
        recording.id.substring(0, 8)
      ].filter(Boolean);
      
      for (const criterion of searchCriteria) {
        const matchingFiles = allFiles.filter(fileInfo => 
          fileInfo.name.toLowerCase().includes(criterion.toLowerCase())
        );
        
        if (matchingFiles.length > 0) {
          // Pegar o arquivo mais recente que corresponde
          matchingFiles.sort((a, b) => b.mtime - a.mtime);
          const bestMatch = matchingFiles[0];
          
          const relativePath = path.relative(this.recordingsPath, bestMatch.path);
          
          return {
            found: true,
            filePath: bestMatch.path,
            relativePath,
            fileSize: bestMatch.size,
            strategy: 'fuzzy_search'
          };
        }
      }
    } catch (error) {
      logger.error('[ImprovedRecordingService] Erro na busca fuzzy:', error);
    }

    return { found: false, reason: 'Busca fuzzy não encontrou correspondências' };
  }

  /**
   * Obter todos os arquivos de vídeo recursivamente
   */
  async getAllVideoFiles(dir, fileList = []) {
    try {
      const files = await fs.readdir(dir);
      
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.isDirectory()) {
          await this.getAllVideoFiles(filePath, fileList);
        } else if (file.endsWith('.mp4') || file.endsWith('.mkv') || file.endsWith('.avi')) {
          fileList.push({
            name: file,
            path: filePath,
            size: stats.size,
            mtime: stats.mtime
          });
        }
      }
    } catch (error) {
      // Ignorar erros de acesso a diretórios
    }
    
    return fileList;
  }

  /**
   * Atualizar local_path no banco de dados
   */
  async updateRecordingLocalPath(recordingId, localPath) {
    try {
      const { error } = await this.supabase
        .from('recordings')
        .update({ 
          local_path: localPath,
          updated_at: new Date().toISOString()
        })
        .eq('id', recordingId);
      
      if (error) {
        logger.error('[ImprovedRecordingService] Erro ao atualizar local_path:', error);
      } else {
        logger.info(`[ImprovedRecordingService] local_path atualizado para ${recordingId}: ${localPath}`);
      }
    } catch (error) {
      logger.error('[ImprovedRecordingService] Erro ao atualizar local_path:', error);
    }
  }

  /**
   * Preparar download com localização robusta
   */
  async prepareDownload(recordingId) {
    try {
      // Buscar gravação no banco
      const { data: recording, error } = await this.supabase
        .from('recordings')
        .select('*')
        .eq('id', recordingId)
        .single();
      
      if (error || !recording) {
        return { exists: false, message: 'Gravação não encontrada' };
      }

      logger.info(`🔍 [PREPARE_DOWNLOAD] Iniciando localização robusta para ${recordingId}`);
      
      // Usar estratégia robusta de localização
      const locationResult = await this.locateRecordingFile(recording);
      
      if (!locationResult.found) {
        // Verificar S3 como fallback
        if (recording.s3_url) {
          logger.info(`☁️ [PREPARE_DOWNLOAD] Usando S3 como fallback para ${recordingId}`);
          return {
            exists: true,
            isS3: true,
            s3Url: recording.s3_url,
            filename: recording.filename || `recording_${recordingId}.mp4`,
            fileSize: recording.file_size || 0
          };
        }
        
        return { 
          exists: false, 
          message: 'Arquivo não encontrado no armazenamento local ou S3',
          searchDetails: locationResult.reason
        };
      }

      logger.info(`✅ [PREPARE_DOWNLOAD] Arquivo localizado com sucesso:`, {
        recordingId,
        strategy: locationResult.strategy,
        filePath: locationResult.filePath,
        fileSize: locationResult.fileSize
      });

      return {
        exists: true,
        isS3: false,
        filePath: locationResult.filePath,
        filename: recording.filename || `recording_${recordingId}.mp4`,
        fileSize: locationResult.fileSize,
        strategy: locationResult.strategy
      };

    } catch (error) {
      logger.error('[ImprovedRecordingService] Erro ao preparar download:', error);
      throw error;
    }
  }

  /**
   * Obter stream de arquivo para reprodução
   */
  async getFileStream(filePath, range = null) {
    try {
      // Verificar se arquivo existe
      const stats = await fs.stat(filePath);
      
      if (range) {
        // Suporte a Range requests para streaming
        const { start, end } = this.parseRange(range, stats.size);
        return {
          stream: createReadStream(filePath, { start, end }),
          contentLength: end - start + 1,
          contentRange: `bytes ${start}-${end}/${stats.size}`,
          totalSize: stats.size
        };
      } else {
        return {
          stream: createReadStream(filePath),
          contentLength: stats.size,
          totalSize: stats.size
        };
      }
      
    } catch (error) {
      logger.error('[ImprovedRecordingService] Erro ao criar stream de arquivo:', error);
      throw new Error('Arquivo não encontrado ou inacessível');
    }
  }

  /**
   * Parsear header Range para streaming
   */
  parseRange(range, fileSize) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    
    return {
      start: Math.max(0, start),
      end: Math.min(end, fileSize - 1)
    };
  }

  /**
   * Sincronizar todas as gravações sem local_path
   */
  async syncAllRecordings() {
    try {
      logger.info('[ImprovedRecordingService] Iniciando sincronização de todas as gravações...');
      
      const { data: recordings, error } = await this.supabase
        .from('recordings')
        .select('*')
        .or('local_path.is.null,local_path.eq.')
        .order('created_at', { ascending: false });
      
      if (error) {
        throw error;
      }
      
      logger.info(`[ImprovedRecordingService] Encontradas ${recordings.length} gravações para sincronizar`);
      
      let synced = 0;
      let failed = 0;
      
      for (const recording of recordings) {
        try {
          const locationResult = await this.locateRecordingFile(recording);
          
          if (locationResult.found) {
            synced++;
            logger.info(`✅ Sincronizada: ${recording.id} -> ${locationResult.strategy}`);
          } else {
            failed++;
            logger.warn(`❌ Falha: ${recording.id} -> ${locationResult.reason}`);
          }
        } catch (error) {
          failed++;
          logger.error(`❌ Erro: ${recording.id}`, error);
        }
      }
      
      logger.info(`[ImprovedRecordingService] Sincronização concluída: ${synced} sucesso, ${failed} falhas`);
      
      return { synced, failed, total: recordings.length };
      
    } catch (error) {
      logger.error('[ImprovedRecordingService] Erro na sincronização:', error);
      throw error;
    }
  }
}

// Exportar instância singleton
const improvedRecordingService = new ImprovedRecordingService();
export default improvedRecordingService;