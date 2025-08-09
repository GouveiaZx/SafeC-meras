import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createTestUser() {
  try {
    console.log('👤 Criando usuário de teste para gravações...');
    
    // Gerar hash da senha
    const password = 'test123';
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    console.log('🔐 Hash da senha gerado');
    
    // Verificar se usuário já existe
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', 'test@recording.com')
      .single();
    
    if (existingUser) {
      console.log('⚠️ Usuário já existe, atualizando senha...');
      
      const { data, error } = await supabase
        .from('users')
        .update({
          password: passwordHash,
          updated_at: new Date().toISOString()
        })
        .eq('email', 'test@recording.com')
        .select()
        .single();
      
      if (error) {
        console.error('❌ Erro ao atualizar usuário:', error);
        return null;
      }
      
      console.log('✅ Senha do usuário atualizada');
      return data;
    }
    
    // Criar novo usuário
    const { data, error } = await supabase
      .from('users')
      .insert({
        email: 'test@recording.com',
        password: passwordHash,
        name: 'Test Recording User',
        role: 'admin',
        active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) {
      console.error('❌ Erro ao criar usuário:', error);
      return null;
    }
    
    console.log('✅ Usuário de teste criado:', data.email);
    console.log('📧 Email: test@recording.com');
    console.log('🔑 Senha: test123');
    
    return data;
    
  } catch (error) {
    console.error('❌ Erro ao criar usuário de teste:', error);
    return null;
  }
}

// Executar
createTestUser()
  .then((user) => {
    if (user) {
      console.log('\n🎉 Usuário de teste criado/atualizado com sucesso!');
      console.log('Agora você pode usar as credenciais:');
      console.log('Email: test@recording.com');
      console.log('Senha: test123');
    } else {
      console.log('\n❌ Falha ao criar usuário de teste');
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Erro fatal:', error);
    process.exit(1);
  });