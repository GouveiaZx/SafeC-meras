import { default as streamingService } from './backend/src/services/StreamingService.js';
import { supabaseAdmin } from './backend/src/config/database.js';

async function forceReconnectCameras() {
  console.log('🔄 Forçando reconexão de todas as câmeras...');
  
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
      console.log(`\n🔌 Reconectando câmera: ${camera.name} (${camera.id})`);
      
      try {
        // Parar stream existente (se houver)
        await streamingService.stopStream(camera.id);
        console.log(`⏹️ Stream parado para: ${camera.name}`);
        
        // Aguardar um pouco
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Iniciar novo stream
        const result = await streamingService.startStream(camera.id);
        console.log(`✅ Stream iniciado para: ${camera.name}`, result);
        
      } catch (error) {
        console.error(`❌ Erro ao reconectar ${camera.name}:`, error.message);
      }
    }
    
    console.log('\n🎯 Processo de reconexão concluído');
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
  
  process.exit(0);
}

forceReconnectCameras().catch(console.error);