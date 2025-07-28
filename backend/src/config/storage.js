/**
 * Configuração de armazenamento de arquivos
 */

import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { createModuleLogger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logger = createModuleLogger('Storage');

// Diretórios de armazenamento
const STORAGE_DIRS = {
  recordings: path.join(__dirname, '../../storage/recordings'),
  thumbnails: path.join(__dirname, '../../storage/thumbnails'),
  temp: path.join(__dirname, '../../storage/temp'),
  logs: path.join(__dirname, '../../storage/logs')
};

/**
 * Criar diretórios de armazenamento se não existirem
 */
export async function ensureStorageDirectories() {
  try {
    for (const [type, dir] of Object.entries(STORAGE_DIRS)) {
      await fs.mkdir(dir, { recursive: true });
      logger.info(`Diretório de ${type} criado/verificado: ${dir}`);
    }
  } catch (error) {
    logger.error('Erro ao criar diretórios de armazenamento:', error);
    throw error;
  }
}

/**
 * Configuração do multer para upload de arquivos
 */
const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath;
    
    // Determinar o diretório baseado no tipo de arquivo
    if (file.fieldname === 'thumbnail') {
      uploadPath = STORAGE_DIRS.thumbnails;
    } else {
      uploadPath = STORAGE_DIRS.temp;
    }
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Gerar nome único para o arquivo
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    const filename = `${file.fieldname}-${uniqueSuffix}${extension}`;
    
    cb(null, filename);
  }
});

/**
 * Filtro de arquivos para validação
 */
const fileFilter = (req, file, cb) => {
  // Tipos de arquivo permitidos
  const allowedTypes = {
    thumbnail: ['image/jpeg', 'image/png', 'image/webp'],
    video: ['video/mp4', 'video/avi', 'video/mkv', 'video/mov'],
    image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  };
  
  let isAllowed = false;
  
  // Verificar se o tipo de arquivo é permitido
  for (const [type, mimeTypes] of Object.entries(allowedTypes)) {
    if (mimeTypes.includes(file.mimetype)) {
      isAllowed = true;
      break;
    }
  }
  
  if (isAllowed) {
    cb(null, true);
  } else {
    cb(new Error(`Tipo de arquivo não permitido: ${file.mimetype}`), false);
  }
};

/**
 * Configuração do multer
 */
export const storage = multer({
  storage: multerStorage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
    files: 5 // Máximo 5 arquivos por upload
  }
});

/**
 * Utilitários de armazenamento
 */
export const storageUtils = {
  /**
   * Obter caminho completo para um arquivo
   */
  getFilePath: (type, filename) => {
    if (!STORAGE_DIRS[type]) {
      throw new Error(`Tipo de armazenamento inválido: ${type}`);
    }
    return path.join(STORAGE_DIRS[type], filename);
  },
  
  /**
   * Verificar se um arquivo existe
   */
  fileExists: async (type, filename) => {
    try {
      const filePath = storageUtils.getFilePath(type, filename);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  },
  
  /**
   * Deletar um arquivo
   */
  deleteFile: async (type, filename) => {
    try {
      const filePath = storageUtils.getFilePath(type, filename);
      await fs.unlink(filePath);
      logger.info(`Arquivo deletado: ${filePath}`);
      return true;
    } catch (error) {
      logger.error(`Erro ao deletar arquivo: ${error.message}`);
      return false;
    }
  },
  
  /**
   * Obter informações de um arquivo
   */
  getFileInfo: async (type, filename) => {
    try {
      const filePath = storageUtils.getFilePath(type, filename);
      const stats = await fs.stat(filePath);
      
      return {
        path: filePath,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        extension: path.extname(filename),
        name: path.basename(filename, path.extname(filename))
      };
    } catch (error) {
      logger.error(`Erro ao obter informações do arquivo: ${error.message}`);
      return null;
    }
  },
  
  /**
   * Listar arquivos em um diretório
   */
  listFiles: async (type) => {
    try {
      if (!STORAGE_DIRS[type]) {
        throw new Error(`Tipo de armazenamento inválido: ${type}`);
      }
      
      const files = await fs.readdir(STORAGE_DIRS[type]);
      const fileInfos = [];
      
      for (const file of files) {
        const info = await storageUtils.getFileInfo(type, file);
        if (info) {
          fileInfos.push(info);
        }
      }
      
      return fileInfos;
    } catch (error) {
      logger.error(`Erro ao listar arquivos: ${error.message}`);
      return [];
    }
  },
  
  /**
   * Limpar arquivos temporários antigos
   */
  cleanupTempFiles: async (maxAge = 24 * 60 * 60 * 1000) => { // 24 horas
    try {
      const tempFiles = await storageUtils.listFiles('temp');
      const now = Date.now();
      let deletedCount = 0;
      
      for (const file of tempFiles) {
        const age = now - file.created.getTime();
        if (age > maxAge) {
          await storageUtils.deleteFile('temp', path.basename(file.path));
          deletedCount++;
        }
      }
      
      logger.info(`Limpeza de arquivos temporários concluída. ${deletedCount} arquivos removidos.`);
      return deletedCount;
    } catch (error) {
      logger.error(`Erro na limpeza de arquivos temporários: ${error.message}`);
      return 0;
    }
  }
};

/**
 * Obter estatísticas de armazenamento
 */
export async function getStorageStats() {
  const stats = {};
  
  for (const [type, dir] of Object.entries(STORAGE_DIRS)) {
    try {
      const files = await storageUtils.listFiles(type);
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      
      stats[type] = {
        count: files.length,
        totalSize,
        totalSizeFormatted: formatBytes(totalSize),
        directory: dir
      };
    } catch (error) {
      stats[type] = {
        count: 0,
        totalSize: 0,
        totalSizeFormatted: '0 B',
        directory: dir,
        error: error.message
      };
    }
  }
  
  return stats;
}

/**
 * Formatar bytes em formato legível
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export { STORAGE_DIRS };
export default {
  storage,
  storageUtils,
  ensureStorageDirectories,
  getStorageStats,
  STORAGE_DIRS
};