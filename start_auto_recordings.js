import { default as recordingService } from './backend/src/services/RecordingService.js';

async function startAutoRecordings() {
  console.log('🎬 Iniciando gravações automáticas...');
  
  const cameras = [
    'bd02962c-a136-4afb-a140-59463ec58d69', // Câmera 170.245.45.10
    '15d899b1-2a41-4d9d-8bfc-1497d534143f'  // Cam rt
  ];
  
  for (const cameraId of cameras) {
    try {
      console.log(`\n📹 Iniciando gravação para câmera: ${cameraId}`);
      const result = await recordingService.startRecording(cameraId);
      console.log(`✅ Resultado:`, result);
    } catch (error) {
      console.error(`❌ Erro para câmera ${cameraId}:`, error.message);
    }
  }
  
  console.log('\n🎯 Processo de inicialização concluído');
  process.exit(0);
}

startAutoRecordings().catch(console.error);