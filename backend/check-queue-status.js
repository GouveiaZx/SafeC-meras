import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://grkvfzuadctextnbpajb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzIyNDIzOCwiZXhwIjoyMDY4ODAwMjM4fQ.XJoPu5InA_s3pfryZfSChBqZnu7zBV3vwH7ZM4jf04M'
);

console.log('📤 DIAGNÓSTICO DA FILA DE UPLOAD\n');
console.log('=' .repeat(50));

// Verificar fila de upload
const { data: queue, error } = await supabase
  .from('upload_queue')
  .select('*')
  .order('created_at', { ascending: false });

console.log('\n📋 ITENS NA FILA:');

if (queue && queue.length > 0) {
  queue.forEach(item => {
    console.log('\nID:', item.id);
    console.log('  Recording ID:', item.recording_id);
    console.log('  Status:', item.status);
    console.log('  Retry Count:', item.retry_count || 0);
    console.log('  Started At:', item.started_at || 'null');
    console.log('  Error:', item.error_message || 'none');
    console.log('  Created:', new Date(item.created_at).toLocaleString('pt-BR'));
    console.log('  Updated:', new Date(item.updated_at).toLocaleString('pt-BR'));
  });
  
  // Identificar itens problemáticos
  const stuckItems = queue.filter(item => 
    item.status === 'processing' || 
    item.status === 'uploading' ||
    (item.started_at && new Date() - new Date(item.started_at) > 300000) // Mais de 5 minutos
  );
  
  if (stuckItems.length > 0) {
    console.log('\n⚠️ ITENS TRAVADOS DETECTADOS:');
    stuckItems.forEach(item => {
      console.log('  - ID:', item.id, '(Status:', item.status, ')');
    });
  }
} else {
  console.log('✅ Fila vazia');
}

// Verificar gravações correspondentes
console.log('\n' + '=' .repeat(50));
console.log('📹 GRAVAÇÕES RECENTES:');

const { data: recordings } = await supabase
  .from('recordings')
  .select('id, filename, upload_status, upload_attempts')
  .order('created_at', { ascending: false })
  .limit(5);

if (recordings) {
  recordings.forEach(rec => {
    console.log('\n' + rec.filename);
    console.log('  ID:', rec.id);
    console.log('  Upload Status:', rec.upload_status);
    console.log('  Upload Attempts:', rec.upload_attempts || 0);
  });
}

console.log('\n' + '=' .repeat(50));
process.exit(0);