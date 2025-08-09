import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function cleanAllRecordings() {
  console.log('🧹 Iniciando limpeza completa de todas as gravações...');
  
  try {
    // 1. Primeiro, vamos ver quantas gravações existem
    console.log('📊 Verificando gravações existentes...');
    const { data: recordings, error: countError } = await supabase
      .from('recordings')
      .select('id, filename, file_path, local_path, created_at')
      .order('created_at', { ascending: false });
    
    if (countError) {
      console.error('❌ Erro ao buscar gravações:', countError);
      return;
    }
    
    console.log(`📈 Total de gravações encontradas: ${recordings.length}`);
    
    if (recordings.length === 0) {
      console.log('✅ Nenhuma gravação encontrada para limpar.');
      return;
    }
    
    // 2. Mostrar algumas gravações como exemplo
    console.log('\n📋 Primeiras 5 gravações:');
    recordings.slice(0, 5).forEach((rec, index) => {
      console.log(`${index + 1}. ID: ${rec.id}`);
      console.log(`   Filename: ${rec.filename || 'null'}`);
      console.log(`   File Path: ${rec.file_path || 'null'}`);
      console.log(`   Local Path: ${rec.local_path || 'null'}`);
      console.log(`   Created: ${rec.created_at}`);
      console.log('');
    });
    
    // 3. Confirmar limpeza
    console.log(`⚠️  ATENÇÃO: Você está prestes a DELETAR TODAS as ${recordings.length} gravações!`);
    console.log('⚠️  Esta ação é IRREVERSÍVEL!');
    console.log('\n🔄 Procedendo com a limpeza em 3 segundos...');
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 4. Deletar todas as gravações
    console.log('🗑️  Deletando todas as gravações do banco de dados...');
    const { error: deleteError } = await supabase
      .from('recordings')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Deleta tudo exceto um ID impossível
    
    if (deleteError) {
      console.error('❌ Erro ao deletar gravações:', deleteError);
      return;
    }
    
    // 5. Verificar se a limpeza foi bem-sucedida
    const { data: remainingRecordings, error: verifyError } = await supabase
      .from('recordings')
      .select('id')
      .limit(1);
    
    if (verifyError) {
      console.error('❌ Erro ao verificar limpeza:', verifyError);
      return;
    }
    
    if (remainingRecordings.length === 0) {
      console.log('✅ SUCESSO! Todas as gravações foram removidas do banco de dados.');
      console.log('✅ O banco de dados está agora completamente limpo.');
    } else {
      console.log(`⚠️  Ainda existem ${remainingRecordings.length} gravações no banco.`);
    }
    
  } catch (error) {
    console.error('❌ Erro durante a limpeza:', error);
  }
}

// Executar limpeza
cleanAllRecordings()
  .then(() => {
    console.log('\n🏁 Script de limpeza finalizado.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });