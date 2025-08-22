/**
 * Script de Validação - Sistema de Gravações NewCAM
 * Verifica consistência entre arquivos físicos e registros no database
 * Identifica e reporta problemas no sistema de gravação
 */

import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import path from 'path';
// Importação dinâmica para evitar problemas de ES modules
let RecordingService;

// Configuração Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Verificar se arquivo existe
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Obter informações do arquivo
 */
async function getFileStats(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      exists: true
    };
  } catch {
    return {
      size: 0,
      created: null,
      modified: null,
      exists: false
    };
  }
}

/**
 * Escanear diretório de gravações para encontrar arquivos órfãos
 */
async function scanRecordingDirectory() {
  const basePath = path.join(process.cwd(), 'storage', 'www', 'record', 'live');
  const files = [];
  
  try {
    await scanDirectoryRecursive(basePath, files);
    return files.filter(f => f.endsWith('.mp4') && !f.includes('.tmp'));
  } catch (error) {
    console.warn(`⚠️  Erro ao escanear diretório ${basePath}:`, error.message);
    return [];
  }
}

/**
 * Escanear diretório recursivamente
 */
async function scanDirectoryRecursive(dir, fileList) {
  try {
    const files = await fs.readdir(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stats = await fs.stat(filePath);
      
      if (stats.isDirectory()) {
        await scanDirectoryRecursive(filePath, fileList);
      } else {
        fileList.push(filePath);
      }
    }
  } catch (error) {
    // Ignorar diretórios inacessíveis
  }
}

/**
 * Validar registro de gravação
 */
async function validateRecording(recording) {
  const issues = [];
  
  // 1. Verificar se filename existe
  if (!recording.filename) {
    issues.push('filename_missing');
  }
  
  // 2. Verificar se local_path existe
  if (!recording.local_path) {
    issues.push('local_path_missing');
  }
  
  // 3. Verificar se file_path existe
  if (!recording.file_path) {
    issues.push('file_path_missing');
  }
  
  // 4. Verificar consistência entre local_path e file_path
  if (recording.local_path && recording.file_path && recording.local_path !== recording.file_path) {
    issues.push('path_inconsistency');
  }
  
  // 5. Tentar localizar arquivo físico usando RecordingService
  try {
    if (!RecordingService) {
      const { default: service } = await import('../services/RecordingService.js');
      RecordingService = service;
    }
    const fileInfo = await RecordingService.findRecordingFile(recording);
    if (!fileInfo) {
      issues.push('file_not_found');
    } else {
      // 6. Verificar se o tamanho do arquivo bate
      if (recording.file_size && Math.abs(recording.file_size - fileInfo.size) > 1024) { // Tolerância de 1KB
        issues.push('file_size_mismatch');
      }
    }
  } catch (error) {
    issues.push('file_access_error');
  }
  
  // 7. Verificar se duração é razoável
  if (recording.duration && recording.duration < 5) {
    issues.push('duration_too_short');
  }
  
  // 8. Verificar se status é válido
  if (!['recording', 'completed', 'uploading', 'uploaded', 'failed'].includes(recording.status)) {
    issues.push('invalid_status');
  }
  
  return issues;
}

/**
 * Executar validação completa
 */
async function runValidation() {
  console.log('🔍 Iniciando validação do sistema de gravações...');
  console.log('='.repeat(60));
  
  const results = {
    totalRecordings: 0,
    validRecordings: 0,
    recordingsWithIssues: 0,
    orphanFiles: 0,
    issues: {},
    recommendations: []
  };
  
  try {
    // 1. Buscar todos os registros de gravação
    console.log('\n📊 Analisando registros no database...');
    
    const { data: recordings, error } = await supabase
      .from('recordings')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      throw error;
    }
    
    results.totalRecordings = recordings.length;
    console.log(`   Encontrados: ${recordings.length} registros`);
    
    // 2. Validar cada registro
    console.log('\n🔍 Validando registros individuais...');
    
    for (const recording of recordings) {
      const issues = await validateRecording(recording);
      
      if (issues.length === 0) {
        results.validRecordings++;
      } else {
        results.recordingsWithIssues++;
        
        // Contar tipos de issues
        issues.forEach(issue => {
          if (!results.issues[issue]) {
            results.issues[issue] = 0;
          }
          results.issues[issue]++;
        });
        
        if (issues.length > 2) { // Mostrar apenas casos mais problemáticos
          console.log(`   ⚠️  ${recording.id}: ${issues.join(', ')}`);
        }
      }
    }
    
    // 3. Buscar arquivos órfãos
    console.log('\n📁 Procurando arquivos órfãos...');
    
    const physicalFiles = await scanRecordingDirectory();
    console.log(`   Arquivos físicos encontrados: ${physicalFiles.length}`);
    
    const orphanFiles = [];
    
    for (const filePath of physicalFiles) {
      const filename = path.basename(filePath);
      
      // Verificar se arquivo tem registro correspondente
      const { data: matchingRecording } = await supabase
        .from('recordings')
        .select('id')
        .eq('filename', filename)
        .single();
      
      if (!matchingRecording) {
        orphanFiles.push({
          path: filePath,
          filename: filename,
          stats: await getFileStats(filePath)
        });
      }
    }
    
    results.orphanFiles = orphanFiles.length;
    
    if (orphanFiles.length > 0) {
      console.log(`   ⚠️  Arquivos órfãos encontrados: ${orphanFiles.length}`);
      orphanFiles.slice(0, 5).forEach(file => {
        console.log(`      - ${file.filename} (${(file.stats.size / 1024 / 1024).toFixed(2)} MB)`);
      });
      if (orphanFiles.length > 5) {
        console.log(`      ... e mais ${orphanFiles.length - 5} arquivos`);
      }
    }
    
    // 4. Gerar relatório final
    console.log('\n' + '='.repeat(60));
    console.log('📋 RELATÓRIO DE VALIDAÇÃO');
    console.log('='.repeat(60));
    
    console.log(`\n📊 Estatísticas Gerais:`);
    console.log(`   Total de registros: ${results.totalRecordings}`);
    console.log(`   Registros válidos: ${results.validRecordings} (${((results.validRecordings / results.totalRecordings) * 100).toFixed(1)}%)`);
    console.log(`   Registros com problemas: ${results.recordingsWithIssues} (${((results.recordingsWithIssues / results.totalRecordings) * 100).toFixed(1)}%)`);
    console.log(`   Arquivos órfãos: ${results.orphanFiles}`);
    
    if (Object.keys(results.issues).length > 0) {
      console.log(`\n⚠️  Problemas Encontrados:`);
      Object.entries(results.issues).forEach(([issue, count]) => {
        const percentage = ((count / results.totalRecordings) * 100).toFixed(1);
        console.log(`   ${issue}: ${count} (${percentage}%)`);
      });
    }
    
    // 5. Gerar recomendações
    console.log(`\n💡 Recomendações:`);
    
    if (results.issues.filename_missing > 0) {
      console.log(`   - Executar script para corrigir ${results.issues.filename_missing} registros sem filename`);
    }
    
    if (results.issues.file_not_found > 0) {
      console.log(`   - Executar script de migração de paths para ${results.issues.file_not_found} arquivos não encontrados`);
    }
    
    if (results.issues.path_inconsistency > 0) {
      console.log(`   - Normalizar paths para ${results.issues.path_inconsistency} registros inconsistentes`);
    }
    
    if (results.orphanFiles > 0) {
      console.log(`   - Criar registros para ${results.orphanFiles} arquivos órfãos ou removê-los`);
    }
    
    if (results.validRecordings / results.totalRecordings > 0.8) {
      console.log(`   ✅ Sistema está em bom estado geral (${((results.validRecordings / results.totalRecordings) * 100).toFixed(1)}% válidos)`);
    } else {
      console.log(`   ⚠️  Sistema precisa de manutenção urgente (apenas ${((results.validRecordings / results.totalRecordings) * 100).toFixed(1)}% válidos)`);
    }
    
    // 6. Comandos sugeridos
    console.log(`\n🛠️  Comandos Sugeridos:`);
    console.log(`   # Executar migração de paths:`);
    console.log(`   node backend/src/scripts/normalizeRecordingPaths.js`);
    console.log(`   `);
    console.log(`   # Testar RecordingService:`);
    console.log(`   npm run test:recording`);
    console.log(`   `);
    console.log(`   # Verificar funcionamento do player:`);
    console.log(`   curl -I "http://localhost:3002/api/recording-files/{recording_id}/play-web"`);
    
    return results;
    
  } catch (error) {
    console.error('❌ Erro na validação:', error);
    throw error;
  }
}

/**
 * Validar ambiente
 */
async function validateEnvironment() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
    process.exit(1);
  }
  
  // Verificar se RecordingService existe
  try {
    const recordingService = await import('../services/RecordingService.js');
    if (!recordingService.default) {
      throw new Error('RecordingService não exporta default');
    }
    console.log('✅ RecordingService carregado com sucesso');
  } catch (error) {
    console.error('❌ RecordingService não encontrado ou com problemas:', error.message);
    process.exit(1);
  }
  
  console.log('✅ Ambiente validado');
}

/**
 * Script principal
 */
async function main() {
  console.log('🔧 Script de Validação do Sistema de Gravações - NewCAM');
  console.log('=====================================================');
  
  await validateEnvironment();
  await runValidation();
  
  console.log('\n🎉 Validação concluída!');
}

// Executar script se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { runValidation, validateRecording };