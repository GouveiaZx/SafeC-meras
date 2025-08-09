/**
 * Script para corrigir URLs diretas do ZLMediaKit no banco de dados
 * Converte URLs localhost:8000 para URLs de proxy /api/streams/
 */

import { supabaseAdmin } from './src/config/database.js';
import { createModuleLogger } from './src/config/logger.js';

const logger = createModuleLogger('FixDatabaseUrls');

async function fixDatabaseUrls() {
  try {
    console.log('🔧 Iniciando correção de URLs no banco de dados...');
    
    // Buscar todos os streams com URLs diretas
    const { data: streams, error: fetchError } = await supabaseAdmin
      .from('streams')
      .select('id, hls_url, flv_url, rtsp_url, rtmp_url, camera_id')
      .or('hls_url.like.%localhost:8000%,flv_url.like.%localhost:8000%');
    
    if (fetchError) {
      throw new Error(`Erro ao buscar streams: ${fetchError.message}`);
    }
    
    if (!streams || streams.length === 0) {
      console.log('✅ Nenhum stream com URLs diretas encontrado.');
      return;
    }
    
    console.log(`📋 Encontrados ${streams.length} streams com URLs diretas:`);
    streams.forEach(stream => {
      console.log(`  - Stream ${stream.id}: ${stream.hls_url}`);
    });
    
    // Atualizar cada stream
    for (const stream of streams) {
      console.log(`\n🔄 Atualizando stream ${stream.id}...`);
      
      // Extrair o stream ID da URL HLS atual
      let streamId = stream.id;
      if (stream.hls_url && stream.hls_url.includes('/live/')) {
        const match = stream.hls_url.match(/\/live\/([^/]+)\//);
        if (match) {
          streamId = match[1];
        }
      }
      
      // Gerar novas URLs de proxy
      const newUrls = {
        hls_url: `/api/streams/${streamId}/hls/stream.m3u8`,
        flv_url: `/api/streams/${streamId}/flv`,
        // Manter RTSP e RTMP como estão (são URLs internas)
        rtsp_url: stream.rtsp_url,
        rtmp_url: stream.rtmp_url
      };
      
      console.log(`  📝 URLs antigas:`);
      console.log(`    HLS: ${stream.hls_url}`);
      console.log(`    FLV: ${stream.flv_url}`);
      console.log(`  📝 URLs novas:`);
      console.log(`    HLS: ${newUrls.hls_url}`);
      console.log(`    FLV: ${newUrls.flv_url}`);
      
      // Atualizar no banco
      const { error: updateError } = await supabaseAdmin
        .from('streams')
        .update(newUrls)
        .eq('id', stream.id);
      
      if (updateError) {
        console.error(`❌ Erro ao atualizar stream ${stream.id}:`, updateError.message);
      } else {
        console.log(`✅ Stream ${stream.id} atualizado com sucesso`);
      }
    }
    
    console.log('\n🎉 Correção de URLs concluída!');
    
    // Verificar resultado
    const { data: updatedStreams, error: verifyError } = await supabaseAdmin
      .from('streams')
      .select('id, hls_url, flv_url')
      .in('id', streams.map(s => s.id));
    
    if (verifyError) {
      console.error('❌ Erro ao verificar resultado:', verifyError.message);
    } else {
      console.log('\n📋 URLs após correção:');
      updatedStreams.forEach(stream => {
        console.log(`  - Stream ${stream.id}:`);
        console.log(`    HLS: ${stream.hls_url}`);
        console.log(`    FLV: ${stream.flv_url}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Erro durante correção:', error.message);
    logger.error('Erro ao corrigir URLs:', error);
    process.exit(1);
  }
}

// Executar correção
fixDatabaseUrls()
  .then(() => {
    console.log('\n✅ Script executado com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Falha na execução do script:', error);
    process.exit(1);
  });