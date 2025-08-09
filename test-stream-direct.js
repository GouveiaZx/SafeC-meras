import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar variáveis de ambiente do backend
config({ path: path.join(__dirname, 'backend', '.env') });

async function testStreamDirect() {
  try {
    console.log('🔍 Testando startStream diretamente...');
    
    // Buscar câmeras diretamente do Supabase
    console.log('📋 Buscando câmeras disponíveis...');
    const { supabaseAdmin } = await import('./backend/src/config/database.js');
    
    const { data: cameras, error } = await supabaseAdmin
      .from('cameras')
      .select('*')
      .eq('active', true)
      .limit(1);
    
    if (error) {
      console.log('❌ Erro ao buscar câmeras:', error);
      return;
    }
    
    if (!cameras || cameras.length === 0) {
      console.log('⚠️ Nenhuma câmera encontrada no sistema');
      return;
    }
    
    console.log(`✅ Encontradas ${cameras.length} câmeras`);
    const testCamera = cameras[0];
    console.log(`🎯 Testando com câmera: ${testCamera.name} (ID: ${testCamera.id})`);
    
    // Importar o serviço de streaming
    const UnifiedStreamingService = (await import('./backend/src/services/UnifiedStreamingService.js')).default;
    
    // Tentar iniciar o stream diretamente
    console.log('🚀 Tentando iniciar stream...');
    
    try {
      const result = await UnifiedStreamingService.startStream(testCamera.id, {
        quality: 'high',
        protocol: 'hls'
      });
      
      console.log('✅ Stream iniciado com sucesso:', result);
    } catch (streamError) {
      console.log('❌ Erro ao iniciar stream:', {
        message: streamError.message,
        stack: streamError.stack,
        name: streamError.name,
        statusCode: streamError.statusCode
      });
      
      // Se for erro HTTP 500, vamos investigar mais
      if (streamError.statusCode === 500 || streamError.message.includes('500')) {
        console.log('🔍 ERRO HTTP 500 REPRODUZIDO! Investigando...');
        
        // Verificar se o serviço está inicializado
        console.log('🔧 Estado do UnifiedStreamingService:', {
          isInitialized: UnifiedStreamingService.isInitialized,
          preferredServer: UnifiedStreamingService.preferredServer,
          wsPort: UnifiedStreamingService.wsPort
        });
      }
    }
    
  } catch (error) {
    console.log('❌ Erro durante o teste:', {
      message: error.message,
      stack: error.stack
    });
  }
  
  console.log('🏁 Teste finalizado');
  process.exit(0);
}

testStreamDirect()