import { createClient } from '@supabase/supabase-js';
import S3Service from '../services/S3Service.js';
import fs from 'fs/promises';
import path from 'path';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const RETENTION_CONFIG = {
  LOCAL_RETENTION_DAYS: 7,    // Manter localmente por 7 dias
  S3_RETENTION_DAYS: 30,      // Manter no S3 por 30 dias
  DRY_RUN: process.env.DRY_RUN === 'true'
};

console.log('🧹 Iniciando limpeza de gravações antigas...');
console.log(`📅 Retenção local: ${RETENTION_CONFIG.LOCAL_RETENTION_DAYS} dias`);
console.log(`☁️  Retenção S3: ${RETENTION_CONFIG.S3_RETENTION_DAYS} dias`);
console.log(`🔍 Modo: ${RETENTION_CONFIG.DRY_RUN ? 'DRY RUN (simulação)' : 'EXECUÇÃO REAL'}`);
console.log('='.repeat(60));

async function getRecordingsForCleanup() {
  console.log('🔍 Buscando gravações para limpeza...');

  const localCutoff = new Date();
  localCutoff.setDate(localCutoff.getDate() - RETENTION_CONFIG.LOCAL_RETENTION_DAYS);

  const s3Cutoff = new Date();
  s3Cutoff.setDate(s3Cutoff.getDate() - RETENTION_CONFIG.S3_RETENTION_DAYS);

  // Gravações locais que devem ser removidas (7+ dias)
  const { data: localCleanup, error: localError } = await supabase
    .from('recordings')
    .select('*')
    .eq('upload_status', 'uploaded') // Só limpar localmente se já foi enviado para S3
    .not('s3_key', 'is', null)      // E tem S3 key válida
    .lt('created_at', localCutoff.toISOString())
    .not('local_path', 'is', null);  // E ainda tem path local

  if (localError) {
    console.error('❌ Erro ao buscar gravações para limpeza local:', localError);
    return { local: [], s3: [], supabase: [] };
  }

  // Gravações S3 que devem ser totalmente removidas (30+ dias)
  const { data: s3Cleanup, error: s3Error } = await supabase
    .from('recordings')
    .select('*')
    .lt('created_at', s3Cutoff.toISOString())
    .not('s3_key', 'is', null);

  if (s3Error) {
    console.error('❌ Erro ao buscar gravações para limpeza S3:', s3Error);
    return { local: [], s3: [], supabase: [] };
  }

  console.log(`📊 Encontradas ${localCleanup.length} gravações para limpeza local`);
  console.log(`📊 Encontradas ${s3Cleanup.length} gravações para limpeza S3 completa`);

  return {
    local: localCleanup,
    s3: s3Cleanup,
    supabase: s3Cleanup // Mesmo conjunto para limpeza do Supabase
  };
}

async function cleanupLocalFiles(recordings) {
  console.log('\n🗂️  FASE 1: Limpeza de arquivos locais');
  console.log('-'.repeat(40));

  let cleanedCount = 0;
  let errorCount = 0;
  let totalSize = 0;

  for (const recording of recordings) {
    const age = Math.floor((Date.now() - new Date(recording.created_at)) / (1000 * 60 * 60 * 24));
    console.log(`📁 ${recording.filename} (${age} dias)`);
    console.log(`   Local Path: ${recording.local_path}`);
    console.log(`   S3 Key: ${recording.s3_key}`);

    try {
      // Verificar se arquivo existe localmente
      const fullPath = path.resolve(recording.local_path);
      let fileExists = false;
      let fileSize = 0;

      try {
        const stats = await fs.stat(fullPath);
        fileExists = true;
        fileSize = stats.size;
        totalSize += fileSize;
        console.log(`   Tamanho: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
      } catch (e) {
        console.log(`   ⚠️  Arquivo já não existe localmente`);
      }

      if (fileExists && !RETENTION_CONFIG.DRY_RUN) {
        // Remover arquivo físico
        await fs.unlink(fullPath);
        console.log(`   ✅ Arquivo local removido`);

        // Atualizar banco para indicar que só existe no S3
        const { error: updateError } = await supabase
          .from('recordings')
          .update({
            local_path: null,
            file_path: null,
            updated_at: new Date().toISOString(),
            metadata: {
              ...(recording.metadata || {}),
              local_available: false,
              s3_only: true,
              local_deleted_at: new Date().toISOString()
            }
          })
          .eq('id', recording.id);

        if (updateError) {
          console.log(`   ❌ Erro ao atualizar banco: ${updateError.message}`);
          errorCount++;
        } else {
          console.log(`   ✅ Banco atualizado - agora S3 only`);
          cleanedCount++;
        }
      } else if (fileExists && RETENTION_CONFIG.DRY_RUN) {
        console.log(`   🔍 [DRY RUN] Seria removido`);
        cleanedCount++;
      } else if (!fileExists) {
        // Arquivo já não existe, só atualizar banco
        if (!RETENTION_CONFIG.DRY_RUN) {
          const { error: updateError } = await supabase
            .from('recordings')
            .update({
              local_path: null,
              file_path: null,
              updated_at: new Date().toISOString(),
              metadata: {
                ...(recording.metadata || {}),
                local_available: false,
                s3_only: true,
                local_deleted_at: new Date().toISOString()
              }
            })
            .eq('id', recording.id);

          if (!updateError) {
            console.log(`   ✅ Banco atualizado - marcado como S3 only`);
          }
        }
      }

    } catch (error) {
      console.log(`   ❌ Erro: ${error.message}`);
      errorCount++;
    }

    console.log('');
  }

  console.log(`📊 Resumo da limpeza local:`);
  console.log(`   ✅ Arquivos processados: ${cleanedCount}`);
  console.log(`   ❌ Erros: ${errorCount}`);
  console.log(`   💾 Espaço liberado: ${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB`);

  return { cleaned: cleanedCount, errors: errorCount, sizeFreed: totalSize };
}

async function cleanupS3Files(recordings) {
  console.log('\n☁️  FASE 2: Limpeza de arquivos S3 (30+ dias)');
  console.log('-'.repeat(40));

  let cleanedCount = 0;
  let errorCount = 0;

  for (const recording of recordings) {
    const age = Math.floor((Date.now() - new Date(recording.created_at)) / (1000 * 60 * 60 * 24));
    console.log(`☁️  ${recording.filename} (${age} dias)`);
    console.log(`   S3 Key: ${recording.s3_key}`);

    try {
      if (!RETENTION_CONFIG.DRY_RUN) {
        // Verificar se arquivo existe no S3
        const exists = await S3Service.headObject(recording.s3_key);
        
        if (exists.exists) {
          // Remover do S3
          const deleteResult = await S3Service.deleteFile(recording.s3_key);
          if (deleteResult.success) {
            console.log(`   ✅ Removido do S3`);
          } else {
            console.log(`   ❌ Erro ao remover do S3: ${deleteResult.error}`);
            throw new Error(deleteResult.error);
          }
        } else {
          console.log(`   ⚠️  Arquivo já não existe no S3`);
        }
      } else {
        console.log(`   🔍 [DRY RUN] Seria removido do S3`);
      }

      cleanedCount++;

    } catch (error) {
      console.log(`   ❌ Erro ao remover do S3: ${error.message}`);
      errorCount++;
    }

    console.log('');
  }

  console.log(`📊 Resumo da limpeza S3:`);
  console.log(`   ✅ Arquivos processados: ${cleanedCount}`);
  console.log(`   ❌ Erros: ${errorCount}`);

  return { cleaned: cleanedCount, errors: errorCount };
}

async function cleanupSupabaseRecords(recordings) {
  console.log('\n🗄️  FASE 3: Limpeza de registros Supabase (30+ dias)');
  console.log('-'.repeat(40));

  let cleanedCount = 0;
  let errorCount = 0;

  // Agrupar em lotes de 50 para não sobrecarregar
  const batchSize = 50;
  for (let i = 0; i < recordings.length; i += batchSize) {
    const batch = recordings.slice(i, i + batchSize);
    const batchIds = batch.map(r => r.id);

    console.log(`🔄 Processando lote ${Math.floor(i/batchSize) + 1} (${batch.length} registros)...`);

    try {
      if (!RETENTION_CONFIG.DRY_RUN) {
        const { error } = await supabase
          .from('recordings')
          .delete()
          .in('id', batchIds);

        if (error) {
          console.log(`   ❌ Erro no lote: ${error.message}`);
          errorCount += batch.length;
        } else {
          console.log(`   ✅ Lote removido com sucesso`);
          cleanedCount += batch.length;
        }
      } else {
        console.log(`   🔍 [DRY RUN] ${batch.length} registros seriam removidos`);
        cleanedCount += batch.length;
      }

    } catch (error) {
      console.log(`   ❌ Erro no lote: ${error.message}`);
      errorCount += batch.length;
    }
  }

  console.log(`📊 Resumo da limpeza Supabase:`);
  console.log(`   ✅ Registros processados: ${cleanedCount}`);
  console.log(`   ❌ Erros: ${errorCount}`);

  return { cleaned: cleanedCount, errors: errorCount };
}

async function generateCleanupReport(results) {
  console.log('\n📋 RELATÓRIO FINAL DA LIMPEZA');
  console.log('='.repeat(60));

  const totalFiles = results.local.cleaned + results.s3.cleaned;
  const totalErrors = results.local.errors + results.s3.errors + results.supabase.errors;
  
  console.log(`📊 ESTATÍSTICAS:`);
  console.log(`   🗂️  Arquivos locais removidos: ${results.local.cleaned}`);
  console.log(`   ☁️  Arquivos S3 removidos: ${results.s3.cleaned}`);
  console.log(`   🗄️  Registros Supabase removidos: ${results.supabase.cleaned}`);
  console.log(`   💾 Espaço local liberado: ${(results.local.sizeFreed / 1024 / 1024 / 1024).toFixed(2)} GB`);
  console.log(`   📁 Total de arquivos processados: ${totalFiles}`);
  console.log(`   ❌ Total de erros: ${totalErrors}`);
  console.log(`   ✅ Taxa de sucesso: ${totalFiles > 0 ? ((totalFiles - totalErrors) / totalFiles * 100).toFixed(1) : 0}%`);

  if (RETENTION_CONFIG.DRY_RUN) {
    console.log('\n⚠️  MODO DRY RUN - Nenhuma alteração foi feita');
    console.log('   Para executar de fato, remova DRY_RUN=true');
  } else {
    console.log('\n✅ Limpeza concluída com sucesso!');
  }
}

async function main() {
  try {
    // Buscar gravações para limpeza
    const recordings = await getRecordingsForCleanup();

    if (recordings.local.length === 0 && recordings.s3.length === 0) {
      console.log('✅ Nenhuma gravação antiga encontrada para limpeza');
      return;
    }

    // Fase 1: Limpeza local (7+ dias)
    const localResults = await cleanupLocalFiles(recordings.local);

    // Fase 2: Limpeza S3 (30+ dias)
    const s3Results = await cleanupS3Files(recordings.s3);

    // Fase 3: Limpeza Supabase (30+ dias)
    const supabaseResults = await cleanupSupabaseRecords(recordings.supabase);

    // Relatório final
    await generateCleanupReport({
      local: { ...localResults, sizeFreed: localResults.sizeFreed || 0 },
      s3: s3Results,
      supabase: supabaseResults
    });

  } catch (error) {
    console.error('💥 Erro crítico durante limpeza:', error.message);
    process.exit(1);
  }
}

// Executar script
main().catch(console.error);