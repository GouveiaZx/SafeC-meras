const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');

const supabaseUrl = 'https://grkvfzuadctextnbpajb.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzIyNDIzOCwiZXhwIjoyMDY4ODAwMjM4fQ.XJoPu5InA_s3pfryZfSChBqZnu7zBV3vwH7ZM4jf04M';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createMissingUser() {
  try {
    const targetUserId = '68c2a71f-b9d7-4673-9119-de6364e2af0a';
    const targetEmail = 'admin@admin.com';
    
    console.log('🔍 Verificando se usuário admin@admin.com existe na tabela users...');
    
    // Verificar se o usuário já existe
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('*')
      .eq('id', targetUserId)
      .single();
    
    if (checkError && checkError.code !== 'PGRST116') {
      console.error('❌ Erro ao verificar usuário:', checkError);
      return;
    }
    
    if (existingUser) {
      console.log('✅ Usuário já existe na tabela users');
      console.log(`   Nome: ${existingUser.name}`);
      console.log(`   Email: ${existingUser.email}`);
      console.log(`   Role: ${existingUser.role}`);
      console.log(`   Ativo: ${existingUser.active}`);
      return;
    }
    
    console.log('❌ Usuário não encontrado na tabela users');
    console.log('🔧 Criando usuário na tabela users...');
    
    // Gerar hash da senha
    const password = 'admin123';
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    console.log('🔐 Senha hash gerada');
    
    // Criar o usuário na tabela users
    const userData = {
      id: targetUserId,
      email: targetEmail,
      name: 'Admin',
      password: hashedPassword,
      role: 'admin',
      permissions: ['read', 'write', 'admin'],
      camera_access: [],
      active: true
    };
    
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert(userData)
      .select()
      .single();
    
    if (insertError) {
      console.error('❌ Erro ao criar usuário:', insertError);
      return;
    }
    
    console.log('✅ Usuário criado com sucesso na tabela users!');
    console.log(`   ID: ${newUser.id}`);
    console.log(`   Email: ${newUser.email}`);
    console.log(`   Nome: ${newUser.name}`);
    console.log(`   Role: ${newUser.role}`);
    console.log(`   Ativo: ${newUser.active}`);
    
    // Verificar se agora funciona
    console.log('\n🔍 Testando busca do usuário...');
    const { data: testUser, error: testError } = await supabase
      .from('users')
      .select('*')
      .eq('id', targetUserId)
      .eq('active', true)
      .single();
    
    if (testError) {
      console.error('❌ Erro no teste:', testError);
    } else {
      console.log('✅ Usuário encontrado com sucesso!');
      console.log('🎉 Agora o streaming deve funcionar!');
    }
    
  } catch (err) {
    console.error('❌ Erro geral:', err);
  }
}

createMissingUser();