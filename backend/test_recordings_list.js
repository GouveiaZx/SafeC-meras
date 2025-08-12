// Node 18+ possui fetch nativo - removido: import fetch from 'node-fetch';

const BACKEND_URL = 'http://localhost:3002';

async function testRecordingsAPI() {
  try {
    console.log('🔐 Fazendo login...');
    
    // Login
    const loginResponse = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'gouveiarx@gmail.com',
        password: 'Teste123'
      })
    });
    
    const loginData = await loginResponse.json();
    console.log('Resposta do login:', JSON.stringify(loginData, null, 2));
    
    if (!loginData.tokens || !loginData.tokens.accessToken) {
      throw new Error('Falha no login: ' + (loginData.message || 'Token não encontrado'));
    }
    
    const token = loginData.tokens?.accessToken || loginData.data?.token;
    console.log('✅ Login realizado com sucesso');
    console.log('Token extraído:', token ? 'Sim' : 'Não');
    
    // Testar API /api/recordings
    console.log('\n📋 Testando API /api/recordings...');
    const recordingsResponse = await fetch(`${BACKEND_URL}/api/recordings`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Status:', recordingsResponse.status);
    const recordingsData = await recordingsResponse.json();
    console.log('Resposta:', JSON.stringify(recordingsData, null, 2));
    
    if (recordingsData.success && recordingsData.data) {
      console.log(`\n✅ Encontradas ${recordingsData.data.length} gravações`);
      recordingsData.data.forEach((recording, index) => {
        console.log(`${index + 1}. ID: ${recording.id}`);
        console.log(`   Câmera: ${recording.camera_id}`);
        console.log(`   Status: ${recording.status}`);
        console.log(`   Criado em: ${recording.created_at}`);
        console.log(`   Duração: ${recording.duration}s`);
        console.log(`   Tamanho: ${recording.file_size} bytes`);
        console.log('---');
      });
    } else {
      console.log('❌ Nenhuma gravação encontrada ou erro na resposta');
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

testRecordingsAPI();