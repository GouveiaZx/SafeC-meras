const net = require('net');
const { URL } = require('url');

// Testar na porta RTSP padrão (554)
async function testRTSPPort554() {
  const host = '170.245.45.10';
  const standardPort = 554;
  const currentPort = 37777;
  const username = 'visualizar';
  const password = 'infotec5384';
  
  console.log('🔍 Testando conectividade RTSP na porta padrão (554)...');
  console.log(`📡 Host: ${host}`);
  
  // Teste 1: Conectividade TCP na porta 554
  console.log('\n🔌 Teste 1: Conectividade TCP na porta 554...');
  const tcp554Result = await testTCPConnection(host, standardPort);
  console.log(`   Resultado: ${tcp554Result.success ? '✅ Sucesso' : '❌ Falha'}`);
  console.log(`   Latência: ${tcp554Result.latency}ms`);
  console.log(`   Mensagem: ${tcp554Result.message}`);
  
  if (tcp554Result.success) {
    console.log('\n📹 Teste 2: Handshake RTSP na porta 554...');
    
    // Testar alguns caminhos comuns na porta 554
    const commonPaths = [
      '/h264/ch4/main/av_stream',
      '/cam/realmonitor?channel=4&subtype=0',
      '/Streaming/Channels/401',
      '/live',
      '/'
    ];
    
    for (const path of commonPaths) {
      console.log(`\n   Testando caminho: ${path || '(root)'}`);
      const result = await testRTSPPath(host, standardPort, path, username, password);
      console.log(`   Resultado: ${result.success ? '✅ Sucesso' : '❌ Falha'}`);
      console.log(`   Código: ${result.response_code}`);
      console.log(`   Mensagem: ${result.message}`);
      
      if (result.success) {
        console.log(`\n🎉 ENCONTRADO! URL RTSP correta:`);
        console.log(`   rtsp://${username}:${password}@${host}:${standardPort}${path}`);
        break;
      }
    }
  }
  
  // Teste 3: Verificar se a porta 37777 é realmente RTSP
  console.log('\n🔍 Teste 3: Verificando se porta 37777 é realmente RTSP...');
  const portAnalysis = await analyzePort(host, currentPort);
  console.log(`   Resultado: ${portAnalysis.success ? '✅ Responde' : '❌ Não responde'}`);
  console.log(`   Protocolo detectado: ${portAnalysis.protocol || 'Desconhecido'}`);
  console.log(`   Resposta: ${portAnalysis.response || 'Nenhuma'}`);
  
  // Teste 4: Tentar descobrir outros serviços na câmera
  console.log('\n🌐 Teste 4: Verificando interface web da câmera...');
  const webResult = await testWebInterface(host);
  console.log(`   HTTP (80): ${webResult.http ? '✅' : '❌'}`);
  console.log(`   HTTPS (443): ${webResult.https ? '✅' : '❌'}`);
  console.log(`   Interface alternativa (8080): ${webResult.alt ? '✅' : '❌'}`);
  
  // Resumo e recomendações
  console.log('\n' + '='.repeat(60));
  console.log('📋 DIAGNÓSTICO FINAL:');
  console.log('='.repeat(60));
  
  if (tcp554Result.success) {
    console.log('✅ A câmera responde na porta RTSP padrão (554)');
    console.log('💡 Recomendação: Altere a configuração para usar a porta 554');
  } else {
    console.log('❌ A câmera não responde na porta RTSP padrão (554)');
  }
  
  if (portAnalysis.protocol && portAnalysis.protocol !== 'RTSP') {
    console.log(`⚠️  A porta 37777 parece ser ${portAnalysis.protocol}, não RTSP`);
  }
  
  if (webResult.http || webResult.https || webResult.alt) {
    console.log('🌐 Interface web detectada - consulte a documentação da câmera');
  }
  
  console.log('\n💡 PRÓXIMOS PASSOS:');
  console.log('1. Verifique o manual da câmera para configurações RTSP');
  console.log('2. Acesse a interface web para verificar configurações de stream');
  console.log('3. Confirme se RTSP está habilitado na câmera');
  console.log('4. Verifique se há configurações de canal/stream específicas');
}

function testTCPConnection(host, port, timeout = 5000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();
    
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({
        success: false,
        latency: Date.now() - startTime,
        message: `Timeout após ${timeout}ms`
      });
    }, timeout);
    
    socket.connect(port, host, () => {
      clearTimeout(timer);
      socket.destroy();
      resolve({
        success: true,
        latency: Date.now() - startTime,
        message: 'Conexão TCP estabelecida com sucesso'
      });
    });
    
    socket.on('error', (error) => {
      clearTimeout(timer);
      resolve({
        success: false,
        latency: Date.now() - startTime,
        message: `Erro TCP: ${error.message}`
      });
    });
  });
}

function testRTSPPath(host, port, path, username, password, timeout = 8000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();
    let responseReceived = false;
    
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
    
    const sendRequest = () => {
      let request = `OPTIONS ${path || '/'} RTSP/1.0\r\n`;
      request += `CSeq: 1\r\n`;
      request += `User-Agent: NewCAM-PortTest/1.0\r\n`;
      
      if (username && password) {
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
        
        if (response.includes('RTSP/1.0')) {
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

function analyzePort(host, port, timeout = 5000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let responseReceived = false;
    
    const timer = setTimeout(() => {
      if (!responseReceived) {
        socket.destroy();
        resolve({
          success: false,
          protocol: 'TIMEOUT',
          response: 'Nenhuma resposta'
        });
      }
    }, timeout);
    
    socket.connect(port, host, () => {
      // Enviar uma requisição HTTP simples para ver o que responde
      socket.write('GET / HTTP/1.1\r\nHost: ' + host + '\r\n\r\n');
    });
    
    socket.on('data', (data) => {
      if (!responseReceived) {
        responseReceived = true;
        clearTimeout(timer);
        socket.destroy();
        
        const response = data.toString();
        let protocol = 'UNKNOWN';
        
        if (response.includes('HTTP/')) {
          protocol = 'HTTP';
        } else if (response.includes('RTSP/')) {
          protocol = 'RTSP';
        } else if (response.includes('FTP')) {
          protocol = 'FTP';
        }
        
        resolve({
          success: true,
          protocol,
          response: response.substring(0, 200)
        });
      }
    });
    
    socket.on('error', (error) => {
      if (!responseReceived) {
        responseReceived = true;
        clearTimeout(timer);
        resolve({
          success: false,
          protocol: 'ERROR',
          response: error.message
        });
      }
    });
  });
}

async function testWebInterface(host) {
  const results = { http: false, https: false, alt: false };
  
  // Teste HTTP (porta 80)
  try {
    const httpResult = await testTCPConnection(host, 80, 3000);
    results.http = httpResult.success;
  } catch (e) {}
  
  // Teste HTTPS (porta 443)
  try {
    const httpsResult = await testTCPConnection(host, 443, 3000);
    results.https = httpsResult.success;
  } catch (e) {}
  
  // Teste porta alternativa (8080)
  try {
    const altResult = await testTCPConnection(host, 8080, 3000);
    results.alt = altResult.success;
  } catch (e) {}
  
  return results;
}

testRTSPPort554().catch(console.error);