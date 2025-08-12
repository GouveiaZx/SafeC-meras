const axios = require('axios');

// Configuração
const WEBHOOK_URL = 'http://localhost:3002/api/webhooks/on_record_mp4';

// Teste com caminho real corrigido
async function testWebhook() {
  console.log('🧪 Testando webhook com caminho corrigido...\n');

  const testData = {
    start_time: 1754836430,
    file_size: 101155463,
    time_len: 1800,
    file_path: '/opt/media/bin/www/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/2025-08-10/2025-08-10-11-11-33-0.mp4',
    file_name: '2025-08-10-11-11-33-0.mp4',
    folder: 'live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/2025-08-10',
    url: '/opt/media/bin/www/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/2025-08-10/2025-08-10-11-11-33-0.mp4',
    app: 'live',
    stream: '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd'
  };

  console.log('📤 Enviando dados para webhook:');
  console.log(JSON.stringify(testData, null, 2));

  try {
    const response = await axios.post(WEBHOOK_URL, testData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('\n✅ Webhook executado com sucesso!');
    console.log('Resposta:', response.data);

    // Verificar se a gravação foi criada no banco
    if (response.data.code === 0) {
      console.log('\n🎉 Gravação processada com sucesso!');
      console.log('Ação:', response.data.action);
      console.log('ID da gravação:', response.data.recordingId);
    }

  } catch (error) {
    console.error('\n❌ Erro ao chamar webhook:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Resposta:', error.response.data);
    } else {
      console.error('Erro:', error.message);
    }
  }
}

// Executar teste
testWebhook();