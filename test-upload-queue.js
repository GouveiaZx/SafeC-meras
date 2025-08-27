import recordingService from './backend/src/services/RecordingService.js';

async function testUploadQueue() {
    console.log('🔄 Testando processamento da fila de upload...');
    
    try {
        const result = await recordingService.processUploadQueue();
        console.log('📤 Resultado do processamento:', result);
    } catch (error) {
        console.error('❌ Erro no processamento:', error.message);
    }
}

testUploadQueue();