#!/usr/bin/env node

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import VideoMetadataService from '../src/services/VideoMetadataService.js';

// Configurar variáveis de ambiente
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

/**
 * Script para extrair metadados de vídeo de todas as gravações
 */
async function main() {
  console.log('🎬 Iniciando extração de metadados de vídeo...');
  
  try {
    // Verificar se FFmpeg está disponível
    const { spawn } = await import('child_process');
    
    const checkFFmpeg = () => {
      return new Promise((resolve) => {
        const ffprobe = spawn('ffprobe', ['-version']);
        
        ffprobe.on('close', (code) => {
          resolve(code === 0);
        });
        
        ffprobe.on('error', () => {
          resolve(false);
        });
      });
    };
    
    const ffmpegAvailable = await checkFFmpeg();
    
    if (!ffmpegAvailable) {
      console.error('❌ FFmpeg/ffprobe não encontrado!');
      console.log('📋 Para instalar o FFmpeg:');
      console.log('   Windows: Baixe de https://ffmpeg.org/download.html');
      console.log('   Linux: sudo apt install ffmpeg');
      console.log('   macOS: brew install ffmpeg');
      process.exit(1);
    }
    
    console.log('✅ FFmpeg encontrado');
    
    // Processar gravações sem metadados
    const processedCount = await VideoMetadataService.processAllRecordingsWithoutMetadata();
    
    console.log(`\n🎉 Processamento concluído!`);
    console.log(`📊 Total de gravações processadas: ${processedCount}`);
    
    if (processedCount === 0) {
      console.log('ℹ️ Todas as gravações já possuem metadados completos.');
    } else {
      console.log('✅ Metadados extraídos e salvos no banco de dados.');
      console.log('🔄 Recarregue a interface para ver as informações atualizadas.');
    }
    
  } catch (error) {
    console.error('❌ Erro durante a extração de metadados:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Executar script
main().then(() => {
  console.log('\n🏁 Script finalizado');
  process.exit(0);
}).catch((error) => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});