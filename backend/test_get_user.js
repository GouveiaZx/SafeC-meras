import { supabaseAdmin } from './src/config/database.js';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

async function getUserForTest() {
  try {
    console.log('🔍 Buscando usuários no sistema...');
    
    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('id, name, email, role, active')
      .eq('active', true)
      .limit(5);
    
    if (error) {
      console.error('❌ Erro ao buscar usuários:', error);
      return;
    }
    
    if (!users || users.length === 0) {
      console.log('⚠️ Nenhum usuário ativo encontrado');
      return;
    }
    
    console.log('👥 Usuários encontrados:');
    users.forEach((user, index) => {
      console.log(`  ${index + 1}. ${user.name} (${user.email}) - ID: ${user.id} - Role: ${user.role}`);
    });
    
    // Retornar o primeiro usuário para usar no teste
    return users[0];
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

// Executar
getUserForTest().then(user => {
  if (user) {
    console.log('\n✅ Usuário para teste:', user.id);
  }
});