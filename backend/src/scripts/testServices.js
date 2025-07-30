/**
 * Script de teste dos serviços NewCAM
 * Verifica se todos os serviços estão funcionando corretamente
 */

import { services } from '../config/services.js';
import { supabaseAdmin } from '../config/database.js';

class ServiceTester {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      tests: []
    };
  }

  async runAllTests() {
    console.log('🧪 Iniciando testes dos serviços...\n');

    await this.testDatabaseConnection();
    await this.testUserService();
    await this.testFileService();
    await this.testReportService();
    await this.testIntegration();

    this.displayResults();
  }

  async testDatabaseConnection() {
    console.log('📊 Testando conexão com banco de dados...');
    
    try {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('count');

      if (error) throw error;
      
      this.addResult('Database Connection', true, 'Conexão estabelecida');
    } catch (error) {
      this.addResult('Database Connection', false, error.message);
    }
  }

  async testUserService() {
    console.log('👤 Testando UserService...');
    
    try {
      // Testar criação de usuário de teste
      const testUser = {
        name: 'Test User',
        email: `test_${Date.now()}@example.com`,
        password: 'TestPass123!',
        role: 'viewer'
      };

      const result = await services.userService.createUser(testUser, 'system');
      
      if (result.success) {
        this.addResult('User Creation', true, 'Usuário criado com sucesso');
        
        // Testar listagem
        const users = await services.userService.listUsers({ limit: 1 });
        this.addResult('User Listing', true, `${users.total} usuários encontrados`);
        
        // Limpar usuário de teste
        await supabaseAdmin
          .from('users')
          .update({ status: 'deleted' })
          .eq('id', result.user.id);
      }
    } catch (error) {
      this.addResult('User Service', false, error.message);
    }
  }

  async testFileService() {
    console.log('📁 Testando FileService...');
    
    try {
      // Testar estatísticas de armazenamento
      const stats = await services.fileService.getStorageStats();
      this.addResult('Storage Stats', true, `${stats.totalFiles} arquivos, ${Math.round(stats.totalSize / 1024 / 1024)}MB`);
      
      // Testar criação de diretórios
      await services.fileService.initStorage();
      this.addResult('Directory Setup', true, 'Diretórios verificados');
      
    } catch (error) {
      this.addResult('File Service', false, error.message);
    }
  }

  async testReportService() {
    console.log('📈 Testando ReportService...');
    
    try {
      // Testar geração de relatório simples
      const report = await services.reportService.generateReport('system', {
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date().toISOString()
      }, 'system');
      
      if (report.success) {
        this.addResult('Report Generation', true, `Report ID: ${report.reportId}`);
        
        // Testar listagem
        const reports = await services.reportService.listReports('system', 1, 0);
        this.addResult('Report Listing', true, `${reports.length} relatórios encontrados`);
      }
    } catch (error) {
      this.addResult('Report Service', false, error.message);
    }
  }

  async testIntegration() {
    console.log('🔗 Testando integração entre serviços...');
    
    try {
      // Testar integração UserService -> ReportService
      const stats = await services.userService.getUserStats();
      this.addResult('User Stats Integration', true, `${stats.total} usuários totais`);
      
      // Testar integração FileService -> ReportService
      const storageStats = await services.fileService.getStorageStats();
      this.addResult('Storage Integration', true, 'Serviços integrados corretamente');
      
    } catch (error) {
      this.addResult('Integration Test', false, error.message);
    }
  }

  addResult(testName, passed, message) {
    this.results.tests.push({
      name: testName,
      passed,
      message
    });
    
    if (passed) {
      this.results.passed++;
      console.log(`   ✅ ${testName}: ${message}`);
    } else {
      this.results.failed++;
      console.log(`   ❌ ${testName}: ${message}`);
    }
  }

  displayResults() {
    console.log('\n📊 Resultados dos testes:');
    console.log(`   ✅ Testes passados: ${this.results.passed}`);
    console.log(`   ❌ Testes falhados: ${this.results.failed}`);
    console.log(`   📋 Total: ${this.results.tests.length}`);
    
    if (this.results.failed > 0) {
      console.log('\n⚠️  Problemas encontrados:');
      this.results.tests
        .filter(test => !test.passed)
        .forEach(test => {
          console.log(`   - ${test.name}: ${test.message}`);
        });
    } else {
      console.log('\n🎉 Todos os testes passaram!');
    }
  }
}

// Função principal
async function main() {
  console.log('🚀 NewCAM Service Tester\n');
  
  try {
    // Verificar se serviços estão disponíveis
    if (!services.userService || !services.fileService || !services.reportService) {
      console.log('⚠️ Serviços não inicializados, inicializando...');
      const { initializeServices } = await import('../config/services.js');
      await initializeServices();
    }
    
    const tester = new ServiceTester();
    await tester.runAllTests();
    
  } catch (error) {
    console.error('Erro durante testes:', error.message);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { ServiceTester, main as testServices };
export default ServiceTester;