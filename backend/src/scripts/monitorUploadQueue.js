/**
 * Upload Queue Monitor - Script para monitorar e gerenciar a fila de upload
 * Permite verificar status, forçar processamento e resolver problemas na fila
 */

import { createModuleLogger } from '../config/logger.js';
import { supabaseAdmin } from '../config/database.js';
import UploadQueueService from '../services/UploadQueueService.js';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const logger = createModuleLogger('UploadMonitor');
const WORKER_URL = process.env.WORKER_URL || 'http://localhost:3003';

class UploadQueueMonitor {
  constructor() {
    this.uploadQueueService = UploadQueueService;
  }

  /**
   * Exibir estatísticas da fila de upload
   */
  async showQueueStats() {
    try {
      console.log('\n🔍 === ESTATÍSTICAS DA FILA DE UPLOAD ===');
      
      // Estatísticas por status
      const { data: statusStats, error: statusError } = await supabaseAdmin
        .from('recordings')
        .select('upload_status')
        .not('upload_status', 'is', null);

      if (statusError) {
        console.error('❌ Erro ao buscar estatísticas:', statusError);
        return;
      }

      const stats = statusStats.reduce((acc, record) => {
        const status = record.upload_status || 'unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});

      console.log('\n📊 Status dos uploads:');
      Object.entries(stats).forEach(([status, count]) => {
        const emoji = this.getStatusEmoji(status);
        console.log(`   ${emoji} ${status}: ${count}`);
      });

      // Uploads recentes (últimas 24h)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const { data: recentUploads, error: recentError } = await supabaseAdmin
        .from('recordings')
        .select('upload_status, created_at')
        .gte('created_at', yesterday.toISOString())
        .not('upload_status', 'is', null);

      if (!recentError && recentUploads) {
        console.log('\n📅 Uploads nas últimas 24h:');
        const recentStats = recentUploads.reduce((acc, record) => {
          const status = record.upload_status || 'unknown';
          acc[status] = (acc[status] || 0) + 1;
          return acc;
        }, {});

        Object.entries(recentStats).forEach(([status, count]) => {
          const emoji = this.getStatusEmoji(status);
          console.log(`   ${emoji} ${status}: ${count}`);
        });
      }

      // Status do worker
      await this.checkWorkerStatus();

    } catch (error) {
      console.error('❌ Erro ao obter estatísticas:', error.message);
    }
  }

  /**
   * Verificar status do worker
   */
  async checkWorkerStatus() {
    try {
      console.log('\n🤖 === STATUS DO WORKER ===');
      
      const response = await axios.get(`${WORKER_URL}/upload/status`, {
        timeout: 5000
      });

      const status = response.data;
      
      if (status.is_running) {
        console.log('✅ Worker está rodando');
        console.log(`   📈 Uptime: ${Math.floor(status.uptime_ms / 1000)}s`);
        console.log(`   🔄 Uploads ativos: ${status.active_uploads}`);
        console.log(`   ⚙️ Concorrência: ${status.concurrency}`);
        console.log(`   📊 Processados: ${status.stats.processed}`);
        console.log(`   ✅ Sucessos: ${status.stats.successful}`);
        console.log(`   ❌ Falhas: ${status.stats.failed}`);
        console.log(`   📈 Taxa de sucesso: ${status.stats.success_rate}`);
      } else {
        console.log('❌ Worker não está rodando');
      }

    } catch (error) {
      console.log('❌ Worker não está acessível');
      console.log(`   🔗 URL testada: ${WORKER_URL}/upload/status`);
      console.log(`   ❌ Erro: ${error.message}`);
    }
  }

  /**
   * Listar gravações na fila
   */
  async listQueuedRecordings() {
    try {
      console.log('\n📋 === GRAVAÇÕES NA FILA ===');
      
      const { data: queued, error } = await supabaseAdmin
        .from('recordings')
        .select(`
          id, filename, upload_status, upload_attempts, 
          created_at, file_size, cameras(name)
        `)
        .in('upload_status', ['pending', 'queued', 'uploading'])
        .order('created_at', { ascending: true });

      if (error) {
        console.error('❌ Erro ao buscar fila:', error);
        return;
      }

      if (queued.length === 0) {
        console.log('✅ Fila vazia');
        return;
      }

      console.log(`📊 ${queued.length} gravações na fila:\n`);
      
      queued.forEach((recording, index) => {
        const emoji = this.getStatusEmoji(recording.upload_status);
        const camera = recording.cameras?.name || 'Câmera desconhecida';
        const size = recording.file_size ? this.formatBytes(recording.file_size) : 'N/A';
        const age = this.getAge(recording.created_at);
        
        console.log(`${index + 1}. ${emoji} ${recording.filename}`);
        console.log(`   📷 ${camera}`);
        console.log(`   📊 ${size} | 🔄 ${recording.upload_attempts} tentativas | ⏰ ${age}`);
        console.log(`   🆔 ${recording.id}`);
        console.log('');
      });

    } catch (error) {
      console.error('❌ Erro ao listar fila:', error.message);
    }
  }

  /**
   * Forçar processamento da fila
   */
  async forceProcessing() {
    try {
      console.log('\n🚀 === FORÇANDO PROCESSAMENTO ===');
      
      const response = await axios.post(`${WORKER_URL}/upload/process`, {}, {
        timeout: 10000
      });

      console.log('✅ Processamento forçado:', response.data.message);

      // Aguardar um pouco e mostrar status
      console.log('\n⏳ Aguardando processamento...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      await this.checkWorkerStatus();

    } catch (error) {
      console.error('❌ Erro ao forçar processamento:', error.message);
    }
  }

  /**
   * Tentar novamente uploads falhados
   */
  async retryFailedUploads() {
    try {
      console.log('\n🔄 === TENTANDO NOVAMENTE UPLOADS FALHADOS ===');
      
      const response = await axios.post(`${WORKER_URL}/upload/retry-failed`, {}, {
        timeout: 10000
      });

      console.log('✅ Resultado:', response.data);

    } catch (error) {
      console.error('❌ Erro ao tentar novamente:', error.message);
    }
  }

  /**
   * Limpar registros órfãos
   */
  async cleanupOrphaned() {
    try {
      console.log('\n🧹 === LIMPANDO REGISTROS ÓRFÃOS ===');
      
      // Buscar registros com status inválidos há mais de 1 hora
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);

      const { data: stuckUploads, error } = await supabaseAdmin
        .from('recordings')
        .select('id, filename, upload_status, updated_at')
        .eq('upload_status', 'uploading')
        .lt('updated_at', oneHourAgo.toISOString());

      if (error) {
        console.error('❌ Erro ao buscar uploads presos:', error);
        return;
      }

      if (stuckUploads.length === 0) {
        console.log('✅ Nenhum upload preso encontrado');
        return;
      }

      console.log(`🔍 Encontrados ${stuckUploads.length} uploads presos há mais de 1 hora:`);
      
      for (const upload of stuckUploads) {
        console.log(`   📁 ${upload.filename} (${upload.id})`);
      }

      // Reset para queued
      const { error: resetError } = await supabaseAdmin
        .from('recordings')
        .update({
          upload_status: 'queued',
          updated_at: new Date().toISOString()
        })
        .in('id', stuckUploads.map(u => u.id));

      if (resetError) {
        console.error('❌ Erro ao resetar uploads:', resetError);
      } else {
        console.log(`✅ ${stuckUploads.length} uploads resetados para 'queued'`);
      }

    } catch (error) {
      console.error('❌ Erro na limpeza:', error.message);
    }
  }

  /**
   * Helpers
   */
  getStatusEmoji(status) {
    const emojis = {
      pending: '⏳',
      queued: '📝',
      uploading: '📤',
      uploaded: '✅',
      failed: '❌'
    };
    return emojis[status] || '❓';
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getAge(dateString) {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d`;
  }
}

// Execução do script
async function main() {
  const monitor = new UploadQueueMonitor();
  const command = process.argv[2];

  console.log('🔍 NewCAM Upload Queue Monitor\n');

  switch (command) {
    case 'stats':
      await monitor.showQueueStats();
      break;

    case 'list':
      await monitor.listQueuedRecordings();
      break;

    case 'force':
      await monitor.forceProcessing();
      break;

    case 'retry':
      await monitor.retryFailedUploads();
      break;

    case 'cleanup':
      await monitor.cleanupOrphaned();
      break;

    case 'full':
      await monitor.showQueueStats();
      await monitor.listQueuedRecordings();
      break;

    default:
      console.log('📋 Comandos disponíveis:');
      console.log('  stats   - Exibir estatísticas da fila');
      console.log('  list    - Listar gravações na fila');
      console.log('  force   - Forçar processamento da fila');
      console.log('  retry   - Tentar novamente uploads falhados');
      console.log('  cleanup - Limpar uploads presos');
      console.log('  full    - Exibir stats + lista completa');
      console.log('\nExemplo: node src/scripts/monitorUploadQueue.js stats');
  }
}

main().catch(console.error);