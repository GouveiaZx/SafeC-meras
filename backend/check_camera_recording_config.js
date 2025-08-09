/**
 * Script para verificar configurações de gravação das câmeras
 */

import { supabaseAdmin } from './src/config/database.js';
import { config } from 'dotenv';

config();

async function checkCameraRecordingConfig() {
  try {
    console.log('🔍 Verificando configurações de gravação das câmeras...');
    
    const { data: cameras, error } = await supabaseAdmin
      .from('cameras')
      .select('id, name, recording_enabled, status, is_streaming, active')
      .eq('active', true);
    
    if (error) {
      throw error;
    }
    
    console.log(`\n📹 Total de câmeras ativas: ${cameras.length}`);
    
    cameras.forEach((camera, index) => {
      console.log(`\n${index + 1}. ${camera.name}`);
      console.log(`   ID: ${camera.id}`);
      console.log(`   Status: ${camera.status}`);
      console.log(`   Streaming: ${camera.is_streaming}`);
      console.log(`   Recording Enabled: ${camera.recording_enabled}`);
    });
    
    // Verificar se alguma câmera não tem recording_enabled configurado
    const camerasWithoutRecording = cameras.filter(c => !c.recording_enabled);
    
    if (camerasWithoutRecording.length > 0) {
      console.log(`\n⚠️ Câmeras sem gravação habilitada (${camerasWithoutRecording.length}):`);
      camerasWithoutRecording.forEach(camera => {
        console.log(`   - ${camera.name} (${camera.id})`);
      });
      
      console.log('\n💡 Para habilitar gravação automática, execute:');
      console.log('UPDATE cameras SET recording_enabled = true WHERE active = true;');
    } else {
      console.log('\n✅ Todas as câmeras ativas têm gravação habilitada');
    }
    
  } catch (error) {
    console.error('❌ Erro ao verificar configurações:', error);
  }
}

checkCameraRecordingConfig();