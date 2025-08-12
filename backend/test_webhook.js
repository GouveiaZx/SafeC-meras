// Node 18+ possui fetch nativo - removido: import fetch from 'node-fetch';

// Teste do webhook on_stream_changed
async function testWebhook() {
  console.log('🧪 Testando webhook on_stream_changed...');
  
  const webhookData = {
    mediaServerId: 'test-server',
    app: 'live',
    stream: 'test-stream',
    regist: true,
    schema: 'rtsp',
    vhost: '__defaultVhost__',
    originType: 0,
    originTypeStr: 'unknown',
    createStamp: Date.now(),
    aliveSecond: 0,
    bytesSpeed: 0,
    readerCount: 0,
    totalReaderCount: 0
  };

  try {
    const response = await fetch('http://localhost:3002/api/webhooks/on_stream_changed', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ZLMediaKit(test)'
      },
      body: JSON.stringify(webhookData)
    });

    const result = await response.text();
    console.log(`📊 Status: ${response.status}`);
    console.log(`📝 Response: ${result}`);
    
    if (response.status === 200) {
      console.log('✅ Webhook está funcionando corretamente!');
    } else {
      console.log('❌ Webhook retornou erro');
    }
  } catch (error) {
    console.error('❌ Erro ao testar webhook:', error.message);
  }
}

testWebhook();