/**
 * PathResolver - Centralized path resolution and normalization utility
 * Handles Windows/Unix path differences and ensures consistent storage
 */

import path from 'path';
import { promises as fs, existsSync } from 'fs';
import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('PathResolver');

class PathResolver {
  constructor() {
    // Define base recordings path (configurable via env)
    // Detectar automaticamente o root do projeto procurando por package.json
    let projectRoot = process.cwd();
    
    // Detecção especial: se estamos rodando de backend/, subir um nível
    if (path.basename(projectRoot) === 'backend') {
      const parentDir = path.dirname(projectRoot);
      if (existsSync(path.join(parentDir, 'package.json')) && 
          existsSync(path.join(parentDir, 'storage'))) {
        projectRoot = parentDir;
        logger.info('Detected backend subdirectory, using parent as project root');
      }
    }
    
    // Se ainda não achamos package.json, subir até encontrar
    if (!existsSync(path.join(projectRoot, 'package.json'))) {
      let searchPath = projectRoot;
      while (!existsSync(path.join(searchPath, 'package.json')) && 
             searchPath !== path.dirname(searchPath)) {
        searchPath = path.dirname(searchPath);
      }
      
      // Validar que encontramos um projeto NewCAM válido
      const storageCheck = path.join(searchPath, 'storage');
      if (existsSync(path.join(searchPath, 'package.json')) && 
          existsSync(storageCheck)) {
        projectRoot = searchPath;
      }
    }
    
    // Validar que encontramos um package.json válido do NewCAM
    const packageJsonPath = path.join(projectRoot, 'package.json');
    if (!existsSync(packageJsonPath)) {
      throw new Error('Could not find project root with package.json');
    }
    
    // Garantir que é o projeto NewCAM verificando se existe o diretório storage
    const storageDir = path.join(projectRoot, 'storage');
    if (!existsSync(storageDir)) {
      logger.warn(`Storage directory not found at ${storageDir}, creating it...`);
      // Se não existe, pode ser um projeto novo - vamos usar o path mesmo assim
    }
    
    this.projectRoot = projectRoot;
    this.recordingsBasePath = process.env.RECORDINGS_PATH || 
      path.join(projectRoot, 'storage', 'www', 'record', 'live');
    
    logger.info(`PathResolver initialized:`, {
      projectRoot: this.projectRoot,
      recordingsBasePath: this.recordingsBasePath,
      cwd: process.cwd(),
      detectedFromBackendSubdir: path.basename(process.cwd()) === 'backend'
    });
  }

  /**
   * Get the project root directory
   * @returns {string} - Absolute path to project root
   */
  getProjectRoot() {
    // Retornar o project root já calculado no constructor
    return this.projectRoot;
  }

  /**
   * Normalize path to a consistent relative format for database storage
   * @param {string} filePath - Input file path (absolute or relative)
   * @returns {string|null} - Normalized relative path or null if invalid
   */
  normalizeToRelative(filePath) {
    if (!filePath) return null;
    
    try {
      // Convert separators to Unix format
      let normalized = filePath.replace(/\\/g, '/');
      
      // Remove drive letters (Windows)
      if (normalized.match(/^[A-Z]:/i)) {
        const parts = normalized.split('/');
        const storageIndex = parts.findIndex(p => p === 'storage');
        if (storageIndex > 0) {
          normalized = parts.slice(storageIndex).join('/');
        }
      }
      
      // NOTA: Preservar pontos iniciais - ZLMediaKit cria arquivos temporários com pontos
      // Não removemos mais os pontos, pois isso causava mismatch com os dados do banco
      
      // Ensure path starts with storage/www/record/live
      if (normalized.includes('storage/www/record/live')) {
        const index = normalized.indexOf('storage/www/record/live');
        return normalized.substring(index);
      }
      
      // If already relative and properly formatted
      if (normalized.startsWith('storage/www/record/live/')) {
        return normalized;
      }
      
      // If it's just a filename or partial path, construct full relative path
      if (!normalized.includes('/') || normalized.startsWith('www/record/live/')) {
        return normalized.startsWith('www/') ? 
          `storage/${normalized}` : 
          `storage/www/record/live/${normalized}`;
      }
      
      return normalized;
      
    } catch (error) {
      logger.error('Error normalizing path:', { filePath, error: error.message });
      return null;
    }
  }

  /**
   * Resolve relative path to absolute filesystem path
   * @param {string} relativePath - Relative path from database
   * @returns {string|null} - Absolute filesystem path or null if invalid
   */
  resolveToAbsolute(relativePath) {
    if (!relativePath) return null;
    
    try {
      // If already absolute, return as-is
      if (path.isAbsolute(relativePath)) {
        return relativePath;
      }
      
      // CRITICAL FIX: Handle relative paths starting with storage/
      if (relativePath.startsWith('storage/')) {
        return path.join(this.getProjectRoot(), relativePath);
      }
      
      // Handle paths starting with www/
      if (relativePath.startsWith('www/')) {
        return path.join(this.getProjectRoot(), 'storage', relativePath);
      }
      
      // CRITICAL FIX: Check if path already contains full recordings base structure
      // This prevents double concatenation when paths already have "storage/www/record/live"
      const normalizedPath = relativePath.replace(/\\/g, '/');
      if (normalizedPath.includes('storage/www/record/live/')) {
        // Path already contains the full structure, just resolve to absolute from project root
        const storageIndex = normalizedPath.indexOf('storage/www/record/live/');
        const fullRelativePath = normalizedPath.substring(storageIndex);
        return path.join(this.getProjectRoot(), fullRelativePath);
      }
      
      // Default: assume it's relative to recordings base path (for simple filenames only)
      return path.join(this.recordingsBasePath, relativePath);
      
    } catch (error) {
      logger.error('Error resolving absolute path:', { relativePath, error: error.message });
      return null;
    }
  }

  /**
   * Generate standardized recording path for new recordings
   * @param {string} cameraId - Camera UUID
   * @param {string} filename - Recording filename
   * @param {Date} date - Recording date (optional, defaults to now)
   * @returns {string} - Standardized relative path
   */
  generateRecordingPath(cameraId, filename, date = new Date()) {
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    return `storage/www/record/live/${cameraId}/${dateStr}/${filename}`;
  }

  /**
   * Generate S3 key for recording
   * @param {string} cameraId - Camera UUID
   * @param {string} filename - Recording filename
   * @param {Date} date - Recording date (optional, defaults to now)
   * @returns {string} - S3 key
   */
  generateS3Key(cameraId, filename, date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `recordings/${year}/${month}/${day}/${cameraId}/${filename}`;
  }

  /**
   * Validate that a path exists on filesystem
   * @param {string} filePath - Path to validate (absolute or relative)
   * @returns {Promise<Object>} - Validation result with file info
   */
  async validatePath(filePath) {
    const absolutePath = path.isAbsolute(filePath) ? 
      filePath : this.resolveToAbsolute(filePath);
    
    if (!absolutePath) {
      return { exists: false, error: 'Invalid path format' };
    }
    
    try {
      const stats = await fs.stat(absolutePath);
      
      return {
        exists: true,
        absolutePath,
        relativePath: this.normalizeToRelative(absolutePath),
        size: stats.size,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        mtime: stats.mtime,
        birthtime: stats.birthtime
      };
      
    } catch (error) {
      return {
        exists: false,
        absolutePath,
        relativePath: this.normalizeToRelative(absolutePath),
        error: error.message
      };
    }
  }

  /**
   * Find recording file by trying multiple possible locations
   * @param {Object} recording - Recording object from database
   * @returns {Promise<Object|null>} - File info or null if not found
   */
  async findRecordingFile(recording) {
    const searchPaths = this.generateSearchPaths(recording);
    
    logger.debug(`Searching for recording ${recording.id} in ${searchPaths.length} locations`);
    
    for (const searchPath of searchPaths) {
      const result = await this.validatePath(searchPath);
      
      if (result.exists && result.isFile) {
        logger.info(`Found recording ${recording.id} at: ${result.absolutePath}`);
        return result;
      }
    }
    
    logger.warn(`Recording file not found: ${recording.id}`, {
      searchedPaths: searchPaths,
      recording: {
        local_path: recording.local_path,
        file_path: recording.file_path,
        filename: recording.filename
      }
    });
    
    return null;
  }

  /**
   * Generate all possible search paths for a recording
   * @param {Object} recording - Recording object
   * @returns {Array<string>} - Array of possible absolute paths
   */
  generateSearchPaths(recording) {
    const paths = [];
    
    logger.info('🔍 generateSearchPaths - Input recording:', {
      id: recording.id,
      filename: recording.filename,
      camera_id: recording.camera_id,
      local_path: recording.local_path,
      file_path: recording.file_path,
      created_at: recording.created_at
    });
    
    // 1. Try local_path if exists (simplified - use exact path)
    if (recording.local_path) {
      const localPath = this.resolveToAbsolute(recording.local_path);
      paths.push(localPath);
      logger.info('📁 Added local_path:', localPath);
    }
    
    // 2. Try file_path if exists and different from local_path
    if (recording.file_path && recording.file_path !== recording.local_path) {
      const filePath = this.resolveToAbsolute(recording.file_path);
      paths.push(filePath);
      logger.debug('📁 Added file_path:', filePath);
    }
    
    // 3. Construct expected paths based on camera_id and filename
    if (recording.camera_id && recording.filename) {
      const date = recording.created_at ? 
        new Date(recording.created_at) : new Date();
      const dateStr = date.toISOString().split('T')[0];
      
      // SIMPLIFICAÇÃO CRÍTICA: Com o webhook corrigido, filename é sempre consistente
      // Reduzir drasticamente a complexidade da busca
      const filename = recording.filename;
      
      // Apenas 2 locais principais para busca
      const basePaths = [
        this.recordingsBasePath, // storage/www/record/live (padrão do sistema)
        path.join(this.getProjectRoot(), 'storage', 'www') // fallback para arquivos diretos
      ];
      
      // Busca simplificada: apenas as estruturas reais do sistema
      for (const basePath of basePaths) {
        // Estrutura padrão: {base_path}/{camera_id}/{date}/{filename}
        paths.push(path.join(basePath, recording.camera_id, dateStr, filename));
        
        // Estrutura sem data (arquivos antigos): {base_path}/{camera_id}/{filename}
        paths.push(path.join(basePath, recording.camera_id, filename));
        
        // Fallback: arquivo direto na pasta base (casos especiais)
        if (basePath === path.join(this.getProjectRoot(), 'storage', 'www')) {
          paths.push(path.join(basePath, 'record', 'live', recording.camera_id, dateStr, filename));
        }
      }
      
      // ADICIONAR: Buscar no diretório processed (onde ZLMediaKit move arquivos finalizados)
      const processedPath = path.join(this.recordingsBasePath, 'processed');
      paths.push(path.join(processedPath, filename));
      
      // CRÍTICO: Tentar sem o ponto inicial do filename (ZLMediaKit remove pontos no processed)
      if (filename.startsWith('.')) {
        const filenameWithoutDot = filename.substring(1);
        const processedNoDotPath = path.join(processedPath, filenameWithoutDot);
        paths.push(processedNoDotPath);
        logger.info('🔍 Added processed path without dot:', processedNoDotPath);
        
        // Também tentar na estrutura padrão sem ponto
        for (const basePath of basePaths) {
          const noDotPath1 = path.join(basePath, recording.camera_id, dateStr, filenameWithoutDot);
          const noDotPath2 = path.join(basePath, recording.camera_id, filenameWithoutDot);
          paths.push(noDotPath1);
          paths.push(noDotPath2);
          logger.debug('🔍 Added no-dot paths:', { noDotPath1, noDotPath2 });
        }
      }
    }
    
    // 4. Fallback simplificado: para gravações sem camera_id (casos raros)
    if (recording.filename && !recording.camera_id) {
      const filename = recording.filename;
      
      // Buscar apenas nos locais principais
      paths.push(
        path.join(this.recordingsBasePath, filename),
        path.join(this.getProjectRoot(), 'storage', 'www', filename)
      );
    }
    
    // Filter out null/undefined and deduplicate
    const filteredPaths = [...new Set(paths.filter(Boolean))];
    
    // CRITICAL FIX: Ensure ALL paths are converted to absolute before returning
    const finalPaths = filteredPaths.map(searchPath => {
      const absolutePath = path.isAbsolute(searchPath) ? 
        searchPath : this.resolveToAbsolute(searchPath);
      return absolutePath;
    }).filter(Boolean); // Remove any null results
    
    logger.info('🔍 Final search paths generated:', {
      totalPaths: finalPaths.length,
      rawPathsCount: paths.length,
      filteredPathsCount: filteredPaths.length,
      deduplicatedPathsCount: finalPaths.length
    });
    
    // Log each path individually for clear visibility  
    finalPaths.forEach((pathItem, index) => {
      logger.info(`📁 Path ${index + 1}: ${pathItem}`);
    });
    return finalPaths;
  }

  /**
   * Ensure directory structure exists for a path
   * @param {string} filePath - File path (directory will be created)
   * @returns {Promise<boolean>} - Success status
   */
  async ensureDirectoryExists(filePath) {
    try {
      const absolutePath = this.resolveToAbsolute(filePath);
      if (!absolutePath) return false;
      
      const dirPath = path.dirname(absolutePath);
      await fs.mkdir(dirPath, { recursive: true });
      
      logger.debug(`Ensured directory exists: ${dirPath}`);
      return true;
      
    } catch (error) {
      logger.error('Error creating directory:', { filePath, error: error.message });
      return false;
    }
  }

  /**
   * Get storage statistics for recordings directory
   * @returns {Promise<Object>} - Storage statistics
   */
  async getStorageStats() {
    try {
      const result = await this.validatePath(this.recordingsBasePath);
      
      if (!result.exists) {
        return { exists: false, totalSize: 0, fileCount: 0 };
      }
      
      // Recursively get stats (simplified version)
      const stats = await this.getDirectoryStats(this.recordingsBasePath);
      
      return {
        exists: true,
        basePath: this.recordingsBasePath,
        ...stats
      };
      
    } catch (error) {
      logger.error('Error getting storage stats:', error);
      return { exists: false, error: error.message };
    }
  }

  /**
   * Get directory statistics recursively
   * @private
   */
  async getDirectoryStats(dirPath) {
    let totalSize = 0;
    let fileCount = 0;
    let directoryCount = 0;
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isFile()) {
          const stats = await fs.stat(fullPath);
          totalSize += stats.size;
          fileCount++;
        } else if (entry.isDirectory()) {
          directoryCount++;
          const subStats = await this.getDirectoryStats(fullPath);
          totalSize += subStats.totalSize;
          fileCount += subStats.fileCount;
          directoryCount += subStats.directoryCount;
        }
      }
      
    } catch (error) {
      logger.warn(`Error reading directory ${dirPath}:`, error.message);
    }
    
    return { totalSize, fileCount, directoryCount };
  }
}

// Export singleton instance
export default new PathResolver();