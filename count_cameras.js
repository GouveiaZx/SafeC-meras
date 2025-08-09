const { createClient } = require('@supabase/supabase-js');

// Configurações do Supabase
const supabaseUrl = 'https://grkvfzuadctextnbpajb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzIyNDIzOCwiZXhwIjoyMDY4ODAwMjM4fQ.XJoPu5InA_s3pfryZfSChBqZnu7zBV3vwH7ZM4jf04M';

// Criar cliente Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

async function countCameras() {
  try {
    console.log('🔍 Contando câmeras no banco de dados...');
    
    // Contar câmeras na tabela cameras
    const { data, error, count } = await supabase
      .from('cameras')
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      console.error('❌ Erro ao contar câmeras:', error.message);
      return;
    }
    
    console.log(`📊 Total de câmeras no banco: ${count}`);
    
    // Listar algumas câmeras para verificação
    const { data: cameras, error: listError } = await supabase
      .from('cameras')
      .select('id, name, status, created_at')
      .limit(10);
    
    if (listError) {
      console.error('❌ Erro ao listar câmeras:', listError.message);
      return;
    }
    
    if (cameras && cameras.length > 0) {
      console.log('\n📋 Primeiras câmeras encontradas:');
      cameras.forEach((camera, index) => {
        console.log(`${index + 1}. ID: ${camera.id}, Nome: ${camera.name}, Status: ${camera.status}`);
      });
    } else {
      console.log('✅ Nenhuma câmera encontrada no banco de dados.');
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error.message);
  }
}

// Executar a função
countCameras();