import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkRecording() {
  try {
    const { data, error } = await supabase
      .from('recordings')
      .select('*')
      .eq('filename', '2025-08-08-12-30-00-0.mp4');
    
    if (error) {
      console.error('Erro ao buscar gravação:', error);
      return;
    }
    
    console.log('Gravações encontradas:', JSON.stringify(data, null, 2));
    console.log('Total de gravações:', data?.length || 0);
    
    // Verificar todas as gravações para debug
    const { data: allRecordings } = await supabase
      .from('recordings')
      .select('id, filename, camera_id, created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    
    console.log('\nÚltimas 10 gravações no banco:');
    console.log(JSON.stringify(allRecordings, null, 2));
    
  } catch (error) {
    console.error('Erro:', error);
  }
}

checkRecording();