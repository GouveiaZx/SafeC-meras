import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixFailedRecordings() {
  console.log('🛠️ CORRIGINDO GRAVAÇÕES COM FALHA');
  console.log('='.repeat(50));

  try {
    // Buscar todas as gravações com falha
    const { data: failedRecordings, error } = await supabase
      .from('recordings')
      .select('id, filename, status, upload_status, error_message, file_path, file_size')
      .eq('status', 'failed');

    if (error) {
      console.error('Erro ao buscar gravações com falha:', error);
      return;
    }

    console.log(`📊 Encontradas ${failedRecordings.length} gravações com falha`);

    // Verificar arquivos físicos
    const recordingsPath = process.env.RECORDINGS_PATH || './recordings';
    
    for (const rec of failedRecordings) {
      console.log(`\n📹 Corrigindo: ${rec.filename}`);
      
      // Verificar se arquivo existe
      let fileExists = false;
      let actualSize = 0;
      
      if (rec.file_path) {
        const fullPath = path.resolve(recordingsPath, rec.file_path);
        try {
          const stats = await fs.stat(fullPath);
          fileExists = true;
          actualSize = stats.size;
          console.log(`   ✅ Arquivo existe: ${fullPath} (${actualSize} bytes)`);
        } catch (err) {
          console.log(`   ❌ Arquivo não encontrado: ${fullPath}`);
        }
      }

      // Corrigir status no banco
      if (fileExists && actualSize > 100) { // Arquivo válido
        console.log(`   🔄 Corrigindo status...`);
        
        const { error: updateError } = await supabase
          .from('recordings')
          .update({
            status: 'completed',
            upload_status: 'pending',
            error_message: null,
            file_size: actualSize
          })
          .eq('id', rec.id);

        if (updateError) {
          console.log(`   ❌ Erro ao corrigir: ${updateError.message}`);
        } else {
          console.log(`   ✅ Status corrigido para 'completed'`);
        }
      } else {
        console.log(`   ⚠️  Arquivo inválido ou inexistente, mantendo falha`);
      }
    }

    // Verificar se há mais gravações
    const { data: allRecordings } = await supabase
      .from('recordings')
      .select('id, filename, status, upload_status')
      .order('created_at', { ascending: false })
      .limit(10);

    console.log('\n📋 STATUS ATUALIZADO:');
    allRecordings.forEach(rec => {
      console.log(`   ${rec.filename}: ${rec.status} / ${rec.upload_status}`);
    });

  } catch (error) {
    console.error('Erro ao corrigir gravações:', error);
  }
}

fixFailedRecordings();