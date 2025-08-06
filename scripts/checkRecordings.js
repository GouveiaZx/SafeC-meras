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

async function checkRecordings() {
  console.log('🔍 Verificando gravações...');
  
  try {
    // Buscar gravações no banco
    const { data: recordings, error } = await supabase
      .from('recordings')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      throw error;
    }
    
    console.log(`\n📊 Total de gravações no banco: ${recordings.length}`);
    
    let foundFiles = 0;
    let notFoundFiles = 0;
    
    for (const recording of recordings) {
      const fullPath = path.join('C:\\Users\\GouveiaRx\\Downloads\\NewCAM', recording.file_path);
      const exists = fs.existsSync(fullPath);
      
      if (exists) {
        console.log(`✅ ${recording.filename}`);
        foundFiles++;
      } else {
        console.log(`❌ ${recording.filename} - ${recording.file_path}`);
        notFoundFiles++;
      }
    }
    
    console.log(`\n📈 Resumo:`);
    console.log(`✅ Arquivos encontrados: ${foundFiles}`);
    console.log(`❌ Arquivos não encontrados: ${notFoundFiles}`);
    
    // Verificar arquivos físicos
    console.log(`\n📁 Verificando arquivos físicos em: ${RECORDINGS_PATH}`);
    
    function scanDirectory(dir) {
      const files = [];
      try {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
          const fullPath = path.join(dir, item.name);
          if (item.isDirectory()) {
            files.push(...scanDirectory(fullPath));
          } else if (item.name.endsWith('.mp4')) {
            files.push(fullPath);
          }
        }
      } catch (err) {
        console.log(`⚠️ Erro ao ler diretório ${dir}: ${err.message}`);
      }
      return files;
    }
    
    const physicalFiles = scanDirectory(RECORDINGS_PATH);
    console.log(`📁 Arquivos MP4 físicos encontrados: ${physicalFiles.length}`);
    
    physicalFiles.forEach(file => {
      console.log(`📄 ${file}`);
    });
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

checkRecordings();