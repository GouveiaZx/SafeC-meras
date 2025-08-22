/**
 * Script para iniciar streaming das câmeras e colocá-las online
 * NewCAM - Sistema de Monitoramento
 */

import streamingService from '../services/StreamingService.js';
import { createModuleLogger } from '../config/logger.js';
import { supabase, supabaseAdmin } from '../config/database.js';
import axios from 'axios';

const logger = createModuleLogger('StartCameraStreaming');

// Configurações do ZLMediaKit
const ZLM_API_URL = process.env.ZLM_API_URL || 'http://localhost:8000/index/api';
const ZLM_SECRET = process.env.ZLM_SECRET || '9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK';

// Função para forçar início de gravação
async function forceStartRecording(streamId) {
  try {
    console.log(`    🎬 Forçando início de gravação para stream ${streamId}`);
    
    const response = await axios.post(`${ZLM_API_URL}/startRecord`, null, {
      params: {
        secret: ZLM_SECRET,
        type: 1, // MP4
        vhost: '__defaultVhost__',
        app: 'live',
        stream: streamId
      },
      timeout: 10000
    });

    if (response.data.code === 0) {
      console.log(`    ✅ Gravação forçada iniciada para ${streamId}`);
      return true;
    } else {
      console.log(`    ❌ Falha ao forçar gravação para ${streamId}:`, response.data);
      return false;
    }

  } catch (error) {
    console.log(`    ❌ Erro ao forçar gravação para ${streamId}:`, error.message);
    return false;
  }
}

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
    await streamingService.init();
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
        try {
          const streamResult = await streamingService.startStream(camera, {
            quality: 'medium',
            format: 'hls',
            audio: true
          });
          
          console.log(`  🎯 Stream iniciado:`, {
            streamId: streamResult.id,
            urls: streamResult.urls,
            server: streamResult.server
          });
          
          // Atualizar status para 'online' e adicionar informações de streaming
          await supabaseAdmin
            .from('cameras')
            .update({ 
              status: 'online',
              is_streaming: true,
              hls_url: streamResult.urls?.hls || streamResult.hlsUrl,
              last_seen: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', camera.id);
          
          console.log(`  ✅ Câmera ${camera.name} está ONLINE e transmitindo!`);
          
          // FORÇAR GRAVAÇÃO AUTOMATICAMENTE SE HABILITADA
          if (camera.recording_enabled) {
            console.log(`  🎬 Forçando gravação para câmera ${camera.name}...`);
            
            try {
              // Chamar função interna de força de gravação
              const recordingStarted = await forceStartRecording(camera.id);
              
              if (recordingStarted) {
                // Criar entrada no banco de dados
                const now = new Date().toISOString();
                await supabaseAdmin.from('recordings').insert([{
                  camera_id: camera.id,
                  status: 'recording',
                  start_time: now,
                  started_at: now,
                  created_at: now,
                  updated_at: now,
                  metadata: { 
                    started_by: 'startCameraStreaming',
                    auto_started: true,
                    forced: true
                  }
                }]);
                
                console.log(`  ✅ Gravação iniciada automaticamente para ${camera.name}`);
              } else {
                console.log(`  ⚠️  Falha ao iniciar gravação para ${camera.name}`);
              }
            } catch (recordingError) {
              console.log(`  ❌ Erro ao forçar gravação: ${recordingError.message}`);
            }
          }
          
        } catch (streamError) {
          console.log(`  ⚠️  Erro ao iniciar stream: ${streamError.message}`);
          
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