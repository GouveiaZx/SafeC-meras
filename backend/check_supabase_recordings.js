import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkRecordings() {
  try {
    console.log('🔍 Verificando gravações no Supabase...');
    
    // Buscar as últimas 5 gravações
    const { data: recordings, error } = await supabase
      .from('recordings')
      .select('id, camera_id, filename, file_path, local_path, file_size, duration, status, created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (error) {
      console.error('❌ Erro ao buscar gravações:', error);
      return;
    }
    
    console.log(`✅ Encontradas ${recordings.length} gravações:`);
    recordings.forEach((recording, index) => {
      console.log(`\n${index + 1}. ID: ${recording.id}`);
      console.log(`   Câmera: ${recording.camera_id}`);
      console.log(`   Arquivo: ${recording.filename || 'null'}`);
      console.log(`   Caminho: ${recording.file_path || 'null'}`);
      console.log(`   Local: ${recording.local_path || 'null'}`);
      console.log(`   Tamanho: ${recording.file_size || 'null'} bytes`);
      console.log(`   Duração: ${recording.duration || 'null'} segundos`);
      console.log(`   Status: ${recording.status}`);
      console.log(`   Criado: ${recording.created_at}`);
    });
    
    // Contar total de gravações
    const { count, error: countError } = await supabase
      .from('recordings')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      console.error('❌ Erro ao contar gravações:', countError);
    } else {
      console.log(`\n📊 Total de gravações no banco: ${count}`);
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
}

checkRecordings();