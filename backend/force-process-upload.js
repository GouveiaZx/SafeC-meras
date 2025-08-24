import { createClient } from '@supabase/supabase-js';
import UploadQueueService from './src/services/UploadQueueService.js';

const supabase = createClient(
  'https://grkvfzuadctextnbpajb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzIyNDIzOCwiZXhwIjoyMDY4ODAwMjM4fQ.XJoPu5InA_s3pfryZfSChBqZnu7zBV3vwH7ZM4jf04M'
);

console.log('🚀 FORÇANDO PROCESSAMENTO DE UPLOAD\n');
console.log('=' .repeat(50));

// Configurar variáveis de ambiente para S3
process.env.SUPABASE_URL = 'https://grkvfzuadctextnbpajb.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzIyNDIzOCwiZXhwIjoyMDY4ODAwMjM4fQ.XJoPu5InA_s3pfryZfSChBqZnu7zBV3vwH7ZM4jf04M';
process.env.WASABI_ACCESS_KEY = '8WBR4YFE79UA94TBIEST';
process.env.WASABI_SECRET_KEY = 'A9hNRDUEzcyhUtzp0SAE51IgKcJtsP1b7knZNe5W';
process.env.WASABI_BUCKET = 'safe-cameras-03';
process.env.WASABI_REGION = 'us-east-2';
process.env.WASABI_ENDPOINT = 'https://s3.us-east-2.wasabisys.com';
process.env.S3_UPLOAD_ENABLED = 'true';

try {
  // Buscar itens pendentes ou falhados na fila
  const { data: queueItems, error } = await supabase
    .from('upload_queue')
    .select('*')
    .in('status', ['pending', 'failed'])
    .order('created_at', { ascending: true });

  if (error) {
    console.error('❌ Erro ao buscar fila:', error);
    process.exit(1);
  }

  if (!queueItems || queueItems.length === 0) {
    console.log('✅ Nenhum item pendente na fila');
    process.exit(0);
  }

  console.log(`📋 ${queueItems.length} itens pendentes encontrados\n`);

  // Processar cada item
  for (const item of queueItems) {
    console.log(`\n📤 Processando item: ${item.id}`);
    console.log(`   Recording ID: ${item.recording_id}`);
    
    try {
      // Buscar informações da gravação
      const { data: recording } = await supabase
        .from('recordings')
        .select('*')
        .eq('id', item.recording_id)
        .single();

      if (!recording) {
        console.log('   ❌ Gravação não encontrada');
        continue;
      }

      console.log(`   Arquivo: ${recording.filename}`);
      console.log(`   Path: ${recording.local_path || recording.file_path}`);

      // Tentar processar o upload
      const result = await UploadQueueService.processUpload(recording);

      if (result.success) {
        console.log(`   ✅ Upload bem-sucedido!`);
        console.log(`   S3 Key: ${result.s3_key}`);
        
        // Atualizar status na fila
        await supabase
          .from('upload_queue')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString()
          })
          .eq('id', item.id);
          
      } else {
        console.log(`   ❌ Upload falhou: ${result.error}`);
        
        // Atualizar erro na fila
        await supabase
          .from('upload_queue')
          .update({
            status: 'failed',
            error_message: result.error,
            retry_count: (item.retry_count || 0) + 1
          })
          .eq('id', item.id);
      }
    } catch (error) {
      console.error(`   💥 Erro ao processar: ${error.message}`);
    }
  }

  console.log('\n' + '=' .repeat(50));
  console.log('✅ Processamento completo');
  
} catch (error) {
  console.error('💥 Erro geral:', error);
  process.exit(1);
}

process.exit(0);