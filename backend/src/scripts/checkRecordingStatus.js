/**
 * Script para verificar o status atual das gravações diretamente
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createModuleLogger } from '../config/logger.js';
import { supabaseAdmin } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const logger = createModuleLogger('CheckStatus');

async function checkRecordingStatus() {
  const recordingIds = [
    '7654bed8-5a88-4745-830d-1e7ec3758db9',
    'e84b79bf-ad38-4153-850c-65ef7b9b1550'
  ];

  try {
    console.log('🔍 VERIFICANDO STATUS DAS GRAVAÇÕES...\n');

    for (const id of recordingIds) {
      const { data: recording, error } = await supabaseAdmin
        .from('recordings')
        .select('id, filename, status, upload_status, s3_key, s3_url, upload_progress, updated_at')
        .eq('id', id)
        .single();

      if (error) {
        console.log(`❌ ERRO para ${id}:`, error);
        continue;
      }

      console.log(`📊 GRAVAÇÃO: ${recording.filename}`);
      console.log(`   ID: ${recording.id}`);
      console.log(`   Status: ${recording.status}`);
      console.log(`   Upload Status: ${recording.upload_status}`);
      console.log(`   Upload Progress: ${recording.upload_progress || 0}%`);
      console.log(`   S3 Key: ${recording.s3_key || 'NULL'}`);
      console.log(`   S3 URL: ${recording.s3_url || 'NULL'}`);
      console.log(`   Updated: ${recording.updated_at}`);
      
      // Determinar o que o frontend deveria mostrar
      let frontendStatus = 'UNKNOWN';
      switch (recording.upload_status) {
        case 'pending': frontendStatus = 'Aguardando'; break;
        case 'queued': frontendStatus = 'Na fila'; break;
        case 'uploading': frontendStatus = 'Enviando...'; break;
        case 'uploaded': frontendStatus = 'Na nuvem'; break;
        case 'failed': frontendStatus = 'Erro no upload'; break;
      }
      
      console.log(`   🎯 FRONTEND DEVERIA MOSTRAR: "${frontendStatus}"`);
      console.log('   ----------------------------------------\n');
    }

  } catch (error) {
    console.error('❌ ERRO GERAL:', error);
  }
}

checkRecordingStatus()
  .then(() => {
    console.log('✅ Verificação concluída');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Verificação falhou:', error);
    process.exit(1);
  });