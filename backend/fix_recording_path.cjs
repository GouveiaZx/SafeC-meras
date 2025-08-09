const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixRecordingPath() {
  try {
    console.log('🔧 Corrigindo caminho da gravação 70b261c0-e44d-4f5d-a5c1-16b1458fd1a7...');
    
    const { data, error } = await supabase
      .from('recordings')
      .update({
        local_path: '/opt/media/bin/www/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/2025-08-09/2025-08-09-06-02-28-0.mp4',
        file_path: '/opt/media/bin/www/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/2025-08-09/2025-08-09-06-02-28-0.mp4',
        file_size: 9544127,
        filename: '2025-08-09-06-02-28-0.mp4'
      })
      .eq('id', '70b261c0-e44d-4f5d-a5c1-16b1458fd1a7')
      .select();

    if (error) {
      console.error('❌ Erro ao atualizar gravação:', error);
      return;
    }

    console.log('✅ Gravação atualizada com sucesso:', data);
    
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

fixRecordingPath();