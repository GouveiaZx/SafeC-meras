import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const io = require('socket.io-client');

console.log('🔄 Testando atualizações em tempo real...');

const socket = io('http://localhost:3002', {
  auth: {
    token: 'newcam-worker-token-2025-secure',
    type: 'worker'
  },
  transports: ['websocket', 'polling'],
  timeout: 10000
});

socket.on('connect', () => {
  console.log('✅ Socket conectado:', socket.id);
});

socket.on('disconnect', (reason) => {
  console.log('❌ Socket desconectado:', reason);
});

socket.on('connect_error', (error) => {
  console.error('❌ Erro na conexão:', error);
});

// Listen for real-time updates
socket.on('recording-update', (data) => {
  console.log('📊 RECORDING UPDATE recebido:', data);
});

socket.on('recording-status-update', (data) => {
  console.log('📤 RECORDING STATUS UPDATE recebido:', data);
});

socket.on('recording_status_changed', (data) => {
  console.log('📊 RECORDING STATUS CHANGED recebido:', data);
});

socket.on('new_recording', (data) => {
  console.log('🎥 NEW RECORDING recebido:', data);
});

console.log('👂 Escutando por atualizações em tempo real...');
console.log('Pressione Ctrl+C para sair');

// Manter script rodando
setInterval(() => {
  console.log('⏰', new Date().toISOString(), '- Aguardando atualizações...');
}, 30000);