const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'backend/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function validateAllUrls() {
  console.log('🔍 Validando URLs no sistema...');
  
  let issues = [];
  
  // Validar streams
  const { data: streams, error: streamsError } = await supabase
    .from('streams')
    .select('id, hls_url, flv_url, camera_id, created_at');
    
  if (streamsError) {
    console.error('Erro ao buscar streams:', streamsError);
    return;
  }
  
  console.log(`📊 Streams encontrados: ${streams.length}`);
  
  for (const stream of streams) {
    const expectedHlsUrl = `/api/streams/${stream.id}/hls/stream.m3u8`;
    const expectedFlvUrl = `/api/streams/${stream.id}/flv`;
    
    if (stream.hls_url && stream.hls_url !== expectedHlsUrl) {
      issues.push({
        type: 'stream',
        id: stream.id,
        field: 'hls_url',
        current: stream.hls_url,
        expected: expectedHlsUrl
      });
    }
    
    if (stream.flv_url && stream.flv_url !== expectedFlvUrl) {
      issues.push({
        type: 'stream',
        id: stream.id,
        field: 'flv_url',
        current: stream.flv_url,
        expected: expectedFlvUrl
      });
    }
  }
  
  // Validar cameras
  const { data: cameras, error: camerasError } = await supabase
    .from('cameras')
    .select('id, hls_url, flv_url, created_at');
    
  if (camerasError) {
    console.error('Erro ao buscar cameras:', camerasError);
    return;
  }
  
  console.log(`📊 Cameras encontradas: ${cameras.length}`);
  
  for (const camera of cameras) {
    const expectedHlsUrl = `/api/streams/${camera.id}/hls/stream.m3u8`;
    const expectedFlvUrl = `/api/streams/${camera.id}/flv`;
    
    if (camera.hls_url && camera.hls_url !== expectedHlsUrl) {
      issues.push({
        type: 'camera',
        id: camera.id,
        field: 'hls_url',
        current: camera.hls_url,
        expected: expectedHlsUrl
      });
    }
    
    if (camera.flv_url && camera.flv_url !== expectedFlvUrl) {
      issues.push({
        type: 'camera',
        id: camera.id,
        field: 'flv_url',
        current: camera.flv_url,
        expected: expectedFlvUrl
      });
    }
  }
  
  if (issues.length > 0) {
    console.log(`❌ Encontrados ${issues.length} problemas de URL:`);
    issues.forEach(issue => {
      console.log(`- ${issue.type} ${issue.id}: ${issue.field}`);
      console.log(`  Atual: ${issue.current}`);
      console.log(`  Esperado: ${issue.expected}`);
    });
  } else {
    console.log('✅ Todas as URLs estão corretas!');
  }
  
  return issues;
}

validateAllUrls().catch(console.error);