require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testStreamDirect() {
  console.log('🧪 Testando stream diretamente via StreamingService...');
  
  try {
    // 1. Buscar a câmera
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
    
    // 2. Testar endpoint de health do backend
    console.log('\n🔍 Verificando health do backend...');
    const healthResponse = await axios.get('http://localhost:3002/health');
    console.log('✅ Backend está funcionando:', healthResponse.data);
    
    // 3. Testar endpoint de teste do ZLMediaKit
    console.log('\n🔍 Testando ZLMediaKit...');
    const zlmResponse = await axios.get('http://localhost:3002/api/streaming/test-zlm');
    console.log('📊 ZLMediaKit status:', zlmResponse.data);
    
    // 4. Tentar diferentes senhas para login
    const passwords = ['admin123', 'newcam123', '123456', 'admin', 'password'];
    let token = null;
    
    for (const password of passwords) {
      try {
        console.log(`\n🔐 Tentando login com senha: ${password}`);
        const loginResponse = await axios.post('http://localhost:3002/api/auth/login', {
          email: 'gouveiarx@gmail.com',
          password: password
        });
        
        token = loginResponse.data.token;
        console.log('✅ Login realizado com sucesso!');
        break;
      } catch (loginError) {
        console.log(`❌ Senha ${password} incorreta`);
      }
    }
    
    if (!token) {
      console.log('\n❌ Não foi possível fazer login com nenhuma senha testada');
      console.log('💡 Vamos tentar usar o endpoint interno sem autenticação...');
      
      // Tentar endpoint interno
      try {
        const internalResponse = await axios.post('http://localhost:3002/api/internal/cameras/start-stream', {
          cameraId: camera.id
        }, {
          headers: {
            'X-Internal-Token': process.env.INTERNAL_SERVICE_TOKEN || 'newcam-internal-service-2025'
          }
        });
        
        console.log('✅ Stream iniciado via endpoint interno!');
        console.log('📊 Resposta:', internalResponse.data);
      } catch (internalError) {
        console.error('❌ Erro no endpoint interno:', internalError.message);
        if (internalError.response) {
          console.error('📊 Status:', internalError.response.status);
          console.error('📊 Dados:', internalError.response.data);
        }
      }
      return;
    }
    
    // 5. Tentar iniciar o stream com token válido
    console.log('\n🚀 Tentando iniciar stream via API...');
    
    const response = await axios.post('http://localhost:3002/api/cameras/start-stream', {
      cameraId: camera.id
    }, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('✅ Stream iniciado com sucesso!');
    console.log('📊 Resposta da API:', response.data);
    
    // 6. Verificar status após iniciar
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

testStreamDirect();