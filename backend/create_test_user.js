import { supabaseAdmin } from './src/config/database.js';
import bcrypt from 'bcryptjs';

async function createTestUser() {
  console.log('👤 Criando usuário de teste...');
  
  try {
    const testUser = {
      email: 'admin@example.com',
      password: await bcrypt.hash('admin123', 10),
      name: 'Admin Teste',
      role: 'admin',
      active: true,
      permissions: [],
      camera_access: [],
      preferences: {}
    };
    
    // Verificar se usuário já existe
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('email', testUser.email)
      .single();
    
    if (existingUser) {
      console.log('✅ Usuário de teste já existe:', existingUser.email);
      return existingUser;
    }
    
    // Criar usuário
    const { data, error } = await supabaseAdmin
      .from('users')
      .insert([testUser])
      .select()
      .single();
    
    if (error) {
      throw error;
    }
    
    console.log('✅ Usuário de teste criado com sucesso:');
    console.log(`   ID: ${data.id}`);
    console.log(`   Email: ${data.email}`);
    console.log(`   Role: ${data.role}`);
    
    return data;
    
  } catch (error) {
    console.error('❌ Erro ao criar usuário de teste:', error.message);
    throw error;
  }
}

// Executar
createTestUser();