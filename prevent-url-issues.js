// Script preventivo para garantir URLs corretas em novos cadastros
// Este script pode ser executado periodicamente ou integrado ao backend

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'backend/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Função para garantir que novos streams/câmeras usem URLs corretas
 * Deve ser chamada após criar um novo stream ou câmera
 */
async function ensureCorrectUrls(type, id) {
  try {
    if (type === 'stream') {
      const { data, error } = await supabase
        .from('streams')
        .update({
          hls_url: `/api/streams/${id}/hls/stream.m3u8`,
          flv_url: `/api/streams/${id}/flv`
        })
        .eq('id', id);
        
      if (error) {
        console.error(`Erro ao atualizar URLs do stream ${id}:`, error);
        return false;
      }
      
      console.log(`✅ URLs do stream ${id} garantidas como corretas`);
      return true;
    }
    
    if (type === 'camera') {
      const { data, error } = await supabase
        .from('cameras')
        .update({
          hls_url: `/api/streams/${id}/hls/stream.m3u8`,
          flv_url: `/api/streams/${id}/flv`
        })
        .eq('id', id);
        
      if (error) {
        console.error(`Erro ao atualizar URLs da câmera ${id}:`, error);
        return false;
      }
      
      console.log(`✅ URLs da câmera ${id} garantidas como corretas`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`Erro ao garantir URLs corretas:`, error);
    return false;
  }
}

/**
 * Função para verificar e corrigir URLs problemáticas automaticamente
 */
async function autoFixUrls() {
  console.log('🤖 Executando correção automática de URLs...');
  
  // Verificar streams
  const { data: streams } = await supabase
    .from('streams')
    .select('id, hls_url, flv_url');
    
  let fixed = 0;
  
  for (const stream of streams || []) {
    const correctHls = `/api/streams/${stream.id}/hls/stream.m3u8`;
    const correctFlv = `/api/streams/${stream.id}/flv`;
    
    let needsFix = false;
    const updates = {};
    
    if (stream.hls_url !== correctHls) {
      updates.hls_url = correctHls;
      needsFix = true;
    }
    
    if (stream.flv_url !== correctFlv) {
      updates.flv_url = correctFlv;
      needsFix = true;
    }
    
    if (needsFix) {
      const { error } = await supabase
        .from('streams')
        .update(updates)
        .eq('id', stream.id);
        
      if (!error) {
        fixed++;
        console.log(`✅ Stream ${stream.id} corrigido`);
      }
    }
  }
  
  // Verificar cameras
  const { data: cameras } = await supabase
    .from('cameras')
    .select('id, hls_url, flv_url');
    
  for (const camera of cameras || []) {
    const correctHls = `/api/streams/${camera.id}/hls/stream.m3u8`;
    const correctFlv = `/api/streams/${camera.id}/flv`;
    
    let needsFix = false;
    const updates = {};
    
    if (camera.hls_url !== correctHls) {
      updates.hls_url = correctHls;
      needsFix = true;
    }
    
    if (camera.flv_url !== correctFlv) {
      updates.flv_url = correctFlv;
      needsFix = true;
    }
    
    if (needsFix) {
      const { error } = await supabase
        .from('cameras')
        .update(updates)
        .eq('id', camera.id);
        
      if (!error) {
        fixed++;
        console.log(`✅ Camera ${camera.id} corrigida`);
      }
    }
  }
  
  console.log(`🎯 Correção automática concluída: ${fixed} registros corrigidos`);
  return fixed;
}

// Executar correção automática se chamado diretamente
if (require.main === module) {
  autoFixUrls().catch(console.error);
}

module.exports = { ensureCorrectUrls, autoFixUrls };