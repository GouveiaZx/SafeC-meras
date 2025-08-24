import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('🔍 Verificando status do sistema...\n');

try {
  // Verificar câmeras
  console.log('📹 CÂMERAS:');
  const { data: cameras, error: camerasError } = await supabase
    .from('cameras')
    .select('*')
    .order('created_at', { ascending: false });

  if (camerasError) {
    console.error('❌ Erro ao buscar câmeras:', camerasError);
  } else {
    console.log(`Total de câmeras: ${cameras.length}`);
    cameras.forEach(cam => {
      const name = cam.name || cam.id.substring(0, 8);
      const status = cam.status || 'unknown';
      const url = cam.stream_url || 'Sem URL';
      console.log(`  - ${name} (${status}) - ${url}`);
    });
  }

  console.log('\n📊 GRAVAÇÕES RECENTES:');
  const { data: recordings, error: recordingsError } = await supabase
    .from('recordings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (recordingsError) {
    console.error('❌ Erro ao buscar gravações:', recordingsError);
  } else {
    console.log(`Total de gravações recentes: ${recordings.length}`);
    recordings.forEach(rec => {
      const created = new Date(rec.created_at).toLocaleString('pt-BR');
      const filename = rec.filename || 'Sem nome';
      const status = rec.status || 'unknown';
      const uploadStatus = rec.upload_status || 'pending';
      console.log(`  - ${filename} (${status}) - Upload: ${uploadStatus} - ${created}`);
    });
  }

  console.log('\n🔄 FILA DE UPLOAD:');
  const { data: queue, error: queueError } = await supabase
    .from('recordings')
    .select('*')
    .in('upload_status', ['pending', 'queued', 'uploading'])
    .order('created_at', { ascending: false });

  if (queueError) {
    console.error('❌ Erro ao buscar fila:', queueError);
  } else {
    console.log(`Itens na fila de upload: ${queue.length}`);
    queue.forEach(item => {
      const name = item.filename || item.id.substring(0,8);
      const uploadStatus = item.upload_status;
      const attempts = item.upload_attempts || 0;
      console.log(`  - ${name} - Status: ${uploadStatus} - Tentativas: ${attempts}`);
    });
  }

  console.log('\n⚙️ TESTE DE CONECTIVIDADE S3:');
  // Testar conectividade básica com S3
  const testResponse = await fetch('http://localhost:3002/health');
  if (testResponse.ok) {
    console.log('✅ Backend funcionando');
    
    // Verificar último upload bem-sucedido
    const { data: successUploads } = await supabase
      .from('recordings')
      .select('*')
      .eq('upload_status', 'uploaded')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (successUploads && successUploads.length > 0) {
      const lastUpload = successUploads[0];
      const uploadTime = new Date(lastUpload.updated_at).toLocaleString('pt-BR');
      console.log(`✅ Último upload bem-sucedido: ${lastUpload.filename} - ${uploadTime}`);
      console.log(`   S3 Key: ${lastUpload.s3_key || 'Não definido'}`);
    } else {
      console.log('⚠️ Nenhum upload bem-sucedido encontrado');
    }
  } else {
    console.log('❌ Backend não está respondendo');
  }

} catch (error) {
  console.error('💥 Erro ao verificar status:', error.message);
}