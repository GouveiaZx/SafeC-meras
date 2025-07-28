/**
 * Script para criar a tabela system_metrics no banco de dados
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabaseAdmin } from '../config/database.js';
import { createModuleLogger } from '../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logger = createModuleLogger('CreateSystemMetrics');

/**
 * Cria a tabela system_metrics
 */
async function createSystemMetricsTable() {
  try {
    logger.info('Iniciando criação da tabela system_metrics...');
    
    // Ler o arquivo SQL
    const sqlPath = path.join(__dirname, 'add_system_metrics_table.sql');
    const sqlContent = await fs.readFile(sqlPath, 'utf8');
    
    // Executar o SQL
    const { error } = await supabaseAdmin.rpc('exec', {
      sql: sqlContent
    });
    
    if (error) {
      logger.error('Erro ao executar SQL via RPC:', error);
      
      // Tentar executar comando por comando
      logger.info('Tentando executar comandos individualmente...');
      
      // Dividir o SQL em comandos individuais
      const commands = sqlContent
        .split(';')
        .map(cmd => cmd.trim())
        .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));
      
      for (const command of commands) {
        if (command.trim()) {
          logger.debug(`Executando: ${command.substring(0, 50)}...`);
          
          const { error: cmdError } = await supabaseAdmin.rpc('exec', {
            sql: command + ';'
          });
          
          if (cmdError) {
            logger.warn(`Erro ao executar comando: ${cmdError.message}`);
          }
        }
      }
    }
    
    // Verificar se a tabela foi criada
    const { data, error: checkError } = await supabaseAdmin
      .from('system_metrics')
      .select('id')
      .limit(1);
    
    if (checkError) {
      if (checkError.code === 'PGRST116') {
        logger.error('❌ Tabela system_metrics não foi criada.');
        logger.info('📝 Execute o SQL manualmente no Supabase SQL Editor:');
        logger.info('📂 Arquivo: backend/src/database/add_system_metrics_table.sql');
        return false;
      } else {
        logger.warn('Aviso ao verificar tabela:', checkError);
      }
    }
    
    logger.info('✅ Tabela system_metrics criada/verificada com sucesso!');
    return true;
    
  } catch (error) {
    logger.error('Erro geral ao criar tabela system_metrics:', error);
    return false;
  }
}

/**
 * Função principal
 */
async function main() {
  try {
    const success = await createSystemMetricsTable();
    
    if (success) {
      logger.info('🎉 Processo concluído com sucesso!');
      process.exit(0);
    } else {
      logger.error('❌ Processo falhou. Verifique os logs acima.');
      process.exit(1);
    }
    
  } catch (error) {
    logger.error('Erro fatal:', error);
    process.exit(1);
  }
}

// Executar sempre quando o script for chamado
main();

export { createSystemMetricsTable };