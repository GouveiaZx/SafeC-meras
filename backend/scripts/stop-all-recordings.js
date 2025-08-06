#!/usr/bin/env node

/**
 * Script para parar todas as gravações ativas no sistema
 * Usado durante manutenção ou correção de problemas
 */

import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const API_BASE_URL = process.env.BACKEND_URL || process.env.API_BASE_URL || 'http://localhost:3002';
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || 'your-service-token-here';

class RecordingStopManager {
  constructor() {
    this.stoppedCount = 0;
    this.errorCount = 0;
    this.errors = [];
  }

  /**
   * Obter todas as gravações ativas
   */
  async getActiveRecordings() {
    try {
      console.log('🔍 Buscando gravações ativas...');
      
      const response = await axios.get(`${API_BASE_URL}/api/recordings/active/service`, {
        headers: {
          'Authorization': `Bearer ${SERVICE_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      const recordings = response.data || [];
      console.log(`📊 Encontradas ${recordings.length} gravações ativas`);
      
      return recordings;
    } catch (error) {
      console.error('❌ Erro ao buscar gravações ativas:', error.message);
      throw error;
    }
  }

  /**
   * Parar uma gravação específica
   */
  async stopRecording(recording) {
    try {
      console.log(`🛑 Parando gravação ${recording.id} (Câmera: ${recording.cameras?.name || recording.camera_id})...`);
      
      const response = await axios.post(`${API_BASE_URL}/api/recordings/${recording.id}/stop`, {}, {
        headers: {
          'Authorization': `Bearer ${SERVICE_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      if (response.data?.success) {
        console.log(`✅ Gravação ${recording.id} parada com sucesso`);
        this.stoppedCount++;
        return true;
      } else {
        throw new Error(response.data?.message || 'Resposta inválida do servidor');
      }
    } catch (error) {
      console.error(`❌ Erro ao parar gravação ${recording.id}:`, error.message);
      this.errorCount++;
      this.errors.push({
        recordingId: recording.id,
        cameraId: recording.camera_id,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Parar todas as gravações ativas
   */
  async stopAllRecordings(dryRun = false) {
    try {
      console.log('🚀 Iniciando processo de parada de gravações...');
      
      if (dryRun) {
        console.log('🔍 MODO DRY-RUN: Apenas simulando, nenhuma gravação será parada');
      }

      const activeRecordings = await this.getActiveRecordings();
      
      if (activeRecordings.length === 0) {
        console.log('✅ Nenhuma gravação ativa encontrada');
        return;
      }

      console.log(`📋 Processando ${activeRecordings.length} gravações...`);
      
      // Processar gravações em lotes para evitar sobrecarga
      const batchSize = 5;
      for (let i = 0; i < activeRecordings.length; i += batchSize) {
        const batch = activeRecordings.slice(i, i + batchSize);
        
        console.log(`\n📦 Processando lote ${Math.floor(i/batchSize) + 1}/${Math.ceil(activeRecordings.length/batchSize)}...`);
        
        if (dryRun) {
          // Modo dry-run: apenas simular
          for (const recording of batch) {
            console.log(`🔍 [DRY-RUN] Pararia gravação ${recording.id} (Câmera: ${recording.cameras?.name || recording.camera_id})`);
          }
        } else {
          // Parar gravações em paralelo dentro do lote
          const promises = batch.map(recording => this.stopRecording(recording));
          await Promise.all(promises);
        }
        
        // Pequena pausa entre lotes
        if (i + batchSize < activeRecordings.length) {
          console.log('⏳ Aguardando 2 segundos antes do próximo lote...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Relatório final
      console.log('\n📊 RELATÓRIO FINAL:');
      console.log(`✅ Gravações paradas: ${this.stoppedCount}`);
      console.log(`❌ Erros: ${this.errorCount}`);
      
      if (this.errors.length > 0) {
        console.log('\n🔍 DETALHES DOS ERROS:');
        this.errors.forEach((error, index) => {
          console.log(`${index + 1}. Gravação ${error.recordingId} (Câmera: ${error.cameraId}): ${error.error}`);
        });
      }
      
      if (dryRun) {
        console.log('\n🔍 Modo dry-run concluído. Execute sem --dry-run para parar as gravações.');
      } else {
        console.log('\n🎉 Processo concluído!');
      }
      
    } catch (error) {
      console.error('💥 Erro crítico no processo:', error.message);
      process.exit(1);
    }
  }
}

// Função principal
async function main() {
  console.log('🎬 Script de Parada de Gravações Ativas');
  console.log('========================================\n');
  
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-d');
  const help = args.includes('--help') || args.includes('-h');
  
  console.log('🔧 DEBUG: Argumentos:', args);
  console.log('🔧 DEBUG: Modo dry-run:', dryRun);
  console.log('🔧 DEBUG: API_BASE_URL:', API_BASE_URL);
  console.log('🔧 DEBUG: SERVICE_TOKEN configurado:', SERVICE_TOKEN !== 'your-service-token-here');
  
  if (help) {
    console.log(`
📖 USO: node stop-all-recordings.js [opções]

OPÇÕES:
  --dry-run, -d    Simular execução sem parar gravações
  --help, -h       Mostrar esta ajuda

EXEMPLOS:
  node stop-all-recordings.js --dry-run    # Simular
  node stop-all-recordings.js              # Executar
`);
    process.exit(0);
  }
  
  // Verificar configurações
  if (!SERVICE_TOKEN || SERVICE_TOKEN === 'your-service-token-here') {
    console.error('❌ SERVICE_TOKEN não configurado no arquivo .env');
    process.exit(1);
  }
  
  console.log('🚀 Iniciando manager...');
  const manager = new RecordingStopManager();
  await manager.stopAllRecordings(dryRun);
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('💥 Erro não tratado:', error);
    process.exit(1);
  });
}

export default RecordingStopManager;