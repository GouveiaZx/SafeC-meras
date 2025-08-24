/**
 * Script para corrigir gravações com problemas de status e enfileiramento
 * 
 * Problemas corrigidos:
 * 1. Gravações com status "recording" há muito tempo
 * 2. Gravações com upload_status "pending" que deveriam estar "queued"
 * 3. Forçar enfileiramento de gravações completas
 */

import { createModuleLogger } from '../config/logger.js';
import { supabaseAdmin } from '../config/database.js';
import UploadQueueService from '../services/UploadQueueService.js';
import FeatureFlagService from '../services/FeatureFlagService.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const logger = createModuleLogger('FixPendingRecordings');

async function fixPendingRecordings() {
  try {
    console.log('🔧 === INICIANDO CORREÇÃO DE GRAVAÇÕES PENDENTES ===\n');

    // Aguardar FeatureFlagService carregar
    await new Promise(resolve => setTimeout(resolve, 500));

    // 1. CORRIGIR GRAVAÇÕES "RECORDING" ANTIGAS
    console.log('🔍 1. Verificando gravações com status "recording" antigas...');
    
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    
    const { data: oldRecordings, error: oldRecordingsError } = await supabaseAdmin
      .from('recordings')
      .select('id, filename, created_at, status')
      .eq('status', 'recording')
      .lt('created_at', fifteenMinutesAgo);

    if (oldRecordingsError) {
      console.error('❌ Erro ao buscar gravações antigas:', oldRecordingsError);
      return;
    }

    if (oldRecordings.length > 0) {
      console.log(`📊 Encontradas ${oldRecordings.length} gravações antigas em "recording":`);
      
      for (const recording of oldRecordings) {
        const age = Math.round((Date.now() - new Date(recording.created_at).getTime()) / 60000);
        console.log(`   - ${recording.filename} (${age}min)`);
      }

      // Atualizar status para "completed"
      const { data: updatedRecordings, error: updateError } = await supabaseAdmin
        .from('recordings')
        .update({ 
          status: 'completed',
          end_time: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .in('id', oldRecordings.map(r => r.id))
        .select();

      if (updateError) {
        console.error('❌ Erro ao atualizar status das gravações:', updateError);
      } else {
        console.log(`✅ ${updatedRecordings.length} gravações atualizadas para "completed"\n`);
      }
    } else {
      console.log('✅ Nenhuma gravação antiga em "recording" encontrada\n');
    }

    // 2. CORRIGIR UPLOAD_STATUS "PENDING" PARA "QUEUED"
    console.log('🔍 2. Verificando gravações com upload_status "pending"...');
    
    const { data: pendingUploads, error: pendingError } = await supabaseAdmin
      .from('recordings')
      .select('id, filename, status, upload_status, created_at')
      .eq('upload_status', 'pending')
      .eq('status', 'completed'); // Apenas gravações completas

    if (pendingError) {
      console.error('❌ Erro ao buscar gravações pendentes:', pendingError);
      return;
    }

    if (pendingUploads.length > 0) {
      console.log(`📊 Encontradas ${pendingUploads.length} gravações completas com upload "pending":`);
      
      for (const recording of pendingUploads) {
        console.log(`   - ${recording.filename}`);
      }

      // Verificar se S3 upload está habilitado
      const uploadEnabled = FeatureFlagService.isEnabled('s3_upload_enabled');
      
      if (uploadEnabled) {
        console.log('✅ S3 upload está habilitado - atualizando para "queued"');
        
        const { data: queuedRecordings, error: queueError } = await supabaseAdmin
          .from('recordings')
          .update({ 
            upload_status: 'queued',
            updated_at: new Date().toISOString()
          })
          .in('id', pendingUploads.map(r => r.id))
          .select();

        if (queueError) {
          console.error('❌ Erro ao enfileirar gravações:', queueError);
        } else {
          console.log(`✅ ${queuedRecordings.length} gravações enfileiradas\n`);
        }
      } else {
        console.log('⚠️ S3 upload está desabilitado - gravações mantidas como "pending"\n');
      }
    } else {
      console.log('✅ Nenhuma gravação pendente encontrada\n');
    }

    // 3. VERIFICAR FILA ATUAL
    console.log('🔍 3. Verificando estado atual da fila...');
    
    const { data: queueStats, error: statsError } = await supabaseAdmin
      .from('recordings')
      .select('upload_status')
      .not('upload_status', 'is', null);

    if (statsError) {
      console.error('❌ Erro ao buscar estatísticas da fila:', statsError);
    } else {
      const stats = queueStats.reduce((acc, record) => {
        acc[record.upload_status] = (acc[record.upload_status] || 0) + 1;
        return acc;
      }, {});

      console.log('📊 Estado atual da fila de upload:');
      Object.entries(stats).forEach(([status, count]) => {
        const emoji = status === 'uploaded' ? '✅' : 
                     status === 'queued' ? '📤' : 
                     status === 'uploading' ? '🔄' : 
                     status === 'pending' ? '⏳' : '❓';
        console.log(`   ${emoji} ${status}: ${count}`);
      });
    }

    console.log('\n🎉 === CORREÇÃO CONCLUÍDA COM SUCESSO ===');
    console.log('💡 Próximos passos:');
    console.log('   1. Iniciar o worker: npm run dev');
    console.log('   2. Monitorar uploads: node src/scripts/monitorUploadQueue.js stats');

  } catch (error) {
    console.error('❌ Erro no script de correção:', error.message);
    console.error(error.stack);
  }
}

// Executar script
fixPendingRecordings().catch(console.error);