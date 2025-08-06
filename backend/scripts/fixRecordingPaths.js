/**
 * Script para corrigir caminhos das gravações no banco de dados
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
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

// Diretórios onde procurar arquivos
const searchPaths = [
  'C:\\Users\\GouveiaRx\\Downloads\\NewCAM\\backend\\recordings',
  'C:\\Users\\GouveiaRx\\Downloads\\NewCAM\\backend\\storage\\recordings',
  'C:\\Users\\GouveiaRx\\Downloads\\NewCAM\\backend\\storage\\files\\recordings'
];

function findAllMp4Files() {
  const files = [];
  
  for (const searchPath of searchPaths) {
    if (fs.existsSync(searchPath)) {
      console.log(`🔍 Procurando em: ${searchPath}`);
      
      function scanDirectory(dir) {
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);
          
          if (stat.isDirectory()) {
            scanDirectory(fullPath);
          } else if (item.endsWith('.mp4')) {
            files.push({
              filename: item,
              fullPath: fullPath,
              relativePath: path.relative('C:\\Users\\GouveiaRx\\Downloads\\NewCAM\\backend', fullPath)
            });
          }
        }
      }
      
      scanDirectory(searchPath);
    }
  }
  
  return files;
}

async function fixRecordingPaths() {
  try {
    console.log('🔍 Procurando arquivos MP4 existentes...');
    const existingFiles = findAllMp4Files();
    
    console.log(`✅ Encontrados ${existingFiles.length} arquivos MP4:`);
    existingFiles.forEach((file, index) => {
      console.log(`${index + 1}. ${file.filename}`);
      console.log(`   Caminho: ${file.fullPath}`);
      console.log('---');
    });
    
    console.log('\n🔍 Buscando gravações no banco de dados...');
    const { data: recordings, error } = await supabase
      .from('recordings')
      .select('id, filename, file_path')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('❌ Erro ao buscar gravações:', error);
      return;
    }
    
    console.log(`\n📊 Encontradas ${recordings.length} gravações no banco de dados`);
    
    let updatedCount = 0;
    
    for (const recording of recordings) {
      // Procurar arquivo correspondente
      const matchingFile = existingFiles.find(file => 
        file.filename === recording.filename ||
        file.filename.includes(recording.filename.replace('.mp4', '')) ||
        recording.filename.includes(file.filename.replace('.mp4', ''))
      );
      
      if (matchingFile) {
        const newPath = matchingFile.relativePath.replace(/\\/g, '/');
        
        if (recording.file_path !== newPath) {
          console.log(`\n🔄 Atualizando gravação ${recording.id}:`);
          console.log(`   De: ${recording.file_path}`);
          console.log(`   Para: ${newPath}`);
          
          const { error: updateError } = await supabase
            .from('recordings')
            .update({ file_path: newPath })
            .eq('id', recording.id);
          
          if (updateError) {
            console.error(`❌ Erro ao atualizar ${recording.id}:`, updateError);
          } else {
            console.log(`✅ Atualizado com sucesso`);
            updatedCount++;
          }
        } else {
          console.log(`✅ Caminho já correto para: ${recording.filename}`);
        }
      } else {
        console.log(`⚠️  Arquivo não encontrado para: ${recording.filename}`);
      }
    }
    
    console.log(`\n🎉 Processo concluído! ${updatedCount} gravações atualizadas.`);
    
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

fixRecordingPaths();