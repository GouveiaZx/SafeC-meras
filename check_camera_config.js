const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function checkCameraConfig() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Variáveis de ambiente do Supabase não encontradas');
      return;
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    console.log('🔍 Verificando configuração da câmera no Supabase...');
    
    // Buscar todas as câmeras
    const { data: cameras, error } = await supabase
      .from('cameras')
      .select('*');
    
    if (error) {
      console.error('❌ Erro ao buscar câmeras:', error);
      return;
    }
    
    console.log(`\n📊 Total de câmeras encontradas: ${cameras.length}`);
    
    cameras.forEach((camera, index) => {
      console.log(`\n📹 Câmera ${index + 1}:`);
      console.log(`   ID: ${camera.id}`);
      console.log(`   Nome: ${camera.name}`);
      console.log(`   Status: ${camera.status}`);
      console.log(`   RTSP URL: ${camera.rtsp_url}`);
      console.log(`   IP: ${camera.ip_address}`);
      console.log(`   Porta: ${camera.port}`);
      console.log(`   Usuário: ${camera.username}`);
      console.log(`   Senha: ${camera.password ? '***' : 'Não definida'}`);
      console.log(`   Streaming: ${camera.is_streaming}`);
      console.log(`   Gravando: ${camera.is_recording}`);
      console.log(`   Ativo: ${camera.active}`);
      console.log(`   Última visualização: ${camera.last_seen}`);
      console.log(`   Stream Key: ${camera.stream_key}`);
      console.log(`   HLS URL: ${camera.hls_url}`);
      console.log(`   RTMP URL: ${camera.rtmp_url}`);
      console.log(`   FLV URL: ${camera.flv_url}`);
    });
    
    // Verificar streams relacionados
    console.log('\n🔄 Verificando streams relacionados...');
    const { data: streams, error: streamsError } = await supabase
      .from('streams')
      .select('*');
    
    if (streamsError) {
      console.error('❌ Erro ao buscar streams:', streamsError);
    } else {
      console.log(`📊 Total de streams encontrados: ${streams.length}`);
      streams.forEach((stream, index) => {
        console.log(`\n🎥 Stream ${index + 1}:`);
        console.log(`   ID: ${stream.id}`);
        console.log(`   Camera ID: ${stream.camera_id}`);
        console.log(`   Status: ${stream.status}`);
        console.log(`   HLS URL: ${stream.hls_url}`);
        console.log(`   RTMP URL: ${stream.rtmp_url}`);
        console.log(`   FLV URL: ${stream.flv_url}`);
        console.log(`   Ativo: ${stream.active}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
}

checkCameraConfig();