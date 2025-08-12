import dotenv from 'dotenv';
import { supabaseAdmin } from './src/config/database.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Carregar variáveis de ambiente
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DeepRecordingDebugger {
  constructor() {
    this.recordingsPath = process.env.RECORDINGS_PATH || path.join(__dirname, 'recordings');
    this.debugLog = [];
  }

  async debugCompleteSystem() {
    console.log('🔍 DEBUG PROFUNDO DO SISTEMA DE GRAVAÇÃO\n');
    
    await this.checkSystemState();
    await this.checkCamerasConfiguration();
    await this.checkZLMConnection();
    await this.checkRecordingFlow();
    await this.checkFileSystem();
    await this.checkDatabaseIntegrity();
    await this.checkWebhookEndpoint();
    
    this.generateDebugReport();
  }

  async log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${type.toUpperCase()}: ${message}`;
    console.log(logEntry);
    this.debugLog.push(logEntry);
  }

  async checkSystemState() {
    console.log('📊 1. ESTADO DO SISTEMA');
    console.log('=========================');
    
    // Verificar variáveis de ambiente críticas
    const envVars = {
      'SUPABASE_URL': process.env.SUPABASE_URL,
      'SUPABASE_ANON_KEY': process.env.SUPABASE_ANON_KEY ? 'SET' : 'MISSING',
      'SUPABASE_SERVICE_ROLE_KEY': process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING',
      'RECORDINGS_PATH': this.recordingsPath,
      'ZLMEDIAKIT_API_URL': process.env.ZLMEDIAKIT_API_URL || 'http://localhost:8080',
      'JWT_SECRET': process.env.JWT_SECRET ? 'SET' : 'MISSING'
    };

    Object.entries(envVars).forEach(([key, value]) => {
      this.log(`${key}: ${value}`, value === 'MISSING' ? 'error' : 'info');
    });

    // Verificar conectividade Supabase
    try {
      const { data, error } = await supabaseAdmin.from('cameras').select('count');
      if (error) {
        this.log(`Erro Supabase: ${error.message}`, 'error');
      } else {
        this.log(`Supabase conectado - ${data?.[0]?.count || 0} câmeras`, 'success');
      }
    } catch (err) {
      this.log(`Falha de conexão Supabase: ${err.message}`, 'error');
    }
  }

  async checkCamerasConfiguration() {
    console.log('\n📹 2. CONFIGURAÇÃO DAS CÂMERAS');
    console.log('=================================');
    
    try {
      const { data: cameras, error } = await supabaseAdmin
        .from('cameras')
        .select('id, name, rtsp_url, active, recording_enabled, status, is_streaming')
        .order('created_at', { ascending: true });

      if (error) {
        this.log(`Erro ao buscar câmeras: ${error.message}`, 'error');
        return;
      }

      this.log(`Total de câmeras: ${cameras.length}`, 'info');
      
      cameras.forEach(camera => {
        const status = camera.active ? 'ATIVA' : 'INATIVA';
        const recording = camera.recording_enabled ? 'GRAVAÇÃO ON' : 'GRAVAÇÃO OFF';
        const streaming = camera.is_streaming ? 'STREAMING' : 'OFFLINE';
        
        this.log(`\nCâmera: ${camera.name} (${camera.id})`, 'info');
        this.log(`  Status: ${status} | ${recording} | ${streaming}`, 'info');
        this.log(`  RTSP: ${camera.rtsp_url || 'NÃO CONFIGURADO'}`, camera.rtsp_url ? 'info' : 'error');
      });

      // Contagem por status
      const activeCameras = cameras.filter(c => c.active);
      const recordingCameras = cameras.filter(c => c.active && c.recording_enabled);
      const streamingCameras = cameras.filter(c => c.is_streaming);
      
      this.log(`\nResumo:`, 'info');
      this.log(`  Ativas: ${activeCameras.length}/${cameras.length}`, activeCameras.length > 0 ? 'success' : 'warning');
      this.log(`  Com gravação: ${recordingCameras.length}/${cameras.length}`, recordingCameras.length > 0 ? 'success' : 'warning');
      this.log(`  Streaming: ${streamingCameras.length}/${cameras.length}`, streamingCameras.length > 0 ? 'success' : 'warning');

    } catch (err) {
      this.log(`Erro ao verificar câmeras: ${err.message}`, 'error');
    }
  }

  async checkZLMConnection() {
    console.log('\n🌐 3. CONEXÃO ZLMEDIAKIT');
    console.log('==========================');
    
    const zlmUrls = [
      'http://localhost:8080/index/api/getServerConfig',
      'http://localhost:8080/index/api/getMediaList',
      'http://localhost:8080/index/api/getStatistic'
    ];

    for (const url of zlmUrls) {
      try {
        const response = await fetch(url, { timeout: 5000 });
        this.log(`ZLM ${url}: ${response.status}`, response.ok ? 'success' : 'warning');
        
        if (response.ok) {
          const data = await response.json();
          this.log(`  Dados: ${JSON.stringify(data).substring(0, 200)}...`, 'info');
        }
      } catch (err) {
        this.log(`ZLM ${url}: ERRO - ${err.message}`, 'error');
      }
    }
  }

  async checkRecordingFlow() {
    console.log('\n🔄 4. FLUXO DE GRAVAÇÃO');
    console.log('=========================');
    
    // Verificar últimas gravações
    try {
      const { data: recordings, error } = await supabaseAdmin
        .from('recordings')
        .select('*, cameras(name)')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        this.log(`Erro ao buscar gravações: ${error.message}`, 'error');
        return;
      }

      this.log(`Total de gravações: ${recordings.length}`, 'info');
      
      if (recordings.length === 0) {
        this.log('⚠️ NENHUMA GRAVAÇÃO ENCONTRADA - Sistema não está gravando', 'warning');
      } else {
        recordings.forEach(rec => {
          this.log(`\nGravação: ${rec.filename}`, 'info');
          this.log(`  Câmera: ${rec.cameras?.name || 'DESCONHECIDA'}`, 'info');
          this.log(`  Duração: ${rec.duration}s | Tamanho: ${rec.file_size} bytes`, 'info');
          this.log(`  Status: ${rec.status} | Criado: ${new Date(rec.created_at).toLocaleString()}`, 'info');
          this.log(`  Caminho: ${rec.local_path || 'NÃO DEFINIDO'}`, rec.local_path ? 'info' : 'warning');
        });
      }

    } catch (err) {
      this.log(`Erro ao verificar gravações: ${err.message}`, 'error');
    }
  }

  async checkFileSystem() {
    console.log('\n📁 5. SISTEMA DE ARQUIVOS');
    console.log('=========================');
    
    // Verificar diretório de gravações
    try {
      await fs.access(this.recordingsPath);
      const stats = await fs.stat(this.recordingsPath);
      this.log(`Diretório de gravações: ${this.recordingsPath} (${stats.isDirectory() ? 'OK' : 'ERRO'})`, 'info');

      // Listar arquivos
      const files = await fs.readdir(this.recordingsPath);
      this.log(`Arquivos no diretório: ${files.length}`, files.length > 0 ? 'info' : 'warning');
      
      files.forEach(file => {
        this.log(`  - ${file}`, 'info');
      });

    } catch (err) {
      this.log(`Diretório de gravações: ERRO - ${err.message}`, 'error');
      
      // Tentar criar diretório
      try {
        await fs.mkdir(this.recordingsPath, { recursive: true });
        this.log('Diretório criado com sucesso', 'success');
      } catch (mkdirErr) {
        this.log(`Falha ao criar diretório: ${mkdirErr.message}`, 'error');
      }
    }
  }

  async checkDatabaseIntegrity() {
    console.log('\n🗄️ 6. INTEGRIDADE DO BANCO');
    console.log('============================');
    
    try {
      // Verificar estrutura de recordings
      const { data: structure, error } = await supabaseAdmin
        .from('recordings')
        .select('*')
        .limit(1);

      if (error) {
        this.log(`Erro na estrutura: ${error.message}`, 'error');
        return;
      }

      this.log('Tabela recordings acessível', 'success');
      
      // Verificar campos críticos
      const { data: columns } = await supabaseAdmin
        .from('recordings')
        .select('*')
        .limit(0);

      const expectedFields = ['id', 'camera_id', 'filename', 'file_path', 'local_path', 'file_size', 'duration', 'status', 'created_at'];
      const actualFields = Object.keys(columns || {});
      
      expectedFields.forEach(field => {
        const exists = actualFields.includes(field);
        this.log(`  Campo ${field}: ${exists ? 'OK' : 'FALTANDO'}`, exists ? 'success' : 'error');
      });

    } catch (err) {
      this.log(`Erro de integridade: ${err.message}`, 'error');
    }
  }

  async checkWebhookEndpoint() {
    console.log('\n🔗 7. ENDPOINT WEBHOOK');
    console.log('=======================');
    
    const webhookUrl = 'http://localhost:3002/api/webhooks/on_record_mp4';
    
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true })
      });

      this.log(`Webhook endpoint: ${response.status}`, response.status !== 404 ? 'success' : 'error');
      
      if (response.status === 400) {
        this.log('  Webhook está funcionando (400 esperado para dados inválidos)', 'success');
      } else if (response.status === 404) {
        this.log('  Webhook NÃO ENCONTRADO - servidor pode não estar rodando', 'error');
      }

    } catch (err) {
      this.log(`Webhook: ERRO - ${err.message}`, 'error');
      this.log('  Verifique se o servidor está rodando: npm run dev', 'warning');
    }
  }

  generateDebugReport() {
    console.log('\n📋 RELATÓRIO DE DEBUG COMPLETO');
    console.log('=================================');
    
    const errors = this.debugLog.filter(log => log.includes('ERROR'));
    const warnings = this.debugLog.filter(log => log.includes('WARNING'));
    
    console.log(`\n📊 Resumo de problemas:`);
    console.log(`  ❌ Erros: ${errors.length}`);
    console.log(`  ⚠️  Avisos: ${warnings.length}`);
    
    if (errors.length > 0) {
      console.log('\n🔴 PROBLEMAS CRÍTICOS:');
      errors.forEach(error => console.log(`  ${error}`));
    }
    
    if (warnings.length > 0) {
      console.log('\n🟡 AVISOS:');
      warnings.forEach(warning => console.log(`  ${warning}`));
    }
    
    console.log('\n💡 PRÓXIMOS PASSOS:');
    console.log('1. Execute: npm run dev (para iniciar servidor)');
    console.log('2. Verifique ZLMediaKit: porta 8080');
    console.log('3. Configure câmeras com RTSP válido');
    console.log('4. Ative gravação nas câmeras');
    console.log('5. Monitore logs em tempo real');
  }
}

// Executar debug completo
async function main() {
  const debugInstance = new DeepRecordingDebugger();
  await debugInstance.debugCompleteSystem();
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default DeepRecordingDebugger;