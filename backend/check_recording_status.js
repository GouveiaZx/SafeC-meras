import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkRecordingStatus() {
  console.log('🔍 VERIFICANDO STATUS DE GRAVAÇÃO');
  console.log('='.repeat(50));
  
  try {
    // 1. Verificar câmeras e configuração de gravação
    const { data: cameras, error: cameraError } = await supabase
      .from('cameras')
      .select('id, name, status, rtsp_url, recording_enabled');
    
    if (cameraError) {
      console.error('❌ Erro ao buscar câmeras:', cameraError);
      return;
    }
    
    console.log(`\n📹 CÂMERAS ENCONTRADAS: ${cameras?.length || 0}`);
    cameras?.forEach(cam => {
      const recordingStatus = cam.recording_enabled ? '🔴 GRAVANDO' : '⚪ SEM GRAVAÇÃO';
      console.log(`- ${cam.name} (${cam.id})`);
      console.log(`  Status: ${cam.status}`);
      console.log(`  RTSP: ${cam.rtsp_url || 'Não configurado'}`);
      console.log(`  Gravação: ${recordingStatus}`);
      console.log('');
    });
    
    // 2. Verificar gravações recentes
    const { data: recordings, error: recordingError } = await supabase
      .from('recordings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (recordingError) {
      console.error('❌ Erro ao buscar gravações:', recordingError);
    } else {
      console.log(`\n📼 GRAVAÇÕES RECENTES: ${recordings?.length || 0}`);
      recordings?.forEach(rec => {
        const duration = rec.duration ? `${Math.round(rec.duration / 60)}min` : 'N/A';
        console.log(`- ${rec.filename} (${duration})`);
        console.log(`  Câmera: ${rec.camera_id}`);
        console.log(`  Data: ${new Date(rec.created_at).toLocaleString('pt-BR')}`);
        console.log(`  Status: ${rec.status}`);
        console.log('');
      });
    }
    
    // 3. Verificar diretório de gravações
    const recordingsPath = path.join(process.cwd(), 'recordings', 'record', 'live');
    console.log(`\n📁 VERIFICANDO DIRETÓRIO: ${recordingsPath}`);
    
    if (fs.existsSync(recordingsPath)) {
      const cameraFolders = fs.readdirSync(recordingsPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
      
      console.log(`✅ Diretório existe com ${cameraFolders.length} pastas de câmeras`);
      
      cameraFolders.forEach(cameraId => {
        const cameraPath = path.join(recordingsPath, cameraId);
        try {
          const files = fs.readdirSync(cameraPath)
            .filter(file => file.endsWith('.mp4'));
          console.log(`  📹 ${cameraId}: ${files.length} arquivos MP4`);
        } catch (err) {
          console.log(`  📹 ${cameraId}: Erro ao ler diretório`);
        }
      });
    } else {
      console.log('❌ Diretório de gravações não existe');
    }
    
    // 4. Verificar configuração de gravação automática
    const camerasWithRecording = cameras?.filter(cam => cam.recording_enabled) || [];
    
    console.log(`\n⚙️ RESUMO DO SISTEMA:`);
    console.log(`- Total de câmeras: ${cameras?.length || 0}`);
    console.log(`- Câmeras com gravação habilitada: ${camerasWithRecording.length}`);
    console.log(`- Gravações no banco: ${recordings?.length || 0}`);
    
    if (camerasWithRecording.length === 0) {
      console.log('\n⚠️  PROBLEMA IDENTIFICADO:');
      console.log('   Nenhuma câmera tem gravação habilitada!');
      console.log('   Para habilitar gravação, execute:');
      console.log('   UPDATE cameras SET recording_enabled = true WHERE id = \'[camera_id]\';');
    }
    
    if (!recordings || recordings.length === 0) {
      console.log('\n⚠️  PROBLEMA IDENTIFICADO:');
      console.log('   Não há gravações no banco de dados!');
      console.log('   Possíveis causas:');
      console.log('   1. ZLMediaKit não está rodando');
      console.log('   2. Webhook não está configurado');
      console.log('   3. Câmeras não estão enviando stream RTSP');
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
}

checkRecordingStatus();