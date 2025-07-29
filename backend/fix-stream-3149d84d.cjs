const https = require('https');
const http = require('http');

// Configurações
const API_BASE = 'http://localhost:3002';
const CAMERA_ID = '3149d84d-73a6-45f3-8dc0-74a07d6111ae';
const EMAIL = 'admin@example.com';
const PASSWORD = 'admin123';

// Função para fazer requisições HTTP
function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const client = API_BASE.startsWith('https') ? https : http;
    
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsedData = JSON.parse(data);
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: parsedData
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: data
          });
        }
      });
    });

    req.on('error', reject);

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function login() {
  console.log('Fazendo login...');
  const options = {
    hostname: 'localhost',
    port: 3002,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  const response = await makeRequest(options, { email: EMAIL, password: PASSWORD });
  
  if (response.statusCode === 200 && response.data.token) {
    console.log('✅ Login realizado com sucesso');
    return response.data.token;
  } else {
    throw new Error('Falha no login: ' + JSON.stringify(response.data));
  }
}

async function stopStream(token) {
  console.log('Parando stream existente...');
  const options = {
    hostname: 'localhost',
    port: 3002,
    path: `/api/streams/${CAMERA_ID}/stop`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };

  try {
    const response = await makeRequest(options);
    if (response.statusCode === 200) {
      console.log('✅ Stream parado com sucesso');
      return true;
    } else if (response.statusCode === 404) {
      console.log('ℹ️ Stream não encontrado (já parado ou não existe)');
      return true;
    } else {
      console.log('⚠️ Aviso ao parar stream:', response.data);
      return true; // Continua mesmo com erro
    }
  } catch (error) {
    console.log('⚠️ Erro ao parar stream:', error.message);
    return true; // Continua mesmo com erro
  }
}

async function startStream(token) {
  console.log('Iniciando novo stream...');
  const options = {
    hostname: 'localhost',
    port: 3002,
    path: `/api/streams/${CAMERA_ID}/start`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };

  const response = await makeRequest(options);
  
  if (response.statusCode === 200) {
    console.log('✅ Stream iniciado com sucesso!');
    console.log('📹 Detalhes:', JSON.stringify(response.data, null, 2));
    return response.data;
  } else {
    throw new Error('Erro ao iniciar stream: ' + JSON.stringify(response.data));
  }
}

async function checkActiveStreams(token) {
  console.log('Verificando streams ativos...');
  const options = {
    hostname: 'localhost',
    port: 3002,
    path: '/api/streams',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };

  try {
    const response = await makeRequest(options);
    if (response.statusCode === 200) {
      const activeStreams = response.data.streams || [];
      const cameraStream = activeStreams.find(s => s.camera_id === CAMERA_ID);
      
      if (cameraStream) {
        console.log('📊 Stream ativo encontrado:', cameraStream.id);
        return cameraStream;
      } else {
        console.log('ℹ️ Nenhum stream ativo encontrado para esta câmera');
        return null;
      }
    }
  } catch (error) {
    console.log('⚠️ Erro ao verificar streams:', error.message);
    return null;
  }
}

async function main() {
  console.log('🛠️ Iniciando correção do stream RTMP');
  console.log('=====================================');
  
  try {
    // 1. Fazer login
    const token = await login();
    
    // 2. Verificar streams ativos
    await checkActiveStreams(token);
    
    // 3. Parar stream existente
    await stopStream(token);
    
    // 4. Aguardar 1 segundo
    console.log('⏳ Aguardando...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 5. Iniciar novo stream
    await startStream(token);
    
    console.log('\n🎉 Correção concluída com sucesso!');
    console.log('Agora você pode testar o stream no frontend.');
    
  } catch (error) {
    console.error('\n❌ Erro:', error.message);
    console.log('\n💡 Soluções alternativas:');
    console.log('1. Verifique se o backend está rodando em http://localhost:3002');
    console.log('2. Verifique as credenciais de login');
    console.log('3. Reinicie o backend e tente novamente');
    console.log('4. Verifique os logs do backend para mais detalhes');
  }
}

// Executar o script
if (require.main === module) {
  main();
}

module.exports = { main };