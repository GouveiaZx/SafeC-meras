// Script para verificar autenticação no frontend
console.log('🔍 [DEBUG] Verificando autenticação do frontend...');

// Simular o que o frontend faz
const token = 'localStorage_token_aqui'; // Substitua pelo token real

const axios = require('axios');

async function testFrontendAuth() {
  try {
    console.log('📡 [DEBUG] Testando requisição com token do localStorage...');
    
    // Fazer requisição como o frontend faria
    const response = await axios.get('http://localhost:3002/api/recordings', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log('✅ [DEBUG] Resposta da API:', {
      status: response.status,
      dataLength: response.data?.data?.length || 0,
      success: response.data?.success
    });
    
    if (response.data?.data) {
      console.log('📹 [DEBUG] Primeira gravação:', response.data.data[0]);
    }
    
  } catch (error) {
    console.error('❌ [DEBUG] Erro na requisição:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
  }
}

// Primeiro, vamos obter um token válido
async function getValidToken() {
  try {
    const loginResponse = await axios.post('http://localhost:3002/api/auth/login', {
      email: 'admin@newcam.com',
      password: 'admin123'
    });
    
    const token = loginResponse.data.tokens?.accessToken;
    console.log('🔑 [DEBUG] Token obtido:', token ? token.substring(0, 30) + '...' : 'UNDEFINED');
    
    if (token) {
      // Agora testar com o token válido
      const response = await axios.get('http://localhost:3002/api/recordings', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('✅ [DEBUG] Teste com token válido - Status:', response.status);
      console.log('📊 [DEBUG] Dados retornados:', {
        success: response.data?.success,
        recordingsCount: response.data?.data?.length || 0,
        firstRecording: response.data?.data?.[0] ? {
          id: response.data.data[0].id,
          filename: response.data.data[0].filename,
          camera_id: response.data.data[0].camera_id
        } : 'Nenhuma'
      });
    }
    
  } catch (error) {
    console.error('💥 [DEBUG] Erro:', error.message);
    if (error.response) {
      console.error('💥 [DEBUG] Response:', error.response.status, error.response.data);
    }
  }
}

getValidToken();