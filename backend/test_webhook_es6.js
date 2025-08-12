import axios from 'axios';
import path from 'path';
import { promises as fs } from 'fs';

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

  console.log('📤 Enviando webhook com dados:');
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

// Testar com diferentes formatos de caminho
async function testDifferentPathFormats() {
  console.log('\n🔄 Testando diferentes formatos de caminho...\n');

  const testCases = [
    {
      name: 'Caminho completo do container',
      file_path: '/opt/media/bin/www/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/2025-08-10/2025-08-10-11-11-33-0.mp4',
      file_name: '2025-08-10-11-11-33-0.mp4'
    },
    {
      name: 'Caminho relativo',
      file_path: '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/2025-08-10/2025-08-10-11-11-33-0.mp4',
      file_name: '2025-08-10-11-11-33-0.mp4'
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n📂 Testando: ${testCase.name}`);
    
    const webhookData = {
      start_time: 1754836430,
      file_size: 101155463,
      time_len: 1800,
      file_path: testCase.file_path,
      file_name: testCase.file_name,
      folder: 'live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/2025-08-10',
      url: testCase.file_path || testCase.file_name,
      app: 'live',
      stream: '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd'
    };

    try {
      const response = await axios.post(WEBHOOK_URL, webhookData);
      console.log(`   ✅ Resultado: ${JSON.stringify(response.data)}`);
    } catch (error) {
      console.log(`   ❌ Erro: ${error.response?.data?.msg || error.message}`);
    }

    // Pequena pausa entre testes
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// Executar testes
async function runTests() {
  await testWebhookWithRealPath();
  await testDifferentPathFormats();
}

runTests().catch(console.error);