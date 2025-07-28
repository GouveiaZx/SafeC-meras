/**
 * Script para verificar o status das câmeras no banco de dados
 */

import { supabaseAdmin } from '../config/database.js';
import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('CheckCameras');

async function checkCameras() {
  try {
    logger.info('🔍 Verificando status das câmeras...');
    
    // Buscar todas as câmeras
    const { data: cameras, error } = await supabaseAdmin
      .from('cameras')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      logger.error('❌ Erro ao buscar câmeras:', error.message);
      return;
    }
    
    if (!cameras || cameras.length === 0) {
      logger.info('❌ Nenhuma câmera encontrada no banco de dados');
      logger.info('💡 SOLUÇÃO: Adicione câmeras através da interface ou API');
      return;
    }
    
    logger.info(`✅ Encontradas ${cameras.length} câmeras:`);
    
    cameras.forEach((camera, index) => {
      logger.info(`\n📹 Câmera ${index + 1}:`);
      logger.info(`   ID: ${camera.id}`);
      logger.info(`   Nome: ${camera.name}`);
      logger.info(`   Status: ${camera.status}`);
      logger.info(`   Ativa: ${camera.active}`);
      logger.info(`   RTSP URL: ${camera.rtsp_url || 'Não configurada'}`);
      logger.info(`   Localização: ${camera.location || 'Não definida'}`);
      logger.info(`   Última visualização: ${camera.last_seen || 'Nunca'}`);
      logger.info(`   Streaming: ${camera.is_streaming ? 'Sim' : 'Não'}`);
      logger.info(`   Gravando: ${camera.is_recording ? 'Sim' : 'Não'}`);
    });
    
    // Estatísticas
    const onlineCameras = cameras.filter(c => c.status === 'online').length;
    const offlineCameras = cameras.filter(c => c.status === 'offline').length;
    const activeCameras = cameras.filter(c => c.active === true).length;
    const streamingCameras = cameras.filter(c => c.is_streaming === true).length;
    
    logger.info('\n📊 ESTATÍSTICAS:');
    logger.info(`   Total de câmeras: ${cameras.length}`);
    logger.info(`   Câmeras ativas: ${activeCameras}`);
    logger.info(`   Câmeras online: ${onlineCameras}`);
    logger.info(`   Câmeras offline: ${offlineCameras}`);
    logger.info(`   Câmeras transmitindo: ${streamingCameras}`);
    
    if (offlineCameras > 0) {
      logger.info('\n⚠️  PROBLEMAS IDENTIFICADOS:');
      logger.info(`   ${offlineCameras} câmeras estão offline`);
      logger.info('\n💡 PRÓXIMOS PASSOS:');
      logger.info('   1. Verificar se o worker está rodando');
      logger.info('   2. Verificar conectividade com as câmeras');
      logger.info('   3. Verificar configuração do ZLMediaKit/SRS');
      logger.info('   4. Verificar URLs RTSP das câmeras');
    }
    
  } catch (error) {
    logger.error('💥 Erro:', error.message);
  }
}

async function main() {
  try {
    await checkCameras();
    logger.info('\n✅ Verificação concluída!');
    process.exit(0);
  } catch (error) {
    logger.error('💥 Falha na verificação:', error);
    process.exit(1);
  }
}

main();