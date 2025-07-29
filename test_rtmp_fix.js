/**
 * Script para testar o cadastro de câmera RTMP após correções
 * Verifica se o problema de validação foi resolvido
 */

const axios = require('axios');

// Configuração da API
const API_BASE_URL = 'http://localhost:3002/api';
const TEST_USER = {
  email: 'gouveiarx@gmail.com',
  password: 'Teste123'
};

// Dados de teste para câmera RTMP
const TEST_CAMERA_RTMP = {
  name: 'Teste RTMP Fix',
  type: 'ip',
  stream_type: 'rtmp',
  ip_address: 'connect-301.servicestream.io',
  rtmp_url: 'rtmp://connect-301.servicestream.io:1937/stream/1eb553868c75',
  location: 'Teste Local'
};

async function login() {
  try {
    console.log('🔐 Fazendo login...');
    const response = await axios.post(`${API_BASE_URL}/auth/login`, TEST_USER);
    console.log('✅ Login realizado com sucesso');
    console.log('📋 Resposta completa:', JSON.stringify(response.data, null, 2));
    
    // Tentar diferentes caminhos para o token
    const token = response.data.token || response.data.data?.token || response.data.access_token || response.data.tokens?.accessToken;
    console.log('🔑 Token encontrado:', token ? 'SIM' : 'NÃO');
    
    if (!token) {
      throw new Error('Token não encontrado na resposta do login');
    }
    
    return token;
  } catch (error) {
    console.error('❌ Erro no login:', error.response?.data || error.message);
    throw error;
  }
}

async function createRTMPCamera(token) {
  try {
    console.log('📹 Criando câmera RTMP...');
    console.log('📋 Payload:', JSON.stringify(TEST_CAMERA_RTMP, null, 2));
    
    const response = await axios.post(
      `${API_BASE_URL}/cameras`,
      TEST_CAMERA_RTMP,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Câmera RTMP criada com sucesso!');
    console.log('📋 Resposta:', JSON.stringify(response.data, null, 2));
    return response.data.data.id;
  } catch (error) {
    console.error('❌ Erro ao criar câmera RTMP:');
    console.error('Status:', error.response?.status);
    console.error('Dados:', JSON.stringify(error.response?.data, null, 2));
    throw error;
  }
}

async function runTest() {
  try {
    console.log('🚀 Iniciando teste de cadastro RTMP...');
    console.log('=' .repeat(50));
    
    // 1. Login
    const token = await login();
    
    // 2. Criar câmera RTMP
    const cameraId = await createRTMPCamera(token);
    
    console.log('=' .repeat(50));
    console.log('🎉 Teste concluído com sucesso!');
    console.log(`📹 ID da câmera criada: ${cameraId}`);
    
  } catch (error) {
    console.log('=' .repeat(50));
    console.error('💥 Teste falhou:', error.message);
    process.exit(1);
  }
}

// Executar teste
runTest();