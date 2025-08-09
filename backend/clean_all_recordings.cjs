require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis de ambiente do Supabase não encontradas');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function cleanAllRecordings() {
  try {
    console.log('🧹 LIMPEZA COMPLETA DE GRAVAÇÕES');
    console.log('================================');
    
    // 1. Listar todas as gravações
    console.log('\n📋 Listando todas as gravações...');
    const { data: recordings, error: listError } = await supabase
      .from('recordings')
      .select('id, camera_id, file_path, local_path, created_at');
    
    if (listError) {
      console.error('❌ Erro ao listar gravações:', listError);
      return;
    }
    
    console.log(`📊 Total de gravações encontradas: ${recordings.length}`);
    
    if (recordings.length === 0) {
      console.log('✅ Nenhuma gravação para limpar!');
      return;
    }
    
    // 2. Mostrar algumas gravações como exemplo
    console.log('\n📝 Primeiras 5 gravações:');
    recordings.slice(0, 5).forEach((rec, index) => {
      console.log(`   ${index + 1}. ID: ${rec.id}`);
      console.log(`      Câmera: ${rec.camera_id}`);
      console.log(`      Arquivo: ${rec.file_path || rec.local_path || 'N/A'}`);
      console.log(`      Data: ${rec.created_at}`);
      console.log('');
    });
    
    if (recordings.length > 5) {
      console.log(`   ... e mais ${recordings.length - 5} gravações`);
    }
    
    // 3. Tentar remover arquivos físicos
    console.log('\n🗂️ Removendo arquivos físicos...');
    let filesRemoved = 0;
    let filesNotFound = 0;
    
    for (const recording of recordings) {
      const filePath = recording.local_path || recording.file_path;
      if (filePath) {
        try {
          const fullPath = path.resolve(filePath);
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            filesRemoved++;
            console.log(`   ✅ Removido: ${path.basename(fullPath)}`);
          } else {
            filesNotFound++;
          }
        } catch (error) {
          console.log(`   ⚠️ Erro ao remover ${filePath}: ${error.message}`);
        }
      }
    }
    
    console.log(`\n📊 Arquivos físicos:`);
    console.log(`   ✅ Removidos: ${filesRemoved}`);
    console.log(`   ❓ Não encontrados: ${filesNotFound}`);
    
    // 4. Remover registros do banco
    console.log('\n🗄️ Removendo registros do banco de dados...');
    const { error: deleteError } = await supabase
      .from('recordings')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (usando condição que sempre é verdadeira)
    
    if (deleteError) {
      console.error('❌ Erro ao remover registros do banco:', deleteError);
      return;
    }
    
    // 5. Verificar se limpeza foi bem-sucedida
    console.log('\n🔍 Verificando limpeza...');
    const { data: remainingRecordings, error: checkError } = await supabase
      .from('recordings')
      .select('id');
    
    if (checkError) {
      console.error('❌ Erro ao verificar limpeza:', checkError);
      return;
    }
    
    console.log('\n🎉 LIMPEZA CONCLUÍDA!');
    console.log('====================');
    console.log(`✅ ${recordings.length} registros removidos do banco`);
    console.log(`✅ ${filesRemoved} arquivos físicos removidos`);
    console.log(`📊 Gravações restantes no banco: ${remainingRecordings.length}`);
    
    if (remainingRecordings.length === 0) {
      console.log('🎊 Banco de dados completamente limpo!');
    } else {
      console.log('⚠️ Algumas gravações ainda permanecem no banco');
    }
    
  } catch (error) {
    console.error('❌ Erro durante a limpeza:', error);
  }
}

cleanAllRecordings();