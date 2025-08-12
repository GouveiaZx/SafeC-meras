const axios = require('axios');
const path = require('path');
const fs = require('fs');

// Configuração
const WEBHOOK_URL = 'http://localhost:3002/api/webhooks/on_record_mp4';

// Função para testar webhook com caminho real
async function testWebhookWithRealPath() {
  console.log('🧪 Testando webhook com caminho REAL...\n');

  // Dados do webhook com caminho real do arquivo que existe
  const webhookData = {
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

  console.log('📤 Enviando webhook com dados reais:');
  console.log(JSON.stringify(webhookData, null, 2));
  console.log('\n');

  try {
    const response = await axios.post(WEBHOOK_URL, webhookData);
    console.log('✅ Resposta do webhook:', response.data);

    // Verificar se a gravação foi criada no banco
    setTimeout(async () => {
      try {
        const { data } = await axios.get('http://localhost:3002/api/recordings');
        console.log('\n📊 Total de gravações:', data.length);
        
        // Mostrar últimas 3 gravações
        const lastRecordings = data.slice(-3);
        lastRecordings.forEach(rec => {
          console.log(`- ID: ${rec.id} | Câmera: ${rec.camera_id} | Arquivo: ${rec.file_path}`);
        });
      } catch (dbError) {
        console.log('❌ Erro ao verificar banco:', dbError.message);
      }
    }, 3000);

  } catch (error) {
    console.error('❌ Erro ao chamar webhook:', error.response?.data || error.message);
  }
}

// Testar com caminho simplificado
async function testWithSimplePath() {
  console.log('\n🔄 Testando com caminho simplificado...\n');

  const webhookData = {
    start_time: 1754836430,
    file_size: 101155463,
    time_len: 1800,
    file_path: '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/2025-08-10/2025-08-10-11-11-33-0.mp4',
    file_name: '2025-08-10-11-11-33-0.mp4',
    folder: 'live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/2025-08-10',
    url: '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/2025-08-10/2025-08-10-11-11-33-0.mp4',
    app: 'live',
    stream: '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd'
  };

  console.log('📤 Enviando webhook com caminho simplificado:');
  console.log(JSON.stringify(webhookData, null, 2));
  console.log('\n');

  try {
    const response = await axios.post(WEBHOOK_URL, webhookData);
    console.log('✅ Resposta do webhook:', response.data);
  } catch (error) {
    console.error('❌ Erro ao chamar webhook:', error.response?.data || error.message);
  }
}

// Verificar se o arquivo existe no caminho esperado
function verifyFilePath() {
  const expectedPath = path.join(process.cwd(), 'storage', 'www', 'record', 'live', '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd', 'record', 'live', '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd', '2025-08-10', '2025-08-10-11-11-33-0.mp4');
  
  console.log('\n📂 Verificando arquivo no caminho esperado:');
  console.log('Expected path:', expectedPath);
  console.log('CWD:', process.cwd());
  console.log('File exists:', fs.existsSync(expectedPath));
  
  if (fs.existsSync(expectedPath)) {
    const stats = fs.statSync(expectedPath);
    console.log('File size:', stats.size);
  }
}

// Executar testes
async function runTests() {
  verifyFilePath();
  await testWebhookWithRealPath();
  await testWithSimplePath();
}

runTests().catch(console.error);