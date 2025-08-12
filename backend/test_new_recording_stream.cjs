const { createClient } = require('@supabase/supabase-js');
// Node 18+ possui fetch nativo - removido require('node-fetch')

const supabaseUrl = process.env.SUPABASE_URL || 'https://grkvfzuadctextnbpajb.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyMjQyMzgsImV4cCI6MjA2ODgwMDIzOH0.Simv8hH8aE9adQiTf6t1BZIcMPniNh9ecpjxEeki4mE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testNewRecordingStream() {
  try {
    const recordingId = 'd0dfbd17-c9a1-433f-aa30-fec7538fa6e4';
    
    console.log('🎬 Testando gravação de teste criada...');
    console.log(`📋 ID da gravação: ${recordingId}`);
    
    // 1. Fazer login para obter token
    console.log('\n🔐 Fazendo login...');
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'admin@newcam.com',
      password: 'admin123'
    });
    
    if (authError) {
      console.error('❌ Erro no login:', authError);
      return;
    }
    
    const token = authData.session.access_token;
    console.log('✅ Login bem-sucedido');
    
    // 2. Verificar se a gravação existe no banco
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
    
    console.log('✅ Gravação encontrada no banco:');
    console.log(`   Filename: ${recording.filename}`);
    console.log(`   Status: ${recording.status}`);
    console.log(`   Tamanho: ${recording.file_size} bytes`);
    console.log(`   Duração: ${recording.duration}s`);
    console.log(`   Caminho local: ${recording.local_path}`);
    
    // 3. Testar rota de streaming
    console.log('\n🎥 Testando rota de streaming...');
    const streamUrl = `http://localhost:3002/api/recordings/${recordingId}/stream`;
    console.log(`   URL: ${streamUrl}`);
    
    try {
      const response = await fetch(streamUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Range': 'bytes=0-1023' // Solicitar apenas os primeiros 1KB
        }
      });
      
      console.log('✅ Resposta da rota de streaming:');
      console.log(`   Status: ${response.status} ${response.statusText}`);
      console.log(`   Content-Type: ${response.headers.get('content-type')}`);
      console.log(`   Content-Length: ${response.headers.get('content-length')}`);
      console.log(`   Accept-Ranges: ${response.headers.get('accept-ranges')}`);
      console.log(`   Content-Range: ${response.headers.get('content-range')}`);
      
      if (response.status === 200 || response.status === 206) {
        console.log('🎉 SUCESSO: Rota de streaming funcionando!');
        
        // Verificar se é realmente um arquivo de vídeo
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('video')) {
          console.log('✅ Content-Type correto para vídeo');
        } else {
          console.log(`⚠️ Content-Type inesperado: ${contentType}`);
        }
        
      } else {
        console.log(`❌ Erro na rota de streaming: ${response.status}`);
        const errorText = await response.text();
        console.log(`   Resposta: ${errorText}`);
      }
      
    } catch (fetchError) {
      console.error('❌ Erro ao fazer requisição:', fetchError.message);
    }
    
    // 4. Testar rota de download
    console.log('\n📥 Testando rota de download...');
    const downloadUrl = `http://localhost:3002/api/recordings/${recordingId}/download`;
    console.log(`   URL: ${downloadUrl}`);
    
    try {
      const downloadResponse = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      console.log('✅ Resposta da rota de download:');
      console.log(`   Status: ${downloadResponse.status} ${downloadResponse.statusText}`);
      console.log(`   Content-Type: ${downloadResponse.headers.get('content-type')}`);
      console.log(`   Content-Disposition: ${downloadResponse.headers.get('content-disposition')}`);
      
    } catch (downloadError) {
      console.error('❌ Erro ao testar download:', downloadError.message);
    }
    
  } catch (err) {
    console.error('❌ Erro geral:', err);
  }
}

testNewRecordingStream();