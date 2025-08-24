import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

const supabase = createClient(
  'https://grkvfzuadctextnbpajb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzIyNDIzOCwiZXhwIjoyMDY4ODAwMjM4fQ.XJoPu5InA_s3pfryZfSChBqZnu7zBV3vwH7ZM4jf04M'
);

console.log('🧪 TESTE DE UPLOAD S3\n');
console.log('=' .repeat(50));

// Criar um arquivo de teste
const testDir = './storage/www/record/live/49da82bc-3e32-4d1c-86f1-0e505813312c/2025-08-24';
const testFile = path.join(testDir, 'test-video.mp4');

try {
  // Criar diretório se não existir
  await fs.mkdir(testDir, { recursive: true });
  
  // Criar arquivo de teste (1KB)
  const testContent = Buffer.alloc(1024, 'test video content');
  await fs.writeFile(testFile, testContent);
  
  console.log('✅ Arquivo de teste criado:', testFile);
  
  // Criar registro de gravação no banco
  const { data: recording, error: insertError } = await supabase
    .from('recordings')
    .insert({
      camera_id: '49da82bc-3e32-4d1c-86f1-0e505813312c', // ID real da câmera RTMP CAM
      filename: 'test-video.mp4',
      local_path: testFile.replace(/\\/g, '/'),
      file_path: testFile.replace(/\\/g, '/'),
      file_size: 1024,
      duration: 30,
      status: 'completed',
      upload_status: 'pending',
      start_time: new Date(Date.now() - 60000).toISOString(),
      end_time: new Date().toISOString()
    })
    .select()
    .single();
  
  if (insertError) {
    console.error('❌ Erro ao criar gravação:', insertError);
    process.exit(1);
  }
  
  console.log('✅ Gravação criada no banco:', recording.id);
  console.log('   Filename:', recording.filename);
  console.log('   Upload Status:', recording.upload_status);
  
  // Adicionar à fila de upload
  const { data: queueItem, error: queueError } = await supabase
    .from('upload_queue')
    .insert({
      recording_id: recording.id,
      status: 'pending',
      retry_count: 0
    })
    .select()
    .single();
  
  if (queueError) {
    console.error('❌ Erro ao adicionar à fila:', queueError);
  } else {
    console.log('✅ Adicionado à fila de upload:', queueItem.id);
  }
  
  console.log('\n📤 O worker deve processar este upload automaticamente...');
  console.log('⏳ Aguarde alguns segundos e verifique o status com:');
  console.log('   node check-system-status.js');
  
  // Aguardar 5 segundos e verificar status
  setTimeout(async () => {
    const { data: updatedRec } = await supabase
      .from('recordings')
      .select('upload_status, s3_key')
      .eq('id', recording.id)
      .single();
    
    console.log('\n📊 STATUS APÓS 5 SEGUNDOS:');
    console.log('   Upload Status:', updatedRec?.upload_status);
    console.log('   S3 Key:', updatedRec?.s3_key || 'não definido ainda');
    
    if (updatedRec?.upload_status === 'uploaded') {
      console.log('\n🎉 SUCESSO! Upload para S3 funcionando!');
    } else if (updatedRec?.upload_status === 'uploading') {
      console.log('\n⏳ Upload em progresso...');
    } else {
      console.log('\n⚠️ Upload ainda não processado. Verifique os logs do worker.');
    }
    
    process.exit(0);
  }, 5000);
  
} catch (error) {
  console.error('❌ Erro:', error);
  process.exit(1);
}