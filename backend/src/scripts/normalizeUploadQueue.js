/**
 * Script de Normalização da Upload Queue
 * 
 * Este script migra gravações pendentes da tabela recordings 
 * para a nova tabela upload_queue e normaliza nomes de arquivos
 */

import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import path from 'path';
import { createModuleLogger } from '../config/logger.js';
import PathResolver from '../utils/PathResolver.js';

const logger = createModuleLogger('NormalizeUploadQueue');

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

class UploadQueueNormalizer {
  constructor() {
    this.stats = {
      recordingsProcessed: 0,
      recordingsSkipped: 0,
      recordingsNormalized: 0,
      recordingsQueued: 0,
      filesRenamed: 0,
      errors: 0
    };
  }

  /**
   * Executar normalização completa
   */
  async run() {
    logger.info('🚀 Iniciando normalização da Upload Queue...');

    try {
      // 1. Migrar gravações pendentes para upload_queue
      await this.migrateToUploadQueue();

      // 2. Normalizar nomes de arquivos nas gravações existentes
      await this.normalizeRecordingFilenames();

      // 3. Renomear arquivos físicos para remover pontos iniciais
      await this.renamePhysicalFiles();

      // 4. Relatório final
      this.logFinalReport();

    } catch (error) {
      logger.error('❌ Erro durante normalização:', error);
      process.exit(1);
    }
  }

  /**
   * Migrar gravações pendentes para upload_queue
   */
  async migrateToUploadQueue() {
    logger.info('📤 Migrando gravações pendentes para upload_queue...');

    try {
      // Buscar gravações com upload pendente/queued/failed
      const { data: pendingRecordings, error } = await supabase
        .from('recordings')
        .select('*')
        .in('upload_status', ['pending', 'queued', 'failed'])
        .eq('status', 'completed');

      if (error) {
        throw error;
      }

      if (!pendingRecordings || pendingRecordings.length === 0) {
        logger.info('✅ Nenhuma gravação pendente encontrada para migrar');
        return;
      }

      logger.info(`📋 ${pendingRecordings.length} gravações pendentes encontradas`);

      // Migrar cada gravação para upload_queue
      for (const recording of pendingRecordings) {
        try {
          // Verificar se já existe na upload_queue
          const { data: existing } = await supabase
            .from('upload_queue')
            .select('id')
            .eq('recording_id', recording.id)
            .single();

          if (existing) {
            logger.debug(`⏭️ Gravação ${recording.id} já está na fila`);
            this.stats.recordingsSkipped++;
            continue;
          }

          // Adicionar à upload_queue
          const queueData = {
            recording_id: recording.id,
            status: 'pending',
            priority: 5,
            retry_count: recording.upload_attempts || 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          const { error: insertError } = await supabase
            .from('upload_queue')
            .insert(queueData);

          if (insertError) {
            logger.warn(`⚠️ Erro ao adicionar gravação ${recording.id} à fila:`, insertError.message);
            this.stats.errors++;
          } else {
            logger.debug(`✅ Gravação ${recording.id} adicionada à fila`);
            this.stats.recordingsQueued++;
          }

        } catch (error) {
          logger.warn(`⚠️ Erro ao processar gravação ${recording.id}:`, error.message);
          this.stats.errors++;
        }
      }

      logger.info(`✅ Migração para upload_queue concluída: ${this.stats.recordingsQueued} gravações adicionadas`);

    } catch (error) {
      logger.error('❌ Erro na migração para upload_queue:', error);
      throw error;
    }
  }

  /**
   * Normalizar nomes de arquivos nas gravações
   */
  async normalizeRecordingFilenames() {
    logger.info('📝 Normalizando nomes de arquivos nas gravações...');

    try {
      // Buscar gravações com filenames que começam com ponto
      const { data: recordings, error } = await supabase
        .from('recordings')
        .select('*')
        .like('filename', '.%');

      if (error) {
        throw error;
      }

      if (!recordings || recordings.length === 0) {
        logger.info('✅ Nenhuma gravação com filename iniciando com ponto encontrada');
        return;
      }

      logger.info(`📋 ${recordings.length} gravações com filenames para normalizar`);

      for (const recording of recordings) {
        try {
          this.stats.recordingsProcessed++;

          const originalFilename = recording.filename;
          const normalizedFilename = originalFilename.startsWith('.') ? 
            originalFilename.substring(1) : originalFilename;

          if (originalFilename === normalizedFilename) {
            this.stats.recordingsSkipped++;
            continue;
          }

          // Normalizar paths
          const normalizedLocalPath = this.normalizeRecordingPath(
            recording.local_path, 
            originalFilename, 
            normalizedFilename
          );

          const normalizedFilePath = this.normalizeRecordingPath(
            recording.file_path, 
            originalFilename, 
            normalizedFilename
          );

          // Atualizar no banco
          const { error: updateError } = await supabase
            .from('recordings')
            .update({
              filename: normalizedFilename,
              local_path: normalizedLocalPath,
              file_path: normalizedFilePath,
              updated_at: new Date().toISOString()
            })
            .eq('id', recording.id);

          if (updateError) {
            logger.warn(`⚠️ Erro ao normalizar gravação ${recording.id}:`, updateError.message);
            this.stats.errors++;
          } else {
            logger.debug(`✅ Filename normalizado: ${originalFilename} → ${normalizedFilename}`);
            this.stats.recordingsNormalized++;
          }

        } catch (error) {
          logger.warn(`⚠️ Erro ao processar gravação ${recording.id}:`, error.message);
          this.stats.errors++;
        }
      }

      logger.info(`✅ Normalização de filenames concluída: ${this.stats.recordingsNormalized} atualizadas`);

    } catch (error) {
      logger.error('❌ Erro na normalização de filenames:', error);
      throw error;
    }
  }

  /**
   * Normalizar path substituindo filename antigo por novo
   */
  normalizeRecordingPath(originalPath, oldFilename, newFilename) {
    if (!originalPath || !oldFilename || !newFilename) {
      return originalPath;
    }

    // Substituir apenas a última ocorrência do filename
    const lastIndex = originalPath.lastIndexOf(oldFilename);
    if (lastIndex !== -1) {
      return originalPath.substring(0, lastIndex) + 
             newFilename + 
             originalPath.substring(lastIndex + oldFilename.length);
    }

    return originalPath;
  }

  /**
   * Renomear arquivos físicos para remover pontos iniciais
   */
  async renamePhysicalFiles() {
    logger.info('🔄 Renomeando arquivos físicos...');

    try {
      // Buscar gravações que foram recém-normalizadas
      const { data: recordings, error } = await supabase
        .from('recordings')
        .select('*')
        .not('local_path', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(100); // Processar em lotes

      if (error) {
        throw error;
      }

      if (!recordings || recordings.length === 0) {
        logger.info('✅ Nenhuma gravação encontrada para renomeação de arquivos');
        return;
      }

      for (const recording of recordings) {
        try {
          await this.renameRecordingFile(recording);
        } catch (error) {
          logger.warn(`⚠️ Erro ao renomear arquivo da gravação ${recording.id}:`, error.message);
          this.stats.errors++;
        }
      }

      logger.info(`✅ Renomeação de arquivos concluída: ${this.stats.filesRenamed} arquivos renomeados`);

    } catch (error) {
      logger.error('❌ Erro na renomeação de arquivos físicos:', error);
      throw error;
    }
  }

  /**
   * Renomear arquivo físico de uma gravação
   */
  async renameRecordingFile(recording) {
    if (!recording.local_path || !recording.filename) {
      return;
    }

    // Usar PathResolver para encontrar o arquivo
    const fileInfo = await PathResolver.findRecordingFile(recording);
    
    if (!fileInfo || !fileInfo.exists) {
      logger.debug(`📄 Arquivo não encontrado localmente: ${recording.filename}`);
      return;
    }

    const currentPath = fileInfo.absolutePath;
    const currentFilename = path.basename(currentPath);
    
    // Verificar se precisa renomear (ainda tem ponto inicial)
    if (!currentFilename.startsWith('.')) {
      return; // Já está normalizado
    }

    const normalizedFilename = currentFilename.substring(1);
    const normalizedPath = path.join(path.dirname(currentPath), normalizedFilename);

    // Verificar se arquivo destino já existe
    try {
      await fs.access(normalizedPath);
      logger.debug(`📄 Arquivo destino já existe: ${normalizedPath}`);
      return;
    } catch (error) {
      // Arquivo destino não existe, podemos renomear
    }

    try {
      // Renomear arquivo físico
      await fs.rename(currentPath, normalizedPath);
      logger.debug(`✅ Arquivo renomeado: ${currentFilename} → ${normalizedFilename}`);
      this.stats.filesRenamed++;

    } catch (error) {
      logger.warn(`⚠️ Falha ao renomear arquivo ${currentPath}:`, error.message);
      this.stats.errors++;
    }
  }

  /**
   * Log do relatório final
   */
  logFinalReport() {
    logger.info('📊 RELATÓRIO FINAL DA NORMALIZAÇÃO');
    logger.info('=====================================');
    logger.info(`📋 Gravações processadas: ${this.stats.recordingsProcessed}`);
    logger.info(`✅ Gravações normalizadas: ${this.stats.recordingsNormalized}`);
    logger.info(`📤 Gravações adicionadas à fila: ${this.stats.recordingsQueued}`);
    logger.info(`⏭️ Gravações ignoradas: ${this.stats.recordingsSkipped}`);
    logger.info(`🔄 Arquivos renomeados: ${this.stats.filesRenamed}`);
    logger.info(`❌ Erros encontrados: ${this.stats.errors}`);
    
    if (this.stats.errors === 0) {
      logger.info('🎉 Normalização concluída com sucesso!');
    } else {
      logger.warn(`⚠️ Normalização concluída com ${this.stats.errors} erros. Verifique os logs.`);
    }
  }
}

// Executar script se chamado diretamente
const isMainModule = import.meta.url.includes(process.argv[1]?.replace(/\\/g, '/')) || 
                     process.argv[1]?.includes('normalizeUploadQueue.js');

if (isMainModule) {
  console.log('🚀 Iniciando script de normalização da upload queue...');
  const normalizer = new UploadQueueNormalizer();
  normalizer.run()
    .then(() => {
      logger.info('✅ Script de normalização finalizado');
      console.log('✅ Script concluído com sucesso');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ Script falhou:', error);
      console.error('❌ Script falhou:', error);
      process.exit(1);
    });
}

export default UploadQueueNormalizer;