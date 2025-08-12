const { StreamingService } = require('./src/services/StreamingService.js');
const { supabaseAdmin } = require('./src/config/database.js');

async function startCamera1Stream() {
  try {
    console.log('Iniciando stream para Câmera 1...');
    
    // Buscar apenas a câmera que tem URL RTSP configurada
    const { data: cameras, error } = await supabaseAdmin
      .from('cameras')
      .select('*')
      .eq('name', 'Câmera 170.245.45.10')
      .eq('status', 'online');
    
    if (error) {
      console.error('Erro ao buscar câmeras:', error);
      return;
    }
    
    if (!cameras || cameras.length === 0) {
      console.log('Nenhuma câmera encontrada com nome "Câmera 1"');
      return;
    }
    
    const camera = cameras[0];
    console.log(`Câmera encontrada: ${camera.name} (${camera.id})`);
    console.log(`URL RTSP: ${camera.rtsp_url}`);
    console.log('Dados completos da câmera:', JSON.stringify(camera, null, 2));
    
    if (!camera.rtsp_url) {
      console.log('Câmera não possui URL RTSP configurada');
      return;
    }
    
    // Iniciar stream
    const streamingService = new StreamingService();
    console.log(`Iniciando stream com ID: ${camera.id} e URL: ${camera.rtsp_url}`);
    const result = await streamingService.startStream(camera);
    
    if (result.success) {
      console.log('✅ Stream iniciado com sucesso!');
      console.log('Stream ID:', result.streamId);
    } else {
      console.log('❌ Falha ao iniciar stream:', result.error);
    }
    
  } catch (error) {
    console.error('Erro:', error);
  }
}

startCamera1Stream();