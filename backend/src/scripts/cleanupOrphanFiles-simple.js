#!/usr/bin/env node

/**
 * Script simplificado para limpeza de arquivos órfãos
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const DRY_RUN = process.env.DRY_RUN === 'true';

console.log(`🚀 Iniciando limpeza de arquivos órfãos${DRY_RUN ? ' (DRY RUN)' : ''}...`);

// Buscar arquivos MP4
async function findMp4Files() {
  const files = [];
  const storageDir = path.join(process.cwd(), 'storage', 'www', 'record', 'live');
  
  try {
    const scan = async (dir) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          await scan(fullPath);
        } else if (entry.name.endsWith('.mp4')) {
          files.push({
            name: entry.name,
            path: fullPath,
            size: (await fs.stat(fullPath)).size
          });
        }
      }
    };
    
    await scan(storageDir);
  } catch (error) {
    console.log('⚠️ Diretório storage não encontrado:', error.message);
  }
  
  return files;
}

// Buscar gravações no banco
async function getRecordings() {
  const { data, error } = await supabase
    .from('recordings')
    .select('filename');
    
  if (error) throw error;
  return data || [];
}

// Script principal
async function main() {
  try {
    const files = await findMp4Files();
    const recordings = await getRecordings();
    
    console.log(`📊 Arquivos encontrados: ${files.length}`);
    console.log(`📊 Registros no banco: ${recordings.length}`);
    
    const recordedFilenames = new Set(recordings.map(r => r.filename));
    const orphanFiles = files.filter(f => !recordedFilenames.has(f.name));
    
    console.log(`📊 Arquivos órfãos: ${orphanFiles.length}`);
    
    if (orphanFiles.length > 0) {
      let totalSize = 0;
      
      for (const file of orphanFiles) {
        totalSize += file.size;
        
        if (DRY_RUN) {
          console.log(`[DRY RUN] Deletaria: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
        } else {
          try {
            await fs.unlink(file.path);
            console.log(`✅ Deletado: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
          } catch (error) {
            console.log(`❌ Erro ao deletar ${file.name}:`, error.message);
          }
        }
      }
      
      console.log(`📊 Espaço ${DRY_RUN ? 'a ser liberado' : 'liberado'}: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    }
    
    console.log('✅ Limpeza concluída!');
    
  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }
}

main();