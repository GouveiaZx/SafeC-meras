import { supabaseAdmin } from './src/config/database.js';

async function checkRecentRecordings() {
  try {
    console.log('🔍 Verificando gravações recentes...');
    
    const { data: recordings, error } = await supabaseAdmin
      .from('recordings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (error) {
      console.error('❌ Erro ao buscar gravações:', error);
      return;
    }
    
    console.log(`📊 Total de gravações encontradas: ${recordings?.length || 0}`);
    
    if (recordings && recordings.length > 0) {
      console.log('\n📋 Gravações recentes:');
      recordings.forEach((recording, index) => {
        console.log(`${index + 1}. ID: ${recording.id}`);
        console.log(`   Câmera: ${recording.camera_id}`);
        console.log(`   Arquivo: ${recording.filename}`);
        console.log(`   Status: ${recording.status}`);
        console.log(`   Criado em: ${recording.created_at}`);
        console.log(`   Tamanho: ${recording.file_size} bytes`);
        console.log(`   Duração: ${recording.duration}s`);
        console.log(`   Caminho: ${recording.file_path}`);
        console.log('   ---');
      });
    } else {
      console.log('❌ Nenhuma gravação encontrada no banco de dados!');
    }
    
    // Verificar também gravações das últimas 24 horas
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const { data: recentRecordings, error: recentError } = await supabaseAdmin
      .from('recordings')
      .select('*')
      .gte('created_at', yesterday.toISOString())
      .order('created_at', { ascending: false });
    
    if (!recentError) {
      console.log(`\n⏰ Gravações das últimas 24h: ${recentRecordings?.length || 0}`);
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
}

checkRecentRecordings();