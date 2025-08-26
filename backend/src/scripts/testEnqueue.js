/**
 * Script simples para testar o enqueue de uma gravação específica
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createModuleLogger } from '../config/logger.js';
import { supabaseAdmin } from '../config/database.js';
import UploadQueueService from '../services/UploadQueueService.js';
import PathResolver from '../utils/PathResolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const logger = createModuleLogger('TestEnqueue');

async function testEnqueue() {
  const recordingId = '7654bed8-5a88-4745-830d-1e7ec3758db9';
  
  try {
    logger.info(`🔧 Testando enqueue para gravação: ${recordingId}`);

    // 1. Verificar se a gravação existe
    const { data: recording, error: fetchError } = await supabaseAdmin
      .from('recordings')
      .select('*')
      .eq('id', recordingId)
      .single();

    if (fetchError || !recording) {
      logger.error('❌ Gravação não encontrada:', fetchError);
      return;
    }

    logger.info('📊 Dados da gravação:', {
      id: recording.id,
      filename: recording.filename,
      status: recording.status,
      upload_status: recording.upload_status,
      file_path: recording.file_path,
      local_path: recording.local_path
    });

    // 2. Verificar se o arquivo existe
    const fileInfo = await PathResolver.findRecordingFile(recording);
    logger.info('📁 Resultado da busca de arquivo:', fileInfo);

    if (!fileInfo || !fileInfo.exists) {
      logger.error('❌ Arquivo não encontrado!');
      return;
    }

    // 3. Tentar enfileirar
    logger.info('📤 Tentando enfileirar...');
    const result = await UploadQueueService.enqueue(recordingId, {
      priority: 'normal',
      force: true,
      source: 'test_script'
    });

    logger.info('🎯 Resultado do enqueue:', result);

    // 4. Verificar status após enqueue
    const { data: updatedRecording } = await supabaseAdmin
      .from('recordings')
      .select('upload_status, updated_at')
      .eq('id', recordingId)
      .single();

    logger.info('📊 Status após enqueue:', updatedRecording);

  } catch (error) {
    logger.error('❌ Erro no teste:', error);
  }
}

testEnqueue()
  .then(() => {
    logger.info('✅ Teste concluído');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('❌ Teste falhou:', error);
    process.exit(1);
  });