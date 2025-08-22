#!/usr/bin/env node

/**
 * Script para iniciar o monitoramento de arquivos MP4
 */

import path from 'path';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import UnifiedRecordingService from '../services/UnifiedRecordingService.js';

console.log('🔄 Iniciando monitoramento de arquivos MP4...');

// Criar instância do serviço
const unifiedService = new UnifiedRecordingService();

// Iniciar o watcher
unifiedService.startFileWatcher();

console.log('✅ Monitoramento de arquivos iniciado com sucesso!');
console.log('📁 Monitorando pasta:', unifiedService.searchPaths[0]);

// Manter o processo vivo
process.on('SIGINT', () => {
  console.log('\n🛑 Parando monitoramento...');
  unifiedService.stop();
  process.exit(0);
});

// Aguardar indefinidamente
setInterval(() => {
  // Apenas manter o processo vivo
}, 30000);