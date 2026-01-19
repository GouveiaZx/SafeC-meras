import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/contexts/AuthContext';

interface SocketEvents {
  recording_status_changed?: (data: any) => void;
  recording_update?: (data: any) => void;
  'recording-update'?: (data: any) => void;
  'recording-status-update'?: (data: any) => void;
  upload_progress?: (data: any) => void;
  upload_error?: (data: any) => void;
  new_recording?: (data: any) => void;
  recordings_refresh?: (data: any) => void;
  camera_status_changed?: (data: any) => void;
  connection_established?: (data: any) => void;
  error?: (error: any) => void;
}

export function useSocket(events: SocketEvents = {}) {
  const { token } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const eventsRef = useRef<SocketEvents>(events);

  // Update events ref when events change
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  // Connect to socket
  useEffect(() => {
    if (!token) return;

    // Use window.location.origin para conectar no mesmo domínio
    const socketUrl = window.location.origin;

    const socket = io(socketUrl, {
      path: '/socket.io',
      auth: {
        token,
        type: 'user'
      },
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });

    socketRef.current = socket;

    // Connection events
    socket.on('connect', () => {
      console.log('✅ Socket conectado:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('❌ Socket desconectado:', reason);
    });

    socket.on('connect_error', (error) => {
      // Log apenas em desenvolvimento ou para erros críticos
      if (process.env.NODE_ENV === 'development' || error.message.includes('authentication')) {
        console.error('❌ Erro na conexão do socket:', error);
      }
      eventsRef.current.error?.(error);
    });

    socket.on('connection_established', (data) => {
      console.log('🔗 Conexão estabelecida:', data);
      eventsRef.current.connection_established?.(data);
    });

    // Real-time recording events
    socket.on('recording_status_changed', (data) => {
      console.log('📊 Status da gravação alterado:', data);
      eventsRef.current.recording_status_changed?.(data);
    });

    socket.on('upload_progress', (data) => {
      console.log('📤 Progresso do upload:', data);
      eventsRef.current.upload_progress?.(data);
    });

    socket.on('upload_error', (data) => {
      console.error('❌ Erro no upload:', data);
      eventsRef.current.upload_error?.(data);
    });

    socket.on('new_recording', (data) => {
      console.log('🎥 Nova gravação:', data);
      eventsRef.current.new_recording?.(data);
    });

    socket.on('camera_status_changed', (data) => {
      console.log('📹 Status da câmera alterado:', data);
      eventsRef.current.camera_status_changed?.(data);
    });

    // Real-time recording and upload updates
    socket.on('recording-update', (data) => {
      console.log('🔄 Atualização de gravação em tempo real:', data);
      eventsRef.current['recording-update']?.(data);
      eventsRef.current.recording_update?.(data);
    });

    socket.on('recording-status-update', (data) => {
      console.log('📊 Atualização de status de upload:', data);
      eventsRef.current['recording-status-update']?.(data);
    });

    socket.on('error', (error) => {
      console.error('❌ Erro do socket:', error);
      eventsRef.current.error?.(error);
    });

    return () => {
      console.log('🔌 Desconectando socket...');
      socket.disconnect();
    };
  }, [token]);

  // Send message to server
  const emit = useCallback((event: string, data?: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    } else {
      console.warn('Socket não conectado, não é possível enviar:', event);
    }
  }, []);

  // Join specific camera room
  const joinCamera = useCallback((cameraId: string) => {
    emit('join_camera', { camera_id: cameraId });
  }, [emit]);

  // Leave specific camera room
  const leaveCamera = useCallback((cameraId: string) => {
    emit('leave_camera', { camera_id: cameraId });
  }, [emit]);

  // Get connection status
  const isConnected = socketRef.current?.connected || false;

  return {
    socket: socketRef.current,
    emit,
    joinCamera,
    leaveCamera,
    isConnected
  };
}

export default useSocket;