import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import VideoMetadataExtractor from './src/utils/videoMetadata.js';

// Carregar variáveis de ambiente
dotenv.config();

// Configurar Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const recordingsPath = './storage/www/record/recordings';
const cameraId = 'e4c3adb3-bc1a-4ed6-a92d-cb5f23a27e36';

async function createRecordingsForFiles() {
  console.log('=== CRIANDO REGISTROS PARA ARQUIVOS FÍSICOS ===\n');
  
  try {
    // 1. Verificar se a câmera existe
    const { data: camera, error: cameraError } = await supabase
      .from('cameras')
      .select('*')
      .eq('id', cameraId)
      .single();
    
    if (cameraError || !camera) {
      console.log('❌ Câmera não encontrada. Criando câmera...');
      
      const { data: newCamera, error: createError } = await supabase
        .from('cameras')
        .insert({
          id: cameraId,
          name: 'Câmera Test',
          ip_address: '192.168.1.100',
          port: 554,
          username: 'admin',
          password: 'admin',
          rtsp_url: `rtsp://admin:admin@192.168.1.100:554/stream`,
          status: 'online',
          location: 'Test Location',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (createError) {
        console.error('❌ Erro ao criar câmera:', createError);
        return;
      }
      
      console.log('✅ Câmera criada com sucesso');
    } else {
      console.log('✅ Câmera encontrada:', camera.name);
    }
    
    // 2. Buscar arquivos físicos
    const cameraDir = path.join(recordingsPath, cameraId);
    
    if (!await fs.access(cameraDir).then(() => true).catch(() => false)) {
      console.log('❌ Diretório da câmera não encontrado:', cameraDir);
      return;
    }
    
    const files = await fs.readdir(cameraDir);
    const mp4Files = files.filter(file => file.endsWith('.mp4'));
    
    console.log(`📁 Encontrados ${mp4Files.length} arquivos MP4`);
    
    // 3. Criar registros para cada arquivo
    let created = 0;
    
    for (const filename of mp4Files) {
      const filePath = path.join(cameraDir, filename);
      const relativePath = path.relative(recordingsPath, filePath);
      
      try {
        const stats = await fs.stat(filePath);
        
        console.log(`\n🎬 Processando: ${filename}`);
        console.log(`   📏 Tamanho: ${stats.size} bytes`);
        console.log(`   📅 Modificado: ${stats.mtime}`);
        
        // Extrair metadados
        let metadata = {
          duration: 0,
          resolution: 'N/A',
          format: 'mp4'
        };
        
        try {
          const extractedMetadata = await VideoMetadataExtractor.extractBasicInfo(filePath);
          metadata = {
            ...metadata,
            ...extractedMetadata
          };
          console.log(`   ⏱️ Duração: ${metadata.duration}s`);
          console.log(`   📺 Resolução: ${metadata.resolution}`);
        } catch (metadataError) {
          console.log(`   ⚠️ Erro ao extrair metadados: ${metadataError.message}`);
        }
        
        // Criar registro no banco
        const recordingData = {
          id: randomUUID(),
          camera_id: cameraId,
          filename: filename,
          file_path: relativePath,
          local_path: filePath,
          file_size: stats.size,
          duration: metadata.duration || 0,
          resolution: metadata.resolution || 'N/A',
          status: 'completed',
          start_time: stats.mtime.toISOString(),
          end_time: new Date(stats.mtime.getTime() + (metadata.duration * 1000)).toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: {
            format: 'mp4',
            codec: metadata.codec || 'unknown',
            bitrate: metadata.bitrate || 0,
            fps: metadata.fps || 0,
            created_from_file: true,
            original_mtime: stats.mtime.toISOString()
          }
        };
        
        const { data: recording, error: insertError } = await supabase
          .from('recordings')
          .insert(recordingData)
          .select()
          .single();
        
        if (insertError) {
          console.error(`   ❌ Erro ao criar registro: ${insertError.message}`);
        } else {
          console.log(`   ✅ Registro criado: ${recording.id}`);
          created++;
        }
        
      } catch (error) {
        console.error(`   ❌ Erro ao processar ${filename}:`, error.message);
      }
    }
    
    console.log('\n📊 Resultado:');
    console.log(`  ✅ Registros criados: ${created}`);
    console.log(`  📁 Arquivos processados: ${mp4Files.length}`);
    
  } catch (error) {
    console.error('❌ Erro durante a criação:', error);
    process.exit(1);
  }
}

// Executar criação
createRecordingsForFiles()
  .then(() => {
    console.log('\n🎉 Criação concluída com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Erro fatal:', error);
    process.exit(1);
  });