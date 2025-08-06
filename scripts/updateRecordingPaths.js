import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const RECORDINGS_PATH = 'C:\\Users\\GouveiaRx\\Downloads\\NewCAM\\storage\\www\\record\\live';

async function updateRecordingPaths() {
  console.log('🔄 Atualizando caminhos das gravações...');
  
  try {
    // Buscar todas as gravações
    const { data: recordings, error } = await supabase
      .from('recordings')
      .select('*');
    
    if (error) {
      throw error;
    }
    
    console.log(`📊 Total de gravações: ${recordings.length}`);
    
    // Buscar arquivos físicos
    function scanDirectory(dir) {
      const files = [];
      try {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
          const fullPath = path.join(dir, item.name);
          if (item.isDirectory()) {
            files.push(...scanDirectory(fullPath));
          } else if (item.name.endsWith('.mp4')) {
            files.push({
              filename: item.name,
              fullPath: fullPath,
              relativePath: path.relative('C:\\Users\\GouveiaRx\\Downloads\\NewCAM', fullPath).replace(/\\/g, '/')
            });
          }
        }
      } catch (err) {
        console.log(`⚠️ Erro ao ler diretório ${dir}: ${err.message}`);
      }
      return files;
    }
    
    const physicalFiles = scanDirectory(RECORDINGS_PATH);
    console.log(`📁 Arquivos físicos encontrados: ${physicalFiles.length}`);
    
    let updatedCount = 0;
    
    // Atualizar caminhos
    for (const recording of recordings) {
      const matchingFile = physicalFiles.find(file => file.filename === recording.filename);
      
      if (matchingFile) {
        console.log(`🔄 Atualizando: ${recording.filename}`);
        console.log(`   De: ${recording.file_path}`);
        console.log(`   Para: ${matchingFile.relativePath}`);
        
        const { error: updateError } = await supabase
          .from('recordings')
          .update({
            file_path: matchingFile.relativePath,
            updated_at: new Date().toISOString()
          })
          .eq('id', recording.id);
        
        if (updateError) {
          console.error(`❌ Erro ao atualizar ${recording.filename}:`, updateError);
        } else {
          console.log(`✅ Atualizado: ${recording.filename}`);
          updatedCount++;
        }
      } else {
        console.log(`⚠️ Arquivo físico não encontrado para: ${recording.filename}`);
      }
    }
    
    console.log(`\n📈 Resumo:`);
    console.log(`✅ Registros atualizados: ${updatedCount}`);
    console.log(`📁 Total de gravações: ${recordings.length}`);
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

updateRecordingPaths();