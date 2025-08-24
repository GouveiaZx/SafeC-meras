/**
 * Script para criar entrada de gravação ativa quando necessário
 * NewCAM - Sistema de Monitoramento
 */

import { supabaseAdmin } from '../config/database.js';
import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('CreateActiveRecording');

async function createActiveRecording(cameraId, options = {}) {
  try {
    logger.info(`🎬 Criando entrada de gravação ativa para câmera: ${cameraId}`);

    // Verificar se câmera existe
    const { data: camera, error: cameraError } = await supabaseAdmin
      .from('cameras')
      .select('id, name, active, recording_enabled')
      .eq('id', cameraId)
      .single();

    if (cameraError || !camera) {
      throw new Error(`Câmera ${cameraId} não encontrada`);
    }

    // Verificar se já existe gravação ativa
    const { data: activeRecording } = await supabaseAdmin
      .from('recordings')
      .select('id, status')
      .eq('camera_id', cameraId)
      .eq('status', 'recording')
      .single();

    if (activeRecording) {
      logger.warn(`⚠️ Gravação já ativa para câmera ${cameraId}: ${activeRecording.id}`);
      return { success: false, message: 'Recording already active', recordingId: activeRecording.id };
    }

    // Criar registro no banco
    const now = new Date().toISOString();
    const { data: recording, error: insertError } = await supabaseAdmin
      .from('recordings')
      .insert([{
        camera_id: cameraId,
        status: 'recording',
        start_time: now,
        started_at: now,
        created_at: now,
        updated_at: now,
        metadata: {
          started_by: 'createActiveRecording',
          manual_creation: true,
          options: options
        }
      }])
      .select()
      .single();

    if (insertError) {
      logger.error('Erro ao criar registro de gravação:', insertError);
      throw insertError;
    }

    // Atualizar status da câmera
    await supabaseAdmin
      .from('cameras')
      .update({
        is_recording: true,
        updated_at: now
      })
      .eq('id', cameraId);

    logger.info(`✅ Gravação ativa criada com sucesso: ${recording.id}`);
    console.log(`✅ Entrada de gravação criada:
  - ID da Gravação: ${recording.id}
  - Câmera: ${camera.name} (${cameraId})
  - Status: ${recording.status}
  - Iniciado em: ${recording.started_at}
`);

    return { success: true, recordingId: recording.id, camera: camera.name };

  } catch (error) {
    logger.error(`Erro ao criar gravação ativa para ${cameraId}:`, error);
    console.error(`❌ Erro: ${error.message}`);
    throw error;
  }
}

// Se executado diretamente, aceitar argumentos da linha de comando
if (import.meta.url === `file://${process.argv[1]}`) {
  const cameraId = process.argv[2];
  
  if (!cameraId) {
    console.error('❌ Uso: node createActiveRecording.js <camera_id>');
    process.exit(1);
  }

  createActiveRecording(cameraId)
    .then(result => {
      if (result.success) {
        console.log(`🎉 Sucesso! Gravação ${result.recordingId} criada para câmera ${result.camera}`);
        process.exit(0);
      } else {
        console.log(`⚠️ ${result.message}`);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Erro fatal:', error.message);
      process.exit(1);
    });
}

export default createActiveRecording;