#!/usr/bin/env node

/**
 * Script de migração para adicionar novos campos à tabela de usuários
 * Executa as mudanças necessárias para suportar o sistema de aprovação
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Carregar variáveis de ambiente
dotenv.config({ path: join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são necessárias');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const migrations = [
  {
    name: 'add_username_column',
    sql: `
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS username VARCHAR(50) UNIQUE;
    `
  },
  {
    name: 'add_full_name_column',
    sql: `
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);
    `
  },
  {
    name: 'add_status_column',
    sql: `
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending' 
      CHECK (status IN ('pending', 'active', 'inactive', 'suspended'));
    `
  },
  {
    name: 'add_approval_fields',
    sql: `
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id);
    `
  },
  {
    name: 'add_suspension_fields',
    sql: `
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES users(id);
    `
  },
  {
    name: 'update_existing_users_status',
    sql: `
      UPDATE users 
      SET status = CASE 
        WHEN active = true THEN 'active'
        ELSE 'inactive'
      END
      WHERE status IS NULL;
    `
  },
  {
    name: 'populate_username_from_email',
    sql: `
      UPDATE users 
      SET username = SPLIT_PART(email, '@', 1)
      WHERE username IS NULL;
    `
  },
  {
    name: 'populate_full_name_from_name',
    sql: `
      UPDATE users 
      SET full_name = COALESCE(name, email)
      WHERE full_name IS NULL;
    `
  },
  {
    name: 'create_username_index',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    `
  },
  {
    name: 'create_status_index',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
    `
  },
  {
    name: 'update_admin_users_to_active',
    sql: `
      UPDATE users 
      SET status = 'active', approved_at = NOW()
      WHERE role = 'admin' AND status = 'pending';
    `
  }
];

async function runMigration() {
  console.log('🚀 Iniciando migração de campos de usuários...\n');
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const migration of migrations) {
    try {
      console.log(`📋 Executando: ${migration.name}`);
      
      const { error } = await supabase.rpc('exec_sql', {
        sql_query: migration.sql
      });
      
      if (error) {
        // Tentar execução direta se RPC falhar
        const { error: directError } = await supabase
          .from('_temp')
          .select('*')
          .limit(0);
        
        if (directError) {
          // Usar método alternativo para DDL
          const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
              'apikey': supabaseServiceKey,
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sql_query: migration.sql })
          });
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
          }
        }
      }
      
      console.log(`✅ ${migration.name} - Concluído`);
      successCount++;
      
    } catch (error) {
      console.error(`❌ ${migration.name} - Erro:`, error.message);
      errorCount++;
      
      // Continuar com outras migrações mesmo se uma falhar
      if (migration.name.includes('add_') && error.message.includes('already exists')) {
        console.log(`ℹ️  Campo já existe, continuando...`);
        successCount++;
        errorCount--;
      }
    }
  }
  
  console.log('\n📊 Resumo da migração:');
  console.log(`✅ Sucessos: ${successCount}`);
  console.log(`❌ Erros: ${errorCount}`);
  
  if (errorCount === 0) {
    console.log('\n🎉 Migração concluída com sucesso!');
    
    // Verificar estado final
    await verifyMigration();
  } else {
    console.log('\n⚠️  Migração concluída com alguns erros. Verifique os logs acima.');
  }
}

async function verifyMigration() {
  try {
    console.log('\n🔍 Verificando estado da tabela de usuários...');
    
    // Verificar estrutura da tabela
    const { data: columns, error: columnsError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable, column_default')
      .eq('table_name', 'users')
      .order('ordinal_position');
    
    if (columnsError) {
      console.error('Erro ao verificar colunas:', columnsError);
      return;
    }
    
    console.log('\n📋 Estrutura atual da tabela users:');
    columns.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '(NOT NULL)' : ''}`);
    });
    
    // Verificar alguns usuários
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, username, email, full_name, status, role')
      .limit(5);
    
    if (usersError) {
      console.error('Erro ao verificar usuários:', usersError);
      return;
    }
    
    console.log('\n👥 Exemplo de usuários atualizados:');
    users.forEach(user => {
      console.log(`  - ${user.username || 'N/A'} (${user.email}) - Status: ${user.status} - Role: ${user.role}`);
    });
    
    // Estatísticas de status
    const { data: statusStats, error: statsError } = await supabase
      .from('users')
      .select('status')
      .then(({ data, error }) => {
        if (error) return { data: null, error };
        
        const stats = data.reduce((acc, user) => {
          acc[user.status] = (acc[user.status] || 0) + 1;
          return acc;
        }, {});
        
        return { data: stats, error: null };
      });
    
    if (!statsError && statusStats) {
      console.log('\n📈 Distribuição de status:');
      Object.entries(statusStats).forEach(([status, count]) => {
        console.log(`  - ${status}: ${count} usuários`);
      });
    }
    
  } catch (error) {
    console.error('Erro na verificação:', error);
  }
}

// Executar migração
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigration()
    .then(() => {
      console.log('\n✨ Script de migração finalizado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Erro fatal na migração:', error);
      process.exit(1);
    });
}

export { runMigration, verifyMigration };