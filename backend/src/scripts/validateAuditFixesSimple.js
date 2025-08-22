/**
 * Script simples de validação das correções aplicadas na auditoria
 */

import fs from 'fs/promises';
import path from 'path';

// Cores para output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function checkFile(filePath, searchPattern, shouldExist = true) {
  try {
    const fullPath = path.join(process.cwd(), filePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    const exists = content.includes(searchPattern);
    
    if (exists === shouldExist) {
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

async function runValidation() {
  log('\n═══════════════════════════════════════════════════════', 'cyan');
  log('       VALIDAÇÃO SIMPLES DAS CORREÇÕES DA AUDITORIA', 'cyan');
  log('═══════════════════════════════════════════════════════', 'cyan');
  
  const checks = [
    {
      name: 'UploadQueueService usando upload_attempts',
      path: 'src/services/UploadQueueService.js',
      pattern: 'upload_attempts',
      shouldExist: true
    },
    {
      name: 'UploadQueueService NÃO usando upload_retry_count',
      path: 'src/services/UploadQueueService.js',
      pattern: 'upload_retry_count',
      shouldExist: false
    },
    {
      name: 'RecordingService usando PathResolver',
      path: 'src/services/RecordingService.js',
      pattern: 'pathResolver',
      shouldExist: true
    },
    {
      name: 'Server.js NÃO expondo rota estática /recordings',
      path: 'src/server.js',
      pattern: "app.use('/recordings', express.static",
      shouldExist: false
    },
    {
      name: 'recordingFiles.js usando FeatureFlagService',
      path: 'src/routes/recordingFiles.js',
      pattern: 'FeatureFlagService',
      shouldExist: true
    },
    {
      name: 'hooks.js usando FeatureFlagService',
      path: 'src/routes/hooks.js',
      pattern: 'FeatureFlagService',
      shouldExist: true
    },
    {
      name: 'start-worker.js usando FeatureFlagService',
      path: 'src/scripts/start-worker.js',
      pattern: 'FeatureFlagService',
      shouldExist: true
    },
    {
      name: 'cleanupOrphanRecordings.js NÃO usando RecordingService_improved',
      path: 'src/scripts/cleanupOrphanRecordings.js',
      pattern: 'RecordingService_improved',
      shouldExist: false
    },
    {
      name: 'cleanupOrphanRecordings.js usando RecordingService',
      path: 'src/scripts/cleanupOrphanRecordings.js',
      pattern: "import RecordingService from '../services/RecordingService.js'",
      shouldExist: true
    },
    {
      name: 'fileController.js usando PathResolver',
      path: 'src/controllers/fileController.js',
      pattern: 'pathResolver',
      shouldExist: true
    }
  ];
  
  let passedCount = 0;
  let failedCount = 0;
  
  log('\n📋 Executando verificações...\n', 'yellow');
  
  for (const check of checks) {
    const result = await checkFile(check.path, check.pattern, check.shouldExist);
    
    if (result) {
      log(`✅ ${check.name}`, 'green');
      passedCount++;
    } else {
      log(`❌ ${check.name}`, 'red');
      failedCount++;
    }
  }
  
  log('\n═══════════════════════════════════════════════════════', 'cyan');
  log('                    RESUMO FINAL', 'cyan');
  log('═══════════════════════════════════════════════════════', 'cyan');
  
  log(`\n✅ Verificações aprovadas: ${passedCount}`, 'green');
  log(`❌ Verificações falhadas: ${failedCount}`, 'red');
  
  if (failedCount === 0) {
    log('\n🎉 TODAS AS CORREÇÕES FORAM APLICADAS COM SUCESSO! 🎉', 'green');
    log('O sistema está pronto para uso com todas as melhorias implementadas.', 'green');
    return true;
  } else {
    log('\n⚠️  ALGUMAS CORREÇÕES AINDA PRECISAM SER APLICADAS', 'yellow');
    log('Revise os itens marcados com ❌ acima.', 'yellow');
    return false;
  }
}

// Executar validação
runValidation()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    log(`\n💥 Erro na validação: ${error.message}`, 'red');
    process.exit(1);
  });