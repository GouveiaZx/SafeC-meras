#!/usr/bin/env node

/**
 * Teste final para verificar o caminho correto com process.cwd()
 */

const path = require('path');

// Simular o mesmo cálculo que o servidor faz agora
const RECORDINGS_BASE_PATH = path.join(process.cwd(), '..', 'storage', 'www');

console.log('🔍 Caminho final calculado:');
console.log('process.cwd():', process.cwd());
console.log('RECORDINGS_BASE_PATH:', RECORDINGS_BASE_PATH);

// Verificar se o arquivo existe no novo caminho
const fs = require('fs');
const testFile = path.join(RECORDINGS_BASE_PATH, 'record', 'live', '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd', 'record', 'live', '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd', '2025-08-10', '2025-08-10-11-11-33-0.mp4');

console.log('\n📁 Caminho completo do arquivo:');
console.log(testFile);

if (fs.existsSync(testFile)) {
    console.log('✅ Arquivo encontrado no caminho correto!');
} else {
    console.log('❌ Arquivo não encontrado');
}

// Verificar também se o diretório storage/www existe
if (fs.existsSync(RECORDINGS_BASE_PATH)) {
    console.log('✅ Diretório storage/www existe');
    
    // Listar arquivos no diretório
    const files = fs.readdirSync(RECORDINGS_BASE_PATH);
    console.log('Arquivos em storage/www:', files);
} else {
    console.log('❌ Diretório storage/www não encontrado');
}