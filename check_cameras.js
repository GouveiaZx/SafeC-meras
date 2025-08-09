const { createClient } = require('@supabase/supabase-js');

// Configurações do Supabase
const supabaseUrl = 'https://grkvfzuadctextnbpajb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzIyNDIzOCwiZXhwIjoyMDY4ODAwMjM4fQ.XJoPu5InA_s3pfryZfSChBqZnu7zBV3vwH7ZM4jf04M';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCameras() {
  try {
    console.log('🔍 Verificando câmeras cadastradas...');
    
    // Buscar todas as câmeras
    const { data: cameras, error } = await supabase
      .from('cameras')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('❌ Erro ao buscar câmeras:', error);
      return;
    }
    
    console.log(`\n📊 Total de câmeras encontradas: ${cameras.length}`);
    
    if (cameras.length === 0) {
      console.log('⚠️ Nenhuma câmera cadastrada no banco de dados.');
      return;
    }
    
    // Exibir detalhes de cada câmera
    cameras.forEach((camera, index) => {
      console.log(`\n📹 Câmera ${index + 1}:`);
      console.log(`   ID: ${camera.id}`);
      console.log(`   Nome: ${camera.name}`);
      console.log(`   IP: ${camera.ip_address}`);
      console.log(`   Porta: ${camera.port}`);
      console.log(`   RTSP URL: ${camera.rtsp_url}`);
      console.log(`   Status: ${camera.status}`);
      console.log(`   Ativo: ${camera.active}`);
      console.log(`   Streaming: ${camera.is_streaming}`);
      console.log(`   Gravando: ${camera.is_recording}`);
      console.log(`   Última visualização: ${camera.last_seen}`);
      console.log(`   Stream Key: ${camera.stream_key}`);
      console.log(`   Criado em: ${camera.created_at}`);
    });
    
    // Verificar streams ativas
    console.log('\n🔄 Verificando streams ativas...');
    const { data: streams, error: streamsError } = await supabase
      .from('streams')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (streamsError) {
      console.error('❌ Erro ao buscar streams:', streamsError);
    } else {
      console.log(`📊 Total de streams encontradas: ${streams.length}`);
      
      streams.forEach((stream, index) => {
        console.log(`\n🎥 Stream ${index + 1}:`);
        console.log(`   ID: ${stream.id}`);
        console.log(`   Camera ID: ${stream.camera_id}`);
        console.log(`   Status: ${stream.status}`);
        console.log(`   URL: ${stream.stream_url}`);
        console.log(`   Tipo: ${stream.stream_type}`);
        console.log(`   Ativo: ${stream.active}`);
        console.log(`   Criado em: ${stream.created_at}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
}

checkCameras();