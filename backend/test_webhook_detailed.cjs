#!/usr/bin/env node

/**
 * Teste detalhado do webhook com logging completo
 * Simula exatamente o que o servidor recebe e processa
 */

const axios = require('axios');
const path = require('path');
const fs = require('fs');

console.log('🎯 Teste Detalhado do Webhook');
console.log('=============================');

// Dados reais do webhook
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

// Simular a lógica do servidor
const RECORDINGS_BASE_PATH = path.join(process.cwd(), '..', 'storage', 'www');

console.log('📊 Configuração:');
console.log('  Base Path:', RECORDINGS_BASE_PATH);
console.log('  Working Dir:', process.cwd());

// Função de normalização corrigida
function normalizeFilePath(filePath, fileName) {
  console.log('\n🔍 Processando caminho:');
  console.log('  Input file_path:', filePath);
  console.log('  Input file_name:', fileName);
  
  let normalizedPath = filePath;
  
  // Remover prefixo do container
  if (normalizedPath.startsWith('/opt/media/bin/www/')) {
    normalizedPath = normalizedPath.replace('/opt/media/bin/www/', '');
    console.log('  ✅ Removido prefixo:', normalizedPath);
  }
  
  // Normalizar barras
  normalizedPath = normalizedPath.replace(/^\/+/, '').replace(/\/+/g, '/');
  console.log('  ✅ Normalizado:', normalizedPath);
  
  // Construir caminho absoluto
  const absolutePath = path.join(RECORDINGS_BASE_PATH, normalizedPath);
  console.log('  ✅ Caminho absoluto:', absolutePath);
  
  return {
    relativePath: normalizedPath,
    absolutePath: absolutePath,
    fileName: path.basename(absolutePath)
  };
}

// Verificar o caminho
console.log('\n🔍 Verificação de Caminho:');
const pathInfo = normalizeFilePath(webhookData.file_path, webhookData.file_name);

// Verificar existência do arquivo
console.log('\n📁 Verificação de Arquivo:');
console.log('  Arquivo existe:', fs.existsSync(pathInfo.absolutePath));
if (fs.existsSync(pathInfo.absolutePath)) {
  const stats = fs.statSync(pathInfo.absolutePath);
  console.log('  Tamanho:', stats.size);
  console.log('  Última modificação:', stats.mtime);
}

// Verificar estrutura completa
console.log('\n📂 Estrutura de Diretórios:');
const parts = pathInfo.absolutePath.split(path.sep);
let currentPath = '';
for (let i = 0; i < parts.length; i++) {
  currentPath = path.join(currentPath || '/', parts[i]);
  const exists = fs.existsSync(currentPath);
  console.log(`  ${currentPath}: ${exists ? '✅' : '❌'}`);
}

// Testar webhook com retry
console.log('\n🚀 Testando Webhook:');
async function testWebhook() {
  try {
    console.log('  URL:', 'http://localhost:3002/api/webhooks/on_record_mp4');
    console.log('  Câmera ID:', '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd');
    
    const response = await axios.post('http://localhost:3002/api/webhooks/on_record_mp4', webhookData, {
      timeout: 10000
    });
    
    console.log('  ✅ Sucesso:', response.data);
    
    // Verificar se a gravação foi criada
    console.log('\n🔍 Verificando gravação no banco:');
    // Aqui você poderia verificar o banco de dados
    
  } catch (error) {
    console.log('  ❌ Erro:', error.response?.status, error.response?.data);
    if (error.response?.data?.msg === 'Arquivo não encontrado') {
      console.log('  📍 Caminho esperado:', pathInfo.absolutePath);
      console.log('  📍 Caminho existe:', fs.existsSync(pathInfo.absolutePath));
    }
  }
}

setTimeout(testWebhook, 2000); // Aguardar servidor iniciar completamente