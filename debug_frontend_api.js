const axios = require('axios');

async function debugFrontendAPI() {
  try {
    console.log('🔍 [DEBUG] Testando API diretamente...');
    
    // Primeiro, fazer login para obter token
    const loginResponse = await axios.post('http://localhost:3002/api/auth/login', {
      email: 'admin@newcam.com',
      password: 'admin123'
    });
    
    const token = loginResponse.data.tokens?.accessToken;
    console.log('✅ [DEBUG] Token obtido:', token ? token.substring(0, 20) + '...' : 'UNDEFINED');
    
    if (!token) {
      console.error('❌ [DEBUG] Token não encontrado na resposta de login');
      console.log('📡 [DEBUG] Login response:', JSON.stringify(loginResponse.data, null, 2));
      return;
    }
    
    // Fazer requisição para gravações
    const recordingsResponse = await axios.get('http://localhost:3002/api/recordings', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('📡 [DEBUG] Response status:', recordingsResponse.status);
    console.log('📡 [DEBUG] Response headers:', recordingsResponse.headers);
    console.log('📡 [DEBUG] Response data:', JSON.stringify(recordingsResponse.data, null, 2));
    
    if (recordingsResponse.data.success && recordingsResponse.data.data) {
      console.log('✅ [DEBUG] API retornou', recordingsResponse.data.data.length, 'gravações');
      
      recordingsResponse.data.data.forEach((recording, index) => {
        console.log(`📹 [DEBUG] Gravação ${index + 1}:`, {
          id: recording.id,
          camera_id: recording.camera_id,
          filename: recording.filename,
          status: recording.status,
          cameras: recording.cameras
        });
      });
    } else {
      console.log('❌ [DEBUG] API não retornou dados válidos');
    }
    
  } catch (error) {
    console.error('💥 [DEBUG] Erro:', error.message);
    if (error.response) {
      console.error('💥 [DEBUG] Response data:', error.response.data);
      console.error('💥 [DEBUG] Response status:', error.response.status);
    }
  }
}

debugFrontendAPI();