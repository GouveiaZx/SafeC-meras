const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://grkvfzuadctextnbpajb.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzIyNDIzOCwiZXhwIjoyMDY4ODAwMjM4fQ.XJoPu5InA_s3pfryZfSChBqZnu7zBV3vwH7ZM4jf04M';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixUserTable() {
  try {
    console.log('🔍 Verificando usuários na tabela users...');
    
    // 1. Listar todos os usuários na tabela users
    const { data: usersInTable, error: usersError } = await supabase
      .from('users')
      .select('*');
    
    if (usersError) {
      console.error('❌ Erro ao buscar usuários na tabela:', usersError);
      return;
    }
    
    console.log(`📊 Encontrados ${usersInTable.length} usuários na tabela users:`);
    usersInTable.forEach((user, index) => {
      console.log(`   ${index + 1}. ${user.email} (ID: ${user.id}) - Ativo: ${user.active}`);
    });
    
    // 2. Listar usuários no Supabase Auth
    console.log('\n🔍 Verificando usuários no Supabase Auth...');
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      console.error('❌ Erro ao buscar usuários no Auth:', authError);
      return;
    }
    
    console.log(`📊 Encontrados ${authUsers.users.length} usuários no Supabase Auth:`);
    authUsers.users.forEach((user, index) => {
      console.log(`   ${index + 1}. ${user.email} (ID: ${user.id})`);
    });
    
    // 3. Encontrar usuários que estão no Auth mas não na tabela users
    console.log('\n🔍 Verificando inconsistências...');
    const missingUsers = authUsers.users.filter(authUser => 
      !usersInTable.find(tableUser => tableUser.id === authUser.id)
    );
    
    if (missingUsers.length === 0) {
      console.log('✅ Todos os usuários do Auth estão na tabela users');
      return;
    }
    
    console.log(`⚠️ Encontrados ${missingUsers.length} usuários no Auth que não estão na tabela users:`);
    missingUsers.forEach((user, index) => {
      console.log(`   ${index + 1}. ${user.email} (ID: ${user.id})`);
    });
    
    // 4. Criar registros na tabela users para os usuários faltantes
    console.log('\n🔧 Criando registros na tabela users...');
    
    for (const authUser of missingUsers) {
      console.log(`\n📝 Criando registro para ${authUser.email}...`);
      
      const userData = {
        id: authUser.id,
        email: authUser.email,
        name: authUser.user_metadata?.name || authUser.email.split('@')[0],
        role: 'admin', // Definindo como admin por padrão
        active: true,
        permissions: ['read', 'write', 'admin'],
        camera_access: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert(userData)
        .select()
        .single();
      
      if (insertError) {
        console.error(`❌ Erro ao criar usuário ${authUser.email}:`, insertError);
      } else {
        console.log(`✅ Usuário ${authUser.email} criado com sucesso na tabela users`);
      }
    }
    
    // 5. Verificar novamente
    console.log('\n🔍 Verificação final...');
    const { data: finalUsers, error: finalError } = await supabase
      .from('users')
      .select('*');
    
    if (finalError) {
      console.error('❌ Erro na verificação final:', finalError);
      return;
    }
    
    console.log(`✅ Total de usuários na tabela users: ${finalUsers.length}`);
    finalUsers.forEach((user, index) => {
      console.log(`   ${index + 1}. ${user.email} (ID: ${user.id}) - Ativo: ${user.active}`);
    });
    
    console.log('\n🎉 Sincronização concluída! Agora todos os usuários do Auth estão na tabela users.');
    
  } catch (err) {
    console.error('❌ Erro geral:', err);
  }
}

fixUserTable();