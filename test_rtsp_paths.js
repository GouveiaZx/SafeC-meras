const net = require('net');
const { URL } = require('url');

// Caminhos RTSP comuns para diferentes fabricantes de câmeras
const commonRTSPPaths = [
  // Caminhos originais
  '/h264/ch4/main/av_stream',
  '/h264/ch4/sub/av_stream',
  
  // Caminhos genéricos comuns
  '/cam/realmonitor?channel=1&subtype=0',
  '/cam/realmonitor?channel=1&subtype=1',
  '/cam/realmonitor?channel=4&subtype=0',
  '/cam/realmonitor?channel=4&subtype=1',
  
  // Hikvision
  '/Streaming/Channels/101',
  '/Streaming/Channels/102',
  '/Streaming/Channels/401',
  '/Streaming/Channels/402',
  
  // Dahua
  '/cam/realmonitor?channel=1&subtype=0&unicast=true&proto=Onvif',
  '/cam/realmonitor?channel=4&subtype=0&unicast=true&proto=Onvif',
  
  // Axis
  '/axis-media/media.amp',
  '/axis-media/media.amp?camera=1',
  '/axis-media/media.amp?camera=4',
  
  // Foscam
  '/videoMain',
  '/videoSub',
  
  // Genéricos
  '/live',
  '/live/1',
  '/live/4',
  '/stream1',
  '/stream2',
  '/video1',
  '/video2',
  '/ch1',
  '/ch4',
  '/channel1',
  '/channel4',
  
  // Sem caminho (root)
  '/',
  '',
  
  // Outros formatos H.264
  '/h264/ch1/main/av_stream',
  '/h264/ch1/sub/av_stream',
  '/h264Preview_01_main',
  '/h264Preview_01_sub',
  '/h264Preview_04_main',
  '/h264Preview_04_sub'
];

async function testRTSPPaths() {
  const baseUrl = 'rtsp://visualizar:infotec5384@170.245.45.10:37777';
  const host = '170.245.45.10';
  const port = 37777;
  const username = 'visualizar';
  const password = 'infotec5384';
  
  console.log('🔍 Testando diferentes caminhos RTSP...');
  console.log(`📡 Base URL: ${baseUrl}`);
  console.log(`📊 Total de caminhos a testar: ${commonRTSPPaths.length}`);
  
  const results = [];
  
  for (let i = 0; i < commonRTSPPaths.length; i++) {
    const path = commonRTSPPaths[i];
    const fullUrl = `${baseUrl}${path}`;
    
    console.log(`\n[${i + 1}/${commonRTSPPaths.length}] Testando: ${path || '(root)'}`);
    
    try {
      const result = await testRTSPPath(host, port, path, username, password);
      results.push({ path, ...result });
      
      if (result.success) {
        console.log(`   ✅ SUCESSO! Código: ${result.response_code}`);
        console.log(`   📊 Latência: ${result.latency}ms`);
        console.log(`   💬 Mensagem: ${result.message}`);
      } else {
        console.log(`   ❌ Falha: ${result.message} (${result.response_code || 'N/A'})`);
      }
    } catch (error) {
      console.log(`   💥 Erro: ${error.message}`);
      results.push({ path, success: false, error: error.message });
    }
    
    // Pequena pausa entre testes para não sobrecarregar a câmera
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Resumo dos resultados
  console.log('\n' + '='.repeat(60));
  console.log('📋 RESUMO DOS RESULTADOS:');
  console.log('='.repeat(60));
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`\n✅ Caminhos que funcionaram (${successful.length}):`);
  if (successful.length === 0) {
    console.log('   Nenhum caminho funcionou.');
  } else {
    successful.forEach((result, index) => {
      console.log(`   ${index + 1}. ${result.path || '(root)'} - ${result.response_code} (${result.latency}ms)`);
    });
  }
  
  console.log(`\n❌ Caminhos que falharam (${failed.length}):`);
  const failuresByCode = {};
  failed.forEach(result => {
    const code = result.response_code || result.error || 'unknown';
    if (!failuresByCode[code]) {
      failuresByCode[code] = [];
    }
    failuresByCode[code].push(result.path || '(root)');
  });
  
  Object.entries(failuresByCode).forEach(([code, paths]) => {
    console.log(`   ${code}: ${paths.length} caminhos`);
    if (paths.length <= 5) {
      paths.forEach(path => console.log(`     - ${path}`));
    } else {
      paths.slice(0, 3).forEach(path => console.log(`     - ${path}`));
      console.log(`     ... e mais ${paths.length - 3} caminhos`);
    }
  });
  
  // Recomendações
  console.log('\n💡 RECOMENDAÇÕES:');
  if (successful.length > 0) {
    console.log(`   Use um dos caminhos que funcionaram acima.`);
    console.log(`   Recomendado: ${successful[0].path || '(root)'}`);
  } else {
    console.log('   1. Verifique se a câmera suporta RTSP na porta 37777');
    console.log('   2. Consulte o manual da câmera para o caminho correto');
    console.log('   3. Tente acessar a interface web da câmera em http://170.245.45.10');
    console.log('   4. Verifique se as credenciais estão corretas');
    console.log('   5. Considere usar uma porta RTSP padrão (554)');
  }
}

function testRTSPPath(host, port, path, username, password, timeout = 8000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();
    let responseReceived = false;
    let authAttempted = false;
    
    const timer = setTimeout(() => {
      if (!responseReceived) {
        socket.destroy();
        resolve({
          success: false,
          latency: Date.now() - startTime,
          message: `Timeout após ${timeout}ms`,
          response_code: 'TIMEOUT'
        });
      }
    }, timeout);
    
    const sendRequest = (withAuth = false) => {
      let request = `OPTIONS ${path || '/'} RTSP/1.0\r\n`;
      request += `CSeq: 1\r\n`;
      request += `User-Agent: NewCAM-PathTest/1.0\r\n`;
      
      if (withAuth && username && password) {
        const auth = Buffer.from(`${username}:${password}`).toString('base64');
        request += `Authorization: Basic ${auth}\r\n`;
      }
      
      request += `\r\n`;
      socket.write(request);
    };
    
    socket.connect(port, host, () => {
      sendRequest();
    });
    
    socket.on('data', (data) => {
      if (!responseReceived) {
        const response = data.toString();
        const latency = Date.now() - startTime;
        
        if (response.includes('RTSP/1.0 200 OK')) {
          responseReceived = true;
          clearTimeout(timer);
          socket.destroy();
          resolve({
            success: true,
            latency,
            message: `Stream RTSP encontrado!`,
            response_code: '200',
            authenticated: authAttempted
          });
        } else if (response.includes('RTSP/1.0 401') && !authAttempted && username && password) {
          authAttempted = true;
          sendRequest(true);
        } else if (response.includes('RTSP/1.0')) {
          const statusMatch = response.match(/RTSP\/1\.0 (\d+)/);
          const statusCode = statusMatch ? statusMatch[1] : 'unknown';
          
          responseReceived = true;
          clearTimeout(timer);
          socket.destroy();
          
          resolve({
            success: statusCode.startsWith('2'),
            latency,
            message: statusCode.startsWith('2') ? 'Stream encontrado!' : `Erro ${statusCode}`,
            response_code: statusCode,
            response: response.substring(0, 100)
          });
        }
      }
    });
    
    socket.on('error', (error) => {
      if (!responseReceived) {
        responseReceived = true;
        clearTimeout(timer);
        resolve({
          success: false,
          latency: Date.now() - startTime,
          message: `Erro de conexão: ${error.message}`,
          response_code: 'ERROR'
        });
      }
    });
  });
}

testRTSPPaths().catch(console.error);