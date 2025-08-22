import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Configurar __dirname para ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Carregar variáveis de ambiente
// Primeiro carrega .env padrão
dotenv.config({ path: join(__dirname, '../.env') });
// Depois carrega .env.local se existir (sobrescreve configurações para desenvolvimento local)
dotenv.config({ path: join(__dirname, '../.env.local') });

// Importar middlewares
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { authenticateToken } from './middleware/auth.js';
import { authenticateSupabaseToken } from './middleware/supabaseAuth.js';
import { corsConfig } from './config/cors.js';

// Importar rotas
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import cameraRoutes from './routes/cameras.js';
import streamRoutes from './routes/streams.js';
import recordingRoutes from './routes/recordings.js';
import recordingFilesRoutes from './routes/recordingFiles.js';
import dashboardRoutes from './routes/dashboard.js';
import metricsRoutes from './routes/metrics.js';
import logsRoutes from './routes/logs.js';
import discoveryRoutes from './routes/discovery.js';
import workerRoutes from './routes/worker.js';
import hookRoutes from './routes/hooks.js';
import healthRoutes from './routes/health.js';
import segmentationRoutes, { injectSegmentationService } from './routes/segmentation.js';

// Importar serviços
import streamingService from './services/StreamingService.js';
import cameraMonitoringService from './services/CameraMonitoringService.js';
import MetricsService from './services/MetricsService.js';
import SegmentationService from './services/SegmentationService.js';
import RecordingMonitorService from './services/RecordingMonitorService.js';
import recordingFinalizationService from './services/RecordingFinalizationService.js';
import { initializeSocket } from './controllers/socketController.js';

// Configurações
const PORT = process.env.PORT || 3002;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Criar aplicação Express
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Configurar CORS usando a configuração completa
app.use(cors(corsConfig));

// Middlewares de segurança
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:", "http://localhost:3010", "http://127.0.0.1:3010", "http://localhost:3002", "http://127.0.0.1:3002", "http://localhost:3000", "http://127.0.0.1:3000"],
      connectSrc: ["'self'", "ws:", "wss:", "http://localhost:3010", "http://127.0.0.1:3010", "http://localhost:3002", "http://127.0.0.1:3002"],
    },
  },
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: NODE_ENV === 'production' ? 100 : 10000, // Limite muito alto para desenvolvimento
  message: {
    error: 'Muitas requisições deste IP, tente novamente em 15 minutos.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.log('🚫 [RATE LIMIT] Requisição bloqueada:', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      headers: Object.keys(req.headers)
    });
    res.status(429).json({
      error: 'Muitas requisições deste IP, tente novamente em 15 minutos.'
    });
  }
});

app.use('/api/', limiter);

// Middlewares gerais
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(requestLogger);

// Middleware de autenticação para rotas protegidas
app.use('/api/users', authenticateToken);
app.use('/api/cameras', authenticateToken);
// Nota: /api/streams usa seu próprio middleware de autenticação HLS
// Aplicar autenticação apenas para rotas específicas de recordings (excluindo stream)
app.use('/api/recordings', (req, res, next) => {
  console.log('🔍 [RECORDINGS MIDDLEWARE] Requisição recebida:', {
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl,
    headers: Object.keys(req.headers)
  });
  
  // Pular autenticação global para rotas de stream (elas têm seu próprio middleware)
  // req.path será algo como '/f2b8ef04-fada-4d7f-8542-77ca2b0bad8a/stream'
  if (req.path.includes('/stream') || req.path.includes('/download')) {
    console.log('🔓 [AUTH BYPASS] Pulando autenticação global para rota de stream/download:', req.path);
    return next();
  }
  console.log('🔐 [AUTH APPLY] Aplicando autenticação global para rota:', req.path);
  return authenticateToken(req, res, next);
});
app.use('/api/dashboard', authenticateToken);
app.use('/api/metrics', authenticateToken);
app.use('/api/logs', authenticateToken);
app.use('/api/discovery', authenticateToken);
// app.use('/api/worker', authenticateToken); // REMOVIDO: Worker usa seu próprio sistema de autenticação
app.use('/api/segmentation', authenticateToken);

// Rota de health check (sem autenticação)
app.get('/health', (req, res) => {
  res.json({
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
app.use('/api/recordings', recordingRoutes); // Movido para antes de cameras para evitar conflito de rotas
app.use('/api/recording-files', recordingFilesRoutes); // Rota para servir arquivos MP4 diretamente
app.use('/api/cameras', cameraRoutes);
app.use('/api/streams', streamRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/discovery', discoveryRoutes);
// PRODUÇÃO: Rotas de simulação removidas
// app.use('/api/simulation', simulationRoutes);
app.use('/api/worker', workerRoutes);
app.use('/api/hook', hookRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/segmentation', segmentationRoutes);

// REMOVIDO POR SEGURANÇA: Exposição estática de streams sem autenticação
// Streams devem ser servidos através da API com autenticação adequada
// Use /api/streams/:id para acessar streams com segurança

// REMOVIDO: Rota estática /recordings removida por segurança
// Todo acesso a gravações deve ser feito via /api/recording-files com autenticação

// Middleware de tratamento de erros
app.use(notFoundHandler);
app.use(errorHandler);

// Configuração do Socket.IO
initializeSocket(io);

// Tornar io disponível globalmente para outros módulos
app.set('io', io);

// Variável global para o serviço de segmentação
let globalSegmentationService = null;

// Função para inicializar serviços
async function initializeServices() {
  console.log('🔧 Inicializando serviços...');
  
  // Aguardar inicialização do StreamingService
  try {
    console.log('⚠️ StreamingService temporariamente desabilitado (Docker não disponível)');
    // await streamingService.init();
    // console.log('✅ StreamingService inicializado');
  } catch (error) {
    console.error('❌ Erro ao inicializar StreamingService:', error);
    throw error;
  }

  // Inicializar serviço de monitoramento de câmeras
  try {
    console.log('⚠️ CameraMonitoringService temporariamente desabilitado (Docker não disponível)');
    // await cameraMonitoringService.initialize(streamingService);
    // cameraMonitoringService.startMonitoring();
    // console.log('✅ CameraMonitoringService inicializado');
  } catch (error) {
    console.error('❌ Erro ao inicializar CameraMonitoringService:', error);
  }

  // DESABILITADO: RecordingMonitorService (serviço redundante)
  try {
    console.log('⚠️ RecordingMonitorService DESABILITADO - usando apenas RecordingService');
    // await RecordingMonitorService.start();
    // console.log('✅ RecordingMonitorService inicializado (automação de 30s ativa)');
    
    // Adicionar ao contexto global para uso em rotas se necessário
    // app.locals.recordingMonitor = RecordingMonitorService;
  } catch (error) {
    console.error('❌ Erro ao inicializar RecordingMonitorService:', error);
  }

  // DESABILITADO: RecordingFinalizationService (serviço redundante)
  try {
    console.log('⚠️ RecordingFinalizationService DESABILITADO - usando apenas RecordingService');
    // recordingFinalizationService.start();
    // console.log('✅ RecordingFinalizationService inicializado');
    
    // Adicionar ao contexto global para uso em rotas se necessário
    // app.locals.recordingFinalizationService = recordingFinalizationService;
  } catch (error) {
    console.error('❌ Erro ao inicializar RecordingFinalizationService:', error);
  }

  // Iniciar coleta de métricas
  try {
    await MetricsService.startCollection(5000);
    console.log(`📈 Coleta de métricas iniciada`);
  } catch (error) {
    console.error('Erro ao iniciar coleta de métricas:', error);
  }

  // Iniciar job de sincronização de gravações
  try {
    const { default: recordingSyncJob } = await import('./jobs/recordingSyncJob.js');
    await recordingSyncJob.initialize();
    recordingSyncJob.start();
    console.log('🔄 Recording Sync Job iniciado');
    
    // Adicionar ao contexto global para monitoramento
    app.locals.recordingSyncJob = recordingSyncJob;
  } catch (error) {
    console.error('❌ Erro ao inicializar Recording Sync Job:', error);
  }

  // DESABILITADO: SegmentationService (serviço redundante)
  try {
    console.log('⚠️ SegmentationService DESABILITADO - gravação será controlada manualmente');
    // globalSegmentationService = new SegmentationService();
    // globalSegmentationService.start();
    // Injetar o serviço nas rotas
    // injectSegmentationService(globalSegmentationService);
    // console.log('✅ SegmentationService inicializado e iniciado');
  } catch (error) {
    console.error('❌ Erro ao inicializar SegmentationService:', error);
  }

  // Inicializar serviço de gravação
  try {
    // O RecordingService já é inicializado automaticamente no construtor
    console.log(`🎥 Serviço de gravação inicializado`);
    
    // Agendar processamento automático da fila de uploads (a cada 5 minutos)
    const scheduleUploadQueue = () => {
      setInterval(async () => {
        try {
          const RecordingService = (await import('./services/RecordingService.js')).default;
          const result = await RecordingService.processUploadQueue();
          
          if (result.processed > 0) {
            console.log(`📤 Fila de upload processada: ${result.processed} processados, ${result.success} sucessos, ${result.failed} falhas`);
          }
        } catch (error) {
          console.error('❌ Erro no processamento automático da fila de upload:', error);
        }
      }, 5 * 60 * 1000); // A cada 5 minutos
      
      console.log('📤 Processamento automático da fila de upload agendado (a cada 5 minutos)');
    };
    
    scheduleUploadQueue();
    
    // Agendar atualização automática de estatísticas das gravações (a cada hora)
    const scheduleStatisticsUpdate = () => {
      setInterval(async () => {
        try {
          const RecordingService = (await import('./services/RecordingService.js')).default;
          const result = await RecordingService.updateRecordingStatistics();
          
          if (result.updated > 0) {
            console.log(`📊 Estatísticas atualizadas: ${result.updated} gravações processadas`);
          }
        } catch (error) {
          console.error('❌ Erro na atualização automática de estatísticas:', error);
        }
      }, 60 * 60 * 1000); // A cada 1 hora
      
      console.log('📊 Atualização automática de estatísticas agendada (a cada hora)');
    };
    
    scheduleStatisticsUpdate();
    
    // Agendar limpeza automática de gravações antigas (diariamente às 2:00 AM)
    const scheduleRecordingCleanup = () => {
      const now = new Date();
      const nextCleanup = new Date();
      nextCleanup.setHours(2, 0, 0, 0); // 2:00 AM
      
      // Se já passou das 2:00 AM hoje, agendar para amanhã
      if (now > nextCleanup) {
        nextCleanup.setDate(nextCleanup.getDate() + 1);
      }
      
      const timeUntilCleanup = nextCleanup.getTime() - now.getTime();
      
      setTimeout(async () => {
        try {
          console.log('🧹 Executando limpeza automática de gravações antigas...');
          const RecordingService = (await import('./services/RecordingService.js')).default;
          const result = await RecordingService.cleanupOldRecordings();
          console.log(`✅ Limpeza automática concluída: ${result.message}`);
        } catch (error) {
          console.error('❌ Erro na limpeza automática de gravações:', error);
        }
        
        // Reagendar para o próximo dia
        setInterval(async () => {
          try {
            console.log('🧹 Executando limpeza automática de gravações antigas...');
            const RecordingService = (await import('./services/RecordingService.js')).default;
            const result = await RecordingService.cleanupOldRecordings();
            console.log(`✅ Limpeza automática concluída: ${result.message}`);
          } catch (error) {
            console.error('❌ Erro na limpeza automática de gravações:', error);
          }
        }, 24 * 60 * 60 * 1000); // A cada 24 horas
        
      }, timeUntilCleanup);
      
      console.log(`🕐 Próxima limpeza automática agendada para: ${nextCleanup.toLocaleString('pt-BR')}`);
    };
    
    scheduleRecordingCleanup();
    
  } catch (error) {
    console.error('Erro ao inicializar serviço de gravação:', error);
  }

  // Inicializar câmeras automaticamente após 10 segundos
  // setTimeout(async () => {
  //   try {
  //     console.log('🎬 Iniciando processo automático de ativação das câmeras...');
  //     const { default: startCameraStreaming } = await import('./scripts/startCameraStreaming.js');
  //     await startCameraStreaming();
  //     console.log('✅ Processo de ativação das câmeras concluído');
  //   } catch (error) {
  //     console.error('❌ Erro na inicialização automática das câmeras:', error);
  //   }
  // }, 10000); // Aguardar 10 segundos para todos os serviços estarem prontos
  console.log('⚠️ Ativação automática de câmeras desabilitada (Docker não disponível)');
}

// Iniciar servidor
async function startServer() {
  try {
    // Primeiro inicializar todos os serviços
    await initializeServices();
    
    // Depois iniciar o servidor
    server.listen(PORT, () => {
      console.log(`🚀 Servidor NewCAM Backend rodando na porta ${PORT}`);
      console.log(`📊 Ambiente: ${NODE_ENV}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      
      if (NODE_ENV === 'development') {
        console.log(`📝 Documentação da API: http://localhost:${PORT}/api/docs`);
      }
    });
  } catch (error) {
    console.error('❌ Erro ao inicializar servidor:', error);
    process.exit(1);
  }
}

// Iniciar o servidor
startServer(); // SegmentationService implementado com sucesso

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
  if (globalSegmentationService) {
    globalSegmentationService.stop();
  }
  server.close(() => {
    console.log('Servidor encerrado.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Recebido SIGINT, encerrando servidor...');
  MetricsService.stopCollection();
  if (globalSegmentationService) {
    globalSegmentationService.stop();
  }
  server.close(() => {
    console.log('Servidor encerrado.');
    process.exit(0);
  });
});

export { app, server, io };
// Restart trigger
