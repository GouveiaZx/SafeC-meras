/**
 * FileController - Gerenciamento de arquivos e navegação
 */
import fs from 'fs/promises';
import path from 'path';
import { createModuleLogger } from '../config/logger.js';
import { supabase, supabaseAdmin } from '../config/database.js';

const logger = createModuleLogger('FileController');

/**
 * Controller para gerenciamento de arquivos
 */
export class FileController {
  constructor() {
    this.uploadPath = process.env.UPLOAD_PATH || './uploads';
    this.recordingsPath = process.env.RECORDINGS_PATH || './storage/recordings';
    this.streamsPath = process.env.STREAMS_PATH || './storage/streams';
  }

  /**
   * Listar arquivos e diretórios
   */
  async listFiles(req, res) {
    try {
      const { directory = '', type = 'all' } = req.query;
      const basePath = this.getBasePath(type);
      const fullPath = path.join(basePath, directory);

      // Verificar se o diretório existe
      try {
        await fs.access(fullPath);
      } catch {
        return res.status(404).json({ error: 'Diretório não encontrado' });
      }

      const items = await fs.readdir(fullPath, { withFileTypes: true });
      const files = [];
      const directories = [];

      for (const item of items) {
        const itemPath = path.join(fullPath, item.name);
        const stats = await fs.stat(itemPath);
        const relativePath = path.relative(basePath, itemPath);

        const fileInfo = {
          name: item.name,
          path: relativePath,
          size: stats.size,
          modified: stats.mtime,
          isDirectory: item.isDirectory(),
          isFile: item.isFile(),
          extension: item.isFile() ? path.extname(item.name).toLowerCase() : null
        };

        if (item.isDirectory()) {
          directories.push(fileInfo);
        } else {
          files.push(fileInfo);
        }
      }

      // Ordenar: diretórios primeiro, depois arquivos
      const sortedItems = [...directories.sort((a, b) => a.name.localeCompare(b.name)),
                           ...files.sort((a, b) => a.name.localeCompare(b.name))];

      res.json({
        currentPath: directory,
        items: sortedItems,
        basePath: type,
        parentPath: directory ? path.dirname(directory) : null
      });
    } catch (error) {
      logger.error('Erro ao listar arquivos:', error);
      res.status(500).json({ error: 'Erro ao listar arquivos' });
    }
  }

  /**
   * Obter informações de um arquivo
   */
  async getFileInfo(req, res) {
    try {
      const { filename } = req.params;
      const { type = 'uploads' } = req.query;
      const basePath = this.getBasePath(type);
      const filePath = path.join(basePath, filename);

      try {
        await fs.access(filePath);
      } catch {
        return res.status(404).json({ error: 'Arquivo não encontrado' });
      }

      const stats = await fs.stat(filePath);
      const ext = path.extname(filename).toLowerCase();

      // Buscar metadados no banco se for uma gravação
      let metadata = null;
      if (type === 'recordings') {
        const { data: recording } = await supabaseAdmin
          .from('recordings')
          .select('*, cameras(name)')
          .eq('file_path', filename)
          .single();

        metadata = recording;
      }

      res.json({
        name: path.basename(filename),
        path: filename,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        extension: ext,
        type: this.getFileType(ext),
        metadata,
        downloadUrl: `/api/files/download/${encodeURIComponent(filename)}?type=${type}`,
        previewUrl: this.getPreviewUrl(filename, type)
      });
    } catch (error) {
      logger.error('Erro ao obter informações do arquivo:', error);
      res.status(500).json({ error: 'Erro ao obter informações do arquivo' });
    }
  }

  /**
   * Fazer download de um arquivo
   */
  async downloadFile(req, res) {
    try {
      const { filename } = req.params;
      const { type = 'uploads' } = req.query;
      const basePath = this.getBasePath(type);
      const filePath = path.join(basePath, filename);

      try {
        await fs.access(filePath);
      } catch {
        return res.status(404).json({ error: 'Arquivo não encontrado' });
      }

      const stats = await fs.stat(filePath);
      const ext = path.extname(filename).toLowerCase();

      // Configurar headers
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filename)}"`);
      res.setHeader('Content-Type', this.getMimeType(ext));
      res.setHeader('Content-Length', stats.size);

      // Stream do arquivo
      const fileStream = require('fs').createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error) {
      logger.error('Erro ao fazer download:', error);
      res.status(500).json({ error: 'Erro ao fazer download do arquivo' });
    }
  }

  /**
   * Deletar arquivo
   */
  async deleteFile(req, res) {
    try {
      const { filename } = req.params;
      const { type = 'uploads' } = req.query;
      const basePath = this.getBasePath(type);
      const filePath = path.join(basePath, filename);

      try {
        await fs.access(filePath);
      } catch {
        return res.status(404).json({ error: 'Arquivo não encontrado' });
      }

      // Verificar se é uma gravação no banco
      if (type === 'recordings') {
        const { data: recording } = await supabaseAdmin
          .from('recordings')
          .select('id')
          .eq('file_path', filename)
          .single();

        if (recording) {
          // Atualizar status no banco
          await supabaseAdmin
            .from('recordings')
            .update({ status: 'deleted', deleted_at: new Date().toISOString() })
            .eq('id', recording.id);
        }
      }

      // Deletar arquivo
      await fs.unlink(filePath);

      res.json({ message: 'Arquivo deletado com sucesso' });
    } catch (error) {
      logger.error('Erro ao deletar arquivo:', error);
      res.status(500).json({ error: 'Erro ao deletar arquivo' });
    }
  }

  /**
   * Buscar arquivos
   */
  async searchFiles(req, res) {
    try {
      const { query, type = 'all', extension } = req.query;

      if (!query) {
        return res.status(400).json({ error: 'Query de busca é obrigatória' });
      }

      const searchResults = [];
      const searchTypes = type === 'all' ? ['uploads', 'recordings', 'streams'] : [type];

      for (const searchType of searchTypes) {
        const basePath = this.getBasePath(searchType);
        const results = await this.searchInDirectory(basePath, query, extension);
        
        results.forEach(file => {
          searchResults.push({
            ...file,
            type: searchType,
            relativePath: path.relative(basePath, file.path)
          });
        });
      }

      res.json({
        query,
        results: searchResults,
        total: searchResults.length
      });
    } catch (error) {
      logger.error('Erro ao buscar arquivos:', error);
      res.status(500).json({ error: 'Erro ao buscar arquivos' });
    }
  }

  /**
   * Obter estatísticas de armazenamento
   */
  async getStorageStats(req, res) {
    try {
      const stats = await Promise.all([
        this.getDirectoryStats(this.uploadPath),
        this.getDirectoryStats(this.recordingsPath),
        this.getDirectoryStats(this.streamsPath)
      ]);

      const [uploads, recordings, streams] = stats;

      res.json({
        uploads,
        recordings,
        streams,
        total: {
          files: uploads.files + recordings.files + streams.files,
          size: uploads.size + recordings.size + streams.size,
          directories: uploads.directories + recordings.directories + streams.directories
        }
      });
    } catch (error) {
      logger.error('Erro ao obter estatísticas de armazenamento:', error);
      res.status(500).json({ error: 'Erro ao obter estatísticas de armazenamento' });
    }
  }

  /**
   * Mover arquivo
   */
  async moveFile(req, res) {
    try {
      const { filename } = req.params;
      const { targetPath, targetType } = req.body;
      const { type = 'uploads' } = req.query;

      if (!targetPath || !targetType) {
        return res.status(400).json({ error: 'Caminho de destino e tipo são obrigatórios' });
      }

      const sourceBasePath = this.getBasePath(type);
      const targetBasePath = this.getBasePath(targetType);
      const sourcePath = path.join(sourceBasePath, filename);
      const destinationPath = path.join(targetBasePath, targetPath);

      // Verificar se o arquivo existe
      try {
        await fs.access(sourcePath);
      } catch {
        return res.status(404).json({ error: 'Arquivo de origem não encontrado' });
      }

      // Criar diretório de destino se não existir
      const destDir = path.dirname(destinationPath);
      try {
        await fs.access(destDir);
      } catch {
        await fs.mkdir(destDir, { recursive: true });
      }

      // Mover arquivo
      await fs.rename(sourcePath, destinationPath);

      // Atualizar metadados no banco se for gravação
      if (type === 'recordings' || targetType === 'recordings') {
        const newFilePath = path.relative(targetBasePath, destinationPath);
        await supabaseAdmin
          .from('recordings')
          .update({ file_path: newFilePath, updated_at: new Date().toISOString() })
          .eq('file_path', filename);
      }

      res.json({
        message: 'Arquivo movido com sucesso',
        newPath: path.relative(targetBasePath, destinationPath)
      });
    } catch (error) {
      logger.error('Erro ao mover arquivo:', error);
      res.status(500).json({ error: 'Erro ao mover arquivo' });
    }
  }

  /**
   * Helper: obter caminho base por tipo
   */
  getBasePath(type) {
    switch (type) {
      case 'uploads':
        return this.uploadPath;
      case 'recordings':
        return this.recordingsPath;
      case 'streams':
        return this.streamsPath;
      default:
        return this.uploadPath;
    }
  }

  /**
   * Helper: obter tipo de arquivo
   */
  getFileType(ext) {
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp'];
    const videoExts = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m3u8'];
    const audioExts = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma'];
    const documentExts = ['.pdf', '.doc', '.docx', '.txt', '.xls', '.xlsx', '.ppt', '.pptx'];

    if (imageExts.includes(ext)) return 'image';
    if (videoExts.includes(ext)) return 'video';
    if (audioExts.includes(ext)) return 'audio';
    if (documentExts.includes(ext)) return 'document';
    return 'other';
  }

  /**
   * Helper: obter MIME type
   */
  getMimeType(ext) {
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.mp4': 'video/mp4',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.zip': 'application/zip',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav'
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Helper: obter URL de preview
   */
  getPreviewUrl(filename, type) {
    const ext = path.extname(filename).toLowerCase();
    const fileType = this.getFileType(ext);

    if (['image', 'video'].includes(fileType)) {
      return `/api/files/preview/${encodeURIComponent(filename)}?type=${type}`;
    }
    return null;
  }

  /**
   * Helper: buscar em diretório recursivamente
   */
  async searchInDirectory(dirPath, query, extension) {
    const results = [];

    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });

      for (const item of items) {
        const fullPath = path.join(dirPath, item.name);

        if (item.isDirectory()) {
          const subResults = await this.searchInDirectory(fullPath, query, extension);
          results.push(...subResults);
        } else {
          const matchesQuery = item.name.toLowerCase().includes(query.toLowerCase());
          const matchesExtension = !extension || item.name.toLowerCase().endsWith(extension.toLowerCase());

          if (matchesQuery && matchesExtension) {
            const stats = await fs.stat(fullPath);
            results.push({
              name: item.name,
              path: fullPath,
              size: stats.size,
              modified: stats.mtime
            });
          }
        }
      }
    } catch (error) {
      logger.error('Erro ao buscar no diretório:', error);
    }

    return results;
  }

  /**
   * Helper: obter estatísticas de diretório
   */
  async getDirectoryStats(dirPath) {
    try {
      await fs.access(dirPath);
    } catch {
      return { files: 0, directories: 0, size: 0 };
    }

    const stats = await this.calculateDirectoryStats(dirPath);
    return stats;
  }

  /**
   * Helper: calcular estatísticas recursivamente
   */
  async calculateDirectoryStats(dirPath) {
    let files = 0;
    let directories = 0;
    let size = 0;

    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });

      for (const item of items) {
        const fullPath = path.join(dirPath, item.name);

        if (item.isDirectory()) {
          directories++;
          const subStats = await this.calculateDirectoryStats(fullPath);
          files += subStats.files;
          directories += subStats.directories;
          size += subStats.size;
        } else {
          files++;
          const stats = await fs.stat(fullPath);
          size += stats.size;
        }
      }
    } catch (error) {
      logger.error('Erro ao calcular estatísticas:', error);
    }

    return { files, directories, size };
  }
}

export default new FileController();