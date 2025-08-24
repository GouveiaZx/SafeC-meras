import S3Service from './backend/src/services/S3Service.js';

console.log('🧪 Testando conectividade S3 com região us-east-2...');
console.log('🌍 Região configurada:', S3Service.region);
console.log('📦 Bucket:', S3Service.bucketName);

try {
  const result = await S3Service.testConnection();
  console.log('✅ Teste de conectividade S3 bem-sucedido!', result);
} catch (error) {
  console.error('❌ Erro na conectividade S3:', error.name);
  if (error.$metadata) {
    console.error('📊 Status HTTP:', error.$metadata.httpStatusCode);
    console.error('🔍 Request ID:', error.$metadata.requestId);
  }
  console.error('💬 Mensagem:', error.message);
  
  // Vamos tentar listar buckets para diagnóstico
  console.log('\n🔍 Tentando listar buckets para diagnóstico...');
  try {
    const buckets = await S3Service.listBuckets();
    console.log('📦 Buckets encontrados:', buckets);
  } catch (listError) {
    console.error('❌ Erro ao listar buckets:', listError.message);
  }
}