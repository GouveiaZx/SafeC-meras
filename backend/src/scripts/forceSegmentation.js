#!/usr/bin/env node

/**
 * Script para forçar configuração de segmentação de 1800 segundos (30 minutos) no ZLMediaKit
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
 * Reiniciar gravação com segmentação forçada
 */
async function forceSegmentation(cameraId) {
  try {
    console.log(`🔧 Forçando segmentação de 30min para câmera ${cameraId}`);
    
    // 1. Parar gravação atual
    console.log('🛑 Parando gravação atual...');
    try {
      await axios.get(`${ZLM_BASE_URL}/index/api/stopRecord`, {
        params: {
          secret: ZLM_SECRET,
          type: 1, // MP4
          vhost: '__defaultVhost__',
          app: 'live',
          stream: cameraId
        }
      });
      console.log('✅ Gravação parada');
    } catch (error) {
      console.log('⚠️ Nenhuma gravação ativa para parar');
    }
    
    // 2. Aguardar um momento
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 3. Iniciar com configuração explícita de segmentação
    console.log('🎥 Iniciando gravação com segmentação de 30 minutos...');
    const startResponse = await axios.get(`${ZLM_BASE_URL}/index/api/startRecord`, {
      params: {
        secret: ZLM_SECRET,
        type: 1, // MP4
        vhost: '__defaultVhost__',
        app: 'live',
        stream: cameraId,
        max_second: 1800, // FORÇAR 1800 segundos (30 minutos)
        customized_path: `/opt/media/bin/www/record` // Caminho personalizado
      }
    });
    
    if (startResponse.data.code === 0) {
      console.log('✅ Gravação iniciada com segmentação de 30min');
      console.log('📊 Resposta:', startResponse.data);
      
      // 4. Atualizar banco de dados
      const { error } = await supabase
        .from('cameras')
        .update({
          is_recording: true,
          metadata: {
            segmentation_enabled: true,
            segment_duration: 1800,
            last_restart: new Date().toISOString()
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', cameraId);
      
      if (!error) {
        console.log('✅ Banco de dados atualizado');
      }
      
      return true;
    } else {
      console.error('❌ Erro ao iniciar gravação:', startResponse.data.msg);
      return false;
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    if (error.response) {
      console.error('Detalhes:', error.response.data);
    }
    return false;
  }
}

/**
 * Verificar configuração do ZLMediaKit
 */
async function checkZLMConfig() {
  try {
    console.log('\n📋 Verificando configuração do ZLMediaKit...');
    
    // Tentar obter configuração via API
    const response = await axios.get(`${ZLM_BASE_URL}/index/api/getServerConfig`, {
      params: {
        secret: ZLM_SECRET
      }
    });
    
    if (response.data.code === 0 && response.data.data) {
      const config = response.data.data;
      console.log('✅ Configuração obtida:');
      console.log(`   - record.fileSecond: ${config['record.fileSecond'] || 'não definido'}`);
      console.log(`   - record.filePath: ${config['record.filePath'] || 'não definido'}`);
      console.log(`   - general.enable_mp4: ${config['general.enable_mp4'] || 'não definido'}`);
      
      if (config['record.fileSecond'] !== '60') {
        console.warn('⚠️ fileSecond não está configurado para 1800 segundos!');
      }
    }
    
  } catch (error) {
    console.error('❌ Não foi possível obter configuração:', error.message);
  }
}

/**
 * Monitorar criação de segmentos
 */
async function monitorSegments(cameraId, duration = 120) {
  console.log(`\n📊 Monitorando segmentos por ${duration} segundos...`);
  
  const startTime = Date.now();
  let lastCheck = null;
  
  const interval = setInterval(async () => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    
    try {
      // Buscar arquivos gravados
      const response = await axios.get(`${ZLM_BASE_URL}/index/api/getMP4RecordFile`, {
        params: {
          secret: ZLM_SECRET,
          vhost: '__defaultVhost__',
          app: 'live',
          stream: cameraId,
          period: '180' // Últimos 3 minutos
        }
      });
      
      if (response.data.code === 0 && response.data.data) {
        const files = response.data.data;
        
        if (files.length > 0) {
          const latest = files[files.length - 1];
          
          if (!lastCheck || latest.file_name !== lastCheck.file_name) {
            console.log(`🎬 [${elapsed}s] Novo segmento detectado:`);
            console.log(`   📁 Arquivo: ${latest.file_name}`);
            console.log(`   ⏱️ Duração: ${latest.time_len}s`);
            console.log(`   💾 Tamanho: ${(latest.file_size / 1024 / 1024).toFixed(2)} MB`);
            lastCheck = latest;
          }
        }
      }
    } catch (error) {
      // Ignorar erros de polling
    }
    
    // Parar após o tempo definido
    if (elapsed >= duration) {
      clearInterval(interval);
      console.log('\n✅ Monitoramento concluído');
    }
  }, 5000); // Verificar a cada 5 segundos
}

/**
 * Executar script
 */
async function main() {
  console.log('🚀 Forçando Segmentação de 60 Segundos no ZLMediaKit');
  console.log('=' .repeat(60));
  
  // Verificar configuração
  await checkZLMConfig();
  
  // Buscar câmera online
  const { data: cameras } = await supabase
    .from('cameras')
    .select('*')
    .eq('status', 'online')
    .limit(1);
  
  if (!cameras || cameras.length === 0) {
    console.error('❌ Nenhuma câmera online encontrada');
    process.exit(1);
  }
  
  const camera = cameras[0];
  console.log(`\n📹 Usando câmera: ${camera.name} (${camera.id})`);
  
  // Forçar segmentação
  const success = await forceSegmentation(camera.id);
  
  if (success) {
    // Monitorar resultados
    await monitorSegments(camera.id, 120);
  } else {
    console.error('❌ Falha ao configurar segmentação');
    process.exit(1);
  }
}

// Executar
main().catch(error => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});