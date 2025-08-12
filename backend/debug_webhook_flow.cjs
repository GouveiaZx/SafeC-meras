#!/usr/bin/env node

/**
 * Debug completo do fluxo do webhook on_record_mp4
 * Simula exatamente o que o ZLMediaKit envia
 */

const axios = require('axios');
const path = require('path');
const fs = require('fs');

console.log('🔍 Debug do Fluxo Webhook');
console.log('=========================');

// Dados reais do webhook como enviado pelo ZLMediaKit
const webhookData = {
  start_time: "2025-08-10 11:11:33",
  file_size: 101155463,
  time_len: 60,
  file_path: "/opt/media/bin/www/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/2025-08-10/2025-08-10-11-11-33-0.mp4",
  file_name: "2025-08-10-11-11-33-0.mp4",
  folder: "/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/2025-08-10/",
  url: "http://localhost:8000/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/2025-08-10/2025-08-10-11-11-33-0.mp4",
  app: "record",
  stream: "4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd_live_720p"
};

// Simular a lógica do hooks_improved.js
const RECORDINGS_BASE_PATH = path.join(process.cwd(), '..', 'storage', 'recordings');

console.log('📊 Configuração do Servidor:');
console.log('  RECORDINGS_BASE_PATH:', RECORDINGS_BASE_PATH);
console.log('  CWD:', process.cwd());

function normalizeFilePath(filePath, fileName) {
  console.log('\n🔍 [normalizeFilePath] Iniciando:');
  console.log('  filePath:', filePath);
  console.log('  fileName:', fileName);
  
  let normalizedPath = filePath;
  
  // Mapear caminho do contêiner
  if (normalizedPath.startsWith('/opt/media/bin/www/')) {
    normalizedPath = normalizedPath.replace('/opt/media/bin/www/', '');
    console.log('  ✅ Removido prefixo /opt/media/bin/www/');
  }
  
  normalizedPath = normalizedPath.replace(/^\/+/, '');
  normalizedPath = normalizedPath.replace(/\/+/g, '/');
  
  // Corrigir duplicação
  if (normalizedPath.includes('record/live/') && normalizedPath.split('record/live/').length > 2) {
    const parts = normalizedPath.split('record/live/');
    normalizedPath = 'record/live/' + parts[parts.length - 1];
    console.log('  ✅ Corrigida duplicação de caminho');
  }
  
  const absolutePath = path.join(RECORDINGS_BASE_PATH, normalizedPath);
  
  console.log('  ✅ Caminho normalizado:', normalizedPath);
  console.log('  ✅ Caminho absoluto:', absolutePath);
  
  return {
    relativePath: normalizedPath,
    absolutePath: absolutePath,
    fileName: path.basename(absolutePath)
  };
}

// Verificar o caminho construído
console.log('\n🔍 Análise do Caminho:');
const pathInfo = normalizeFilePath(webhookData.file_path, webhookData.file_name);

console.log('\n📁 Verificação de Arquivo:');
console.log('  Arquivo existe:', fs.existsSync(pathInfo.absolutePath));
console.log('  Tamanho:', fs.existsSync(pathInfo.absolutePath) ? fs.statSync(pathInfo.absolutePath).size : 'N/A');

// Verificar estrutura de diretórios
console.log('\n📂 Estrutura de Diretórios:');
const baseDir = RECORDINGS_BASE_PATH;
if (fs.existsSync(baseDir)) {
  const recordDir = path.join(baseDir, 'record', 'live');
  console.log('  Diretório base existe:', baseDir);
  console.log('  Diretório record/live existe:', fs.existsSync(recordDir));
  
  if (fs.existsSync(recordDir)) {
    const cameraDir = path.join(recordDir, '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd');
    console.log('  Diretório da câmera existe:', fs.existsSync(cameraDir));
    
    if (fs.existsSync(cameraDir)) {
      const dateDir = path.join(cameraDir, '2025-08-10');
      console.log('  Diretório da data existe:', fs.existsSync(dateDir));
      
      if (fs.existsSync(dateDir)) {
        const files = fs.readdirSync(dateDir);
        console.log('  Arquivos encontrados:', files);
      }
    }
  }
}

// Testar webhook
console.log('\n🚀 Testando Webhook:');
async function testWebhook() {
  try {
    console.log('  Enviando para:', 'http://localhost:3002/api/webhooks/on_record_mp4');
    console.log('  Dados:', JSON.stringify(webhookData, null, 2));
    
    const response = await axios.post('http://localhost:3002/api/webhooks/on_record_mp4', webhookData);
    console.log('  ✅ Sucesso:', response.data);
  } catch (error) {
    console.log('  ❌ Erro:', error.response?.status, error.response?.data);
    console.log('  Detalhes:', error.message);
  }
}

testWebhook();