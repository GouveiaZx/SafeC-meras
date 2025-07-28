/**
 * Script para criar usuário administrador inicial
 * Resolve o problema circular onde apenas admins podem criar usuários
 */

import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../config/database.js';
import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('CreateAdminUser');

/**
 * Cria o usuário administrador inicial
 */
async function createAdminUser() {
  try {
    const adminEmail = 'gouveiarx@gmail.com';
    const adminPassword = 'Teste123';
    const adminName = 'Administrador';
    
    logger.info('Iniciando criação do usuário administrador...');
    
    // Verificar se o usuário já existe
    const { data: existingUser, error: checkError } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('email', adminEmail)
      .single();
    
    if (checkError && checkError.code !== 'PGRST116') {
      throw new Error(`Erro ao verificar usuário existente: ${checkError.message}`);
    }
    
    if (existingUser) {
      logger.info(`Usuário admin já existe: ${adminEmail}`);
      return existingUser;
    }
    
    // Hash da senha
    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
    const hashedPassword = await bcrypt.hash(adminPassword, saltRounds);
    
    // Criar o usuário admin
    const { data: newUser, error: createError } = await supabaseAdmin
      .from('users')
      .insert({
        email: adminEmail,
        name: adminName,
        password: hashedPassword,
        role: 'admin',
        permissions: ['*'], // Todas as permissões
        camera_access: [], // Acesso a todas as câmeras por ser admin
        active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (createError) {
      throw new Error(`Erro ao criar usuário admin: ${createError.message}`);
    }
    
    logger.info(`✅ Usuário administrador criado com sucesso!`);
    logger.info(`📧 Email: ${adminEmail}`);
    logger.info(`🔑 Senha: ${adminPassword}`);
    logger.info(`👤 Nome: ${adminName}`);
    logger.info(`🛡️ Role: admin`);
    
    return newUser;
    
  } catch (error) {
    logger.error('❌ Erro ao criar usuário administrador:', error);
    throw error;
  }
}

/**
 * Função principal
 */
async function main() {
  try {
    await createAdminUser();
    logger.info('🎉 Processo concluído com sucesso!');
    process.exit(0);
  } catch (error) {
    logger.error('💥 Falha no processo:', error);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { createAdminUser };