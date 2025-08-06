// Carregar variáveis de ambiente PRIMEIRO
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

// Definir __filename e __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Carregar .env do diretório raiz (onde estão as credenciais reais)
const rootEnvPath = 'C:\\Users\\GouveiaRx\\Downloads\\NewCAM\\.env';
console.log('Carregando .env de:', rootEnvPath); // Rate limiting configurado - restart

const result = dotenv.config({ path: rootEnvPath });

if (result.error) {
  console.error('Erro ao carregar .env:', result.error);
} else {
  console.log('✅ .env carregado com sucesso!');
  console.log('📊 Variáveis carregadas:', Object.keys(result.parsed || {}).length);
}

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import morgan from 'morgan';

// Configurações
import { corsConfig } from './config/cors.js';
import { rateLimitConfig, slowDownConfig } from './config/rateLimit.js';

// Rotas
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import cameraRoutes from './routes/cameras.js';
import streamRoutes from './routes/streams.js';
import recordingRoutes from './routes/recordings.js';
import dashboardRoutes from './routes/dashboard.js';
import metricsRoutes from './routes/metrics.js';
import logsRoutes from './routes/logs.js';
import discoveryRoutes from './routes/discovery.js';

// PRODUÇÃO: Rotas de simulação removidas
// import simulationRoutes from './routes/simulation.js';
import workerRoutes from './routes/worker.js';

import healthRoutes from './routes/health.js';
import webhookRoutes from './routes/webhooks.js';
import uploadLogRoutes from './routes/uploadLogs.js';
import alertRoutes from './routes/alerts.js';
import cacheRoutes from './routes/cache.js';
import settingsRoutes from './routes/settings.js';
import fileRoutes from './routes/files.js';

// Middleware
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { initializeSocket } from './controllers/socketController.js';

// Importar serviços
import MetricsService from './services/MetricsService.js';
import RecordingService from './services/RecordingService.js';
import unifiedStreamingService from './services/UnifiedStreamingService.js';
import cameraMonitoringService from './services/CameraMonitoringService.js';
import UploadMonitoringService from './services/UploadMonitoringService.js';
import uploadQueueService from './services/UploadQueueService.js';
// ContinuousRecordingService consolidado no RecordingService
import CleanupService from './services/CleanupService.js';
import AlertMonitoringService from './services/AlertMonitoringService.js';
import CacheService from './services/CacheService.js';
import S3SyncService from './services/S3SyncService.js';
import S3IntegrityService from './services/S3IntegrityService.js';
import alertService from './services/AlertService.js';
import systemMonitoringService from './services/SystemMonitoringService.js';
import performanceOptimizationService from './services/PerformanceOptimizationService.js';
import cleanupService from './services/CleanupService.js';
import healthDashboardService from './services/HealthDashboardService.js';
import backupService from './services/BackupService.js';
import StreamAutoRecoveryService from './services/StreamAutoRecoveryService.js';

const app = express();

// Middleware de debug global removido

const server = createServer(app);
const io = new Server(server, {
  cors: corsConfig
});

// Configurações básicas 
const PORT = process.env.PORT || 3002;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Middleware de segurança
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// CORS
app.use(cors(corsConfig));

// Compressão
app.use(compression());

// Rate limiting
app.use(rateLimit(rateLimitConfig));
app.use(slowDown(slowDownConfig));

// Logging
if (NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Middleware de parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware customizado
app.use(requestLogger);

// Middleware de debug global temporário
app.use((req, res, next) => {
  console.log(`🌐 [GLOBAL DEBUG] ${req.method} ${req.originalUrl}`);
  
  // Debug específico para streams
  if (req.originalUrl.includes('/api/streams/')) {
    console.log(`🎥 [GLOBAL DEBUG] ROTA DE STREAM DETECTADA!`);
    console.log(`🎥 [GLOBAL DEBUG] Method:`, req.method);
    console.log(`🎥 [GLOBAL DEBUG] URL:`, req.originalUrl);
    console.log(`🎥 [GLOBAL DEBUG] Headers:`, {
      authorization: req.headers.authorization ? 'Bearer [PRESENTE]' : 'AUSENTE',
      'x-service-token': req.headers['x-service-token'] ? '[PRESENTE]' : 'AUSENTE',
      'content-type': req.headers['content-type']
    });
    console.log(`🎥 [GLOBAL DEBUG] Body:`, req.body);
  }
  
  if (req.originalUrl.includes('/recordings/') && req.originalUrl.includes('/video')) {
    console.log(`🎬 [GLOBAL DEBUG] ROTA DE VÍDEO DETECTADA!`);
    console.log(`🎬 [GLOBAL DEBUG] Headers:`, req.headers);
    console.log(`🎬 [GLOBAL DEBUG] Params:`, req.params);
  }
  next();
});

// Middleware de debug global já adicionado no início do arquivo

// NOTA: Middleware de arquivos estáticos movido para depois das rotas da API
// para evitar conflito com rotas /api/streams

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: NODE_ENV,
    version: process.env.npm_package_version || '1.0.0'
  });
});



// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/cameras', cameraRoutes);
app.use('/api/streams', streamRoutes);
app.use('/api/recordings', recordingRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/discovery', discoveryRoutes);

// PRODUÇÃO: Rotas de simulação removidas
// app.use('/api/simulation', simulationRoutes);
app.use('/api/worker', workerRoutes);

app.use('/api/health', healthRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/upload-logs', uploadLogRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/cache', cacheRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/files', fileRoutes);

// Servir arquivos estáticos de stream (APÓS as rotas da API)
const streamStoragePath = join(__dirname, '../../worker/storage/streams');
app.use('/streams', express.static(streamStoragePath, {
  setHeaders: (res, path) => {
    if (path.endsWith('.m3u8')) {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache');
    } else if (path.endsWith('.ts')) {
      res.setHeader('Content-Type', 'video/mp2t');
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

// Middleware de tratamento de erros
app.use(notFoundHandler);
app.use(errorHandler);

// Configuração do Socket.IO
initializeSocket(io);

// Inicializar serviço de monitoramento de upload
UploadMonitoringService.initialize(io);

// Tornar io disponível globalmente para outros módulos
app.set('io', io);

// Função para inicializar serviços
async function initializeServices() {
  console.log('🔧 Inicializando serviços...');
  
  // Inicializar Redis primeiro
  try {
    const { connectRedis } = await import('./config/redis.js');
    await connectRedis();
    console.log('✅ Redis conectado com sucesso');
  } catch (error) {
    console.error('❌ Erro ao conectar ao Redis:', error);
    console.log('⚠️ Alguns serviços podem não funcionar corretamente sem Redis');
  }
  
  // Aguardar inicialização do UnifiedStreamingService (não crítico)
  try {
    await unifiedStreamingService.init();
    console.log('✅ UnifiedStreamingService inicializado');
  } catch (error) {
    console.error('⚠️ Erro ao inicializar UnifiedStreamingService (continuando sem streaming):', error);
    console.log('🔄 O servidor continuará funcionando. O streaming será tentado novamente quando necessário.');
  }

  // Inicializar serviço de monitoramento de câmeras
  try {
    await cameraMonitoringService.initialize();
    cameraMonitoringService.startMonitoring();
    console.log('✅ CameraMonitoringService inicializado');
  } catch (error) {
    console.error('❌ Erro ao inicializar CameraMonitoringService:', error);
  }

  // Inicializar serviço de fila de upload
  try {
    await uploadQueueService.initialize();
    console.log('📤 Serviço de fila de upload inicializado');
  } catch (error) {
    console.error('❌ Erro ao inicializar serviço de fila de upload:', error);
  }

  // Iniciar coleta de métricas
  try {
    MetricsService.startCollection(5000);
    console.log(`📈 Coleta de métricas iniciada`);
  } catch (error) {
    console.error('Erro ao iniciar coleta de métricas:', error);
  }

  // Inicializar serviço de gravação
  try {
    // O RecordingService já é inicializado automaticamente no construtor
    console.log(`🎥 Serviço de gravação inicializado`);
  } catch (error) {
    console.error('Erro ao inicializar serviço de gravação:', error);
  }

  // Inicializar serviço de gravação contínua (consolidado no RecordingService)
  try {
    await RecordingService.initializeContinuousRecording();
    console.log('🔄 Serviço de gravação contínua inicializado');
  } catch (error) {
    console.error('❌ Erro ao inicializar serviço de gravação contínua:', error);
  }

  // Inicializar serviço de limpeza
  try {
    await CleanupService.initialize();
    CleanupService.startMonitoring();
    console.log('🧹 Serviço de limpeza inicializado');
  } catch (error) {
    console.error('❌ Erro ao inicializar serviço de limpeza:', error);
  }

  // Inicializar serviço de monitoramento de alertas
  try {
    await AlertMonitoringService.startMonitoring();
    console.log('🚨 Serviço de monitoramento de alertas inicializado');
  } catch (error) {
    console.error('❌ Erro ao inicializar serviço de monitoramento de alertas:', error);
  }

  // Pré-aquecer cache
  try {
    await CacheService.warmup();
    console.log('🔥 Cache pré-aquecido com sucesso');
  } catch (error) {
    console.error('⚠️ Erro ao pré-aquecer cache:', error);
  }

  // Inicializar serviço de sincronização S3
  try {
    await S3SyncService.initialize();
    S3SyncService.startSync();
    console.log('☁️ Serviço de sincronização S3 inicializado');
  } catch (error) {
    console.error('❌ Erro ao inicializar serviço de sincronização S3:', error);
  }

  // Inicializar serviço de verificação de integridade S3
  try {
    await S3IntegrityService.initialize();
    S3IntegrityService.startIntegrityCheck();
    console.log('🔍 Serviço de verificação de integridade S3 inicializado');
  } catch (error) {
    console.error('❌ Erro ao inicializar serviço de verificação de integridade S3:', error);
  }

  // Inicializar serviço de alertas
  try {
    await alertService.initialize();
    console.log('🚨 Serviço de alertas inicializado');
  } catch (error) {
    console.error('❌ Erro ao inicializar serviço de alertas:', error);
  }

  // Inicializar serviço de monitoramento do sistema
  try {
    await systemMonitoringService.start();
    console.log('📊 Serviço de monitoramento do sistema inicializado');
  } catch (error) {
    console.error('❌ Erro ao inicializar serviço de monitoramento do sistema:', error);
  }

  // Inicializar serviço de otimização de performance
  try {
    await performanceOptimizationService.initialize();
    performanceOptimizationService.startOptimization();
    console.log('⚡ Serviço de otimização de performance inicializado');
  } catch (error) {
    console.error('❌ Erro ao inicializar serviço de otimização de performance:', error);
  }

  // Inicializar serviço de limpeza automática
  try {
    await cleanupService.initialize();
    console.log('🧹 Serviço de limpeza automática inicializado');
  } catch (error) {
    console.error('❌ Erro ao inicializar serviço de limpeza automática:', error);
  }

  // Inicializar dashboard de saúde
  try {
    await healthDashboardService.initialize();
    console.log('📊 Dashboard de saúde inicializado');
  } catch (error) {
    console.error('❌ Erro ao inicializar dashboard de saúde:', error);
  }

  // Inicializar serviço de backup
  try {
    await backupService.initialize();
    console.log('💾 Serviço de backup inicializado');
  } catch (error) {
    console.error('❌ Erro ao inicializar serviço de backup:', error);
  }

  // Inicializar serviço de recuperação automática de streams
  try {
    const streamAutoRecoveryService = new StreamAutoRecoveryService();
    await streamAutoRecoveryService.start();
    console.log('🔄 Serviço de recuperação automática de streams inicializado');
    
    // Tornar disponível globalmente
    app.set('streamAutoRecoveryService', streamAutoRecoveryService);
    
    // Conectar com o CameraMonitoringService
    cameraMonitoringService.setStreamAutoRecoveryService(streamAutoRecoveryService);
    console.log('🔗 StreamAutoRecoveryService conectado ao CameraMonitoringService');
  } catch (error) {
    console.error('❌ Erro ao inicializar serviço de recuperação automática:', error);
  }

  // Inicializar câmeras automaticamente após 10 segundos
  setTimeout(async () => {
    try {
      console.log('🎬 Iniciando processo automático de ativação das câmeras...');
      const { default: startCameraStreaming } = await import('./scripts/startCameraStreaming.js');
      await startCameraStreaming();
      console.log('✅ Processo de ativação das câmeras concluído');
    } catch (error) {
      console.error('❌ Erro na inicialização automática das câmeras:', error);
    }
  }, 10000); // Aguardar 10 segundos para todos os serviços estarem prontos
}

// Iniciar servidor
async function startServer() {
  try {
    // Iniciar o servidor primeiro
    server.listen(PORT, () => {
      console.log(`🚀 Servidor NewCAM Backend rodando na porta ${PORT}`);
      console.log(`📊 Ambiente: ${NODE_ENV}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      
      if (NODE_ENV === 'development') {
        console.log(`📝 Documentação da API: http://localhost:${PORT}/api/docs`);
      }
    });
    
    // Depois inicializar todos os serviços em background
    initializeServices().catch(error => {
      console.error('❌ Erro ao inicializar serviços:', error);
    });
  } catch (error) {
    console.error('❌ Erro ao inicializar servidor:', error);
    process.exit(1);
  }
}

// Iniciar o servidor
startServer();

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
  console.error('Erro não capturado:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Promise rejeitada não tratada:', reason);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Recebido SIGTERM, encerrando servidor...');
  MetricsService.stopCollection();
  RecordingService.stopMonitoring();
  CleanupService.stopMonitoring();
  AlertMonitoringService.stopMonitoring();
  cameraMonitoringService.stopMonitoring();
  uploadQueueService.close();
  S3SyncService.stopSync();
  S3IntegrityService.stopIntegrityCheck();
  systemMonitoringService.stop();
  performanceOptimizationService.stopOptimization();
  cleanupService.stop();
  healthDashboardService.stop();
  
  // Parar serviço de recuperação automática
  const streamAutoRecoveryService = app.get('streamAutoRecoveryService');
  if (streamAutoRecoveryService) {
    streamAutoRecoveryService.stop();
  }
  
  server.close(() => {
    console.log('Servidor encerrado.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Recebido SIGINT, encerrando servidor...');
  MetricsService.stopCollection();
  RecordingService.stopMonitoring();
  CleanupService.stopMonitoring();
  AlertMonitoringService.stopMonitoring();
  cameraMonitoringService.stopMonitoring();
  uploadQueueService.close();
  S3SyncService.stopSync();
  S3IntegrityService.stopIntegrityCheck();
  systemMonitoringService.stop();
  performanceOptimizationService.stopOptimization();
  cleanupService.stop();
  healthDashboardService.stop();
  
  // Parar serviço de recuperação automática
  const streamAutoRecoveryService = app.get('streamAutoRecoveryService');
  if (streamAutoRecoveryService) {
    streamAutoRecoveryService.stop();
  }
  
  server.close(() => {
    console.log('Servidor encerrado.');
    process.exit(0);
  });
});

export { app, server, io };
// Restart trigger 2