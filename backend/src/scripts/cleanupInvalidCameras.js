/**
 * Script para limpar câmeras de teste com URLs inválidas
 * Remove câmeras que não conseguem se conectar (localhost, IPs privados, URLs inválidas)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Carregar variáveis de ambiente
dotenv.config({ path: join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Erro: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanupInvalidCameras() {
  console.log('🔍 Buscando câmeras com URLs inválidas...\n');

  try {
    // Buscar todas as câmeras
    const { data: cameras, error: fetchError } = await supabase
      .from('cameras')
      .select('id, name, rtsp_url, rtmp_url, status');

    if (fetchError) {
      throw fetchError;
    }

    console.log(`📹 Total de câmeras encontradas: ${cameras.length}\n`);

    // Identificar câmeras inválidas
    const invalidCameras = cameras.filter(camera => {
      const rtspUrl = camera.rtsp_url || '';
      const rtmpUrl = camera.rtmp_url || '';

      // URLs inválidas ou localhost ou IPs privados
      const hasInvalidUrl =
        rtspUrl === 'invalid-url' ||
        rtmpUrl === 'invalid-url' ||
        rtspUrl.includes('localhost') ||
        rtmpUrl.includes('localhost') ||
        rtspUrl.includes('127.0.0.1') ||
        rtmpUrl.includes('127.0.0.1') ||
        rtspUrl.includes('192.168.') ||
        rtmpUrl.includes('192.168.') ||
        rtspUrl.includes('10.') ||
        rtmpUrl.includes('10.') ||
        rtspUrl.includes('172.16.') ||
        rtmpUrl.includes('172.16.') ||
        rtspUrl.includes('172.17.') ||
        rtmpUrl.includes('172.17.') ||
        rtspUrl.includes('172.18.') ||
        rtmpUrl.includes('172.18.') ||
        rtspUrl.includes('172.19.') ||
        rtmpUrl.includes('172.19.') ||
        rtspUrl.includes('172.20.') ||
        rtmpUrl.includes('172.20.') ||
        rtspUrl.includes('172.21.') ||
        rtmpUrl.includes('172.21.') ||
        rtspUrl.includes('172.22.') ||
        rtmpUrl.includes('172.22.') ||
        rtspUrl.includes('172.23.') ||
        rtmpUrl.includes('172.23.') ||
        rtspUrl.includes('172.24.') ||
        rtmpUrl.includes('172.24.') ||
        rtspUrl.includes('172.25.') ||
        rtmpUrl.includes('172.25.') ||
        rtspUrl.includes('172.26.') ||
        rtmpUrl.includes('172.26.') ||
        rtspUrl.includes('172.27.') ||
        rtmpUrl.includes('172.27.') ||
        rtspUrl.includes('172.28.') ||
        rtmpUrl.includes('172.28.') ||
        rtspUrl.includes('172.29.') ||
        rtmpUrl.includes('172.29.') ||
        rtspUrl.includes('172.30.') ||
        rtmpUrl.includes('172.30.') ||
        rtspUrl.includes('172.31.') ||
        rtmpUrl.includes('172.31.');

      // Câmeras de teste específicas
      const isTestCamera =
        camera.name.includes('Test Camera') ||
        camera.name.includes('Recording Test') ||
        camera.name.includes('Stream Test') ||
        camera.name === 'Camera Invalid URL' ||
        camera.name === 'Camera Teste SRS API' ||
        camera.name === 'Camera RTMP Dynamic 1762816665657' ||
        camera.name === 'Camera RTMP Dynamic' ||
        camera.name === 'Camera RTSP Test - EDITADO';

      return hasInvalidUrl || isTestCamera;
    });

    if (invalidCameras.length === 0) {
      console.log('✅ Nenhuma câmera inválida encontrada!\n');
      return;
    }

    console.log('🗑️  Câmeras que serão removidas:\n');
    invalidCameras.forEach((camera, index) => {
      console.log(`${index + 1}. ${camera.name} (${camera.id})`);
      console.log(`   RTSP: ${camera.rtsp_url || 'N/A'}`);
      console.log(`   RTMP: ${camera.rtmp_url || 'N/A'}`);
      console.log('');
    });

    console.log(`\n📊 Total a remover: ${invalidCameras.length} câmeras\n`);

    // Deletar câmeras inválidas
    const idsToDelete = invalidCameras.map(c => c.id);

    const { error: deleteError } = await supabase
      .from('cameras')
      .delete()
      .in('id', idsToDelete);

    if (deleteError) {
      throw deleteError;
    }

    console.log(`✅ ${invalidCameras.length} câmeras removidas com sucesso!\n`);

    // Buscar câmeras restantes
    const { data: remainingCameras, error: remainingError } = await supabase
      .from('cameras')
      .select('id, name, status')
      .order('name');

    if (remainingError) {
      throw remainingError;
    }

    console.log('📹 Câmeras restantes no sistema:\n');
    remainingCameras.forEach((camera, index) => {
      console.log(`${index + 1}. ${camera.name} (${camera.status})`);
    });

    console.log(`\n📊 Total de câmeras válidas: ${remainingCameras.length}\n`);
    console.log('✅ Limpeza concluída com sucesso!\n');

  } catch (error) {
    console.error('❌ Erro ao limpar câmeras:', error.message);
    process.exit(1);
  }
}

// Executar limpeza
cleanupInvalidCameras();
