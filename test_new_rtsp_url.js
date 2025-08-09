require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testNewRTSPUrl() {
  console.log('🧪 Testando nova URL RTSP...');
  
  try {
    // 1. Buscar a câmera atualizada
    const { data: camera, error: cameraError } = await supabase
      .from('cameras')
      .select('*')
      .eq('name', 'Câmera Principal')
      .single();
    
    if (cameraError) {
      console.error('❌ Erro ao buscar câmera:', cameraError);
      return;
    }
    
    console.log('📹 Câmera encontrada:');
    console.log(`   Nome: ${camera.name}`);
    console.log(`   URL RTSP: ${camera.rtsp_url}`);
    console.log(`   Status: ${camera.status}`);
    console.log(`   Streaming: ${camera.is_streaming}`);
    
    // 2. Tentar iniciar o stream via API do backend
    console.log('\n🚀 Tentando iniciar stream via API...');
    
    const response = await axios.post('http://localhost:3002/api/cameras/start-stream', {
      cameraId: camera.id
    }, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Stream iniciado com sucesso!');
    console.log('📊 Resposta da API:', response.data);
    
    // 3. Verificar status após iniciar
    setTimeout(async () => {
      const { data: updatedCamera } = await supabase
        .from('cameras')
        .select('*')
        .eq('id', camera.id)
        .single();
      
      console.log('\n📊 Status após iniciar stream:');
      console.log(`   Status: ${updatedCamera.status}`);
      console.log(`   Streaming: ${updatedCamera.is_streaming}`);
      console.log(`   Stream URL: ${updatedCamera.stream_url || 'N/A'}`);
    }, 5000);
    
  } catch (error) {
    console.error('❌ Erro ao testar stream:', error.message);
    
    if (error.response) {
      console.error('📊 Status HTTP:', error.response.status);
      console.error('📊 Dados da resposta:', error.response.data);
    }
    
    if (error.code === 'ECONNREFUSED') {
      console.error('🔌 Backend não está rodando na porta 3002');
    }
  }
}

testNewRTSPUrl();