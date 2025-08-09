import fetch from 'node-fetch';

async function testWebhookSimple() {
  try {
    console.log('🧪 Testando webhook simples...');
    
    const response = await fetch('http://localhost:3002/api/webhooks/on_record_mp4', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        file_name: 'test-simple.mp4',
        file_size: 1000,
        time_len: 10,
        file_path: 'live/test/test-simple.mp4',
        stream: 'e4c3adb3-bc1a-4ed6-a92d-cb5f23a27e36',
        start_time: Math.floor(Date.now() / 1000),
        folder: 'live/test',
        url: 'record/live/test/test-simple.mp4',
        app: 'live'
      })
    });
    
    console.log('📊 Status da resposta:', response.status);
    console.log('📊 Headers da resposta:', Object.fromEntries(response.headers));
    
    const result = await response.text();
    console.log('📊 Resposta do webhook:', result);
    
  } catch (error) {
    console.error('❌ Erro no teste:', error);
  }
}

testWebhookSimple();