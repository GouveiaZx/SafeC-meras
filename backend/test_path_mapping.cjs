#!/usr/bin/env node

/**
 * Teste de mapeamento de caminho como o servidor hooks_improved.js faz
 */

const path = require('path');
const fs = require('fs');

console.log('🎯 Teste de Mapeamento de Caminho');
console.log('=================================');

// Simular exatamente o que o hooks_improved.js faz
const RECORDINGS_BASE_PATH = path.join(process.cwd(), '..', 'storage', 'www');

function normalizeFilePath(filePath, fileName) {
    console.log('🔍 [normalizeFilePath] Iniciando normalização:', { filePath, fileName });
    
    if (!filePath && !fileName) {
        throw new Error('Caminho do arquivo ou nome do arquivo é obrigatório');
    }
    
    let normalizedPath = filePath;
    
    // Se não há filePath, construir a partir do fileName
    if (!normalizedPath && fileName) {
        normalizedPath = fileName.endsWith('.mp4') ? fileName : `${fileName}.mp4`;
        console.log('🔍 [normalizeFilePath] Construído a partir do fileName:', normalizedPath);
    }
    
    // Mapear caminho do contêiner para caminho do host - apenas remover o prefixo absoluto do container
    if (normalizedPath.startsWith('/opt/media/bin/www/')) {
        normalizedPath = normalizedPath.replace('/opt/media/bin/www/', '');
        console.log('🔍 [normalizeFilePath] Removido prefixo /opt/media/bin/www/');
    }
    
    // Remover apenas barras iniciais, preservar a estrutura completa
    normalizedPath = normalizedPath.replace(/^\/+/, ''); // Remover barras iniciais
    normalizedPath = normalizedPath.replace(/\/+/g, '/'); // Normalizar barras duplas
    
    console.log('🔍 [normalizeFilePath] Caminho normalizado:', normalizedPath);
    
    // Garantir que o caminho seja relativo ao diretório de gravações
    const absolutePath = path.isAbsolute(normalizedPath) 
        ? normalizedPath 
        : path.join(RECORDINGS_BASE_PATH, normalizedPath);
    
    const result = {
        relativePath: normalizedPath,
        absolutePath: absolutePath,
        fileName: path.basename(absolutePath)
    };
    
    console.log('🔍 [normalizeFilePath] Resultado final:', result);
    return result;
}

// Testar com os dados reais do webhook
const webhookData = {
    file_path: '/opt/media/bin/www/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/2025-08-10/2025-08-10-11-11-33-0.mp4',
    file_name: '2025-08-10-11-11-33-0.mp4'
};

console.log('\n📡 Dados do webhook:', webhookData);
console.log('RECORDINGS_BASE_PATH:', RECORDINGS_BASE_PATH);

try {
    const pathInfo = normalizeFilePath(webhookData.file_path, webhookData.file_name);
    console.log('\n✅ Caminho construído com sucesso:');
    console.log('  - Caminho relativo:', pathInfo.relativePath);
    console.log('  - Caminho absoluto:', pathInfo.absolutePath);
    console.log('  - Nome do arquivo:', pathInfo.fileName);
    
    // Verificar se o arquivo existe
    const fileExists = fs.existsSync(pathInfo.absolutePath);
    console.log('\n🔍 Verificação de arquivo:');
    console.log('  - Arquivo existe:', fileExists);
    
    if (fileExists) {
        const stats = fs.statSync(pathInfo.absolutePath);
        console.log('  - Tamanho:', stats.size, 'bytes');
        console.log('  - É arquivo:', stats.isFile());
    } else {
        console.log('  - ⚠️ Arquivo não encontrado!');
        console.log('  - Diretório base existe:', fs.existsSync(RECORDINGS_BASE_PATH));
        
        // Listar conteúdo do diretório
        if (fs.existsSync(RECORDINGS_BASE_PATH)) {
            const contents = fs.readdirSync(RECORDINGS_BASE_PATH, { recursive: true });
            const matchingFiles = contents.filter(f => f.includes('2025-08-10-11-11-33-0'));
            console.log('  - Arquivos encontrados com nome similar:', matchingFiles.length);
            matchingFiles.forEach(f => console.log('    -', f));
        }
    }
    
} catch (error) {
    console.error('❌ Erro:', error.message);
}

// Testar caminho alternativo
console.log('\n\n🔍 Teste de caminho alternativo:');
const altPath = path.join(RECORDINGS_BASE_PATH, 'record', 'live', '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd', 'record', 'live', '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd', '2025-08-10', '2025-08-10-11-11-33-0.mp4');
console.log('Caminho alternativo:', altPath);
console.log('Existe:', fs.existsSync(altPath));