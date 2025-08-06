import { createClient } from '@supabase/supabase-js';

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'your-anon-key';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key';

// Cliente Supabase para operações normais (com RLS)
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

// Cliente Supabase para operações administrativas (sem RLS)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  db: {
    schema: 'public'
  }
});

/**
 * Verificar conexão com Supabase
 * @returns {Promise<boolean>} True se conectado
 */
export const checkSupabaseConnection = async () => {
  try {
    const { data, error } = await supabase
      .from('cameras')
      .select('count')
      .limit(1);
    
    return !error;
  } catch (error) {
    console.error('Erro ao verificar conexão Supabase:', error);
    return false;
  }
};

/**
 * Obter configurações do banco
 * @returns {Promise<Object>} Configurações
 */
export const getSupabaseConfig = async () => {
  try {
    const { data, error } = await supabaseAdmin
      .from('system_config')
      .select('*')
      .single();
    
    if (error) {
      console.error('Erro ao obter configurações:', error);
      return {};
    }
    
    return data || {};
  } catch (error) {
    console.error('Erro ao obter configurações Supabase:', error);
    return {};
  }
};

/**
 * Salvar configurações no banco
 * @param {Object} config - Configurações a salvar
 * @returns {Promise<boolean>} True se salvou com sucesso
 */
export const saveSupabaseConfig = async (config) => {
  try {
    const { error } = await supabaseAdmin
      .from('system_config')
      .upsert(config);
    
    if (error) {
      console.error('Erro ao salvar configurações:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Erro ao salvar configurações Supabase:', error);
    return false;
  }
};

/**
 * Executar query personalizada
 * @param {string} query - Query SQL
 * @param {Array} params - Parâmetros da query
 * @returns {Promise<Object>} Resultado da query
 */
export const executeQuery = async (query, params = []) => {
  try {
    const { data, error } = await supabaseAdmin.rpc('execute_sql', {
      query,
      params
    });
    
    if (error) {
      console.error('Erro ao executar query:', error);
      return { success: false, error };
    }
    
    return { success: true, data };
  } catch (error) {
    console.error('Erro ao executar query Supabase:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Obter estatísticas do banco
 * @returns {Promise<Object>} Estatísticas
 */
export const getDatabaseStats = async () => {
  try {
    const queries = [
      'SELECT COUNT(*) as total_cameras FROM cameras',
      'SELECT COUNT(*) as total_recordings FROM recordings',
      'SELECT COUNT(*) as total_alerts FROM alerts WHERE created_at >= NOW() - INTERVAL \'24 hours\'',
      'SELECT pg_size_pretty(pg_database_size(current_database())) as database_size'
    ];
    
    const results = {};
    
    for (const query of queries) {
      const result = await executeQuery(query);
      if (result.success && result.data.length > 0) {
        Object.assign(results, result.data[0]);
      }
    }
    
    return results;
  } catch (error) {
    console.error('Erro ao obter estatísticas do banco:', error);
    return {};
  }
};

/**
 * Limpar dados antigos do banco
 * @param {number} daysToKeep - Dias para manter
 * @returns {Promise<Object>} Resultado da limpeza
 */
export const cleanupOldData = async (daysToKeep = 30) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const queries = [
      `DELETE FROM logs WHERE created_at < '${cutoffDate.toISOString()}'`,
      `DELETE FROM metrics WHERE created_at < '${cutoffDate.toISOString()}'`,
      `DELETE FROM alerts WHERE created_at < '${cutoffDate.toISOString()}' AND status = 'resolved'`
    ];
    
    const results = [];
    
    for (const query of queries) {
      const result = await executeQuery(query);
      results.push(result);
    }
    
    return {
      success: true,
      results,
      cleanedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Erro ao limpar dados antigos:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

export default {
  supabase,
  supabaseAdmin,
  checkSupabaseConnection,
  getSupabaseConfig,
  saveSupabaseConfig,
  executeQuery,
  getDatabaseStats,
  cleanupOldData
};