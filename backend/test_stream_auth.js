import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

async function testStreamAuth() {
  try {
    console.log('🧪 Testando autenticação de stream...');
    
    // Criar um token de teste com usuário real
    const testUserId = '929cc586-3e21-45ff-bdaf-cb5e1119664e'; // Rodrigo Admin
    const testToken = jwt.sign(
      { userId: testUserId },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    console.log('🔑 Token de teste criado:', testToken.substring(0, 50) + '...');
    
    // Testar endpoint de stream com token no query parameter
    const recordingId = '7686465c-217f-4192-a892-01bf1a7e12ba';
    const streamUrl = `http://localhost:3002/api/recordings/${recordingId}/stream?token=${encodeURIComponent(testToken)}`;
    
    console.log('🌐 Testando URL:', streamUrl);
    
    // Fazer requisição HTTP simples
    const response = await fetch(streamUrl, {
      method: 'GET',
      headers: {
        'Accept': 'video/mp4,video/*,*/*',
        'Range': 'bytes=0-1023' // Solicitar apenas os primeiros 1KB
      }
    });
    
    console.log('📊 Status da resposta:', response.status);
    console.log('📋 Headers da resposta:');
    response.headers.forEach((value, key) => {
      console.log(`  ${key}: ${value}`);
    });
    
    if (response.status === 401) {
      const errorText = await response.text();
      console.log('❌ Erro 401 - Resposta:', errorText);
    } else if (response.status === 206 || response.status === 200) {
      console.log('✅ Stream funcionando! Status:', response.status);
      const contentLength = response.headers.get('content-length');
      console.log('📏 Content-Length:', contentLength);
    } else {
      const errorText = await response.text();
      console.log('⚠️ Status inesperado:', response.status, errorText);
    }
    
  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
  }
}

// Executar teste
testStreamAuth();