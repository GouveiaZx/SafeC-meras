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

async function syncExistingCameras() {
  try {
    console.log('🔄 Sincronizando gravações de câmeras existentes...');
    
    const recordingsPath = 'c:\\Users\\GouveiaRx\\Downloads\\NewCAM\\storage\\www\\record\\live';
    
    // Buscar todas as câmeras existentes
    const { data: cameras, error: camerasError } = await supabase
      .from('cameras')
      .select('id, name');
    
    if (camerasError) {
      console.error('❌ Erro ao buscar câmeras:', camerasError);
      return;
    }
    
    console.log(`📹 Encontradas ${cameras.length} câmeras ativas no banco`);
    
    // Listar todos os diretórios de gravação
    const cameraDirectories = await fs.readdir(recordingsPath);
    console.log(`📁 Encontrados ${cameraDirectories.length} diretórios de gravação`);
    
    let totalSynced = 0;
    let totalSkipped = 0;
    let totalIgnored = 0;
    
    // Processar apenas câmeras que existem no banco
    for (const camera of cameras) {
      const cameraPath = path.join(recordingsPath, camera.id);
      
      try {
        const stat = await fs.stat(cameraPath);
        
        if (!stat.isDirectory()) {
          console.log(`⚠️  ${camera.name}: Não é um diretório`);
          continue;
        }
        
        console.log(`\n📁 Processando: ${camera.name}`);
        console.log(`   ID: ${camera.id}`);
        
        // Listar diretórios de data
        const dateDirs = await fs.readdir(cameraPath);
        
        for (const dateDir of dateDirs) {
          const datePath = path.join(cameraPath, dateDir);
          
          try {
            const dateStat = await fs.stat(datePath);
            
            if (!dateStat.isDirectory()) continue;
            
            console.log(`  📅 Processando data: ${dateDir}`);
            
            // Listar arquivos MP4
            const files = await fs.readdir(datePath);
            const mp4Files = files.filter(file => file.endsWith('.mp4'));
            
            console.log(`     Encontrados ${mp4Files.length} arquivos MP4`);
            
            for (const file of mp4Files) {
              const filePath = path.join(datePath, file);
              
              try {
                const fileStats = await fs.stat(filePath);
                
                // Verificar se já existe no banco
                const { data: existing, error: checkError } = await supabase
                  .from('recordings')
                  .select('id')
                  .eq('camera_id', camera.id)
                  .eq('filename', file)
                  .maybeSingle();
                
                if (checkError && checkError.code !== 'PGRST116') {
                  console.log(`     ❌ Erro ao verificar ${file}: ${checkError.message}`);
                  continue;
                }
                
                if (existing) {
                  console.log(`     ⏭️  Já existe: ${file}`);
                  totalSkipped++;
                  continue;
                }
                
                // Extrair informações do nome do arquivo
                // Formato: .2025-08-08-12-29-45-0.mp4 ou 2025-07-29-20-35-26-0.mp4
                const cleanFilename = file.replace('.mp4', '').replace(/^\./, ''); // Remove ponto inicial se existir
                const filenameParts = cleanFilename.split('-');
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
                    
                    // Verificar se a data é válida
                    if (isNaN(startTime.getTime())) {
                      console.log(`     ⚠️  Data inválida no nome do arquivo ${file}, usando data de criação`);
                      startTime = fileStats.birthtime;
                    }
                  } else {
                    startTime = fileStats.birthtime;
                  }
                } catch (parseError) {
                  console.log(`     ⚠️  Erro ao parsear data do arquivo ${file}: ${parseError.message}`);
                  startTime = fileStats.birthtime;
                }
                
                // Calcular duração estimada (baseada no tamanho do arquivo)
                // Estimativa: ~1MB por 10 segundos de vídeo em qualidade média
                const estimatedDuration = Math.floor(fileStats.size / 100000); // Estimativa em segundos
                
                const endTime = new Date(startTime.getTime() + estimatedDuration * 1000);
                
                // Determinar resolução baseada no tamanho do arquivo
                let resolution = '720p';
                let quality = 'medium';
                if (fileStats.size > 50000000) { // > 50MB
                  resolution = '1080p';
                  quality = 'high';
                } else if (fileStats.size < 5000000) { // < 5MB
                  resolution = '480p';
                  quality = 'low';
                }
                
                // Criar registro no banco
                const recordingData = {
                  id: crypto.randomUUID(),
                  camera_id: camera.id,
                  filename: file,
                  file_path: `record/live/${camera.id}/${dateDir}/${file}`,
                  file_size: fileStats.size,
                  duration: estimatedDuration,
                  start_time: startTime.toISOString(),
                  end_time: endTime.toISOString(),
                  status: 'completed',
                  upload_status: 'pending',
                  quality: quality,
                  codec: 'h264',
                  resolution: resolution,
                  fps: 25, // Estimativa padrão
                  bitrate: Math.floor(fileStats.size * 8 / estimatedDuration), // Estimativa
                  audio_enabled: true,
                  created_at: fileStats.birthtime.toISOString(),
                  updated_at: new Date().toISOString(),
                  metadata: {
                    synced_from_filesystem: true,
                    original_path: filePath,
                    file_created: fileStats.birthtime.toISOString(),
                    file_modified: fileStats.mtime.toISOString(),
                    estimated_values: true,
                    sync_date: new Date().toISOString()
                  }
                };
                
                const { error: insertError } = await supabase
                  .from('recordings')
                  .insert(recordingData);
                
                if (insertError) {
                  console.error(`     ❌ Erro ao inserir ${file}: ${insertError.message}`);
                } else {
                  const sizeMB = (fileStats.size / 1024 / 1024).toFixed(2);
                  const durationMin = (estimatedDuration / 60).toFixed(1);
                  console.log(`     ✅ ${file} (${sizeMB} MB, ~${durationMin} min)`);
                  totalSynced++;
                }
              } catch (fileError) {
                console.log(`     ❌ Erro ao processar ${file}: ${fileError.message}`);
              }
            }
          } catch (dateError) {
            console.log(`  ❌ Erro ao processar data ${dateDir}: ${dateError.message}`);
          }
        }
      } catch (cameraError) {
        console.log(`⚠️  ${camera.name}: Diretório não encontrado (${camera.id})`);
        totalIgnored++;
      }
    }
    
    // Verificar diretórios órfãos (câmeras antigas)
    console.log('\n🔍 Verificando diretórios órfãos...');
    const existingCameraIds = new Set(cameras.map(c => c.id));
    const orphanDirs = cameraDirectories.filter(dir => !existingCameraIds.has(dir));
    
    if (orphanDirs.length > 0) {
      console.log(`⚠️  Encontrados ${orphanDirs.length} diretórios órfãos (câmeras antigas):`);
      orphanDirs.forEach(dir => {
        console.log(`   - ${dir}`);
      });
      console.log('   💡 Estes diretórios contêm gravações de câmeras que não estão mais no banco.');
      console.log('   💡 Para processar essas gravações, as câmeras precisam ser recriadas no banco.');
    }
    
    console.log(`\n🎉 Sincronização concluída!`);
    console.log(`   ✅ ${totalSynced} gravações adicionadas`);
    console.log(`   ⏭️  ${totalSkipped} gravações já existiam`);
    console.log(`   ⚠️  ${totalIgnored} câmeras sem diretório`);
    console.log(`   🗂️  ${orphanDirs.length} diretórios órfãos ignorados`);
    
    // Verificar estatísticas finais
    console.log('\n📊 Buscando estatísticas finais...');
    
    const { data: allRecordings, error: statsError } = await supabase
      .from('recordings')
      .select('status, upload_status, file_size');
    
    if (statsError) {
      console.error('❌ Erro ao buscar estatísticas:', statsError);
    } else {
      const statusCount = {};
      const uploadCount = {};
      let totalSize = 0;
      
      allRecordings.forEach(record => {
        statusCount[record.status] = (statusCount[record.status] || 0) + 1;
        uploadCount[record.upload_status] = (uploadCount[record.upload_status] || 0) + 1;
        totalSize += record.file_size || 0;
      });
      
      console.log(`\n📈 Estatísticas do banco de dados:`);
      console.log(`   📊 Total de gravações: ${allRecordings.length}`);
      console.log(`   📁 Tamanho total: ${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB`);
      console.log(`   📋 Por status:`, statusCount);
      console.log(`   📤 Por upload:`, uploadCount);
    }
    
  } catch (error) {
    console.error('❌ Erro geral na sincronização:', error);
  }
}

syncExistingCameras();