/**
 * Script para criar gravações no banco de dados para arquivos existentes
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Diretório onde estão os arquivos
const recordingsPath = 'C:\\Users\\GouveiaRx\\Downloads\\NewCAM\\backend\\recordings';

function getVideoInfo(filePath) {
  const stats = fs.statSync(filePath);
  return {
    size: stats.size,
    duration: 60, // Duração padrão em segundos
    resolution: '1920x1080', // Resolução padrão
    format: 'mp4'
  };
}

async function createTestRecordings() {
  try {
    console.log('🔍 Procurando arquivos MP4 existentes...');
    
    if (!fs.existsSync(recordingsPath)) {
      console.error(`❌ Diretório não encontrado: ${recordingsPath}`);
      return;
    }
    
    const files = fs.readdirSync(recordingsPath)
      .filter(file => file.endsWith('.mp4'))
      .map(file => {
        const fullPath = path.join(recordingsPath, file);
        const relativePath = path.relative('C:\\Users\\GouveiaRx\\Downloads\\NewCAM\\backend', fullPath);
        return {
          filename: file,
          fullPath: fullPath,
          relativePath: relativePath.replace(/\\/g, '/')
        };
      });
    
    console.log(`✅ Encontrados ${files.length} arquivos MP4:`);
    files.forEach((file, index) => {
      console.log(`${index + 1}. ${file.filename}`);
    });
    
    // Buscar câmeras existentes
    console.log('\n🔍 Buscando câmeras no banco de dados...');
    const { data: cameras, error: camerasError } = await supabase
      .from('cameras')
      .select('id, name')
      .limit(1);
    
    if (camerasError) {
      console.error('❌ Erro ao buscar câmeras:', camerasError);
      return;
    }
    
    if (cameras.length === 0) {
      console.log('⚠️  Nenhuma câmera encontrada. Criando câmera de teste...');
      
      const { data: newCamera, error: createCameraError } = await supabase
        .from('cameras')
        .insert({
          id: uuidv4(),
          name: 'Câmera de Teste',
          rtsp_url: 'rtsp://test-camera/stream',
          status: 'online',
          location: 'Teste'
        })
        .select()
        .single();
      
      if (createCameraError) {
        console.error('❌ Erro ao criar câmera:', createCameraError);
        return;
      }
      
      cameras.push(newCamera);
      console.log(`✅ Câmera criada: ${newCamera.name} (${newCamera.id})`);
    }
    
    const testCamera = cameras[0];
    console.log(`📹 Usando câmera: ${testCamera.name} (${testCamera.id})`);
    
    // Criar gravações para cada arquivo
    console.log('\n🎬 Criando gravações no banco de dados...');
    
    for (const file of files) {
      // Verificar se já existe uma gravação para este arquivo
      const { data: existingRecording } = await supabase
        .from('recordings')
        .select('id')
        .eq('filename', file.filename)
        .single();
      
      if (existingRecording) {
        console.log(`⚠️  Gravação já existe para: ${file.filename}`);
        continue;
      }
      
      const videoInfo = getVideoInfo(file.fullPath);
      
      const recordingData = {
        id: uuidv4(),
        camera_id: testCamera.id,
        filename: file.filename,
        file_path: file.relativePath,
        file_size: videoInfo.size,
        duration: videoInfo.duration,
        resolution: videoInfo.resolution,
        codec: 'h264',
        status: 'completed',
        start_time: new Date().toISOString(),
        end_time: new Date(Date.now() + 60000).toISOString() // 1 minuto depois
      };
      
      const { data: newRecording, error: createError } = await supabase
        .from('recordings')
        .insert(recordingData)
        .select()
        .single();
      
      if (createError) {
        console.error(`❌ Erro ao criar gravação para ${file.filename}:`, createError);
      } else {
        console.log(`✅ Gravação criada: ${file.filename}`);
        console.log(`   ID: ${newRecording.id}`);
        console.log(`   URL de teste: http://localhost:3002/api/recordings/${newRecording.id}/video`);
      }
    }
    
    console.log('\n🎉 Processo concluído!');
    
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

createTestRecordings();