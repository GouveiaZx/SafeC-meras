import jwt from 'jsonwebtoken';
import http from 'http';

async function testStream() {
  console.log('🎬 Testando streaming de gravação...');
  
  try {
    // Gerar token JWT
    const token = jwt.sign(
      { 
        userId: '3e2ea6be-660c-4add-b89b-ce493df265b4', 
        email: 'admin@newcam.com', 
        role: 'admin' 
      }, 
      'newcam-dev-jwt-secret-key-2025-extended', 
      { expiresIn: '1h' }
    );
    
    console.log('✅ Token JWT gerado');
    
    // Testar streaming
    const recordingId = '37e13ad5-bbee-4368-b90b-b53c142a97bd'; // ID da gravação real para testar
    
    const options = {
      hostname: 'localhost',
      port: 3002,
      path: `/api/recordings/${recordingId}/stream`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      // HTTP não precisa de rejectUnauthorized
    };
    
    console.log(`🔗 Testando: http://localhost:3002${options.path}`);
    
    const req = http.request(options, (res) => {
      console.log(`📊 Status: ${res.statusCode}`);
      console.log(`📋 Headers:`, res.headers);
      
      if (res.statusCode === 200) {
        console.log('✅ Streaming funcionando!');
        let dataReceived = 0;
        
        res.on('data', (chunk) => {
          dataReceived += chunk.length;
          console.log(`📦 Dados recebidos: ${dataReceived} bytes`);
        });
        
        res.on('end', () => {
          console.log(`🏁 Stream finalizado. Total: ${dataReceived} bytes`);
        });
      } else {
        console.log('❌ Erro no streaming');
        let errorData = '';
        res.on('data', (chunk) => {
          errorData += chunk.toString();
        });
        res.on('end', () => {
          console.log('Resposta de erro:', errorData);
        });
      }
    });
    
    req.on('error', (e) => {
      console.error('❌ Erro na requisição:', e.message);
      console.error('Código do erro:', e.code);
    });
    
    req.setTimeout(10000, () => {
      console.log('⏰ Timeout da requisição');
      req.destroy();
    });
    
    req.end();
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
}

testStream();