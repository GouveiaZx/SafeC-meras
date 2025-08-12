// Node 18+ possui fetch nativo - removido: import fetch from 'node-fetch';

const BACKEND_URL = 'http://localhost:3002';

async function debugRecordingsStructure() {
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
    const token = loginData.tokens.accessToken;
    console.log('✅ Login realizado com sucesso');
    
    // Testar API /api/recordings
    console.log('\n📋 Testando estrutura da API /api/recordings...');
    const recordingsResponse = await fetch(`${BACKEND_URL}/api/recordings`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const recordingsData = await recordingsResponse.json();
    
    console.log('\n=== ESTRUTURA COMPLETA DA RESPOSTA ===');
    console.log(JSON.stringify(recordingsData, null, 2));
    
    if (recordingsData.success && recordingsData.data && recordingsData.data.length > 0) {
      console.log('\n=== ESTRUTURA DE UMA GRAVAÇÃO ===');
      const firstRecording = recordingsData.data[0];
      console.log('Campos disponíveis:');
      Object.keys(firstRecording).forEach(key => {
        console.log(`- ${key}: ${typeof firstRecording[key]} = ${JSON.stringify(firstRecording[key])}`);
      });
      
      console.log('\n=== MAPEAMENTO NECESSÁRIO ===');
      console.log('Frontend espera:');
      console.log('- cameraId -> camera_id');
      console.log('- cameraName -> cameras.name');
      console.log('- startTime -> start_time');
      console.log('- endTime -> end_time');
      console.log('- size -> file_size');
      
      console.log('\nAPI retorna:');
      console.log(`- camera_id: ${firstRecording.camera_id}`);
      console.log(`- cameras.name: ${firstRecording.cameras?.name}`);
      console.log(`- start_time: ${firstRecording.start_time}`);
      console.log(`- end_time: ${firstRecording.end_time}`);
      console.log(`- file_size: ${firstRecording.file_size}`);
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

debugRecordingsStructure()