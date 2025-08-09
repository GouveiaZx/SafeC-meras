/**
 * Utilitário para extração de metadados de vídeo
 * Usa ffprobe para obter informações detalhadas dos arquivos de vídeo
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { promises as fs } from 'fs';
import { createModuleLogger } from '../config/logger.js';

const execAsync = promisify(exec);
const logger = createModuleLogger('VideoMetadata');

class VideoMetadataExtractor {
  constructor() {
    this.ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
  }

  /**
   * Extrai metadados completos de um arquivo de vídeo
   */
  async extractMetadata(filePath) {
    try {
      // Verificar se o arquivo existe
      await fs.access(filePath);
      
      // Obter informações básicas do arquivo
      const stats = await fs.stat(filePath);
      const fileSize = stats.size;
      
      // Comando ffprobe para extrair metadados
      const command = `"${this.ffprobePath}" -v quiet -print_format json -show_format -show_streams "${filePath}"`;
      
      logger.debug(`Executando comando ffprobe: ${command}`);
      
      const { stdout, stderr } = await execAsync(command);
      
      if (stderr) {
        logger.warn(`Aviso do ffprobe: ${stderr}`);
      }
      
      const metadata = JSON.parse(stdout);
      
      // Extrair informações relevantes
      const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
      const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');
      
      const result = {
        // Informações básicas do arquivo
        filename: path.basename(filePath),
        filepath: filePath,
        fileSize: fileSize,
        
        // Informações de duração
        duration: parseFloat(metadata.format.duration) || 0,
        durationFormatted: this.formatDuration(parseFloat(metadata.format.duration) || 0),
        
        // Informações de vídeo
        width: videoStream ? parseInt(videoStream.width) : 0,
        height: videoStream ? parseInt(videoStream.height) : 0,
        resolution: videoStream ? `${videoStream.width}x${videoStream.height}` : 'Desconhecida',
        videoCodec: videoStream ? videoStream.codec_name : 'Desconhecido',
        videoBitrate: videoStream ? parseInt(videoStream.bit_rate) || 0 : 0,
        frameRate: videoStream ? this.parseFrameRate(videoStream.r_frame_rate) : 0,
        
        // Informações de áudio
        audioCodec: audioStream ? audioStream.codec_name : 'Sem áudio',
        audioBitrate: audioStream ? parseInt(audioStream.bit_rate) || 0 : 0,
        audioChannels: audioStream ? parseInt(audioStream.channels) || 0 : 0,
        audioSampleRate: audioStream ? parseInt(audioStream.sample_rate) || 0 : 0,
        
        // Informações do container
        format: metadata.format.format_name || 'Desconhecido',
        bitrate: parseInt(metadata.format.bit_rate) || 0,
        
        // Metadados adicionais
        creationTime: metadata.format.tags?.creation_time || null,
        title: metadata.format.tags?.title || null,
        
        // Informações calculadas
        segments: this.calculateSegments(parseFloat(metadata.format.duration) || 0),
        
        // Metadados brutos para referência
        rawMetadata: metadata
      };
      
      logger.info(`Metadados extraídos para ${path.basename(filePath)}: ${result.resolution}, ${result.durationFormatted}, ${this.formatFileSize(fileSize)}`);
      
      return result;
      
    } catch (error) {
      logger.error(`Erro ao extrair metadados de ${filePath}:`, error);
      
      // Retornar metadados básicos em caso de erro
      try {
        const stats = await fs.stat(filePath);
        return {
          filename: path.basename(filePath),
          filepath: filePath,
          fileSize: stats.size,
          duration: 0,
          durationFormatted: '00:00:00',
          width: 0,
          height: 0,
          resolution: 'Desconhecida',
          videoCodec: 'Desconhecido',
          videoBitrate: 0,
          frameRate: 0,
          audioCodec: 'Desconhecido',
          audioBitrate: 0,
          audioChannels: 0,
          audioSampleRate: 0,
          format: 'Desconhecido',
          bitrate: 0,
          creationTime: null,
          title: null,
          segments: 0,
          error: error.message
        };
      } catch (statError) {
        throw new Error(`Arquivo não encontrado: ${filePath}`);
      }
    }
  }

  /**
   * Extrai apenas informações básicas (mais rápido)
   */
  async extractBasicInfo(filePath) {
    try {
      const stats = await fs.stat(filePath);
      
      // Comando mais simples para informações básicas
      const command = `"${this.ffprobePath}" -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`;
      
      const { stdout } = await execAsync(command);
      const duration = parseFloat(stdout.trim()) || 0;
      
      return {
        fileSize: stats.size,
        duration: duration,
        durationFormatted: this.formatDuration(duration),
        segments: this.calculateSegments(duration)
      };
      
    } catch (error) {
      logger.error(`Erro ao extrair informações básicas de ${filePath}:`, error);
      
      // Fallback para informações do arquivo apenas
      try {
        const stats = await fs.stat(filePath);
        return {
          fileSize: stats.size,
          duration: 0,
          durationFormatted: '00:00:00',
          segments: 0
        };
      } catch (statError) {
        throw new Error(`Arquivo não encontrado: ${filePath}`);
      }
    }
  }

  /**
   * Formata duração em segundos para HH:MM:SS
   */
  formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '00:00:00';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Formata tamanho do arquivo
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Calcula número de segmentos baseado na duração
   */
  calculateSegments(duration) {
    if (!duration || duration <= 0) return 0;
    
    // Assumir segmentos de 10 segundos (padrão HLS)
    const segmentDuration = 10;
    return Math.ceil(duration / segmentDuration);
  }

  /**
   * Parse frame rate de string para número
   */
  parseFrameRate(frameRateString) {
    if (!frameRateString) return 0;
    
    try {
      // Frame rate pode vir como "30/1" ou "29.97"
      if (frameRateString.includes('/')) {
        const [num, den] = frameRateString.split('/');
        return parseFloat(num) / parseFloat(den);
      }
      return parseFloat(frameRateString);
    } catch (error) {
      return 0;
    }
  }

  /**
   * Verifica se ffprobe está disponível
   */
  async checkFFProbeAvailability() {
    try {
      const { stdout } = await execAsync(`"${this.ffprobePath}" -version`);
      logger.info('FFProbe disponível:', stdout.split('\n')[0]);
      return true;
    } catch (error) {
      logger.warn('FFProbe não encontrado. Metadados de vídeo serão limitados.');
      return false;
    }
  }
}

export default new VideoMetadataExtractor();