import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkRecordingEnabled() {
  try {
    console.log('🔍 Verificando câmeras com gravação habilitada...');
    
    // Buscar todas as câmeras
    const { data: cameras, error } = await supabase
      .from('cameras')
      .select('id, name, status, recording_enabled, retention_days, is_streaming')
      .order('name');
    
    if (error) {
      console.error('❌ Erro ao buscar câmeras:', error);
      return;
    }
    
    console.log(`\n📊 Total de câmeras: ${cameras.length}`);
    
    const recordingEnabled = cameras.filter(c => c.recording_enabled);
    const onlineCameras = cameras.filter(c => c.status === 'online');
    const streamingCameras = cameras.filter(c => c.is_streaming);
    
    console.log(`📹 Câmeras com gravação habilitada: ${recordingEnabled.length}`);
    console.log(`🟢 Câmeras online: ${onlineCameras.length}`);
    console.log(`📡 Câmeras fazendo streaming: ${streamingCameras.length}`);
    
    console.log('\n📋 Detalhes das câmeras:');
    cameras.forEach(camera => {
      const status = camera.status || 'offline';
      const recording = camera.recording_enabled ? '🔴 GRAV' : '⚪ OFF';
      const streaming = camera.is_streaming ? '📡 STREAM' : '📴 NO-STREAM';
      
      console.log(`   ${camera.name}:`);
      console.log(`     Status: ${status} | ${recording} | ${streaming}`);
      console.log(`     Retenção: ${camera.retention_days || 'N/A'} dias`);
      console.log(`     ID: ${camera.id}`);
      console.log('');
    });
    
    // Verificar gravações ativas no banco
    console.log('\n🎬 Verificando gravações ativas no banco...');
    const { data: activeRecordings, error: recError } = await supabase
      .from('recordings')
      .select(`
        id,
        camera_id,
        status,
        started_at,
        cameras:camera_id (name)
      `)
      .in('status', ['recording', 'processing'])
      .order('started_at', { ascending: false });
    
    if (recError) {
      console.error('❌ Erro ao buscar gravações ativas:', recError);
    } else {
      console.log(`📹 Gravações ativas: ${activeRecordings.length}`);
      activeRecordings.forEach(rec => {
        console.log(`   - ${rec.cameras?.name || 'N/A'} (${rec.status}) - ${rec.started_at}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

checkRecordingEnabled();