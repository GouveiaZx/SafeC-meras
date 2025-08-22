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

      // 4. Processar arquivos temporários
      await this.processTemporaryFiles();

      this.logger.debug('✅ Ciclo de automação concluído');

    } catch (error) {
      this.logger.error('❌ Erro no ciclo de automação:', error);
    }
  }

  async checkStreamsWithoutRecording() {
    try {
      // Obter streams ativas do ZLMediaKit
      const activeStreams = await this.getActiveStreams();
      
      if (activeStreams.length === 0) return;

      for (const stream of activeStreams) {
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

        if (!activeRecording && camera?.recording_enabled && !stream.isRecordingMP4) {
          this.logger.info(`🎯 Stream ${stream.stream} ativo mas sem gravação - forçando início`);
          await this.forceStartRecording(stream.stream);
        }
      }

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
        
        // Filtrar streams relevantes - incluir diferentes esquemas
        const relevantStreams = streams.filter(stream => {
          const isLiveApp = stream.app === 'live';
          const isRelevantSchema = ['hls', 'rtmp', 'rtsp', 'ts'].includes(stream.schema);
          this.logger.debug(`🔍 Avaliando stream ${stream.stream}: app=${isLiveApp}, schema=${isRelevantSchema} (${stream.schema})`);
          return isLiveApp && isRelevantSchema;
        });
        
        this.logger.info(`🎯 Streams relevantes filtradas: ${relevantStreams.length} de ${streams.length} total`);
        
        // Verificar status de gravação MP4 para cada stream
        const streamsWithRecordingStatus = await Promise.all(
          relevantStreams.map(async (stream) => {
            const isRecordingMP4 = await this.checkIfStreamIsRecordingMP4(stream.stream);
            this.logger.debug(`📹 Stream ${stream.stream}: gravando MP4 = ${isRecordingMP4}`);
            return {
              ...stream,
              isRecordingMP4
            };
          })
        );
        
        const recordingCount = streamsWithRecordingStatus.filter(s => s.isRecordingMP4).length;
        this.logger.info(`📊 RESULTADO FINAL: ${streamsWithRecordingStatus.length} streams ativas, ${recordingCount} gravando MP4`);
        
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
        return response.data.online === true; // true = gravando, false = não gravando
      }
      return false;
    } catch (error) {
      this.logger.debug(`Erro ao verificar gravação MP4 para ${streamId}: ${error.message}`);
      return false;
    }
  }

  async forceStartRecording(streamId) {
    try {
      this.logger.info(`🎬 Forçando início de gravação MP4 para stream ${streamId}`);
      
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
        
        // Criar entrada no banco (não usar upsert para evitar conflitos)
        const now = new Date().toISOString();
        const { data: recording, error: insertError } = await supabaseAdmin
          .from('recordings')
          .insert([{
            camera_id: streamId,
            status: 'recording',
            start_time: now,
            created_at: now,
            updated_at: now,
            metadata: { 
              started_by: 'RecordingMonitorService',
              forced: true,
              automation: true,
              max_duration: 1800,
              recording_type: 'mp4'
            }
          }])
          .select()
          .single();

        if (insertError) {
          this.logger.warn(`⚠️ Erro ao criar registro de gravação: ${insertError.message}`);
        } else {
          this.logger.info(`📝 Registro de gravação criado: ${recording.id}`);
        }

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
                  tempFiles.push({
                    path: path.join(datePath, file),
                    cameraId: cameraFolder,
                    date: dateFolder,
                    filename: file
                  });
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

  async getStatus() {
    return {
      isRunning: this.isRunning,
      intervalMs: this.interval ? 30000 : null,
      lastRun: new Date().toISOString()
    };
  }
}

export default new RecordingMonitorService();