import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Carregar variáveis de ambiente
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variáveis de ambiente SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórias');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testApiAuth() {
  console.log('🔐 Testando autenticação e API...');
  
  try {
    // 1. Fazer login
    console.log('\n1. Fazendo login...');
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'admin@newcam.com',
      password: 'admin123456'
    });
    
    if (authError) {
      console.error('❌ Erro no login:', authError);
      return;
    }
    
    console.log('✅ Login realizado com sucesso!');
    console.log('👤 Usuário:', authData.user.email);
    console.log('🔑 Token:', authData.session.access_token.substring(0, 50) + '...');
    
    // 2. Testar API com token
    console.log('\n2. Testando API /api/recordings/stats com token...');
    
    const response = await fetch('http://localhost:3002/api/recordings/stats', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authData.session.access_token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('📊 Status da resposta:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Dados recebidos da API:');
      console.log(JSON.stringify(data, null, 2));
    } else {
      const errorText = await response.text();
      console.error('❌ Erro na API:', errorText);
    }
    
    // 3. Testar API /api/recordings
    console.log('\n3. Testando API /api/recordings com token...');
    
    const recordingsResponse = await fetch('http://localhost:3002/api/recordings', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authData.session.access_token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('📊 Status da resposta:', recordingsResponse.status);
    
    if (recordingsResponse.ok) {
      const recordingsData = await recordingsResponse.json();
      console.log('✅ Gravações recebidas da API:');
      console.log(`📊 Total: ${recordingsData.data ? recordingsData.data.length : 'N/A'}`);
      if (recordingsData.data && recordingsData.data.length > 0) {
        console.log('📋 Primeira gravação:', recordingsData.data[0]);
      }
    } else {
      const errorText = await recordingsResponse.text();
      console.error('❌ Erro na API de gravações:', errorText);
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
}

testApiAuth();