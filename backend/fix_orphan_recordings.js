import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const { promises: fsPromises } = fs;

// Configuração do Supabase
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://grkvfzuadctextnbpajb.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzIyNDIzOCwiZXhwIjoyMDY4ODAwMjM4fQ.XJoPu5InA_s3pfryZfSChBqZnu7zBV3vwH7ZM4jf04M'
);

const recordingsPath = path.resolve('./recordings');

async function fixOrphanRecordings() {
  try {
    console.log('🔍 Iniciando limpeza de gravações órfãs...');
    
    // 1. Listar todos os arquivos físicos
    console.log('\n📁 Verificando arquivos físicos...');
    const physicalFiles = await fsPromises.readdir(recordingsPath);
    console.log(`   Arquivos encontrados: ${physicalFiles.length}`);
    physicalFiles.forEach(file => console.log(`   - ${file}`));
    
    // 2. Buscar todas as gravações no banco
    console.log('\n🗄️ Buscando gravações no banco...');
    const { data: recordings, error: fetchError } = await supabase
      .from('recordings')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (fetchError) {
      throw new Error(`Erro ao buscar gravações: ${fetchError.message}`);
    }
    
    console.log(`   Gravações no banco: ${recordings.length}`);
    
    // 3. Identificar gravações órfãs
    console.log('\n🔍 Identificando gravações órfãs...');
    const orphanRecordings = [];
    const validRecordings = [];
    
    for (const recording of recordings) {
      const filename = recording.filename;
      let fileExists = false;
      
      // Verificar se arquivo existe (com ou sem extensão .mp4)
      const possibleFilenames = [
        filename,
        filename.endsWith('.mp4') ? filename : `${filename}.mp4`,
        filename.replace('.mp4', ''),
        `${filename.replace('.mp4', '')}.mp4`
      ];
      
      for (const possibleFilename of possibleFilenames) {
        if (physicalFiles.includes(possibleFilename)) {
          fileExists = true;
          break;
        }
      }
      
      if (fileExists) {
        validRecordings.push(recording);
        console.log(`   ✅ ${recording.id} - ${filename} (arquivo existe)`);
      } else {
        orphanRecordings.push(recording);
        console.log(`   ❌ ${recording.id} - ${filename} (arquivo não encontrado)`);
      }
    }
    
    console.log(`\n📊 Resultado da análise:`);
    console.log(`   - Gravações válidas: ${validRecordings.length}`);
    console.log(`   - Gravações órfãs: ${orphanRecordings.length}`);
    
    // 4. Remover gravações órfãs
    if (orphanRecordings.length > 0) {
      console.log('\n🗑️ Removendo gravações órfãs...');
      
      for (const orphan of orphanRecordings) {
        const { error: deleteError } = await supabase
          .from('recordings')
          .delete()
          .eq('id', orphan.id);
        
        if (deleteError) {
          console.error(`   ❌ Erro ao remover ${orphan.id}: ${deleteError.message}`);
        } else {
          console.log(`   ✅ Removido: ${orphan.id} - ${orphan.filename}`);
        }
      }
    }
    
    // 5. Corrigir filenames das gravações válidas (garantir extensão .mp4)
    console.log('\n🔧 Corrigindo filenames das gravações válidas...');
    
    for (const recording of validRecordings) {
      const currentFilename = recording.filename;
      
      // Se não termina com .mp4, adicionar
      if (!currentFilename.endsWith('.mp4')) {
        const correctedFilename = `${currentFilename}.mp4`;
        
        // Verificar se o arquivo com .mp4 existe
        if (physicalFiles.includes(correctedFilename)) {
          const { error: updateError } = await supabase
            .from('recordings')
            .update({ filename: correctedFilename })
            .eq('id', recording.id);
          
          if (updateError) {
            console.error(`   ❌ Erro ao corrigir ${recording.id}: ${updateError.message}`);
          } else {
            console.log(`   ✅ Corrigido: ${recording.id} - ${currentFilename} → ${correctedFilename}`);
          }
        }
      }
    }
    
    // 6. Verificação final
    console.log('\n🔍 Verificação final...');
    const { data: finalRecordings, error: finalError } = await supabase
      .from('recordings')
      .select('id, filename, status')
      .order('created_at', { ascending: false });
    
    if (finalError) {
      throw new Error(`Erro na verificação final: ${finalError.message}`);
    }
    
    console.log(`\n📋 Gravações restantes no banco: ${finalRecordings.length}`);
    finalRecordings.forEach(rec => {
      console.log(`   - ${rec.id} | ${rec.filename} | ${rec.status}`);
    });
    
    console.log('\n✅ Limpeza concluída com sucesso!');
    console.log('\n🎯 Próximos passos:');
    console.log('   1. Reiniciar o backend para aplicar as mudanças');
    console.log('   2. Testar o player de vídeo no frontend');
    console.log('   3. Verificar se todas as gravações são reproduzíveis');
    
  } catch (error) {
    console.error('❌ Erro durante a limpeza:', error);
    process.exit(1);
  }
}

// Executar o script
fixOrphanRecordings();