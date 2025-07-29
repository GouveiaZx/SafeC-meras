/**
 * Script para verificar a configuração específica da câmera que está causando erro 500
 */

import { supabaseAdmin } from '../config/database.js';
import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('CheckSpecificCamera');

const CAMERA_ID = '6dbc956c-c965-4342-b591-4285cc7ab401';

async function checkSpecificCamera() {
  try {
    logger.info(`🔍 Verificando câmera específica: ${CAMERA_ID}`);
    
    // Buscar a câmera específica
    const { data: camera, error } = await supabaseAdmin
      .from('cameras')
      .select('*')
      .eq('id', CAMERA_ID)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        logger.error('❌ Câmera não encontrada no banco de dados');
        return;
      }
      logger.error('❌ Erro ao buscar câmera:', error.message);
      return;
    }
    
    if (!camera) {
      logger.error('❌ Câmera não encontrada');
      return;
    }
    
    logger.info('✅ Câmera encontrada:');
    logger.info(`   ID: ${camera.id}`);
    logger.info(`   Nome: ${camera.name}`);
    logger.info(`   Status: ${camera.status}`);
    logger.info(`   Ativa: ${camera.active}`);
    logger.info(`   IP: ${camera.ip_address}`);
    logger.info(`   RTSP URL: ${camera.rtsp_url || 'NÃO CONFIGURADA ❌'}`);
    logger.info(`   RTMP URL: ${camera.rtmp_url || 'Não configurada'}`);
    logger.info(`   HLS URL: ${camera.hls_url || 'Não configurada'}`);
    logger.info(`   Localização: ${camera.location || 'Não definida'}`);
    logger.info(`   Última visualização: ${camera.last_seen || 'Nunca'}`);
    logger.info(`   Streaming: ${camera.is_streaming ? 'Sim' : 'Não'}`);
    logger.info(`   Gravando: ${camera.is_recording ? 'Sim' : 'Não'}`);
    
    // Verificar se RTSP URL está configurada
    if (!camera.rtsp_url) {
      logger.error('\n❌ PROBLEMA IDENTIFICADO: RTSP URL não está configurada!');
      logger.info('💡 SOLUÇÃO: Configure a URL RTSP da câmera através da interface ou API');
      logger.info('   Exemplo: rtsp://usuario:senha@192.168.1.100:554/stream1');
    } else {
      logger.info('\n✅ RTSP URL configurada corretamente');
      
      // Verificar formato da URL
      if (!camera.rtsp_url.startsWith('rtsp://')) {
        logger.warn('⚠️  AVISO: URL RTSP não parece ter formato válido');
        logger.info('   Formato esperado: rtsp://usuario:senha@ip:porta/caminho');
      }
    }
    
    // Verificar outros campos importantes
    if (!camera.ip_address) {
      logger.warn('⚠️  AVISO: IP da câmera não está configurado');
    }
    
    if (camera.status === 'offline') {
      logger.warn('⚠️  AVISO: Câmera está offline');
    }
    
    if (!camera.active) {
      logger.warn('⚠️  AVISO: Câmera está inativa');
    }
    
  } catch (error) {
    logger.error('❌ Erro ao verificar câmera:', error);
  }
}

// Executar verificação
checkSpecificCamera()
  .then(() => {
    logger.info('\n🏁 Verificação concluída');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('❌ Erro fatal:', error);
    process.exit(1);
  });