/**
 * Script para testar processamento direto de gravação
 * Bypass webhook e processa arquivo diretamente no banco
 */

import { supabaseAdmin } from '../config/database.js';
import path from 'path';
import fs from 'fs/promises';

const CAMERA_ID = '12eb90d2-c6f6-4ced-a312-92df308b7246';
const FILE_PATH = 'C:/Users/GouveiaRx/Downloads/NewCAM/storage/www/record/live/12eb90d2-c6f6-4ced-a312-92df308b7246/2025-08-22/.2025-08-22-06-15-39-0.mp4';
const CLEAN_FILENAME = '2025-08-22-06-15-39-0.mp4';

async function processRecordingDirectly() {
  console.log('🎬 Processando gravação diretamente...');
  
  try {
    // 1. Verificar se arquivo existe
    console.log('📁 Verificando arquivo:', FILE_PATH);
    
    const stats = await fs.stat(FILE_PATH);
    console.log('✅ Arquivo encontrado:', {
      size: stats.size,
      modified: stats.mtime
    });
    
    // 2. Verificar se câmera existe
    console.log('📹 Verificando câmera:', CAMERA_ID);
    
    const { data: camera, error: cameraError } = await supabaseAdmin
      .from('cameras')
      .select('id, name, active')
      .eq('id', CAMERA_ID)
      .single();
      
    if (cameraError) {
      console.error('❌ Erro ao buscar câmera:', cameraError);
      return;
    }
    
    console.log('✅ Câmera encontrada:', camera);
    
    // 3. Verificar se gravação já existe
    console.log('🔍 Verificando se gravação já existe...');
    
    const { data: existingRecording } = await supabaseAdmin
      .from('recordings')
      .select('id, status')
      .eq('filename', CLEAN_FILENAME)
      .eq('camera_id', CAMERA_ID)
      .single();
      
    if (existingRecording) {
      console.log('⚠️ Gravação já existe:', existingRecording);
      return;
    }
    
    // 4. Criar nova gravação
    console.log('➕ Criando nova gravação...');
    
    const normalizedPath = 'storage/www/record/live/12eb90d2-c6f6-4ced-a312-92df308b7246/2025-08-22/2025-08-22-06-15-39-0.mp4';
    const now = new Date().toISOString();
    const startTime = '2025-08-22T06:15:39.000Z';
    
    const recordingData = {
      camera_id: CAMERA_ID,
      filename: CLEAN_FILENAME,
      file_path: normalizedPath,
      local_path: normalizedPath,
      file_size: stats.size,
      duration: 37,
      start_time: startTime,
      started_at: startTime,
      end_time: '2025-08-22T06:16:16.000Z',
      ended_at: now,
      status: 'completed',
      quality: 'medium',
      codec: 'h264',
      resolution: '1920x1080',
      width: 1920,
      height: 1080,
      fps: 25,
      metadata: {
        processed_by: 'testRecordingDirectly',
        processed_at: now,
        file_found_at: FILE_PATH,
        created_directly: true
      },
      created_at: now,
      updated_at: now
    };
    
    const { data: recording, error: insertError } = await supabaseAdmin
      .from('recordings')
      .insert(recordingData)
      .select()
      .single();
      
    if (insertError) {
      console.error('❌ Erro ao inserir gravação:', insertError);
      return;
    }
    
    console.log('✅ Gravação criada com sucesso:', recording);
    console.log('🎉 ID da gravação:', recording.id);
    
    // 5. Verificar se foi criada
    const { data: verification } = await supabaseAdmin
      .from('recordings')
      .select('*')
      .eq('id', recording.id)
      .single();
      
    console.log('🔍 Verificação final:', verification);
    
  } catch (error) {
    console.error('❌ Erro no processamento direto:', error);
  }
}

processRecordingDirectly().then(() => {
  console.log('✅ Script concluído');
  process.exit(0);
}).catch(error => {
  console.error('💥 Erro fatal:', error);
  process.exit(1);
});