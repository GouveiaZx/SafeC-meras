/**
 * Script de teste para verificar sistema de streaming
 */

import axios from 'axios';

const ZLM_API_URL = 'http://localhost:8000/index/api';
const ZLM_SECRET = '9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK';
const BACKEND_API = 'http://localhost:3002/api';

async function testZLMediaKit() {
  console.log('🔍 Testando conectividade do ZLMediaKit...');
  
  try {
    const response = await axios.post(`${ZLM_API_URL}/getServerConfig`, {
      secret: ZLM_SECRET
    });
    
    if (response.data.code === 0) {
      console.log('✅ ZLMediaKit está funcionando');
      return true;
    } else {
      console.log('❌ ZLMediaKit retornou erro:', response.data);
      return false;
    }
  } catch (error) {
    console.log('❌ Erro ao conectar com ZLMediaKit:', error.message);
    return false;
  }
}

async function testBackendHealth() {
  console.log('🔍 Testando saúde do backend...');
  
  try {
    const response = await axios.get(`${BACKEND_API}/health`);
    console.log('✅ Backend está funcionando:', response.data);
    return true;
  } catch (error) {
    console.log('❌ Erro ao conectar com backend:', error.message);
    return false;
  }
}

async function testStreamCreation() {
  console.log('🔍 Testando criação de stream de teste...');
  
  try {
    // Criar um stream de teste via ZLMediaKit
    const testStream = {
      vhost: '__defaultVhost__',
      app: 'live', 
      stream: 'test_stream_' + Date.now(),
      secret: ZLM_SECRET
    };
    
    // Tentar iniciar proxy pull stream (simulando uma câmera)
    const response = await axios.post(`${ZLM_API_URL}/addStreamProxy`, {
      ...testStream,
      url: 'rtmp://www.learningcontainer.com/video_sample_flv_rtmp.flv', // Stream de teste público
      enable_hls: 1,
      enable_mp4: 1
    });
    
    console.log('📡 Resposta do ZLMediaKit:', response.data);
    
    if (response.data.code === 0) {
      console.log('✅ Stream de teste criado com sucesso');
      
      // Verificar se apareceu na lista de streams
      setTimeout(async () => {
        try {
          const mediaList = await axios.post(`${ZLM_API_URL}/getMediaList`, {
            secret: ZLM_SECRET
          });
          
          console.log('📺 Streams ativos:', mediaList.data);
          
          if (mediaList.data.data && mediaList.data.data.length > 0) {
            const testStreamInfo = mediaList.data.data.find(s => s.stream === testStream.stream);
            if (testStreamInfo) {
              console.log('✅ Stream encontrado na lista:', testStreamInfo);
              
              // URL HLS do stream
              const hlsUrl = `http://localhost:8000/${testStreamInfo.app}/${testStreamInfo.stream}/hls.m3u8`;
              console.log('🎬 URL HLS:', hlsUrl);
              
              // Testar se o HLS está acessível
              try {
                const hlsResponse = await axios.get(hlsUrl, { timeout: 5000 });
                console.log('✅ Stream HLS acessível, tamanho:', hlsResponse.data.length);
              } catch (hlsError) {
                console.log('⚠️ Stream HLS não está pronto ainda (normal para streams novos)');
              }
            }
          }
        } catch (error) {
          console.log('❌ Erro ao verificar streams:', error.message);
        }
      }, 2000);
      
      return true;
    } else {
      console.log('❌ Falha ao criar stream de teste:', response.data.msg);
      return false;
    }
  } catch (error) {
    console.log('❌ Erro ao testar stream:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Iniciando testes do sistema de streaming...\n');
  
  const zlmOk = await testZLMediaKit();
  console.log('');
  
  const backendOk = await testBackendHealth();
  console.log('');
  
  if (zlmOk) {
    await testStreamCreation();
  } else {
    console.log('⚠️ Pulando teste de stream porque ZLMediaKit não está disponível');
  }
  
  console.log('\n📊 Resumo dos testes:');
  console.log(`ZLMediaKit: ${zlmOk ? '✅' : '❌'}`);
  console.log(`Backend: ${backendOk ? '✅' : '❌'}`);
  
  if (zlmOk && backendOk) {
    console.log('\n🎉 Sistema pronto para streaming!');
    console.log('💡 Próximos passos:');
    console.log('  1. Cadastre câmeras no sistema');
    console.log('  2. Configure URLs RTSP das câmeras');
    console.log('  3. Inicie streams via interface');
  } else {
    console.log('\n⚠️ Alguns componentes precisam de atenção antes do uso completo.');
  }
}

// Executar testes
runTests().catch(error => {
  console.error('❌ Erro fatal nos testes:', error);
  process.exit(1);
});