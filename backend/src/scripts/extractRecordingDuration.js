/**
 * Script para extrair duração de uma gravação específica e atualizar no banco
 */

import { createClient } from '@supabase/supabase-js';
import VideoMetadataExtractor from '../utils/videoMetadata.js';
import PathResolver from '../utils/PathResolver.js';
import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('ExtractRecordingDuration');

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

/**
 * Extrai duração de uma gravação específica
 */
async function extractDurationForRecording(recordingId) {
  try {
    console.log(`🎬 Extraindo duração para gravação: ${recordingId}`);
    
    // 1. Buscar gravação no banco
    const { data: recording, error: fetchError } = await supabase
      .from('recordings')
      .select('*')
      .eq('id', recordingId)
      .single();
    
    if (fetchError) {
      throw new Error(`Erro ao buscar gravação: ${fetchError.message}`);
    }
    
    if (!recording) {
      throw new Error(`Gravação não encontrada: ${recordingId}`);
    }
    
    console.log(`📁 Gravação encontrada: ${recording.filename}`);
    console.log(`📊 Status atual: ${recording.status}, Upload: ${recording.upload_status}`);
    console.log(`⏱️ Duração atual: ${recording.duration || 'null'}`);
    
    // 2. Encontrar arquivo físico
    console.log(`🔍 Procurando arquivo físico...`);
    const fileInfo = await PathResolver.findRecordingFile(recording);
    
    if (!fileInfo || !fileInfo.exists) {
      throw new Error(`Arquivo físico não encontrado para gravação ${recordingId}`);
    }
    
    console.log(`✅ Arquivo encontrado: ${fileInfo.absolutePath}`);
    console.log(`📏 Tamanho: ${(fileInfo.size / 1024 / 1024).toFixed(2)} MB`);
    
    // 3. Extrair metadados de vídeo
    console.log(`🎥 Extraindo metadados de vídeo...`);
    const metadata = await VideoMetadataExtractor.extractBasicInfo(fileInfo.absolutePath);
    
    console.log(`📊 Metadados extraídos:`);
    console.log(`  - Duração: ${metadata.duration} segundos (${metadata.durationFormatted})`);
    console.log(`  - Tamanho: ${metadata.fileSize} bytes`);
    console.log(`  - Segmentos: ${metadata.segments}`);
    
    // 4. Atualizar banco de dados
    if (metadata.duration > 0) {
      console.log(`💾 Atualizando duração no banco de dados...`);
      
      const { error: updateError } = await supabase
        .from('recordings')
        .update({
          duration: Math.round(metadata.duration),
          file_size: metadata.fileSize,
          updated_at: new Date().toISOString()
        })
        .eq('id', recordingId);
      
      if (updateError) {
        throw new Error(`Erro ao atualizar banco: ${updateError.message}`);
      }
      
      console.log(`✅ Duração atualizada com sucesso: ${Math.round(metadata.duration)} segundos`);
      
      // 5. Verificar atualização
      const { data: updatedRecording } = await supabase
        .from('recordings')
        .select('duration, file_size')
        .eq('id', recordingId)
        .single();
      
      console.log(`🔍 Verificação final:`);
      console.log(`  - Duração no banco: ${updatedRecording?.duration} segundos`);
      console.log(`  - Tamanho no banco: ${updatedRecording?.file_size} bytes`);
      
    } else {
      console.log(`⚠️ Duração é 0 ou inválida, não atualizando banco`);
    }
    
    return {
      success: true,
      recordingId,
      filename: recording.filename,
      duration: metadata.duration,
      durationFormatted: metadata.durationFormatted,
      fileSize: metadata.fileSize,
      filePath: fileInfo.absolutePath
    };
    
  } catch (error) {
    console.error(`❌ Erro ao extrair duração:`, error.message);
    return {
      success: false,
      recordingId,
      error: error.message
    };
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  const recordingId = process.argv[2];
  
  if (!recordingId) {
    console.log(`
📝 Uso: node extractRecordingDuration.js <recording-id>

Exemplo:
SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=eyJ... node extractRecordingDuration.js 49414803-1d95-44d8-86d6-437ba91f8464
`);
    process.exit(1);
  }
  
  extractDurationForRecording(recordingId)
    .then(result => {
      if (result.success) {
        console.log(`\n🎉 Sucesso! Duração extraída e atualizada:`);
        console.log(`   Arquivo: ${result.filename}`);
        console.log(`   Duração: ${result.durationFormatted} (${result.duration}s)`);
        console.log(`   Tamanho: ${(result.fileSize / 1024 / 1024).toFixed(2)} MB`);
      } else {
        console.log(`\n💥 Falha: ${result.error}`);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error(`\n💥 Erro fatal:`, error);
      process.exit(1);
    });
}

export { extractDurationForRecording };