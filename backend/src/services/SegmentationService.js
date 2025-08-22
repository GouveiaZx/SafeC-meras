import axios from 'axios';
import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import { createClient } from '@supabase/supabase-js';
import logger from '../utils/logger.js';
import RecordingService from './RecordingService.js';

class SegmentationService {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    this.zlmApiUrl = process.env.ZLM_API_URL || 'http://localhost:8000';
    this.zlmSecret = process.env.ZLM_SECRET || '9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK';
    this.segmentationInterval = process.env.SEGMENTATION_INTERVAL_MINUTES || 1; // 1 minuto por padrão
    this.isRunning = false;
    this.activeStreams = new Map();
    this.recordingService = RecordingService;
  }

  /**
   * Inicia o serviço de segmentação automática
   */
  start() {
    if (this.isRunning) {
      logger.warn('SegmentationService já está em execução');
      return;
    }

    this.isRunning = true;
    logger.info(`Iniciando SegmentationService com intervalo de ${this.segmentationInterval} minutos`);

    // Agenda a segmentação automática
    this.scheduleSegmentation();

    // Monitora streams ativas
    this.startStreamMonitoring();

    logger.info('SegmentationService iniciado com sucesso');
  }

  /**
   * Para o serviço de segmentação automática
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('SegmentationService não está em execução');
      return;
    }

    this.isRunning = false;
    
    // Para todos os cron jobs
    if (this.segmentationCron) {
      this.segmentationCron.stop();
    }
    if (this.monitoringCron) {
      this.monitoringCron.stop();
    }

    logger.info('SegmentationService parado');
  }

  /**
   * Agenda a segmentação automática usando cron
   */
  scheduleSegmentation() {
    // Executa a cada X minutos (configurável)
    const cronExpression = `*/${this.segmentationInterval} * * * *`;
    
    this.segmentationCron = cron.schedule(cronExpression, async () => {
      try {
        await this.performSegmentation();
      } catch (error) {
        logger.error('Erro durante segmentação automática:', error);
      }
    }, {
      scheduled: true,
      timezone: 'America/Sao_Paulo'
    });

    logger.info(`Segmentação automática agendada: ${cronExpression}`);
  }

  /**
   * Inicia o monitoramento de streams ativas
   */
  startStreamMonitoring() {
    // Monitora streams a cada 1 minuto
    this.monitoringCron = cron.schedule('*/1 * * * *', async () => {
      try {
        await this.updateActiveStreams();
        await this.monitorNewRecordings(); // Monitorar novos arquivos MP4
      } catch (error) {
        logger.error('Erro durante monitoramento de streams:', error);
      }
    }, {
      scheduled: true,
      timezone: 'America/Sao_Paulo'
    });

    logger.info('Monitoramento de streams iniciado');
  }

  /**
   * Atualiza a lista de streams ativas
   */
  async updateActiveStreams() {
    try {
      const response = await axios.get(`${this.zlmApiUrl}/index/api/getMediaList`, {
        params: { secret: this.zlmSecret },
        timeout: 5000
      });

      if (response.data.code === 0 && response.data.data) {
        const currentStreams = new Map();
        
        response.data.data.forEach(stream => {
          const streamKey = `${stream.app}/${stream.stream}`;
          currentStreams.set(streamKey, {
            app: stream.app,
            stream: stream.stream,
            schema: stream.schema,
            vhost: stream.vhost,
            originType: stream.originType,
            originTypeStr: stream.originTypeStr,
            createStamp: stream.createStamp,
            aliveSecond: stream.aliveSecond,
            bytesSpeed: stream.bytesSpeed,
            readerCount: stream.readerCount,
            totalReaderCount: stream.totalReaderCount
          });
        });

        // Detecta novas streams
        for (const [streamKey, streamInfo] of currentStreams) {
          if (!this.activeStreams.has(streamKey)) {
            logger.info(`Nova stream detectada: ${streamKey}`);
            await this.onStreamStarted(streamKey, streamInfo);
          }
        }

        // Detecta streams que pararam
        for (const [streamKey] of this.activeStreams) {
          if (!currentStreams.has(streamKey)) {
            logger.info(`Stream parou: ${streamKey}`);
            await this.onStreamStopped(streamKey);
          }
        }

        this.activeStreams = currentStreams;
        
        if (currentStreams.size > 0) {
          logger.debug(`Streams ativas: ${currentStreams.size}`);
        }
      }
    } catch (error) {
      logger.error('Erro ao atualizar streams ativas:', error.message);
    }
  }

  /**
   * Executa a segmentação automática para todas as streams ativas
   */
  async performSegmentation() {
    // LOGS DE DEPURAÇÃO - INVESTIGAÇÃO DE DUPLICAÇÃO
    logger.info('🔍 [DEBUG] [SegmentationService] Executando segmentação automática...', {
      timestamp: new Date().toISOString(),
      interval_minutes: process.env.SEGMENTATION_INTERVAL_MINUTES || 30,
      trigger: 'cron_job'
    });
    
    if (this.activeStreams.size === 0) {
      logger.info('🔍 [DEBUG] [SegmentationService] Nenhuma stream ativa encontrada para segmentação');
      return;
    }

    logger.info(`🔍 [DEBUG] [SegmentationService] Encontradas ${this.activeStreams.size} streams ativas para segmentação:`, {
      streams: Array.from(this.activeStreams.entries()).map(([key, info]) => ({ 
        streamKey: key, 
        stream: info.stream, 
        app: info.app, 
        vhost: info.vhost 
      })),
      timestamp: new Date().toISOString()
    });

    const segmentationPromises = [];
    
    for (const [streamKey, streamInfo] of this.activeStreams) {
      segmentationPromises.push(this.segmentStream(streamKey, streamInfo));
    }

    const results = await Promise.allSettled(segmentationPromises);
    
    let successCount = 0;
    let errorCount = 0;
    
    results.forEach((result, index) => {
      const streamKey = Array.from(this.activeStreams.keys())[index];
      if (result.status === 'fulfilled') {
        successCount++;
        logger.info(`🔍 [DEBUG] [SegmentationService] Stream ${streamKey} segmentada com sucesso`, {
          timestamp: new Date().toISOString()
        });
      } else {
        errorCount++;
        logger.error(`❌ [DEBUG] [SegmentationService] Erro na segmentação da stream ${streamKey}:`, {
          error: result.reason?.message || result.reason,
          timestamp: new Date().toISOString()
        });
      }
    });

    logger.info(`🔍 [DEBUG] [SegmentationService] Segmentação concluída:`, {
      successCount,
      errorCount,
      timestamp: new Date().toISOString(),
      total_streams: this.activeStreams.size
    });
  }

  /**
   * Segmenta uma stream específica
   */
  async segmentStream(streamKey, streamInfo) {
    try {
      // LOGS DE DEPURAÇÃO - INVESTIGAÇÃO DE DUPLICAÇÃO
      logger.info(`🔍 [DEBUG] [SegmentationService] Segmentando stream: ${streamKey}`, {
        streamKey,
        stream: streamInfo.stream,
        app: streamInfo.app,
        vhost: streamInfo.vhost,
        timestamp: new Date().toISOString(),
        action: 'start_segmentation'
      });
      
      // Extrai o cameraId do nome da stream
      const cameraId = this.extractCameraId(streamInfo.stream);
      
      if (!cameraId) {
        logger.warn(`🔍 [DEBUG] [SegmentationService] Não foi possível extrair cameraId da stream: ${streamInfo.stream}`, {
          streamKey,
          stream: streamInfo.stream,
          timestamp: new Date().toISOString()
        });
        return;
      }

      logger.info(`🔍 [DEBUG] [SegmentationService] CameraId extraído: ${cameraId}`, {
        streamKey,
        cameraId,
        timestamp: new Date().toISOString()
      });

      // Verifica se há gravação ativa para esta câmera
      const { data: activeRecording, error } = await this.supabase
        .from('recordings')
        .select('*')
        .eq('camera_id', cameraId)
        .eq('status', 'recording')
        .single();
      
      if (error && error.code !== 'PGRST116') {
        logger.error('🔍 [DEBUG] [SegmentationService] Erro ao buscar gravação ativa:', {
          error,
          cameraId,
          streamKey,
          timestamp: new Date().toISOString()
        });
        return;
      }

      if (!activeRecording) {
        logger.debug(`🔍 [DEBUG] [SegmentationService] Nenhuma gravação ativa encontrada para câmera ${cameraId}`, {
          cameraId,
          streamKey,
          timestamp: new Date().toISOString()
        });
        return;
      }

      logger.info(`🔍 [DEBUG] [SegmentationService] Gravação ativa encontrada para câmera ${cameraId}`, {
        recordingId: activeRecording.id,
        cameraId,
        streamKey,
        timestamp: new Date().toISOString()
      });

      // Para a gravação atual
      logger.info(`🔍 [DEBUG] [SegmentationService] Parando gravação atual para ${streamKey}`, {
        timestamp: new Date().toISOString(),
        action: 'stop_recording'
      });
      
      await this.stopRecording(streamKey, streamInfo);
      
      // Aguarda um breve momento
      logger.info(`🔍 [DEBUG] [SegmentationService] Aguardando finalização da gravação para ${streamKey}`, {
        timestamp: new Date().toISOString(),
        wait_time: '1000ms'
      });
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Inicia uma nova gravação
      logger.info(`🔍 [DEBUG] [SegmentationService] Reiniciando gravação para ${streamKey}`, {
        timestamp: new Date().toISOString(),
        action: 'restart_recording'
      });
      
      await this.startRecording(streamKey, streamInfo);
      
      // Atualiza o banco de dados
      logger.info(`🔍 [DEBUG] [SegmentationService] Atualizando banco de dados para ${streamKey}`, {
        timestamp: new Date().toISOString(),
        action: 'update_database'
      });
      
      await this.updateRecordingSegmentation(activeRecording, cameraId);
      
      logger.info(`🔍 [DEBUG] [SegmentationService] Segmentação concluída para stream: ${streamKey}`, {
        streamKey,
        cameraId,
        timestamp: new Date().toISOString(),
        action: 'segmentation_completed'
      });
      
    } catch (error) {
      logger.error(`❌ [DEBUG] [SegmentationService] Erro na segmentação da stream ${streamKey}:`, {
        streamKey,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Para a gravação de uma stream
   */
  async stopRecording(streamKey, streamInfo) {
    try {
      const response = await axios.get(`${this.zlmApiUrl}/index/api/stopRecord`, {
        params: {
          secret: this.zlmSecret,
          type: 1, // MP4
          vhost: streamInfo.vhost || '__defaultVhost__',
          app: streamInfo.app,
          stream: streamInfo.stream
        },
        timeout: 10000
      });

      if (response.data.code === 0) {
        logger.debug(`Gravação parada para stream: ${streamKey}`);
      } else {
        logger.warn(`Falha ao parar gravação para stream ${streamKey}:`, response.data.msg);
      }
    } catch (error) {
      logger.error(`Erro ao parar gravação para stream ${streamKey}:`, error.message);
    }
  }

  /**
   * Inicia a gravação de uma stream
   */
  async startRecording(streamKey, streamInfo) {
    try {
      const response = await axios.get(`${this.zlmApiUrl}/index/api/startRecord`, {
        params: {
          secret: this.zlmSecret,
          type: 1, // MP4
          vhost: streamInfo.vhost || '__defaultVhost__',
          app: streamInfo.app,
          stream: streamInfo.stream,
          max_second: 60 // 60 segundos por segmento
        },
        timeout: 10000
      });

      if (response.data.code === 0) {
        logger.debug(`Gravação iniciada para stream: ${streamKey} (60 segundos)`);
      } else {
        logger.warn(`Falha ao iniciar gravação para stream ${streamKey}:`, response.data.msg);
      }
    } catch (error) {
      logger.error(`Erro ao iniciar gravação para stream ${streamKey}:`, error.message);
    }
  }

  /**
   * Atualiza o banco de dados com a segmentação
   * NOTA: Não cria nova gravação aqui para evitar duplicidade.
   * O webhook on_record_mp4 será responsável por criar o novo registro
   * quando a ZLM iniciar o próximo arquivo MP4 após o restart.
   */
  async updateRecordingSegmentation(activeRecording, cameraId) {
    try {
      const now = new Date();
      
      // Marca a gravação anterior como completa (segmentada)
      const { error: updateError } = await this.supabase
        .from('recordings')
        .update({
          status: 'completed',
          end_time: now.toISOString(),
          is_segmentation: true,
          updated_at: now.toISOString()
        })
        .eq('id', activeRecording.id);
      
      if (updateError) {
        logger.error('Erro ao atualizar gravação:', updateError);
        throw updateError;
      }

      // Não inserimos um novo registro aqui; aguardamos o webhook.
      logger.debug(`Banco de dados atualizado (encerrada gravação anterior) para segmentação da câmera ${cameraId}`);
      
    } catch (error) {
      logger.error(`Erro ao atualizar banco de dados para câmera ${cameraId}:`, error);
    }
  }

  /**
   * Extrai o ID da câmera do nome da stream
   */
  extractCameraId(streamName) {
    // Assume que o nome da stream contém o ID da câmera
    // Formato esperado: camera_123 ou 123 ou similar
    const match = streamName.match(/(\d+)/);
    return match ? match[1] : null;
  }

  /**
   * Callback quando uma nova stream é detectada
   * NOTA: Apenas inicia gravação via API ZLM, não cria registros no banco
   * Os registros no banco são criados pelos webhooks (on_record_mp4)
   */
  async onStreamStarted(streamKey, streamInfo) {
    try {
      const cameraId = this.extractCameraId(streamInfo.stream);
      
      if (cameraId) {
        // Verifica se já existe uma gravação ativa
        const { data: existingRecording, error: existingError } = await this.supabase
          .from('recordings')
          .select('*')
          .eq('camera_id', cameraId)
          .eq('status', 'recording')
          .single();
        
        if (existingError && existingError.code !== 'PGRST116') {
          logger.error('Erro ao buscar gravação existente:', existingError);
          return;
        }

        if (!existingRecording) {
          // Apenas inicia gravação via API ZLM
          // O webhook on_record_mp4 cuidará de criar o registro no banco
          await this.startRecording(streamKey, streamInfo);
          
          logger.info(`Gravação iniciada automaticamente via API ZLM para nova stream: ${streamKey}`, {
            cameraId,
            streamKey,
            note: 'Registro no banco será criado pelo webhook on_record_mp4'
          });
        }
      }
    } catch (error) {
      logger.error(`Erro ao processar nova stream ${streamKey}:`, error);
    }
  }

  /**
   * Callback quando uma stream para
   */
  async onStreamStopped(streamKey) {
    try {
      // Aqui podemos implementar lógica adicional quando uma stream para
      logger.debug(`Stream parou: ${streamKey}`);
    } catch (error) {
      logger.error(`Erro ao processar parada da stream ${streamKey}:`, error);
    }
  }

  /**
   * Obtém estatísticas do serviço
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      activeStreams: this.activeStreams.size,
      segmentationInterval: this.segmentationInterval,
      streams: Array.from(this.activeStreams.entries()).map(([key, info]) => ({
        streamKey: key,
        app: info.app,
        stream: info.stream,
        aliveSecond: info.aliveSecond,
        readerCount: info.readerCount
      }))
    };
  }

  /**
   * Força uma segmentação manual
   */
  async forceSegmentation() {
    logger.info('Forçando segmentação manual');
    await this.performSegmentation();
  }

  /**
   * Monitora novos arquivos MP4 criados e registra no banco
   */
  async monitorNewRecordings() {
    try {
      // Buscar arquivos MP4 recentes no diretório do ZLMediaKit
      const response = await axios.get(`${this.zlmApiUrl}/index/api/getMp4RecordFile`, {
        params: {
          secret: this.zlmSecret,
          vhost: '__defaultVhost__',
          app: 'live'
        },
        timeout: 5000
      });

      if (response.data.code === 0 && response.data.data) {
        for (const recording of response.data.data) {
          await this.processNewRecordingFile(recording);
        }
      }
    } catch (error) {
      logger.debug('Erro ao monitorar novos arquivos (normal se não houver arquivos):', error.message);
    }
  }

  /**
   * Processa um novo arquivo de gravação detectado
   */
  async processNewRecordingFile(recordingInfo) {
    try {
      const { stream, file_path, file_name, file_size, start_time, time_len } = recordingInfo;
      
      // Extrair cameraId
      const cameraId = this.extractCameraId(stream);
      if (!cameraId) return;

      // Verificar se já existe registro no banco
      const { data: existing } = await this.supabase
        .from('recordings')
        .select('id')
        .eq('filename', file_name)
        .single();

      if (existing) return; // Já existe

      // Validar integridade do arquivo MP4
      const isValid = await this.validateMp4File(file_path);
      
      // Criar novo registro
      const recordingData = {
        id: uuidv4(),
        camera_id: cameraId,
        filename: file_name,
        file_path: file_path,
        local_path: file_path,
        status: isValid ? 'completed' : 'failed',
        start_time: new Date(start_time * 1000).toISOString(),
        end_time: new Date((start_time + time_len) * 1000).toISOString(),
        duration: time_len,
        size: file_size,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: {
          resolution: '1920x1080',
          fps: 25,
          codec: 'h264',
          format: 'mp4',
          validated: isValid,
          validation_date: new Date().toISOString()
        }
      };

      await this.supabase.from('recordings').insert(recordingData);
      
      logger.info(`Novo arquivo de gravação registrado: ${file_name}`, {
        cameraId,
        duration: time_len,
        size: file_size,
        valid: isValid
      });

    } catch (error) {
      logger.error('Erro ao processar novo arquivo de gravação:', error);
    }
  }

  /**
   * Valida integridade de arquivo MP4 usando ffprobe
   */
  async validateMp4File(filePath) {
    try {
      const { spawn } = await import('child_process');
      
      return new Promise((resolve) => {
        const ffprobe = spawn('ffprobe', [
          '-v', 'error',
          '-show_entries', 'format=duration',
          '-of', 'default=noprint_wrappers=1:nokey=1',
          filePath
        ]);

        let output = '';
        let hasError = false;

        ffprobe.stdout.on('data', (data) => {
          output += data.toString();
        });

        ffprobe.stderr.on('data', (data) => {
          const error = data.toString();
          if (error.includes('moov atom not found') || error.includes('Invalid data')) {
            hasError = true;
          }
        });

        ffprobe.on('close', (code) => {
          const duration = parseFloat(output.trim());
          const isValid = !hasError && code === 0 && !isNaN(duration) && duration > 0;
          
          if (!isValid) {
            logger.warn(`Arquivo MP4 corrompido detectado: ${filePath}`, {
              exitCode: code,
              hasError,
              duration,
              output: output.trim()
            });
          }
          
          resolve(isValid);
        });

        // Timeout de 5 segundos
        setTimeout(() => {
          ffprobe.kill();
          resolve(false);
        }, 5000);
      });

    } catch (error) {
      logger.error('Erro ao validar arquivo MP4:', error);
      return false;
    }
  }
}

export default SegmentationService;