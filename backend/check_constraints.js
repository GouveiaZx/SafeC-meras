/**
 * Script para verificar constraints da tabela cameras
 */

import { supabaseAdmin } from './src/config/database.js';
import { createModuleLogger } from './src/config/logger.js';

const logger = createModuleLogger('CheckConstraints');

async function checkConstraints() {
  try {
    console.log('🔍 Verificando constraints da tabela cameras...');
    
    // Consultar constraints da tabela cameras
    const { data: constraints, error } = await supabaseAdmin
      .rpc('exec_sql', {
        query: `
          SELECT 
            conname as constraint_name,
            pg_get_constraintdef(oid) as constraint_definition
          FROM pg_constraint 
          WHERE conrelid = 'cameras'::regclass
            AND contype = 'c'
        `
      });
    
    if (error) {
      console.error('❌ Erro ao consultar constraints:', error);
      return;
    }
    
    console.log('📋 Constraints encontradas:');
    constraints.forEach(constraint => {
      console.log(`\n🔒 ${constraint.constraint_name}:`);
      console.log(`   ${constraint.constraint_definition}`);
    });
    
    // Verificar estrutura da tabela cameras
    const { data: columns, error: columnsError } = await supabaseAdmin
      .rpc('exec_sql', {
        query: `
          SELECT 
            column_name,
            data_type,
            is_nullable,
            column_default
          FROM information_schema.columns 
          WHERE table_name = 'cameras'
          ORDER BY ordinal_position
        `
      });
    
    if (columnsError) {
      console.error('❌ Erro ao consultar colunas:', columnsError);
      return;
    }
    
    console.log('\n📊 Estrutura da tabela cameras:');
    columns.forEach(col => {
      console.log(`   ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });
    
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

checkConstraints();