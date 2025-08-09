import axios from 'axios';
import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';
import logger from '../utils/logger.js';

class SegmentationService {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    this.zlmApiUrl = process.env.ZLM_API_URL || 'http://localhost:8000';
    this.zlmSecret = process.env.ZLM_SECRET || '9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK';
    this.segmentationInterval = process.env.SEGMENTATION_INTERVAL_MINUTES || 30;
    this.isRunning = false;
    this.activeStreams = new Map();
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
          stream: streamInfo.stream
        },
        timeout: 10000
      });

      if (response.data.code === 0) {
        logger.debug(`Gravação iniciada para stream: ${streamKey}`);
      } else {
        logger.warn(`Falha ao iniciar gravação para stream ${streamKey}:`, response.data.msg);
      }
    } catch (error) {
      logger.error(`Erro ao iniciar gravação para stream ${streamKey}:`, error.message);
    }
  }

  /**
   * Atualiza o banco de dados com a segmentação
   */
  async updateRecordingSegmentation(activeRecording, cameraId) {
    try {
      const now = new Date();
      
      // Marca a gravação anterior como completa
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

      // Cria uma nova gravação
      const { error: createError } = await this.supabase
        .from('recordings')
        .insert({
          camera_id: cameraId,
          filename: `${cameraId}_${Date.now()}.mp4`,
          status: 'recording',
          start_time: now.toISOString(),
          is_segmentation: true,
          created_at: now.toISOString(),
          updated_at: now.toISOString()
        });
      
      if (createError) {
        logger.error('Erro ao criar nova gravação:', createError);
        throw createError;
      }

      logger.debug(`Banco de dados atualizado para segmentação da câmera ${cameraId}`);
      
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
          // Inicia gravação automaticamente
          await this.startRecording(streamKey, streamInfo);
          
          // Cria registro no banco
          const { error: newRecordingError } = await this.supabase
            .from('recordings')
            .insert({
              camera_id: cameraId,
              filename: `${cameraId}_${Date.now()}.mp4`,
              status: 'recording',
              start_time: new Date().toISOString(),
              is_segmentation: false
            });
          
          if (newRecordingError) {
            logger.error('Erro ao criar registro de gravação:', newRecordingError);
            return;
          }
          
          logger.info(`Gravação iniciada automaticamente para nova stream: ${streamKey}`);
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
}

export default SegmentationService;