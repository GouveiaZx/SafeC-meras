import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function checkRecordingData() {
  try {
    const recordingId = '37e13ad5-bbee-4368-b90b-b53c142a97bd';
    
    console.log('🔍 Verificando dados da gravação no banco...');
    
    const { data: recording, error } = await supabase
      .from('recordings')
      .select('*')
      .eq('id', recordingId)
      .single();
    
    if (error) {
      console.error('❌ Erro ao buscar gravação:', error);
      return;
    }
    
    if (!recording) {
      console.log('❌ Gravação não encontrada no banco');
      return;
    }
    
    console.log('✅ Dados da gravação encontrados:');
    console.log(JSON.stringify(recording, null, 2));
    
    // Verificar campos importantes para localização
    console.log('\n📋 Campos importantes para localização:');
    console.log('- local_path:', recording.local_path || 'NÃO DEFINIDO');
    console.log('- filename:', recording.filename || 'NÃO DEFINIDO');
    console.log('- file_path:', recording.file_path || 'NÃO DEFINIDO');
    console.log('- camera_id:', recording.camera_id || 'NÃO DEFINIDO');
    console.log('- s3_url:', recording.s3_url || 'NÃO DEFINIDO');
    console.log('- file_size:', recording.file_size || 'NÃO DEFINIDO');
    
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

checkRecordingData();