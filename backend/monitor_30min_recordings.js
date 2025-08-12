import dotenv from 'dotenv';
import { supabaseAdmin } from './src/config/database.js';
import { promises as fs } from 'fs';
import path from 'path';
import axios from 'axios';

// Carregar variáveis de ambiente
dotenv.config();

const recordingsPath = process.env.RECORDINGS_PATH || path.join(process.cwd(), 'recordings');
const zlmApiUrl = process.env.ZLMEDIAKIT_API_URL || 'http://localhost:8080';

class RecordingMonitor {
  constructor() {
    this.checkInterval = 30000; // 30 segundos
    this.expectedDuration = 1800; // 30 minutos em segundos
    this.allowedVariance = 60; // 1 minuto de margem
  }

  async start() {
    console.log('🎬 Monitor de gravações iniciado...');
    console.log(`📊 Verificando a cada ${this.checkInterval/1000}s`);
    console.log(`⏱️  Duração esperada: ${this.expectedDuration}s (30 minutos)`);

    // Verificação inicial
    await this.checkAllRecordings();

    // Configurar verificação periódica
    setInterval(async () => {
      await this.checkAllRecordings();
    }, this.checkInterval);
  }

  async checkAllRecordings() {
    try {
      console.log('\n🔍 Verificando gravações...', new Date().toLocaleString());

      // Buscar gravações recentes (últimas 24 horas)
      const { data: recordings, error } = await supabaseAdmin
        .from('recordings')
        .select('*, cameras(name)')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Erro ao buscar gravações:', error);
        return;
      }

      console.log(`📊 ${recordings.length} gravações encontradas nas últimas 24h`);

      // Analisar cada gravação
      for (const recording of recordings) {
        await this.analyzeRecording(recording);
      }

      // Verificar câmeras ativas e gravações em andamento
      await this.checkActiveRecordings();

    } catch (error) {
      console.error('❌ Erro na verificação:', error);
    }
  }

  async analyzeRecording(recording) {
    try {
      const duration = recording.duration || 0;
      const expected = this.expectedDuration;
      const variance = Math.abs(duration - expected);

      let status = '✅ OK';
      let details = '';

      if (duration < 5) {
        status = '❌ MUITO CURTA';
        details = `Duração: ${duration}s (muito curta)`;
      } else if (variance <= this.allowedVariance) {
        status = '✅ OK';
        details = `Duração: ${duration}s (dentro da margem)`;
      } else if (duration > expected + this.allowedVariance) {
        status = '⚠️  MUITO LONGA';
        details = `Duração: ${duration}s (excede 30min)`;
      } else if (duration < expected - this.allowedVariance) {
        status = '⚠️  CURTA';
        details = `Duração: ${duration}s (menos que 30min)`;
      }

      console.log(`   ${status} ${recording.cameras?.name || 'Câmera desconhecida'} - ${recording.filename}`);
      if (details) console.log(`      ${details}`);

      // Verificar arquivo físico
      const filePath = path.join(recordingsPath, recording.filename);
      try {
        const stats = await fs.stat(filePath);
        const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`      📁 Arquivo: ${fileSizeMB}MB`);
      } catch (err) {
        console.log(`      ❌ Arquivo não encontrado: ${recording.filename}`);
      }

    } catch (error) {
      console.error(`❌ Erro ao analisar gravação ${recording.id}:`, error.message);
    }
  }

  async checkActiveRecordings() {
    try {
      // Buscar câmeras ativas com gravação habilitada
      const { data: cameras } = await supabaseAdmin
        .from('cameras')
        .select('id, name, recording_enabled')
        .eq('active', true)
        .eq('recording_enabled', true);

      if (!cameras || cameras.length === 0) {
        console.log('⚠️  Nenhuma câmera ativa com gravação habilitada');
        return;
      }

      console.log(`\n📹 Verificando câmeras ativas (${cameras.length}):`);

      for (const camera of cameras) {
        // Verificar se há gravações recentes para esta câmera
        const { data: recent } = await supabaseAdmin
          .from('recordings')
          .select('id, created_at, duration')
          .eq('camera_id', camera.id)
          .gte('created_at', new Date(Date.now() - 35 * 60 * 1000).toISOString()) // últimos 35 min
          .order('created_at', { ascending: false })
          .limit(1);

        if (recent && recent.length > 0) {
          const lastRecording = recent[0];
          const minutesAgo = Math.floor((Date.now() - new Date(lastRecording.created_at).getTime()) / (1000 * 60));
          console.log(`   ✅ ${camera.name}: última gravação há ${minutesAgo} minutos`);
        } else {
          console.log(`   ⚠️  ${camera.name}: sem gravações recentes (últimos 35 min)`);
        }
      }

    } catch (error) {
      console.error('❌ Erro ao verificar câmeras ativas:', error);
    }
  }

  async simulate30MinRecording() {
    try {
      console.log('\n🧪 Simulando gravação de 30 minutos...');

      // Buscar câmera ativa
      const { data: camera } = await supabaseAdmin
        .from('cameras')
        .select('id, name')
        .eq('active', true)
        .limit(1)
        .single();

      if (!camera) {
        console.log('❌ Nenhuma câmera ativa para teste');
        return;
      }

      // Criar arquivo de teste de 30 minutos
      const timestamp = Date.now();
      const testFileName = `simulation-${camera.id}-${timestamp}.mp4`;
      const testFilePath = path.join(recordingsPath, testFileName);

      // Criar arquivo de teste (simulando 30MB para 30 min)
      const testSize = 30 * 1024 * 1024; // 30MB
      await fs.writeFile(testFilePath, Buffer.alloc(testSize));

      // Simular webhook do ZLMediaKit
      const webhookData = {
        start_time: Math.floor(timestamp / 1000) - 1800, // 30 minutos atrás
        file_size: testSize,
        time_len: 1800, // 30 minutos exatos
        file_path: testFileName,
        file_name: testFileName,
        folder: recordingsPath,
        url: `record/live/${camera.id}/${testFileName}`,
        app: 'live',
        stream: camera.id
      };

      console.log('📡 Enviando webhook simulado para gravação de 30 min...');
      
      try {
        const response = await fetch('http://localhost:3002/api/webhooks/on_record_mp4', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(webhookData)
        });

        const result = await response.json();
        console.log('✅ Webhook resultado:', result);

        // Verificar se foi criada
        setTimeout(async () => {
          const { data: recording } = await supabaseAdmin
            .from('recordings')
            .select('*')
            .eq('filename', testFileName)
            .single();

          if (recording) {
            console.log('✅ Gravação de 30 min criada com sucesso:', {
              id: recording.id,
              duration: recording.duration,
              file_size: recording.file_size
            });
          }
        }, 3000);

      } catch (err) {
        console.error('❌ Erro ao enviar webhook:', err.message);
      }

    } catch (error) {
      console.error('❌ Erro na simulação:', error);
    }
  }
}

// Funções auxiliares
async function checkWebhookEndpoint() {
  try {
    console.log('🔍 Verificando endpoint webhook...');
    
    const response = await fetch('http://localhost:3002/api/webhooks/on_record_mp4', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true })
    });

    console.log(`📡 Status webhook: ${response.status}`);
    return response.ok;

  } catch (error) {
    console.error('❌ Webhook não acessível:', error.message);
    return false;
  }
}

// Executar monitoramento
async function main() {
  const monitor = new RecordingMonitor();
  
  // Verificar webhook antes de iniciar
  const webhookOk = await checkWebhookEndpoint();
  if (!webhookOk) {
    console.log('⚠️  Webhook não está acessível. Verifique se o servidor está rodando.');
    console.log('💡 Para iniciar o servidor: npm run dev');
    return;
  }

  // Menu de opções
  console.log('\n🎬 Monitor de Gravações 30 Minutos');
  console.log('1. Iniciar monitoramento contínuo');
  console.log('2. Simular gravação de 30 minutos');
  console.log('3. Verificar gravações recentes');

  const args = process.argv.slice(2);
  const option = args[0] || '1';

  switch (option) {
    case '1':
      await monitor.start();
      break;
    case '2':
      await monitor.simulate30MinRecording();
      break;
    case '3':
      await monitor.checkAllRecordings();
      break;
    default:
      await monitor.start();
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default RecordingMonitor;