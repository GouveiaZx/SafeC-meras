const axios = require('axios');

// Teste da API de câmeras
async function testCamerasAPI() {
  try {
    console.log('Testando API de câmeras...');
    
    // Teste sem autenticação
    const response = await axios.get('http://localhost:3002/api/cameras');
    console.log('Status:', response.status);
    console.log('Câmeras encontradas:', response.data.length);
    console.log('Dados:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('Erro na API:', error.response?.status, error.response?.data || error.message);
  }
}

testCamerasAPI();