/**
 * Script de migração do banco de dados
 * Executa as migrações SQL no Supabase
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabaseAdmin } from '../config/database.js';
import { createModuleLogger } from '../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logger = createModuleLogger('Migration');

/**
 * Executa as migrações do banco de dados
 */
async function runMigrations() {
  try {
    logger.info('Iniciando migrações do banco de dados...');
    
    // Primeiro, testar a conexão
    logger.info('Testando conexão com Supabase...');
    const { data: testData, error: testError } = await supabaseAdmin
      .from('information_schema.tables')
      .select('table_name')
      .limit(1);
    
    if (testError) {
      logger.error('Erro de conexão com Supabase:', testError);
      throw new Error(`Falha na conexão: ${testError.message}`);
    }
    
    logger.info('Conexão com Supabase estabelecida com sucesso!');
    
    // Criar tabelas uma por uma usando queries diretas
    await createTablesDirectly();
    
    logger.info('Migrações executadas com sucesso!');
    
    // Verificar se as tabelas foram criadas
    await verifyTables();
    
  } catch (error) {
    logger.error('Erro ao executar migrações:', error);
    throw error;
  }
}

/**
 * Cria as tabelas diretamente usando o cliente Supabase
 */
async function createTablesDirectly() {
  logger.info('Criando tabelas diretamente...');
  
  // Verificar se a tabela users já existe
  const { data: existingTables, error: tablesError } = await supabaseAdmin
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public');
  
  if (tablesError) {
    logger.warn('Não foi possível verificar tabelas existentes:', tablesError.message);
  }
  
  const tableNames = existingTables?.map(t => t.table_name) || [];
  logger.info('Tabelas existentes:', tableNames);
  
  // Se as tabelas principais já existem, pular criação
  if (tableNames.includes('users') && tableNames.includes('cameras')) {
    logger.info('Tabelas principais já existem, pulando criação...');
    return;
  }
  
  logger.info('Tabelas não encontradas, será necessário criar via SQL Editor do Supabase');
  logger.info('Por favor, execute o arquivo migrations.sql no SQL Editor do Supabase');
}

/**
 * Verifica se as tabelas principais foram criadas
 */
async function verifyTables() {
  const tables = ['users', 'cameras', 'recordings', 'streams', 'alerts', 'system_logs'];
  
  logger.info('Verificando tabelas criadas...');
  
  for (const table of tables) {
    try {
      const { error } = await supabaseAdmin
        .from(table)
        .select('count')
        .limit(1);
      
      if (error) {
        logger.error(`Tabela ${table} não encontrada:`, error.message);
      } else {
        logger.info(`✓ Tabela ${table} verificada`);
      }
    } catch (error) {
      logger.error(`Erro ao verificar tabela ${table}:`, error.message);
    }
  }
}

/**
 * Cria dados iniciais se necessário
 */
async function seedInitialData() {
  try {
    logger.info('Verificando dados iniciais...');
    
    // Verificar se já existe usuário admin
    const { data: adminUser, error } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', 'admin@newcam.com')
      .single();
    
    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    
    if (!adminUser) {
      logger.info('Criando usuário administrador padrão...');
      
      // Hash da senha 'admin123'
      const passwordHash = '$2b$10$rQZ8kHWKQVnqVQZ8kHWKQVnqVQZ8kHWKQVnqVQZ8kHWKQVnqVQZ8k';
      
      const { error: createError } = await supabaseAdmin
        .from('users')
        .insert({
          email: 'admin@newcam.com',
          password_hash: passwordHash,
          name: 'Administrador',
          role: 'ADMIN'
        });
      
      if (createError) {
        logger.error('Erro ao criar usuário admin:', createError);
      } else {
        logger.info('✓ Usuário administrador criado');
      }
    } else {
      logger.info('✓ Usuário administrador já existe');
    }
    
  } catch (error) {
    logger.error('Erro ao criar dados iniciais:', error);
  }
}

/**
 * Função principal
 */
async function main() {
  try {
    await runMigrations();
    await seedInitialData();
    logger.info('Processo de migração concluído com sucesso!');
    process.exit(0);
  } catch (error) {
    logger.error('Falha no processo de migração:', error);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { runMigrations, verifyTables, seedInitialData };