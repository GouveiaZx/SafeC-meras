import { supabaseAdmin } from './src/config/database.js';

async function checkRecordings() {
  console.log('🔍 Buscando gravações das câmeras acessíveis...');
  
  try {
    const cameraIds = ['15d899b1-2a41-4d9d-8bfc-1497d534143f', 'bd02962c-a136-4afb-a140-59463ec58d69'];
    
    const { data, error } = await supabaseAdmin
      .from('recordings')
      .select('*')
      .in('camera_id', cameraIds)
      .limit(10);
    
    if (error) {
      console.error('❌ Erro ao buscar gravações:', error);
      return;
    }
    
    console.log(`✅ Gravações encontradas: ${data?.length || 0}`);
    
    if (data && data.length > 0) {
      data.forEach((recording, index) => {
        console.log(`${index + 1}. ID: ${recording.id}`);
        console.log(`   Status: ${recording.status}`);
        console.log(`   Arquivo: ${recording.filename}`);
        console.log(`   Câmera: ${recording.camera_id}`);
        console.log(`   Criado: ${recording.created_at}`);
        console.log(`   ---`);
      });
    } else {
      console.log('❌ Nenhuma gravação encontrada para essas câmeras');
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
}

checkRecordings();