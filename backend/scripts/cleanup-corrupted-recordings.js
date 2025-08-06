#!/usr/bin/env node

/**
 * Script de Limpeza de Gravações Corrompidas
 * 
 * Este script identifica e remove gravações corrompidas do sistema NewCAM.
 * Ele verifica a integridade dos arquivos MP4 usando ffprobe e remove
 * arquivos que não podem ser reproduzidos corretamente.
 * 
 * Uso:
 *   node cleanup-corrupted-recordings.js [--dry-run] [--path=<caminho>]
 * 
 * Opções:
 *   --dry-run    Executa sem remover arquivos (apenas lista)
 *   --path       Especifica caminho customizado para verificar
 *   --help       Mostra esta ajuda
 */

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configurações
const CONFIG = {
  // Caminhos padrão para verificar
  defaultPaths: [
    path.join(__dirname, '../../storage/www/recordings'),
    path.join(__dirname, '../../storage/recordings'),
    path.join(__dirname, '../../recordings'),
    './www/recordings'
  ],
  
  // Extensões de arquivo para verificar
  videoExtensions: ['.mp4', '.avi', '.mov', '.mkv'],
  
  // Tamanho mínimo do arquivo (em bytes) - arquivos menores são considerados corrompidos
  minFileSize: 1024, // 1KB
  
  // Timeout para ffprobe (em ms)
  ffprobeTimeout: 10000
};

/**
 * Classe principal para limpeza de gravações corrompidas
 */
class CorruptedRecordingsCleaner {
  constructor(options = {}) {
    this.dryRun = options.dryRun || false;
    this.customPath = options.path;
    this.stats = {
      totalFiles: 0,
      corruptedFiles: 0,
      removedFiles: 0,
      errors: 0,
      totalSize: 0,
      freedSpace: 0
    };
  }

  /**
   * Executar limpeza
   */
  async run() {
    console.log('🧹 Iniciando limpeza de gravações corrompidas...');
    console.log(`📋 Modo: ${this.dryRun ? 'DRY RUN (sem remoção)' : 'LIMPEZA REAL'}`);
    console.log('');

    try {
      const pathsToCheck = this.customPath ? [this.customPath] : CONFIG.defaultPaths;
      
      for (const dirPath of pathsToCheck) {
        await this.cleanDirectory(dirPath);
      }

      this.printSummary();
      
    } catch (error) {
      console.error('❌ Erro durante a limpeza:', error.message);
      process.exit(1);
    }
  }

  /**
   * Limpar diretório específico
   */
  async cleanDirectory(dirPath) {
    try {
      const resolvedPath = path.resolve(dirPath);
      
      // Verificar se o diretório existe
      try {
        await fs.access(resolvedPath);
      } catch {
        console.log(`⚠️  Diretório não encontrado: ${resolvedPath}`);
        return;
      }

      console.log(`📁 Verificando: ${resolvedPath}`);
      
      const files = await this.getVideoFiles(resolvedPath);
      
      if (files.length === 0) {
        console.log('   📄 Nenhum arquivo de vídeo encontrado');
        return;
      }

      console.log(`   📄 Encontrados ${files.length} arquivos de vídeo`);
      
      for (const file of files) {
        await this.checkAndCleanFile(file);
      }
      
    } catch (error) {
      console.error(`❌ Erro ao processar diretório ${dirPath}:`, error.message);
      this.stats.errors++;
    }
  }

  /**
   * Obter lista de arquivos de vídeo recursivamente
   */
  async getVideoFiles(dirPath) {
    const files = [];
    
    async function scanDirectory(currentPath) {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        
        if (entry.isDirectory()) {
          await scanDirectory(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (CONFIG.videoExtensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    }
    
    await scanDirectory(dirPath);
    return files;
  }

  /**
   * Verificar e limpar arquivo específico
   */
  async checkAndCleanFile(filePath) {
    try {
      this.stats.totalFiles++;
      
      const stats = await fs.stat(filePath);
      this.stats.totalSize += stats.size;
      
      // Verificar tamanho mínimo
      if (stats.size < CONFIG.minFileSize) {
        console.log(`   🗑️  Arquivo muito pequeno: ${path.basename(filePath)} (${stats.size} bytes)`);
        await this.removeFile(filePath, stats.size);
        return;
      }
      
      // Verificar integridade com ffprobe
      const isCorrupted = await this.isFileCorrupted(filePath);
      
      if (isCorrupted) {
        console.log(`   🗑️  Arquivo corrompido: ${path.basename(filePath)}`);
        await this.removeFile(filePath, stats.size);
      } else {
        console.log(`   ✅ Arquivo válido: ${path.basename(filePath)}`);
      }
      
    } catch (error) {
      console.error(`   ❌ Erro ao verificar ${path.basename(filePath)}:`, error.message);
      this.stats.errors++;
    }
  }

  /**
   * Verificar se arquivo está corrompido usando ffprobe
   */
  async isFileCorrupted(filePath) {
    return new Promise((resolve) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=codec_name,duration',
        '-of', 'csv=p=0',
        filePath
      ]);

      let output = '';
      let hasError = false;

      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.stderr.on('data', (data) => {
        hasError = true;
      });

      ffprobe.on('close', (code) => {
        // Se o processo falhou ou não há output válido, arquivo está corrompido
        if (code !== 0 || hasError || !output.trim()) {
          resolve(true);
        } else {
          // Verificar se o output contém informações válidas
          const lines = output.trim().split('\n');
          const hasValidStream = lines.some(line => {
            const parts = line.split(',');
            return parts.length >= 2 && parts[0] && parts[1];
          });
          
          resolve(!hasValidStream);
        }
      });

      ffprobe.on('error', () => {
        resolve(true);
      });

      // Timeout
      setTimeout(() => {
        ffprobe.kill();
        resolve(true);
      }, CONFIG.ffprobeTimeout);
    });
  }

  /**
   * Remover arquivo
   */
  async removeFile(filePath, fileSize) {
    this.stats.corruptedFiles++;
    
    if (this.dryRun) {
      console.log(`   🔍 [DRY RUN] Seria removido: ${filePath}`);
      return;
    }
    
    try {
      await fs.unlink(filePath);
      this.stats.removedFiles++;
      this.stats.freedSpace += fileSize;
      console.log(`   🗑️  Removido: ${filePath}`);
    } catch (error) {
      console.error(`   ❌ Erro ao remover ${filePath}:`, error.message);
      this.stats.errors++;
    }
  }

  /**
   * Imprimir resumo final
   */
  printSummary() {
    console.log('');
    console.log('📊 RESUMO DA LIMPEZA');
    console.log('═'.repeat(50));
    console.log(`📄 Total de arquivos verificados: ${this.stats.totalFiles}`);
    console.log(`🗑️  Arquivos corrompidos encontrados: ${this.stats.corruptedFiles}`);
    console.log(`✅ Arquivos removidos: ${this.stats.removedFiles}`);
    console.log(`❌ Erros durante o processo: ${this.stats.errors}`);
    console.log(`💾 Espaço total verificado: ${this.formatBytes(this.stats.totalSize)}`);
    console.log(`🆓 Espaço liberado: ${this.formatBytes(this.stats.freedSpace)}`);
    
    if (this.dryRun && this.stats.corruptedFiles > 0) {
      console.log('');
      console.log('💡 Para executar a limpeza real, execute sem --dry-run');
    }
    
    if (this.stats.corruptedFiles === 0) {
      console.log('');
      console.log('🎉 Nenhum arquivo corrompido encontrado!');
    }
  }

  /**
   * Formatar bytes em formato legível
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

/**
 * Mostrar ajuda
 */
function showHelp() {
  console.log(`
🧹 Script de Limpeza de Gravações Corrompidas
`);
  console.log('Uso:');
  console.log('  node cleanup-corrupted-recordings.js [opções]\n');
  console.log('Opções:');
  console.log('  --dry-run              Executa sem remover arquivos (apenas lista)');
  console.log('  --path=<caminho>       Especifica caminho customizado para verificar');
  console.log('  --help                 Mostra esta ajuda\n');
  console.log('Exemplos:');
  console.log('  node cleanup-corrupted-recordings.js --dry-run');
  console.log('  node cleanup-corrupted-recordings.js --path=/opt/recordings');
  console.log('  node cleanup-corrupted-recordings.js --path=./storage/recordings\n');
}

/**
 * Função principal
 */
async function main() {
  const args = process.argv.slice(2);
  
  // Verificar se foi solicitada ajuda
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }
  
  // Parsear argumentos
  const options = {
    dryRun: args.includes('--dry-run'),
    path: args.find(arg => arg.startsWith('--path='))?.split('=')[1]
  };
  
  // Verificar se ffprobe está disponível
  try {
    await new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', ['-version']);
      ffprobe.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error('ffprobe não encontrado'));
      });
      ffprobe.on('error', reject);
    });
  } catch (error) {
    console.error('❌ ffprobe não está instalado ou não está no PATH');
    console.error('   Instale o FFmpeg para usar este script');
    process.exit(1);
  }
  
  // Executar limpeza
  const cleaner = new CorruptedRecordingsCleaner(options);
  await cleaner.run();
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Erro fatal:', error.message);
    process.exit(1);
  });
}

export default CorruptedRecordingsCleaner;
