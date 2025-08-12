/**
 * Teste específico para validar a função normalizeFilePath
 */

import path from 'path';
import { promises as fs } from 'fs';

// Simular a função normalizeFilePath para teste
const RECORDINGS_BASE_PATH = process.env.RECORDINGS_PATH || path.join(process.cwd(), 'recordings');

function normalizeFilePath(filePath, fileName) {
  console.log('🔍 [TEST] Iniciando normalização:', {
    inputFilePath: filePath,
    inputFileName: fileName,
    RECORDINGS_BASE_PATH: RECORDINGS_BASE_PATH
  });
  
  if (!filePath && !fileName) {
    throw new Error('Caminho do arquivo ou nome do arquivo é obrigatório');
  }
  
  let normalizedPath = filePath;
  
  // Se não há filePath, construir a partir do fileName
  if (!normalizedPath && fileName) {
    normalizedPath = fileName.endsWith('.mp4') ? fileName : `${fileName}.mp4`;
    console.log('🔍 [TEST] Construído a partir do fileName:', { normalizedPath });
  }
  
  // Mapear caminho do contêiner para caminho do host - apenas remover o prefixo absoluto do container
  if (normalizedPath.startsWith('/opt/media/bin/www/')) {
    normalizedPath = normalizedPath.replace('/opt/media/bin/www/', '');
    console.log('🔍 [TEST] Removido prefixo /opt/media/bin/www/');
  }
  
  // Corrigir duplicação de "record/live" - tratar múltiplos padrões
  const duplicatePatterns = [
    /\/record\/live\/record\/live\//g,
    /\/record\/live\/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd\/record\/live\/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd\//g
  ];
  
  duplicatePatterns.forEach(pattern => {
    if (pattern.test(normalizedPath)) {
      normalizedPath = normalizedPath.replace(pattern, '/record/live/');
      console.log('🔍 [TEST] Corrigida duplicação record/live:', { normalizedPath });
    }
  });
  
  // Remover apenas barras iniciais, preservar a estrutura completa
  normalizedPath = normalizedPath.replace(/^\/+/, ''); // Remover barras iniciais
  normalizedPath = normalizedPath.replace(/\/+/g, '/'); // Normalizar barras duplas
  console.log('🔍 [TEST] Após normalização:', { normalizedPath });
  
  // Corrigir duplicação de caminho quando o arquivo já está em 'record/live'
  const recordLiveParts = normalizedPath.split('record/live/');
  if (recordLiveParts.length > 2) {
    // Pegar apenas a última parte após o último 'record/live/'
    const lastPart = recordLiveParts[recordLiveParts.length - 1];
    normalizedPath = 'record/live/' + lastPart;
    console.log('🔍 [TEST] Corrigida duplicação de caminho:', { normalizedPath });
  }
  
  // Garantir que o caminho seja relativo ao diretório de gravações
  const absolutePath = path.isAbsolute(normalizedPath) 
    ? normalizedPath 
    : path.join(RECORDINGS_BASE_PATH, normalizedPath);
  
  const result = {
    relativePath: normalizedPath,
    absolutePath: absolutePath,
    fileName: path.basename(absolutePath)
  };
  
  console.log('🔍 [TEST] Caminho final:', result);
  return result;
}

// Teste com o caminho problemático
const testFilePath = "/opt/media/bin/www/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/2025-08-10/2025-08-10-11-11-33-0.mp4";
const testFileName = "2025-08-10-11-11-33-0.mp4";

console.log('🧪 Iniciando teste de normalização...\n');

const result = normalizeFilePath(testFilePath, testFileName);

console.log('\n📋 Resultado final:');
console.log('Relative Path:', result.relativePath);
console.log('Absolute Path:', result.absolutePath);
console.log('File Name:', result.fileName);

// Verificar se o arquivo existe fisicamente
async function checkFileExists(filePath) {
  try {
    await fs.access(filePath);
    console.log('\n✅ Arquivo existe fisicamente!');
    return true;
  } catch (error) {
    console.log('\n❌ Arquivo não existe:', error.message);
    return false;
  }
}

// Criar o diretório e arquivo de teste se não existir
async function createTestFile() {
  const testDir = path.join(RECORDINGS_BASE_PATH, 'record', 'live', '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd', '2025-08-10');
  const testFile = path.join(testDir, '2025-08-10-11-11-33-0.mp4');
  
  try {
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(testFile, 'test content');
    console.log('\n📁 Arquivo de teste criado:', testFile);
    return testFile;
  } catch (error) {
    console.log('\n❌ Erro ao criar arquivo de teste:', error.message);
    return null;
  }
}

// Executar verificação
async function runTest() {
  console.log('\n🔍 Verificando existência do arquivo...');
  const exists = await checkFileExists(result.absolutePath);
  
  if (!exists) {
    console.log('Criando arquivo de teste...');
    await createTestFile();
    await checkFileExists(result.absolutePath);
  }
}

runTest().catch(console.error);