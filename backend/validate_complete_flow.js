import dotenv from 'dotenv';
import { supabaseAdmin } from './src/config/database.js';
import { promises as fs } from 'fs';
import path from 'path';

// Carregar variáveis de ambiente
dotenv.config();

class RecordingFlowValidator {
  constructor() {
    this.recordingsPath = process.env.RECORDINGS_PATH || path.join(process.cwd(), 'recordings');
    this.testResults = [];
  }

  async validateCompleteFlow() {
    console.log('🎯 Validando fluxo completo de gravação...\n');

    // 1. Verificar ambiente
    await this.checkEnvironment();

    // 2. Verificar câmeras ativas
    await this.checkActiveCameras();

    // 3. Criar gravação de teste de 30 minutos
    await this.createTestRecording();

    // 4. Testar webhook manualmente
    await this.testWebhookManually();

    // 5. Verificar sincronização
    await this.checkSync();

    // 6. Testar player
    await this.testPlayer();

    // 7. Gerar relatório
    await this.generateReport();
  }

  async checkEnvironment() {
    console.log('🔧 1. Verificando ambiente...');
    
    // Verificar diretório de gravações
    try {
      await fs.mkdir(this.recordingsPath, { recursive: true });
      await fs.access(this.recordingsPath);
      this.testResults.push({ test: 'Diretório de gravações', status: '✅ OK', path: this.recordingsPath });
    } catch (error) {
      this.testResults.push({ test: 'Diretório de gravações', status: '❌ ERRO', error: error.message });
    }

    // Verificar conectividade Supabase
    try {
      const { data, error } = await supabaseAdmin.from('cameras').select('count').limit(1);
      if (!error) {
        this.testResults.push({ test: 'Conexão Supabase', status: '✅ OK' });
      } else {
        throw error;
      }
    } catch (error) {
      this.testResults.push({ test: 'Conexão Supabase', status: '❌ ERRO', error: error.message });
    }
  }

  async checkActiveCameras() {
    console.log('📹 2. Verificando câmeras ativas...');
    
    try {
      const { data: cameras } = await supabaseAdmin
        .from('cameras')
        .select('id, name, rtsp_url, active, recording_enabled')
        .eq('active', true);

      if (cameras && cameras.length > 0) {
        this.testResults.push({ 
          test: 'Câmeras ativas', 
          status: '✅ OK', 
          count: cameras.length,
          cameras: cameras.map(c => ({ id: c.id, name: c.name, recording: c.recording_enabled }))
        });
        
        console.log(`   ${cameras.length} câmeras ativas encontradas`);
        cameras.forEach(c => {
          console.log(`   - ${c.name}: ${c.recording_enabled ? '✅ Gravação ativa' : '⚠️ Gravação desativada'}`);
        });
      } else {
        this.testResults.push({ test: 'Câmeras ativas', status: '⚠️ AVISO', message: 'Nenhuma câmera ativa encontrada' });
      }
    } catch (error) {
      this.testResults.push({ test: 'Câmeras ativas', status: '❌ ERRO', error: error.message });
    }
  }

  async createTestRecording() {
    console.log('🎬 3. Criando gravação de teste de 30 minutos...');
    
    try {
      // Buscar câmera para teste
      const { data: camera } = await supabaseAdmin
        .from('cameras')
        .select('id, name')
        .eq('active', true)
        .limit(1)
        .single();

      if (!camera) {
        throw new Error('Nenhuma câmera ativa disponível para teste');
      }

      // Criar arquivo de teste
      const timestamp = Date.now();
      const testFileName = `test-30min-${timestamp}.mp4`;
      const testFilePath = path.join(this.recordingsPath, testFileName);
      
      // Criar arquivo de teste realista (simulando 30MB para 30 min)
      const testSize = 30 * 1024 * 1024;
      await fs.writeFile(testFilePath, Buffer.alloc(testSize));

      this.testResults.push({ 
        test: 'Arquivo de teste criado', 
        status: '✅ OK', 
        filename: testFileName,
        size: `${(testSize / (1024 * 1024)).toFixed(2)}MB`
      });

      // Simular webhook do ZLMediaKit
      const webhookData = {
        start_time: Math.floor(timestamp / 1000) - 1800, // 30 minutos atrás
        file_size: testSize,
        time_len: 1800, // 30 minutos exatos
        file_path: testFileName,
        file_name: testFileName,
        folder: this.recordingsPath,
        url: `record/live/${camera.id}/${testFileName}`,
        app: 'live',
        stream: camera.id
      };

      this.testFileName = testFileName;
      this.testCamera = camera;
      this.webhookData = webhookData;

    } catch (error) {
      this.testResults.push({ test: 'Criação de teste', status: '❌ ERRO', error: error.message });
    }
  }

  async testWebhookManually() {
    console.log('🔗 4. Testando webhook manualmente...');
    
    if (!this.webhookData) {
      this.testResults.push({ test: 'Webhook test', status: '❌ ERRO', error: 'Dados de teste não disponíveis' });
      return;
    }

    try {
      const response = await fetch('http://localhost:3002/api/webhooks/on_record_mp4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.webhookData)
      });

      const result = await response.json();
      
      if (result.code === 0) {
        this.testResults.push({ test: 'Webhook', status: '✅ OK', response: result });
        console.log('   ✅ Webhook processado com sucesso');
      } else {
        this.testResults.push({ test: 'Webhook', status: '❌ ERRO', response: result });
        console.log(`   ❌ Webhook falhou: ${result.msg}`);
      }

    } catch (error) {
      this.testResults.push({ test: 'Webhook', status: '❌ ERRO', error: error.message });
      console.log(`   ❌ Erro ao testar webhook: ${error.message}`);
    }
  }

  async checkSync() {
    console.log('🔄 5. Verificando sincronização...');
    
    if (!this.testFileName) {
      this.testResults.push({ test: 'Sincronização', status: '❌ ERRO', error: 'Teste não criado' });
      return;
    }

    // Aguardar processamento
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
      const { data: recording } = await supabaseAdmin
        .from('recordings')
        .select('*')
        .eq('filename', this.testFileName)
        .single();

      if (recording) {
        this.testResults.push({ 
          test: 'Sincronização', 
          status: '✅ OK', 
          recording_id: recording.id,
          duration: recording.duration,
          file_size: recording.file_size,
          status_db: recording.status
        });
        this.testRecording = recording;
        console.log('   ✅ Gravação sincronizada com banco de dados');
      } else {
        this.testResults.push({ test: 'Sincronização', status: '❌ ERRO', error: 'Gravação não encontrada no banco' });
        console.log('   ❌ Gravação não encontrada no banco de dados');
      }
    } catch (error) {
      this.testResults.push({ test: 'Sincronização', status: '❌ ERRO', error: error.message });
    }
  }

  async testPlayer() {
    console.log('🎮 6. Testando player...');
    
    if (!this.testRecording) {
      this.testResults.push({ test: 'Player', status: '⚠️ AVISO', message: 'Sem gravação para testar' });
      return;
    }

    try {
      // Gerar token de teste
      const payload = {
        userId: 'test-user',
        email: 'test@example.com',
        role: 'admin',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      };

      const token = require('jsonwebtoken').sign(payload, process.env.JWT_SECRET || 'fallback-secret');

      // Testar URLs
      const baseUrl = 'http://localhost:3002';
      const urls = [
        `${baseUrl}/api/recordings/${this.testRecording.id}/stream?token=${token}`,
        `${baseUrl}/api/recordings/${this.testRecording.id}/download?token=${token}`,
        `${baseUrl}/api/recordings/${this.testRecording.id}/stream`
      ];

      const testResults = [];
      for (const url of urls) {
        try {
          const response = await fetch(url, { method: 'HEAD' });
          testResults.push({ url, status: response.status, ok: response.ok });
        } catch (error) {
          testResults.push({ url, status: 'ERROR', error: error.message });
        }
      }

      const allOk = testResults.every(r => r.ok || r.status === 401); // 401 é esperado sem token
      
      this.testResults.push({ 
        test: 'Player', 
        status: allOk ? '✅ OK' : '⚠️ PARCIAL',
        urls: testResults,
        test_url: urls[0]
      });

    } catch (error) {
      this.testResults.push({ test: 'Player', status: '❌ ERRO', error: error.message });
    }
  }

  async generateReport() {
    console.log('\n📊 RELATÓRIO FINAL DE VALIDAÇÃO\n');
    
    const summary = {
      total: this.testResults.length,
      ok: this.testResults.filter(r => r.status.includes('✅')).length,
      warning: this.testResults.filter(r => r.status.includes('⚠️')).length,
      error: this.testResults.filter(r => r.status.includes('❌')).length
    };

    console.log(`📈 Resumo: ${summary.ok} OK, ${summary.warning} AVISO, ${summary.error} ERRO`);
    
    this.testResults.forEach(result => {
      console.log(`${result.test}: ${result.status}`);
      if (result.error) {
        console.log(`   ❌ ${result.error}`);
      }
      if (result.message) {
        console.log(`   ⚠️  ${result.message}`);
      }
    });

    // URLs de teste
    if (this.testRecording) {
      console.log('\n🔗 URLs de teste:');
      console.log(`   Stream: http://localhost:3002/api/recordings/${this.testRecording.id}/stream`);
      console.log(`   Download: http://localhost:3002/api/recordings/${this.testRecording.id}/download`);
    }

    // Recomendações
    console.log('\n💡 RECOMENDAÇÕES:');
    if (summary.error > 0) {
      console.log('   1. Execute: npm run dev (para iniciar o servidor)');
      console.log('   2. Verifique se o ZLMediaKit está rodando');
      console.log('   3. Configure as câmeras com gravação habilitada');
    } else {
      console.log('   ✅ Sistema pronto para gravações de 30 minutos!');
    }
  }
}

// Executar validação
async function main() {
  const validator = new RecordingFlowValidator();
  await validator.validateCompleteFlow();
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default RecordingFlowValidator;