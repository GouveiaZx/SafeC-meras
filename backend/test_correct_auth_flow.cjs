require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.JWT_SECRET;

if (!supabaseUrl || !supabaseServiceKey || !jwtSecret) {
  console.error('❌ Variáveis de ambiente não encontradas');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

async function testCorrectAuthFlow() {
  try {
    console.log('🎬 TESTE DO FLUXO DE AUTENTICAÇÃO CORRETO');
    console.log('=========================================');
    
    // 1. Buscar usuário admin@admin.com
    console.log('\n🔍 Buscando usuário admin@admin.com...');
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', 'admin@admin.com')
      .eq('active', true)
      .single();
    
    if (userError || !user) {
      console.error('❌ Usuário não encontrado:', userError);
      return;
    }
    
    console.log('✅ Usuário encontrado:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Nome: ${user.name}`);
    console.log(`   Role: ${user.role}`);
    
    // 2. Criar token JWT local (como o sistema faz)
    console.log('\n🔑 Criando token JWT local...');
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 horas
    };
    
    const token = jwt.sign(tokenPayload, jwtSecret);
    console.log('✅ Token JWT criado');
    console.log(`   Token: ${token.substring(0, 50)}...`);
    
    // 3. Verificar se há gravações no banco
    console.log('\n📋 Verificando gravações no banco...');
    const { data: recordings, error: recordingsError } = await supabaseAdmin
      .from('recordings')
      .select('id, camera_id, file_path, local_path, status')
      .limit(5);
    
    if (recordingsError) {
      console.error('❌ Erro ao buscar gravações:', recordingsError);
      return;
    }
    
    console.log(`📊 Total de gravações encontradas: ${recordings.length}`);
    
    if (recordings.length === 0) {
      console.log('⚠️ Nenhuma gravação encontrada. Criando uma gravação de teste...');
      
      // Criar gravação de teste
      const recordingId = require('crypto').randomUUID();
      const testRecording = {
        id: recordingId,
        camera_id: '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd',
        file_path: `test_recording_${Date.now()}.mp4`,
        local_path: `test_recording_${Date.now()}.mp4`,
        file_size: 1048576, // 1MB
        duration: 30,
        status: 'completed',
        start_time: new Date().toISOString(),
        end_time: new Date(Date.now() + 30000).toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const { data: newRecording, error: insertError } = await supabaseAdmin
        .from('recordings')
        .insert(testRecording)
        .select()
        .single();
      
      if (insertError) {
        console.error('❌ Erro ao criar gravação de teste:', insertError);
        return;
      }
      
      console.log('✅ Gravação de teste criada:');
      console.log(`   ID: ${newRecording.id}`);
      recordings.push(newRecording);
    }
    
    // 4. Testar rota de listagem
    console.log('\n📋 Testando rota de listagem...');
    
    const listResponse = await fetch('http://localhost:3002/api/recordings', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`   📊 Status: ${listResponse.status} ${listResponse.statusText}`);
    
    if (listResponse.status === 200) {
      const listData = await listResponse.json();
      console.log('   ✅ Listagem funcionando!');
      console.log(`   📊 Gravações retornadas: ${listData.data.length}`);
      
      if (listData.data.length > 0) {
        const firstRecording = listData.data[0];
        console.log(`   📹 Primeira gravação: ${firstRecording.id}`);
        
        // 5. Testar rota de download
        console.log('\n📥 Testando rota de download...');
        
        const downloadResponse = await fetch(`http://localhost:3002/api/recordings/${firstRecording.id}/download`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        console.log(`   📊 Status: ${downloadResponse.status} ${downloadResponse.statusText}`);
        console.log(`   📋 Content-Type: ${downloadResponse.headers.get('content-type')}`);
        
        if (downloadResponse.status === 200) {
          console.log('   ✅ Download funcionando!');
        } else if (downloadResponse.status === 404) {
          console.log('   ⚠️ Arquivo não encontrado (normal para gravação de teste)');
        } else {
          console.log('   ❌ Problema no download');
          const errorText = await downloadResponse.text();
          console.log(`   🔍 Resposta: ${errorText}`);
        }
        
        // 6. Testar rota de streaming
        console.log('\n🎥 Testando rota de streaming...');
        
        const streamResponse = await fetch(`http://localhost:3002/api/recordings/${firstRecording.id}/stream`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Range': 'bytes=0-1023'
          }
        });
        
        console.log(`   📊 Status: ${streamResponse.status} ${streamResponse.statusText}`);
        console.log(`   📋 Content-Type: ${streamResponse.headers.get('content-type')}`);
        
        if (streamResponse.status === 206 || streamResponse.status === 200) {
          console.log('   ✅ Streaming funcionando!');
        } else if (streamResponse.status === 404) {
          console.log('   ⚠️ Arquivo não encontrado (normal para gravação de teste)');
        } else {
          console.log('   ❌ Problema no streaming');
          const errorText = await streamResponse.text();
          console.log(`   🔍 Resposta: ${errorText}`);
        }
      }
    } else {
      console.log('   ❌ Problema na listagem');
      const errorText = await listResponse.text();
      console.log(`   🔍 Resposta: ${errorText}`);
    }
    
    console.log('\n🎉 TESTE CONCLUÍDO!');
    console.log('===================');
    console.log('✅ Token JWT local criado');
    console.log('✅ Todas as rotas testadas');
    console.log('');
    console.log('🔧 DIAGNÓSTICO:');
    console.log('- O sistema usa JWT local, não tokens do Supabase Auth');
    console.log('- O frontend deve fazer login via /api/auth/login');
    console.log('- O token retornado deve ser usado nas requisições');
    
  } catch (error) {
    console.error('❌ Erro durante o teste:', error);
  }
}

testCorrectAuthFlow();