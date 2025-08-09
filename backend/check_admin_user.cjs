const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function checkAdminUser() {
  try {
    console.log('🔍 Verificando usuário admin no Supabase...');
    
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ Variáveis de ambiente do Supabase não encontradas');
      return;
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Verificar se existe usuário admin
    console.log('\n🔍 Buscando usuário admin@admin.com...');
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error('❌ Erro ao listar usuários:', listError.message);
      return;
    }
    
    console.log(`📊 Total de usuários encontrados: ${users.users.length}`);
    
    const adminUser = users.users.find(user => user.email === 'admin@admin.com');
    
    if (adminUser) {
      console.log('✅ Usuário admin encontrado:');
      console.log(`   ID: ${adminUser.id}`);
      console.log(`   Email: ${adminUser.email}`);
      console.log(`   Criado em: ${adminUser.created_at}`);
      console.log(`   Confirmado: ${adminUser.email_confirmed_at ? 'Sim' : 'Não'}`);
    } else {
      console.log('❌ Usuário admin@admin.com não encontrado');
      console.log('\n🔧 Criando usuário admin...');
      
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: 'admin@admin.com',
        password: 'admin123',
        email_confirm: true
      });
      
      if (createError) {
        console.error('❌ Erro ao criar usuário admin:', createError.message);
      } else {
        console.log('✅ Usuário admin criado com sucesso!');
        console.log(`   ID: ${newUser.user.id}`);
        console.log(`   Email: ${newUser.user.email}`);
      }
    }
    
    // Listar todos os usuários para debug
    console.log('\n📋 Todos os usuários no sistema:');
    users.users.forEach((user, index) => {
      console.log(`   ${index + 1}. ${user.email} (ID: ${user.id})`);
    });
    
  } catch (error) {
    console.error('❌ Erro geral:', error.message);
  }
}

checkAdminUser();