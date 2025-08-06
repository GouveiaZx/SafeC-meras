/**
 * Script para criar usuário de teste no sistema NewCAM
 * Verifica se existe usuário admin e cria um se necessário
 */

import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Carregar variáveis de ambiente do backend
dotenv.config({ path: join(__dirname, '../backend/.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Erro: Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function criarUsuarioTeste() {
  try {
    console.log('🔍 Verificando usuários existentes...');
    
    // Verificar se já existe algum usuário admin
    const { data: existingUsers, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('role', 'admin')
      .eq('active', true);
    
    if (fetchError) {
      console.error('❌ Erro ao buscar usuários:', fetchError);
      return;
    }
    
    if (existingUsers && existingUsers.length > 0) {
      console.log('✅ Usuário admin já existe:');
      existingUsers.forEach(user => {
        console.log(`   - ${user.name} (${user.email})`);
      });
      return;
    }
    
    console.log('📝 Criando usuário admin de teste...');
    
    // Criar hash da senha
    const password = 'admin123';
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // Criar usuário admin
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert({
        email: 'admin@newcam.local',
        name: 'Administrador',
        password: hashedPassword,
        role: 'admin',
        permissions: [
          'cameras:read',
          'cameras:write',
          'cameras:delete',
          'recordings:read',
          'recordings:write',
          'recordings:delete',
          'users:read',
          'users:write',
          'users:delete',
          'system:read',
          'system:write'
        ],
        camera_access: ['*'], // Acesso a todas as câmeras
        active: true,
        preferences: {
          theme: 'light',
          notifications: true,
          autoRefresh: true
        }
      })
      .select()
      .single();
    
    if (createError) {
      console.error('❌ Erro ao criar usuário:', createError);
      return;
    }
    
    console.log('✅ Usuário admin criado com sucesso!');
    console.log('📧 Email: admin@newcam.local');
    console.log('🔑 Senha: admin123');
    console.log('👤 ID:', newUser.id);
    
    // Verificar permissões da tabela
    console.log('\n🔐 Verificando permissões da tabela users...');
    const { data: permissions, error: permError } = await supabase
      .rpc('check_table_permissions', { table_name: 'users' })
      .catch(() => null);
    
    if (permError) {
      console.log('⚠️ Não foi possível verificar permissões automaticamente');
      console.log('💡 Execute manualmente no Supabase SQL Editor:');
      console.log('   GRANT ALL PRIVILEGES ON users TO authenticated;');
      console.log('   GRANT SELECT ON users TO anon;');
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
}

// Executar script
criarUsuarioTeste().then(() => {
  console.log('\n🎯 Script concluído!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});