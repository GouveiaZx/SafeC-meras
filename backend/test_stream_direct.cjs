const fetch = global.fetch;
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://grkvfzuadctextnbpajb.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzIyNDIzOCwiZXhwIjoyMDY4ODAwMjM4fQ.XJoPu5InA_s3pfryZfSChBqZnu7zBV3vwH7ZM4jf04M';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testStreamDirect() {
  try {
    const recordingId = 'd0dfbd17-c9a1-433f-aa30-fec7538fa6e4';
    
    console.log('🎬 Testando streaming direto da gravação...');
    console.log(`📋 ID da gravação: ${recordingId}`);
    
    // 1. Verificar se existe usuário no sistema
    console.log('\n👥 Verificando usuários no sistema...');
    const { data: users, error: usersError } = await supabase.auth.admin.listUsers();
    
    if (usersError) {
      console.error('❌ Erro ao listar usuários:', usersError);
    } else {
      console.log(`✅ Encontrados ${users.users.length} usuários:`);
      users.users.forEach((user, i) => {
        console.log(`   ${i+1}. ${user.email} (${user.id})`);
      });
    }
    
    // 2. Verificar gravação no banco
    console.log('\n🔍 Verificando gravação no banco...');
    const { data: recording, error: recordingError } = await supabase
      .from('recordings')
      .select('*')
      .eq('id', recordingId)
      .single();
    
    if (recordingError) {
      console.error('❌ Erro ao buscar gravação:', recordingError);
      return;
    }
    
    console.log('✅ Gravação encontrada:');
    console.log(`   Filename: ${recording.filename}`);
    console.log(`   Status: ${recording.status}`);
    console.log(`   Tamanho: ${recording.file_size} bytes`);
    console.log(`   Duração: ${recording.duration}s`);
    console.log(`   Caminho: ${recording.local_path}`);
    
    // 3. Testar rota sem autenticação
    console.log('\n🎥 Testando rota de streaming SEM autenticação...');
    const streamUrl = `http://localhost:3002/api/recordings/${recordingId}/stream`;
    
    try {
      const response = await fetch(streamUrl, {
        method: 'GET',
        headers: {
          'Range': 'bytes=0-1023'
        }
      });
      
      console.log('📊 Resposta SEM autenticação:');
      console.log(`   Status: ${response.status} ${response.statusText}`);
      console.log(`   Content-Type: ${response.headers.get('content-type')}`);
      
      if (response.status === 401) {
        console.log('🔒 Autenticação necessária (esperado)');
      } else if (response.status === 200 || response.status === 206) {
        console.log('✅ Streaming funcionando sem autenticação');
      } else {
        const errorText = await response.text();
        console.log(`❌ Erro: ${errorText}`);
      }
      
    } catch (fetchError) {
      console.error('❌ Erro na requisição:', fetchError.message);
    }
    
    // 4. Criar usuário de teste se necessário
    if (!users || users.users.length === 0) {
      console.log('\n👤 Criando usuário de teste...');
      const { data: newUser, error: createUserError } = await supabase.auth.admin.createUser({
        email: 'test@newcam.com',
        password: 'test123456',
        email_confirm: true
      });
      
      if (createUserError) {
        console.error('❌ Erro ao criar usuário:', createUserError);
      } else {
        console.log('✅ Usuário de teste criado:', newUser.user.email);
      }
    }
    
    // 5. Testar com token JWT válido (simulado)
    console.log('\n🔑 Testando com token JWT simulado...');
    const jwt = require('jsonwebtoken');
    const testToken = jwt.sign(
      { 
        sub: '00000000-0000-0000-0000-000000000000',
        email: 'test@newcam.com',
        aud: 'authenticated',
        role: 'authenticated'
      },
      'your-jwt-secret', // Este seria o secret real do Supabase
      { expiresIn: '1h' }
    );
    
    try {
      const authResponse = await fetch(streamUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${testToken}`,
          'Range': 'bytes=0-1023'
        }
      });
      
      console.log('📊 Resposta COM token simulado:');
      console.log(`   Status: ${authResponse.status} ${authResponse.statusText}`);
      
      if (authResponse.status === 200 || authResponse.status === 206) {
        console.log('🎉 SUCESSO: Streaming funcionando com autenticação!');
      } else {
        const errorText = await authResponse.text();
        console.log(`❌ Erro: ${errorText}`);
      }
      
    } catch (authError) {
      console.error('❌ Erro com token:', authError.message);
    }
    
  } catch (err) {
    console.error('❌ Erro geral:', err);
  }
}

testStreamDirect();