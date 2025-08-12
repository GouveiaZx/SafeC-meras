// Node 18+ possui fetch nativo - removido: import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

const BACKEND_URL = 'http://localhost:3002';
const JWT_SECRET = process.env.JWT_SECRET;

// Credenciais de teste
const testCredentials = {
  email: 'admin@newcam.com',
  password: 'admin123'
};

async function debugAuth() {
  console.log('🔍 Debug de autenticação...');
  console.log('JWT_SECRET configurado:', JWT_SECRET ? 'SIM' : 'NÃO');
  
  try {
    // 1. Fazer login
    console.log('\n🔐 Fazendo login...');
    const loginResponse = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testCredentials)
    });
    
    const loginData = await loginResponse.json();
    
    if (!loginResponse.ok) {
      console.log('❌ Erro no login:', loginData);
      return;
    }
    
    console.log('✅ Login realizado com sucesso!');
    console.log('Dados do login:', JSON.stringify(loginData, null, 2));
    const token = loginData.tokens?.accessToken;
    
    if (!token) {
      console.log('❌ Token não encontrado na resposta do login');
      return;
    }
    
    console.log('Token recebido:', token.substring(0, 50) + '...');
    
    // 2. Decodificar o token para verificar
    try {
      const decoded = jwt.decode(token, { complete: true });
      console.log('\n🔍 Token decodificado (header):', decoded.header);
      console.log('🔍 Token decodificado (payload):', decoded.payload);
      
      // Verificar se o token é válido
      const verified = jwt.verify(token, JWT_SECRET);
      console.log('✅ Token verificado com sucesso:', {
        userId: verified.userId,
        email: verified.email,
        role: verified.role,
        exp: new Date(verified.exp * 1000).toISOString()
      });
    } catch (error) {
      console.log('❌ Erro ao verificar token:', error.message);
      return;
    }
    
    // 3. Testar API com token
    console.log('\n📊 Testando /api/recordings/stats...');
    const statsResponse = await fetch(`${BACKEND_URL}/api/recordings/stats`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Status:', statsResponse.status);
    const statsData = await statsResponse.json();
    console.log('Resposta:', JSON.stringify(statsData, null, 2));
    
    // 4. Verificar se o usuário existe no banco
    console.log('\n👤 Verificando usuário no banco...');
    const userResponse = await fetch(`${BACKEND_URL}/api/users/profile`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Status do perfil:', userResponse.status);
    const userData = await userResponse.json();
    console.log('Dados do usuário:', JSON.stringify(userData, null, 2));
    
  } catch (error) {
    console.error('❌ Erro durante o debug:', error.message);
  }
}

debugAuth();