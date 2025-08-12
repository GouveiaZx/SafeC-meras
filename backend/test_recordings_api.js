// Removido: import fetch from 'node-fetch'; // Node 18+ possui fetch nativo

// Teste da API de recordings sem autenticação (para debug)
async function testRecordingsAPI() {
  console.log('🧪 Testando APIs de recordings...');
  
  const baseURL = 'http://localhost:3002';
  
  try {
    // Teste 1: API de recordings (lista)
    console.log('\n📋 Testando GET /api/recordings...');
    const recordingsResponse = await fetch(`${baseURL}/api/recordings`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`Status: ${recordingsResponse.status}`);
    const recordingsData = await recordingsResponse.text();
    console.log('Resposta:', recordingsData);
    
  } catch (error) {
    console.error('Erro ao testar /api/recordings:', error.message);
  }
  
  try {
    // Teste 2: API de stats
    console.log('\n📊 Testando GET /api/recordings/stats...');
    const statsResponse = await fetch(`${baseURL}/api/recordings/stats`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`Status: ${statsResponse.status}`);
    const statsData = await statsResponse.text();
    console.log('Resposta:', statsData);
    
  } catch (error) {
    console.error('Erro ao testar /api/recordings/stats:', error.message);
  }
  
  try {
    // Teste 3: Health check (sem autenticação)
    console.log('\n❤️ Testando GET /health...');
    const healthResponse = await fetch(`${baseURL}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`Status: ${healthResponse.status}`);
    const healthData = await healthResponse.text();
    console.log('Resposta:', healthData);
    
  } catch (error) {
    console.error('Erro ao testar /health:', error.message);
  }
}

testRecordingsAPI();