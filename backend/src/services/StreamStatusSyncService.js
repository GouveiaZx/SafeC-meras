/**
 * StreamStatusSyncService
 *
 * Sincroniza automaticamente o status de streaming das cameras
 * entre o ZLMediaKit e o banco de dados Supabase.
 *
 * Executado a cada 30 segundos para garantir consistencia.
 */

import axios from 'axios';
import { supabaseAdmin } from '../config/database.js';
import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('StreamStatusSync');

// Configuracoes do ZLMediaKit
const ZLM_API_URL = process.env.ZLM_API_URL || 'http://localhost:8000/index/api';
const ZLM_SECRET = process.env.ZLM_SECRET || '9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK';

// Intervalo de sincronizacao (30 segundos)
const SYNC_INTERVAL = 30000;

class StreamStatusSyncService {
  constructor() {
    this.syncTimer = null;
    this.isRunning = false;
    this.lastSyncTime = null;
    this.syncCount = 0;
    this.errorCount = 0;
  }

  start() {
    if (this.isRunning) {
      logger.warn('StreamStatusSync ja esta em execucao');
      return;
    }

    logger.info('Iniciando StreamStatusSyncService...');
    this.isRunning = true;

    this.syncStreamStatus();

    this.syncTimer = setInterval(() => {
      this.syncStreamStatus();
    }, SYNC_INTERVAL);

    logger.info('StreamStatusSyncService iniciado (intervalo: ' + SYNC_INTERVAL + 'ms)');
  }

  stop() {
    if (!this.isRunning) {
      logger.warn('StreamStatusSync ja esta parado');
      return;
    }

    logger.info('Parando StreamStatusSyncService...');

    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    this.isRunning = false;
    logger.info('StreamStatusSyncService parado');
  }

  async syncStreamStatus() {
    try {
      const startTime = Date.now();
      logger.debug('Iniciando sincronizacao de status...');

      // 1. Buscar streams ativos no ZLMediaKit e SRS
      const zlmStreams = await this.getActiveStreamsFromZLM();
      const srsActiveIds = await this.getActiveStreamsFromSRS();
      const zlmStreamIds = zlmStreams.map(stream => stream.stream);
      const activeStreamIds = [...new Set([...zlmStreamIds, ...srsActiveIds])];

      logger.debug('Encontrados ' + activeStreamIds.length + ' streams ativos (ZLM: ' + zlmStreamIds.length + ', SRS: ' + srsActiveIds.length + ')');

      // 2. Buscar cameras marcadas como streaming no banco
      const { data: streamingCameras, error: fetchError } = await supabaseAdmin
        .from('cameras')
        .select('id, name, is_streaming')
        .eq('is_streaming', true);

      if (fetchError) {
        throw new Error('Erro ao buscar cameras: ' + fetchError.message);
      }

      const streamingCameraIds = (streamingCameras || []).map(c => c.id);

      // 3. Identificar cameras que devem ser atualizadas
      const camerasToUpdate = streamingCameraIds.filter(id => !activeStreamIds.includes(id));

      if (camerasToUpdate.length > 0) {
        logger.info('Atualizando ' + camerasToUpdate.length + ' cameras para is_streaming=false');

        const { error: updateError } = await supabaseAdmin
          .from('cameras')
          .update({
            is_streaming: false,
            is_recording: false,
            status: 'offline',
            updated_at: new Date().toISOString()
          })
          .in('id', camerasToUpdate);

        if (updateError) {
          throw new Error('Erro ao atualizar cameras: ' + updateError.message);
        }

        logger.info(camerasToUpdate.length + ' cameras atualizadas com sucesso');
      }

      // 5. Identificar streams ativos sem registro no banco
      const orphanStreams = activeStreamIds.filter(id => !streamingCameraIds.includes(id));

      if (orphanStreams.length > 0) {
        logger.warn('Encontrados ' + orphanStreams.length + ' streams orfaos');

        const { error: orphanUpdateError } = await supabaseAdmin
          .from('cameras')
          .update({
            is_streaming: true,
            status: 'online',
            last_seen: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .in('id', orphanStreams);

        if (orphanUpdateError) {
          logger.error('Erro ao atualizar streams orfaos:', orphanUpdateError);
        } else {
          logger.info(orphanStreams.length + ' streams orfaos atualizados no banco');
        }
      }

      // 5.1 Atualizar cameras que estao streaming mas com status=offline
      const { data: offlineCamerasStreaming, error: checkOfflineError } = await supabaseAdmin
        .from('cameras')
        .select('id')
        .in('id', activeStreamIds)
        .eq('status', 'offline');

      if (!checkOfflineError && offlineCamerasStreaming && offlineCamerasStreaming.length > 0) {
        const idsToMakeOnline = offlineCamerasStreaming.map(c => c.id);

        const { error: onlineUpdateError } = await supabaseAdmin
          .from('cameras')
          .update({
            status: 'online',
            last_seen: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .in('id', idsToMakeOnline);

        if (onlineUpdateError) {
          logger.error('Erro ao atualizar cameras para online:', onlineUpdateError);
        } else {
          logger.info(idsToMakeOnline.length + ' cameras atualizadas para status=online');
        }
      }

      // 6. Sincronizar is_recording baseado no estado real das gravações
      await this.syncRecordingStatus(activeStreamIds, zlmStreamIds);

      const duration = Date.now() - startTime;
      this.lastSyncTime = new Date();
      this.syncCount++;

      logger.debug('Sincronizacao concluida em ' + duration + 'ms');

    } catch (error) {
      this.errorCount++;
      logger.error('Erro na sincronizacao de status:', {
        error: error.message,
        errorCount: this.errorCount
      });
    }
  }

  async getActiveStreamsFromZLM() {
    try {
      const response = await axios.get(ZLM_API_URL + '/getMediaList', {
        params: {
          secret: ZLM_SECRET,
          vhost: '__defaultVhost__',
          app: 'live'
        },
        timeout: 5000
      });

      if (response.data.code === 0) {
        const allStreams = response.data.data || [];

        // CORREÇÃO: Filtrar apenas streams que estão realmente recebendo dados
        // Proxy streams (originType === 4) devem ter bytesSpeed > 0 para serem considerados ativos
        const activeStreams = allStreams.filter(stream => {
          // Se é proxy stream (RTSP pull), verificar se está recebendo dados
          if (stream.originType === 4) {
            const isReceivingData = stream.bytesSpeed > 0;
            if (!isReceivingData) {
              logger.debug(`Stream ${stream.stream} ignorado (proxy sem dados, bytesSpeed=${stream.bytesSpeed})`);
            }
            return isReceivingData;
          }
          // Outros tipos (RTMP push, etc) são considerados ativos
          return true;
        });

        logger.debug(`Streams ZLM: ${allStreams.length} total, ${activeStreams.length} ativos (filtrados por bytesSpeed)`);
        return activeStreams;
      } else {
        logger.warn('ZLMediaKit retornou codigo diferente de 0:', response.data);
        return [];
      }

    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        logger.error('ZLMediaKit nao esta acessivel');
      } else {
        logger.error('Erro ao buscar streams do ZLMediaKit:', error.message);
      }
      return [];
    }
  }

  async getActiveStreamsFromSRS() {
    try {
      const SRS_API_URL = process.env.SRS_API_URL || 'http://localhost:1985/api/v1';
      const response = await axios.get(SRS_API_URL + '/streams/', {
        timeout: 5000
      });

      const streams = response.data && response.data.streams ? response.data.streams : [];
      const activeStreams = streams.filter(function(s) { return s.publish && s.publish.active; });

      if (activeStreams.length === 0) return [];

      const cameraIds = [];
      for (const stream of activeStreams) {
        const streamKey = stream.name;

        const { data: cameras, error } = await supabaseAdmin
          .from('cameras')
          .select('id')
          .or('stream_key.eq.' + streamKey + ',rtmp_url.ilike.%' + streamKey + '%')
          .limit(1);

        if (!error && cameras && cameras.length > 0) {
          cameraIds.push(cameras[0].id);
          logger.debug('SRS stream ' + streamKey + ' mapeado para camera ' + cameras[0].id);
        }
      }

      return cameraIds;
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        logger.debug('SRS nao esta acessivel');
      } else {
        logger.warn('Erro ao buscar streams do SRS:', error.message);
      }
      return [];
    }
  }

  /**
   * Sincroniza o campo is_recording baseado no estado real das gravações
   * ZLM: Usa API isRecording para verificar status
   * SRS: DVR sempre ativo quando stream está publicando
   */
  async syncRecordingStatus(activeStreamIds, zlmStreamIds) {
    try {
      // Buscar câmeras ativas com recording_enabled
      const { data: cameras, error } = await supabaseAdmin
        .from('cameras')
        .select('id, is_recording, recording_enabled, stream_type, stream_key')
        .in('id', activeStreamIds);

      if (error) {
        logger.error('Erro ao buscar cameras para sync de gravação:', error.message);
        return;
      }

      if (!cameras || cameras.length === 0) return;

      const updates = [];

      for (const camera of cameras) {
        let isActuallyRecording = false;

        // Se é stream ZLM, verificar via API isRecording
        if (zlmStreamIds.includes(camera.id)) {
          try {
            const response = await axios.get(ZLM_API_URL + '/isRecording', {
              params: {
                secret: ZLM_SECRET,
                type: 1, // MP4
                vhost: '__defaultVhost__',
                app: 'live',
                stream: camera.id
              },
              timeout: 3000
            });

            isActuallyRecording = response.data.code === 0 && response.data.status === true;
          } catch (e) {
            logger.debug(`Erro ao verificar isRecording para ${camera.id}: ${e.message}`);
          }
        } else if (camera.stream_type === 'rtmp' || camera.stream_key) {
          // SRS: DVR está sempre ativo quando stream está publicando
          isActuallyRecording = camera.recording_enabled !== false;
        }

        // Atualizar se diferente do banco
        if (camera.is_recording !== isActuallyRecording) {
          updates.push({
            id: camera.id,
            is_recording: isActuallyRecording
          });
        }
      }

      // Aplicar atualizações
      if (updates.length > 0) {
        for (const update of updates) {
          const { error: updateError } = await supabaseAdmin
            .from('cameras')
            .update({
              is_recording: update.is_recording,
              updated_at: new Date().toISOString()
            })
            .eq('id', update.id);

          if (updateError) {
            logger.error(`Erro ao atualizar is_recording para ${update.id}:`, updateError.message);
          }
        }

        logger.info(`Sincronizado is_recording para ${updates.length} câmeras`);
      }

    } catch (error) {
      logger.error('Erro ao sincronizar status de gravação:', error.message);
    }
  }

  getStats() {
    return {
      isRunning: this.isRunning,
      lastSyncTime: this.lastSyncTime,
      syncCount: this.syncCount,
      errorCount: this.errorCount,
      syncInterval: SYNC_INTERVAL
    };
  }
}

const streamStatusSyncService = new StreamStatusSyncService();
export default streamStatusSyncService;
