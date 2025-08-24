import UploadQueueService from './backend/src/services/UploadQueueService.js';

console.log('🚀 Processando uploads da fila...');

// UploadQueueService já é uma instância, não precisa de new
const uploadQueue = UploadQueueService;
let processed = 0;

try {
  // Processar cada item da fila até que não haja mais nenhum
  while (true) {
    const recording = await uploadQueue.dequeue();
    
    if (!recording) {
      console.log('✅ Não há mais gravações na fila');
      break;
    }
    
    console.log(`📤 Processando: ${recording.filename || recording.id.substring(0, 8)}`);
    console.log(`   Path: ${recording.local_path}`);
    console.log(`   Upload Status: ${recording.upload_status}`);
    
    const result = await uploadQueue.processUpload(recording);
    processed++;
    
    if (result.success) {
      console.log(`✅ Upload bem-sucedido! S3 Key: ${result.s3_key}`);
    } else {
      console.log(`❌ Falha no upload: ${result.error}`);
      console.log(`   Will retry: ${result.will_retry}`);
    }
    
    console.log('---');
    
    // Processar apenas 2 por vez para não sobrecarregar
    if (processed >= 2) {
      console.log('⏸️ Processados 2 uploads. Parando para verificar resultado.');
      break;
    }
  }
  
  console.log(`🏁 Processamento concluído! Total processado: ${processed}`);
  
} catch (error) {
  console.error('❌ Erro durante processamento:', error.message);
}