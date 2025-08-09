const axios = require('axios');
require('dotenv').config();

async function testStreamingRoute() {
  try {
    console.log('🔍 Testando rota de streaming para gravação: 1d062cbb-edcd-4eba-832c-f49595636ad4');
    
    // Primeiro, fazer login para obter token
    console.log('\n🔐 Fazendo login...');
    
    // Tentar com diferentes usuários
    const users = [
      { email: 'admin@admin.com', password: 'admin123' },
      { email: 'admin@newcam.com', password: 'admin123' },
      { email: 'rodrigo@safecameras.com.br', password: 'admin123' }
    ];
    
    let loginData = null;
    let token = null;
    
    for (const user of users) {
      try {
        console.log(`🔐 Tentando login com: ${user.email}`);
        const loginResponse = await axios.post('http://localhost:3002/api/auth/login', user);
        loginData = loginResponse.data;
        console.log(`✅ Login realizado com sucesso para: ${user.email}`);
        break;
      } catch (loginError) {
        console.log(`❌ Falha no login para ${user.email}: ${loginError.response?.status} ${loginError.response?.statusText}`);
        if (loginError.response?.data) {
          console.log(`   Detalhes: ${JSON.stringify(loginError.response.data)}`);
        }
      }
    }
    
    if (!loginData) {
      console.error('❌ Não foi possível fazer login com nenhum usuário');
      return;
    }
    token = loginData.tokens?.accessToken || loginData.token || loginData.access_token;
     if (!token) {
       console.error('❌ Token não encontrado na resposta do login');
       console.log('Resposta do login:', loginData);
       return;
     }
     
     console.log('✅ Token obtido com sucesso!');
     console.log(`🔑 Token: ${token.substring(0, 50)}...`);
    
    // Testar a rota de streaming
    console.log('\n🎥 Testando rota de streaming...');
    try {
      const streamResponse = await axios.head('http://localhost:3002/api/recordings/1d062cbb-edcd-4eba-832c-f49595636ad4/stream', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      console.log(`📊 Status da resposta: ${streamResponse.status} ${streamResponse.statusText}`);
      console.log('📋 Headers da resposta:');
      Object.entries(streamResponse.headers).forEach(([key, value]) => {
        console.log(`   ${key}: ${value}`);
      });
      
      console.log('✅ Rota de streaming funcionando corretamente!');
      
    } catch (streamError) {
      console.log('❌ Problema na rota de streaming');
      console.log(`📊 Status: ${streamError.response?.status} ${streamError.response?.statusText}`);
      
      // Tentar obter mais detalhes com GET
      console.log('\n🔍 Tentando GET para mais detalhes...');
      try {
        const getResponse = await axios.get('http://localhost:3002/api/recordings/1d062cbb-edcd-4eba-832c-f49595636ad4/stream', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Range': 'bytes=0-1023' // Pedir apenas os primeiros 1KB
          },
          responseType: 'stream'
        });
        
        console.log(`📊 Status GET: ${getResponse.status} ${getResponse.statusText}`);
        console.log('✅ GET funcionou - arquivo existe e é acessível!');
        
      } catch (getError) {
        console.log(`❌ Erro GET: ${getError.response?.status} ${getError.response?.statusText}`);
        if (getError.response?.data) {
          console.log('❌ Erro detalhado:', getError.response.data);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error.message);
  }
}

testStreamingRoute();