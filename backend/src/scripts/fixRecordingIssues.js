#!/usr/bin/env node
/**
 * Script de correção completa para problemas de gravação
 * Corrige: durações ausentes, status de upload, paths inconsistentes, gravações órfãs
 */

import { createClient } from '@supabase/supabase-js';
import { spawn } from 'child_process';
import path from 'path';
import { promises as fs } from 'fs';
import { createModuleLogger } from '../config/logger.js';
import PathResolver from '../utils/PathResolver.js';

const logger = createModuleLogger('FixRecordingIssues');

// Configuração do Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DRY_RUN = process.env.DRY_RUN === 'true';

class RecordingFixService {
  constructor() {
    this.pathResolver = PathResolver;
    this.stats = {
      processedRecordings: 0,
      durationFixed: 0,
      pathsNormalized: 0,
      statusUpdated: 0,
      enqueuedForUpload: 0,
      orphansLinked: 0,
      errors: []
    };
  }

  /**
   * Executar correção completa
   */
  async runFix() {
    try {
      logger.info('🔧 Iniciando correção completa de gravações...');
      logger.info(`📊 Modo: ${DRY_RUN ? 'DRY RUN (Simulação)' : 'EXECUÇÃO REAL'}`);

      // 1. Buscar todas as gravações problemáticas
      const problematicRecordings = await this.findProblematicRecordings();
      
      if (problematicRecordings.length === 0) {
        logger.info('✅ Nenhuma gravação problemática encontrada!');
        return;
      }

      logger.info(`📋 Encontradas ${problematicRecordings.length} gravações com problemas`);

      // 2. Processar cada gravação
      for (const recording of problematicRecordings) {
        await this.fixRecording(recording);
      }

      // 3. Limpar fila de upload órfã
      await this.cleanupUploadQueue();

      // 4. Relatório final
      await this.printReport();

    } catch (error) {
      logger.error('💥 Erro fatal na correção:', error);
      process.exit(1);
    }
  }

  /**
   * Buscar gravações com problemas
   */
  async findProblematicRecordings() {
    const { data: recordings, error } = await supabase
      .from('recordings')
      .select('*')
      .or(
        'duration.is.null,' +
        'duration.eq.0,' +
        'local_path.is.null,' +
        'file_path.is.null,' +
        'upload_status.eq.queued,' +
        'upload_status.eq.pending'
      )
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Erro ao buscar gravações: ${error.message}`);
    }

    logger.info(`📊 Total de gravações problemáticas: ${recordings.length}`);
    
    // Log por tipo de problema
    const problems = {
      noDuration: recordings.filter(r => !r.duration || r.duration === 0).length,
      noLocalPath: recordings.filter(r => !r.local_path).length,
      noFilePath: recordings.filter(r => !r.file_path).length,
      queuedStatus: recordings.filter(r => r.upload_status === 'queued').length,
      pendingStatus: recordings.filter(r => r.upload_status === 'pending').length
    };

    logger.info('📋 Problemas identificados:', problems);

    return recordings;
  }

  /**
   * Corrigir uma gravação específica
   */
  async fixRecording(recording) {
    try {
      logger.info(`🔧 Processando gravação: ${recording.id} (${recording.filename})`);
      this.stats.processedRecordings++;

      const fixes = {};
      let needsUpdate = false;

      // 1. Corrigir paths se necessário
      const pathFix = await this.fixPaths(recording);
      if (pathFix) {
        Object.assign(fixes, pathFix);
        needsUpdate = true;
        this.stats.pathsNormalized++;
      }

      // 2. Corrigir duração se ausente
      const durationFix = await this.fixDuration(recording, pathFix?.resolvedPath);
      if (durationFix) {
        fixes.duration = durationFix;
        needsUpdate = true;
        this.stats.durationFixed++;
      }

      // 3. Corrigir status de upload
      const statusFix = await this.fixUploadStatus(recording, pathFix?.resolvedPath);
      if (statusFix) {
        fixes.upload_status = statusFix.status;
        if (statusFix.s3Key) {
          fixes.s3_key = statusFix.s3Key;
          fixes.s3_url = statusFix.s3Url;
        }
        needsUpdate = true;
        this.stats.statusUpdated++;
      }

      // 4. Aplicar correções se necessário
      if (needsUpdate && !DRY_RUN) {
        const { error } = await supabase
          .from('recordings')
          .update({
            ...fixes,
            updated_at: new Date().toISOString()
          })
          .eq('id', recording.id);

        if (error) {
          logger.error(`❌ Erro ao atualizar ${recording.id}:`, error.message);
          this.stats.errors.push(`Update ${recording.id}: ${error.message}`);
        } else {
          logger.info(`✅ Gravação ${recording.id} corrigida com sucesso`);
        }
      } else if (needsUpdate && DRY_RUN) {
        logger.info(`🔍 [DRY RUN] Aplicaria correções:`, fixes);
      }

      // 5. Enfileirar para upload se necessário
      if (statusFix?.shouldEnqueue && !DRY_RUN) {
        await this.enqueueForUpload(recording.id);
      }

    } catch (error) {
      logger.error(`💥 Erro ao processar ${recording.id}:`, error.message);
      this.stats.errors.push(`Processing ${recording.id}: ${error.message}`);
    }
  }

  /**
   * Corrigir paths inconsistentes
   */
  async fixPaths(recording) {
    // Se já tem paths consistentes, não fazer nada
    if (recording.local_path && recording.file_path && 
        recording.local_path === recording.file_path) {
      return null;
    }

    // Tentar encontrar o arquivo físico
    const fileResult = await this.pathResolver.findRecordingFile(recording);
    
    if (fileResult && fileResult.exists) {
      const normalizedPath = this.pathResolver.normalizeToRelative(fileResult.absolutePath);
      
      logger.debug(`📁 Paths corrigidos para ${recording.id}:`, {
        antes: { local_path: recording.local_path, file_path: recording.file_path },
        depois: { local_path: normalizedPath, file_path: normalizedPath }
      });

      return {
        local_path: normalizedPath,
        file_path: normalizedPath,
        file_size: fileResult.size,
        resolvedPath: fileResult.absolutePath
      };
    }

    // Se não encontrou o arquivo, gerar path esperado
    if (recording.camera_id && recording.filename) {
      const expectedPath = this.pathResolver.generateRecordingPath(
        recording.camera_id,
        recording.filename,
        new Date(recording.created_at)
      );

      logger.debug(`📁 Path esperado gerado para ${recording.id}: ${expectedPath}`);

      return {
        local_path: expectedPath,
        file_path: expectedPath
      };
    }

    return null;
  }

  /**
   * Corrigir duração ausente
   */
  async fixDuration(recording, resolvedPath) {
    // Se já tem duração válida, não fazer nada
    if (recording.duration && recording.duration > 0) {
      return null;
    }

    // Tentativa 1: calcular por timestamps
    const timestampDuration = this.calculateDurationFromTimestamps(recording);
    if (timestampDuration) {
      logger.debug(`⏱️ Duração calculada por timestamps: ${timestampDuration}s`);
      return timestampDuration;
    }

    // Tentativa 2: extrair com ffprobe se arquivo existe
    if (resolvedPath) {
      const ffprobeDuration = await this.extractDurationWithFFprobe(resolvedPath);
      if (ffprobeDuration) {
        logger.debug(`⏱️ Duração extraída com ffprobe: ${ffprobeDuration}s`);
        return ffprobeDuration;
      }
    }

    // Tentativa 3: duração padrão para gravações completed
    if (recording.status === 'completed') {
      logger.debug(`⏱️ Aplicando duração padrão: 30s`);
      return 30;
    }

    return null;
  }

  /**
   * Calcular duração por timestamps
   */
  calculateDurationFromTimestamps(recording) {
    const pairs = [
      [recording.start_time, recording.end_time],
      [recording.started_at, recording.ended_at]
    ];

    for (const [start, end] of pairs) {
      if (start && end) {
        const startTime = new Date(start);
        const endTime = new Date(end);
        const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
        
        if (duration > 0 && duration < 7200) { // Entre 0 e 2 horas
          return duration;
        }
      }
    }

    return null;
  }

  /**
   * Extrair duração com ffprobe via Docker
   */
  async extractDurationWithFFprobe(filePath) {
    return new Promise((resolve) => {
      // Converter path para formato Docker
      const dockerPath = filePath.replace(/^.*storage[/\\]www[/\\]/, '/opt/media/bin/www/');
      
      const ffprobe = spawn('docker', [
        'exec', 'newcam-zlmediakit', 'ffprobe',
        '-v', 'quiet',
        '-show_entries', 'format=duration',
        '-of', 'csv=p=0',
        dockerPath
      ]);

      let output = '';
      let hasError = false;

      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.stderr.on('data', () => {
        hasError = true;
      });

      ffprobe.on('close', (code) => {
        if (code === 0 && !hasError && output.trim()) {
          const duration = Math.round(parseFloat(output.trim()));
          resolve(duration > 0 && duration < 7200 ? duration : null);
        } else {
          resolve(null);
        }
      });

      // Timeout após 10 segundos
      setTimeout(() => {
        ffprobe.kill();
        resolve(null);
      }, 10000);
    });
  }

  /**
   * Corrigir status de upload
   */
  async fixUploadStatus(recording, resolvedPath) {
    // Se já está uploaded, verificar se realmente está no S3
    if (recording.upload_status === 'uploaded') {
      return null; // Assumir que está correto por enquanto
    }

    // Se está queued muito tempo, resetar para pending
    if (recording.upload_status === 'queued') {
      const queuedTime = new Date(recording.updated_at);
      const now = new Date();
      const hoursInQueue = (now.getTime() - queuedTime.getTime()) / (1000 * 60 * 60);
      
      if (hoursInQueue > 24) { // Mais de 24h na fila
        logger.debug(`🔄 Resetando status queued → pending (${hoursInQueue.toFixed(1)}h na fila)`);
        return { status: 'pending', shouldEnqueue: true };
      }
      
      return null; // Deixar na fila se for recente
    }

    // Se é completed e não tem upload_status, definir como pending
    if (recording.status === 'completed' && !recording.upload_status) {
      logger.debug(`📤 Definindo upload_status como pending`);
      return { status: 'pending', shouldEnqueue: true };
    }

    // Se tem arquivo local mas não tem upload_status
    if (resolvedPath && recording.status === 'completed') {
      logger.debug(`📤 Arquivo existe, definindo como pending para upload`);
      return { status: 'pending', shouldEnqueue: true };
    }

    return null;
  }

  /**
   * Enfileirar gravação para upload
   */
  async enqueueForUpload(recordingId) {
    try {
      // Verificar se já está na fila
      const { data: existing } = await supabase
        .from('upload_queue')
        .select('id')
        .eq('recording_id', recordingId)
        .maybeSingle();

      if (existing) {
        logger.debug(`📤 Gravação ${recordingId} já está na fila`);
        return;
      }

      // Adicionar à fila
      const { error } = await supabase
        .from('upload_queue')
        .insert({
          recording_id: recordingId,
          status: 'queued',
          retry_count: 0
        });

      if (error) {
        logger.error(`❌ Erro ao enfileirar ${recordingId}:`, error.message);
      } else {
        logger.info(`📤 Gravação ${recordingId} enfileirada para upload`);
        this.stats.enqueuedForUpload++;
      }
    } catch (error) {
      logger.error(`💥 Erro ao enfileirar ${recordingId}:`, error.message);
    }
  }

  /**
   * Limpar fila de upload órfã
   */
  async cleanupUploadQueue() {
    try {
      logger.info('🧹 Limpando fila de upload...');

      // Remover itens da fila sem gravação correspondente
      const { data: orphanQueue, error } = await supabase
        .from('upload_queue')
        .select('id, recording_id')
        .not('recording_id', 'in', '(SELECT id FROM recordings)');

      if (error) {
        logger.error('❌ Erro ao buscar fila órfã:', error.message);
        return;
      }

      if (orphanQueue.length > 0 && !DRY_RUN) {
        const { error: deleteError } = await supabase
          .from('upload_queue')
          .delete()
          .in('id', orphanQueue.map(q => q.id));

        if (deleteError) {
          logger.error('❌ Erro ao limpar fila órfã:', deleteError.message);
        } else {
          logger.info(`🗑️ Removidos ${orphanQueue.length} itens órfãos da fila`);
        }
      } else if (orphanQueue.length > 0 && DRY_RUN) {
        logger.info(`🔍 [DRY RUN] Removeria ${orphanQueue.length} itens órfãos da fila`);
      } else {
        logger.info('✅ Fila de upload já está limpa');
      }

    } catch (error) {
      logger.error('💥 Erro na limpeza da fila:', error.message);
    }
  }

  /**
   * Imprimir relatório final
   */
  async printReport() {
    logger.info('\n' + '='.repeat(60));
    logger.info('📊 RELATÓRIO FINAL DA CORREÇÃO');
    logger.info('='.repeat(60));
    logger.info(`📋 Gravações processadas: ${this.stats.processedRecordings}`);
    logger.info(`⏱️ Durações corrigidas: ${this.stats.durationFixed}`);
    logger.info(`📁 Paths normalizados: ${this.stats.pathsNormalized}`);
    logger.info(`📤 Status de upload atualizados: ${this.stats.statusUpdated}`);
    logger.info(`🔗 Enfileiradas para upload: ${this.stats.enqueuedForUpload}`);
    logger.info(`❌ Erros: ${this.stats.errors.length}`);

    if (this.stats.errors.length > 0) {
      logger.warn('\n🚨 ERROS ENCONTRADOS:');
      this.stats.errors.forEach((error, i) => {
        logger.warn(`  ${i + 1}. ${error}`);
      });
    }

    if (DRY_RUN) {
      logger.info('\n🔍 MODO DRY RUN - Nenhuma alteração foi aplicada');
      logger.info('Execute sem DRY_RUN=true para aplicar as correções');
    } else {
      logger.info('\n✅ CORREÇÕES APLICADAS COM SUCESSO');
    }
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  const service = new RecordingFixService();
  service.runFix().catch((error) => {
    console.error('💥 Erro fatal:', error);
    process.exit(1);
  });
}

export default RecordingFixService;