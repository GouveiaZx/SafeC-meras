#!/usr/bin/env node

/**
 * Teste para verificar o caminho real usado pelo servidor
 */

const path = require('path');

// Simular o mesmo cálculo que o servidor faz
const __dirname_server = path.join(process.cwd(), 'src', 'routes');
const RECORDINGS_BASE_PATH = path.join(__dirname_server, '..', '..', 'storage', 'www');

console.log('🔍 Caminho real calculado pelo servidor:');
console.log('RECORDINGS_BASE_PATH:', RECORDINGS_BASE_PATH);

const filePath = '/opt/media/bin/www/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/2025-08-10/2025-08-10-11-11-33-0.mp4';

// Função normalizeFilePath simplificada
function normalizeFilePath(filePath) {
    let normalizedPath = filePath;
    
    if (normalizedPath.startsWith('/opt/media/bin/www/')) {
        normalizedPath = normalizedPath.replace('/opt/media/bin/www/', '');
    }
    
    normalizedPath = normalizedPath.replace(/^\/+/, '');
    normalizedPath = normalizedPath.replace(/\/+/g, '/');
    
    const absolutePath = path.join(RECORDINGS_BASE_PATH, normalizedPath);
    
    return {
        relativePath: normalizedPath,
        absolutePath: absolutePath
    };
}

const result = normalizeFilePath(filePath);
console.log('\n📁 Resultado:');
console.log('Relative path:', result.relativePath);
console.log('Absolute path:', result.absolutePath);