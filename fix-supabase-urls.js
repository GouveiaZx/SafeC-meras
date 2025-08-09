const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'backend/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fixAllUrls() {
  console.log('🔧 Verificando e corrigindo URLs no Supabase...');
  
  // Corrigir streams
  const { data: streams, error: streamsError } = await supabase
    .from('streams')
    .select('id, hls_url, flv_url, camera_id');
    
  if (streamsError) {
    console.error('Erro ao buscar streams:', streamsError);
    return;
  }
  
  console.log(`Encontrados ${streams.length} streams`);
  
  let updated = 0;
  for (const stream of streams) {
    let needsUpdate = false;
    const updates = {};
    
    // Corrigir HLS URL
    if (stream.hls_url && (stream.hls_url.includes('localhost:8000') || stream.hls_url.includes('/live/'))) {
      updates.hls_url = `/api/streams/${stream.id}/hls/stream.m3u8`;
      needsUpdate = true;
      console.log(`Corrigindo HLS URL do stream ${stream.id}: ${stream.hls_url} -> ${updates.hls_url}`);
    }
    
    // Corrigir FLV URL
    if (stream.flv_url && (stream.flv_url.includes('localhost:8000') || stream.flv_url.includes('/live/'))) {
      updates.flv_url = `/api/streams/${stream.id}/flv`;
      needsUpdate = true;
      console.log(`Corrigindo FLV URL do stream ${stream.id}: ${stream.flv_url} -> ${updates.flv_url}`);
    }
    
    if (needsUpdate) {
      const { error } = await supabase
        .from('streams')
        .update(updates)
        .eq('id', stream.id);
        
      if (error) {
        console.error(`Erro ao atualizar stream ${stream.id}:`, error);
      } else {
        updated++;
        console.log(`✅ Stream ${stream.id} atualizado`);
      }
    }
  }
  
  // Corrigir cameras - usar apenas colunas existentes
  const { data: cameras, error: camerasError } = await supabase
    .from('cameras')
    .select('id, hls_url, flv_url');
    
  if (camerasError) {
    console.error('Erro ao buscar cameras:', camerasError);
    return;
  }
  
  console.log(`Encontradas ${cameras.length} cameras`);
  
  for (const camera of cameras) {
    let needsUpdate = false;
    const updates = {};
    
    // Gerar novo stream ID baseado no ID da camera
    const streamId = camera.id;
    
    if (camera.hls_url && (camera.hls_url.includes('localhost:8000') || camera.hls_url.includes('/live/'))) {
      updates.hls_url = `/api/streams/${streamId}/hls/stream.m3u8`;
      needsUpdate = true;
      console.log(`Corrigindo HLS URL da camera ${camera.id}: ${camera.hls_url} -> ${updates.hls_url}`);
    }
    
    if (camera.flv_url && (camera.flv_url.includes('localhost:8000') || camera.flv_url.includes('/live/'))) {
      updates.flv_url = `/api/streams/${streamId}/flv`;
      needsUpdate = true;
      console.log(`Corrigindo FLV URL da camera ${camera.id}: ${camera.flv_url} -> ${updates.flv_url}`);
    }
    
    if (needsUpdate) {
      const { error } = await supabase
        .from('cameras')
        .update(updates)
        .eq('id', camera.id);
        
      if (error) {
        console.error(`Erro ao atualizar camera ${camera.id}:`, error);
      } else {
        updated++;
        console.log(`✅ Camera ${camera.id} atualizada`);
      }
    }
  }
  
  // Verificar recordings - usar colunas existentes
  const { data: recordings, error: recordingsError } = await supabase
    .from('recordings')
    .select('id, file_path');
    
  if (recordingsError) {
    console.error('Erro ao buscar recordings:', recordingsError);
  } else {
    console.log(`Encontrados ${recordings.length} recordings`);
    
    for (const recording of recordings) {
      let needsUpdate = false;
      const updates = {};
      
      if (recording.file_path && recording.file_path.includes('localhost:8000')) {
        updates.file_path = recording.file_path.replace('localhost:8000', 'localhost:3002/api');
        needsUpdate = true;
        console.log(`Corrigindo file_path do recording ${recording.id}: ${recording.file_path} -> ${updates.file_path}`);
      }
      
      if (needsUpdate) {
        const { error } = await supabase
          .from('recordings')
          .update(updates)
          .eq('id', recording.id);
          
        if (error) {
          console.error(`Erro ao atualizar recording ${recording.id}:`, error);
        } else {
          updated++;
          console.log(`✅ Recording ${recording.id} atualizado`);
        }
      }
    }
  }
  
  console.log(`🎉 Total de registros atualizados: ${updated}`);
  
  if (updated === 0) {
    console.log('✅ Nenhuma URL incorreta encontrada. Todos os registros já estão corretos!');
  }
  
  // Forçar correção de URLs com ID errado
  console.log('🔍 Verificando URLs com IDs incorretos...');
  
  // Corrigir streams com IDs errados
  const { data: wrongStreams } = await supabase
    .from('streams')
    .select('id, hls_url, flv_url')
    .like('hls_url', '%test-stream-123%')
    .or('flv_url.like.%test-stream-123%');
    
  if (wrongStreams && wrongStreams.length > 0) {
    console.log(`Encontrados ${wrongStreams.length} streams com IDs errados`);
    
    for (const stream of wrongStreams) {
      const { error } = await supabase
        .from('streams')
        .update({
          hls_url: `/api/streams/${stream.id}/hls/stream.m3u8`,
          flv_url: `/api/streams/${stream.id}/flv`
        })
        .eq('id', stream.id);
        
      if (error) {
        console.error(`Erro ao corrigir stream ${stream.id}:`, error);
      } else {
        updated++;
        console.log(`✅ Stream ${stream.id} corrigido de test-stream-123 para ID correto`);
      }
    }
  }
}

fixAllUrls().catch(console.error);