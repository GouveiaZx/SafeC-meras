const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const http = require('http');

const supabaseUrl = 'https://grkvfzuadctextnbpajb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyMjQyMzgsImV4cCI6MjA2ODgwMDIzOH0.Simv8hH8aE9adQiTf6t1BZIcMPniNh9ecpjxEeki4mE';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const req = client.request({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: res.headers,
          data: data
        });
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}

async function debugAuthStreaming() {
  try {
    const recordingId = 'd0dfbd17-c9a1-433f-aa30-fec7538fa6e4';
    
    console.log('🔍 DEBUG DETALHADO DE AUTENTICAÇÃO PARA STREAMING');
    console.log(`📋 ID da gravação: ${recordingId}`);
    
    // 1. Fazer login e obter token
    console.log('\n🔐 Fazendo login...');
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'admin@admin.com',
      password: 'admin123'
    });
    
    if (authError) {
      console.error('❌ Erro no login:', authError);
      return;
    }
    
    const token = authData.session.access_token;
    console.log('✅ Login bem-sucedido');
    console.log(`🔑 Token obtido: ${token.substring(0, 50)}...`);
    
    // 2. Verificar se o token é válido usando Supabase
    console.log('\n🔍 Verificando token com Supabase...');
    const { data: { user }, error: tokenError } = await supabase.auth.getUser(token);
    
    if (tokenError) {
      console.error('❌ Erro na verificação do token:', tokenError);
      return;
    }
    
    console.log('✅ Token válido no Supabase');
    console.log(`👤 Usuário autenticado: ${user.email} (ID: ${user.id})`);
    
    // 3. Verificar se o usuário existe na tabela users
    console.log('\n🔍 Verificando usuário na tabela users...');
    const supabaseAdmin = createClient(supabaseUrl, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzIyNDIzOCwiZXhwIjoyMDY4ODAwMjM4fQ.XJoPu5InA_s3pfryZfSChBqZnu7zBV3vwH7ZM4jf04M');
    
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', user.id)
      .eq('active', true)
      .single();
    
    if (userError) {
      console.error('❌ Erro ao buscar usuário na tabela users:', userError);
      console.log('   Código:', userError.code);
      console.log('   Mensagem:', userError.message);
      return;
    }
    
    if (!userData) {
      console.error('❌ Usuário não encontrado na tabela users');
      return;
    }
    
    console.log('✅ Usuário encontrado na tabela users');
    console.log(`   Nome: ${userData.name}`);
    console.log(`   Email: ${userData.email}`);
    console.log(`   Role: ${userData.role}`);
    console.log(`   Ativo: ${userData.active}`);
    console.log(`   Bloqueado: ${userData.blocked_at ? 'Sim' : 'Não'}`);
    
    // 4. Testar a rota de streaming
    console.log('\n🎥 Testando rota de streaming...');
    const streamUrl = `http://localhost:3002/api/recordings/${recordingId}/stream`;
    
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Range': 'bytes=0-1023',
      'User-Agent': 'Debug-Script/1.0'
    };
    
    console.log('📤 Headers da requisição:');
    console.log('   Authorization:', `Bearer ${token.substring(0, 50)}...`);
    console.log('   Range:', headers.Range);
    
    try {
      const response = await makeRequest(streamUrl, {
        method: 'GET',
        headers: headers
      });
      
      console.log('\n📊 Resposta da rota de streaming:');
      console.log(`   Status: ${response.status} ${response.statusText}`);
      console.log(`   Content-Type: ${response.headers['content-type']}`);
      console.log(`   Content-Length: ${response.headers['content-length']}`);
      
      if (response.status === 401) {
        console.log('\n❌ ERRO 401 - Analisando resposta:');
        try {
          const errorData = JSON.parse(response.data);
          console.log('   Mensagem de erro:', errorData.message);
          console.log('   Sucesso:', errorData.success);
        } catch (e) {
          console.log('   Resposta não é JSON:', response.data);
        }
        
        console.log('\n🔍 POSSÍVEIS CAUSAS:');
        console.log('   1. Middleware não está recebendo o token corretamente');
        console.log('   2. Erro na validação do token com supabase.auth.getUser()');
        console.log('   3. Usuário não encontrado na tabela users');
        console.log('   4. Problema na importação do módulo database.js');
        
      } else if (response.status === 200 || response.status === 206) {
        console.log('\n🎉 SUCESSO! Streaming funcionando!');
        console.log('✅ Autenticação passou corretamente');
        console.log('✅ Rota de streaming respondeu com sucesso');
        
      } else {
        console.log(`\n⚠️ Status inesperado: ${response.status}`);
        console.log('   Resposta:', response.data);
      }
      
    } catch (fetchError) {
      console.error('❌ Erro na requisição HTTP:', fetchError.message);
    }
    
  } catch (err) {
    console.error('❌ Erro geral:', err);
  }
}

debugAuthStreaming();