#!/usr/bin/env node

/**
 * Script para testar a conectividade com ZLMediaKit e verificar streams ativos
 */

const fetch = require('node-fetch');

async function testZLMHealth() {
  console.log('🔍 Testando conectividade com ZLMediaKit...\n');

  const ZLM_BASE_URL = process.env.ZLM_BASE_URL || 'http://localhost:8000';
  const ZLM_SECRET = process.env.ZLMEDIAKIT_SECRET || process.env.ZLM_SECRET || '035c73f7-bb6b-4889-a715-d9eb2d1925cc';

  try {
    // Testar conectividade básica
    console.log('📡 Verificando ZLMediaKit em:', ZLM_BASE_URL);
    
    const response = await fetch(`${ZLM_BASE_URL}/index/api/getMediaList?secret=${ZLM_SECRET}`, {
      method: 'GET',
      timeout: 10000
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ ZLMediaKit está respondendo');
      
      if (data.data && data.data.length > 0) {
        console.log('📺 Streams ativos encontrados:');
        data.data.forEach((stream, index) => {
          console.log(`  ${index + 1}. Stream: ${stream.stream} | App: ${stream.app} | Vhost: ${stream.vhost}`);
          console.log(`     URL: ${ZLM_BASE_URL}/live/${stream.stream}/hls.m3u8`);
        });
      } else {
        console.log('⚠️ Nenhum stream ativo encontrado no ZLMediaKit');
      }
    } else {
      console.error('❌ Erro ao conectar ao ZLMediaKit:', response.status, response.statusText);
      console.log('💡 Verifique se o ZLMediaKit está rodando em:', ZLM_BASE_URL);
      console.log('💡 Verifique se a secret está correta:', ZLM_SECRET);
    }

  } catch (error) {
    console.error('❌ Erro de conexão:', error.message);
    console.log('💡 Verifique se o ZLMediaKit está rodando em:', ZLM_BASE_URL);
    console.log('💡 Verifique se o servidor está acessível');
  }
}

// Testar endpoints locais
testZLMHealth();