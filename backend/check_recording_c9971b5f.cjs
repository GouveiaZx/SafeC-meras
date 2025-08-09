const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkRecording() {
  try {
    console.log('🔍 Verificando gravação c9971b5f-b8a4-4c8c-8bb2-04277329cdde...');
    console.log('📡 Conectando ao Supabase...');
    
    const { data, error } = await supabase
      .from('recordings')
      .select('*')
      .eq('id', 'c9971b5f-b8a4-4c8c-8bb2-04277329cdde');
    
    console.log('📊 Resposta do Supabase:', { data: !!data, error: !!error, count: data?.length || 0 });
    
    if (error) {
      console.error('❌ Erro ao buscar gravação:', error);
      return;
    }
    
    if (!data || data.length === 0) {
      console.log('❌ Gravação c9971b5f-b8a4-4c8c-8bb2-04277329cdde NÃO EXISTE no banco!');
      
      // Vamos buscar as últimas 5 gravações para comparar
      console.log('\n🔍 Buscando as últimas 5 gravações no banco...');
      const { data: recentRecordings, error: recentError } = await supabase
        .from('recordings')
        .select('id, camera_id, filename, file_path, local_path, created_at')
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (recentError) {
        console.error('❌ Erro ao buscar gravações recentes:', recentError);
      } else {
        console.log('📋 Últimas 5 gravações:');
        recentRecordings.forEach((rec, index) => {
          console.log(`   ${index + 1}. ID: ${rec.id}`);
          console.log(`      Camera: ${rec.camera_id}`);
          console.log(`      Filename: ${rec.filename}`);
          console.log(`      Created: ${rec.created_at}`);
          console.log('');
        });
      }
      return;
    }
    
    console.log('✅ Gravação encontrada:');
    console.log('   - ID:', data.id);
    console.log('   - Camera ID:', data.camera_id);
    console.log('   - Filename:', data.filename);
    console.log('   - File Path:', data.file_path);
    console.log('   - Local Path:', data.local_path);
    console.log('   - File Size:', data.file_size);
    console.log('   - Duration:', data.duration);
    console.log('   - Status:', data.status);
    console.log('   - Created At:', data.created_at);
    
  } catch (error) {
    console.error('❌ Erro capturado:', error.message);
    console.error('❌ Stack trace:', error.stack);
  }
}

console.log('🚀 Iniciando script...');
checkRecording()
  .then(() => {
    console.log('✅ Script finalizado com sucesso');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Erro não capturado:', error);
    process.exit(1);
  });