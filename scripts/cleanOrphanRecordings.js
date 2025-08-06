import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function cleanOrphanRecordings() {
  console.log('🧹 Limpando registros órfãos...');
  
  try {
    // Buscar gravações órfãs (sem arquivo físico)
    const orphanFilenames = [
      'recording_a4e7d9c8-3f57-4b1a-9628-20727b0f21cd_2025-08-04T21-55-28-315Z.mp4',
      'recording_a4e7d9c8-3f57-4b1a-9628-20727b0f21cd_2025-08-04T21-54-18-674Z.mp4'
    ];
    
    let deletedCount = 0;
    
    for (const filename of orphanFilenames) {
      console.log(`🗑️ Removendo registro órfão: ${filename}`);
      
      const { error } = await supabase
        .from('recordings')
        .delete()
        .eq('filename', filename);
      
      if (error) {
        console.error(`❌ Erro ao remover ${filename}:`, error);
      } else {
        console.log(`✅ Removido: ${filename}`);
        deletedCount++;
      }
    }
    
    console.log(`\n📈 Resumo:`);
    console.log(`🗑️ Registros removidos: ${deletedCount}`);
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

cleanOrphanRecordings();