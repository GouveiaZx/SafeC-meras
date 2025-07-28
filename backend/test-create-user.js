import { createAdminUser } from './src/scripts/createAdminUser.js';

console.log('🚀 Iniciando teste de criação de usuário...');

try {
  const result = await createAdminUser();
  console.log('✅ Usuário criado com sucesso:', result);
} catch (error) {
  console.error('❌ Erro ao criar usuário:', error);
}

console.log('🏁 Teste finalizado.');