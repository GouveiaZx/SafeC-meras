const net = require('net');
const { URL } = require('url');

async function testRTSPConnectivity() {
  const rtspUrl = 'rtsp://visualizar:infotec5384@170.245.45.10:37777/h264/ch4/main/av_stream';
  
  console.log('🔍 Testando conectividade RTSP...');
  console.log(`📡 URL: ${rtspUrl}`);
  
  try {
    // Parse da URL
    const url = new URL(rtspUrl);
    const host = url.hostname;
    const port = parseInt(url.port) || 554;
    const username = url.username;
    const password = url.password;
    const path = url.pathname + (url.search || '');
    
    console.log(`\n📊 Detalhes da conexão:`);
    console.log(`   Host: ${host}`);
    console.log(`   Porta: ${port}`);
    console.log(`   Usuário: ${username}`);
    console.log(`   Senha: ${password ? '***' : 'Não definida'}`);
    console.log(`   Caminho: ${path}`);
    
    // Teste 1: Conectividade TCP básica
    console.log('\n🔌 Teste 1: Conectividade TCP básica...');
    const tcpResult = await testTCPConnection(host, port);
    console.log(`   Resultado: ${tcpResult.success ? '✅ Sucesso' : '❌ Falha'}`);
    console.log(`   Latência: ${tcpResult.latency}ms`);
    console.log(`   Mensagem: ${tcpResult.message}`);
    
    if (!tcpResult.success) {
      console.log('\n❌ Conexão TCP falhou. Verifique:');
      console.log('   - Se o IP está correto');
      console.log('   - Se a porta está aberta');
      console.log('   - Se há firewall bloqueando');
      console.log('   - Se a câmera está ligada e na rede');
      return;
    }
    
    // Teste 2: Handshake RTSP
    console.log('\n📹 Teste 2: Handshake RTSP...');
    const rtspResult = await testRTSPHandshake(host, port, path, username, password);
    console.log(`   Resultado: ${rtspResult.success ? '✅ Sucesso' : '❌ Falha'}`);
    console.log(`   Latência: ${rtspResult.latency}ms`);
    console.log(`   Mensagem: ${rtspResult.message}`);
    
    if (rtspResult.response_code) {
      console.log(`   Código de resposta: ${rtspResult.response_code}`);
    }
    
    if (rtspResult.needs_auth) {
      console.log('\n🔐 A câmera requer autenticação.');
      console.log('   Verifique se as credenciais estão corretas.');
    }
    
    if (rtspResult.response) {
      console.log(`   Resposta do servidor: ${rtspResult.response}`);
    }
    
    // Teste 3: Verificar se o ZLMediaKit está rodando
    console.log('\n🎬 Teste 3: Verificando ZLMediaKit...');
    const zlmResult = await testZLMediaKit();
    console.log(`   Resultado: ${zlmResult.success ? '✅ Sucesso' : '❌ Falha'}`);
    console.log(`   Mensagem: ${zlmResult.message}`);
    
    // Resumo final
    console.log('\n📋 RESUMO DOS TESTES:');
    console.log(`   TCP: ${tcpResult.success ? '✅' : '❌'}`);
    console.log(`   RTSP: ${rtspResult.success ? '✅' : '❌'}`);
    console.log(`   ZLMediaKit: ${zlmResult.success ? '✅' : '❌'}`);
    
    if (tcpResult.success && rtspResult.success && zlmResult.success) {
      console.log('\n🎉 Todos os testes passaram! O problema pode estar na configuração do stream.');
    } else {
      console.log('\n⚠️  Alguns testes falharam. Verifique os problemas identificados acima.');
    }
    
  } catch (error) {
    console.error('❌ Erro geral no teste:', error.message);
  }
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

function testRTSPHandshake(host, port, path, username, password, timeout = 10000) {
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
          message: `Timeout RTSP após ${timeout}ms`
        });
      }
    }, timeout);
    
    const sendRequest = (withAuth = false) => {
      let request = `OPTIONS ${path} RTSP/1.0\r\n`;
      request += `CSeq: 1\r\n`;
      request += `User-Agent: NewCAM-Test/1.0\r\n`;
      
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
            message: `Stream RTSP disponível (${latency}ms)`,
            response_code: '200',
            authenticated: authAttempted
          });
        } else if (response.includes('RTSP/1.0 401') && !authAttempted && username && password) {
          authAttempted = true;
          sendRequest(true);
        } else if (response.includes('RTSP/1.0 401')) {
          responseReceived = true;
          clearTimeout(timer);
          socket.destroy();
          resolve({
            success: false,
            latency,
            message: 'Credenciais RTSP inválidas ou autenticação necessária',
            response_code: '401',
            needs_auth: true
          });
        } else if (response.includes('RTSP/1.0')) {
          const statusMatch = response.match(/RTSP\/1\.0 (\d+)/);
          const statusCode = statusMatch ? statusMatch[1] : 'unknown';
          
          responseReceived = true;
          clearTimeout(timer);
          socket.destroy();
          
          resolve({
            success: statusCode.startsWith('2'),
            latency,
            message: `Resposta RTSP: código ${statusCode}`,
            response_code: statusCode,
            response: response.substring(0, 200)
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
          message: `Erro RTSP: ${error.message}`
        });
      }
    });
  });
}

async function testZLMediaKit() {
  try {
    const axios = require('axios');
    const zlmApiUrl = process.env.ZLM_API_URL || 'http://localhost:9902/index/api';
    const zlmSecret = process.env.ZLM_SECRET || '9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK';
    
    const response = await axios.get(`${zlmApiUrl}/getServerConfig?secret=${zlmSecret}`, {
      timeout: 5000
    });
    
    return {
      success: true,
      message: `ZLMediaKit respondendo (status: ${response.status})`
    };
  } catch (error) {
    return {
      success: false,
      message: `ZLMediaKit não acessível: ${error.message}`
    };
  }
}

testRTSPConnectivity();