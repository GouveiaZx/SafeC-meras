import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function syncExistingRecordings() {
  console.log('🔄 Sincronizando gravações existentes com o banco de dados...\n');

  // 1. Encontrar arquivos físicos - testar múltiplos caminhos
  const possiblePaths = [
    path.join(process.cwd(), 'storage', 'www', 'record', 'live'),
    path.join(process.cwd(), 'storage', 'bin', 'www', 'record', 'live'),
    path.join(process.cwd(), '..', 'storage', 'www', 'record', 'live'),
    path.join(process.cwd(), '..', 'storage', 'bin', 'www', 'record', 'live'),
    'c:\\Users\\GouveiaRx\\Downloads\\NewCAM\\storage\\www\\record\\live',
    'c:\\Users\\GouveiaRx\\Downloads\\NewCAM\\storage\\bin\\www\\record\\live'
  ];

  let recordingsPath = null;
  for (const testPath of possiblePaths) {
    if (fs.existsSync(testPath)) {
      recordingsPath = testPath;
      console.log(`📁 Diretório encontrado: ${recordingsPath}`);
      break;
    }
  }

  if (!recordingsPath) {
    console.log('❌ Nenhum diretório de gravações encontrado');
    console.log('Caminhos testados:');
    possiblePaths.forEach(p => console.log(`   - ${p}`));
    return;
  }

  const cameras = fs.readdirSync(recordingsPath, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  console.log(`📹 Câmeras encontradas: ${cameras.length}`);

  let totalFiles = 0;
  let syncedFiles = 0;
  let skippedFiles = 0;

  for (const cameraId of cameras) {
    console.log(`\n📋 Processando câmera: ${cameraId}`);
    
    const cameraPath = path.join(recordingsPath, cameraId);
    const dates = fs.readdirSync(cameraPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const dateDir of dates) {
      const datePath = path.join(cameraPath, dateDir);
      const files = fs.readdirSync(datePath)
        .filter(file => file.endsWith('.mp4'))
        .map(file => {
          const filePath = path.join(datePath, file);
          const stats = fs.statSync(filePath);
          const match = file.match(/(\d{4}-\d{2}-\d{2})-(\d{2}-\d{2}-\d{2})-(\d+)\.mp4/);
          
          return {
            cameraId,
            fileName: file,
            filePath,
            size: stats.size,
            createdAt: stats.birthtime,
            modifiedAt: stats.mtime,
            date: match ? match[1] : null,
            time: match ? match[2] : null,
            segment: match ? parseInt(match[3]) : null
          };
        });

      for (const file of files) {
        totalFiles++;
        
        // Verificar se já existe no banco
        const { data: existing } = await supabase
          .from('recordings')
          .select('id')
          .eq('camera_id', file.cameraId)
          .eq('filename', file.fileName)
          .single();

        if (existing) {
          console.log(`   ⏭️ Já existe: ${file.fileName}`);
          skippedFiles++;
          continue;
        }

        try {
          // Usar timestamps baseados no arquivo modificado
          const startTime = file.modifiedAt;
          const endTime = new Date(startTime.getTime() + 1800 * 1000); // 30 minutos depois

          // Criar registro no banco
          const { data: recording, error } = await supabase
            .from('recordings')
            .insert({
              camera_id: file.cameraId,
              filename: file.fileName,
              file_path: file.filePath.replace(process.cwd(), '').replace(/\\/g, '/'),
              local_path: file.filePath,
              file_size: file.size,
              duration: 1800, // 30 minutos
              start_time: startTime.toISOString(),
              end_time: endTime.toISOString(),
              started_at: startTime.toISOString(),
              stopped_at: endTime.toISOString(),
              quality: 'high',
              codec: 'h264',
              status: 'completed',
              upload_status: 'pending',
              event_type: 'manual',
              created_at: file.createdAt.toISOString(),
              updated_at: new Date().toISOString()
            })
            .select()
            .single();

          if (error) {
            console.error(`   ❌ Erro ao criar: ${file.fileName} - ${error.message}`);
          } else {
            console.log(`   ✅ Criado: ${file.fileName} (${Math.round(file.size/1024/1024)}MB)`);
            syncedFiles++;
          }

        } catch (err) {
          console.error(`   ❌ Erro: ${file.fileName} - ${err.message}`);
        }
      }
    }
  }

  console.log('\n📊 RESUMO DA SINCRONIZAÇÃO:');
  console.log(`   📁 Arquivos totais: ${totalFiles}`);
  console.log(`   ✅ Arquivos sincronizados: ${syncedFiles}`);
  console.log(`   ⏭️ Arquivos pulados (já existem): ${skippedFiles}`);
  console.log(`   ❌ Arquivos com erro: ${totalFiles - syncedFiles - skippedFiles}`);

  // Verificar total no banco
  const { data: totalRecordings } = await supabase
    .from('recordings')
    .select('id', { count: 'exact' });

  console.log(`\n🗄️ Total de registros no banco: ${totalRecordings?.length || 0}`);
}

// Executar sincronização
syncExistingRecordings().catch(console.error);