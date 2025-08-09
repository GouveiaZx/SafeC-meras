import { User } from './src/models/User.js';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

async function testAuthDirect() {
  try {
    console.log('🧪 Testando autenticação direta...');
    
    // Buscar usuário pelo modelo
    const user = await User.findByEmail('test@recording.com');
    
    if (!user) {
      console.log('❌ Usuário não encontrado');
      return;
    }
    
    console.log('✅ Usuário encontrado:', user.email);
    console.log('🔐 Password hash:', user.password ? 'Presente' : 'Ausente');
    
    // Testar verificação de senha
    const isValid = await user.verifyPassword('test123');
    console.log('🔑 Senha válida:', isValid ? '✅ SIM' : '❌ NÃO');
    
    // Testar hash manual
    const manualCheck = await bcrypt.compare('test123', user.password);
    console.log('🔧 Verificação manual:', manualCheck ? '✅ SIM' : '❌ NÃO');
    
    // Verificar se usuário está ativo
    console.log('👤 Usuário ativo:', user.active ? '✅ SIM' : '❌ NÃO');
    console.log('🚫 Usuário bloqueado:', user.blocked_at ? '❌ SIM' : '✅ NÃO');
    
  } catch (error) {
    console.error('❌ Erro no teste de autenticação:', error);
  }
}

// Executar
testAuthDirect()
  .then(() => {
    console.log('\n🎉 Teste de autenticação concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Erro fatal:', error);
    process.exit(1);
  });