import path from 'path';
import { promises as fs } from 'fs';

// Configuração de caminhos
const RECORDINGS_BASE_PATH = path.join(process.cwd(), 'storage', 'www', 'record', 'live');

function normalizeFilePath(filePath, fileName) {
  console.log('📁 Input filePath:', filePath);
  console.log('📁 Input fileName:', fileName);
  
  let normalizedPath = filePath;
  
  // Se não há filePath, construir a partir do fileName
  if (!normalizedPath && fileName) {
    normalizedPath = fileName.endsWith('.mp4') ? fileName : `${fileName}.mp4`;
  }
  
  // Mapear caminho do contêiner para caminho do host
  if (normalizedPath.startsWith('/opt/media/bin/www/record/live/')) {
    normalizedPath = normalizedPath.replace('/opt/media/bin/www/record/live/', '');
  } else if (normalizedPath.startsWith('/opt/media/bin/www/record/')) {
    normalizedPath = normalizedPath.replace('/opt/media/bin/www/record/', '');
  } else if (normalizedPath.startsWith('/opt/media/bin/www/')) {
    normalizedPath = normalizedPath.replace('/opt/media/bin/www/', '');
  }
  
  // Remover prefixos problemáticos adicionais
  if (normalizedPath.startsWith('record/live/')) {
    normalizedPath = normalizedPath.replace('record/live/', '');
  } else if (normalizedPath.startsWith('record/')) {
    normalizedPath = normalizedPath.substring(7);
  } else if (normalizedPath.startsWith('live/')) {
    normalizedPath = normalizedPath.substring(5);
  }
  
  console.log('📁 Normalized path:', normalizedPath);
  
  // Garantir que o caminho seja relativo ao diretório de gravações
  const absolutePath = path.isAbsolute(normalizedPath) 
    ? normalizedPath 
    : path.join(RECORDINGS_BASE_PATH, normalizedPath);
  
  console.log('📁 RECORDINGS_BASE_PATH:', RECORDINGS_BASE_PATH);
  console.log('📁 Final absolutePath:', absolutePath);
  
  return {
    relativePath: normalizedPath,
    absolutePath: absolutePath,
    fileName: path.basename(absolutePath)
  };
}

async function testPathMapping() {
  console.log('🔍 Debugando mapeamento de caminhos...\n');
  
  const testData = {
    file_path: '/opt/media/bin/www/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/2025-08-10/2025-08-10-11-11-33-0.mp4',
    file_name: '2025-08-10-11-11-33-0.mp4'
  };
  
  console.log('🧪 Testando com dados:');
  console.log('file_path:', testData.file_path);
  console.log('file_name:', testData.file_name);
  console.log('');
  
  const pathInfo = normalizeFilePath(testData.file_path, testData.file_name);
  
  console.log('📊 Resultados:');
  console.log('relativePath:', pathInfo.relativePath);
  console.log('absolutePath:', pathInfo.absolutePath);
  console.log('fileName:', pathInfo.fileName);
  console.log('');
  
  // Verificar se o arquivo existe
  try {
    const stats = await fs.stat(pathInfo.absolutePath);
    console.log('✅ Arquivo encontrado!');
    console.log('Tamanho:', stats.size);
    console.log('É arquivo:', stats.isFile());
  } catch (error) {
    console.log('❌ Arquivo não encontrado:', error.message);
    
    // Listar arquivos no diretório para debug
    try {
      const dir = path.dirname(pathInfo.absolutePath);
      console.log('📁 Tentando listar diretório:', dir);
      const files = await fs.readdir(dir);
      console.log('Arquivos no diretório:', files);
    } catch (dirError) {
      console.log('❌ Diretório não encontrado:', dirError.message);
    }
  }
}

testPathMapping();