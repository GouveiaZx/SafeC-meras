const axios = require('axios');

// Teste para reproduzir o erro de cadastro de câmera RTMP
async function testRTMPCameraRegistration() {
  console.log('🔍 Iniciando teste de cadastro de câmera RTMP...');
  
  // Dados de teste que simulam EXATAMENTE o payload do frontend
  const cameraData = {
    name: 'Câmera RTMP Teste Frontend',
    type: 'ip',
    stream_type: 'rtmp',
    rtmp_url: 'rtmp://localhost:1935/live/test',
    location: 'Teste Location'
  };
  
  // Teste adicional com payload mínimo
  const cameraDataMinimal = {
    name: 'Câmera RTMP Mínima',
    type: 'ip',
    stream_type: 'rtmp',
    rtmp_url: 'rtmp://localhost:1935/live/minimal'
  };
  
  console.log('🧪 Testando payload completo...');
  await testPayload(cameraData);
  
  console.log('\n🧪 Testando payload mínimo...');
  await testPayload(cameraDataMinimal);
}

async function testPayload(cameraData) {
  
  console.log('📤 Payload enviado:', JSON.stringify(cameraData, null, 2));
  
  try {
    const response = await axios.post('http://localhost:3002/api/cameras', cameraData, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwODA4YzI3ZS1hYjhjLTQ1NGEtYjdhNC0wYWVkNjI5YzJhYWMiLCJlbWFpbCI6ImdvdXZlaWFyeEBnbWFpbC5jb20iLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3NTM3ODA3ODUsImV4cCI6MTc1NDM4NTU4NX0.W6KUvBfs8ZoVG19nBl_Ik_-IVQ4jNdWocgV1wtKS4F4'
      }
    });
    
    console.log('✅ Sucesso! Câmera cadastrada:', response.data);
  } catch (error) {
    console.log('❌ Erro capturado:');
    console.log('Status:', error.response?.status);
    console.log('Dados da resposta:', JSON.stringify(error.response?.data, null, 2));
    console.log('Headers da resposta:', error.response?.headers);
  }
}

// Executar o teste
testRTMPCameraRegistration().catch(console.error);