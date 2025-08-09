import fetch from 'node-fetch';
import logger from './src/utils/logger.js';

// Simular webhook on_record_mp4 para debug
async function testWebhookDebug() {
  try {
    // Dados simulando um webhook real do ZLMediaKit
    const uniqueTimestamp = Date.now();
    const webhookData = {
      start_time: Math.floor(Date.now() / 1000) - 600, // 10 minutos atrás
      file_size: 16048540,
      time_len: 615.192,
      file_path: `live/e4c3adb3-bc1a-4ed6-a92d-cb5f23a27e36/2025-08-08/test-recording-${uniqueTimestamp}.mp4`,
      file_name: `test-recording-${uniqueTimestamp}.mp4`,
      folder: 'live/e4c3adb3-bc1a-4ed6-a92d-cb5f23a27e36/2025-08-08',
      url: `record/live/e4c3adb3-bc1a-4ed6-a92d-cb5f23a27e36/2025-08-08/test-recording-${uniqueTimestamp}.mp4`,
      app: 'live',
      stream: 'e4c3adb3-bc1a-4ed6-a92d-cb5f23a27e36'
    };

    logger.info('🧪 [TEST] Enviando webhook simulado:', webhookData);

    const webhookUrl = 'http://localhost:3002/api/webhooks/on_record_mp4';
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(webhookData)
    });

    const result = await response.json();
    logger.info('🧪 [TEST] Resposta do webhook:', result);

    // Aguardar um pouco e verificar se a gravação foi criada
    setTimeout(async () => {
      try {
        const checkResponse = await fetch('http://localhost:3002/api/recordings', {
          headers: {
            'Authorization': 'Bearer test-token' // Token de teste
          }
        });
        
        const recordings = await checkResponse.json();
        logger.info('🧪 [TEST] Gravações após webhook:', {
          total: recordings.data?.length || 0,
          latest: recordings.data?.[0] || null
        });
      } catch (error) {
        logger.error('🧪 [TEST] Erro ao verificar gravações:', error);
      }
    }, 2000);

  } catch (error) {
    logger.error('🧪 [TEST] Erro no teste de webhook:', error);
  }
}

// Executar teste
testWebhookDebug();