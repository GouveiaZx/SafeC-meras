#!/usr/bin/env node

/**
 * Verificar se a correção do caminho está correta
 */

const path = require('path');

// Simular o mesmo cálculo que o servidor faz com a nova configuração
const __dirname_server = path.join(__dirname, 'src', 'routes');
const RECORDINGS_BASE_PATH = path.join(__dirname_server, '..', '..', '..', '..', 'storage', 'www');

console.log('🔍 Verificação do caminho corrigido:');
console.log('__dirname simulado:', __dirname_server);
console.log('RECORDINGS_BASE_PATH:', RECORDINGS_BASE_PATH);

// Verificar se o arquivo existe no novo caminho
const fs = require('fs');
const testFile = path.join(RECORDINGS_BASE_PATH, 'record', 'live', '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd', 'record', 'live', '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd', '2025-08-10', '2025-08-10-11-11-33-0.mp4');

console.log('\n📁 Caminho completo do arquivo:');
console.log(testFile);

if (fs.existsSync(testFile)) {
    console.log('✅ Arquivo encontrado no novo caminho!');
} else {
    console.log('❌ Arquivo não encontrado no novo caminho');
}

console.log('\n📋 Estrutura de diretórios esperada:');
console.log('C:\\Users\\GouveiaRx\\Downloads\\NewCAM\\');
console.log('├── backend\\');
console.log('│   └── src\\routes\\hooks_improved.js');
console.log('└── storage\\www\\');
console.log('    └── [arquivos de gravação]');