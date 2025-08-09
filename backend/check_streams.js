import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

try {
  console.log('🔍 Verificando streams ativos no ZLMediaKit...');
  
  // Verificar streams no ZLMediaKit
  const response = await fetch('http://localhost:8080/index/api/getMediaList');
  const mediaData = await response.json();
  
  console.log('Streams ativos no ZLMediaKit:', mediaData.data?.length || 0);
  
  if (mediaData.data && mediaData.data.length > 0) {
    mediaData.data.forEach(stream => {
      console.log(`- Stream: ${stream.app}/${stream.stream} (${stream.schema})`);
      console.log(`  Origem: ${stream.originUrl || 'N/A'}`);
      console.log(`  Duração: ${stream.totalReaderCount} leitores`);
    });
  }
  
  console.log('\n🎬 Verificando gravações recentes...');
  
  // Verificar gravações recentes
  const { data: recordings, error } = await supabase
    .from('recordings')
    .select('id, camera_id, filename, status, created_at, file_size, duration')
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (error) {
    console.error('Erro ao buscar gravações:', error);
  } else {
    console.log('Gravações recentes:', recordings?.length || 0);
    recordings?.forEach(rec => {
      console.log(`- ${rec.filename} (${rec.status}) - ${new Date(rec.created_at).toLocaleString()}`);
    });
  }
  
} catch (err) {
  console.error('Erro:', err);
}