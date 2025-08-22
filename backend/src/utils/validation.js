/**
 * Utilitários de validação comuns
 * Centraliza funções de validação reutilizáveis
 */

import path from 'path';

/**
 * Valida se uma string é um UUID válido
 * @param {string} uuid - String a ser validada
 * @returns {boolean} - True se for um UUID válido
 */
export function isValidUUID(uuid) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Sanitiza entrada de dados removendo caracteres perigosos
 * @param {string} input - String a ser sanitizada
 * @returns {string} - String sanitizada
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input.trim().replace(/[<>"'&]/g, '');
}

/**
 * Extrai ID da câmera de uma string de stream
 * @param {string} stream - String do stream
 * @returns {string|null} - ID da câmera ou null se não encontrado
 */
export function extractCameraId(stream) {
  if (!stream || typeof stream !== 'string') return null;
  
  // Tenta extrair UUID do formato padrão
  const uuidMatch = stream.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  if (uuidMatch) {
    return uuidMatch[0];
  }
  
  // Fallback para outros formatos
  const parts = stream.split('/');
  for (const part of parts) {
    if (isValidUUID(part)) {
      return part;
    }
  }
  
  return null;
}

/**
 * Normaliza caminho de arquivo e calcula caminho absoluto
 * @param {string} filePath - Caminho do arquivo relativo
 * @param {string} fileName - Nome do arquivo
 * @returns {Object} - Objeto com informações do caminho
 */
export function normalizeFilePath(filePath, fileName) {
  if (!filePath || !fileName) {
    throw new Error('filePath e fileName são obrigatórios');
  }
  
  // Remove caracteres perigosos
  const safePath = filePath.replace(/[<>:"|?*]/g, '_');
  const safeFileName = fileName.replace(/[<>:"|?*]/g, '_');
  
  // Garante que o caminho termine com /
  const normalizedPath = safePath.endsWith('/') ? safePath : `${safePath}/`;
  const relativePath = `${normalizedPath}${safeFileName}`;
  
  // Calcula caminho absoluto baseado no mapeamento de volumes do Docker
  // O ZLMediaKit usa ./www/record/ que é mapeado para ./storage/bin/www/record/
  const baseRecordingPath = process.env.RECORDING_OUTPUT_PATH || 
                           path.join(process.cwd(), '..', 'storage', 'bin', 'www', 'record');
  
  // Remove ./ do início do filePath se presente e remove www/record/
  const cleanFilePath = filePath.replace(/^\.\//, '').replace('www/record/', '');
  
  // Monta o caminho absoluto
  const absolutePath = path.join(baseRecordingPath, cleanFilePath, fileName);
  
  return {
    absolutePath,
    relativePath,
    fileName: safeFileName,
    directory: path.dirname(absolutePath)
  };
}

/**
 * Formata bytes em formato legível
 * @param {number} bytes - Número de bytes
 * @param {number} decimals - Número de casas decimais
 * @returns {string} - String formatada
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Formata tempo de uptime em formato legível
 * @param {number} seconds - Segundos de uptime
 * @returns {string} - String formatada
 */
export function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
  
  return parts.join(' ');
}

/**
 * Obtém range de tempo baseado no período
 * @param {string} period - Período (24h, 7d, 30d)
 * @returns {Object} - Objeto com start e end
 */
export function getTimeRange(period) {
  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);
  
  switch (period) {
    case '24h':
      start.setHours(start.getHours() - 24);
      break;
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    default:
      start.setHours(start.getHours() - 24);
  }
  
  return { start, end };
}