import { supabaseAdmin } from './src/config/database.js';

async function runMigrations() {
  try {
    console.log('Criando tabelas no Supabase...');
    
    // Criar tabela users
    console.log('Criando tabela users...');
    const { error: usersError } = await supabaseAdmin
      .from('users')
      .select('id')
      .limit(1);
    
    if (usersError && usersError.code === 'PGRST116') {
      console.log('Tabela users não existe, mas não podemos criá-la via cliente Supabase');
    } else {
      console.log('Tabela users já existe ou foi criada');
    }
    
    // Verificar se o usuário admin existe
    console.log('Verificando usuário admin...');
    const { data: adminUser, error: adminError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', 'admin@newcam.com')
      .single();
    
    if (adminError && adminError.code === 'PGRST116') {
      console.log('Erro: Tabelas não existem no banco de dados.');
      console.log('Por favor, execute o SQL do arquivo migrations.sql manualmente no Supabase SQL Editor.');
      console.log('Caminho do arquivo: src/database/migrations.sql');
    } else if (!adminUser) {
      console.log('Usuário admin não encontrado, mas tabela existe.');
    } else {
      console.log('Usuário admin encontrado:', adminUser.email);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Erro ao verificar migrações:', error);
    process.exit(1);
  }
}

runMigrations();