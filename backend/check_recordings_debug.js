import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkRecordings() {
  try {
    console.log('🔍 Verificando gravações no banco de dados...');
    
    // Buscar todas as gravações
    const { data: recordings, error } = await supabase
      .from('recordings')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('❌ Erro ao buscar gravações:', error);
      return;
    }
    
    console.log(`📊 Total de gravações encontradas: ${recordings.length}`);
    
    if (recordings.length > 0) {
      console.log('\n📋 Lista de gravações:');
      recordings.forEach((recording, index) => {
        console.log(`${index + 1}. ${recording.filename}`);
        console.log(`   ID: ${recording.id}`);
        console.log(`   Status: ${recording.status}`);
        console.log(`   Câmera: ${recording.camera_name}`);
        console.log(`   Criado em: ${recording.created_at}`);
        console.log(`   Arquivo local: ${recording.local_path || 'N/A'}`);
        console.log(`   URL S3: ${recording.s3_url || 'N/A'}`);
        console.log('   ---');
      });
    } else {
      console.log('❌ Nenhuma gravação encontrada no banco de dados!');
    }
    
  } catch (error) {
    console.error('❌ Erro no script:', error);
  }
}

checkRecordings();