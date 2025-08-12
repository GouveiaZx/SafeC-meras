// Node 18+ possui fetch nativo - removido: import fetch from 'node-fetch';

const BACKEND_URL = 'http://localhost:3002';

// Credenciais de teste (usuário admin)
const testCredentials = {
  email: 'admin@newcam.com',
  password: 'admin123'
};

async function testRecordingsWithAuth() {
  console.log('🧪 Testando APIs de recordings com autenticação...');
  
  try {
    // 1. Fazer login para obter token
    console.log('\n🔐 Fazendo login...');
    const loginResponse = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testCredentials)
    });
    
    const loginData = await loginResponse.json();
    
    if (!loginResponse.ok) {
      console.log('❌ Erro no login:', loginData);
      return;
    }
    
    console.log('✅ Login realizado com sucesso!');
    const token = loginData.token;
    
    // Headers com autenticação
    const authHeaders = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    
    // 2. Testar GET /api/recordings
    console.log('\n📋 Testando GET /api/recordings...');
    const recordingsResponse = await fetch(`${BACKEND_URL}/api/recordings`, {
      headers: authHeaders
    });
    
    console.log('Status:', recordingsResponse.status);
    const recordingsData = await recordingsResponse.json();
    console.log('Resposta:', JSON.stringify(recordingsData, null, 2));
    
    // 3. Testar GET /api/recordings/stats
    console.log('\n📊 Testando GET /api/recordings/stats...');
    const statsResponse = await fetch(`${BACKEND_URL}/api/recordings/stats`, {
      headers: authHeaders
    });
    
    console.log('Status:', statsResponse.status);
    const statsData = await statsResponse.json();
    console.log('Resposta:', JSON.stringify(statsData, null, 2));
    
    // 4. Testar GET /api/recordings/trends
    console.log('\n📈 Testando GET /api/recordings/trends...');
    const trendsResponse = await fetch(`${BACKEND_URL}/api/recordings/trends`, {
      headers: authHeaders
    });
    
    console.log('Status:', trendsResponse.status);
    const trendsData = await trendsResponse.json();
    console.log('Resposta:', JSON.stringify(trendsData, null, 2));
    
  } catch (error) {
    console.error('❌ Erro durante o teste:', error.message);
  }
}

testRecordingsWithAuth();