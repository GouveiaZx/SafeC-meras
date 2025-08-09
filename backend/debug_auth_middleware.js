/**
 * Script para debugar o middleware de autenticação
 * Testa a busca de usuário no middleware
 */

import jwt from 'jsonwebtoken';
import { supabaseAdmin } from './src/config/database.js';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

async function debugAuthMiddleware() {
  console.log('🔍 Debugando middleware de autenticação...\n');

  try {
    // 1. Buscar um usuário ativo
    console.log('1. Buscando usuário ativo...');
    const { data: users, error: usersError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('active', true)
      .limit(1);

    if (usersError || !users || users.length === 0) {
      console.error('❌ Erro ao buscar usuários:', usersError);
      return;
    }

    const user = users[0];
    console.log('✅ Usuário encontrado:');
    console.log(`   - ID: ${user.id}`);
    console.log(`   - Nome: ${user.name}`);
    console.log(`   - Email: ${user.email}`);
    console.log(`   - Role: ${user.role}`);
    console.log(`   - Active: ${user.active}`);
    console.log(`   - Blocked: ${user.blocked_at ? 'Sim' : 'Não'}`);

    // 2. Criar token JWT
    console.log('\n2. Criando token JWT...');
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    console.log('✅ Token criado com sucesso');

    // 3. Verificar token
    console.log('\n3. Verificando token...');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('✅ Token verificado:');
    console.log(`   - User ID: ${decoded.userId}`);
    console.log(`   - Email: ${decoded.email}`);
    console.log(`   - Role: ${decoded.role}`);

    // 4. Simular busca do middleware
    console.log('\n4. Simulando busca do middleware...');
    const { data: foundUser, error: findError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', decoded.userId)
      .eq('active', true)
      .single();

    if (findError) {
      console.error('❌ Erro na busca do middleware:', findError);
      console.log('   - Código:', findError.code);
      console.log('   - Mensagem:', findError.message);
      console.log('   - Detalhes:', findError.details);
      return;
    }

    if (!foundUser) {
      console.error('❌ Usuário não encontrado pelo middleware');
      return;
    }

    console.log('✅ Usuário encontrado pelo middleware:');
    console.log(`   - ID: ${foundUser.id}`);
    console.log(`   - Nome: ${foundUser.name}`);
    console.log(`   - Email: ${foundUser.email}`);
    console.log(`   - Role: ${foundUser.role}`);
    console.log(`   - Active: ${foundUser.active}`);
    console.log(`   - Blocked: ${foundUser.blocked_at ? 'Sim' : 'Não'}`);

    // 5. Testar chamada para API de gravações
    console.log('\n5. Testando chamada para API de gravações...');
    const response = await fetch('http://localhost:3002/api/recordings/active', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`   - Status: ${response.status}`);
    const responseData = await response.json();
    console.log('   - Resposta:', JSON.stringify(responseData, null, 2));

    if (response.ok) {
      console.log('✅ API de gravações funcionando corretamente');
    } else {
      console.error('❌ Erro na API de gravações');
    }

  } catch (error) {
    console.error('❌ Erro no debug:', error);
  }
}

// Executar debug
debugAuthMiddleware();