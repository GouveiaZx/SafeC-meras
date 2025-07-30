/**
 * Serviço de Arquivos - NewCAM
 * Responsável pelo gerenciamento, processamento e organização de arquivos
 */

import { FILE_CONFIG } from '../config/reports.config.js';
import { supabaseAdmin } from '../config/database.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class FileService {
  constructor() {
    this.storageDir = FILE_CONFIG.upload.storageDir;
    this.tempDir = path.join(this.storageDir, 'temp');
    this.thumbnailsDir = path.join(this.storageDir, 'thumbnails');
    this.backupsDir = path.join(this.storageDir, 'backups');
    
    this.initStorage();
  }

  /**
   * Inicializa estrutura de diretórios
   */
  async initStorage() {
    const dirs = [
      this.storageDir,
      this.tempDir,
      this.thumbnailsDir,
      this.backupsDir,
      path.join(this.storageDir, 'recordings'),
      path.join(this.storageDir, 'reports'),
      path.join(this.storageDir, 'exports')
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Processa arquivo de gravação
   */
  async processRecordingFile(file, metadata) {
    try {
      // Gerar ID único
      const fileId = this.generateFileId();
      const fileExtension = path.extname(file.originalname);
      const filename = `${fileId}${fileExtension}`;
      const filePath = path.join(this.storageDir, 'recordings', filename);

      // Salvar arquivo
      await fs.writeFile(filePath, file.buffer);

      // Obter metadados do arquivo
      const stats = await fs.stat(filePath);
      
      // Gerar thumbnail se for vídeo
      let thumbnailPath = null;
      if (this.isVideoFile(file.originalname)) {
        thumbnailPath = await this.generateThumbnail(filePath, fileId);
      }

      // Salvar metadados no banco
      const { data, error } = await supabaseAdmin.from('file_system').insert({
        id: fileId,
        filename: file.originalname,
        original_filename: file.originalname,
        file_path: filePath,
        thumbnail_path: thumbnailPath,
        file_size: stats.size,
        mime_type: file.mimetype,
        category: 'recording',
        camera_id: metadata.cameraId,
        recording_start: metadata.startTime,
        recording_end: metadata.endTime,
        duration: metadata.duration,
        metadata: {
          ...metadata,
          originalName: file.originalname,
          size: stats.size,
          mimeType: file.mimetype
        },
        status: 'active',
        created_by: metadata.userId
      });

      if (error) throw error;

      // Verificar limite de armazenamento
      await this.checkStorageLimit();

      return {
        success: true,
        fileId,
        filePath,
        thumbnailPath,
        size: stats.size
      };

    } catch (error) {
      console.error('Erro ao processar arquivo:', error);
      throw error;
    }
  }

  /**
   * Gera thumbnail para vídeo
   */
  async generateThumbnail(videoPath, fileId) {
    try {
      // Simulação de geração de thumbnail
      // Em produção, usar ffmpeg ou biblioteca similar
      const thumbnailPath = path.join(this.thumbnailsDir, `${fileId}.jpg`);
      
      // Criar thumbnail padrão (placeholder)
      const placeholder = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
      await fs.writeFile(thumbnailPath, placeholder);

      return thumbnailPath;
    } catch (error) {
      console.warn('Erro ao gerar thumbnail:', error);
      return null;
    }
  }

  /**
   * Lista arquivos com filtros
   */
  async listFiles(filters = {}) {
    let query = supabaseAdmin.from('file_system').select('*');

    // Aplicar filtros
    if (filters.category) {
      query = query.eq('category', filters.category);
    }
    if (filters.cameraId) {
      query = query.eq('camera_id', filters.cameraId);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.startDate) {
      query = query.gte('created_at', filters.startDate);
    }
    if (filters.endDate) {
      query = query.lte('created_at', filters.endDate);
    }
    if (filters.search) {
      query = query.ilike('filename', `%${filters.search}%`);
    }

    // Paginação
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const offset = (page - 1) * limit;

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return {
      files: data || [],
      total: count || 0,
      page,
      pages: Math.ceil((count || 0) / limit)
    };
  }

  /**
   * Obtém informações de um arquivo
   */
  async getFileInfo(fileId) {
    const { data, error } = await supabaseAdmin
      .from('file_system')
      .select('*')
      .eq('id', fileId)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Baixa arquivo
   */
  async downloadFile(fileId) {
    const fileInfo = await this.getFileInfo(fileId);
    
    if (!fileInfo || fileInfo.status !== 'active') {
      throw new Error('Arquivo não encontrado ou indisponível');
    }

    // Verificar se arquivo existe
    try {
      await fs.access(fileInfo.file_path);
      return fileInfo.file_path;
    } catch (error) {
      throw new Error('Arquivo físico não encontrado');
    }
  }

  /**
   * Move arquivo para outro local
   */
  async moveFile(fileId, newPath) {
    const fileInfo = await this.getFileInfo(fileId);
    
    if (!fileInfo) {
      throw new Error('Arquivo não encontrado');
    }

    const newFullPath = path.join(this.storageDir, newPath);
    await fs.mkdir(path.dirname(newFullPath), { recursive: true });
    
    await fs.rename(fileInfo.file_path, newFullPath);

    // Atualizar banco
    const { error } = await supabaseAdmin
      .from('file_system')
      .update({ file_path: newFullPath })
      .eq('id', fileId);

    if (error) throw error;

    return { success: true, newPath: newFullPath };
  }

  /**
   * Deleta arquivo
   */
  async deleteFile(fileId) {
    const fileInfo = await this.getFileInfo(fileId);
    
    if (!fileInfo) {
      throw new Error('Arquivo não encontrado');
    }

    // Deletar arquivo físico
    try {
      await fs.unlink(fileInfo.file_path);
      
      // Deletar thumbnail se existir
      if (fileInfo.thumbnail_path) {
        await fs.unlink(fileInfo.thumbnail_path).catch(() => {});
      }
    } catch (error) {
      console.warn('Erro ao deletar arquivo físico:', error);
    }

    // Atualizar status no banco
    const { error } = await supabaseAdmin
      .from('file_system')
      .update({ status: 'deleted', deleted_at: new Date() })
      .eq('id', fileId);

    if (error) throw error;

    return { success: true, message: 'Arquivo deletado com sucesso' };
  }

  /**
   * Obtém estatísticas de armazenamento
   */
  async getStorageStats() {
    const { data: files, error } = await supabaseAdmin
      .from('file_system')
      .select('file_size, category, status, created_at')
      .eq('status', 'active');

    if (error) throw error;

    const totalFiles = files.length;
    const totalSize = files.reduce((sum, file) => sum + (file.file_size || 0), 0);
    
    // Estatísticas por categoria
    const categoryStats = files.reduce((acc, file) => {
      const category = file.category || 'other';
      acc[category] = acc[category] || { count: 0, size: 0 };
      acc[category].count++;
      acc[category].size += file.file_size || 0;
      return acc;
    }, {});

    // Estatísticas por período
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const recentFiles = {
      last24h: files.filter(f => new Date(f.created_at) >= last24h).length,
      last7d: files.filter(f => new Date(f.created_at) >= last7d).length,
      last30d: files.filter(f => new Date(f.created_at) >= last30d).length
    };

    return {
      totalFiles,
      totalSize,
      categoryStats,
      recentFiles,
      averageSize: totalFiles > 0 ? totalSize / totalFiles : 0
    };
  }

  /**
   * Verifica limite de armazenamento
   */
  async checkStorageLimit() {
    const stats = await this.getStorageStats();
    const limit = FILE_CONFIG.storage.maxStorage;
    
    if (stats.totalSize > limit) {
      console.warn('Limite de armazenamento atingido:', {
        used: stats.totalSize,
        limit,
        percentage: (stats.totalSize / limit) * 100
      });
      
      // Limpar arquivos antigos automaticamente
      await this.cleanupOldFiles();
    }
  }

  /**
   * Limpa arquivos antigos
   */
  async cleanupOldFiles() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - FILE_CONFIG.storage.retentionDays);

    const { data, error } = await supabaseAdmin
      .from('file_system')
      .select('id, created_at')
      .lt('created_at', cutoffDate.toISOString())
      .eq('status', 'active')
      .eq('auto_cleanup', true);

    if (error) {
      console.error('Erro ao buscar arquivos antigos:', error);
      return;
    }

    for (const file of data || []) {
      try {
        await this.deleteFile(file.id);
      } catch (error) {
        console.warn('Erro ao deletar arquivo antigo:', error);
      }
    }

    console.log(`Arquivos antigos removidos: ${data?.length || 0}`);
  }

  /**
   * Busca arquivos
   */
  async searchFiles(query, filters = {}) {
    let searchQuery = supabaseAdmin.from('file_system').select('*');

    // Busca textual
    if (query) {
      searchQuery = searchQuery.or(`filename.ilike.%${query}%,metadata->>description.ilike.%${query}%`);
    }

    // Aplicar filtros adicionais
    if (filters.category) {
      searchQuery = searchQuery.eq('category', filters.category);
    }
    if (filters.cameraId) {
      searchQuery = searchQuery.eq('camera_id', filters.cameraId);
    }

    const { data, error } = await searchQuery
      .order('created_at', { ascending: false })
      .limit(filters.limit || 50);

    if (error) throw error;
    return data || [];
  }

  /**
   * Verifica se é arquivo de vídeo
   */
  isVideoFile(filename) {
    const videoExtensions = ['.mp4', '.avi', '.mov', '.mkv', '.flv', '.wmv', '.m4v'];
    const ext = path.extname(filename).toLowerCase();
    return videoExtensions.includes(ext);
  }

  /**
   * Gera ID único para arquivo
   */
  generateFileId() {
    return `file_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Cria backup de arquivo
   */
  async createBackup(fileId) {
    const fileInfo = await this.getFileInfo(fileId);
    
    if (!fileInfo) {
      throw new Error('Arquivo não encontrado');
    }

    const backupFilename = `${fileId}_${Date.now()}.bak`;
    const backupPath = path.join(this.backupsDir, backupFilename);

    await fs.copyFile(fileInfo.file_path, backupPath);

    // Salvar registro de backup
    await supabaseAdmin.from('file_system').insert({
      id: this.generateFileId(),
      filename: backupFilename,
      file_path: backupPath,
      category: 'backup',
      original_file_id: fileId,
      status: 'active'
    });

    return backupPath;
  }
}

// Exportar instância singleton
export const fileService = new FileService();

export default FileService;