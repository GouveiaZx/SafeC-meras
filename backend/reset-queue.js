import { createClient } from '@supabase/supabase-js';

async function main() {
  const supabase = createClient(
    'https://grkvfzuadctextnbpajb.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzIyNDIzOCwiZXhwIjoyMDY4ODAwMjM4fQ.XJoPu5InA_s3pfryZfSChBqZnu7zBV3vwH7ZM4jf04M'
  );

  console.log('🔧 Resetando itens travados na fila...\n');

  // 1. Buscar todos os itens travados
  const { data: stuckItems, error: fetchError } = await supabase
    .from('upload_queue')
    .select('*')
    .in('status', ['processing', 'pending', 'retrying']);

  if (fetchError) {
    console.error('❌ Erro ao buscar itens:', fetchError);
    process.exit(1);
  }

  console.log(`📊 Encontrados ${stuckItems?.length || 0} itens travados\n`);

  if (!stuckItems || stuckItems.length === 0) {
    console.log('✅ Nenhum item travado. Fila está limpa!');
    process.exit(0);
  }

  // 2. Resetar cada item
  for (const item of stuckItems) {
    console.log(`Resetando item ${item.id.substring(0, 8)}...`);
    console.log(`  Status atual: ${item.status}`);
    console.log(`  Tentativas: ${item.retry_count}`);
    
    const { error } = await supabase
      .from('upload_queue')
      .update({
        status: 'pending',
        retry_count: 0,
        started_at: null,
        error_message: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', item.id);

    if (error) {
      console.error(`  ❌ Falha: ${error.message}`);
    } else {
      console.log(`  ✅ Resetado para pending`);
    }
  }

  // 3. Resetar status das gravações
  console.log('\n📋 Resetando status das gravações...');
  const recordingIds = stuckItems.map(item => item.recording_id);
  
  const { error: recError } = await supabase
    .from('recordings')
    .update({
      upload_status: 'pending',
      upload_attempts: 0,
      updated_at: new Date().toISOString()
    })
    .in('id', recordingIds);

  if (recError) {
    console.error('❌ Erro ao resetar gravações:', recError);
  } else {
    console.log(`✅ ${recordingIds.length} gravações resetadas`);
  }

  console.log('\n✅ Reset completo!');
  process.exit(0);
}

main().catch(console.error);