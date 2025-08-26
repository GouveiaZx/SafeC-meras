/**
 * Rota de teste para WebSocket
 */

import express from 'express';
import { notifyRecordingStatusChange } from '../controllers/socketController.js';
import { supabaseAdmin } from '../config/database.js';

const router = express.Router();

/**
 * POST /api/test-websocket-notification
 * Testar notificação WebSocket para uma gravação específica
 */
router.post('/test-websocket-notification', async (req, res) => {
  try {
    const { recording_id } = req.body;
    
    if (!recording_id) {
      return res.status(400).json({
        success: false,
        message: 'recording_id é obrigatório'
      });
    }

    // Buscar gravação no banco
    const { data: recording, error } = await supabaseAdmin
      .from('recordings')
      .select('*')
      .eq('id', recording_id)
      .single();

    if (error || !recording) {
      return res.status(404).json({
        success: false,
        message: 'Gravação não encontrada'
      });
    }

    // Enviar notificação WebSocket
    const io = req.app.get('io');
    if (io) {
      notifyRecordingStatusChange(io, recording);
      console.log(`📡 Notificação WebSocket enviada para gravação: ${recording_id}`);
      
      return res.json({
        success: true,
        message: 'Notificação WebSocket enviada com sucesso',
        recording: {
          id: recording.id,
          status: recording.status,
          upload_status: recording.upload_status,
          filename: recording.filename
        }
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Socket.IO não inicializado'
      });
    }
    
  } catch (error) {
    console.error('Erro ao testar WebSocket:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
});

/**
 * POST /api/force-recording-refresh
 * Forçar refresh completo dos dados de gravação
 */
router.post('/force-recording-refresh', async (req, res) => {
  try {
    const io = req.app.get('io');
    if (io) {
      // Emitir evento de refresh geral
      io.emit('recordings_refresh', {
        timestamp: new Date().toISOString(),
        message: 'Dados de gravações atualizados'
      });

      console.log('📡 Evento recordings_refresh enviado');
      
      return res.json({
        success: true,
        message: 'Refresh forçado enviado via WebSocket'
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Socket.IO não inicializado'
      });
    }
    
  } catch (error) {
    console.error('Erro ao forçar refresh:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
});

/**
 * POST /api/test-refresh-notification 
 * Testar notificação de refresh geral
 */
router.post('/test-refresh-notification', async (req, res) => {
  try {
    const io = req.app.get('io');
    
    if (!io) {
      return res.status(500).json({
        success: false,
        message: 'Socket.IO não disponível'
      });
    }

    // Enviar evento de refresh para todos os clientes conectados
    io.emit('recordings_refresh', {
      message: 'Dados de gravações atualizados',
      timestamp: new Date().toISOString()
    });

    console.log('📡 Evento recordings_refresh enviado para todos os clientes');

    res.json({
      success: true,
      message: 'Notificação de refresh enviada com sucesso'
    });

  } catch (error) {
    console.error('Erro ao testar refresh notification:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
});

export default router;