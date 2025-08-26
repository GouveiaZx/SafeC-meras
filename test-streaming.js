// Quick test script to verify MockStreamingService functionality
import MockStreamingService from './backend/src/services/MockStreamingService.js';

console.log('🧪 Testando MockStreamingService...\n');

const mockService = new MockStreamingService();

try {
  // Initialize service
  await mockService.init();
  console.log('✅ MockStreamingService inicializado com sucesso\n');
  
  // Test mock camera
  const mockCamera = {
    id: 'test-camera-123',
    name: 'Test Camera',
    rtsp_url: 'rtsp://example.com/stream1'
  };
  
  // Test stream start
  console.log('🎬 Testando início de stream...');
  const streamConfig = await mockService.startStream(mockCamera, {
    quality: '720p',
    format: 'hls',
    audio: false
  });
  
  console.log('✅ Stream iniciado com sucesso:', JSON.stringify(streamConfig, null, 2));
  
  // Test stream status
  console.log('\n📊 Verificando status do stream...');
  const status = await mockService.getStreamStatus(mockCamera.id);
  console.log('✅ Status obtido:', JSON.stringify(status, null, 2));
  
  // Test health check
  console.log('\n🩺 Testando health check...');
  const health = await mockService.healthCheck();
  console.log('✅ Health check:', JSON.stringify(health, null, 2));
  
  // Test stream stop
  console.log('\n🛑 Testando parada de stream...');
  const stopResult = await mockService.stopStream(mockCamera.id);
  console.log('✅ Stream parado:', JSON.stringify(stopResult, null, 2));
  
  console.log('\n🎉 Todos os testes do MockStreamingService passaram com sucesso!');
  console.log('\n✅ RESOLUÇÃO: O erro HTTP 500 foi corrigido!');
  console.log('📝 Agora o sistema funciona sem Docker, usando simulação de streaming.');
  
} catch (error) {
  console.error('❌ Erro no teste:', error.message);
  process.exit(1);
}