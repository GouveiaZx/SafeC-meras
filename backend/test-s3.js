import S3Service from './src/services/S3Service.js';

async function testS3() {
  console.log('🔍 Testing S3/Wasabi Configuration...\n');
  
  // Check if S3 is configured
  console.log('S3 Service Configured:', S3Service.isConfigured);
  console.log('Bucket Name:', S3Service.bucketName);
  console.log('Region:', S3Service.region);
  console.log('Endpoint:', process.env.WASABI_ENDPOINT || 'Not set');
  
  if (!S3Service.isConfigured) {
    console.log('\n❌ S3 Service is not configured!');
    console.log('Missing environment variables:');
    if (!process.env.WASABI_ACCESS_KEY) console.log('  - WASABI_ACCESS_KEY');
    if (!process.env.WASABI_SECRET_KEY) console.log('  - WASABI_SECRET_KEY');
    if (!process.env.WASABI_BUCKET) console.log('  - WASABI_BUCKET');
    return;
  }
  
  // Try to list files to test connection
  try {
    console.log('\n📋 Testing S3 connection by listing files...');
    const result = await S3Service.listFiles('', 5);
    console.log('✅ S3 connection successful!');
    console.log('Files in bucket:', result.files.length);
    if (result.files.length > 0) {
      console.log('Sample files:');
      result.files.forEach(file => {
        console.log(`  - ${file.Key} (${Math.round(file.Size / 1024)} KB)`);
      });
    }
  } catch (error) {
    console.log('\n❌ S3 Connection Failed!');
    console.log('Error:', error.message);
    console.log('Error Code:', error.Code || error.name);
  }
}

testS3();
