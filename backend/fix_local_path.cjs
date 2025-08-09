const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixLocalPath() {
  try {
    console.log('🔧 Atualizando local_path para usar caminho local...');
    
    const { data, error } = await supabase
      .from('recordings')
      .update({
        local_path: './storage/bin/www/record/2025-08-09-06-02-28-0.mp4'
      })
      .eq('id', '70b261c0-e44d-4f5d-a5c1-16b1458fd1a7')
      .select();

    if (error) {
      console.error('❌ Erro ao atualizar gravação:', error);
      return;
    }

    console.log('✅ Local path atualizado com sucesso:', data);
    
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

fixLocalPath();