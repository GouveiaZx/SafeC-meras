import { default as streamingService } from './backend/src/services/StreamingService.js';
import { supabaseAdmin } from './backend/src/config/database.js';

async function startCameraStreams() {
  console.log('🎬 Iniciando streams das câmeras...');
  
  try {
    // Buscar todas as câmeras ativas
    const { data: cameras, error } = await supabaseAdmin
      .from('cameras')
      .select('*')
      .eq('status', 'online');
    
    if (error) {
      console.error('❌ Erro ao buscar câmeras:', error);
      return;
    }
    
    console.log(`📹 Encontradas ${cameras.length} câmeras ativas`);
    
    for (const camera of cameras) {
      console.log(`\n🔌 Iniciando stream para câmera: ${camera.name} (${camera.id})`);
      
      try {
        // Iniciar stream
        const result = await streamingService.startStream(camera.id);
        console.log(`✅ Stream iniciado para: ${camera.name}`, result);
        
      } catch (error) {
        console.error(`❌ Erro ao iniciar stream ${camera.name}:`, error.message);
      }
    }
    
    console.log('\n🎯 Processo de inicialização de streams concluído');
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
  
  process.exit(0);
}

startCameraStreams().catch(console.error);