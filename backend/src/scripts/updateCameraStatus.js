/**
 * Script para atualizar o status das câmeras para 'online'
 * Usado quando o worker não está funcionando
 */

import { supabaseAdmin } from '../config/database.js';
import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('UpdateCameraStatus');

async function updateCameraStatus() {
  try {
    logger.info('Iniciando atualização do status das câmeras...');
    
    // Buscar todas as câmeras ativas
    const { data: cameras, error: fetchError } = await supabaseAdmin
      .from('cameras')
      .select('id, name, status')
      .eq('active', true);
    
    if (fetchError) {
      throw new Error(`Erro ao buscar câmeras: ${fetchError.message}`);
    }
    
    if (!cameras || cameras.length === 0) {
      logger.info('Nenhuma câmera encontrada.');
      return;
    }
    
    logger.info(`Encontradas ${cameras.length} câmeras ativas.`);
    
    // Atualizar status para 'online'
    const { error: updateError } = await supabaseAdmin
      .from('cameras')
      .update({
        status: 'online',
        last_seen: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('active', true);
    
    if (updateError) {
      throw new Error(`Erro ao atualizar status: ${updateError.message}`);
    }
    
    logger.info('Status das câmeras atualizado para \'online\' com sucesso!');
    
    // Mostrar resultado
    cameras.forEach(camera => {
      logger.info(`Câmera: ${camera.name} (${camera.id}) - Status: ${camera.status} -> online`);
    });
    
  } catch (error) {
    logger.error('Erro ao atualizar status das câmeras:', error);
    process.exit(1);
  }
}

// Executar o script
updateCameraStatus()
  .then(() => {
    logger.info('Script executado com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Erro na execução do script:', error);
    process.exit(1);
  });