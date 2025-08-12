import { supabaseAdmin } from './backend/src/config/database.js';

async function checkCameras() {
  console.log('🔍 Verificando configurações das câmeras...');
  
  try {
    const { data: cameras, error } = await supabaseAdmin
      .from('cameras')
      .select('*');
    
    if (error) {
      console.error('❌ Erro ao buscar câmeras:', error);
      return;
    }
    
    console.log(`📹 Encontradas ${cameras.length} câmeras:`);
    
    cameras.forEach((cam, index) => {
      console.log(`\n--- Câmera ${index + 1} ---`);
      console.log(`ID: ${cam.id}`);
      console.log(`Nome: ${cam.name}`);
      console.log(`RTSP URL: ${cam.rtsp_url || 'NÃO CONFIGURADA'}`);
      console.log(`Status: ${cam.status}`);
      console.log(`Recording Enabled: ${cam.recording_enabled}`);
      console.log(`Created At: ${cam.created_at}`);
    });
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
  
  process.exit(0);
}

checkCameras().catch(console.error);