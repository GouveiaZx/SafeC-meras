/**
 * Configuração do banco de dados Supabase
 */

// Carregar variáveis de ambiente PRIMEIRO
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Carregar .env do diretório backend
const envPath = join(__dirname, '..', '..', '.env');
dotenv.config({ path: envPath });

import { createClient } from '@supabase/supabase-js';
import { createModuleLogger } from './logger.js';

const logger = createModuleLogger('Database');

// Configurações do Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'your-anon-key-here';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-key-here';

// Debug das variáveis de ambiente
console.log('🔍 [Database] Verificando variáveis de ambiente...');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'SET' : 'NOT SET');
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT SET');

// Função para verificar credenciais
function checkCredentials() {
  if (!supabaseUrl || supabaseUrl === 'https://your-project-id.supabase.co' || 
      !supabaseKey || supabaseKey.includes('your-anon-key') ||
      !supabaseServiceKey || supabaseServiceKey.includes('your-service-role-key')) {
    
    logger.error('❌ Credenciais do Supabase não configuradas!');
    logger.error('Configure as variáveis SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY no arquivo .env');
    process.exit(1);
  }
}

// Verificar credenciais apenas se não estivermos em modo de teste
if (process.env.NODE_ENV !== 'test') {
  checkCredentials();
}

// Cliente Supabase para operações normais
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  },
  db: {
    schema: 'public'
  },
  global: {
    headers: {
      'x-application-name': 'newcam-backend'
    }
  }
});

// Cliente Supabase com privilégios administrativos
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  db: {
    schema: 'public'
  }
});

logger.info('✅ Clientes Supabase configurados com sucesso');

export { supabase, supabaseAdmin };

/**
 * Verificar se o banco de dados está configurado com credenciais reais
 */
export function isConfigured() {
  return supabaseUrl && 
         supabaseUrl !== 'https://your-project-id.supabase.co' && 
         supabaseKey && 
         !supabaseKey.includes('your-anon-key') &&
         supabaseServiceKey && 
         !supabaseServiceKey.includes('your-service-role-key');
}

/**
 * Testar conexão com o banco de dados
 */
export async function testDatabaseConnection() {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1);
    
    if (error) {
      logger.error('Erro ao testar conexão com o banco:', error);
      return false;
    }
    
    logger.info('Conexão com o banco de dados estabelecida com sucesso');
    return true;
  } catch (error) {
    logger.error('Erro ao conectar com o banco de dados:', error);
    return false;
  }
}

/**
 * Configurações de tabelas do banco
 */
export const TABLES = {
  USERS: 'users',
  CAMERAS: 'cameras',
  RECORDINGS: 'recordings',
  STREAMS: 'streams',
  ALERTS: 'alerts',
  SYSTEM_LOGS: 'system_logs',
  USER_SESSIONS: 'user_sessions'
};

/**
 * Utilitários para operações no banco
 */
export const dbUtils = {
  /**
   * Executar query com tratamento de erro
   */
  async executeQuery(queryBuilder, operation = 'query') {
    try {
      const { data, error, count } = await queryBuilder;
      
      if (error) {
        logger.error(`Erro na operação ${operation}:`, error);
        throw new Error(`Erro no banco de dados: ${error.message}`);
      }
      
      return { data, count };
    } catch (error) {
      logger.error(`Erro ao executar ${operation}:`, error);
      throw error;
    }
  },
  
  /**
   * Buscar registro por ID
   */
  async findById(table, id, select = '*') {
    const query = supabase
      .from(table)
      .select(select)
      .eq('id', id)
      .single();
    
    return this.executeQuery(query, `findById ${table}`);
  },
  
  /**
   * Buscar registros com paginação
   */
  async findWithPagination(table, { page = 1, limit = 10, select = '*', filters = {}, orderBy = 'created_at', ascending = false }) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    
    let query = supabase
      .from(table)
      .select(select, { count: 'exact' })
      .range(from, to)
      .order(orderBy, { ascending });
    
    // Aplicar filtros
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (typeof value === 'string' && value.includes('%')) {
          query = query.ilike(key, value);
        } else {
          query = query.eq(key, value);
        }
      }
    });
    
    return this.executeQuery(query, `findWithPagination ${table}`);
  },
  
  /**
   * Criar novo registro
   */
  async create(table, data) {
    const query = supabase
      .from(table)
      .insert(data)
      .select()
      .single();
    
    return this.executeQuery(query, `create ${table}`);
  },
  
  /**
   * Atualizar registro
   */
  async update(table, id, data) {
    const query = supabase
      .from(table)
      .update(data)
      .eq('id', id)
      .select()
      .single();
    
    return this.executeQuery(query, `update ${table}`);
  },
  
  /**
   * Deletar registro
   */
  async delete(table, id) {
    const query = supabase
      .from(table)
      .delete()
      .eq('id', id);
    
    return this.executeQuery(query, `delete ${table}`);
  },
  
  /**
   * Contar registros
   */
  async count(table, filters = {}) {
    let query = supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    
    // Aplicar filtros
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        query = query.eq(key, value);
      }
    });
    
    const result = await this.executeQuery(query, `count ${table}`);
    return result.count || 0;
  },
  
  /**
   * Verificar se registro existe
   */
  async exists(table, filters) {
    const count = await this.count(table, filters);
    return count > 0;
  }
};

/**
 * Inicializar banco de dados
 */
export async function initializeDatabase() {
  try {
    logger.info('Inicializando conexão com o banco de dados...');
    
    // Testar conexão
    const isConnected = await testDatabaseConnection();
    
    if (!isConnected) {
      throw new Error('Não foi possível estabelecer conexão com o banco de dados');
    }
    
    // Verificar se as tabelas principais existem
    const requiredTables = Object.values(TABLES);
    
    for (const table of requiredTables) {
      try {
        await supabase.from(table).select('count').limit(1);
        logger.info(`Tabela ${table} verificada`);
      } catch (error) {
        logger.warn(`Tabela ${table} pode não existir:`, error.message);
      }
    }
    
    logger.info('Banco de dados inicializado com sucesso');
    return true;
  } catch (error) {
    logger.error('Erro ao inicializar banco de dados:', error);
    throw error;
  }
}

/**
 * Middleware para adicionar cliente Supabase à requisição
 */
export function addDatabaseToRequest(req, res, next) {
  req.db = supabase;
  req.dbAdmin = supabaseAdmin;
  req.dbUtils = dbUtils;
  next();
}

export default {
  supabase,
  supabaseAdmin,
  dbUtils,
  TABLES,
  isConfigured,
  testDatabaseConnection,
  initializeDatabase,
  addDatabaseToRequest
};