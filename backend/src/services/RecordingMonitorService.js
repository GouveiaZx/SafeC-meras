/**
 * RecordingMonitorService - Monitora gravações em tempo real e corrige inconsistências
 * 
 * FUNCIONALIDADES OTIMIZADAS:
 * - Monitora gravações a cada 30 segundos (para automação)
 * - Auto-recupera gravações paradas
 * - Força início de gravação para streams ativos sem gravação
 * - Processa arquivos temporários automaticamente
 * - Finaliza gravações órfãs
 */

import { createModuleLogger } from '../config/logger.js';
import { supabaseAdmin } from '../config/database.js';
import axios from 'axios';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class RecordingMonitorService {
  constructor() {
    this.logger = createModuleLogger('RecordingMonitor');
    this.isRunning = false;
    this.interval = null;
    this.ZLM_API_URL = process.env.ZLM_API_URL || 'http://localhost:8000/index/api';
    this.ZLM_SECRET = process.env.ZLM_SECRET || '9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK';
    this.storageBasePath = path.resolve(process.cwd(), 'storage/www/record/live');

    // Lock para prevenir múltiplas chamadas startRecord simultâneas
    this.recordingLocks = new Map();

    // Path para arquivos ZLMediaKit dentro do container Docker
    this.zlmRecordPath = '/opt/media/bin/www/record/live';

    // Configurações de monitoramento de disco
    this.diskWarningThreshold = 80;  // Aviso quando disco > 80%
    this.diskCriticalThreshold = 90; // Crítico quando disco > 90% - força limpeza
    this.deleteLocalAfterUpload = process.env.DELETE_LOCAL_AFTER_UPLOAD === 'true';
    this.lastDiskCheck = 0;
    this.diskCheckInterval = 5 * 60 * 1000; // Verificar a cada 5 minutos

    this.logger.info('🎬 RecordingMonitorService inicializado para automação');
  }

  async start() {
    if (this.isRunning) {
      this.logger.warn('⚠️ Monitor já está executando');
      return;
    }

    this.logger.info('🎬 Iniciando RecordingMonitorService para automação...');
    this.isRunning = true;

    // Executar primeira verificação imediatamente
    await this.runAutomationCycle();

    // Configurar intervalo de 30 segundos para automação
    this.interval = setInterval(async () => {
      try {
        await this.runAutomationCycle();
      } catch (error) {
        this.logger.error('❌ Erro no ciclo de automação:', error);
      }
    }, 30000);

    this.logger.info('✅ RecordingMonitorService iniciado - ciclo de 30s');
  }

  async stop() {
    if (!this.isRunning) return;

    this.logger.info('🛑 Parando RecordingMonitorService...');
    this.isRunning = false;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.logger.info('✅ RecordingMonitorService parado');
  }

  async runAutomationCycle() {
    try {
      this.logger.info('🔄 Executando ciclo de automação...');

      // 1. Verificar streams ativos sem gravação
      await this.checkStreamsWithoutRecording();

      // 2. Verificar gravações órfãs (sem arquivo)
      await this.processOrphanRecordings();

      // 3. Verificar gravações inativas há muito tempo
      await this.checkStaleRecordings();

      // 4. Verificar gravações que excedem 35 minutos (NOVO - previne disco cheio)
      await this.checkOverrunRecordings();

      // 5. Processar arquivos temporários
      await this.processTemporaryFiles();

      // 6. Monitorar uso de disco e limpar arquivos uploadados (a cada 5 min)
      if (Date.now() - this.lastDiskCheck > this.diskCheckInterval) {
        await this.checkDiskUsageAndCleanup();
        this.lastDiskCheck = Date.now();
      }

      this.logger.debug('✅ Ciclo de automação concluído');

    } catch (error) {
      this.logger.error('❌ Erro no ciclo de automação:', error);
    }
  }

  async checkStreamsWithoutRecording() {
    try {
      // Obter streams ativas do ZLMediaKit
      const activeStreams = await this.getActiveStreams();

      if (activeStreams.length === 0) {
        this.logger.debug('📭 Nenhuma stream ativa encontrada');
        return;
      }

      let streamsRecording = 0;
      let streamsStarted = 0;
      let zombiesFixed = 0;

      // SAFETY: Rastrear câmeras já processadas neste ciclo (proteção extra)
      const processedThisCycle = new Set();

      for (const stream of activeStreams) {
        // SAFETY CHECK: Pular se já processada neste ciclo
        if (processedThisCycle.has(stream.stream)) {
          this.logger.warn(`⚠️ Camera ${stream.stream} já processada neste ciclo - ignorando`);
          continue;
        }
        processedThisCycle.add(stream.stream);

        // Se já está gravando no ZLMediaKit
        if (stream.isRecordingMP4) {
          // NOVO: Verificar estado zombi (isRecording=true mas sem arquivo ativo)
          const isZombie = await this.checkZombieState(stream.stream);

          if (isZombie) {
            this.logger.warn(`🧟 Detectado estado zombi para ${stream.stream} - corrigindo...`);

            // Verificar se não há lock ativo
            if (!this.hasActiveLock(stream.stream)) {
              this.acquireLock(stream.stream);
              const fixed = await this.forceRestartRecordingZombie(stream.stream);
              if (fixed) zombiesFixed++;
              this.releaseLockDelayed(stream.stream);
            } else {
              this.logger.debug(`🔒 Lock ativo para ${stream.stream}, ignorando correção zombi`);
            }
          } else {
            streamsRecording++;
            this.logger.debug(`✅ Stream ${stream.stream} gravando corretamente`);
          }
          continue;
        }

        // Verificar se tem gravação ativa no banco
        const { data: activeRecording } = await supabaseAdmin
          .from('recordings')
          .select('id')
          .eq('camera_id', stream.stream)
          .eq('status', 'recording')
          .single();

        // Verificar se câmera tem gravação habilitada
        const { data: camera } = await supabaseAdmin
          .from('cameras')
          .select('recording_enabled')
          .eq('id', stream.stream)
          .single();

        if (!activeRecording && camera?.recording_enabled) {
          // Verificar lock antes de iniciar
          if (!this.hasActiveLock(stream.stream)) {
            this.acquireLock(stream.stream);
            this.logger.info(`🎯 Stream ${stream.stream} ativo mas sem gravação - forçando início`);
            const started = await this.forceStartRecording(stream.stream);
            if (started) streamsStarted++;
            this.releaseLockDelayed(stream.stream);
          } else {
            this.logger.debug(`🔒 Lock ativo para ${stream.stream}, ignorando início`);
          }
        }
      }

      this.logger.info(`📊 Resumo: ${activeStreams.length} streams ativas, ${streamsRecording} gravando, ${streamsStarted} iniciadas, ${zombiesFixed} zombis corrigidos`);

    } catch (error) {
      this.logger.error('❌ Erro ao verificar streams sem gravação:', error);
    }
  }

  async getActiveStreams() {
    try {
      this.logger.debug(`🔍 Consultando ZLM API: ${this.ZLM_API_URL}/getMediaList`);
      
      const response = await axios.get(`${this.ZLM_API_URL}/getMediaList`, {
        params: { secret: this.ZLM_SECRET },
        timeout: 5000
      });

      this.logger.debug(`📡 Resposta ZLM API: code=${response.data.code}, status=${response.status}`);

      if (response.data.code === 0) {
        // Se não há streams ativas, ZLM retorna apenas { "code": 0 } sem campo data
        const streams = response.data.data || [];
        
        this.logger.debug(`📋 Dados brutos do ZLM: ${JSON.stringify(streams).substring(0, 200)}...`);
        
        if (!Array.isArray(streams)) {
          this.logger.debug('🔍 Nenhuma stream ativa encontrada no ZLMediaKit');
          return [];
        }
        
        // Log de todas as streams para debug
        streams.forEach(stream => {
          this.logger.debug(`🎥 Stream detectada: app=${stream.app}, schema=${stream.schema}, stream=${stream.stream}, vhost=${stream.vhost}`);
        });
        
        // Step 1: Filtrar streams relevantes
        const relevantStreams = streams.filter(stream => {
          const isLiveApp = stream.app === 'live';
          const isRelevantSchema = ['hls', 'rtmp', 'rtsp', 'ts', 'fmp4'].includes(stream.schema);
          return isLiveApp && isRelevantSchema;
        });

        this.logger.info(`📋 Streams antes da deduplicação: ${relevantStreams.length}`);

        // Step 2: DEDUPLICAR por stream ID (UUID da câmera)
        // ZLMediaKit retorna múltiplos schemas (hls, ts, rtmp, rtsp, fmp4) para a mesma câmera
        // Isso causava processamento duplicado e reinícios de gravação!
        // Prioridade: hls > rtmp > rtsp > ts > fmp4
        const schemaPreference = ['hls', 'rtmp', 'rtsp', 'ts', 'fmp4'];
        const uniqueStreamsMap = new Map();

        for (const stream of relevantStreams) {
          const streamId = stream.stream;
          const existingStream = uniqueStreamsMap.get(streamId);

          if (!existingStream) {
            uniqueStreamsMap.set(streamId, stream);
          } else {
            // Comparar prioridade de schema - menor índice = maior prioridade
            const existingPriority = schemaPreference.indexOf(existingStream.schema);
            const newPriority = schemaPreference.indexOf(stream.schema);

            const effectiveExisting = existingPriority === -1 ? 999 : existingPriority;
            const effectiveNew = newPriority === -1 ? 999 : newPriority;

            if (effectiveNew < effectiveExisting) {
              uniqueStreamsMap.set(streamId, stream);
              this.logger.debug(`🔄 Deduplicação: ${streamId} - ${existingStream.schema} → ${stream.schema}`);
            }
          }
        }

        const uniqueStreams = Array.from(uniqueStreamsMap.values());

        // Log de deduplicação
        if (relevantStreams.length !== uniqueStreams.length) {
          const removed = relevantStreams.length - uniqueStreams.length;
          this.logger.info(`✂️ Deduplicação removeu ${removed} entradas duplicadas`);
        }

        this.logger.info(`🎯 Streams únicas: ${uniqueStreams.length}`);

        // Step 3: Verificar status de gravação para cada stream ÚNICA
        const streamsWithRecordingStatus = await Promise.all(
          uniqueStreams.map(async (stream) => {
            const isRecordingMP4 = await this.checkIfStreamIsRecordingMP4(stream.stream);
            this.logger.debug(`📹 Stream ${stream.stream} (${stream.schema}): gravando = ${isRecordingMP4}`);
            return {
              ...stream,
              isRecordingMP4
            };
          })
        );

        const recordingCount = streamsWithRecordingStatus.filter(s => s.isRecordingMP4).length;
        this.logger.info(`📊 RESULTADO FINAL: ${streamsWithRecordingStatus.length} câmeras únicas, ${recordingCount} gravando MP4`);

        return streamsWithRecordingStatus;
      } else {
        this.logger.warn(`⚠️ ZLM API retornou código: ${response.data.code}, msg: ${response.data.msg || 'N/A'}`);
      }
      return [];
    } catch (error) {
      this.logger.error('❌ Erro ao obter streams ativas:', {
        message: error.message,
        code: error.code,
        url: `${this.ZLM_API_URL}/getMediaList`,
        status: error.response?.status
      });
      return [];
    }
  }

  /**
   * Verificar se uma stream específica está gravando MP4
   */
  async checkIfStreamIsRecordingMP4(streamId) {
    try {
      const response = await axios.get(`${this.ZLM_API_URL}/isRecording`, {
        params: {
          secret: this.ZLM_SECRET,
          type: 1, // MP4
          vhost: '__defaultVhost__',
          app: 'live',
          stream: streamId
        },
        timeout: 3000
      });

      if (response.data.code === 0) {
        return response.data.status === true; // true = gravando, false = não gravando
      }
      return false;
    } catch (error) {
      this.logger.debug(`Erro ao verificar gravação MP4 para ${streamId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Detectar estado "zombi" - ZLM reporta isRecording=true mas arquivo não está sendo escrito
   * Arquivo ativo no ZLM tem prefixo ponto: .2025-12-02-19-41-40-0.mp4
   * CORREÇÃO: Verifica se o arquivo foi modificado nos últimos 60 segundos
   */
  async checkZombieState(streamId) {
    try {
      // Verificar se existe arquivo ativo (com prefixo ponto) no container ZLM
      // CORREÇÃO CRÍTICA: Usar data do CONTAINER ZLM, não do servidor!
      // O container pode ter timezone diferente (ex: -03 vs -04)
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Obter a data atual do CONTAINER ZLMediaKit (evita problema de timezone)
      let today;
      try {
        const { stdout: containerDate } = await execAsync(
          `docker exec newcam-zlmediakit date +%Y-%m-%d`,
          { timeout: 3000 }
        );
        today = containerDate.trim();
        this.logger.debug(`📅 Data do container ZLM: ${today}`);
      } catch (dateError) {
        // Fallback para data local se falhar
        const now = new Date();
        today = now.getFullYear() + "-" +
          String(now.getMonth() + 1).padStart(2, "0") + "-" +
          String(now.getDate()).padStart(2, "0");
        this.logger.warn(`⚠️ Usando data local como fallback: ${today}`);
      }

      const recordDir = `${this.zlmRecordPath}/${streamId}/${today}/`;

      try {
        // Buscar arquivo oculto mais recente (arquivo em gravação ativa)
        const { stdout: fileResult } = await execAsync(
          `docker exec newcam-zlmediakit find "${recordDir}" -name ".*mp4" -type f 2>/dev/null | head -1`,
          { timeout: 5000 }
        );

        const activeFile = fileResult.trim();

        if (!activeFile) {
          // ANTES de declarar zombi, verificar se há arquivo na pasta do dia ANTERIOR
          // (pode acontecer próximo à meia-noite durante transição de dia)
          const yesterday = new Date(Date.now() - 86400000);
          const yesterdayStr = yesterday.getFullYear() + "-" +
            String(yesterday.getMonth() + 1).padStart(2, "0") + "-" +
            String(yesterday.getDate()).padStart(2, "0");
          const yesterdayDir = `${this.zlmRecordPath}/${streamId}/${yesterdayStr}/`;

          const { stdout: yesterdayResult } = await execAsync(
            `docker exec newcam-zlmediakit find "${yesterdayDir}" -name ".*mp4" -type f 2>/dev/null | head -1`,
            { timeout: 5000 }
          );

          if (yesterdayResult.trim()) {
            this.logger.debug(`✅ Stream ${streamId} tem arquivo ativo no dia anterior (transição de meia-noite)`);
            return false; // Não é zombi, está na transição de dia
          }

          this.logger.warn(`🧟 Estado ZOMBI detectado para ${streamId} - isRecording=true mas sem arquivo ativo`);
          return true; // É estado zombi
        }

        // CORREÇÃO: Verificar se o arquivo foi modificado nos últimos 60 segundos
        // Arquivos que não estão sendo escritos são considerados zombis
        const { stdout: mtimeResult } = await execAsync(
          `docker exec newcam-zlmediakit stat -c %Y "${activeFile}" 2>/dev/null`,
          { timeout: 5000 }
        );

        const fileModifiedTime = parseInt(mtimeResult.trim(), 10);
        const now = Math.floor(Date.now() / 1000);
        const secondsSinceModified = now - fileModifiedTime;

        // Se o arquivo não foi modificado nos últimos 300 segundos (5 min), é zombi
        const ZOMBIE_THRESHOLD_SECONDS = 300;
        if (secondsSinceModified > ZOMBIE_THRESHOLD_SECONDS) {
          this.logger.warn(`🧟 Estado ZOMBI detectado para ${streamId} - arquivo não modificado há ${secondsSinceModified}s (threshold: ${ZOMBIE_THRESHOLD_SECONDS}s)`);
          return true; // É estado zombi
        }

        this.logger.debug(`✅ Stream ${streamId} tem arquivo ativo: ${activeFile} (modificado há ${secondsSinceModified}s)`);
        return false; // Não é zombi

      } catch (execError) {
        // Se falhar o exec, assumir que não é zombi (não interromper fluxo)
        this.logger.debug(`⚠️ Não foi possível verificar arquivos ativos para ${streamId}: ${execError.message}`);
        return false;
      }

    } catch (error) {
      this.logger.error(`❌ Erro ao verificar estado zombi para ${streamId}:`, error);
      return false;
    }
  }

  /**
   * Forçar reinício da gravação (parar + iniciar)
   * Usado para recuperar de estados zombi
   */
  async forceRestartRecordingZombie(streamId) {
    try {
      this.logger.info(`🔄 Forçando reinício de gravação zombi para ${streamId}`);

      // 1. Parar gravação atual (mesmo que zombi)
      try {
        await axios.get(`${this.ZLM_API_URL}/stopRecord`, {
          params: {
            secret: this.ZLM_SECRET,
            type: 1,
            vhost: '__defaultVhost__',
            app: 'live',
            stream: streamId
          },
          timeout: 5000
        });
        this.logger.info(`🛑 Gravação parada para ${streamId}`);
      } catch (stopError) {
        this.logger.warn(`⚠️ Erro ao parar gravação: ${stopError.message}`);
      }

      // 2. Aguardar 2 segundos
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 3. Reiniciar gravação com duração correta
      const response = await axios.get(`${this.ZLM_API_URL}/startRecord`, {
        params: {
          secret: this.ZLM_SECRET,
          type: 1,
          vhost: '__defaultVhost__',
          app: 'live',
          stream: streamId,
          max_second: 1800 // 30 minutos
        },
        timeout: 10000
      });

      if (response.data.code === 0) {
        this.logger.info(`✅ Gravação reiniciada com sucesso para ${streamId}`);
        return true;
      } else {
        this.logger.error(`❌ Falha ao reiniciar gravação: ${response.data.msg}`);
        return false;
      }

    } catch (error) {
      this.logger.error(`❌ Erro ao forçar reinício de gravação para ${streamId}:`, error);
      return false;
    }
  }

  /**
   * Verificar se há lock ativo para uma câmera
   */
  hasActiveLock(streamId) {
    const lockTime = this.recordingLocks.get(streamId);
    if (!lockTime) return false;

    // Lock expira após 30 segundos
    const lockAge = Date.now() - lockTime;
    if (lockAge > 30000) {
      this.recordingLocks.delete(streamId);
      return false;
    }

    return true;
  }

  /**
   * Adquirir lock para uma câmera
   */
  acquireLock(streamId) {
    if (this.hasActiveLock(streamId)) {
      this.logger.debug(`🔒 Lock já ativo para ${streamId}`);
      return false;
    }

    this.recordingLocks.set(streamId, Date.now());
    this.logger.debug(`🔓 Lock adquirido para ${streamId}`);
    return true;
  }

  /**
   * Liberar lock para uma câmera (após timeout)
   */
  releaseLockDelayed(streamId, delayMs = 30000) {
    setTimeout(() => {
      this.recordingLocks.delete(streamId);
      this.logger.debug(`🔓 Lock liberado para ${streamId}`);
    }, delayMs);
  }

  async forceStartRecording(streamId) {
    try {
      this.logger.info(`🎬 Forçando início de gravação MP4 para stream ${streamId}`);

      // VERIFICAÇÃO CRÍTICA: Confirmar se ZLMediaKit já está gravando
      // Esta é a fonte da verdade - evita chamar startRecord desnecessariamente
      const isAlreadyRecording = await this.checkIfStreamIsRecordingMP4(streamId);
      if (isAlreadyRecording) {
        this.logger.info(`✅ Stream ${streamId} já está gravando no ZLMediaKit - nenhuma ação necessária`);
        return true; // Retorna true pois gravação já está ativa
      }

      // Verificar se já existe gravação ativa para evitar duplicatas
      const { data: activeRecordings } = await supabaseAdmin
        .from('recordings')
        .select('id, status, created_at')
        .eq('camera_id', streamId)
        .eq('status', 'recording')
        .order('created_at', { ascending: false });

      if (activeRecordings && activeRecordings.length > 0) {
        this.logger.warn(`⚠️ Já existem ${activeRecordings.length} gravações ativas para ${streamId}. Última: ${activeRecordings[0].id}`);
        return false;
      }

      // Double-check: verificar se gravação foi criada nos últimos 30 segundos
      const recentThreshold = new Date(Date.now() - 30 * 1000).toISOString();
      const { data: recentRecordings } = await supabaseAdmin
        .from('recordings')
        .select('id')
        .eq('camera_id', streamId)
        .gte('created_at', recentThreshold);

      if (recentRecordings && recentRecordings.length > 0) {
        this.logger.warn(`⚠️ Gravação criada recentemente para ${streamId}, aguardando...`);
        return false;
      }

      // Usar a API correta com max_second para sessões de 30 minutos
      this.logger.info(`🔧 Parâmetros startRecord: type=1, vhost=__defaultVhost__, app=live, stream=${streamId}, max_second=1800`);
      
      const response = await axios.get(`${this.ZLM_API_URL}/startRecord`, {
        params: {
          secret: this.ZLM_SECRET,
          type: 1, // Corrigir para integer 1 (MP4)
          vhost: '__defaultVhost__',
          app: 'live',
          stream: streamId,
          max_second: 1800 // 30 minutos
        },
        timeout: 10000
      });
      
      this.logger.info(`📡 Resposta ZLM startRecord: code=${response.data?.code}, msg=${response.data?.msg || 'N/A'}`);

      if (response.data.code === 0) {
        this.logger.info(`✅ Gravação MP4 forçada iniciada para ${streamId} (30min)`);

        // NOTA: NÃO criar registro provisório aqui!
        // O registro será criado APENAS quando on_record_mp4 for chamado (arquivo finalizado)
        // Isso garante que a lista de gravações só mostra arquivos reproduzíveis

        return true;
      } else {
        this.logger.error(`❌ Falha ao forçar gravação para ${streamId}:`, response.data);
        return false;
      }

    } catch (error) {
      this.logger.error(`❌ Erro ao forçar gravação para ${streamId}:`, error.message);
      return false;
    }
  }

  async processOrphanRecordings() {
    try {
      // Buscar gravações órfãs (status=recording mas sem file_path há mais de 5 minutos)
      const { data: orphanRecordings } = await supabaseAdmin
        .from('recordings')
        .select('id, camera_id, status, start_time, created_at')
        .eq('status', 'recording')
        .is('file_path', null)
        .lt('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString());

      if (orphanRecordings && orphanRecordings.length > 0) {
        this.logger.info(`🔍 Encontradas ${orphanRecordings.length} gravações órfãs`);

        for (const recording of orphanRecordings) {
          await this.tryRecoverOrphanRecording(recording);
        }
      }

    } catch (error) {
      this.logger.error('❌ Erro ao processar gravações órfãs:', error);
    }
  }

  async tryRecoverOrphanRecording(recording) {
    try {
      const cameraId = recording.camera_id;
      const startTime = new Date(recording.start_time);
      
      // Tentar encontrar arquivo correspondente
      const possibleFile = await this.findRecordingFile(cameraId, startTime);
      
      if (possibleFile) {
        this.logger.info(`🔗 Vinculando arquivo encontrado: ${possibleFile}`);
        
        await supabaseAdmin
          .from('recordings')
          .update({
            file_path: possibleFile,
            local_path: possibleFile,
            status: 'completed',
            updated_at: new Date().toISOString()
          })
          .eq('id', recording.id);

      } else {
        // Se não encontrar arquivo após 15 minutos, marcar como erro
        const ageInMinutes = (Date.now() - new Date(recording.created_at).getTime()) / (1000 * 60);
        
        if (ageInMinutes > 15) {
          this.logger.warn(`⚠️ Marcando gravação órfã como erro (idade: ${ageInMinutes.toFixed(1)}min)`);
          
          await supabaseAdmin
            .from('recordings')
            .update({
              status: 'error',
              metadata: { 
                error: 'Arquivo não encontrado após 15 minutos',
                orphaned_at: new Date().toISOString()
              },
              updated_at: new Date().toISOString()
            })
            .eq('id', recording.id);
        }
      }

    } catch (error) {
      this.logger.error(`❌ Erro ao recuperar gravação órfã ${recording.id}:`, error);
    }
  }

  async findRecordingFile(cameraId, startTime, toleranceMinutes = 5) {
    try {
      const basePath = path.join(this.storageBasePath, cameraId);
      
      // Verificar se diretório da câmera existe
      try {
        await fs.access(basePath);
      } catch {
        return null;
      }

      // Gerar possíveis nomes de arquivo baseado no tempo
      const possibleFilenames = [];
      
      for (let offset = -toleranceMinutes; offset <= toleranceMinutes; offset++) {
        const adjustedTime = new Date(startTime.getTime() + (offset * 60000));
        const dateStr = adjustedTime.toISOString().split('T')[0];
        const timeStr = adjustedTime.toISOString()
          .replace('T', '-')
          .replace(/:/g, '-')
          .split('.')[0];
        
        possibleFilenames.push(`${timeStr}-0.mp4`);
        possibleFilenames.push(`${timeStr}-1.mp4`);
        possibleFilenames.push(`${timeStr}.mp4`);
      }

      // Verificar cada possível localização
      const dateFolder = startTime.toISOString().split('T')[0];
      const searchPaths = [
        path.join(basePath, dateFolder),
        basePath
      ];

      for (const searchPath of searchPaths) {
        try {
          const files = await fs.readdir(searchPath);
          
          for (const filename of possibleFilenames) {
            if (files.includes(filename)) {
              const relativePath = path.relative(process.cwd(), path.join(searchPath, filename));
              return relativePath.replace(/\\/g, '/');
            }
          }
        } catch {
          continue;
        }
      }

      return null;

    } catch (error) {
      this.logger.error(`❌ Erro ao buscar arquivo para ${cameraId}:`, error);
      return null;
    }
  }

  async checkStaleRecordings() {
    try {
      // Gravações "recording" há mais de 45 minutos (deveria ser 30min max)
      const staleThreshold = new Date(Date.now() - 45 * 60 * 1000).toISOString();
      
      const { data: staleRecordings } = await supabaseAdmin
        .from('recordings')
        .select('id, camera_id, start_time, created_at')
        .eq('status', 'recording')
        .lt('created_at', staleThreshold);

      if (staleRecordings && staleRecordings.length > 0) {
        this.logger.warn(`⚠️ Encontradas ${staleRecordings.length} gravações obsoletas`);

        for (const recording of staleRecordings) {
          // Tentar encontrar arquivo e finalizar
          const possibleFile = await this.findRecordingFile(
            recording.camera_id, 
            new Date(recording.start_time),
            10 // tolerância maior para gravações antigas
          );

          if (possibleFile) {
            await supabaseAdmin
              .from('recordings')
              .update({
                status: 'completed',
                file_path: possibleFile,
                local_path: possibleFile,
                end_time: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .eq('id', recording.id);

            this.logger.info(`✅ Gravação obsoleta finalizada: ${recording.id}`);
          } else {
            await supabaseAdmin
              .from('recordings')
              .update({
                status: 'error',
                metadata: { error: 'Gravação obsoleta sem arquivo encontrado' },
                updated_at: new Date().toISOString()
              })
              .eq('id', recording.id);

            this.logger.warn(`⚠️ Gravação obsoleta marcada como erro: ${recording.id}`);
          }
        }
      }

    } catch (error) {
      this.logger.error('❌ Erro ao verificar gravações obsoletas:', error);
    }
  }

  async processTemporaryFiles() {
    try {
      // Buscar arquivos temporários (começam com ponto)
      const tempFiles = await this.findTemporaryFiles();
      
      if (tempFiles.length > 0) {
        this.logger.info(`🔄 Processando ${tempFiles.length} arquivos temporários`);

        for (const tempFile of tempFiles) {
          await this.finalizeTemporaryFile(tempFile);
        }
      }

    } catch (error) {
      this.logger.error('❌ Erro ao processar arquivos temporários:', error);
    }
  }

  async findTemporaryFiles() {
    const tempFiles = [];
    // IMPORTANTE: Só processar arquivos que NÃO foram modificados nos últimos 5 minutos
    // Isso evita renomear arquivos que ainda estão sendo gravados pelo ZLMediaKit
    const MIN_AGE_MINUTES = 5;
    const minAgeMs = MIN_AGE_MINUTES * 60 * 1000;
    const now = Date.now();

    try {
      const cameraFolders = await fs.readdir(this.storageBasePath);

      for (const cameraFolder of cameraFolders) {
        const cameraPath = path.join(this.storageBasePath, cameraFolder);

        try {
          const dateFolders = await fs.readdir(cameraPath);

          for (const dateFolder of dateFolders) {
            const datePath = path.join(cameraPath, dateFolder);

            try {
              const files = await fs.readdir(datePath);

              for (const file of files) {
                if (file.startsWith('.') && file.endsWith('.mp4')) {
                  const filePath = path.join(datePath, file);

                  // Verificar idade do arquivo (mtime)
                  try {
                    const stats = await fs.stat(filePath);
                    const fileAgeMs = now - stats.mtimeMs;

                    // SKIP arquivos que foram modificados recentemente (ainda gravando)
                    if (fileAgeMs < minAgeMs) {
                      this.logger.debug(`⏳ Arquivo ${file} ainda em uso (modificado há ${Math.round(fileAgeMs/1000)}s), ignorando`);
                      continue;
                    }

                    tempFiles.push({
                      path: filePath,
                      cameraId: cameraFolder,
                      date: dateFolder,
                      filename: file,
                      ageMinutes: Math.round(fileAgeMs / 60000)
                    });
                  } catch (statErr) {
                    this.logger.debug(`⚠️ Não foi possível verificar stats de ${file}: ${statErr.message}`);
                    continue;
                  }
                }
              }
            } catch (err) {
              continue;
            }
          }
        } catch (err) {
          continue;
        }
      }

    } catch (error) {
      this.logger.error('❌ Erro ao buscar arquivos temporários:', error);
    }

    return tempFiles;
  }

  async finalizeTemporaryFile(tempFileInfo) {
    try {
      const { path: tempPath, cameraId, date, filename } = tempFileInfo;
      
      // Nome final (sem o ponto inicial)
      const finalFilename = filename.substring(1);
      const finalPath = path.join(path.dirname(tempPath), finalFilename);
      
      // Renomear arquivo
      await fs.rename(tempPath, finalPath);
      
      const relativePath = path.relative(process.cwd(), finalPath).replace(/\\/g, '/');
      
      this.logger.info(`✅ Arquivo temporário finalizado: ${finalFilename}`);

      // Tentar vincular a uma gravação órfã
      const fileTime = this.extractTimeFromFilename(finalFilename);
      if (fileTime) {
        await this.linkFileToOrphanRecording(cameraId, fileTime, relativePath);
      }

    } catch (error) {
      this.logger.error(`❌ Erro ao finalizar arquivo temporário:`, error);
    }
  }

  extractTimeFromFilename(filename) {
    // Extrair timestamp de nomes como: 2025-08-21-04-06-25-0.mp4
    const match = filename.match(/^(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})/);
    if (match) {
      const timeStr = match[1];
      const [year, month, day, hour, minute, second] = timeStr.split('-');
      return new Date(year, month - 1, day, hour, minute, second);
    }
    return null;
  }

  async linkFileToOrphanRecording(cameraId, fileTime, filePath) {
    try {
      // Buscar gravação órfã próxima no tempo (±5 minutos)
      const timeStart = new Date(fileTime.getTime() - 5 * 60000).toISOString();
      const timeEnd = new Date(fileTime.getTime() + 5 * 60000).toISOString();

      const { data: orphanRecording } = await supabaseAdmin
        .from('recordings')
        .select('id, start_time')
        .eq('camera_id', cameraId)
        .eq('status', 'recording')
        .is('file_path', null)
        .gte('start_time', timeStart)
        .lte('start_time', timeEnd)
        .single();

      if (orphanRecording) {
        await supabaseAdmin
          .from('recordings')
          .update({
            status: 'completed',
            file_path: filePath,
            local_path: filePath,
            end_time: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', orphanRecording.id);

        this.logger.info(`🔗 Arquivo vinculado à gravação órfã: ${orphanRecording.id}`);
      }

    } catch (error) {
      // Não é crítico, apenas log
      this.logger.warn(`⚠️ Não foi possível vincular arquivo à gravação órfã:`, error.message);
    }
  }

  /**
   * NOVO: Monitorar uso de disco e limpar arquivos já uploadados
   * Previne disco cheio limpando arquivos que já estão no S3
   */
  async checkDiskUsageAndCleanup() {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Obter uso de disco do diretório de gravações
      try {
        const { stdout: dfOutput } = await execAsync(
          `df -h "${this.storageBasePath}" | tail -1 | awk '{print $5}'`,
          { timeout: 5000 }
        );

        const usageStr = dfOutput.trim().replace('%', '');
        const usagePercent = parseInt(usageStr, 10);

        if (isNaN(usagePercent)) {
          this.logger.debug(`⚠️ Não foi possível obter uso de disco: ${dfOutput}`);
          return;
        }

        this.logger.info(`💾 Uso de disco: ${usagePercent}%`);

        // Verificar se precisa limpar
        if (usagePercent >= this.diskCriticalThreshold) {
          this.logger.warn(`🚨 DISCO CRÍTICO: ${usagePercent}% - Iniciando limpeza de emergência!`);
          await this.cleanupUploadedFiles(true); // Força limpeza
        } else if (usagePercent >= this.diskWarningThreshold) {
          this.logger.warn(`⚠️ DISCO ALTO: ${usagePercent}% - Limpando arquivos uploadados`);
          await this.cleanupUploadedFiles(false);
        } else {
          // Limpeza normal (apenas arquivos explicitamente marcados)
          if (this.deleteLocalAfterUpload) {
            await this.cleanupUploadedFiles(false);
          }
        }

      } catch (execError) {
        // Tentar comando alternativo (Windows ou container)
        try {
          const { stdout: dockerDf } = await execAsync(
            `docker exec newcam-zlmediakit df -h /opt/media/bin/www | tail -1 | awk '{print $5}'`,
            { timeout: 5000 }
          );

          const usageStr = dockerDf.trim().replace('%', '');
          const usagePercent = parseInt(usageStr, 10);

          if (!isNaN(usagePercent)) {
            this.logger.info(`💾 Uso de disco (container): ${usagePercent}%`);

            if (usagePercent >= this.diskCriticalThreshold) {
              this.logger.warn(`🚨 DISCO CRÍTICO: ${usagePercent}% - Iniciando limpeza de emergência!`);
              await this.cleanupUploadedFiles(true);
            } else if (usagePercent >= this.diskWarningThreshold) {
              this.logger.warn(`⚠️ DISCO ALTO: ${usagePercent}% - Limpando arquivos uploadados`);
              await this.cleanupUploadedFiles(false);
            }
          }
        } catch (dockerError) {
          this.logger.debug(`⚠️ Não foi possível verificar disco: ${execError.message}`);
        }
      }

    } catch (error) {
      this.logger.error('❌ Erro ao verificar uso de disco:', error);
    }
  }

  /**
   * NOVO: Limpar arquivos locais que já foram uploadados para o S3
   * @param {boolean} forceCleanup - Se true, limpa mesmo arquivos antigos
   */
  async cleanupUploadedFiles(forceCleanup = false) {
    try {
      this.logger.info(`🧹 Iniciando limpeza de arquivos uploadados (force=${forceCleanup})`);

      // Buscar gravações que já foram uploadadas com sucesso
      const { data: uploadedRecordings, error } = await supabaseAdmin
        .from('recordings')
        .select('id, filename, file_path, local_path, camera_id, created_at')
        .eq('upload_status', 'uploaded')
        .not('file_path', 'is', null)
        .order('created_at', { ascending: true })
        .limit(forceCleanup ? 100 : 20);

      if (error) {
        this.logger.error('❌ Erro ao buscar gravações uploadadas:', error);
        return;
      }

      if (!uploadedRecordings || uploadedRecordings.length === 0) {
        this.logger.debug('📭 Nenhuma gravação uploadada para limpar');
        return;
      }

      this.logger.info(`🔍 Encontradas ${uploadedRecordings.length} gravações para verificar limpeza`);

      let deletedCount = 0;
      let errorCount = 0;
      let totalSize = 0;

      for (const recording of uploadedRecordings) {
        try {
          // Construir path completo
          const localPath = recording.local_path || recording.file_path;
          if (!localPath) continue;

          let fullPath;
          if (localPath.startsWith('/')) {
            fullPath = localPath;
          } else if (localPath.startsWith('storage/')) {
            fullPath = path.resolve(process.cwd(), localPath);
          } else {
            fullPath = path.resolve(this.storageBasePath, '..', '..', '..', localPath);
          }

          // Verificar se arquivo existe
          try {
            const stats = await fs.stat(fullPath);
            totalSize += stats.size;

            // Se forceCleanup ou arquivo tem mais de 1 hora, deletar
            const fileAge = Date.now() - stats.mtimeMs;
            const oneHour = 60 * 60 * 1000;

            if (forceCleanup || fileAge > oneHour) {
              await fs.unlink(fullPath);
              deletedCount++;

              this.logger.info(`🗑️ Arquivo deletado: ${recording.filename} (${(stats.size / 1024 / 1024).toFixed(1)}MB)`);

              // Atualizar registro para indicar que arquivo local foi removido
              await supabaseAdmin
                .from('recordings')
                .update({
                  local_path: null,
                  metadata: {
                    local_deleted_at: new Date().toISOString(),
                    local_deleted_reason: forceCleanup ? 'disk_critical' : 'cleanup_routine'
                  },
                  updated_at: new Date().toISOString()
                })
                .eq('id', recording.id);
            }

          } catch (statErr) {
            if (statErr.code === 'ENOENT') {
              // Arquivo já não existe, apenas atualizar registro
              await supabaseAdmin
                .from('recordings')
                .update({
                  local_path: null,
                  updated_at: new Date().toISOString()
                })
                .eq('id', recording.id);
            }
          }

        } catch (fileError) {
          errorCount++;
          this.logger.debug(`⚠️ Erro ao processar ${recording.filename}: ${fileError.message}`);
        }
      }

      if (deletedCount > 0) {
        const sizeMB = (totalSize / 1024 / 1024).toFixed(1);
        this.logger.info(`✅ Limpeza concluída: ${deletedCount} arquivos deletados (~${sizeMB}MB liberados)`);
      } else {
        this.logger.debug('📭 Nenhum arquivo precisou ser deletado neste ciclo');
      }

    } catch (error) {
      this.logger.error('❌ Erro ao limpar arquivos uploadados:', error);
    }
  }

  /**
   * NOVO: Detectar gravações que excedem 35 minutos e forçar reinício
   * Isso previne arquivos gigantes que enchem o disco
   * ZLMediaKit deveria segmentar a cada 30 min (max_second=1800), mas às vezes falha
   */
  async checkOverrunRecordings() {
    const OVERRUN_THRESHOLD_SECONDS = 2100; // 35 minutos (margem de 5 min além dos 30)

    try {
      this.logger.debug('🔍 Verificando gravações que excedem 35 minutos...');

      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Obter data local atual (ZLMediaKit usa timezone do servidor)
      const now = new Date();
      const today = now.getFullYear() + "-" +
        String(now.getMonth() + 1).padStart(2, "0") + "-" +
        String(now.getDate()).padStart(2, "0");

      // Buscar todos os arquivos ativos (com prefixo ponto) no ZLMediaKit
      const recordBasePath = this.zlmRecordPath;

      try {
        // Encontrar arquivos ocultos (.mp4) que são gravações ativas
        const { stdout: activeFiles } = await execAsync(
          `docker exec newcam-zlmediakit find "${recordBasePath}" -name ".*mp4" -type f 2>/dev/null`,
          { timeout: 10000 }
        );

        if (!activeFiles.trim()) {
          this.logger.debug('📭 Nenhum arquivo de gravação ativo encontrado');
          return;
        }

        const files = activeFiles.trim().split('\n').filter(f => f);
        this.logger.info(`🔍 Encontrados ${files.length} arquivos de gravação ativos`);

        let overrunCount = 0;
        let fixedCount = 0;

        for (const filePath of files) {
          try {
            // Extrair informações do path: /opt/media/bin/www/record/live/{camera_id}/{date}/.{timestamp}.mp4
            const pathParts = filePath.split('/');
            const filename = pathParts[pathParts.length - 1];
            const cameraId = pathParts[pathParts.length - 3];

            // Extrair timestamp do nome: .2025-12-09-21-27-53-0.mp4
            const timestampMatch = filename.match(/\.(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})/);

            if (!timestampMatch) {
              this.logger.debug(`⚠️ Não foi possível extrair timestamp de: ${filename}`);
              continue;
            }

            const timestampStr = timestampMatch[1];
            const [year, month, day, hour, minute, second] = timestampStr.split('-').map(Number);

            // Criar data usando timezone local
            const startTime = new Date(year, month - 1, day, hour, minute, second);
            const elapsedSeconds = Math.floor((now.getTime() - startTime.getTime()) / 1000);

            this.logger.debug(`📹 ${cameraId}: arquivo iniciou há ${Math.floor(elapsedSeconds/60)} minutos`);

            // Verificar se excede o threshold
            if (elapsedSeconds > OVERRUN_THRESHOLD_SECONDS) {
              overrunCount++;
              const elapsedMinutes = Math.floor(elapsedSeconds / 60);
              this.logger.warn(`⚠️ OVERRUN DETECTADO: ${cameraId} gravando há ${elapsedMinutes} minutos (threshold: ${OVERRUN_THRESHOLD_SECONDS/60} min)`);

              // Verificar lock antes de corrigir
              if (!this.hasActiveLock(cameraId)) {
                this.acquireLock(cameraId);

                this.logger.info(`🔄 Forçando reinício de gravação para ${cameraId} (overrun: ${elapsedMinutes}min)`);
                const fixed = await this.forceRestartRecordingZombie(cameraId);

                if (fixed) {
                  fixedCount++;
                  this.logger.info(`✅ Gravação reiniciada com sucesso para ${cameraId}`);
                } else {
                  this.logger.error(`❌ Falha ao reiniciar gravação para ${cameraId}`);
                }

                this.releaseLockDelayed(cameraId);
              } else {
                this.logger.debug(`🔒 Lock ativo para ${cameraId}, aguardando próximo ciclo`);
              }
            }
          } catch (fileError) {
            this.logger.debug(`⚠️ Erro ao processar arquivo ${filePath}: ${fileError.message}`);
          }
        }

        if (overrunCount > 0) {
          this.logger.info(`📊 Overrun: ${overrunCount} detectados, ${fixedCount} corrigidos`);
        }

      } catch (execError) {
        this.logger.debug(`⚠️ Não foi possível verificar arquivos ativos: ${execError.message}`);
      }

    } catch (error) {
      this.logger.error('❌ Erro ao verificar gravações overrun:', error);
    }
  }

  async getStatus() {
    return {
      isRunning: this.isRunning,
      intervalMs: this.interval ? 30000 : null,
      lastRun: new Date().toISOString()
    };
  }
}

export default new RecordingMonitorService();