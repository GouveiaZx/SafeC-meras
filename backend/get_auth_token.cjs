const axios = require('axios');
require('dotenv').config();

const API_BASE = 'http://localhost:3002/api';

async function getAuthToken() {
  try {
    console.log('🔐 Fazendo login para obter token...');
    
    const response = await axios.post(`${API_BASE}/auth/login`, {
      email: 'test@recording.com',
      password: 'test123'
    });
    
    console.log('📋 Resposta completa do login:', JSON.stringify(response.data, null, 2));
    
    if (response.data.tokens && response.data.tokens.accessToken) {
      const token = response.data.tokens.accessToken;
      console.log('✅ Token obtido com sucesso:');
      console.log(token);
      return token;
    } else {
      console.error('❌ Falha no login - token não encontrado');
    }
    
  } catch (error) {
    console.error('❌ Erro ao fazer login:', error.response?.data || error.message);
  }
}

getAuthToken();