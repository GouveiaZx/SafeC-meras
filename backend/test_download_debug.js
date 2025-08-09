import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_BASE = 'http://localhost:3002/api';

async function testDownload() {
  try {
    console.log('🔐 Fazendo login...');
    
    // Login
    const loginResponse = await axios.post(`${API_BASE}/auth/login`, {
      email: 'test@recording.com',
      password: 'test123'
    });
    
    const token = loginResponse.data.tokens.accessToken;
    console.log('🔑 Token recebido:', token ? 'Sim' : 'Não');
    
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    
    console.log('✅ Login realizado com sucesso');
    
    // Buscar uma gravação para testar
    console.log('\n📋 Buscando gravações...');
    const recordingsResponse = await axios.get(`${API_BASE}/recordings`, { headers });
    const recordings = recordingsResponse.data.data;
    
    if (recordings.length === 0) {
      console.log('❌ Nenhuma gravação encontrada');
      return;
    }
    
    const recording = recordings[0];
    console.log(`📹 Testando download da gravação: ${recording.id}`);
    console.log(`📝 Filename: ${recording.filename}`);
    console.log(`📁 File path: ${recording.file_path}`);
    console.log(`📊 Status: ${recording.status}`);
    
    // Testar download
    console.log('\n📥 Testando download...');
    try {
      const downloadResponse = await axios.get(`${API_BASE}/recordings/${recording.id}/download`, {
        headers,
        maxRedirects: 0,
        validateStatus: function (status) {
          return status < 500; // Aceitar redirects e erros de cliente
        }
      });
      
      console.log(`📊 Status do download: ${downloadResponse.status}`);
      
      if (downloadResponse.status === 200) {
        console.log('✅ Download funcionou!');
        console.log(`📏 Tamanho do conteúdo: ${downloadResponse.headers['content-length']} bytes`);
      } else if (downloadResponse.status === 302) {
        console.log('🔄 Redirecionamento para S3');
        console.log(`🔗 URL: ${downloadResponse.headers.location}`);
      } else if (downloadResponse.status === 404) {
        console.log('❌ Arquivo não encontrado (404)');
        console.log('📄 Resposta:', downloadResponse.data);
      } else {
        console.log(`⚠️ Status inesperado: ${downloadResponse.status}`);
        console.log('📄 Resposta:', downloadResponse.data);
      }
      
    } catch (error) {
      console.log('❌ Erro no download:', error.response?.data?.message || error.message);
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error.response?.data?.message || error.message);
    console.error('📄 Detalhes do erro:', error.code || 'Sem código');
    if (error.response) {
      console.error('📊 Status:', error.response.status);
      console.error('📄 Data:', error.response.data);
    }
  }
}

testDownload();