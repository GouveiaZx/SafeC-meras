import dotenv from 'dotenv';
import { supabaseAdmin } from './src/config/database.js';

dotenv.config();

async function checkRecordings() {
  try {
    console.log('🔍 Verificando gravações no banco de dados...');
    
    // Buscar todas as gravações
    const { data: recordings, error } = await supabaseAdmin
      .from('recordings')
      .select(`
        *,
        cameras!inner(
          name,
          id
        )
      `)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (error) {
      throw error;
    }
    
    console.log(`\n📹 Total de gravações encontradas: ${recordings.length}`);
    
    if (recordings.length > 0) {
      console.log('\n📋 Últimas gravações:');
      recordings.forEach((recording, index) => {
        console.log(`   ${index + 1}. ${recording.cameras.name}:`);
        console.log(`      ID: ${recording.id}`);
        console.log(`      Arquivo: ${recording.file_path}`);
        console.log(`      Status: ${recording.status}`);
        console.log(`      Criado em: ${recording.created_at}`);
        console.log(`      Iniciado em: ${recording.started_at || 'N/A'}`);
        console.log(`      Finalizado em: ${recording.ended_at || 'N/A'}`);
        console.log(`      Duração: ${recording.duration || 'N/A'} segundos`);
        console.log(`      Tamanho: ${recording.file_size || 'N/A'} bytes`);
        console.log(`      S3/Wasabi URL: ${recording.s3_url || 'Não enviado'}`);
        console.log('');
      });
    }
    
    // Verificar gravações ativas
    const { data: activeRecordings, error: activeError } = await supabaseAdmin
      .from('recordings')
      .select(`
        *,
        cameras!inner(
          name
        )
      `)
      .eq('status', 'RECORDING');
    
    if (activeError) {
      throw activeError;
    }
    
    console.log(`🔴 Gravações ativas: ${activeRecordings.length}`);
    if (activeRecordings.length > 0) {
      activeRecordings.forEach(recording => {
        console.log(`   - ${recording.cameras.name}: ${recording.file_path}`);
      });
    }
    
    // Verificar gravações concluídas sem upload
    const { data: completedWithoutUpload, error: completedError } = await supabaseAdmin
      .from('recordings')
      .select(`
        *,
        cameras!inner(
          name
        )
      `)
      .eq('status', 'COMPLETED')
      .is('s3_url', null);
    
    if (completedError) {
      throw completedError;
    }
    
    console.log(`\n📤 Gravações concluídas sem upload para S3/Wasabi: ${completedWithoutUpload.length}`);
    if (completedWithoutUpload.length > 0) {
      completedWithoutUpload.forEach(recording => {
        console.log(`   - ${recording.cameras.name}: ${recording.file_path}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Erro ao verificar gravações:', error);
  }
}

checkRecordings();