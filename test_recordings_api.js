// Script para testar a API de gravações com autenticação
const fs = require('fs');
const path = require('path');

// Carregar variáveis de ambiente
require('dotenv').config({ path: path.join(__dirname, 'backend', '.env') });

async function testRecordingsAPI() {
  try {
    console.log('🔍 Testando API de gravações com autenticação...');
    
    // Primeiro, vamos fazer login para obter um token
    console.log('\n🔐 Fazendo login...');
    const loginResponse = await fetch('http://localhost:3002/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'admin@newcam.com',
        password: 'admin123'
      })
    });
    
    console.log('Status do login:', loginResponse.status);
    console.log('Headers do login:', Object.fromEntries(loginResponse.headers.entries()));
    
    if (!loginResponse.ok) {
      console.error('❌ Erro no login:', loginResponse.status, loginResponse.statusText);
      const errorText = await loginResponse.text();
      console.error('Resposta de erro:', errorText);
      return;
    }
    
    const loginData = await loginResponse.json();
    console.log('✅ Login realizado com sucesso');
    console.log('Dados do login:', JSON.stringify(loginData, null, 2));
    
    const token = loginData.tokens?.accessToken || loginData.token || loginData.data?.token;
    
    if (!token) {
      console.error('❌ Token não encontrado na resposta do login');
      console.error('Estrutura da resposta:', Object.keys(loginData));
      return;
    }
    
    console.log('Token obtido:', token.substring(0, 50) + '...');
    
    // Testar o endpoint /auth/me primeiro
    console.log('\n👤 Testando endpoint /api/auth/me...');
    const meResponse = await fetch('http://localhost:3002/api/auth/me', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Status /auth/me:', meResponse.status);
    if (meResponse.ok) {
      const meData = await meResponse.json();
      console.log('✅ Dados do usuário:', JSON.stringify(meData, null, 2));
    } else {
      const errorText = await meResponse.text();
      console.error('❌ Erro em /auth/me:', errorText);
    }
    
    // Agora testar a API de gravações
    console.log('\n🎥 Testando endpoint /api/recordings...');
    
    const recordingsResponse = await fetch('http://localhost:3002/api/recordings', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Status da resposta:', recordingsResponse.status);
    console.log('Headers da resposta:', Object.fromEntries(recordingsResponse.headers.entries()));
    
    if (!recordingsResponse.ok) {
      console.error('❌ Erro na API de gravações:', recordingsResponse.status, recordingsResponse.statusText);
      const errorText = await recordingsResponse.text();
      console.error('Resposta de erro:', errorText);
      return;
    }
    
    const recordingsData = await recordingsResponse.json();
    console.log('✅ Resposta da API de gravações:');
    console.log(JSON.stringify(recordingsData, null, 2));
    
    // Testar também as estatísticas
    console.log('\n📊 Testando endpoint /api/recordings/stats...');
    
    const statsResponse = await fetch('http://localhost:3002/api/recordings/stats', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (statsResponse.ok) {
      const statsData = await statsResponse.json();
      console.log('✅ Estatísticas:');
      console.log(JSON.stringify(statsData, null, 2));
    } else {
      console.error('❌ Erro nas estatísticas:', statsResponse.status);
      const errorText = await statsResponse.text();
      console.error('Resposta de erro:', errorText);
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

testRecordingsAPI();