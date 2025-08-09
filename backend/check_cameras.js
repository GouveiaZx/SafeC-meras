import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

try {
  const { data, error } = await supabase.from('cameras').select('id, name, status, rtsp_url');
  
  if (error) {
    console.error('Erro:', error);
  } else {
    console.log('Câmeras configuradas:', data?.length || 0);
    data?.forEach(cam => {
      console.log(`- ${cam.name} (${cam.id}): ${cam.status} - ${cam.rtsp_url || 'Sem URL'}`);
    });
  }
} catch (err) {
  console.error('Erro ao conectar:', err);
}