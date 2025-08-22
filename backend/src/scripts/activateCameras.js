#!/usr/bin/env node

/**
 * Script para ativar e configurar corretamente as câmeras
 */

import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Carregar variáveis de ambiente
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Configurar cliente Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ZLM_BASE_URL = process.env.ZLM_BASE_URL || 'http://localhost:8000';
const ZLM_SECRET = process.env.ZLM_SECRET || '9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK';

/**
 * Adicionar proxy stream para RTSP
 */
async function addRTSPProxy(camera) {
  try {
    console.log(`\n🎥 Configurando proxy RTSP para ${camera.name}...`);
    
    // Adicionar proxy no ZLMediaKit
    const response = await axios.get(`${ZLM_BASE_URL}/index/api/addStreamProxy`, {
      params: {
        secret: ZLM_SECRET,
        vhost: '__defaultVhost__',
        app: 'live',
        stream: camera.id,
        url: camera.rtsp_url,
        enable_mp4: 1,
        enable_hls: 1,
        enable_rtsp: 1,
        enable_rtmp: 1,
        rtp_type: 0,
        timeout_sec: 10,
        retry_count: 3
      }
    });
    
    if (response.data.code === 0) {
      console.log(`✅ Proxy RTSP criado para ${camera.name}`);
      return true;
    } else {
      console.error(`❌ Erro ao criar proxy:`, response.data.msg);
      return false;
    }
  } catch (error) {
    console.error(`❌ Erro ao adicionar proxy RTSP:`, error.message);
    return false;
  }
}

/**
 * Adicionar proxy stream para RTMP
 */
async function addRTMPProxy(camera) {
  try {
    console.log(`\n🎥 Configurando proxy RTMP para ${camera.name}...`);
    
    // Para RTMP, vamos usar FFmpeg para converter
    const ffmpegCmd = `ffmpeg -i "${camera.rtmp_url}" -c copy -f flv "rtmp://localhost:1935/live/${camera.id}"`;
    
    console.log(`📌 Comando FFmpeg para RTMP:`, ffmpegCmd);
    console.log(`⚠️ NOTA: Para câmeras RTMP externas, execute este comando manualmente ou configure um serviço`);
    
    // Alternativamente, adicionar como proxy direto
    const response = await axios.get(`${ZLM_BASE_URL}/index/api/addStreamProxy`, {
      params: {
        secret: ZLM_SECRET,
        vhost: '__defaultVhost__',
        app: 'live',
        stream: camera.id,
        url: camera.rtmp_url,
        enable_mp4: 1,
        enable_hls: 1,
        enable_rtsp: 1,
        enable_rtmp: 1,
        rtp_type: 0,
        timeout_sec: 10,
        retry_count: 3
      }
    });
    
    if (response.data.code === 0) {
      console.log(`✅ Proxy RTMP criado para ${camera.name}`);
      return true;
    } else {
      console.error(`❌ Erro ao criar proxy:`, response.data.msg);
      return false;
    }
  } catch (error) {
    console.error(`❌ Erro ao adicionar proxy RTMP:`, error.message);
    return false;
  }
}

/**
 * Iniciar gravação para câmera
 */
async function startRecording(camera) {
  try {
    console.log(`\n📹 Iniciando gravação para ${camera.name}...`);
    
    // Parar gravação existente se houver
    await axios.get(`${ZLM_BASE_URL}/index/api/stopRecord`, {
      params: {
        secret: ZLM_SECRET,
        type: 1,
        vhost: '__defaultVhost__',
        app: 'live',
        stream: camera.id
      }
    }).catch(() => {});
    
    // Aguardar
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Iniciar nova gravação
    const response = await axios.get(`${ZLM_BASE_URL}/index/api/startRecord`, {
      params: {
        secret: ZLM_SECRET,
        type: 1, // MP4
        vhost: '__defaultVhost__',
        app: 'live',
        stream: camera.id,
        max_second: 1800, // Segmentos de 1800 segundos (30 minutos)
        customized_path: '' // Path padrão
      }
    });
    
    if (response.data.code === 0) {
      console.log(`✅ Gravação iniciada para ${camera.name}`);
      
      // Atualizar status no banco
      await supabase
        .from('cameras')
        .update({
          is_recording: true,
          status: 'online',
          is_streaming: true,
          metadata: {
            recording_started: new Date().toISOString(),
            segment_duration: 1800
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', camera.id);
        
      return true;
    } else {
      console.error(`❌ Erro ao iniciar gravação:`, response.data.msg);
      return false;
    }
  } catch (error) {
    console.error(`❌ Erro ao iniciar gravação:`, error.message);
    return false;
  }
}

/**
 * Verificar status do stream
 */
async function checkStreamStatus(cameraId) {
  try {
    const response = await axios.get(`${ZLM_BASE_URL}/index/api/getMediaList`, {
      params: {
        secret: ZLM_SECRET,
        vhost: '__defaultVhost__',
        app: 'live'
      }
    });
    
    if (response.data.code === 0) {
      const streams = response.data.data || [];
      const streamExists = streams.some(s => 
        s.stream === cameraId || 
        (s.streams && s.streams.some(st => st.stream === cameraId))
      );
      
      return streamExists;
    }
    
    return false;
  } catch (error) {
    console.error(`❌ Erro ao verificar status:`, error.message);
    return false;
  }
}

/**
 * Ativar câmera
 */
async function activateCamera(camera) {
  console.log('\n' + '='.repeat(60));
  console.log(`🎬 Ativando câmera: ${camera.name}`);
  console.log(`   ID: ${camera.id}`);
  console.log(`   Tipo: ${camera.stream_type}`);
  console.log(`   URL: ${camera.rtsp_url || camera.rtmp_url}`);
  console.log('='.repeat(60));
  
  let success = false;
  
  // 1. Adicionar proxy baseado no tipo
  if (camera.stream_type === 'rtsp' && camera.rtsp_url) {
    success = await addRTSPProxy(camera);
  } else if (camera.stream_type === 'rtmp' && camera.rtmp_url) {
    success = await addRTMPProxy(camera);
  } else {
    console.error(`❌ Tipo de stream não suportado ou URL ausente`);
    return false;
  }
  
  if (!success) {
    console.error(`❌ Falha ao adicionar proxy para ${camera.name}`);
    return false;
  }
  
  // 2. Aguardar stream ficar disponível
  console.log(`\n⏳ Aguardando stream ficar disponível...`);
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    attempts++;
    const isActive = await checkStreamStatus(camera.id);
    
    if (isActive) {
      console.log(`✅ Stream ativo para ${camera.name}`);
      break;
    }
    
    console.log(`   [${attempts}/${maxAttempts}] Aguardando...`);
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  // 3. Iniciar gravação
  if (camera.recording_enabled) {
    const recordingStarted = await startRecording(camera);
    
    if (!recordingStarted) {
      console.warn(`⚠️ Gravação não pôde ser iniciada para ${camera.name}`);
    }
  }
  
  // 4. Atualizar URLs de streaming
  const streamUrls = {
    hls_url: `/api/streams/${camera.id}/hls/playlist.m3u8`,
    flv_url: `http://localhost:8000/live/${camera.id}.live.flv`,
    updated_at: new Date().toISOString()
  };
  
  await supabase
    .from('cameras')
    .update(streamUrls)
    .eq('id', camera.id);
  
  console.log(`\n✅ Câmera ${camera.name} ativada com sucesso!`);
  console.log(`   HLS: ${streamUrls.hls_url}`);
  console.log(`   FLV: ${streamUrls.flv_url}`);
  
  return true;
}

/**
 * Executar ativação
 */
async function main() {
  console.log('🚀 Script de Ativação de Câmeras');
  console.log('=' .repeat(60));
  
  // Buscar todas as câmeras
  const { data: cameras, error } = await supabase
    .from('cameras')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('❌ Erro ao buscar câmeras:', error);
    process.exit(1);
  }
  
  if (!cameras || cameras.length === 0) {
    console.log('⚠️ Nenhuma câmera encontrada');
    process.exit(0);
  }
  
  console.log(`\n📊 Encontradas ${cameras.length} câmeras para ativar`);
  
  // Ativar cada câmera
  for (const camera of cameras) {
    await activateCamera(camera);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Processo de ativação concluído!');
  console.log('=' .repeat(60));
  
  // Verificar status final
  console.log('\n📊 Status Final das Câmeras:');
  
  for (const camera of cameras) {
    const isActive = await checkStreamStatus(camera.id);
    const status = isActive ? '🟢 ATIVO' : '🔴 INATIVO';
    console.log(`   ${status} - ${camera.name}`);
  }
}

// Executar
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });