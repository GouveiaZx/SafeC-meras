import dotenv from 'dotenv';
import { supabaseAdmin } from './src/config/database.js';
import { promises as fs } from 'fs';
import path from 'path';
import axios from 'axios';

// Carregar variáveis de ambiente
dotenv.config();

const recordingsPath = process.env.RECORDINGS_PATH || path.join(process.cwd(), 'recordings');
const zlmApiUrl = process.env.ZLMEDIAKIT_API_URL || 'http://localhost:8080';

async function ensureRecordingFlow() {
  try {
    console.log('🔧 Garantindo fluxo de gravação correto...');

    // 1. Verificar configuração do ZLMediaKit
    await checkZLMConfig();

    // 2. Verificar diretório de gravações
    await ensureRecordingsDirectory();

    // 3. Verificar câmeras ativas
    await checkActiveCameras();

    // 4. Testar criação de gravação simulada
    await testRecordingCreation();

    // 5. Verificar webhook handler
    await testWebhookHandler();

    console.log('\n✅ Fluxo de gravação verificado e garantido!');

  } catch (error) {
    console.error('❌ Erro no fluxo de gravação:', error);
  }
}

async function checkZLMConfig() {
  try {
    console.log('🔍 Verificando configuração do ZLMediaKit...');
    
    // Verificar configuração de gravação
    const configPath = path.join(process.cwd(), 'zlmediakit', 'ZLMediaKit', 'conf', 'config.ini');
    
    try {
      const config = await fs.readFile(configPath, 'utf8');
      
      // Verificar se o webhook está configurado
      if (config.includes('on_record_mp4=http://localhost:3002/api/webhooks/on_record_mp4')) {
        console.log('✅ Webhook configurado corretamente');
      } else {
        console.log('⚠️  Webhook não encontrado na configuração');
      }

      // Verificar configuração de segmentação
      if (config.includes('segDur=1800')) { // 30 minutos em segundos
        console.log('✅ Segmentação de 30 minutos configurada');
      } else {
        console.log('⚠️  Segmentação não configurada para 30 minutos');
      }

    } catch (err) {
      console.log('⚠️  Configuração do ZLMediaKit não encontrada');
    }

  } catch (error) {
    console.error('❌ Erro ao verificar configuração:', error);
  }
}

async function ensureRecordingsDirectory() {
  try {
    console.log('📁 Verificando diretório de gravações...');
    
    await fs.mkdir(recordingsPath, { recursive: true });
    
    const stats = await fs.stat(recordingsPath);
    console.log(`✅ Diretório de gravações: ${recordingsPath} (${stats.isDirectory() ? 'OK' : 'ERRO'})`);

  } catch (error) {
    console.error('❌ Erro ao verificar diretório:', error);
  }
}

async function checkActiveCameras() {
  try {
    console.log('📹 Verificando câmeras ativas...');
    
    const { data: cameras, error } = await supabaseAdmin
      .from('cameras')
      .select('id, name, rtsp_url, active, recording_enabled')
      .eq('active', true);

    if (error) {
      throw error;
    }

    console.log(`✅ Câmeras ativas encontradas: ${cameras.length}`);
    cameras.forEach(camera => {
      console.log(`   - ${camera.name} (${camera.id}): ${camera.recording_enabled ? 'Gravação ativa' : 'Gravação desativada'}`);
    });

    return cameras;

  } catch (error) {
    console.error('❌ Erro ao verificar câmeras:', error);
    return [];
  }
}

async function testRecordingCreation() {
  try {
    console.log('🧪 Testando criação de gravação...');

    // Buscar uma câmera para teste
    const { data: camera } = await supabaseAdmin
      .from('cameras')
      .select('id, name')
      .eq('active', true)
      .limit(1)
      .single();

    if (!camera) {
      console.log('⚠️  Nenhuma câmera ativa para teste');
      return;
    }

    const timestamp = Date.now();
    const testFileName = `test-recording-${timestamp}.mp4`;
    const testFilePath = path.join(recordingsPath, testFileName);

    // Criar arquivo de teste
    await fs.writeFile(testFilePath, Buffer.alloc(1024 * 1024)); // 1MB de teste

    // Simular dados de webhook
    const webhookData = {
      start_time: Math.floor(timestamp / 1000) - 1800, // 30 minutos atrás
      file_size: 1024 * 1024,
      time_len: 1800, // 30 minutos
      file_path: testFileName,
      file_name: testFileName,
      folder: recordingsPath,
      url: `record/live/${camera.id}/${testFileName}`,
      app: 'live',
      stream: camera.id
    };

    console.log('📡 Enviando webhook simulado...');
    
    const response = await fetch('http://localhost:3002/api/webhooks/on_record_mp4', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookData)
    });

    const result = await response.json();
    console.log('✅ Webhook resultado:', result);

    // Verificar se a gravação foi criada
    setTimeout(async () => {
      const { data: recording } = await supabaseAdmin
        .from('recordings')
        .select('*')
        .eq('filename', testFileName)
        .single();

      if (recording) {
        console.log('✅ Gravação criada com sucesso:', {
          id: recording.id,
          filename: recording.filename,
          duration: recording.duration,
          file_size: recording.file_size,
          status: recording.status
        });
      } else {
        console.log('❌ Gravação não encontrada no banco');
      }
    }, 2000);

  } catch (error) {
    console.error('❌ Erro ao testar criação:', error);
  }
}

async function testWebhookHandler() {
  try {
    console.log('🔍 Verificando webhook handler...');
    
    // Testar se o endpoint está acessível
    const response = await fetch('http://localhost:3002/api/webhooks/on_record_mp4', {
      method: 'GET'
    });

    if (response.status === 404) {
      console.log('❌ Webhook handler não encontrado');
    } else {
      console.log('✅ Webhook handler encontrado');
    }

  } catch (error) {
    console.error('❌ Erro ao testar webhook:', error);
  }
}

// Executar verificação
ensureRecordingFlow();