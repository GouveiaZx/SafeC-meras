const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixFilePathWindows() {
  try {
    console.log('🔧 Corrigindo file_path da gravação 70b261c0-e44d-4f5d-a5c1-16b1458fd1a7 para Windows...');
    
    // Caminho correto no Windows
    const windowsPath = 'C:\\Users\\GouveiaRx\\Downloads\\NewCAM\\storage\\bin\\www\\record\\live\\4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd\\2025-08-09\\2025-08-09-06-02-28-0.mp4';
    
    const { data, error } = await supabase
      .from('recordings')
      .update({
        file_path: windowsPath,
        local_path: windowsPath,
        updated_at: new Date().toISOString()
      })
      .eq('id', '70b261c0-e44d-4f5d-a5c1-16b1458fd1a7')
      .select();
    
    if (error) {
      console.error('❌ Erro ao atualizar gravação:', error);
      return;
    }
    
    if (data && data.length > 0) {
      console.log('✅ Gravação atualizada com sucesso!');
      console.log('📄 Dados atualizados:', {
        id: data[0].id,
        file_path: data[0].file_path,
        local_path: data[0].local_path,
        updated_at: data[0].updated_at
      });
    } else {
      console.log('⚠️ Nenhuma gravação foi encontrada com o ID especificado');
    }
    
  } catch (error) {
    console.error('💥 Erro durante a correção:', error);
  }
}

fixFilePathWindows();