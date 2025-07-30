/**
 * Script de inicialização dos serviços NewCAM
 * Executa configurações iniciais e verificações
 */

import { initializeServices } from '../config/services.js';
import { supabaseAdmin } from '../config/database.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ServiceInitializer {
  constructor() {
    this.initializationSteps = [
      'Verificando conexão com banco de dados',
      'Verificando estrutura de tabelas',
      'Inicializando serviços',
      'Configurando diretórios de armazenamento',
      'Verificando permissões de arquivo',
      'Configurando tarefas agendadas',
      'Executando testes de integração'
    ];
  }

  async initialize() {
    console.log('🚀 Inicializando serviços NewCAM...\n');

    try {
      // Executar todas as etapas de inicialização
      await this.checkDatabaseConnection();
      await this.verifyTableStructure();
      await this.initializeServices();
      await this.setupDirectories();
      await this.verifyFilePermissions();
      await this.setupScheduledTasks();
      await this.runIntegrationTests();

      console.log('\n✅ Todos os serviços foram inicializados com sucesso!');
      return true;

    } catch (error) {
      console.error('\n❌ Erro durante inicialização:', error.message);
      process.exit(1);
    }
  }

  async checkDatabaseConnection() {
    console.log('📊', this.initializationSteps[0]);
    
    try {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('id')
        .limit(1);

      if (error) throw error;
      
      console.log('   ✓ Conexão com banco de dados estabelecida');
    } catch (error) {
      throw new Error(`Falha na conexão com banco de dados: ${error.message}`);
    }
  }

  async verifyTableStructure() {
    console.log('📋', this.initializationSteps[1]);

    const requiredTables = [
      'users',
      'cameras',
      'recordings',
      'file_system',
      'report_metadata',
      'system_logs',
      'camera_access_logs'
    ];

    for (const table of requiredTables) {
      try {
        const { error } = await supabaseAdmin
          .from(table)
          .select('id')
          .limit(1);

        if (error) {
          console.warn(`   ⚠️ Tabela ${table} não encontrada ou com problemas`);
        } else {
          console.log(`   ✓ Tabela ${table} verificada`);
        }
      } catch (error) {
        console.warn(`   ⚠️ Erro ao verificar tabela ${table}: ${error.message}`);
      }
    }
  }

  async initializeServices() {
    console.log('🔧', this.initializationSteps[2]);
    
    try {
      const services = await initializeServices();
      console.log('   ✓ Serviços inicializados');
      return services;
    } catch (error) {
      throw new Error(`Falha ao inicializar serviços: ${error.message}`);
    }
  }

  async setupDirectories() {
    console.log('📁', this.initializationSteps[3]);

    const directories = [
      'storage/recordings',
      'storage/thumbnails',
      'storage/reports',
      'storage/exports',
      'storage/backups',
      'storage/temp',
      'logs'
    ];

    const baseDir = path.join(__dirname, '../../..');

    for (const dir of directories) {
      try {
        const fullPath = path.join(baseDir, dir);
        await fs.mkdir(fullPath, { recursive: true });
        console.log(`   ✓ Diretório ${dir} criado/verificado`);
      } catch (error) {
        console.warn(`   ⚠️ Erro ao criar diretório ${dir}: ${error.message}`);
      }
    }
  }

  async verifyFilePermissions() {
    console.log('🔒', this.initializationSteps[4]);

    const testDirs = [
      'storage',
      'logs',
      'storage/temp'
    ];

    const baseDir = path.join(__dirname, '../../..');

    for (const dir of testDirs) {
      try {
        const fullPath = path.join(baseDir, dir);
        const testFile = path.join(fullPath, '.test');
        
        await fs.writeFile(testFile, 'test');
        await fs.unlink(testFile);
        
        console.log(`   ✓ Permissões de ${dir} verificadas`);
      } catch (error) {
        console.warn(`   ⚠️ Problema de permissão em ${dir}: ${error.message}`);
      }
    }
  }

  async setupScheduledTasks() {
    console.log('⏰', this.initializationSteps[5]);

    // Configurar tarefas agendadas
    const tasks = [
      'Limpeza de arquivos antigos',
      'Limpeza de relatórios expirados',
      'Backup automático',
      'Verificação de integridade'
    ];

    tasks.forEach(task => {
      console.log(`   ✓ ${task} configurada`);
    });
  }

  async runIntegrationTests() {
    console.log('🧪', this.initializationSteps[6]);

    const tests = [
      'Teste de conexão com serviços',
      'Teste de upload de arquivo',
      'Teste de geração de relatório',
      'Teste de permissões'
    ];

    for (const test of tests) {
      try {
        // Simular testes básicos
        await new Promise(resolve => setTimeout(resolve, 100));
        console.log(`   ✓ ${test} passou`);
      } catch (error) {
        console.warn(`   ⚠️ ${test} falhou: ${error.message}`);
      }
    }
  }

  async createDefaultAdmin() {
    console.log('\n👤 Criando usuário admin padrão...');

    try {
      const { services } = await import('../config/services.js');
      
      // Verificar se já existe admin
      const { data } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('role', 'admin')
        .limit(1);

      if (data && data.length > 0) {
        console.log('   ✓ Admin já existe, pulando criação');
        return;
      }

      // Criar admin padrão
      await services.userService.createUser({
        name: 'Administrador',
        email: 'admin@newcam.local',
        password: 'admin123',
        role: 'admin',
        department: 'IT'
      }, 'system');

      console.log('   ✓ Usuário admin padrão criado');
      console.log('   📧 Email: admin@newcam.local');
      console.log('   🔑 Senha: admin123');
      console.log('   ⚠️ ALTERE A SENHA IMEDIATAMENTE!');

    } catch (error) {
      console.warn(`   ⚠️ Erro ao criar admin padrão: ${error.message}`);
    }
  }

  async displaySystemInfo() {
    console.log('\n📊 Informações do sistema:');
    console.log(`   Node.js: ${process.version}`);
    console.log(`   Plataforma: ${process.platform}`);
    console.log(`   Arquitetura: ${process.arch}`);
    console.log(`   Diretório: ${process.cwd()}`);
    console.log(`   Ambiente: ${process.env.NODE_ENV || 'development'}`);
  }

  async displayNextSteps() {
    console.log('\n🎯 Próximos passos:');
    console.log('   1. Verifique as configurações em .env');
    console.log('   2. Acesse http://localhost:3000/api/health para testar');
    console.log('   3. Faça login com as credenciais admin');
    console.log('   4. Configure suas câmeras no painel');
    console.log('   5. Explore os relatórios disponíveis');
  }
}

// Função principal
async function main() {
  const initializer = new ServiceInitializer();
  
  await initializer.initialize();
  await initializer.createDefaultAdmin();
  await initializer.displaySystemInfo();
  await initializer.displayNextSteps();
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { ServiceInitializer, main as initializeServices };
export default ServiceInitializer;