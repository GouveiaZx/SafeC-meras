import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Carregar .env
const envPath = join(__dirname, '.env');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis de ambiente não configuradas');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function cleanupInvalidRecordings() {
  try {
    console.log('🔍 Iniciando limpeza de gravações inválidas...');
    
    // Buscar gravações com dados inválidos
    const { data: recordings, error } = await supabase
      .from('recordings')
      .select('*')
      .or('duration.is.null,file_size.is.null,resolution.is.null,filename.is.null');
    
    if (error) {
      console.error('❌ Erro ao buscar gravações:', error);
      return;
    }
    
    console.log(`📊 Encontradas ${recordings.length} gravações com dados inválidos`);
    
    if (recordings.length === 0) {
      console.log('✅ Nenhuma gravação inválida encontrada');
      return;
    }
    
    // Mostrar algumas gravações para análise
    console.log('\n📋 Primeiras 5 gravações inválidas:');
    recordings.slice(0, 5).forEach((rec, index) => {
      console.log(`${index + 1}. ID: ${rec.id}`);
      console.log(`   Duração: ${rec.duration || 'NULL'}`);
      console.log(`   Tamanho: ${rec.file_size || 'NULL'}`);
      console.log(`   Resolução: ${rec.resolution || 'NULL'}`);
      console.log(`   Filename: ${rec.filename || 'NULL'}`);
      console.log(`   Status: ${rec.status || 'NULL'}`);
      console.log(`   Criado em: ${rec.created_at}`);
      console.log('---');
    });
    
    // Perguntar se deve deletar (simulação - em produção seria interativo)
    const shouldDelete = process.argv.includes('--delete');
    
    if (shouldDelete) {
      console.log('🗑️ Deletando gravações inválidas...');
      
      const recordingIds = recordings.map(r => r.id);
      
      const { error: deleteError } = await supabase
        .from('recordings')
        .delete()
        .in('id', recordingIds);
      
      if (deleteError) {
        console.error('❌ Erro ao deletar gravações:', deleteError);
        return;
      }
      
      console.log(`✅ ${recordings.length} gravações inválidas deletadas com sucesso`);
    } else {
      console.log('\n💡 Para deletar as gravações inválidas, execute:');
      console.log('node simple_cleanup.js --delete');
    }
    
  } catch (error) {
    console.error('❌ Erro durante a limpeza:', error);
  }
}

// Executar se chamado diretamente
if (process.argv[1] === __filename) {
  cleanupInvalidRecordings()
    .then(() => {
      console.log('\n🏁 Limpeza concluída');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Erro fatal:', error);
      process.exit(1);
    });
}