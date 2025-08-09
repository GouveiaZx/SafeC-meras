import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Possíveis diretórios onde as gravações podem estar armazenadas
const possibleRecordingDirs = [
  path.join(__dirname, 'recordings'),
  path.join(__dirname, '..', 'recordings'),
  path.join(__dirname, 'uploads'),
  path.join(__dirname, '..', 'uploads'),
  path.join(__dirname, 'media'),
  path.join(__dirname, '..', 'media'),
  'C:\\recordings',
  'C:\\uploads',
  'C:\\media'
];

function deleteDirectoryRecursive(dirPath) {
  if (fs.existsSync(dirPath)) {
    const files = fs.readdirSync(dirPath);
    
    files.forEach((file) => {
      const curPath = path.join(dirPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteDirectoryRecursive(curPath);
      } else {
        console.log(`🗑️  Deletando arquivo: ${curPath}`);
        fs.unlinkSync(curPath);
      }
    });
    
    console.log(`📁 Removendo diretório: ${dirPath}`);
    fs.rmdirSync(dirPath);
  }
}

function cleanRecordingFiles() {
  console.log('🧹 Iniciando limpeza de arquivos físicos de gravação...');
  
  let totalFilesDeleted = 0;
  let totalDirsDeleted = 0;
  
  possibleRecordingDirs.forEach((dir) => {
    console.log(`\n🔍 Verificando diretório: ${dir}`);
    
    if (fs.existsSync(dir)) {
      console.log(`✅ Diretório encontrado: ${dir}`);
      
      try {
        const files = fs.readdirSync(dir);
        console.log(`📊 Arquivos encontrados: ${files.length}`);
        
        if (files.length > 0) {
          console.log('📋 Primeiros arquivos:');
          files.slice(0, 5).forEach((file, index) => {
            const filePath = path.join(dir, file);
            const stats = fs.statSync(filePath);
            console.log(`${index + 1}. ${file} (${stats.isDirectory() ? 'DIR' : 'FILE'}) - ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
          });
          
          console.log(`\n⚠️  ATENÇÃO: Deletando TODOS os ${files.length} itens em ${dir}`);
          
          files.forEach((file) => {
            const filePath = path.join(dir, file);
            const stats = fs.statSync(filePath);
            
            if (stats.isDirectory()) {
              deleteDirectoryRecursive(filePath);
              totalDirsDeleted++;
            } else {
              console.log(`🗑️  Deletando: ${filePath}`);
              fs.unlinkSync(filePath);
              totalFilesDeleted++;
            }
          });
          
          console.log(`✅ Diretório ${dir} limpo com sucesso!`);
        } else {
          console.log(`✅ Diretório ${dir} já está vazio.`);
        }
      } catch (error) {
        console.error(`❌ Erro ao processar ${dir}:`, error.message);
      }
    } else {
      console.log(`ℹ️  Diretório não existe: ${dir}`);
    }
  });
  
  console.log(`\n📊 RESUMO DA LIMPEZA:`);
  console.log(`🗑️  Arquivos deletados: ${totalFilesDeleted}`);
  console.log(`📁 Diretórios deletados: ${totalDirsDeleted}`);
  
  if (totalFilesDeleted > 0 || totalDirsDeleted > 0) {
    console.log('✅ Limpeza de arquivos físicos concluída com sucesso!');
  } else {
    console.log('ℹ️  Nenhum arquivo de gravação encontrado para limpar.');
  }
}

// Executar limpeza
try {
  cleanRecordingFiles();
  console.log('\n🏁 Script de limpeza de arquivos finalizado.');
} catch (error) {
  console.error('❌ Erro fatal durante limpeza de arquivos:', error);
  process.exit(1);
}