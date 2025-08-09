import { createModuleLogger } from './backend/src/config/logger.js';
import UnifiedStreamingService from './backend/src/services/UnifiedStreamingService.js';

const logger = createModuleLogger('TestStreamingInit');

async function testStreamingInit() {
  console.log('🔧 Testando inicialização do UnifiedStreamingService...');
  
  try {
    // Usar a instância singleton
    const streamingService = UnifiedStreamingService;
    
    console.log('✅ Instância obtida com sucesso');
    console.log('🔧 Configurações:', {
      srsApiUrl: streamingService.srsApiUrl,
      zlmApiUrl: streamingService.zlmApiUrl,
      zlmSecret: streamingService.zlmSecret ? 'CONFIGURADO' : 'NÃO CONFIGURADO',
      preferredServer: streamingService.preferredServer
    });
    
    // Testar conectividade
    console.log('🔧 Testando conectividade...');
    const connectivityResult = await streamingService.testConnectivity();
    
    console.log('✅ Teste de conectividade bem-sucedido:', connectivityResult);
    
    // Tentar inicializar
    console.log('🔧 Inicializando serviço...');
    await streamingService.init();
    
    console.log('✅ Serviço inicializado com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro durante o teste:', error.message);
    console.error('📄 Stack trace:', error.stack);
  }
}

testStreamingInit()