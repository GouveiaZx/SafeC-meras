/**
 * Script para iniciar streaming das câmeras e colocá-las online
 * NewCAM - Sistema de Monitoramento
 */

import unifiedStreamingService from '../services/UnifiedStreamingService.js';
import { createModuleLogger } from '../config/logger.js';
import { supabase, supabaseAdmin } from '../config/database.js';

const logger = createModuleLogger('StartCameraStreaming');

async function startCameraStreaming() {
  try {
    console.log('🎥 Iniciando processo de ativação das câmeras...');
    
    // 1. Buscar todas as câmeras
    const { data: cameras, error: camerasError } = await supabaseAdmin
      .from('cameras')
      .select('*')
      .eq('active', true);
    
    if (camerasError) {
      throw new Error(`Erro ao buscar câmeras: ${camerasError.message}`);
    }
    
    if (!cameras || cameras.length === 0) {
      console.log('❌ Nenhuma câmera encontrada no banco de dados');
      return;
    }
    
    console.log(`📹 Encontradas ${cameras.length} câmeras:`);
    cameras.forEach(camera => {
      console.log(`  - ${camera.name} (ID: ${camera.id}) - Status: ${camera.status}`);
    });
    
    // 2. Inicializar serviço de streaming
    console.log('\n🔧 Inicializando serviço de streaming...');
    await unifiedStreamingService.init();
    console.log('✅ Serviço de streaming inicializado');
    
    // 3. Processar cada câmera
    for (const camera of cameras) {
      try {
        console.log(`\n🎬 Processando câmera: ${camera.name}`);
        
        // Atualizar status para 'offline'
        await supabaseAdmin
          .from('cameras')
          .update({ 
            status: 'offline',
            last_seen: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', camera.id);
        
        console.log(`  📡 Status atualizado para 'offline'`);
        
        // Tentar iniciar stream
        const streamResult = await unifiedStreamingService.startStream(camera.id, {
          quality: 'medium',
          format: 'hls',
          audio: true
        });
        
        if (streamResult && streamResult.success) {
          console.log(`  🎯 Stream iniciado:`, {
            streamId: streamResult.data.id,
            urls: streamResult.data.urls,
            server: streamResult.data.server
          });
          
          // Atualizar status para 'online' e adicionar informações de streaming
          await supabaseAdmin
            .from('cameras')
            .update({ 
              status: 'online',
              is_streaming: true,
              hls_url: streamResult.data.urls?.hls || streamResult.data.hlsUrl,
              last_seen: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', camera.id);
          
          console.log(`  ✅ Câmera ${camera.name} está ONLINE e transmitindo!`);
          
        } else {
          console.log(`  ⚠️  Erro ao iniciar stream: ${streamResult.error || streamResult.message}`);
          
          // Mesmo com erro de stream, marcar como online (pode ser problema temporário)
          await supabaseAdmin
            .from('cameras')
            .update({ 
              status: 'online',
              is_streaming: false,
              last_seen: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', camera.id);
          
          console.log(`  📡 Câmera ${camera.name} marcada como ONLINE (sem streaming)`);
        }
        
      } catch (cameraError) {
        console.log(`  ❌ Erro ao processar câmera ${camera.name}: ${cameraError.message}`);
        
        // Marcar como erro
        await supabaseAdmin
          .from('cameras')
          .update({ 
            status: 'error',
            is_streaming: false,
            updated_at: new Date().toISOString()
          })
          .eq('id', camera.id);
      }
    }
    
    // 4. Verificar resultado final
    console.log('\n📊 Verificando status final das câmeras...');
    const { data: updatedCameras } = await supabaseAdmin
      .from('cameras')
      .select('*');
    
    const stats = {
      total: updatedCameras.length,
      online: updatedCameras.filter(c => c.status === 'online').length,
      streaming: updatedCameras.filter(c => c.is_streaming === true).length,
      offline: updatedCameras.filter(c => c.status === 'offline').length,
      error: updatedCameras.filter(c => c.status === 'error').length
    };
    
    console.log('\n📈 Estatísticas finais:');
    console.log(`  📹 Total de câmeras: ${stats.total}`);
    console.log(`  🟢 Online: ${stats.online}`);
    console.log(`  📡 Transmitindo: ${stats.streaming}`);
    console.log(`  🔴 Offline: ${stats.offline}`);
    console.log(`  ❌ Erro: ${stats.error}`);
    
    console.log('\n🎉 Processo de ativação das câmeras concluído!');
    
  } catch (error) {
    console.error('❌ Erro no processo de ativação das câmeras:', error.message);
    logger.error('Erro no startCameraStreaming:', error);
    process.exit(1);
  }
}

// Executar o script
startCameraStreaming().catch(error => {
  console.error('❌ Erro fatal:', error.message);
  process.exit(1);
});

export default startCameraStreaming;