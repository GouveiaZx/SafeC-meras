const path = require('path');
const fs = require('fs');

// Configuração correta baseada na estrutura real
const RECORDINGS_BASE_PATH = path.join(process.cwd(), 'storage', 'www');

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

async function validateFileExists(filePath) {
  try {
    const stats = await fs.promises.stat(filePath);
    return {
      exists: true,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      size: stats.size
    };
  } catch (error) {
    return {
      exists: false,
      error: error.message
    };
  }
}

// Testar com o arquivo real
async function testPathNormalization() {
  console.log('🧪 Testando normalização de caminho com estrutura real...\n');
  
  // Caminho baseado na estrutura real encontrada
  const testCases = [
    {
      name: 'Caminho completo do container',
      file_path: '/opt/media/bin/www/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/2025-08-10/2025-08-10-11-11-33-0.mp4',
      file_name: '2025-08-10-11-11-33-0.mp4'
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n📂 Testando: ${testCase.name}`);
    
    try {
      const pathInfo = normalizeFilePath(testCase.file_path, testCase.file_name);
      console.log('   Caminho relativo:', pathInfo.relativePath);
      console.log('   Caminho absoluto:', pathInfo.absolutePath);
      
      const fileValidation = await validateFileExists(pathInfo.absolutePath);
      console.log('   Arquivo existe:', fileValidation.exists);
      
      if (fileValidation.exists) {
        console.log('   Tamanho:', fileValidation.size);
        console.log('   ✅ Caminho construído corretamente!');
      } else {
        console.log('   Erro:', fileValidation.error);
        console.log('   ❌ Caminho incorreto');
      }
      
    } catch (error) {
      console.log('   Erro:', error.message);
    }
  }
}

// Verificar estrutura de diretórios real
function checkDirectoryStructure() {
  console.log('\n📁 Verificando estrutura de diretórios...');
  console.log('CWD:', process.cwd());
  console.log('RECORDINGS_BASE_PATH:', RECORDINGS_BASE_PATH);
  
  // Caminho real baseado na estrutura encontrada
  const correctPath = path.join(RECORDINGS_BASE_PATH, 'record', 'live', '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd', 'record', 'live', '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd', '2025-08-10', '2025-08-10-11-11-33-0.mp4');
  console.log('Caminho correto esperado:', correctPath);
  console.log('Arquivo existe:', fs.existsSync(correctPath));
  
  if (fs.existsSync(correctPath)) {
    const stats = fs.statSync(correctPath);
    console.log('Tamanho:', stats.size);
  }
}

// Executar testes
testPathNormalization();
checkDirectoryStructure();