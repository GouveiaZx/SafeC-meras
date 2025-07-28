/**
 * Script para executar migração de colunas de streaming
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabaseAdmin } from '../config/database.js';
import { createModuleLogger } from '../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logger = createModuleLogger('StreamMigration');

/**
 * Executa a migração das colunas de streaming
 */
async function runStreamMigration() {
  try {
    logger.info('Iniciando migração de colunas de streaming...');
    
    // Ler o arquivo SQL
    const sqlPath = path.join(__dirname, 'add_stream_type_columns.sql');
    const sqlContent = await fs.readFile(sqlPath, 'utf8');
    
    // Dividir em comandos individuais
    const commands = sqlContent
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd && !cmd.startsWith('--'));
    
    logger.info(`Executando ${commands.length} comandos SQL...`);
    
    // Executar cada comando
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      if (!command) continue;
      
      try {
        logger.info(`Executando comando ${i + 1}/${commands.length}...`);
        
        const { error } = await supabaseAdmin.rpc('exec_sql', {
          sql: command
        });
        
        if (error) {
          // Se for erro de coluna já existir, ignorar
          if (error.message.includes('already exists') || 
              error.message.includes('já existe')) {
            logger.info(`Comando ${i + 1} ignorado (já existe): ${error.message}`);
            continue;
          }
          throw error;
        }
        
        logger.info(`✓ Comando ${i + 1} executado com sucesso`);
        
      } catch (cmdError) {
        logger.error(`Erro no comando ${i + 1}:`, cmdError.message);
        logger.error(`Comando: ${command.substring(0, 100)}...`);
        
        // Se for erro de coluna já existir, continuar
        if (cmdError.message.includes('already exists') || 
            cmdError.message.includes('já existe')) {
          logger.info('Continuando (coluna já existe)...');
          continue;
        }
        
        throw cmdError;
      }
    }
    
    logger.info('Migração de streaming concluída com sucesso!');
    
    // Verificar se as colunas foram criadas
    await verifyStreamColumns();
    
  } catch (error) {
    logger.error('Erro na migração de streaming:', error);
    throw error;
  }
}

/**
 * Verifica se as colunas de streaming foram criadas
 */
async function verifyStreamColumns() {
  try {
    logger.info('Verificando colunas de streaming...');
    
    // Tentar fazer uma query simples para verificar as colunas
    const { data, error } = await supabaseAdmin
      .from('cameras')
      .select('id, stream_type, ip_address, port')
      .limit(1);
    
    if (error) {
      logger.error('Erro ao verificar colunas:', error.message);
      return false;
    }
    
    logger.info('✓ Colunas de streaming verificadas com sucesso');
    return true;
    
  } catch (error) {
    logger.error('Erro na verificação:', error.message);
    return false;
  }
}

/**
 * Função principal
 */
async function main() {
  try {
    await runStreamMigration();
    logger.info('Processo concluído com sucesso!');
    process.exit(0);
  } catch (error) {
    logger.error('Falha no processo:', error);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { runStreamMigration, verifyStreamColumns };