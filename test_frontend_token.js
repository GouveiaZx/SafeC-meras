const axios = require('axios');

// Teste usando o token do frontend
async function testWithFrontendToken() {
  console.log('🔍 Testando com token do frontend...');
  
  // Token que vi nos logs do backend (mais recente)
  const frontendToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwODA4YzI3ZS1hYjhjLTQ1NGEtYjdhNC0wYWVkNjI5YzJhYWMiLCJlbWFpbCI6ImdvdXZlaWFyeEBnbWFpbC5jb20iLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3NTM3ODM1MDMsImV4cCI6MTc1NDM4ODMwM30.iFTa-MWGzesQEUVo6sSSCRvlpx9z0DFhq1Kg8zT6SKw';
  
  // Payload exatamente como o frontend envia
  const cameraData = {
    name: 'Teste Frontend Token',
    type: 'ip',
    stream_type: 'rtmp',
    rtmp_url: 'rtmp://localhost:1935/live/frontend-test'
  };
  
  console.log('📤 Payload:', JSON.stringify(cameraData, null, 2));
  console.log('🔑 Token:', frontendToken.substring(0, 50) + '...');
  
  try {
    const response = await axios.post('http://localhost:3002/api/cameras', cameraData, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${frontendToken}`
      }
    });
    
    console.log('✅ Sucesso com token do frontend!');
    console.log('Resposta:', response.data);
  } catch (error) {
    console.log('❌ Erro com token do frontend:');
    console.log('Status:', error.response?.status);
    console.log('Dados:', JSON.stringify(error.response?.data, null, 2));
    
    // Verificar se é problema de token expirado
    if (error.response?.status === 401) {
      console.log('🚨 Token expirado ou inválido!');
    }
  }
}

// Executar teste
testWithFrontendToken().catch(console.error);