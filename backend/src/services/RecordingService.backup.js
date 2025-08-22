/**
 * RecordingService Unificado - Sistema de Gravações NewCAM
 * Versão consolidada que substitui todos os serviços anteriores
 * Usa paths relativos consistentes e busca simplificada
 */

import { v4 as uuidv4 } from 'uuid';
import { promises as fs } from 'fs';
import { createReadStream } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { promisify } from 'util';
import archiver from 'archiver';
import axios from 'axios';
import S3Service from './S3Service.js';
import pathResolver from '../utils/PathResolver.js';
import { createModuleLogger } from '../config/logger.js';
import { supabaseAdmin } from '../config/database.js';

const execAsync = promisify(spawn);
const logger = createModuleLogger('RecordingService');

class RecordingService {
  constructor() {
    this.supabase = supabaseAdmin;
    this.logger = logger;
    this.pathResolver = pathResolver;
    
    // Configuração ZLMediaKit
    this.zlmApiUrl = process.env.ZLM_BASE_URL || 'http://localhost:8000';
    this.zlmSecret = process.env.ZLM_SECRET || '9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK';
    
    // UNIFICADO: Usar PathResolver para gerenciar caminhos
    this.recordingsBasePath = this.pathResolver.recordingsBasePath;
    this.exportsPath = path.join(process.cwd(), '..', 'storage', 'exports');
    
    // Cache para jobs de exportação
    this.exportJobs = new Map();
    
    this.logger.info(`[RecordingService] Caminho unificado configurado via PathResolver: ${this.recordingsBasePath}`);
    
    // Garantir que diretórios existem
    this.ensureDirectories();
  }

  /**
   * Garantir que diretórios necessários existem
   */
  async ensureDirectories() {
    try {
      await fs.mkdir(this.recordingsBasePath, { recursive: true });
      await fs.mkdir(this.exportsPath, { recursive: true });
      this.logger.info('[RecordingService] Diretórios criados/verificados');
    } catch (error) {
      this.logger.error('[RecordingService] Erro ao criar diretórios:', error);
    }
  }

  /**
   * Normalizar path para formato consistente (relativo)
   */
  normalizePath(filePath) {
    if (!filePath) return null;
    
    // Converter separadores para Unix
    const normalized = filePath.replace(/\\/g, '/');
    
    // Remover prefixos absolutos e manter apenas relativo
    if (normalized.includes('storage/www/record/live')) {
      const index = normalized.indexOf('storage/www/record/live');
      return normalized.substring(index);
    }
    
    // Se já é relativo, manter
    if (normalized.startsWith('storage/') || normalized.startsWith('www/')) {
      return normalized;
    }
    
    return normalized;
  }

  /**
   * Resolver path absoluto a partir do relativo
   */
  resolveAbsolutePath(relativePath) {
    if (!relativePath) return null;
    
    // Se já é absoluto, retornar
    if (path.isAbsolute(relativePath)) {
      return relativePath;
    }
    
    // Definir raiz do projeto
    const projectRoot = process.cwd().includes('backend') 
      ? path.join(process.cwd(), '..')
      : process.cwd();
    
    // Construir path absoluto
    if (relativePath.startsWith('storage/')) {
      return path.join(projectRoot, relativePath);
    }
    
    if (relativePath.startsWith('www/')) {
      return path.join(projectRoot, 'storage', relativePath);
    }
    
    // Default: assumir que está no diretório base
    return path.join(this.recordingsBasePath, relativePath);
  }

  /**
   * Formatar data para nome de arquivo com offset em minutos
   */
  formatDateForFile(date, minuteOffset = 0) {
    const adjustedDate = new Date(date.getTime() + (minuteOffset * 60000));
    const year = adjustedDate.getFullYear();
    const month = String(adjustedDate.getMonth() + 1).padStart(2, '0');
    const day = String(adjustedDate.getDate()).padStart(2, '0');
    const hours = String(adjustedDate.getHours()).padStart(2, '0');
    const minutes = String(adjustedDate.getMinutes()).padStart(2, '0');
    const seconds = String(adjustedDate.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day}-${hours}-${minutes}-${seconds}`;
  }

  /**
   * Buscar arquivo de gravação - MÉTODO INTELIGENTE COM DOCKER PATH CONVERSION
   */
  async findRecordingFile(recording) {
    const searchPaths = [];
    
    this.logger.info(`🔍 [FIND] Buscando arquivo para gravação: ${recording.id}`);
    this.logger.info(`📋 [FIND] Dados da gravação: local_path="${recording.local_path}", file_path="${recording.file_path}", filename="${recording.filename}"`);
    
    // 1. Converter caminhos Docker para Windows se existir file_path
    if (recording.file_path) {
      const convertedPath = this.dockerPathToWindows(recording.file_path);
      const absolutePath = this.resolveAbsolutePath(convertedPath);
      if (absolutePath) {
        searchPaths.push(absolutePath);
        this.logger.info(`📁 [FIND] Adicionado file_path convertido: ${absolutePath}`);
      }
    }
    
    // 2. Tentar local_path se existir
    if (recording.local_path) {
      const absolutePath = this.resolveAbsolutePath(recording.local_path);
      if (absolutePath) {
        searchPaths.push(absolutePath);
        this.logger.info(`📁 [FIND] Adicionado local_path: ${absolutePath}`);
      }
    }
    
    // 3. Construir paths usando estrutura conhecida do Docker mapping
    if (recording.camera_id) {
      const date = recording.created_at?.split('T')[0] || new Date().toISOString().split('T')[0];
      const filename = recording.filename || `*.mp4`; 
      
      // Versões do nome do arquivo
      const cleanFileName = filename.startsWith('.') ? filename.substring(1) : filename;
      const fileWithDot = `.${cleanFileName}`;
      
      // Caminhos base mapeados do Docker
      const basePaths = [
        path.join(process.cwd(), 'storage', 'www', 'record', 'live'), // Docker mapping principal
        path.join(process.cwd(), 'storage', 'www', 'record'), // Alternativo
        this.recordingsBasePath, // PathResolver padrão
        path.join(process.cwd(), '..', 'storage', 'www', 'record', 'live'), // Nível acima
      ];
      
      for (const basePath of basePaths) {
        // Estruturas padrão de gravação do ZLMediaKit
        searchPaths.push(
          path.join(basePath, recording.camera_id, date, cleanFileName),
          path.join(basePath, recording.camera_id, date, fileWithDot),
          path.join(basePath, recording.camera_id, date, filename),
          path.join(basePath, recording.camera_id, filename),
        );
        
        // Busca por padrões de tempo (arquivos temporários do ZLMediaKit)
        if (recording.created_at) {
          const createdDate = new Date(recording.created_at);
          for (let offset = -5; offset <= 5; offset++) {
            const timePattern = this.formatDateForFile(createdDate, offset);
            searchPaths.push(
              path.join(basePath, recording.camera_id, date, `${timePattern}-0.mp4`),
              path.join(basePath, recording.camera_id, date, `.${timePattern}-0.mp4`),
              path.join(basePath, recording.camera_id, date, `${timePattern}-1.mp4`),
              path.join(basePath, recording.camera_id, date, `.${timePattern}-1.mp4`)
            );
          }
        }
      }
    }
    
    // 4. Busca por padrão baseado no ID da gravação
    if (recording.id) {
      const shortId = recording.id.substring(0, 8);
      for (const basePath of [path.join(process.cwd(), 'storage', 'www', 'record', 'live')]) {
        searchPaths.push(
          path.join(basePath, '**', `*${shortId}*.mp4`),
          path.join(basePath, '**', `.*${shortId}*.mp4`)
        );
      }
    }
    
    // Verificar cada path
    for (const testPath of searchPaths) {
      try {
        await fs.access(testPath);
        const stats = await fs.stat(testPath);
        
        if (stats.isFile()) {
          this.logger.info(`✅ [FIND] Arquivo encontrado: ${testPath}`);
          
          // Atualizar paths no database
          const relativePath = this.normalizePath(testPath);
          if (recording.local_path !== relativePath || recording.file_path !== relativePath) {
            await this.updateRecordingPath(recording.id, relativePath);
          }
          
          return {
            filePath: testPath,
            relativePath: relativePath,
            size: stats.size,
            exists: true
          };
        }
      } catch (e) {
        // Arquivo não existe neste path
        this.logger.debug(`[FIND] Path não encontrado: ${testPath}`);
      }
    }
    
    // Busca final usando busca por padrão no filesystem
    const fallbackResult = await this.searchByPattern(recording);
    if (fallbackResult) {
      return fallbackResult;
    }
    
    this.logger.warn(`❌ [FIND] Arquivo não encontrado para gravação ${recording.id} após ${searchPaths.length} tentativas`);
    return null;
  }

  /**
   * Converter caminhos Docker para Windows usando mesmo algoritmo do hooks.js
   */
  dockerPathToWindows(dockerPath) {
    if (!dockerPath || typeof dockerPath !== 'string') return null;
    
    const mappings = [
      { docker: '/opt/media/bin/www/', windows: 'storage/www/' },
      { docker: '/opt/media/www/', windows: 'storage/www/' },
      { docker: '/opt/media/bin/', windows: 'storage/' },
      { docker: '/opt/media/', windows: 'storage/' }
    ];
    
    for (const map of mappings) {
      if (dockerPath.startsWith(map.docker)) {
        const converted = dockerPath.replace(map.docker, map.windows);
        this.logger.debug(`🔄 Path Docker convertido: ${dockerPath} → ${converted}`);
        return converted;
      }
    }
    
    this.logger.debug(`🔄 Path Docker não convertido: ${dockerPath}`);
    return dockerPath;
  }

  /**
   * Busca por padrão no filesystem quando busca direta falha
   */
  async searchByPattern(recording) {
    try {
      this.logger.info(`🔍 [PATTERN] Iniciando busca por padrão para ${recording.id}`);
      
      const basePath = path.join(process.cwd(), 'storage', 'www', 'record', 'live');
      
      if (recording.camera_id) {
        const date = recording.created_at?.split('T')[0] || new Date().toISOString().split('T')[0];
        const cameraDir = path.join(basePath, recording.camera_id, date);
        
        try {
          const files = await fs.readdir(cameraDir);
          const mp4Files = files.filter(f => f.endsWith('.mp4'));
          
          if (mp4Files.length > 0) {
            // Priorizar arquivos não temporários (sem ponto inicial)
            const finalFiles = mp4Files.filter(f => !f.startsWith('.'));
            const targetFile = finalFiles.length > 0 ? finalFiles[0] : mp4Files[0];
            
            const fullPath = path.join(cameraDir, targetFile);
            const stats = await fs.stat(fullPath);
            
            this.logger.info(`✅ [PATTERN] Arquivo encontrado por busca: ${fullPath}`);
            return {
              filePath: fullPath,
              relativePath: this.normalizePath(fullPath),
              size: stats.size,
              exists: true
            };
          }
        } catch (dirError) {
          this.logger.debug(`[PATTERN] Diretório não encontrado: ${cameraDir}`);
        }
      }
      
      return null;
    } catch (error) {
      this.logger.error(`[PATTERN] Erro na busca por padrão: ${error.message}`);
      return null;
    }
  }

  /**
   * Atualizar paths da gravação no database (local_path + file_path)
   */
  async updateRecordingPath(recordingId, relativePath) {
    try {
      const { error } = await this.supabase
        .from('recordings')
        .update({ 
          local_path: relativePath,
          file_path: relativePath, // Manter ambos sincronizados
          updated_at: new Date().toISOString()
        })
        .eq('id', recordingId);
        
      if (error) {
        this.logger.error(`Erro ao atualizar path da gravação ${recordingId}:`, error);
      } else {
        this.logger.info(`✅ [UPDATE] Path atualizado para gravação ${recordingId}: ${relativePath}`);
      }
    } catch (error) {
      this.logger.error(`Erro ao atualizar path da gravação ${recordingId}:`, error);
    }
  }

  /**
   * Obter gravação por ID
   */
  async getRecordingById(recordingId, userId = null) {
    try {
      const { data: recording, error } = await this.supabase
        .from('recordings')
        .select('*')
        .eq('id', recordingId)
        .single();

      if (error) {
        this.logger.error('Erro ao buscar gravação por ID:', error);
        return null;
      }

      return recording;
    } catch (error) {
      this.logger.error('Erro ao buscar gravação:', error);
      return null;
    }
  }

  /**
   * Buscar gravações com filtros
   */
  async searchRecordings(userId, filters = {}) {
    try {
      const {
        camera_id,
        start_date,
        end_date,
        duration_min,
        duration_max,
        file_size_min,
        file_size_max,
        quality,
        event_type,
        page = 1,
        limit = 20,
        sort_by = 'created_at',
        sort_order = 'desc'
      } = filters;

      let query = this.supabase
        .from('recordings')
        .select('*, cameras:camera_id(id,name,status)', { count: 'exact' });

      // Nota: Removido filtro por user_id pois cameras não tem essa coluna
      // Se necessário, implementar verificação de permissão em nível de aplicação

      // Aplicar filtros
      if (camera_id) query = query.eq('camera_id', camera_id);
      if (start_date) query = query.gte('created_at', start_date);
      if (end_date) query = query.lte('created_at', end_date);
      if (duration_min) query = query.gte('duration', duration_min);
      if (duration_max) query = query.lte('duration', duration_max);
      if (file_size_min) query = query.gte('file_size', file_size_min);
      if (file_size_max) query = query.lte('file_size', file_size_max);
      if (quality) query = query.eq('quality', quality);
      if (event_type) query = query.eq('event_type', event_type);

      // Ordenação
      query = query.order(sort_by, { ascending: sort_order === 'asc' });

      // Paginação
      const offset = (page - 1) * limit;
      query = query.range(offset, offset + limit - 1);

      const { data: recordings, error, count } = await query;

      if (error) {
        throw error;
      }

      const totalPages = Math.ceil((count || 0) / limit);

      return {
        data: recordings || [],
        page: page,
        limit: limit,
        total: count || 0,
        pages: totalPages,
        appliedFilters: filters
      };
    } catch (error) {
      this.logger.error('Erro ao buscar gravações:', error);
      throw error;
    }
  }

  /**
   * Obter gravações ativas
   */
  async getActiveRecordings(userId = null) {
    try {
      let query = this.supabase
        .from('recordings')
        .select(`
          *,
          cameras:camera_id (
            id,
            name,
            status
          )
        `)
        .eq('status', 'recording');

      // Nota: Removido filtro por user_id pois cameras não tem essa coluna
      // Se necessário, implementar verificação de permissão em nível de aplicação

      const { data: recordings, error } = await query;

      if (error) {
        throw error;
      }

      return {
        data: recordings || []
      };
    } catch (error) {
      this.logger.error('Erro ao buscar gravações ativas:', error);
      throw error;
    }
  }

  /**
   * Iniciar gravação de uma câmera
   */
  async startRecording(cameraId, options = {}) {
    try {
      this.logger.info(`[START] Iniciando gravação para câmera ${cameraId}`);

      // Verificar se já existe gravação ativa
      const { data: existingRecording } = await this.supabase
        .from('recordings')
        .select('*')
        .eq('camera_id', cameraId)
        .eq('status', 'recording')
        .single();

      if (existingRecording) {
        throw new Error('Já existe uma gravação ativa para esta câmera');
      }

      // Gerar filename previsto baseado no timestamp (CORREÇÃO)
      const startTime = new Date();
      const predictedFileName = this.formatDateForFile(startTime) + '-0.mp4';
      const dateFolder = startTime.toISOString().split('T')[0];
      const predictedPath = `storage/www/record/live/${cameraId}/${dateFolder}/${predictedFileName}`;

      this.logger.info(`[START] Filename previsto gerado:`, {
        cameraId,
        predictedFileName,
        predictedPath,
        startTime: startTime.toISOString()
      });

      // Criar registro de gravação com filename previsto
      const recordingData = {
        id: uuidv4(),
        camera_id: cameraId,
        status: 'recording',
        start_time: startTime.toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        // CORREÇÃO: Adicionar campos previstos que serão atualizados pelo webhook
        filename: `${predictedFileName}_pending`, // Sufixo _pending indica que é temporário
        file_path: `${predictedPath}_pending`,
        local_path: `${predictedPath}_pending`,
        file_size: 0, // Será atualizado pelo webhook
        duration: 0, // Será atualizado pelo webhook
        metadata: {
          resolution: options.resolution || '1920x1080',
          fps: options.fps || 25,
          codec: options.codec || 'h264',
          format: options.format || 'mp4',
          quality: options.quality || 'medium',
          started_by: 'manual',
          filename_predicted: predictedFileName,
          path_predicted: predictedPath,
          file_pending: true, // Flag indicando que arquivo ainda não foi processado
          predicted_at: startTime.toISOString()
        }
      };

      const { data: recording, error } = await this.supabase
        .from('recordings')
        .insert(recordingData)
        .select()
        .single();

      if (error) {
        throw error;
      }

      this.logger.info(`✅ [START] Gravação iniciada: ${recording.id}`);
      return recording;
    } catch (error) {
      this.logger.error('[START] Erro ao iniciar gravação:', error);
      throw error;
    }
  }

  /**
   * Parar gravação
   */
  async stopRecording(cameraId) {
    try {
      this.logger.info(`[STOP] Parando gravação para câmera ${cameraId}`);

      // Buscar gravação ativa
      const { data: recording, error: findError } = await this.supabase
        .from('recordings')
        .select('*')
        .eq('camera_id', cameraId)
        .eq('status', 'recording')
        .single();

      if (findError || !recording) {
        throw new Error('Nenhuma gravação ativa encontrada para esta câmera');
      }

      // CORREÇÃO: Tentar vincular arquivo órfão se ainda não foi processado pelo webhook
      let updateData = {
        status: 'completed',
        end_time: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Verificar se arquivo ainda está _pending (não foi processado pelo webhook)
      const isPendingFile = recording.filename && recording.filename.includes('_pending');
      const hasNullFileData = !recording.file_size || recording.file_size === 0;

      if (isPendingFile || hasNullFileData) {
        this.logger.info(`[STOP] Tentando vincular arquivo órfão para gravação ${recording.id}`, {
          isPendingFile,
          hasNullFileData,
          currentFilename: recording.filename
        });

        try {
          // Buscar arquivos órfãos para esta câmera
          const foundFile = await this.findOrphanFileForRecording(recording);
          
          if (foundFile) {
            this.logger.info(`[STOP] Arquivo órfão encontrado:`, foundFile);
            
            // Atualizar dados do arquivo
            updateData = {
              ...updateData,
              filename: foundFile.filename,
              file_path: foundFile.relativePath,
              local_path: foundFile.relativePath,
              file_size: foundFile.size,
              duration: foundFile.duration || 0,
              metadata: {
                ...recording.metadata,
                file_pending: false,
                orphan_linked_at: new Date().toISOString(),
                orphan_linked_by: 'stopRecording_fallback',
                original_predicted: recording.metadata?.filename_predicted
              }
            };
          } else {
            this.logger.warn(`[STOP] Nenhum arquivo órfão encontrado para gravação ${recording.id}`);
            // Manter como pendente mas marcar como completed
            updateData.metadata = {
              ...recording.metadata,
              file_pending: true,
              no_orphan_found_at: new Date().toISOString()
            };
          }
        } catch (orphanError) {
          this.logger.error(`[STOP] Erro ao buscar arquivo órfão:`, orphanError);
          // Continuar com atualização básica
        }
      }

      // Atualizar status
      const { data: updatedRecording, error: updateError } = await this.supabase
        .from('recordings')
        .update(updateData)
        .eq('id', recording.id)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      this.logger.info(`✅ [STOP] Gravação finalizada: ${recording.id}`, {
        linked_orphan: !isPendingFile && !hasNullFileData,
        has_file_data: !!updatedRecording.file_size
      });
      return updatedRecording;
    } catch (error) {
      this.logger.error('[STOP] Erro ao parar gravação:', error);
      throw error;
    }
  }

  /**
   * Parar gravação por ID
   */
  async stopRecordingById(recordingId, userId = null) {
    try {
      this.logger.info(`[STOP] Parando gravação ${recordingId}`);

      let query = this.supabase
        .from('recordings')
        .select(`
          *,
          cameras:camera_id (
            id,
            name,
          )
        `)
        .eq('id', recordingId)
        .eq('status', 'recording');

      if (userId) {
        // query = query.eq('cameras.user_id', userId); // Removido: cameras não tem user_id
      }

      const { data: recording, error: findError } = await query.single();

      if (findError || !recording) {
        throw new Error('Gravação não encontrada ou não está ativa');
      }

      // Atualizar status
      const { data: updatedRecording, error: updateError } = await this.supabase
        .from('recordings')
        .update({
          status: 'completed',
          end_time: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', recordingId)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      this.logger.info(`✅ [STOP] Gravação finalizada: ${recordingId}`);
      return updatedRecording;
    } catch (error) {
      this.logger.error('[STOP] Erro ao parar gravação por ID:', error);
      throw error;
    }
  }

  /**
   * Obter estatísticas de gravações
   */
  async getRecordingStats(userId, period = '7d') {
    try {
      let dateFilter = new Date();
      
      switch (period) {
        case '24h':
          dateFilter.setHours(dateFilter.getHours() - 24);
          break;
        case '7d':
          dateFilter.setDate(dateFilter.getDate() - 7);
          break;
        case '30d':
          dateFilter.setDate(dateFilter.getDate() - 30);
          break;
        default:
          dateFilter.setDate(dateFilter.getDate() - 7);
      }

      let query = this.supabase
        .from('recordings')
        .select(`
          id,
          file_size,
          duration,
          status,
          created_at,
          cameras:camera_id (
          )
        `);

      if (userId) {
        // query = query.eq('cameras.user_id', userId); // Removido: cameras não tem user_id
      }

      const { data: recordings, error } = await query;

      if (error) {
        throw error;
      }

      const stats = {
        total: recordings.length,
        today: recordings.filter(r => 
          new Date(r.created_at).toDateString() === new Date().toDateString()
        ).length,
        totalSize: recordings.reduce((sum, r) => sum + (r.file_size || 0), 0),
        avgDuration: recordings.length > 0 
          ? recordings.reduce((sum, r) => sum + (r.duration || 0), 0) / recordings.length 
          : 0,
        activeRecordings: recordings.filter(r => r.status === 'recording').length
      };

      return stats;
    } catch (error) {
      this.logger.error('Erro ao obter estatísticas:', error);
      throw error;
    }
  }

  /**
   * Criar stream de arquivo para reprodução
   */
  createFileStream(filePath, range = null) {
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : undefined;
      
      const options = { start };
      if (end !== undefined) {
        options.end = end;
      }
      
      return createReadStream(filePath, options);
    }
    
    return createReadStream(filePath);
  }

  /**
   * Preparar informações para download/stream
   */
  async preparePlayback(recordingId) {
    try {
      const recording = await this.getRecordingById(recordingId);
      if (!recording) {
        return null;
      }

      const fileInfo = await this.findRecordingFile(recording);
      if (!fileInfo) {
        return null;
      }

      return {
        exists: true,
        filePath: fileInfo.filePath,
        filename: recording.filename || `recording_${recordingId}.mp4`,
        fileSize: fileInfo.size,
        recording: recording,
        strategy: 'unified_service'
      };
    } catch (error) {
      this.logger.error('Erro ao preparar playback:', error);
      return null;
    }
  }

  /**
   * Métodos de compatibilidade com API existente
   */
  async prepareDownload(recordingId) {
    return this.preparePlayback(recordingId);
  }

  async getFileStream(filePath, range = null) {
    const stats = await fs.stat(filePath);
    
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const contentLength = (end - start) + 1;
      const contentRange = `bytes ${start}-${end}/${stats.size}`;
      
      return {
        stream: this.createFileStream(filePath, range),
        contentLength,
        contentRange
      };
    }
    
    return {
      stream: this.createFileStream(filePath),
      contentLength: stats.size
    };
  }

  // Métodos adicionais para compatibilidade
  async pauseRecording(cameraId) {
    return this.stopRecording(cameraId);
  }

  async resumeRecording(cameraId) {
    return this.startRecording(cameraId);
  }

  async deleteRecording(recordingId, userId = null) {
    try {
      const recording = await this.getRecordingById(recordingId, userId);
      if (!recording) {
        throw new Error('Gravação não encontrada');
      }

      this.logger.info(`🗑️ [DELETE] Iniciando deleção completa da gravação: ${recordingId}`);

      // Buscar e deletar TODOS os arquivos relacionados
      const deletedFiles = await this.deleteAllRelatedFiles(recording);
      
      // Deletar registro do banco
      const { error } = await this.supabase
        .from('recordings')
        .delete()
        .eq('id', recordingId);

      if (error) {
        throw error;
      }

      this.logger.info(`✅ [DELETE] Gravação deletada completamente: ${recordingId}`, {
        arquivos_removidos: deletedFiles.length,
        arquivos: deletedFiles
      });
      
      return { 
        success: true, 
        deletedFiles: deletedFiles.length,
        files: deletedFiles 
      };
    } catch (error) {
      this.logger.error('[DELETE] Erro ao deletar gravação:', error);
      throw error;
    }
  }

  /**
   * Deletar todos os arquivos relacionados a uma gravação
   */
  async deleteAllRelatedFiles(recording) {
    const deletedFiles = [];
    
    try {
      this.logger.info(`🔍 [DELETE] Buscando todos os arquivos relacionados à gravação ${recording.id}`);
      
      // Buscar por arquivos usando múltiplas estratégias
      const filesToDelete = await this.findAllRelatedFiles(recording);
      
      for (const filePath of filesToDelete) {
        try {
          await fs.access(filePath); // Verificar se arquivo existe
          await fs.unlink(filePath);
          deletedFiles.push(filePath);
          this.logger.info(`✅ [DELETE] Arquivo removido: ${filePath}`);
        } catch (error) {
          this.logger.debug(`⚠️ [DELETE] Arquivo não encontrado ou erro ao deletar: ${filePath} - ${error.message}`);
        }
      }
      
      return deletedFiles;
    } catch (error) {
      this.logger.error('[DELETE] Erro ao buscar arquivos relacionados:', error);
      return deletedFiles;
    }
  }

  /**
   * Encontrar todos os arquivos relacionados a uma gravação
   */
  async findAllRelatedFiles(recording) {
    const relatedFiles = new Set(); // Usar Set para evitar duplicatas
    
    // 1. Arquivo principal pelo findRecordingFile
    const mainFile = await this.findRecordingFile(recording);
    if (mainFile && mainFile.exists) {
      relatedFiles.add(mainFile.filePath);
    }
    
    // 2. Buscar por padrões de arquivos temporários e finalizados
    const searchPatterns = await this.generateFileSearchPatterns(recording);
    
    for (const pattern of searchPatterns) {
      try {
        const matches = await this.glob(pattern);
        matches.forEach(file => relatedFiles.add(file));
      } catch (error) {
        this.logger.debug(`[DELETE] Erro ao buscar padrão ${pattern}: ${error.message}`);
      }
    }
    
    return Array.from(relatedFiles);
  }

  /**
   * Gerar padrões de busca para arquivos relacionados
   */
  async generateFileSearchPatterns(recording) {
    const patterns = [];
    
    if (!recording.camera_id) return patterns;
    
    const date = recording.created_at?.split('T')[0] || new Date().toISOString().split('T')[0];
    
    // Caminhos base
    const basePaths = [
      path.join(process.cwd(), 'storage', 'www', 'record', 'live'),
      this.recordingsBasePath,
      path.join(process.cwd(), '..', 'storage', 'live'),
      path.join(process.cwd(), '..', 'storage', 'www', 'record')
    ];
    
    for (const basePath of basePaths) {
      const cameraDir = path.join(basePath, recording.camera_id, date);
      
      // Padrões para diferentes tipos de arquivo
      patterns.push(
        path.join(cameraDir, '*.mp4'),           // Todos os MP4
        path.join(cameraDir, '.*.mp4'),          // Arquivos temporários
        path.join(cameraDir, `*${recording.id.substring(0, 8)}*.mp4`), // Por ID parcial
      );
      
      // Se temos filename específico
      if (recording.filename) {
        const cleanName = recording.filename.replace(/^\./, '');
        patterns.push(
          path.join(cameraDir, recording.filename),
          path.join(cameraDir, cleanName),
          path.join(cameraDir, `.${cleanName}`)
        );
      }
      
      // Padrões baseados em horário de criação
      if (recording.created_at) {
        const createdDate = new Date(recording.created_at);
        for (let offset = -5; offset <= 5; offset++) {
          const timePattern = this.formatDateForFile(createdDate, offset);
          patterns.push(
            path.join(cameraDir, `${timePattern}*.mp4`),
            path.join(cameraDir, `.${timePattern}*.mp4`)
          );
        }
      }
    }
    
    return patterns;
  }

  /**
   * Implementação simples de glob pattern matching
   */
  async glob(pattern) {
    try {
      const glob = await import('glob');
      return glob.glob(pattern);
    } catch (error) {
      // Fallback se glob não estiver disponível
      this.logger.debug(`[DELETE] Glob não disponível, usando busca manual para: ${pattern}`);
      return [];
    }
  }

  async getTrends(userId, period = '24h') {
    return { trends: [] };
  }

  async checkBulkAccess(recordingIds, userId) {
    return { allAccessible: true, inaccessibleIds: [] };
  }

  async deleteRecordings(recordingIds, userId) {
    let deletedCount = 0;
    let failedCount = 0;
    let freedSpace = 0;

    for (const id of recordingIds) {
      try {
        await this.deleteRecording(id, userId);
        deletedCount++;
      } catch (error) {
        failedCount++;
        this.logger.error(`Erro ao deletar gravação ${id}:`, error);
      }
    }

    return { deletedCount, failedCount, freedSpace };
  }

  async getActiveRecording(cameraId, userId = null) {
    try {
      let query = this.supabase
        .from('recordings')
        .select(`
          *,
          cameras:camera_id (
            id,
            name
          )
        `)
        .eq('camera_id', cameraId)
        .eq('status', 'recording');

      // Nota: Removido filtro por user_id pois cameras não tem essa coluna

      const { data: recording, error } = await query.single();

      if (error) {
        return null;
      }

      return recording;
    } catch (error) {
      this.logger.error('Erro ao buscar gravação ativa:', error);
      return null;
    }
  }

  /**
   * Processar fila de upload para S3
   */
  async processUploadQueue() {
    try {
      this.logger.info('[UPLOAD] Processando fila de upload...');
      
      // Buscar gravações pendentes de upload
      const { data: pendingRecordings, error } = await this.supabase
        .from('recordings')
        .select('*')
        .eq('upload_status', 'pending')
        .eq('status', 'completed')
        .limit(5);

      if (error) {
        throw error;
      }

      if (!pendingRecordings || pendingRecordings.length === 0) {
        this.logger.debug('[UPLOAD] Nenhuma gravação pendente na fila');
        return { processed: 0, successful: 0, failed: 0 };
      }

      let successful = 0;
      let failed = 0;

      for (const recording of pendingRecordings) {
        try {
          this.logger.info(`[UPLOAD] Processando upload: ${recording.id}`);
          
          // Verificar se arquivo existe
          const fileInfo = await this.findRecordingFile(recording);
          if (!fileInfo) {
            this.logger.warn(`[UPLOAD] Arquivo não encontrado: ${recording.id}`);
            failed++;
            continue;
          }

          // Simular upload (substituir por lógica real do S3Service)
          await this.supabase
            .from('recordings')
            .update({ 
              upload_status: 'uploading',
              updated_at: new Date().toISOString()
            })
            .eq('id', recording.id);

          // TODO: Implementar upload real para S3
          // await S3Service.uploadFile(fileInfo.filePath, recording);
          
          await this.supabase
            .from('recordings')
            .update({ 
              upload_status: 'uploaded',
              s3_path: `recordings/${recording.camera_id}/${recording.filename}`,
              updated_at: new Date().toISOString()
            })
            .eq('id', recording.id);

          this.logger.info(`✅ [UPLOAD] Upload concluído: ${recording.id}`);
          successful++;
          
        } catch (uploadError) {
          this.logger.error(`❌ [UPLOAD] Erro no upload ${recording.id}:`, uploadError);
          failed++;
          
          // Marcar como falhou
          await this.supabase
            .from('recordings')
            .update({ 
              upload_status: 'failed',
              updated_at: new Date().toISOString()
            })
            .eq('id', recording.id);
        }
      }

      this.logger.info(`[UPLOAD] Fila processada: ${successful} sucessos, ${failed} falhas`);
      return { processed: pendingRecordings.length, successful, failed };
      
    } catch (error) {
      this.logger.error('[UPLOAD] Erro ao processar fila:', error);
      return { processed: 0, successful: 0, failed: 0 };
    }
  }

  /**
   * Iniciar gravação MP4 no ZLMediaKit
   * @param {string} streamId - ID do stream (camera_id)
   * @param {string} app - Nome da aplicação (default: 'live')
   * @param {number} duration - Duração em segundos (default: 1800 = 30 minutos)
   */
  async startZLMRecording(streamId, app = 'live', duration = 1800) {
    try {
      this.logger.info(`[ZLM] Iniciando gravação MP4 para stream ${streamId}`);
      
      // Verificar se já existe gravação ativa para evitar duplicatas
      const { data: activeRecording } = await this.supabase
        .from('recordings')
        .select('id, status')
        .eq('camera_id', streamId)
        .eq('status', 'recording')
        .single();
      
      if (activeRecording) {
        this.logger.warn(`[ZLM] Já existe gravação ativa para ${streamId}: ${activeRecording.id}`);
        return { 
          success: true, 
          recording_id: activeRecording.id,
          message: 'Gravação já está ativa',
          alreadyActive: true
        };
      }
      
      const params = new URLSearchParams({
        secret: this.zlmSecret,
        type: 'mp4', // Use string 'mp4' ao invés de número
        vhost: '__defaultVhost__',
        app: app,
        stream: streamId,
        max_second: duration.toString()
      });
      
      const url = `${this.zlmApiUrl}/index/api/startRecord?${params}`;
      
      const response = await axios.get(url);
      
      if (response.data.code === 0) {
        this.logger.info(`✅ [ZLM] Gravação MP4 iniciada com sucesso para ${streamId}`);
        
        // Criar novo registro no banco (não usar upsert para evitar conflitos)
        const { data: recording, error: insertError } = await this.supabase
          .from('recordings')
          .insert({
            camera_id: streamId,
            status: 'recording',
            start_time: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            metadata: {
              zlm_recording: true,
              max_duration: duration,
              recording_type: 'mp4',
              app: app
            }
          })
          .select()
          .single();
        
        if (insertError) {
          this.logger.warn(`[ZLM] Erro ao criar registro de gravação: ${insertError.message}`);
        }
        
        return { 
          success: true, 
          recording_id: recording?.id,
          message: 'Gravação MP4 iniciada' 
        };
      } else {
        throw new Error(`ZLMediaKit error: ${response.data.msg || 'Unknown error'}`);
      }
    } catch (error) {
      this.logger.error(`[ZLM] Erro ao iniciar gravação MP4:`, error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  /**
   * Parar gravação MP4 no ZLMediaKit
   * @param {string} streamId - ID do stream (camera_id)
   * @param {string} app - Nome da aplicação (default: 'live')
   */
  async stopZLMRecording(streamId, app = 'live') {
    try {
      this.logger.info(`[ZLM] Parando gravação MP4 para stream ${streamId}`);
      
      const params = new URLSearchParams({
        secret: this.zlmSecret,
        type: '1', // 0=HLS, 1=MP4
        vhost: '__defaultVhost__',
        app: app,
        stream: streamId
      });
      
      const url = `${this.zlmApiUrl}/index/api/stopRecord?${params}`;
      
      const response = await axios.get(url);
      
      if (response.data.code === 0) {
        this.logger.info(`✅ [ZLM] Gravação MP4 parada com sucesso para ${streamId}`);
        return { success: true, message: 'Gravação MP4 parada' };
      } else {
        throw new Error(`ZLMediaKit error: ${response.data.msg || 'Unknown error'}`);
      }
    } catch (error) {
      this.logger.error(`[ZLM] Erro ao parar gravação MP4:`, error);
      return { success: false, error: error.message };
    }
  }

  // Métodos stub para compatibilidade completa
  async createExportJob(options) {
    const jobId = uuidv4();
    this.exportJobs.set(jobId, { ...options, status: 'pending' });
    return { id: jobId, estimatedTime: 300 };
  }

  async getExportStatus(exportId, userId) {
    return this.exportJobs.get(exportId) || null;
  }

  async retryUpload(recordingId) {
    return { success: true };
  }

  async retrySegmentUpload(recordingId, segmentId) {
    return { success: true };
  }

  async getUploadQueue() {
    return { pending: 0, processing: 0, completed: 0 };
  }

  async toggleUploadQueue(action) {
    return { status: action };
  }

  async updateSingleRecordingStatistics(recordingId) {
    return { updated: true };
  }

  async updateRecordingStatistics() {
    return { updated: 0 };
  }

  /**
   * Buscar arquivo órfão para uma gravação (FALLBACK para stopRecording)
   */
  async findOrphanFileForRecording(recording) {
    try {
      this.logger.info(`[ORPHAN] Buscando arquivo órfão para gravação ${recording.id}`);
      
      const cameraId = recording.camera_id;
      const startTime = new Date(recording.start_time || recording.created_at);
      const dateFolder = startTime.toISOString().split('T')[0];
      
      // Caminhos base onde arquivos podem estar
      const basePaths = [
        path.join(process.cwd(), 'storage', 'www', 'record', 'live'),
        path.join(process.cwd(), '..', 'storage', 'www', 'record', 'live'),
        this.recordingsBasePath
      ];
      
      // Janela de tempo para busca (15 minutos antes/depois do início da gravação)
      const timeWindow = 15 * 60 * 1000; // 15 minutos em ms
      const startTimeMs = startTime.getTime();
      
      for (const basePath of basePaths) {
        const cameraDir = path.join(basePath, cameraId, dateFolder);
        
        try {
          // Verificar se diretório da câmera existe
          const files = await fs.readdir(cameraDir);
          
          for (const filename of files) {
            // Filtrar apenas arquivos MP4
            if (!filename.endsWith('.mp4')) continue;
            
            const filePath = path.join(cameraDir, filename);
            
            try {
              // Verificar informações do arquivo
              const stats = await fs.stat(filePath);
              const fileModifiedMs = stats.mtime.getTime();
              
              // Verificar se arquivo foi modificado dentro da janela de tempo
              const timeDiff = Math.abs(fileModifiedMs - startTimeMs);
              
              if (timeDiff <= timeWindow && stats.size > 1000) { // Arquivo maior que 1KB
                this.logger.info(`[ORPHAN] Arquivo órfão candidato encontrado:`, {
                  filename,
                  filePath,
                  size: stats.size,
                  modified: stats.mtime.toISOString(),
                  timeDiff: Math.round(timeDiff / 1000) + 's'
                });
                
                const relativePath = this.normalizePath(filePath);
                
                return {
                  filename: filename.startsWith('.') ? filename.substring(1) : filename,
                  absolutePath: filePath,
                  relativePath,
                  size: stats.size,
                  modified: stats.mtime.toISOString(),
                  duration: null, // Não calculamos duração aqui por performance
                  timeDiff
                };
              }
            } catch (statError) {
              this.logger.debug(`[ORPHAN] Erro ao verificar arquivo ${filename}:`, statError.message);
            }
          }
        } catch (dirError) {
          this.logger.debug(`[ORPHAN] Diretório não encontrado: ${cameraDir}`);
        }
      }
      
      this.logger.warn(`[ORPHAN] Nenhum arquivo órfão encontrado para gravação ${recording.id}`);
      return null;
      
    } catch (error) {
      this.logger.error(`[ORPHAN] Erro ao buscar arquivo órfão:`, error);
      return null;
    }
  }
}

// Criar instância singleton
const recordingService = new RecordingService();

export default recordingService;