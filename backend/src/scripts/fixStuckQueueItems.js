#!/usr/bin/env node
/**
 * Script para diagnosticar e corrigir itens presos na fila de upload
 * Foca especificamente no problema: "Queue has 1 items but worker is idle"
 */

import { createClient } from '@supabase/supabase-js';
import { createModuleLogger } from '../config/logger.js';
import PathResolver from '../utils/PathResolver.js';

const logger = createModuleLogger('FixStuckQueue');

// Configuração do Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DRY_RUN = process.env.DRY_RUN === 'true';

async function fixStuckQueueItems() {
  try {
    logger.info('🔧 Diagnosticando itens presos na fila de upload...');
    logger.info(`📊 Modo: ${DRY_RUN ? 'DRY RUN (Simulação)' : 'EXECUÇÃO REAL'}`);

    // 1. Buscar todos os itens na fila
    const { data: queueItems, error: queueError } = await supabase
      .from('upload_queue')
      .select(`
        id,
        recording_id,
        status,
        retry_count,
        created_at,
        updated_at,
        recordings!inner (
          id,
          filename,
          local_path,
          file_path,
          upload_status,
          status,
          file_size
        )
      `)
      .order('created_at', { ascending: true });

    if (queueError) {
      throw new Error(`Erro ao buscar fila: ${queueError.message}`);
    }

    logger.info(`📋 Itens encontrados na fila: ${queueItems.length}`);

    if (queueItems.length === 0) {
      logger.info('✅ Nenhum item na fila!');
      return;
    }

    // 2. Analisar cada item
    for (const item of queueItems) {
      await analyzeQueueItem(item);
    }

    // 3. Limpar fila de itens órfãos ou corrompidos
    await cleanupBrokenQueueItems(queueItems);

  } catch (error) {
    logger.error('💥 Erro fatal:', error);
    process.exit(1);
  }
}

async function analyzeQueueItem(item) {
  const recording = item.recordings;
  logger.info(`\n🔍 Analisando item da fila: ${item.id}`);
  logger.info(`  Recording ID: ${recording.id}`);
  logger.info(`  Filename: ${recording.filename}`);
  logger.info(`  Queue Status: ${item.status}`);
  logger.info(`  Recording Upload Status: ${recording.upload_status}`);
  logger.info(`  Retry Count: ${item.retry_count}`);
  logger.info(`  Created: ${new Date(item.created_at).toLocaleString('pt-BR')}`);
  logger.info(`  Updated: ${new Date(item.updated_at).toLocaleString('pt-BR')}`);

  if (item.last_error) {
    logger.warn(`  ⚠️ Last Error: ${item.last_error}`);
  }

  // Verificar problemas específicos
  const problems = [];

  // Problema 1: Status inconsistente
  if (recording.upload_status === 'uploaded' && item.status !== 'completed') {
    problems.push('Status inconsistente: recording=uploaded mas queue não completed');
  }

  // Problema 2: Arquivo não existe
  const fileResult = await PathResolver.findRecordingFile(recording);
  if (!fileResult || !fileResult.exists) {
    problems.push('Arquivo físico não encontrado');
  } else {
    logger.info(`  📁 Arquivo encontrado: ${fileResult.absolutePath} (${Math.round(fileResult.size/1024)}KB)`);
  }

  // Problema 3: Item muito antigo na fila
  const hoursInQueue = (Date.now() - new Date(item.created_at).getTime()) / (1000 * 60 * 60);
  if (hoursInQueue > 24) {
    problems.push(`Item na fila há ${hoursInQueue.toFixed(1)} horas (>24h)`);
  }

  // Problema 4: Muitas tentativas
  if (item.retry_count > 5) {
    problems.push(`Muitas tentativas: ${item.retry_count}`);
  }

  // Problema 5: Recording status inválido
  if (recording.status !== 'completed') {
    problems.push(`Recording status inválido: ${recording.status} (deveria ser 'completed')`);
  }

  if (problems.length > 0) {
    logger.warn(`  ⚠️ Problemas identificados:`);
    problems.forEach(problem => logger.warn(`    - ${problem}`));
    
    // Tentar corrigir
    await fixQueueItem(item, problems, fileResult);
  } else {
    logger.info(`  ✅ Item parece OK, mas pode estar travado no worker`);
    // Resetar item para forçar reprocessamento
    await resetQueueItem(item);
  }
}

async function fixQueueItem(item, problems, fileResult) {
  const recording = item.recordings;

  logger.info(`  🔧 Aplicando correções...`);

  // Correção 1: Remover item se arquivo não existe
  if (!fileResult || !fileResult.exists) {
    logger.warn(`  🗑️ Removendo item da fila - arquivo não encontrado`);
    
    if (!DRY_RUN) {
      // Remover da fila
      const { error: deleteQueueError } = await supabase
        .from('upload_queue')
        .delete()
        .eq('id', item.id);

      // Atualizar recording para 'failed'
      const { error: updateRecError } = await supabase
        .from('recordings')
        .update({
          upload_status: 'failed',
          updated_at: new Date().toISOString()
        })
        .eq('id', recording.id);

      if (deleteQueueError || updateRecError) {
        logger.error(`  ❌ Erro ao remover item: ${deleteQueueError?.message || updateRecError?.message}`);
      } else {
        logger.info(`  ✅ Item removido da fila e recording marcado como failed`);
      }
    } else {
      logger.info(`  🔍 [DRY RUN] Removeria item da fila`);
    }
    return;
  }

  // Correção 2: Corrigir status inconsistente
  if (recording.upload_status === 'uploaded' && item.status !== 'completed') {
    logger.info(`  🔄 Marcando item da fila como completed`);
    
    if (!DRY_RUN) {
      const { error } = await supabase
        .from('upload_queue')
        .update({
          status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', item.id);

      if (error) {
        logger.error(`  ❌ Erro ao marcar como completed: ${error.message}`);
      } else {
        logger.info(`  ✅ Item marcado como completed`);
      }
    } else {
      logger.info(`  🔍 [DRY RUN] Marcaria item como completed`);
    }
    return;
  }

  // Correção 3: Resetar item com muitas tentativas
  if (item.retry_count > 5) {
    logger.info(`  🔄 Resetando item com muitas tentativas`);
    
    if (!DRY_RUN) {
      const { error } = await supabase
        .from('upload_queue')
        .update({
          status: 'queued',
          retry_count: 0,
          last_error: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', item.id);

      if (error) {
        logger.error(`  ❌ Erro ao resetar: ${error.message}`);
      } else {
        logger.info(`  ✅ Item resetado para nova tentativa`);
      }
    } else {
      logger.info(`  🔍 [DRY RUN] Resetaria item para nova tentativa`);
    }
    return;
  }

  // Correção 4: Corrigir recording status
  if (recording.status !== 'completed') {
    logger.info(`  🔄 Corrigindo status do recording para 'completed'`);
    
    if (!DRY_RUN) {
      const { error } = await supabase
        .from('recordings')
        .update({
          status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', recording.id);

      if (error) {
        logger.error(`  ❌ Erro ao corrigir recording: ${error.message}`);
      } else {
        logger.info(`  ✅ Recording status corrigido`);
      }
    } else {
      logger.info(`  🔍 [DRY RUN] Corrigiria status do recording`);
    }
  }
}

async function resetQueueItem(item) {
  logger.info(`  🔄 Resetando item aparentemente OK para forçar reprocessamento...`);
  
  if (!DRY_RUN) {
    const { error } = await supabase
      .from('upload_queue')
      .update({
        status: 'queued',
        updated_at: new Date().toISOString()
      })
      .eq('id', item.id);

    if (error) {
      logger.error(`  ❌ Erro ao resetar item: ${error.message}`);
    } else {
      logger.info(`  ✅ Item resetado para reprocessamento`);
    }
  } else {
    logger.info(`  🔍 [DRY RUN] Resetaria item para reprocessamento`);
  }
}

async function cleanupBrokenQueueItems(queueItems) {
  logger.info(`\n🧹 Verificando itens órfãos...`);

  // Buscar itens da fila sem recording correspondente
  const { data: orphanItems, error } = await supabase
    .from('upload_queue')
    .select('id, recording_id')
    .not('recording_id', 'in', `(SELECT id FROM recordings)`);

  if (error) {
    logger.error('❌ Erro ao buscar órfãos:', error.message);
    return;
  }

  if (orphanItems.length > 0) {
    logger.warn(`🗑️ Encontrados ${orphanItems.length} itens órfãos na fila`);
    
    if (!DRY_RUN) {
      const { error: deleteError } = await supabase
        .from('upload_queue')
        .delete()
        .in('id', orphanItems.map(i => i.id));

      if (deleteError) {
        logger.error('❌ Erro ao remover órfãos:', deleteError.message);
      } else {
        logger.info('✅ Itens órfãos removidos');
      }
    } else {
      logger.info('🔍 [DRY RUN] Removeria itens órfãos');
    }
  } else {
    logger.info('✅ Nenhum item órfão encontrado');
  }
}

// Executar se chamado diretamente
fixStuckQueueItems().catch((error) => {
  console.error('💥 Erro fatal:', error);
  process.exit(1);
});