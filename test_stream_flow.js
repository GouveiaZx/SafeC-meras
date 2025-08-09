const { createClient } = require('@supabase/supabase-js');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Configurações do Supabase
const supabaseUrl = 'https://grkvfzuadctextnbpajb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzIyNDIzOCwiZXhwIjoyMDY4ODAwMjM4fQ.XJoPu5InA_s3pfryZfSChBqZnu7zBV3vwH7ZM4jf04M';

const supabase = createClient(supabaseUrl, supabaseKey);

// Configurações do backend
const BACKEND_URL = 'http://localhost:3002';

async function testCompleteStreamFlow() {
  try {
    console.log('🚀 Iniciando teste completo do fluxo de streams...');
    
    // 1. Fazer login para obter token válido
    console.log('\n1️⃣ Fazendo login...');
    const loginResponse = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'gouveiarx@gmail.com',
        password: 'Teste123'
      })
    });
    
    if (!loginResponse.ok) {
      const errorData = await loginResponse.text();
      console.error('❌ Erro no login:', loginResponse.status, errorData);
      return;
    }
    
    const loginData = await loginResponse.json();
    const token = loginData.tokens.accessToken;
    console.log('✅ Login realizado com sucesso');
    console.log('🔑 Token obtido:', token.substring(0, 50) + '...');
    
    // 2. Buscar câmeras no banco
    console.log('\n2️⃣ Buscando câmeras no banco...');
    const { data: cameras, error } = await supabase
      .from('cameras')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('❌ Erro ao buscar câmeras:', error);
      return;
    }
    
    console.log(`📊 Encontradas ${cameras.length} câmeras ativas`);
    
    if (cameras.length === 0) {
      console.log('⚠️ Nenhuma câmera ativa encontrada');
      return;
    }
    
    // 3. Testar cada câmera
    for (let i = 0; i < cameras.length; i++) {
      const camera = cameras[i];
      console.log(`\n3️⃣.${i+1} Testando câmera: ${camera.name} (${camera.id})`);
      console.log(`   RTSP URL: ${camera.rtsp_url}`);
      console.log(`   Status atual: ${camera.status}`);
      console.log(`   Streaming: ${camera.is_streaming}`);
      
      // Testar iniciar stream
      console.log('   🎬 Tentando iniciar stream...');
      
      try {
        const startStreamResponse = await fetch(`${BACKEND_URL}/api/streams/${camera.id}/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
        
        const responseText = await startStreamResponse.text();
        
        if (startStreamResponse.ok) {
          console.log('   ✅ Stream iniciado com sucesso!');
          console.log('   📄 Resposta:', responseText);
          
          // Aguardar um pouco e verificar status
          console.log('   ⏳ Aguardando 3 segundos...');
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Verificar se stream está ativo
          const { data: updatedCamera, error: updateError } = await supabase
            .from('cameras')
            .select('is_streaming, status')
            .eq('id', camera.id)
            .single();
          
          if (!updateError) {
            console.log(`   📊 Status atualizado - Streaming: ${updatedCamera.is_streaming}, Status: ${updatedCamera.status}`);
          }
          
        } else {
          console.log(`   ❌ Erro ao iniciar stream (${startStreamResponse.status}):`);
          console.log('   📄 Resposta:', responseText);
        }
        
      } catch (streamError) {
        console.error(`   ❌ Erro na requisição de stream:`, streamError.message);
      }
    }
    
    // 4. Verificar streams ativas no banco
    console.log('\n4️⃣ Verificando streams ativas no banco...');
    const { data: streams, error: streamsError } = await supabase
      .from('streams')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false });
    
    if (streamsError) {
      console.error('❌ Erro ao buscar streams:', streamsError);
    } else {
      console.log(`📊 Streams ativas encontradas: ${streams.length}`);
      
      streams.forEach((stream, index) => {
        console.log(`\n🎥 Stream ${index + 1}:`);
        console.log(`   ID: ${stream.id}`);
        console.log(`   Camera ID: ${stream.camera_id}`);
        console.log(`   Status: ${stream.status}`);
        console.log(`   URL: ${stream.stream_url}`);
        console.log(`   Tipo: ${stream.stream_type}`);
        console.log(`   Ativo: ${stream.active}`);
      });
    }
    
    // 5. Verificar status das câmeras após testes
    console.log('\n5️⃣ Status final das câmeras:');
    const { data: finalCameras, error: finalError } = await supabase
      .from('cameras')
      .select('id, name, status, is_streaming, is_recording')
      .eq('active', true);
    
    if (!finalError) {
      finalCameras.forEach((camera, index) => {
        console.log(`\n📹 Câmera ${index + 1}: ${camera.name}`);
        console.log(`   Status: ${camera.status}`);
        console.log(`   Streaming: ${camera.is_streaming}`);
        console.log(`   Gravando: ${camera.is_recording}`);
      });
    }
    
    console.log('\n🏁 Teste completo finalizado!');
    
  } catch (error) {
    console.error('❌ Erro geral no teste:', error);
  }
}

testCompleteStreamFlow();