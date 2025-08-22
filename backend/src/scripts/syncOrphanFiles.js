/**
 * Script para Sincronizar Arquivos Órfãos
 * Cria registros no database para arquivos MP4 sem registros correspondentes
 */

import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Configuração Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Extrair informações do arquivo baseado no path
 */
function extractFileInfo(filePath) {
  const filename = path.basename(filePath);
  const relativePath = filePath.replace(/\\/g, '/');
  
  // Tentar extrair camera_id do path
  let cameraId = null;
  const pathParts = relativePath.split('/');
  
  // Procurar por padrões conhecidos: /live/{camera_id}/ ou /processed/
  const liveIndex = pathParts.findIndex(p => p === 'live');
  if (liveIndex >= 0 && pathParts[liveIndex + 1] && pathParts[liveIndex + 1] !== 'processed') {
    cameraId = pathParts[liveIndex + 1];
  }
  
  // Se não encontrou, usar 'unknown'
  if (!cameraId || cameraId === 'processed') {
    cameraId = 'camera_unknown';
  }
  
  return {
    filename,
    cameraId,
    relativePath: relativePath.includes('storage/www/record/live') 
      ? relativePath.substring(relativePath.indexOf('storage/www/record/live'))
      : `storage/www/record/live/processed/${filename}`
  };
}

/**
 * Obter estatísticas do arquivo
 */
async function getFileStats(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime
    };
  } catch (error) {
    console.error(`Erro ao obter stats do arquivo ${filePath}:`, error.message);
    return {
      size: 0,
      created: new Date(),
      modified: new Date()
    };
  }
}

/**
 * Verificar se já existe registro para o arquivo
 */
async function recordExists(filename) {
  const { data } = await supabase
    .from('recordings')
    .select('id')
    .eq('filename', filename)
    .single();
  
  return !!data;
}

/**
 * Criar registro de gravação
 */
async function createRecordingRecord(filePath, fileInfo, stats) {
  const recordId = uuidv4();
  
  const recording = {
    id: recordId,
    filename: fileInfo.filename,
    camera_id: fileInfo.cameraId,
    file_path: fileInfo.relativePath,
    local_path: fileInfo.relativePath,
    file_size: stats.size,
    duration: null, // Será calculado posteriormente se necessário
    status: 'completed',
    created_at: stats.created.toISOString(),
    updated_at: new Date().toISOString(),
    start_time: stats.created.toISOString(),
    end_time: null,
    format: 'mp4',
    codec: 'h265', // Assumindo HEVC por padrão
    resolution: null,
    bitrate: null,
    upload_status: 'pending',
    s3_path: null,
    metadata: {
      source: 'orphan_sync',
      sync_date: new Date().toISOString(),
      original_path: filePath
    }
  };
  
  const { data, error } = await supabase
    .from('recordings')
    .insert(recording)
    .select()
    .single();
  
  if (error) {
    throw new Error(`Erro ao criar registro: ${error.message}`);
  }
  
  return data;
}

/**
 * Escanear diretório recursivamente
 */
async function scanDirectory(dir, fileList = []) {
  try {
    const files = await fs.readdir(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stats = await fs.stat(filePath);
      
      if (stats.isDirectory()) {
        await scanDirectory(filePath, fileList);
      } else if (file.endsWith('.mp4') && !file.includes('.tmp')) {
        fileList.push(filePath);
      }
    }
  } catch (error) {
    console.warn(`⚠️  Erro ao escanear diretório ${dir}: ${error.message}`);
  }
  
  return fileList;
}

/**
 * Executar sincronização
 */
async function runSync() {
  console.log('🔄 Iniciando sincronização de arquivos órfãos...');
  console.log('='.repeat(60));
  
  const results = {
    totalFiles: 0,
    existingRecords: 0,
    newRecords: 0,
    errors: 0,
    errorFiles: []
  };
  
  try {
    // 1. Escanear diretório de gravações
    const basePath = path.join(process.cwd(), 'storage', 'www', 'record', 'live');
    console.log(`📁 Escaneando diretório: ${basePath}`);
    
    const allFiles = await scanDirectory(basePath);
    results.totalFiles = allFiles.length;
    
    console.log(`📊 Encontrados ${allFiles.length} arquivos MP4`);
    
    // 2. Processar cada arquivo
    console.log('\n🔍 Verificando arquivos órfãos...');
    
    for (let i = 0; i < allFiles.length; i++) {
      const filePath = allFiles[i];
      const fileInfo = extractFileInfo(filePath);
      
      try {
        // Verificar se já existe registro
        if (await recordExists(fileInfo.filename)) {
          results.existingRecords++;
          if (i % 50 === 0) { // Log a cada 50 arquivos
            console.log(`   ✓ ${fileInfo.filename} (já existe) [${i + 1}/${allFiles.length}]`);
          }
          continue;
        }
        
        // Criar novo registro
        const stats = await getFileStats(filePath);
        const newRecord = await createRecordingRecord(filePath, fileInfo, stats);
        
        results.newRecords++;
        console.log(`   ✅ ${fileInfo.filename} → ${newRecord.id} (${fileInfo.cameraId})`);
        
      } catch (error) {
        console.error(`   ❌ Erro ao processar ${fileInfo.filename}: ${error.message}`);
        results.errors++;
        results.errorFiles.push({
          file: fileInfo.filename,
          error: error.message
        });
      }
    }
    
    // 3. Relatório final
    console.log('\n' + '='.repeat(60));
    console.log('📋 RELATÓRIO DE SINCRONIZAÇÃO');
    console.log('='.repeat(60));
    
    console.log(`\n📊 Estatísticas:`);
    console.log(`   Total de arquivos: ${results.totalFiles}`);
    console.log(`   Registros existentes: ${results.existingRecords}`);
    console.log(`   Novos registros criados: ${results.newRecords}`);
    console.log(`   Erros: ${results.errors}`);
    
    const syncPercentage = ((results.newRecords + results.existingRecords) / results.totalFiles * 100).toFixed(1);
    console.log(`   Taxa de sincronização: ${syncPercentage}%`);
    
    if (results.errors > 0) {
      console.log(`\n⚠️  Arquivos com erro:`);
      results.errorFiles.slice(0, 10).forEach(item => {
        console.log(`   - ${item.file}: ${item.error}`);
      });
      if (results.errorFiles.length > 10) {
        console.log(`   ... e mais ${results.errorFiles.length - 10} erros`);
      }
    }
    
    console.log(`\n💡 Próximos passos:`);
    console.log(`   - Verificar sistema: node backend/src/scripts/validateRecordingSystem.js`);
    console.log(`   - Testar playback: curl -I "http://localhost:3002/api/recording-files/{recording_id}/play"`);
    
    return results;
    
  } catch (error) {
    console.error('❌ Erro na sincronização:', error);
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
  
  // Verificar conectividade com Supabase
  try {
    const { data, error } = await supabase.from('recordings').select('count').limit(1);
    if (error) throw error;
    console.log('✅ Conexão com Supabase validada');
  } catch (error) {
    console.error('❌ Erro de conexão com Supabase:', error.message);
    process.exit(1);
  }
}

/**
 * Script principal
 */
async function main() {
  console.log('🔧 Script de Sincronização de Arquivos Órfãos - NewCAM');
  console.log('=====================================================');
  
  await validateEnvironment();
  
  const args = process.argv.slice(2);
  if (args.includes('--dry-run')) {
    console.log('🧪 Modo DRY-RUN ativado (apenas visualização)');
    // TODO: Implementar modo dry-run se necessário
  }
  
  const results = await runSync();
  
  console.log('\n🎉 Sincronização concluída!');
  
  if (results.newRecords > 0) {
    console.log(`✅ ${results.newRecords} novos registros criados com sucesso`);
  }
}

// Executar script se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { runSync, extractFileInfo, createRecordingRecord };