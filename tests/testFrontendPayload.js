const axios = require('axios');

// Configuração da API
const API_BASE_URL = 'http://localhost:3002/api';

// Dados de teste do usuário
const TEST_USER = {
  email: 'admin@newcam.com',
  password: 'admin123'
};

async function testFrontendPayload() {
  try {
    console.log('🔐 Fazendo login...');
    
    // Fazer login
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, TEST_USER);
    
    if (!loginResponse.data.tokens || !loginResponse.data.tokens.accessToken) {
      throw new Error('Token não encontrado na resposta');
    }
    
    const token = loginResponse.data.tokens.accessToken;
    console.log('✅ Login realizado com sucesso');
    
    // Configurar headers para requisições autenticadas
    const authHeaders = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    
    console.log('\n📹 Testando payload exato do frontend...');
    
    // Payload exato como enviado pelo frontend
    const frontendPayload = {
      name: 'Teste RTMP Frontend',
      type: 'ip',
      stream_type: 'rtmp',
      rtmp_url: 'rtmp://test.example.com/live/stream123'
    };
    
    console.log('Payload enviado:', JSON.stringify(frontendPayload, null, 2));
    
    try {
      const response = await axios.post(
        `${API_BASE_URL}/cameras`,
        frontendPayload,
        { headers: authHeaders }
      );
      
      console.log('✅ Câmera RTMP criada com sucesso!');
      console.log('Resposta:', JSON.stringify(response.data, null, 2));
      
      // Limpar - deletar a câmera criada
      if (response.data.data && response.data.data.id) {
        await axios.delete(
          `${API_BASE_URL}/cameras/${response.data.data.id}`,
          { headers: authHeaders }
        );
        console.log('🗑️ Câmera de teste removida');
      }
      
    } catch (error) {
      console.log('❌ Erro ao criar câmera RTMP:');
      console.log('Status:', error.response?.status);
      console.log('Dados do erro:', JSON.stringify(error.response?.data, null, 2));
      
      if (error.response?.data?.details) {
        console.log('\nDetalhes da validação:');
        error.response.data.details.forEach((detail, index) => {
          console.log(`  ${index + 1}. Campo '${detail.field}': ${detail.message}`);
        });
      }
    }
    
    console.log('\n📹 Testando com payload mínimo...');
    
    // Teste com payload mínimo
    const minimalPayload = {
      name: 'Teste Mínimo',
      type: 'ip',
      stream_type: 'rtmp'
    };
    
    console.log('Payload mínimo:', JSON.stringify(minimalPayload, null, 2));
    
    try {
      const response = await axios.post(
        `${API_BASE_URL}/cameras`,
        minimalPayload,
        { headers: authHeaders }
      );
      
      console.log('✅ Câmera mínima criada com sucesso!');
      console.log('Resposta:', JSON.stringify(response.data, null, 2));
      
      // Limpar - deletar a câmera criada
      if (response.data.data && response.data.data.id) {
        await axios.delete(
          `${API_BASE_URL}/cameras/${response.data.data.id}`,
          { headers: authHeaders }
        );
        console.log('🗑️ Câmera de teste removida');
      }
      
    } catch (error) {
      console.log('❌ Erro ao criar câmera mínima:');
      console.log('Status:', error.response?.status);
      console.log('Dados do erro:', JSON.stringify(error.response?.data, null, 2));
      
      if (error.response?.data?.details) {
        console.log('\nDetalhes da validação:');
        error.response.data.details.forEach((detail, index) => {
          console.log(`  ${index + 1}. Campo '${detail.field}': ${detail.message}`);
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Dados:', error.response.data);
    }
  }
}

// Executar teste
testFrontendPayload();