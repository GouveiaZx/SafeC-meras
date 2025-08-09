require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testSpecificStreaming() {
  try {
    console.log('🎯 TESTANDO STREAMING DA GRAVAÇÃO ESPECÍFICA');
    console.log('==============================================');
    
    const specificId = '1d062cbb-edcd-4eba-832c-f49595636ad4';
    console.log(`📋 ID da gravação: ${specificId}`);
    
    // Buscar um usuário admin para criar o token
    console.log('👤 Buscando usuário admin...');
    const { data: users } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'admin')
      .limit(1);
    
    if (!users || users.length === 0) {
      throw new Error('Nenhum usuário admin encontrado');
    }
    
    const userId = users[0].id;
    console.log(`✅ Usuário encontrado: ${userId}`);
    
    // Criar token JWT
    console.log('🔑 Criando token JWT...');
    const token = jwt.sign(
      { userId },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    console.log('✅ Token JWT criado');
    
    // Testar endpoint de streaming
    console.log('🎥 Testando endpoint de streaming...');
    const streamingUrl = `http://localhost:3002/api/recordings/${specificId}/stream`;
    
    const response = await fetch(streamingUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Range': 'bytes=0-1023' // Solicitar apenas os primeiros 1KB
      }
    });
    
    console.log(`📊 Status: ${response.status} ${response.statusText}`);
    console.log(`📋 Content-Type: ${response.headers.get('Content-Type')}`);
    console.log(`📋 Content-Length: ${response.headers.get('Content-Length')}`);
    console.log(`📋 Content-Range: ${response.headers.get('Content-Range')}`);
    console.log(`📋 Accept-Ranges: ${response.headers.get('Accept-Ranges')}`);
    
    if (response.ok) {
      console.log('✅ STREAMING FUNCIONANDO!');
      console.log('🎬 O player deve conseguir reproduzir esta gravação.');
      
      // Ler uma pequena parte do conteúdo para verificar
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      console.log(`📊 Bytes recebidos: ${bytes.length}`);
      console.log(`🔍 Primeiros bytes: ${Array.from(bytes.slice(0, 8)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);
      
      // Verificar se é um arquivo MP4 válido (deve começar com ftyp)
      const header = String.fromCharCode(...bytes.slice(4, 8));
      if (header === 'ftyp') {
        console.log('✅ Arquivo MP4 válido detectado!');
      } else {
        console.log('⚠️  Header MP4 não detectado, mas pode ser normal para streaming parcial');
      }
      
    } else {
      console.log('❌ PROBLEMA NO STREAMING');
      const errorText = await response.text();
      console.log(`🔍 Resposta: ${errorText}`);
    }
    
    // Testar também sem Range header
    console.log('');
    console.log('🎥 Testando streaming sem Range header...');
    const fullResponse = await fetch(streamingUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log(`📊 Status (sem Range): ${fullResponse.status} ${fullResponse.statusText}`);
    console.log(`📋 Content-Type: ${fullResponse.headers.get('Content-Type')}`);
    console.log(`📋 Content-Length: ${fullResponse.headers.get('Content-Length')}`);
    
    if (fullResponse.ok) {
      console.log('✅ STREAMING COMPLETO FUNCIONANDO!');
    } else {
      console.log('❌ PROBLEMA NO STREAMING COMPLETO');
      const errorText = await fullResponse.text();
      console.log(`🔍 Resposta: ${errorText}`);
    }
    
    console.log('');
    console.log('🎉 TESTE DE STREAMING CONCLUÍDO!');
    console.log('===============================');
    console.log('📺 URLs para testar no frontend:');
    console.log(`   Streaming: /api/recordings/${specificId}/stream`);
    console.log(`   Download: /api/recordings/${specificId}/download`);
    console.log('');
    console.log('🔧 Se o player ainda não funcionar, verifique:');
    console.log('   1. Se o proxy Vite está configurado corretamente');
    console.log('   2. Se o frontend está usando o token de autenticação');
    console.log('   3. Se o player suporta streaming de MP4');
    
  } catch (error) {
    console.error('❌ Erro ao testar streaming:', error);
    process.exit(1);
  }
}

testSpecificStreaming();