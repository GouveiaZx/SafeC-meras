/**
 * Script para migrar o campo ip_address de INET para VARCHAR
 * Permite armazenar hostnames além de endereços IP
 */

import { supabaseAdmin } from './backend/src/config/database.js';
import { createModuleLogger } from './backend/src/config/logger.js';

const logger = createModuleLogger('IPFieldMigration');

async function migrateIpFields() {
  try {
    console.log('🔄 Iniciando migração do campo ip_address...');
    
    // Executar a migração usando SQL direto
    const migrationSQL = `
      -- Alterar o tipo do campo ip_address na tabela cameras
      ALTER TABLE cameras 
      ALTER COLUMN ip_address TYPE VARCHAR(255);
      
      -- Comentário explicativo
      COMMENT ON COLUMN cameras.ip_address IS 'Endereço IP ou hostname da câmera';
    `;
    
    console.log('📋 Executando SQL:', migrationSQL);
    
    const { data, error } = await supabaseAdmin.rpc('exec_sql', {
      sql: migrationSQL
    });
    
    if (error) {
      console.error('❌ Erro na migração:', error);
      
      // Tentar método alternativo usando UPDATE para testar se a tabela existe
      console.log('🔄 Tentando método alternativo...');
      
      // Primeiro, verificar se a tabela existe e tem dados
      const { data: testData, error: testError } = await supabaseAdmin
        .from('cameras')
        .select('id, ip_address')
        .limit(1);
        
      if (testError) {
        console.error('❌ Erro ao acessar tabela cameras:', testError);
        return;
      }
      
      console.log('✅ Tabela cameras acessível. Dados de teste:', testData);
      
      // Como não podemos alterar o schema diretamente via Supabase client,
      // vamos informar que a migração deve ser feita manualmente
      console.log('\n📝 AÇÃO MANUAL NECESSÁRIA:');
      console.log('Execute o seguinte SQL no painel do Supabase:');
      console.log('\nSQL Editor > New Query > Cole o código abaixo:');
      console.log('\n' + migrationSQL);
      
      return;
    }
    
    console.log('✅ Migração executada com sucesso!');
    console.log('📊 Resultado:', data);
    
    // Testar se a migração funcionou
    console.log('🧪 Testando a migração...');
    
    const { data: testData, error: testError } = await supabaseAdmin
      .from('cameras')
      .select('id, ip_address')
      .limit(1);
      
    if (testError) {
      console.error('❌ Erro no teste pós-migração:', testError);
    } else {
      console.log('✅ Teste pós-migração bem-sucedido!');
      console.log('📊 Dados de teste:', testData);
    }
    
  } catch (error) {
    console.error('💥 Erro inesperado na migração:', error);
  }
}

// Executar a migração
migrateIpFields().then(() => {
  console.log('🏁 Script de migração finalizado.');
  process.exit(0);
}).catch((error) => {
  console.error('💥 Falha crítica:', error);
  process.exit(1);
});