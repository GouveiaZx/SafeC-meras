/**
 * Script para testar o cadastro de câmera RTMP
 * Verifica se o problema de validação foi resolvido
 */

const axios = require('axios');

// Configuração da API
const API_BASE_URL = 'http://localhost:3002/api';
const TEST_USER = {
  email: 'admin@newcam.com',
  password: 'admin123'
};

// Dados de teste para câmera RTMP
const TEST_CAMERA_RTMP = {
  name: 'Teste RTMP Camera',
  type: 'ip',
  stream_type: 'rtmp',
  rtmp_url: 'rtmp://connect-301.servicestream.io:1936/stream/974',
  location: 'Teste Location'
};

// Dados de teste para câmera RTSP
const TEST_CAMERA_RTSP = {
  name: 'Teste RTSP Camera',
  type: 'ip',
  stream_type: 'rtsp',
  rtsp_url: 'rtsp://test:test@192.168.1.100:554/stream',
  location: 'Teste Location'
};

async function login() {
  try {
    console.log('🔐 Fazendo login...');
    const response = await axios.post(`${API_BASE_URL}/auth/login`, TEST_USER);
    
    if (response.data && response.data.tokens && response.data.tokens.accessToken) {
      console.log('✅ Login realizado com sucesso');
      return response.data.tokens.accessToken;
    } else {
      throw new Error('Token não encontrado na resposta');
    }
  } catch (error) {
    console.error('❌ Erro no login:', error.response?.data || error.message);
    throw error;
  }
}

async function testCameraRegistration(token, cameraData, testName) {
  try {
    console.log(`\n📹 Testando cadastro de ${testName}...`);
    console.log('Dados enviados:', JSON.stringify(cameraData, null, 2));
    
    const response = await axios.post(`${API_BASE_URL}/cameras`, cameraData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`✅ ${testName} cadastrada com sucesso!`);
    console.log('Resposta:', JSON.stringify(response.data, null, 2));
    
    return response.data.data; // Retorna os dados da câmera criada
  } catch (error) {
    console.error(`❌ Erro ao cadastrar ${testName}:`);
    console.error('Status:', error.response?.status);
    console.error('Dados do erro:', JSON.stringify(error.response?.data, null, 2));
    
    // Se for erro de validação, mostrar detalhes
    if (error.response?.data?.details) {
      console.error('Detalhes da validação:');
      error.response.data.details.forEach((detail, index) => {
        console.error(`  ${index + 1}. Campo '${detail.field}': ${detail.message}`);
      });
    }
    
    throw error;
  }
}

async function deleteCameraIfExists(token, cameraId) {
  try {
    if (cameraId) {
      console.log(`🗑️ Removendo câmera de teste (ID: ${cameraId})...`);
      await axios.delete(`${API_BASE_URL}/cameras/${cameraId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      console.log('✅ Câmera de teste removida com sucesso');
    }
  } catch (error) {
    console.log('⚠️ Erro ao remover câmera de teste (pode não existir):', error.response?.data?.message || error.message);
  }
}

async function runTests() {
  let token = null;
  let rtmpCameraId = null;
  let rtspCameraId = null;
  
  try {
    // 1. Fazer login
    token = await login();
    
    // 2. Testar cadastro de câmera RTMP
    try {
      const rtmpCamera = await testCameraRegistration(token, TEST_CAMERA_RTMP, 'Câmera RTMP');
      rtmpCameraId = rtmpCamera?.id;
    } catch (error) {
      console.log('❌ Teste de câmera RTMP falhou');
    }
    
    // 3. Testar cadastro de câmera RTSP
    try {
      const rtspCamera = await testCameraRegistration(token, TEST_CAMERA_RTSP, 'Câmera RTSP');
      rtspCameraId = rtspCamera?.id;
    } catch (error) {
      console.log('❌ Teste de câmera RTSP falhou');
    }
    
    // 4. Testar validação com dados inválidos
    console.log('\n🧪 Testando validação com dados inválidos...');
    try {
      await testCameraRegistration(token, {
        // name faltando (obrigatório)
        type: 'ip',
        stream_type: 'rtmp'
        // URLs faltando
      }, 'Dados Inválidos');
    } catch (error) {
      console.log('✅ Validação funcionando corretamente - dados inválidos rejeitados');
    }
    
  } catch (error) {
    console.error('❌ Erro geral nos testes:', error.message);
  } finally {
    // Limpeza: remover câmeras de teste
    if (token) {
      await deleteCameraIfExists(token, rtmpCameraId);
      await deleteCameraIfExists(token, rtspCameraId);
    }
  }
}

// Executar testes
console.log('🚀 Iniciando testes de cadastro de câmeras...');
console.log('='.repeat(50));

runTests()
  .then(() => {
    console.log('\n' + '='.repeat(50));
    console.log('✅ Testes concluídos!');
    process.exit(0);
  })
  .catch((error) => {
    console.log('\n' + '='.repeat(50));
    console.error('❌ Testes falharam:', error.message);
    process.exit(1);
  });