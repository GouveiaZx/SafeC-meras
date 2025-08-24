/**
 * Script para mover arquivos da pasta "processed" de volta para as pastas corretas
 * e atualizar os paths no banco de dados
 */

import { promises as fs } from 'fs';
import path from 'path';
import { supabaseAdmin } from '../config/database.js';
import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('FixProcessedRecordings');

async function fixProcessedRecordings() {
  try {
    logger.info('🔧 Iniciando correção de gravações processadas...');
    
    // Path da pasta processed
    const processedPath = path.join(process.cwd(), '..', 'storage', 'www', 'record', 'live', 'processed');
    
    // Verificar se a pasta processed existe
    try {
      await fs.access(processedPath);
    } catch (error) {
      logger.info('✅ Pasta "processed" não existe. Nada para corrigir.');
      return;
    }
    
    // Listar arquivos na pasta processed
    const files = await fs.readdir(processedPath);
    const mp4Files = files.filter(f => f.endsWith('.mp4'));
    
    if (mp4Files.length === 0) {
      logger.info('✅ Nenhum arquivo MP4 na pasta processed.');
      return;
    }
    
    logger.info(`📁 Encontrados ${mp4Files.length} arquivos MP4 para processar`);
    
    // Processar cada arquivo
    for (const filename of mp4Files) {
      try {
        logger.info(`\n📹 Processando: ${filename}`);
        
        // Remover ponto inicial se houver
        const cleanFilename = filename.startsWith('.') ? filename.substring(1) : filename;
        
        // Extrair informações do filename (formato: YYYY-MM-DD-HH-MM-SS-N.mp4)
        const match = cleanFilename.match(/^(\d{4}-\d{2}-\d{2})-(\d{2}-\d{2}-\d{2})-\d+\.mp4$/);
        if (!match) {
          logger.warn(`⚠️ Formato de nome não reconhecido: ${filename}`);
          continue;
        }
        
        const dateStr = match[1]; // YYYY-MM-DD
        
        // Buscar gravação no banco pelo filename
        const { data: recordings, error: searchError } = await supabaseAdmin
          .from('recordings')
          .select('*')
          .or(`filename.eq.${filename},filename.eq.${cleanFilename}`)
          .order('created_at', { ascending: false });
        
        if (searchError) {
          logger.error(`❌ Erro ao buscar gravação: ${searchError.message}`);
          continue;
        }
        
        if (!recordings || recordings.length === 0) {
          logger.warn(`⚠️ Gravação não encontrada no banco: ${filename}`);
          continue;
        }
        
        const recording = recordings[0];
        logger.info(`✅ Gravação encontrada: ${recording.id} (camera: ${recording.camera_id})`);
        
        // Definir novo caminho
        const newDir = path.join(process.cwd(), '..', 'storage', 'www', 'record', 'live', 
          recording.camera_id, dateStr);
        const oldPath = path.join(processedPath, filename);
        const newPath = path.join(newDir, cleanFilename);
        
        // Criar diretório se não existir
        await fs.mkdir(newDir, { recursive: true });
        
        // Mover arquivo
        logger.info(`📦 Movendo arquivo:`);
        logger.info(`   De: ${oldPath}`);
        logger.info(`   Para: ${newPath}`);
        
        await fs.rename(oldPath, newPath);
        logger.info(`✅ Arquivo movido com sucesso`);
        
        // Atualizar banco de dados
        const relativePath = `storage/www/record/live/${recording.camera_id}/${dateStr}/${cleanFilename}`;
        
        const { error: updateError } = await supabaseAdmin
          .from('recordings')
          .update({
            filename: cleanFilename,
            file_path: relativePath,
            local_path: relativePath,
            upload_status: recording.upload_status === 'failed' ? 'pending' : recording.upload_status,
            upload_error_code: null,
            error_message: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', recording.id);
        
        if (updateError) {
          logger.error(`❌ Erro ao atualizar banco: ${updateError.message}`);
          // Reverter movimento do arquivo
          await fs.rename(newPath, oldPath);
          continue;
        }
        
        logger.info(`✅ Banco atualizado com novo path: ${relativePath}`);
        
        // Re-enfileirar para upload se necessário
        if (recording.upload_status !== 'uploaded' && recording.s3_key === null) {
          const { error: queueError } = await supabaseAdmin
            .from('recordings')
            .update({
              upload_status: 'queued',
              upload_attempts: 0
            })
            .eq('id', recording.id);
          
          if (!queueError) {
            logger.info(`📤 Gravação re-enfileirada para upload`);
          }
        }
        
      } catch (error) {
        logger.error(`❌ Erro ao processar ${filename}:`, error);
      }
    }
    
    // Verificar se a pasta processed está vazia e removê-la
    const remainingFiles = await fs.readdir(processedPath);
    if (remainingFiles.length === 0) {
      await fs.rmdir(processedPath);
      logger.info(`\n🗑️ Pasta "processed" vazia removida`);
    }
    
    logger.info(`\n✅ Correção de gravações concluída!`);
    
  } catch (error) {
    logger.error('❌ Erro geral no script:', error);
    process.exit(1);
  }
}

// Executar
fixProcessedRecordings().then(() => {
  logger.info('🎉 Script finalizado com sucesso');
  process.exit(0);
}).catch(error => {
  logger.error('💥 Script falhou:', error);
  process.exit(1);
});