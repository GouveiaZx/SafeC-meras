/**
 * Script para criar uma gravação de teste com arquivo físico
 * Para testar o streaming de vídeo
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createTestRecording() {
  console.log('🎬 === CRIANDO GRAVAÇÃO DE TESTE ===\n');
  
  try {
    // 1. Criar diretório recordings se não existir
    const recordingsDir = path.join(__dirname, 'recordings');
    if (!fs.existsSync(recordingsDir)) {
      fs.mkdirSync(recordingsDir, { recursive: true });
      console.log('✅ Diretório recordings criado');
    }
    
    // 2. Criar um arquivo MP4 de teste (vazio mas válido)
    const testFilename = `test_recording_${Date.now()}.mp4`;
    const testFilePath = path.join(recordingsDir, testFilename);
    
    // Criar um arquivo MP4 mínimo válido (header básico)
    const mp4Header = Buffer.from([
      // ftyp box
      0x00, 0x00, 0x00, 0x20, // box size (32 bytes)
      0x66, 0x74, 0x79, 0x70, // 'ftyp'
      0x69, 0x73, 0x6F, 0x6D, // 'isom' - major brand
      0x00, 0x00, 0x02, 0x00, // minor version
      0x69, 0x73, 0x6F, 0x6D, // 'isom' - compatible brand
      0x69, 0x73, 0x6F, 0x32, // 'iso2' - compatible brand
      0x61, 0x76, 0x63, 0x31, // 'avc1' - compatible brand
      0x6D, 0x70, 0x34, 0x31, // 'mp41' - compatible brand
      
      // mdat box (empty)
      0x00, 0x00, 0x00, 0x08, // box size (8 bytes)
      0x6D, 0x64, 0x61, 0x74  // 'mdat'
    ]);
    
    fs.writeFileSync(testFilePath, mp4Header);
    const fileStats = fs.statSync(testFilePath);
    
    console.log('✅ Arquivo MP4 de teste criado:', {
      filename: testFilename,
      path: testFilePath,
      size: fileStats.size
    });
    
    // 3. Buscar uma câmera existente
    console.log('\n📹 Buscando câmera existente...');
    const { data: cameras, error: camerasError } = await supabase
      .from('cameras')
      .select('*')
      .limit(1);
    
    if (camerasError || !cameras || cameras.length === 0) {
      console.error('❌ Erro ao buscar câmeras:', camerasError);
      return;
    }
    
    const camera = cameras[0];
    console.log('✅ Câmera encontrada:', {
      id: camera.id,
      name: camera.name,
      ip: camera.ip
    });
    
    // 4. Buscar usuário ativo
    console.log('\n👤 Buscando usuário ativo...');
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
      .eq('active', true)
      .limit(1);
    
    if (usersError || !users || users.length === 0) {
      console.error('❌ Erro ao buscar usuários:', usersError);
      return;
    }
    
    const user = users[0];
    console.log('✅ Usuário encontrado:', {
      id: user.id,
      email: user.email,
      role: user.role
    });
    
    // 5. Criar gravação no banco de dados
    console.log('\n💾 Criando gravação no banco...');
    const recordingData = {
      filename: testFilename,
      file_path: testFilename,
      local_path: testFilename,
      file_size: fileStats.size,
      duration: 10, // 10 segundos fictícios
      camera_id: camera.id,
      status: 'completed',
      start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 10000).toISOString(), // +10 segundos
      started_at: new Date().toISOString(),
       stopped_at: new Date(Date.now() + 10000).toISOString(),
       event_type: 'manual'
     };
    
    const { data: recording, error: recordingError } = await supabase
      .from('recordings')
      .insert([recordingData])
      .select()
      .single();
    
    if (recordingError) {
      console.error('❌ Erro ao criar gravação:', recordingError);
      return;
    }
    
    console.log('✅ Gravação criada com sucesso:', {
      id: recording.id,
      filename: recording.filename,
      file_path: recording.file_path,
      local_path: recording.local_path,
      file_size: recording.file_size
    });
    
    // 6. Testar URL de streaming
    console.log('\n🎥 URL de streaming para teste:');
    console.log(`http://localhost:3002/api/recordings/${recording.id}/stream`);
    
    console.log('\n🎉 Gravação de teste criada com sucesso!');
    console.log('📝 Agora você pode testar o streaming com esta gravação.');
    
    return recording;
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
}

createTestRecording();