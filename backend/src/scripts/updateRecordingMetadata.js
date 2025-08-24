#!/usr/bin/env node

/**
 * Script para atualizar metadados completos das gravações
 * - Remove prefixo de ponto dos filenames
 * - Extrai duração, resolução, codec usando ffprobe
 * - Normaliza caminhos de arquivos
 * - Calcula metadados de vídeo
 */

import { createClient } from '@supabase/supabase-js';
import winston from 'winston';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

// Configurar logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaString = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
      return `${timestamp} [${level.toUpperCase()}] ${message} ${metaString}`;
    })
  ),
  transports: [new winston.transports.Console()]
});

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  logger.error('❌ Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Remove o prefixo de ponto do início de um path/filename
 */
function removeDotPrefix(filePath) {
  if (!filePath) return filePath;
  
  // Se o path termina com um arquivo que começa com ponto, remover apenas do filename
  const parts = filePath.split('/');
  const lastPart = parts[parts.length - 1];
  
  if (lastPart && lastPart.startsWith('.')) {
    parts[parts.length - 1] = lastPart.substring(1);
    return parts.join('/');
  }
  
  return filePath;
}

/**
 * Normalizar path para formato relativo consistente
 */
function normalizePath(filePath) {
  if (!filePath || typeof filePath !== 'string') return null;
  
  // Converter separadores para Unix
  let normalized = filePath.replace(/\\/g, '/');
  
  // Remover prefixos absolutos e manter apenas relativo
  if (normalized.includes('storage/www/record/live')) {
    const index = normalized.indexOf('storage/www/record/live');
    return normalized.substring(index);
  }
  
  // Se já é relativo, manter
  if (normalized.startsWith('storage/') || normalized.startsWith('www/')) {
    return normalized;
  }
  
  // Remover drive letters do Windows
  if (normalized.match(/^[A-Z]:/i)) {
    const parts = normalized.split('/');
    const storageIndex = parts.findIndex(p => p === 'storage');
    if (storageIndex > 0) {
      return parts.slice(storageIndex).join('/');
    }
  }
  
  return normalized;
}

/**
 * Verificar se arquivo existe fisicamente
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extrair metadados de vídeo usando ffprobe
 */
async function extractVideoMetadata(filePath) {
  return new Promise((resolve) => {
    try {
      // Tentar ffprobe via Docker primeiro (mais confiável)
      const relativePath = filePath.replace(process.cwd(), '').replace(/\\/g, '/');
      const dockerPath = `/opt/media/bin/www${relativePath.replace('/storage/www', '')}`;
      
      const ffprobe = spawn('docker', [
        'exec', 'newcam-zlmediakit', 'ffprobe',
        '-v', 'quiet',
        '-show_entries', 'format=duration,size:stream=width,height,r_frame_rate,codec_name,bit_rate',
        '-of', 'json',
        dockerPath
      ]);
      
      let output = '';
      let errorOutput = '';
      
      ffprobe.stdout.on('data', (data) => output += data);
      ffprobe.stderr.on('data', (data) => errorOutput += data);
      
      ffprobe.on('close', (code) => {
        if (code === 0 && output.trim()) {
          try {
            const result = JSON.parse(output.trim());
            const metadata = {
              duration: null,
              width: null,
              height: null,
              resolution: null,
              fps: null,
              codec: 'h264',
              bitrate: null,
              file_size: null
            };
            
            // Extrair duração e tamanho do format
            if (result.format) {
              if (result.format.duration) {
                metadata.duration = Math.round(parseFloat(result.format.duration));
              }
              if (result.format.size) {
                metadata.file_size = parseInt(result.format.size);
              }
            }
            
            // Extrair dados do stream de vídeo
            const videoStream = result.streams?.find(s => s.codec_type === 'video');
            if (videoStream) {
              metadata.width = videoStream.width;
              metadata.height = videoStream.height;
              metadata.resolution = `${videoStream.width}x${videoStream.height}`;
              
              // Mapear codec para valores permitidos
              const codecName = videoStream.codec_name?.toLowerCase();
              if (codecName === 'hevc' || codecName === 'h265') {
                metadata.codec = 'h265';
              } else if (codecName === 'mjpeg') {
                metadata.codec = 'mjpeg';
              } else {
                metadata.codec = 'h264'; // Default
              }
              
              // Calcular FPS
              if (videoStream.r_frame_rate) {
                const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
                if (den && den !== 0) {
                  metadata.fps = Math.round(num / den);
                }
              }
              
              // Bitrate
              if (videoStream.bit_rate) {
                metadata.bitrate = Math.round(parseInt(videoStream.bit_rate) / 1000); // kbps
              }
            }
            
            resolve({ success: true, metadata, output });
          } catch (parseError) {
            resolve({ success: false, error: `Parse error: ${parseError.message}`, output, errorOutput });
          }
        } else {
          resolve({ success: false, error: `FFprobe failed (code ${code})`, output, errorOutput });
        }
      });
      
      ffprobe.on('error', (error) => {
        resolve({ success: false, error: error.message, output, errorOutput });
      });
      
    } catch (error) {
      resolve({ success: false, error: error.message });
    }
  });
}

/**
 * Encontrar arquivo físico em múltiplos locais possíveis
 */
async function findPhysicalFile(recording) {
  const possiblePaths = [];
  const basePath = process.cwd();
  
  // Extrair data do nome do arquivo para busca
  const dateMatch = recording.filename?.match(/(\d{4}-\d{2}-\d{2})/);
  const dateFolder = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0];
  
  // Variações de nome de arquivo
  const fileNameVariations = [
    recording.filename,
    recording.filename?.startsWith('.') ? recording.filename.substring(1) : `.${recording.filename}`,
    recording.filename?.replace(/^\.*/, '') // Remove todos os pontos do início
  ].filter(Boolean);
  
  for (const fileName of fileNameVariations) {
    possiblePaths.push(
      // Caminhos principais da raiz do projeto
      path.join(basePath, 'storage/www/record/live', recording.camera_id, dateFolder, fileName),
      path.join(basePath, 'storage/www/record/live', recording.camera_id, fileName),
      // Caminhos alternativos
      path.join(basePath, '../storage/www/record/live', recording.camera_id, dateFolder, fileName),
      path.join(basePath, '../storage/www/record/live', recording.camera_id, fileName)
    );
  }
  
  // Testar cada path possível
  for (const testPath of possiblePaths) {
    if (await fileExists(testPath)) {
      return testPath;
    }
  }
  
  return null;
}

/**
 * Atualizar recordings com metadados completos
 */
async function updateRecordingMetadata() {
  try {
    logger.info('🔍 Buscando recordings que precisam de atualização de metadados...');
    
    // Buscar todas as gravações que precisam de atualização:
    // - Filename começa com ponto OU
    // - Não tem duração OU
    // - Não tem resolução OU
    // - Paths não normalizados
    const { data: recordings, error: fetchError } = await supabase
      .from('recordings')
      .select('id, filename, file_path, local_path, camera_id, duration, width, height, resolution, codec, fps, bitrate, file_size, created_at')
      .or('filename.ilike(.%),duration.is.null,resolution.is.null,width.is.null,file_path.like(%C:\\%),file_path.like(%\\\\%)');
      
    if (fetchError) {
      logger.error('❌ Erro ao buscar recordings:', fetchError);
      return false;
    }
    
    if (!recordings || recordings.length === 0) {
      logger.info('✅ Nenhuma recording precisa de atualização de metadados');
      return true;
    }
    
    logger.info(`📊 Encontradas ${recordings.length} recordings para corrigir`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const recording of recordings) {
      try {
        logger.info(`🔧 Processando recording ${recording.id}...`);
        
        // 1. Limpar filename e paths
        const originalFilename = recording.filename || '';
        const originalFilePath = recording.file_path || '';
        const originalLocalPath = recording.local_path || '';
        
        const cleanFilename = originalFilename.startsWith('.') ? originalFilename.substring(1) : originalFilename;
        const cleanFilePath = normalizePath(removeDotPrefix(originalFilePath));
        const cleanLocalPath = normalizePath(removeDotPrefix(originalLocalPath));
        
        // 2. Encontrar arquivo físico
        const physicalFilePath = await findPhysicalFile({ ...recording, filename: cleanFilename });
        
        if (!physicalFilePath) {
          logger.warn(`⚠️ Arquivo físico não encontrado para recording ${recording.id}: ${cleanFilename}`);
        }
        
        // 3. Extrair metadados via ffprobe (se arquivo existe)
        let videoMetadata = null;
        if (physicalFilePath) {
          logger.info(`📹 Extraindo metadados de: ${physicalFilePath}`);
          const metadataResult = await extractVideoMetadata(physicalFilePath);
          
          if (metadataResult.success) {
            videoMetadata = metadataResult.metadata;
            logger.info(`✅ Metadados extraídos:`, {
              duration: videoMetadata.duration,
              resolution: videoMetadata.resolution,
              codec: videoMetadata.codec,
              fps: videoMetadata.fps,
              file_size: videoMetadata.file_size
            });
          } else {
            logger.warn(`⚠️ Falha ao extrair metadados: ${metadataResult.error}`);
          }
        }
        
        // 4. Preparar dados para atualização
        const updateData = {
          filename: cleanFilename,
          file_path: cleanFilePath,
          local_path: cleanLocalPath,
          updated_at: new Date().toISOString()
        };
        
        // Adicionar metadados de vídeo se extraídos com sucesso
        if (videoMetadata) {
          if (videoMetadata.duration && !recording.duration) {
            updateData.duration = videoMetadata.duration;
          }
          if (videoMetadata.width && !recording.width) {
            updateData.width = videoMetadata.width;
            updateData.height = videoMetadata.height;
            updateData.resolution = videoMetadata.resolution;
          }
          if (videoMetadata.codec && (!recording.codec || recording.codec === 'h264')) {
            updateData.codec = videoMetadata.codec;
          }
          if (videoMetadata.fps && !recording.fps) {
            updateData.fps = videoMetadata.fps;
          }
          if (videoMetadata.bitrate && !recording.bitrate) {
            updateData.bitrate = videoMetadata.bitrate;
          }
          if (videoMetadata.file_size && !recording.file_size) {
            updateData.file_size = videoMetadata.file_size;
          }
          
          // Determinar qualidade baseada no bitrate
          if (videoMetadata.bitrate) {
            if (videoMetadata.bitrate > 3000) {
              updateData.quality = 'high';
            } else if (videoMetadata.bitrate > 1500) {
              updateData.quality = 'medium';
            } else {
              updateData.quality = 'low';
            }
          }
        }
        
        logger.info(`🔧 Dados para atualização:`, {
          id: recording.id,
          changes: Object.keys(updateData).filter(key => key !== 'updated_at'),
          original_filename: originalFilename,
          clean_filename: cleanFilename,
          has_metadata: !!videoMetadata
        });
        
        // 5. Atualizar no banco de dados
        const { error: updateError } = await supabase
          .from('recordings')
          .update(updateData)
          .eq('id', recording.id);
          
        if (updateError) {
          logger.error(`❌ Erro ao atualizar recording ${recording.id}:`, updateError);
          errorCount++;
        } else {
          logger.info(`✅ Recording ${recording.id} atualizada com sucesso`);
          successCount++;
        }
        
      } catch (recordingError) {
        logger.error(`❌ Erro ao processar recording ${recording.id}:`, recordingError);
        errorCount++;
      }
    }
    
    logger.info('📊 RESUMO DA EXECUÇÃO:', {
      total: recordings.length,
      sucesso: successCount,
      erro: errorCount
    });
    
    return errorCount === 0;
    
  } catch (error) {
    logger.error('❌ Erro geral no script:', error);
    return false;
  }
}

/**
 * Verificar resultados após a atualização
 */
async function verifyRecordings() {
  try {
    logger.info('🔍 Verificando recordings após atualização...');
    
    // Estatísticas gerais
    const { data: totalRecordings } = await supabase
      .from('recordings')
      .select('id', { count: 'exact' });
    
    // Recordings com filename iniciado por ponto
    const { data: stillWithDot } = await supabase
      .from('recordings')
      .select('id, filename')
      .ilike('filename', '.%');
    
    // Recordings sem duração
    const { data: withoutDuration } = await supabase
      .from('recordings')
      .select('id', { count: 'exact' })
      .is('duration', null);
      
    // Recordings sem resolução
    const { data: withoutResolution } = await supabase
      .from('recordings')
      .select('id', { count: 'exact' })
      .is('resolution', null);
    
    // Recordings com paths não normalizados
    const { data: unnormalizedPaths } = await supabase
      .from('recordings')
      .select('id', { count: 'exact' })
      .or('file_path.like(%C:\\%),file_path.like(%\\\\%)');
    
    const stats = {
      total: totalRecordings?.length || 0,
      with_dot_prefix: stillWithDot?.length || 0,
      without_duration: withoutDuration?.length || 0,
      without_resolution: withoutResolution?.length || 0,
      unnormalized_paths: unnormalizedPaths?.length || 0
    };
    
    logger.info('📊 ESTATÍSTICAS PÓS-ATUALIZAÇÃO:', stats);
    
    if (stillWithDot && stillWithDot.length > 0) {
      logger.warn(`⚠️ Ainda existem ${stillWithDot.length} recordings com filename iniciado por ponto`);
    }
    
    const hasIssues = stats.with_dot_prefix > 0 || stats.unnormalized_paths > 0;
    
    if (!hasIssues) {
      logger.info('✅ Verificação concluída: todos os problemas críticos foram corrigidos');
    } else {
      logger.warn('⚠️ Ainda existem alguns problemas que precisam de atenção');
    }
    
    return !hasIssues;
    
  } catch (error) {
    logger.error('❌ Erro na verificação:', error);
    return false;
  }
}

/**
 * Script principal
 */
async function main() {
  logger.info('🚀 Iniciando correção de filenames com prefixo de ponto...');
  
  const updateSuccess = await updateRecordingMetadata();
  
  if (!updateSuccess) {
    logger.error('❌ Falha na atualização das recordings');
    process.exit(1);
  }
  
  const verifySuccess = await verifyRecordings();
  
  if (!verifySuccess) {
    logger.error('❌ Falha na verificação pós-correção');
    process.exit(1);
  }
  
  logger.info('🎉 Script concluído com sucesso! Metadados das recordings foram atualizados.');
  process.exit(0);
}

// Executar script
main().catch(error => {
  logger.error('💥 Erro fatal no script:', error);
  process.exit(1);
});