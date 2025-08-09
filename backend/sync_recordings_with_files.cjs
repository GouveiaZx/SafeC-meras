const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function syncRecordingsWithFiles() {
  console.log('🔄 Sincronizando gravações com arquivos físicos...');
  
  try {
    // 1. Buscar todas as gravações com local_path null
    console.log('\n1. Buscando gravações sem local_path...');
    const { data: recordings, error } = await supabase
      .from('recordings')
      .select('*')
      .is('local_path', null)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('❌ Erro ao buscar gravações:', error);
      return;
    }
    
    console.log(`📋 Encontradas ${recordings.length} gravações sem local_path`);
    
    // 2. Buscar todos os arquivos MP4 físicos
    console.log('\n2. Buscando arquivos MP4 físicos...');
    const storageDir = path.join(__dirname, 'storage', 'www', 'record', 'live');
    const mp4Files = [];
    
    function findMp4Files(dir) {
      if (!fs.existsSync(dir)) return;
      
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          findMp4Files(fullPath);
        } else if (item.endsWith('.mp4')) {
          const stats = fs.statSync(fullPath);
          mp4Files.push({
            fullPath,
            filename: path.basename(item, '.mp4'),
            size: stats.size,
            mtime: stats.mtime
          });
        }
      }
    }
    
    findMp4Files(storageDir);
    console.log(`📁 Encontrados ${mp4Files.length} arquivos MP4`);
    
    // 3. Tentar fazer correspondência entre gravações e arquivos
    console.log('\n3. Fazendo correspondência entre gravações e arquivos...');
    let updatedCount = 0;
    
    for (const recording of recordings) {
      console.log(`\n🔍 Processando gravação ${recording.id}...`);
      console.log(`   Filename: ${recording.filename}`);
      console.log(`   Camera: ${recording.camera_id}`);
      
      // Tentar encontrar arquivo correspondente
      const matchingFile = mp4Files.find(file => {
        // Verificar se o nome do arquivo contém o timestamp da gravação
        const recordingTimestamp = new Date(recording.created_at).getTime();
        const filenameTimestamp = recording.filename.replace('recording_', '');
        
        return file.filename.includes(filenameTimestamp) || 
               file.fullPath.includes(recording.camera_id);
      });
      
      if (matchingFile) {
        console.log(`✅ Arquivo encontrado: ${matchingFile.fullPath}`);
        console.log(`   Tamanho: ${matchingFile.size} bytes`);
        
        // Atualizar gravação no banco
        const { error: updateError } = await supabase
          .from('recordings')
          .update({
            local_path: matchingFile.fullPath,
            file_size: matchingFile.size,
            status: 'completed'
          })
          .eq('id', recording.id);
        
        if (updateError) {
          console.error(`❌ Erro ao atualizar gravação ${recording.id}:`, updateError);
        } else {
          console.log(`✅ Gravação ${recording.id} atualizada com sucesso`);
          updatedCount++;
        }
      } else {
        console.log(`❌ Nenhum arquivo correspondente encontrado`);
      }
    }
    
    console.log(`\n📊 Resumo:`);
    console.log(`   Gravações processadas: ${recordings.length}`);
    console.log(`   Gravações atualizadas: ${updatedCount}`);
    console.log(`   Arquivos MP4 encontrados: ${mp4Files.length}`);
    
    // 4. Listar arquivos MP4 encontrados
    if (mp4Files.length > 0) {
      console.log(`\n📁 Arquivos MP4 disponíveis:`);
      mp4Files.forEach((file, index) => {
        console.log(`   ${index + 1}. ${file.fullPath}`);
        console.log(`      Tamanho: ${file.size} bytes`);
        console.log(`      Modificado: ${file.mtime}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
  
  console.log('\n✅ Sincronização concluída');
}

syncRecordingsWithFiles();