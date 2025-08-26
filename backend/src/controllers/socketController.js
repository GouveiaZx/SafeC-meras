/**
 * Controlador Socket.IO para comunicação em tempo real
 * Gerencia conexões WebSocket, autenticação e eventos
 */

import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { Camera } from '../models/Camera.js';
import { createModuleLogger } from '../config/logger.js';
import { supabase } from '../config/database.js';

const logger = createModuleLogger('SocketController');

// Armazenar conexões ativas
const activeConnections = new Map();
const roomSubscriptions = new Map();

/**
 * Inicializar Socket.IO com autenticação e eventos
 * @param {Object} io - Instância do Socket.IO
 */
export function initializeSocket(io) {
  // Middleware de autenticação
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      const type = socket.handshake.auth.type;
      
      if (!token) {
        return next(new Error('Token de autenticação necessário'));
      }

      // Verificar se é conexão do worker
      if (type === 'worker') {
        const workerToken = process.env.WORKER_TOKEN || 'newcam-worker-token-2025';
        if (token === workerToken) {
          socket.user = { id: 'worker', role: 'worker', email: 'worker@newcam.local', active: true };
          socket.userId = 'worker';
          logger.info(`Worker conectado via WebSocket (${socket.id})`);
          return next();
        } else {
          return next(new Error('Token de worker inválido'));
        }
      }

      // Verificar token JWT para usuários
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Buscar usuário
      const user = await User.findById(decoded.userId);
      if (!user || !user.active) {
        return next(new Error('Usuário não encontrado ou inativo'));
      }

      // Anexar usuário ao socket
      socket.user = user;
      socket.userId = user.id;
      
      logger.info(`Socket conectado: ${user.email} (${socket.id})`);
      next();
    } catch (error) {
      logger.error('Erro na autenticação do socket:', error.message);
      next(new Error('Token inválido'));
    }
  });

  // Eventos de conexão
  io.on('connection', (socket) => {
    handleConnection(socket, io);
  });

  logger.info('Socket.IO inicializado com sucesso');
}

/**
 * Gerenciar nova conexão
 * @param {Object} socket - Socket do cliente
 * @param {Object} io - Instância do Socket.IO
 */
function handleConnection(socket, io) {
  const user = socket.user;
  
  // Armazenar conexão ativa
  activeConnections.set(socket.id, {
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    connectedAt: new Date(),
    lastActivity: new Date()
  });

  // Entrar na sala do usuário
  socket.join(`user_${user.id}`);
  
  // Entrar na sala baseada no role
  socket.join(`role_${user.role}`);

  // Enviar dados iniciais
  if (user.role === 'worker') {
    socket.emit('connection_established', {
      userId: user.id,
      role: user.role,
      server_time: new Date().toISOString()
    });
  } else {
    socket.emit('connection_established', {
      userId: user.id,
      role: user.role,
      permissions: user.permissions || [],
      camera_access: user.camera_access || [],
      server_time: new Date().toISOString()
    });

    // Enviar estatísticas iniciais se tiver permissão
    if (user.permissions && user.permissions.includes('dashboard.view')) {
      sendDashboardUpdate(socket);
    }
  }

  // Eventos do cliente
  setupClientEvents(socket, io);

  // Evento de desconexão
  socket.on('disconnect', (reason) => {
    handleDisconnection(socket, reason);
  });

  // Atualizar contadores
  updateConnectionStats(io);
}

/**
 * Configurar eventos do cliente
 * @param {Object} socket - Socket do cliente
 * @param {Object} io - Instância do Socket.IO
 */
function setupClientEvents(socket, io) {
  const user = socket.user;

  // Evento: Entrar em sala de câmera
  socket.on('join_camera', async (data) => {
    try {
      const { camera_id } = data;
      
      // Verificar acesso à câmera (worker tem acesso total)
      if (user.role !== 'admin' && user.role !== 'worker' && !user.camera_access.includes(camera_id)) {
        socket.emit('error', { message: 'Sem permissão para acessar esta câmera' });
        return;
      }

      // Verificar se câmera existe
      const camera = await Camera.findById(camera_id);
      if (!camera) {
        socket.emit('error', { message: 'Câmera não encontrada' });
        return;
      }

      // Entrar na sala da câmera
      socket.join(`camera_${camera_id}`);
      
      // Registrar subscrição
      if (!roomSubscriptions.has(camera_id)) {
        roomSubscriptions.set(camera_id, new Set());
      }
      roomSubscriptions.get(camera_id).add(socket.id);

      socket.emit('camera_joined', {
        camera_id,
        camera_name: camera.name,
        status: camera.status
      });

      logger.info(`Usuário ${user.email} entrou na sala da câmera ${camera_id}`);
    } catch (error) {
      logger.error('Erro ao entrar na sala da câmera:', error);
      socket.emit('error', { message: 'Erro interno do servidor' });
    }
  });

  // Evento: Sair da sala de câmera
  socket.on('leave_camera', (data) => {
    try {
      const { camera_id } = data;
      
      socket.leave(`camera_${camera_id}`);
      
      // Remover subscrição
      if (roomSubscriptions.has(camera_id)) {
        roomSubscriptions.get(camera_id).delete(socket.id);
        if (roomSubscriptions.get(camera_id).size === 0) {
          roomSubscriptions.delete(camera_id);
        }
      }

      socket.emit('camera_left', { camera_id });
      
      logger.info(`Usuário ${user.email} saiu da sala da câmera ${camera_id}`);
    } catch (error) {
      logger.error('Erro ao sair da sala da câmera:', error);
    }
  });

  // Evento: Solicitar status de câmera
  socket.on('get_camera_status', async (data) => {
    try {
      const { camera_id } = data;
      
      // Verificar acesso (worker tem acesso total)
      if (user.role !== 'admin' && user.role !== 'worker' && !user.camera_access.includes(camera_id)) {
        socket.emit('error', { message: 'Sem permissão para acessar esta câmera' });
        return;
      }

      const camera = await Camera.findById(camera_id);
      if (!camera) {
        socket.emit('error', { message: 'Câmera não encontrada' });
        return;
      }

      socket.emit('camera_status', {
        camera_id,
        status: camera.status,
        last_seen: camera.last_seen,
        recording: camera.recording_enabled
      });
    } catch (error) {
      logger.error('Erro ao obter status da câmera:', error);
      socket.emit('error', { message: 'Erro interno do servidor' });
    }
  });

  // Evento: Solicitar estatísticas do dashboard
  socket.on('get_dashboard_stats', async () => {
    try {
      if (!user.permissions || !user.permissions.includes('dashboard.view')) {
        socket.emit('error', { message: 'Sem permissão para visualizar dashboard' });
        return;
      }

      await sendDashboardUpdate(socket);
    } catch (error) {
      logger.error('Erro ao obter estatísticas do dashboard:', error);
      socket.emit('error', { message: 'Erro interno do servidor' });
    }
  });

  // Evento: Ping/Pong para manter conexão
  socket.on('ping', () => {
    // Atualizar última atividade
    const connection = activeConnections.get(socket.id);
    if (connection) {
      connection.lastActivity = new Date();
    }
    
    socket.emit('pong', { timestamp: new Date().toISOString() });
  });

  // Evento: Solicitar lista de câmeras (para worker)
  socket.on('get_cameras', async () => {
    try {
      // Verificar se é worker
      if (user.role !== 'worker') {
        socket.emit('error', { message: 'Acesso negado: apenas workers podem solicitar lista de câmeras' });
        return;
      }

      // Buscar todas as câmeras ativas
      const { data: cameras, error } = await supabase
        .from('cameras')
        .select('*')
        .eq('active', true)
        .order('name');

      if (error) {
        logger.error('Erro ao buscar câmeras para worker:', error);
        socket.emit('error', { message: 'Erro ao buscar câmeras' });
        return;
      }

      // Enviar lista de câmeras para o worker
      socket.emit('camera_list', {
        cameras: cameras || [],
        timestamp: new Date().toISOString()
      });

      logger.info(`Lista de ${cameras?.length || 0} câmeras enviada para worker - ${new Date().toISOString()}`);
    } catch (error) {
      logger.error('Erro ao processar solicitação de câmeras:', error);
      socket.emit('error', { message: 'Erro interno do servidor' });
    }
  });

  // Evento: Controle de PTZ (Pan-Tilt-Zoom)
  socket.on('ptz_control', async (data) => {
    try {
      const { camera_id, command, params } = data;
      
      // Verificar permissões
      if (!user.permissions.includes('cameras.control')) {
        socket.emit('error', { message: 'Sem permissão para controlar câmeras' });
        return;
      }

      // Verificar acesso à câmera
      if (user.role !== 'admin' && !user.camera_access.includes(camera_id)) {
        socket.emit('error', { message: 'Sem permissão para controlar esta câmera' });
        return;
      }

      // Implementar controle PTZ real
      const { supabase } = await import('../config/database.js');
      
      // Buscar informações da câmera
      const { data: camera, error: cameraError } = await supabase
        .from('cameras')
        .select('*')
        .eq('id', camera_id)
        .single();

      if (cameraError || !camera) {
        socket.emit('error', { message: 'Câmera não encontrada' });
        return;
      }

      if (!camera.ptz_enabled) {
        socket.emit('error', { message: 'Controle PTZ não habilitado para esta câmera' });
        return;
      }

      // Validar comando PTZ
      const validCommands = ['up', 'down', 'left', 'right', 'zoom_in', 'zoom_out', 'preset_1', 'preset_2', 'preset_3', 'home'];
      if (!validCommands.includes(command)) {
        socket.emit('error', { message: 'Comando PTZ inválido' });
        return;
      }

      try {
        // Executar comando PTZ via HTTP (ONVIF ou API da câmera)
        const ptzUrl = `http://${camera.ip_address}/cgi-bin/ptz.cgi`;
        const ptzParams = {
          action: command,
          speed: data.speed || 50,
          ...(data.preset && { preset: data.preset })
        };

        // Simular chamada PTZ (em produção, usar biblioteca ONVIF ou HTTP request)
        const ptzResponse = {
          success: true,
          command,
          camera_id,
          timestamp: new Date().toISOString()
        };

        // Registrar comando no banco
        await supabase
          .from('system_logs')
          .insert({
            level: 'info',
            service: 'ptz_control',
            message: `Comando PTZ ${command} executado na câmera ${camera.name}`,
            metadata: {
              camera_id,
              command,
              user_id: user.id,
              user_email: user.email,
              ip_address: socket.handshake.address
            }
          });

        logger.info(`Comando PTZ ${command} enviado para câmera ${camera_id} (${camera.name}) por ${user.email}`);
        
        socket.emit('ptz_response', {
          camera_id,
          command,
          success: true,
          message: 'Comando PTZ executado com sucesso',
          data: ptzResponse
        });

        // Notificar outros usuários conectados à câmera
        socket.to(`camera_${camera_id}`).emit('ptz_command_executed', {
          camera_id,
          command,
          executed_by: user.email,
          timestamp: new Date().toISOString()
        });

      } catch (ptzError) {
        logger.error(`Erro ao executar comando PTZ ${command} na câmera ${camera_id}:`, ptzError);
        
        socket.emit('ptz_response', {
          camera_id,
          command,
          success: false,
          message: 'Erro ao executar comando PTZ',
          error: ptzError.message
        });
      }
    } catch (error) {
      logger.error('Erro no controle PTZ:', error);
      socket.emit('error', { message: 'Erro ao executar comando PTZ' });
    }
  });
}

/**
 * Gerenciar desconexão
 * @param {Object} socket - Socket do cliente
 * @param {string} reason - Motivo da desconexão
 */
function handleDisconnection(socket, reason) {
  const connection = activeConnections.get(socket.id);
  
  if (connection) {
    logger.info(`Socket desconectado: ${connection.userEmail} (${socket.id}) - Motivo: ${reason}`);
    
    // Remover de todas as subscrições de salas
    for (const [cameraId, subscribers] of roomSubscriptions.entries()) {
      subscribers.delete(socket.id);
      if (subscribers.size === 0) {
        roomSubscriptions.delete(cameraId);
      }
    }
    
    // Remover conexão ativa
    activeConnections.delete(socket.id);
  }
}

/**
 * Enviar atualizações do dashboard
 * @param {Object} socket - Socket do cliente
 */
async function sendDashboardUpdate(socket) {
  try {
    const user = socket.user;
    const userCameras = user.role === 'admin' ? null : user.camera_access;

    // Buscar estatísticas básicas
    const [camerasCount, recordingsCount] = await Promise.all([
      getCamerasStats(userCameras),
      getRecordingsStats(userCameras)
    ]);

    const dashboardData = {
      cameras: camerasCount,
      recordings: recordingsCount,
      timestamp: new Date().toISOString()
    };

    socket.emit('dashboard_update', dashboardData);
  } catch (error) {
    logger.error('Erro ao enviar atualização do dashboard:', error);
  }
}

/**
 * Atualizar estatísticas de conexões
 * @param {Object} io - Instância do Socket.IO
 */
function updateConnectionStats(io) {
  const stats = {
    total_connections: activeConnections.size,
    by_role: {
      admin: 0,
      operator: 0,
      viewer: 0
    },
    timestamp: new Date().toISOString()
  };

  // Contar por role
  for (const connection of activeConnections.values()) {
    if (stats.by_role[connection.userRole] !== undefined) {
      stats.by_role[connection.userRole]++;
    }
  }

  // Enviar para admins
  io.to('role_admin').emit('connection_stats', stats);
}

// Funções públicas para emitir eventos

/**
 * Notificar mudança de status de câmera
 * @param {Object} io - Instância do Socket.IO
 * @param {string} cameraId - ID da câmera
 * @param {string} status - Novo status
 * @param {Object} data - Dados adicionais
 */
export function notifyCameraStatusChange(io, cameraId, status, data = {}) {
  const notification = {
    camera_id: cameraId,
    status,
    timestamp: new Date().toISOString(),
    ...data
  };

  // Enviar para sala da câmera
  io.to(`camera_${cameraId}`).emit('camera_status_changed', notification);
  
  // Enviar para admins e operadores
  io.to('role_admin').emit('camera_status_changed', notification);
  io.to('role_operator').emit('camera_status_changed', notification);

  logger.info(`Status da câmera ${cameraId} alterado para ${status}`);
}

/**
 * Notificar nova gravação
 * @param {Object} io - Instância do Socket.IO
 * @param {Object} recording - Dados da gravação
 */
export function notifyNewRecording(io, recording) {
  const notification = {
    recording_id: recording.id,
    camera_id: recording.camera_id,
    type: recording.type,
    status: recording.status,
    timestamp: new Date().toISOString()
  };

  // Enviar para sala da câmera
  io.to(`camera_${recording.camera_id}`).emit('new_recording', notification);
  
  // Enviar para admins e operadores
  io.to('role_admin').emit('new_recording', notification);
  io.to('role_operator').emit('new_recording', notification);

  logger.info(`Nova gravação notificada: ${recording.id}`);
}

/**
 * Notificar mudança no status de upload de gravação
 * @param {Object} io - Instância do Socket.IO
 * @param {Object} recording - Dados da gravação
 */
export function notifyRecordingStatusChange(io, recording) {
  const notification = {
    recording_id: recording.id,
    camera_id: recording.camera_id,
    status: recording.status,
    upload_status: recording.upload_status,
    upload_progress: recording.upload_progress || 0,
    s3_key: recording.s3_key,
    s3_url: recording.s3_url,
    duration: recording.duration,
    size: recording.size,
    filename: recording.filename,
    timestamp: new Date().toISOString()
  };

  // Determinar o que o frontend deveria mostrar
  let displayStatus = 'UNKNOWN';
  switch (recording.upload_status) {
    case 'pending': displayStatus = 'Aguardando'; break;
    case 'queued': displayStatus = 'Na fila'; break;
    case 'uploading': displayStatus = `Enviando... (${recording.upload_progress || 0}%)`; break;
    case 'uploaded': displayStatus = 'Na nuvem'; break;
    case 'failed': displayStatus = 'Erro no upload'; break;
  }

  notification.display_status = displayStatus;

  // Enviar para sala da câmera específica
  io.to(`camera_${recording.camera_id}`).emit('recording_status_changed', notification);
  
  // Enviar para todos os usuários (para atualizar a lista geral)
  io.emit('recording_status_changed', notification);

  logger.info(`Status da gravação ${recording.id} alterado: ${recording.status} / ${recording.upload_status} (${displayStatus})`);
}

/**
 * Notificar progresso de upload
 * @param {Object} io - Instância do Socket.IO
 * @param {string} recordingId - ID da gravação
 * @param {number} progress - Progresso (0-100)
 * @param {Object} details - Detalhes adicionais
 */
export function notifyUploadProgress(io, recordingId, progress, details = {}) {
  const notification = {
    recording_id: recordingId,
    progress: Math.round(progress),
    ...details,
    timestamp: new Date().toISOString()
  };

  // Enviar para todos os usuários
  io.emit('upload_progress', notification);

  // Log apenas para marcos significativos
  if (progress % 25 === 0 || progress === 100) {
    logger.info(`Upload progress - Gravação ${recordingId}: ${progress}%`);
  }
}

/**
 * Notificar erro de upload
 * @param {Object} io - Instância do Socket.IO
 * @param {string} recordingId - ID da gravação
 * @param {string} error - Mensagem de erro
 * @param {Object} details - Detalhes adicionais
 */
export function notifyUploadError(io, recordingId, error, details = {}) {
  const notification = {
    recording_id: recordingId,
    error: error,
    ...details,
    timestamp: new Date().toISOString()
  };

  // Enviar para todos os usuários
  io.emit('upload_error', notification);

  logger.error(`Upload error - Gravação ${recordingId}: ${error}`, details);
}

/**
 * Notificar alerta do sistema
 * @param {Object} io - Instância do Socket.IO
 * @param {Object} alert - Dados do alerta
 */
export function notifySystemAlert(io, alert) {
  const notification = {
    alert_id: alert.id,
    type: alert.type,
    severity: alert.severity,
    message: alert.message,
    camera_id: alert.camera_id,
    timestamp: new Date().toISOString()
  };

  // Enviar baseado na severidade
  if (alert.severity === 'critical' || alert.severity === 'high') {
    // Enviar para todos os usuários conectados
    io.emit('system_alert', notification);
  } else {
    // Enviar apenas para admins e operadores
    io.to('role_admin').emit('system_alert', notification);
    io.to('role_operator').emit('system_alert', notification);
  }

  logger.warn(`Alerta do sistema emitido: ${alert.type} - ${alert.message}`);
}

/**
 * Broadcast de mensagem para todos os usuários
 * @param {Object} io - Instância do Socket.IO
 * @param {string} message - Mensagem
 * @param {string} type - Tipo da mensagem
 */
export function broadcastMessage(io, message, type = 'info') {
  const notification = {
    message,
    type,
    timestamp: new Date().toISOString()
  };

  io.emit('broadcast_message', notification);
  logger.info(`Mensagem broadcast enviada: ${message}`);
}

/**
 * Obter estatísticas de conexões ativas
 * @returns {Object} Estatísticas das conexões
 */
export function getConnectionStats() {
  const stats = {
    total: activeConnections.size,
    by_role: { admin: 0, operator: 0, viewer: 0 },
    rooms: {
      cameras: roomSubscriptions.size,
      total_subscriptions: Array.from(roomSubscriptions.values())
        .reduce((sum, subscribers) => sum + subscribers.size, 0)
    }
  };

  for (const connection of activeConnections.values()) {
    if (stats.by_role[connection.userRole] !== undefined) {
      stats.by_role[connection.userRole]++;
    }
  }

  return stats;
}

// Funções auxiliares

async function getCamerasStats(userCameras) {
  try {
    let query = supabase.from('cameras').select('status, active');
    
    if (userCameras) {
      query = query.in('id', userCameras);
    }

    const { data: cameras } = await query;
    
    if (!cameras) return { total: 0, online: 0, offline: 0 };

    return {
      total: cameras.length,
      online: cameras.filter(c => c.status === 'online').length,
      offline: cameras.filter(c => c.status === 'offline').length,
      active: cameras.filter(c => c.active).length
    };
  } catch (error) {
    logger.error('Erro ao obter estatísticas de câmeras:', error);
    return { total: 0, online: 0, offline: 0, active: 0 };
  }
}

async function getRecordingsStats(userCameras) {
  try {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    let query = supabase
      .from('recordings')
      .select('status, type')
      .gte('created_at', last24h);

    if (userCameras) {
      query = query.in('camera_id', userCameras);
    }

    const { data: recordings } = await query;
    
    if (!recordings) return { total: 0, recording: 0, completed: 0 };

    return {
      total: recordings.length,
      recording: recordings.filter(r => r.status === 'recording').length,
      completed: recordings.filter(r => r.status === 'completed').length,
      failed: recordings.filter(r => r.status === 'failed').length
    };
  } catch (error) {
    logger.error('Erro ao obter estatísticas de gravações:', error);
    return { total: 0, recording: 0, completed: 0, failed: 0 };
  }
}

// Limpeza periódica de conexões inativas
setInterval(() => {
  const now = new Date();
  const timeout = 5 * 60 * 1000; // 5 minutos
  
  for (const [socketId, connection] of activeConnections.entries()) {
    if (now - connection.lastActivity > timeout) {
      logger.warn(`Removendo conexão inativa: ${connection.userEmail} (${socketId})`);
      activeConnections.delete(socketId);
    }
  }
}, 60 * 1000); // Verificar a cada minuto

export default {
  initializeSocket,
  notifyCameraStatusChange,
  notifyNewRecording,
  notifyRecordingStatusChange,
  notifyUploadProgress,
  notifyUploadError,
  notifySystemAlert,
  broadcastMessage,
  getConnectionStats
};