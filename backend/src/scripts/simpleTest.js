/**
 * Teste simples para verificar o usuário gouveiarx@gmail.com
 */

import { supabaseAdmin } from '../config/database.js';

console.log('🔍 Iniciando teste simples...');

try {
  console.log('📋 Buscando usuário gouveiarx@gmail.com...');
  
  const { data: users, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('email', 'gouveiarx@gmail.com')
    .limit(1);
  
  if (error) {
    console.error('❌ Erro:', error.message);
  } else if (!users || users.length === 0) {
    console.log('❌ Usuário não encontrado');
  } else {
    const user = users[0];
    console.log('✅ Usuário encontrado:');
    console.log('   ID:', user.id);
    console.log('   Nome:', user.name);
    console.log('   Email:', user.email);
    console.log('   Role:', user.role);
    console.log('   Ativo:', user.active);
    console.log('   Bloqueado:', user.blocked_at);
    console.log('   Último login:', user.last_login_at);
  }
} catch (error) {
  console.error('💥 Erro:', error.message);
}

console.log('✅ Teste concluído');