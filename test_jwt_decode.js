import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwODA4YzI3ZS1hYjhjLTQ1NGEtYjdhNC0wYWVkNjI5YzJhYWMiLCJlbWFpbCI6ImdvdXZlaWFyeEBnbWFpbC5jb20iLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3NTQ5MjQyNTYsImV4cCI6MTc1NTUyOTA1Nn0.vu3D3n4fd6aS5S2iAaguSaB6ocVetUbjk0Fbbp_S8AI';
const secret = process.env.JWT_SECRET || 'newcam-dev-jwt-secret-key-2025-extended';

console.log('🔍 Testando decodificação do JWT...');
console.log('JWT_SECRET:', secret);
console.log('Token:', token);
console.log('');

try {
  // Tentar decodificar sem verificação
  const decodedWithoutVerify = jwt.decode(token);
  console.log('✅ Decodificação sem verificação:', JSON.stringify(decodedWithoutVerify, null, 2));
  
  // Tentar decodificar com verificação
  const decodedWithVerify = jwt.verify(token, secret);
  console.log('✅ Decodificação com verificação:', JSON.stringify(decodedWithVerify, null, 2));
  
} catch (error) {
  console.error('❌ Erro na decodificação:', error.name, '-', error.message);
  console.error('Stack:', error.stack);
}