#!/usr/bin/env node

/**
 * Debug para verificar o caminho real usado pelo servidor
 */

const path = require('path');
const fs = require('fs').promises;

// Caminhos possíveis
const cwd = process.cwd();
const __dirname = path.dirname(__filename);

console.log('🔍 Debug de Caminhos');
console.log('=====================');
console.log('process.cwd():', cwd);
console.log('__dirname:', __dirname);

// Caminho que deveria ser usado
const expectedPath = path.join(__dirname, '..', '..', 'storage', 'www');
console.log('Caminho esperado:', expectedPath);

// Caminho que está sendo usado atualmente (baseado em process.cwd())
const currentPath = path.join(cwd, 'storage', 'www');
console.log('Caminho atual:', currentPath);

// Verificar se o arquivo existe em ambos os caminhos
const fileName = 'record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/2025-08-10/2025-08-10-11-11-33-0.mp4';

const expectedFile = path.join(expectedPath, fileName);
const currentFile = path.join(currentPath, fileName);

console.log('\n📁 Verificando arquivos:');
console.log('Caminho esperado completo:', expectedFile);
console.log('Caminho atual completo:', currentFile);

async function checkFiles() {
    try {
        await fs.access(expectedFile);
        console.log('✅ Arquivo existe no caminho esperado');
    } catch (error) {
        console.log('❌ Arquivo NÃO existe no caminho esperado');
    }
    
    try {
        await fs.access(currentFile);
        console.log('✅ Arquivo existe no caminho atual');
    } catch (error) {
        console.log('❌ Arquivo NÃO existe no caminho atual');
    }
}

checkFiles();