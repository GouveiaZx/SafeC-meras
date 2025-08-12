import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createRealRecording() {
  try {
    // Verificar se o arquivo existe
    const filePath = 'C:\\Users\\GouveiaRx\\Downloads\\NewCAM\\backend\\storage\\recordings\\test_real_video.mp4';
    const stats = await fs.stat(filePath);
    
    console.log('📁 Arquivo encontrado:', {
      path: filePath,
      size: stats.size,
      created: stats.birthtime
    });
    
    // Buscar uma câmera existente
    const { data: cameras, error: cameraError } = await supabase
      .from('cameras')
      .select('*')
      .limit(1);
    
    if (cameraError || !cameras || cameras.length === 0) {
      throw new Error('Nenhuma câmera encontrada');
    }
    
    const camera = cameras[0];
    console.log('📹 Câmera encontrada:', camera.id, camera.name);
    
    // Criar gravação no banco
    const recordingData = {
      id: uuidv4(),
      camera_id: camera.id,
      filename: 'test_real_video',
      file_path: 'test_real_video.mp4',
      local_path: 'test_real_video.mp4',
      file_size: stats.size,
      duration: 10, // 10 segundos
      start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 10000).toISOString(),
      status: 'completed'
    };
    
    const { data: recording, error: recordingError } = await supabase
      .from('recordings')
      .insert(recordingData)
      .select()
      .single();
    
    if (recordingError) {
      throw recordingError;
    }
    
    console.log('✅ Gravação criada com sucesso:', {
      id: recording.id,
      filename: recording.filename,
      file_path: recording.file_path,
      file_size: recording.file_size
    });
    
    return recording;
    
  } catch (error) {
    console.error('❌ Erro ao criar gravação:', error);
    throw error;
  }
}

createRealRecording()
  .then(recording => {
    console.log('🎉 Processo concluído! ID da gravação:', recording.id);
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Falha no processo:', error.message);
    process.exit(1);
  });