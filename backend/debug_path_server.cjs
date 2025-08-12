#!/usr/bin/env node

/**
 * Debug do caminho usado pelo servidor hooks_improved.js
 */

const path = require('path');
const fs = require('fs');

console.log('🔍 Debug do caminho do servidor hooks_improved.js');
console.log('=============================================');

// Simular o caminho usado pelo servidor
const processCwd = process.cwd();
console.log('process.cwd():', processCwd);

const RECORDINGS_BASE_PATH = path.join(processCwd, '..', 'storage', 'www');
console.log('RECORDINGS_BASE_PATH:', RECORDINGS_BASE_PATH);

// Verificar se o diretório existe
const dirExists = fs.existsSync(RECORDINGS_BASE_PATH);
console.log('Diretório existe:', dirExists);

// Caminho completo do arquivo
const filePath = 'record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/2025-08-10/2025-08-10-11-11-33-0.mp4';
const absolutePath = path.join(RECORDINGS_BASE_PATH, filePath);
console.log('Caminho absoluto esperado:', absolutePath);

// Verificar se o arquivo existe
const fileExists = fs.existsSync(absolutePath);
console.log('Arquivo existe:', fileExists);

// Listar conteúdo do diretório de gravações
console.log('\n📁 Conteúdo do diretório de gravações:');
try {
    const contents = fs.readdirSync(RECORDINGS_BASE_PATH, { recursive: true });
    console.log('Arquivos encontrados:', contents.length);
    contents.slice(0, 10).forEach(file => console.log('  -', file));
} catch (error) {
    console.log('Erro ao listar diretório:', error.message);
}

// Caminho real do arquivo
const realFilePath = 'C:\\Users\\GouveiaRx\\Downloads\\NewCAM\\storage\\www\\record\\live\\4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd\\record\\live\\4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd\\2025-08-10\\2025-08-10-11-11-33-0.mp4';
console.log('\nCaminho real do arquivo:', realFilePath);
console.log('Arquivo real existe:', fs.existsSync(realFilePath));