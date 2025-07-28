/**
 * Teste de senha para o usuário gouveiarx@gmail.com
 */

import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../config/database.js';

console.log('🔍 Testando senha do usuário gouveiarx@gmail.com...');

try {
  // Buscar usuário
  const { data: users, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('email', 'gouveiarx@gmail.com')
    .limit(1);
  
  if (error) {
    console.error('❌ Erro ao buscar usuário:', error.message);
    process.exit(1);
  }
  
  if (!users || users.length === 0) {
    console.log('❌ Usuário não encontrado');
    process.exit(1);
  }
  
  const user = users[0];
  console.log('✅ Usuário encontrado:', user.email);
  
  // Testar senhas possíveis
  const possiblePasswords = ['Teste123', 'teste123', 'Admin123', 'admin123', '123456'];
  
  console.log('🔐 Testando senhas possíveis...');
  
  for (const password of possiblePasswords) {
    try {
      const isValid = await bcrypt.compare(password, user.password);
      console.log(`   ${password}: ${isValid ? '✅ VÁLIDA' : '❌ inválida'}`);
      
      if (isValid) {
        console.log(`\n🎉 SENHA ENCONTRADA: ${password}`);
        break;
      }
    } catch (err) {
      console.log(`   ${password}: ❌ erro - ${err.message}`);
    }
  }
  
  // Se nenhuma senha funcionou, resetar para Teste123
  console.log('\n🔧 Resetando senha para "Teste123"...');
  
  const saltRounds = 12;
  const hashedPassword = await bcrypt.hash('Teste123', saltRounds);
  
  const { error: updateError } = await supabaseAdmin
    .from('users')
    .update({
      password: hashedPassword,
      updated_at: new Date().toISOString()
    })
    .eq('id', user.id);
  
  if (updateError) {
    console.error('❌ Erro ao resetar senha:', updateError.message);
  } else {
    console.log('✅ Senha resetada para "Teste123" com sucesso!');
    
    // Verificar se a nova senha funciona
    const { data: updatedUsers } = await supabaseAdmin
      .from('users')
      .select('password')
      .eq('id', user.id)
      .limit(1);
    
    if (updatedUsers && updatedUsers.length > 0) {
      const isNewPasswordValid = await bcrypt.compare('Teste123', updatedUsers[0].password);
      console.log(`🔍 Verificação da nova senha: ${isNewPasswordValid ? '✅ OK' : '❌ FALHOU'}`);
    }
  }
  
} catch (error) {
  console.error('💥 Erro:', error.message);
}

console.log('\n✅ Teste de senha concluído');
console.log('💡 Agora tente fazer login com:');
console.log('   Email: gouveiarx@gmail.com');
console.log('   Senha: Teste123');