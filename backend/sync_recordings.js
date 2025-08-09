import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function syncRecordings() {
  try {
    console.log('🔄 Sincronizando gravações existentes com o banco de dados...');
    
    const recordingsPath = 'c:\\Users\\GouveiaRx\\Downloads\\NewCAM\\storage\\www\\record\\live';
    
    // Buscar todas as câmeras
    const { data: cameras, error: camerasError } = await supabase
      .from('cameras')
      .select('id, name');
    
    if (camerasError) {
      console.error('❌ Erro ao buscar câmeras:', camerasError);
      return;
    }
    
    console.log(`📹 Encontradas ${cameras.length} câmeras no banco`);
    
    let totalSynced = 0;
    
    // Percorrer cada diretório de câmera
    for (const camera of cameras) {
      const cameraPath = path.join(recordingsPath, camera.id);
      
      try {
        const exists = await fs.access(cameraPath).then(() => true).catch(() => false);
        if (!exists) {
          console.log(`⚠️  Diretório não encontrado para câmera ${camera.name} (${camera.id})`);
          continue;
        }
        
        console.log(`\n📁 Processando câmera: ${camera.name} (${camera.id})`);
        
        // Listar diretórios de data
        const dateDirs = await fs.readdir(cameraPath);
        
        for (const dateDir of dateDirs) {
          const datePath = path.join(cameraPath, dateDir);
          const stat = await fs.stat(datePath);
          
          if (!stat.isDirectory()) continue;
          
          console.log(`  📅 Processando data: ${dateDir}`);
          
          // Listar arquivos MP4
          const files = await fs.readdir(datePath);
          const mp4Files = files.filter(file => file.endsWith('.mp4'));
          
          for (const file of mp4Files) {
            const filePath = path.join(datePath, file);
            const fileStats = await fs.stat(filePath);
            
            // Verificar se já existe no banco
            const { data: existing, error: checkError } = await supabase
              .from('recordings')
              .select('id')
              .eq('camera_id', camera.id)
              .eq('filename', file)
              .single();
            
            if (existing) {
              console.log(`    ⏭️  Arquivo já existe no banco: ${file}`);
              continue;
            }
            
            // Extrair informações do nome do arquivo
            // Formato: 2025-07-29-20-35-26-0.mp4
            const filenameParts = file.replace('.mp4', '').split('-');
            let startTime;
            
            try {
              if (filenameParts.length >= 6) {
                const year = filenameParts[0];
                const month = filenameParts[1];
                const day = filenameParts[2];
                const hour = filenameParts[3];
                const minute = filenameParts[4];
                const second = filenameParts[5];
                
                startTime = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
              } else {
                startTime = fileStats.birthtime;
              }
            } catch (parseError) {
              startTime = fileStats.birthtime;
            }
            
            // Calcular duração estimada (baseada no tamanho do arquivo)
            const estimatedDuration = Math.floor(fileStats.size / 1000000 * 10); // Estimativa grosseira
            
            const endTime = new Date(startTime.getTime() + estimatedDuration * 1000);
            
            // Criar registro no banco
            const recordingData = {
              id: crypto.randomUUID(),
              camera_id: camera.id,
              filename: file,
              file_path: path.relative('c:\\Users\\GouveiaRx\\Downloads\\NewCAM\\storage\\www', filePath).replace(/\\/g, '/'),
              file_size: fileStats.size,
              duration: estimatedDuration,
              start_time: startTime.toISOString(),
              end_time: endTime.toISOString(),
              status: 'completed',
              upload_status: 'pending',
              quality: 'medium',
              codec: 'h264',
              created_at: fileStats.birthtime.toISOString(),
              updated_at: new Date().toISOString(),
              metadata: {
                synced_from_filesystem: true,
                original_path: filePath,
                file_created: fileStats.birthtime.toISOString(),
                file_modified: fileStats.mtime.toISOString()
              }
            };
            
            const { error: insertError } = await supabase
              .from('recordings')
              .insert(recordingData);
            
            if (insertError) {
              console.error(`    ❌ Erro ao inserir ${file}:`, insertError.message);
            } else {
              console.log(`    ✅ Sincronizado: ${file} (${(fileStats.size / 1024 / 1024).toFixed(2)} MB)`);
              totalSynced++;
            }
          }
        }
      } catch (cameraError) {
        console.error(`❌ Erro ao processar câmera ${camera.name}:`, cameraError.message);
      }
    }
    
    console.log(`\n🎉 Sincronização concluída! ${totalSynced} gravações adicionadas ao banco de dados.`);
    
    // Verificar estatísticas finais
    const { data: stats, error: statsError } = await supabase
      .from('recordings')
      .select('status, upload_status')
      .then(result => {
        if (result.error) throw result.error;
        
        const statusCount = {};
        const uploadCount = {};
        
        result.data.forEach(record => {
          statusCount[record.status] = (statusCount[record.status] || 0) + 1;
          uploadCount[record.upload_status] = (uploadCount[record.upload_status] || 0) + 1;
        });
        
        return { statusCount, uploadCount, total: result.data.length };
      });
    
    if (!statsError) {
      console.log('\n📊 Estatísticas finais:');
      console.log(`   Total de gravações: ${stats.total}`);
      console.log('   Por status:', stats.statusCount);
      console.log('   Por upload:', stats.uploadCount);
    }
    
  } catch (error) {
    console.error('❌ Erro geral na sincronização:', error);
  }
}

syncRecordings();