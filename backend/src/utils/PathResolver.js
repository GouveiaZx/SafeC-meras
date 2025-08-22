/**
 * PathResolver - Centralized path resolution and normalization utility
 * Handles Windows/Unix path differences and ensures consistent storage
 */

import path from 'path';
import { promises as fs } from 'fs';
import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('PathResolver');

class PathResolver {
  constructor() {
    // Define base recordings path (configurable via env)
    this.recordingsBasePath = process.env.RECORDINGS_PATH || 
      path.join(process.cwd(), '..', 'storage', 'www', 'record', 'live');
    
    logger.info(`PathResolver initialized with base path: ${this.recordingsBasePath}`);
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
      
      // Handle relative paths starting with storage/
      if (relativePath.startsWith('storage/')) {
        return path.join(process.cwd(), '..', relativePath);
      }
      
      // Handle paths starting with www/
      if (relativePath.startsWith('www/')) {
        return path.join(process.cwd(), '..', 'storage', relativePath);
      }
      
      // Default: assume it's relative to recordings base path
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
    
    // 1. Try local_path if exists
    if (recording.local_path) {
      paths.push(this.resolveToAbsolute(recording.local_path));
    }
    
    // 2. Try file_path if exists and different from local_path
    if (recording.file_path && recording.file_path !== recording.local_path) {
      paths.push(this.resolveToAbsolute(recording.file_path));
    }
    
    // 3. Construct expected paths based on camera_id and filename
    if (recording.camera_id && recording.filename) {
      const date = recording.created_at ? 
        new Date(recording.created_at) : new Date();
      const dateStr = date.toISOString().split('T')[0];
      
      // Define base paths to search
      const basePaths = [
        this.recordingsBasePath, // storage/www/record/live
        path.join(process.cwd(), '..', 'storage', 'live'), // NEW: storage/live for ZLMediaKit files
        path.join(process.cwd(), '..', 'storage', 'www', 'record') // Also check www/record without /live
      ];
      
      // Search in all base paths
      for (const basePath of basePaths) {
        // Standard structure: {camera_id}/{date}/{filename}
        paths.push(
          path.join(basePath, recording.camera_id, dateStr, recording.filename),
          path.join(basePath, recording.camera_id, recording.filename),
          path.join(basePath, 'processed', dateStr, recording.filename),
          path.join(basePath, 'processed', recording.filename)
        );
        
        // ZLMediaKit specific paths with nested structure
        paths.push(
          path.join(basePath, recording.camera_id, dateStr, 'record', 'live', recording.camera_id, dateStr, recording.filename),
          // Also check for files with dot prefix (ZLM creates temporary files with dots)
          path.join(basePath, recording.camera_id, dateStr, 'record', 'live', recording.camera_id, dateStr, `.${recording.filename}`),
          // Direct filename without date folders
          path.join(basePath, recording.filename),
          path.join(basePath, `.${recording.filename}`)
        );
      }
    }
    
    // 4. Try just filename in base directory
    if (recording.filename) {
      paths.push(path.join(this.recordingsBasePath, recording.filename));
      paths.push(path.join(process.cwd(), '..', 'storage', 'live', recording.filename));
    }
    
    // Filter out null/undefined and deduplicate
    return [...new Set(paths.filter(Boolean))];
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