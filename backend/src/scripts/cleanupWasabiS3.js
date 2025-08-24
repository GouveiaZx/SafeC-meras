/**
 * Script para limpar todos os arquivos de gravação no Wasabi S3
 * Cuidado: Este script remove TODOS os arquivos do bucket de gravações
 */

import { createModuleLogger } from '../config/logger.js';
import S3Service from '../services/S3Service.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const logger = createModuleLogger('CleanupWasabiS3');

async function cleanupWasabiS3() {
  try {
    console.log('🧹 === LIMPEZA COMPLETA DO WASABI S3 ===\n');

    // Listar todos os objetos no bucket
    console.log('📊 Listando arquivos no bucket...');
    const result = await S3Service.listFiles('recordings/');
    const objects = result.files;
    
    if (objects.length === 0) {
      console.log('✅ Nenhum arquivo encontrado no bucket.');
      return;
    }

    console.log(`📊 Encontrados ${objects.length} arquivos para deletar:`);
    objects.forEach((obj, index) => {
      console.log(`   ${index + 1}. ${obj.Key} (${(obj.Size / 1024 / 1024).toFixed(2)} MB)`);
    });

    console.log(`\n🗑️ Deletando ${objects.length} arquivos do Wasabi S3...`);

    // Deletar todos os objetos
    let deletedCount = 0;
    let errorCount = 0;

    for (const obj of objects) {
      try {
        await S3Service.deleteFile(obj.Key);
        deletedCount++;
        console.log(`   ✅ ${obj.Key}`);
      } catch (error) {
        errorCount++;
        console.error(`   ❌ ${obj.Key}: ${error.message}`);
      }
    }

    console.log(`\n📊 === RESUMO DA LIMPEZA ===`);
    console.log(`✅ Arquivos deletados: ${deletedCount}`);
    console.log(`❌ Erros: ${errorCount}`);
    console.log(`🎉 Limpeza do Wasabi S3 concluída!`);

  } catch (error) {
    console.error('❌ Erro na limpeza do Wasabi S3:', error.message);
    console.error(error.stack);
  }
}

// Executar script
cleanupWasabiS3().catch(console.error);