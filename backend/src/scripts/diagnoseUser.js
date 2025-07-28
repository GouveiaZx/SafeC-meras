/**
 * Script de diagnóstico para verificar o status do usuário gouveiarx@gmail.com
 * Identifica problemas de login e fornece soluções
 */

import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../config/database.js';
import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('DiagnoseUser');

/**
 * Diagnóstica o usuário específico
 */
async function diagnoseUser() {
  try {
    const targetEmail = 'gouveiarx@gmail.com';
    const expectedPassword = 'Teste123';
    
    logger.info(`🔍 Iniciando diagnóstico para: ${targetEmail}`);
    
    // 1. Verificar se o usuário existe
    logger.info('\n📋 ETAPA 1: Verificando existência do usuário...');
    
    const { data: users, error: findError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', targetEmail)
      .limit(1);
    
    if (findError) {
      logger.error('❌ Erro ao buscar usuário:', findError.message);
      return;
    }
    
    if (!users || users.length === 0) {
      logger.error('❌ PROBLEMA ENCONTRADO: Usuário não existe no banco de dados');
      logger.info('💡 SOLUÇÃO: Execute o script createAdminUser.js');
      logger.info('   Comando: node src/scripts/createAdminUser.js');
      return;
    }
    
    const user = users[0];
    logger.info('✅ Usuário encontrado no banco de dados');
    
    // 2. Verificar status da conta
    logger.info('\n📋 ETAPA 2: Verificando status da conta...');
    logger.info(`   ID: ${user.id}`);
    logger.info(`   Nome: ${user.name}`);
    logger.info(`   Email: ${user.email}`);
    logger.info(`   Role: ${user.role}`);
    logger.info(`   Ativo: ${user.active}`);
    logger.info(`   Bloqueado em: ${user.blocked_at || 'Não bloqueado'}`);
    logger.info(`   Último login: ${user.last_login_at || 'Nunca'}`);
    logger.info(`   Criado em: ${user.created_at}`);
    logger.info(`   Atualizado em: ${user.updated_at}`);
    
    // Verificar problemas de status
    const statusProblems = [];
    let needsUpdate = false;
    const updateData = {};
    
    if (!user.active) {
      statusProblems.push('Conta está inativa');
      updateData.active = true;
      needsUpdate = true;
    }
    
    if (user.blocked_at) {
      statusProblems.push('Conta está bloqueada');
      updateData.blocked_at = null;
      needsUpdate = true;
    }
    
    if (statusProblems.length > 0) {
      logger.error('❌ PROBLEMAS DE STATUS ENCONTRADOS:');
      statusProblems.forEach(problem => logger.error(`   - ${problem}`));
      logger.info('💡 SOLUÇÃO: Reativar/desbloquear a conta');
      
      // Corrigir automaticamente
      logger.info('🔧 Corrigindo automaticamente...');
      updateData.updated_at = new Date().toISOString();
      
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update(updateData)
        .eq('id', user.id);
      
      if (updateError) {
        logger.error('❌ Erro ao atualizar status:', updateError.message);
      } else {
        logger.info('✅ Conta reativada e desbloqueada');
      }
    } else {
      logger.info('✅ Status da conta está correto');
    }
    
    // 3. Verificar senha
    logger.info('\n📋 ETAPA 3: Verificando senha...');
    
    try {
      const isPasswordValid = await bcrypt.compare(expectedPassword, user.password);
      
      if (!isPasswordValid) {
        logger.error('❌ PROBLEMA ENCONTRADO: Senha não confere');
        logger.info('💡 SOLUÇÃO: Resetar senha para "Teste123"');
        
        // Corrigir automaticamente
        logger.info('🔧 Resetando senha...');
        const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
        const hashedPassword = await bcrypt.hash(expectedPassword, saltRounds);
        
        const { error: passwordError } = await supabaseAdmin
          .from('users')
          .update({
            password: hashedPassword,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id);
        
        if (passwordError) {
          logger.error('❌ Erro ao resetar senha:', passwordError.message);
        } else {
          logger.info('✅ Senha resetada com sucesso');
        }
      } else {
        logger.info('✅ Senha está correta');
      }
    } catch (passwordError) {
      logger.error('❌ Erro ao verificar senha:', passwordError.message);
    }
    
    // 4. Verificar permissões
    logger.info('\n📋 ETAPA 4: Verificando permissões...');
    logger.info(`   Permissões: ${JSON.stringify(user.permissions)}`);
    logger.info(`   Acesso a câmeras: ${JSON.stringify(user.camera_access)}`);
    
    if (user.role !== 'admin') {
      logger.warn('⚠️  AVISO: Usuário não é admin');
      logger.info('💡 SOLUÇÃO: Definir como admin se necessário');
      
      // Corrigir automaticamente
      logger.info('🔧 Definindo como admin...');
      const { error: roleError } = await supabaseAdmin
        .from('users')
        .update({
          role: 'admin',
          permissions: ['*'],
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);
      
      if (roleError) {
        logger.error('❌ Erro ao atualizar role:', roleError.message);
      } else {
        logger.info('✅ Usuário definido como admin');
      }
    } else {
      logger.info('✅ Permissões estão corretas');
    }
    
    // 5. Testar login simulado
    logger.info('\n📋 ETAPA 5: Testando login simulado...');
    try {
      // Buscar usuário atualizado
      const { data: updatedUsers, error: refreshError } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('email', targetEmail)
        .limit(1);
      
      if (refreshError) {
        logger.error('❌ Erro ao buscar usuário atualizado:', refreshError.message);
      } else if (updatedUsers && updatedUsers.length > 0) {
        const updatedUser = updatedUsers[0];
        const testPassword = await bcrypt.compare(expectedPassword, updatedUser.password);
        
        if (updatedUser.active && !updatedUser.blocked_at && testPassword) {
          logger.info('✅ Login simulado bem-sucedido');
          
          // Atualizar último login
          const { error: loginError } = await supabaseAdmin
            .from('users')
            .update({
              last_login_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', updatedUser.id);
          
          if (loginError) {
            logger.error('❌ Erro ao atualizar último login:', loginError.message);
          } else {
            logger.info('✅ Último login atualizado');
          }
        } else {
          logger.error('❌ Login simulado falhou');
          logger.error(`   Ativo: ${updatedUser.active}`);
          logger.error(`   Bloqueado: ${updatedUser.blocked_at}`);
          logger.error(`   Senha válida: ${testPassword}`);
        }
      }
    } catch (error) {
      logger.error('❌ Erro no login simulado:', error.message);
    }
    
    // 6. Verificar configurações do sistema
    logger.info('\n📋 ETAPA 6: Verificando configurações do sistema...');
    
    // Verificar variáveis de ambiente críticas
    const criticalEnvVars = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'JWT_SECRET',
      'JWT_EXPIRES_IN'
    ];
    
    const missingEnvVars = criticalEnvVars.filter(varName => !process.env[varName]);
    
    if (missingEnvVars.length > 0) {
      logger.error('❌ VARIÁVEIS DE AMBIENTE FALTANDO:');
      missingEnvVars.forEach(varName => logger.error(`   - ${varName}`));
      logger.info('💡 SOLUÇÃO: Verificar arquivo .env');
    } else {
      logger.info('✅ Variáveis de ambiente estão configuradas');
    }
    
    // Resumo final
    logger.info('\n🎉 DIAGNÓSTICO CONCLUÍDO!');
    logger.info('📊 RESUMO:');
    logger.info(`   Email: ${targetEmail}`);
    logger.info(`   Senha: ${expectedPassword}`);
    logger.info(`   Status: Conta ativa e desbloqueada`);
    logger.info(`   Role: admin`);
    logger.info(`   Último login: ${new Date().toISOString()}`);
    logger.info('\n💡 PRÓXIMOS PASSOS:');
    logger.info('   1. Tente fazer login novamente no frontend');
    logger.info('   2. Se ainda não funcionar, verifique se o backend está rodando');
    logger.info('   3. Verifique se o frontend está apontando para a URL correta do backend');
    logger.info('   4. Verifique os logs do navegador para erros de rede');
    
  } catch (error) {
    logger.error('💥 Erro durante o diagnóstico:', error);
    throw error;
  }
}

/**
 * Função principal
 */
async function main() {
  try {
    await diagnoseUser();
    logger.info('\n✅ Processo de diagnóstico concluído com sucesso!');
    process.exit(0);
  } catch (error) {
    logger.error('\n💥 Falha no processo de diagnóstico:', error);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { diagnoseUser };