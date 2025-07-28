// Carregar variáveis de ambiente PRIMEIRO
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

// Definir __filename e __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Carregar .env do diretório raiz (onde estão as credenciais reais)
const rootEnvPath = join(__dirname, '..', '.env');
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
import hookRoutes from './routes/hooks.js';

// Middleware
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { initializeSocket } from './controllers/socketController.js';

// Importar serviços
import MetricsService from './services/MetricsService.js';
import RecordingService from './services/RecordingService.js';
import streamingService from './services/StreamingService.js';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: corsConfig
});

// Configurações básicas 
const PORT = process.env.API_PORT || 3001;
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

// Servir arquivos estáticos de stream
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
app.use('/api/hook', hookRoutes);

// Middleware de tratamento de erros
app.use(notFoundHandler);
app.use(errorHandler);

// Configuração do Socket.IO
initializeSocket(io);

// Tornar io disponível globalmente para outros módulos
app.set('io', io);

// Função para inicializar serviços
async function initializeServices() {
  console.log('🔧 Inicializando serviços...');
  
  // Aguardar inicialização do StreamingService
  try {
    await streamingService.init();
    console.log('✅ StreamingService inicializado');
  } catch (error) {
    console.error('❌ Erro ao inicializar StreamingService:', error);
    throw error;
  }

  // Iniciar coleta de métricas
  try {
    await MetricsService.startCollection(5000);
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
  server.close(() => {
    console.log('Servidor encerrado.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Recebido SIGINT, encerrando servidor...');
  MetricsService.stopCollection();
  server.close(() => {
    console.log('Servidor encerrado.');
    process.exit(0);
  });
});

export { app, server, io };