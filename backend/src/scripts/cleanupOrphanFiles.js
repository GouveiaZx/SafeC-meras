#!/usr/bin/env node

/**
 * Script para limpeza de arquivos órfãos no sistema de gravações
 * Remove arquivos físicos sem registro no banco e registros sem arquivo físico
 */

import { createClient } from '@supabase/supabase-js';
import winston from 'winston';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configurar logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaString = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
      return `${timestamp} [${level.toUpperCase()}] ${message} ${metaString}`;
    })
  ),
  transports: [new winston.transports.Console()]
);

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  logger.error('❌ Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Modo dry run
const DRY_RUN = process.env.DRY_RUN === 'true';

/**
 * Buscar todos os arquivos MP4 no sistema
 */
async function findAllMp4Files() {
  const files = [];
  const searchPaths = [
    path.join(process.cwd(), 'storage', 'www', 'record', 'live'),
    path.join(process.cwd(), '..', 'storage', 'www', 'record', 'live')
  ];

  for (const searchPath of searchPaths) {
    try {
      await scanDirectory(searchPath, files);
      break; // Se encontrou o diretório, não precisa tentar o próximo
    } catch (error) {
      logger.debug(`Diretório não encontrado: ${searchPath}`);
    }
  }

  return files;
}

/**
 * Escanear diretório recursivamente
 */
async function scanDirectory(dirPath, files) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        await scanDirectory(fullPath, files);
      } else if (entry.isFile() && entry.name.endsWith('.mp4')) {
        const relativePath = path.relative(process.cwd(), fullPath);
        files.push({
          filename: entry.name,
          fullPath,
          relativePath,
          size: (await fs.stat(fullPath)).size
        });
      }
    }
  } catch (error) {
    logger.warn(`Erro ao escanear diretório ${dirPath}:`, error.message);
  }
}

/**
 * Buscar todos os registros de gravação no banco
 */
async function getAllRecordings() {
  const { data: recordings, error } = await supabase
    .from('recordings')
    .select('id, filename, file_path, local_path, camera_id, status, created_at');

  if (error) {
    throw new Error(`Erro ao buscar gravações: ${error.message}`);
  }

  return recordings || [];
}

/**
 * Encontrar arquivos órfãos (sem registro no banco)
 */
async function findOrphanFiles() {
  logger.info('🔍 Buscando arquivos órfãos...');
  
  const allFiles = await findAllMp4Files();
  const recordings = await getAllRecordings();
  
  // Criar set de filenames no banco para busca rápida
  const recordedFilenames = new Set();
  recordings.forEach(rec => {
    if (rec.filename) recordedFilenames.add(rec.filename);
    if (rec.file_path) recordedFilenames.add(path.basename(rec.file_path));
    if (rec.local_path) recordedFilenames.add(path.basename(rec.local_path));
  });

  const orphanFiles = allFiles.filter(file => !recordedFilenames.has(file.filename));
  
  logger.info(`📊 Arquivos encontrados: ${allFiles.length}, Órfãos: ${orphanFiles.length}`);
  
  return orphanFiles;
}

/**
 * Encontrar registros órfãos (sem arquivo físico)
 */
async function findOrphanRecords() {
  logger.info('🔍 Buscando registros órfãos...');
  
  const recordings = await getAllRecordings();
  const allFiles = await findAllMp4Files();
  
  // Criar set de filenames físicos para busca rápida
  const physicalFilenames = new Set(allFiles.map(file => file.filename));
  
  const orphanRecords = recordings.filter(rec => {
    if (!rec.filename) return true; // Registro sem filename é órfão
    return !physicalFilenames.has(rec.filename);
  });
  
  logger.info(`📊 Registros encontrados: ${recordings.length}, Órfãos: ${orphanRecords.length}`);
  
  return orphanRecords;
}

/**
 * Deletar arquivo órfão
 */
async function deleteOrphanFile(file) {
  if (DRY_RUN) {
    logger.info(`[DRY RUN] Deletaria arquivo: ${file.relativePath} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    return true;
  }

  try {
    await fs.unlink(file.fullPath);
    logger.info(`✅ Arquivo órfão deletado: ${file.relativePath} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    return true;
  } catch (error) {
    logger.error(`❌ Erro ao deletar arquivo ${file.relativePath}:`, error.message);
    return false;
  }
}

/**
 * Deletar registro órfão
 */
async function deleteOrphanRecord(record) {
  if (DRY_RUN) {
    logger.info(`[DRY RUN] Deletaria registro: ${record.id} (${record.filename || 'sem filename'})`);
    return true;
  }

  try {
    const { error } = await supabase
      .from('recordings')
      .delete()
      .eq('id', record.id);

    if (error) {
      throw error;
    }

    logger.info(`✅ Registro órfão deletado: ${record.id} (${record.filename || 'sem filename'})`);
    return true;
  } catch (error) {
    logger.error(`❌ Erro ao deletar registro ${record.id}:`, error.message);
    return false;
  }
}

/**
 * Script principal
 */
async function main() {
  logger.info(`🚀 Iniciando limpeza de arquivos órfãos${DRY_RUN ? ' (DRY RUN)' : ''}...`);
  
  let stats = {
    orphan_files_found: 0,
    orphan_files_deleted: 0,
    orphan_records_found: 0,
    orphan_records_deleted: 0,
    total_size_cleaned: 0
  };

  try {
    // 1. Buscar e deletar arquivos órfãos
    const orphanFiles = await findOrphanFiles();
    stats.orphan_files_found = orphanFiles.length;

    if (orphanFiles.length > 0) {
      logger.info('📁 Arquivos órfãos encontrados:');
      orphanFiles.forEach(file => {
        logger.info(`  - ${file.relativePath} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
      });

      for (const file of orphanFiles) {
        if (await deleteOrphanFile(file)) {
          stats.orphan_files_deleted++;
          stats.total_size_cleaned += file.size;
        }
      }
    } else {
      logger.info('✅ Nenhum arquivo órfão encontrado');
    }

    // 2. Buscar e deletar registros órfãos
    const orphanRecords = await findOrphanRecords();
    stats.orphan_records_found = orphanRecords.length;

    if (orphanRecords.length > 0) {
      logger.info('🗂️ Registros órfãos encontrados:');
      orphanRecords.forEach(record => {
        logger.info(`  - ID: ${record.id}, Filename: ${record.filename || 'N/A'}, Status: ${record.status}`);
      });

      for (const record of orphanRecords) {
        if (await deleteOrphanRecord(record)) {
          stats.orphan_records_deleted++;
        }
      }
    } else {
      logger.info('✅ Nenhum registro órfão encontrado');
    }

    // Estatísticas finais
    logger.info('📊 RESUMO DA LIMPEZA:', {
      arquivos_orfaos_encontrados: stats.orphan_files_found,
      arquivos_orfaos_deletados: stats.orphan_files_deleted,
      registros_orfaos_encontrados: stats.orphan_records_found,
      registros_orfaos_deletados: stats.orphan_records_deleted,
      espaco_liberado_mb: (stats.total_size_cleaned / 1024 / 1024).toFixed(2),
      modo: DRY_RUN ? 'DRY RUN' : 'EXECUÇÃO'
    });

    if (DRY_RUN && (stats.orphan_files_found > 0 || stats.orphan_records_found > 0)) {
      logger.info('💡 Para executar as alterações, execute sem DRY_RUN=true');
    }

    logger.info('🎉 Limpeza concluída com sucesso!');
    process.exit(0);

  } catch (error) {
    logger.error('💥 Erro durante a limpeza:', error);
    process.exit(1);
  }
}

// Executar script
main().catch(error => {
  logger.error('💥 Erro fatal:', error);
  process.exit(1);
});