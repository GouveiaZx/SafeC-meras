#!/usr/bin/env node

/**
 * Teste de Exclusão de Gravação
 * Testa se a exclusão remove todos os arquivos relacionados
 */

import { createModuleLogger } from '../config/logger.js';
import { supabaseAdmin } from '../config/database.js';
import RecordingService from '../services/RecordingService.js';
import fs from 'fs/promises';

const logger = createModuleLogger('TestDeletion');

async function testDeletion() {
  try {
    logger.info('🗑️ Testando sistema de exclusão completa...');
    
    const recordingId = '9b0ba9aa-257f-4e8f-a90b-c1fa759ef6ac';
    const filePath = 'storage/www/record/live/12eb90d2-c6f6-4ced-a312-92df308b7246/2025-08-21/2025-08-21-04-06-25-0.mp4';
    
    // 1. Verificar se arquivo existe antes da exclusão
    logger.info('📁 Verificando arquivo antes da exclusão...');
    try {
      await fs.access(filePath);
      logger.info('✅ Arquivo encontrado:', filePath);
    } catch (error) {
      logger.warn('⚠️ Arquivo não encontrado:', filePath);
    }
    
    // 2. Verificar registro no banco antes da exclusão
    const { data: recordingBefore, error: errorBefore } = await supabaseAdmin
      .from('recordings')
      .select('id, file_path, status')
      .eq('id', recordingId)
      .single();
    
    if (errorBefore) {
      logger.error('❌ Erro ao buscar gravação:', errorBefore);
      return;
    }
    
    logger.info('📋 Registro antes da exclusão:', recordingBefore);
    
    // 3. Executar exclusão
    logger.info('🗑️ Executando exclusão...');
    const result = await RecordingService.deleteRecording(recordingId);
    logger.info('✅ Resultado da exclusão:', result);
    
    // 4. Verificar se arquivo foi removido
    logger.info('📁 Verificando arquivo após exclusão...');
    try {
      await fs.access(filePath);
      logger.warn('⚠️ PROBLEMA: Arquivo ainda existe após exclusão!');
    } catch (error) {
      logger.info('✅ SUCESSO: Arquivo foi removido corretamente');
    }
    
    // 5. Verificar se registro foi removido do banco
    logger.info('📋 Verificando registro no banco após exclusão...');
    const { data: recordingAfter, error: errorAfter } = await supabaseAdmin
      .from('recordings')
      .select('id')
      .eq('id', recordingId)
      .single();
    
    if (errorAfter && errorAfter.code === 'PGRST116') {
      logger.info('✅ SUCESSO: Registro foi removido do banco corretamente');
    } else if (errorAfter) {
      logger.error('❌ Erro inesperado:', errorAfter);
    } else {
      logger.warn('⚠️ PROBLEMA: Registro ainda existe no banco!', recordingAfter);
    }
    
    logger.info('🎉 Teste de exclusão concluído!');
    
  } catch (error) {
    logger.error('💥 Erro no teste de exclusão:', error);
    throw error;
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  testDeletion()
    .then(() => {
      console.log('🎉 Teste de exclusão concluído!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Erro fatal:', error);
      process.exit(1);
    });
}

export default testDeletion;