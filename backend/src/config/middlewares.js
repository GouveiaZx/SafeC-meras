import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import express from 'express';
import { requestLogger } from '../middleware/requestLogger.js';
import { corsConfig } from './cors.js';
import { createModuleLogger } from './logger.js';

const logger = createModuleLogger('middlewares');

/**
 * Configura middlewares de segurança
 */
export function setupSecurityMiddlewares(app) {
  // CORS
  app.use(cors(corsConfig));
  
  // Helmet para segurança
  app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
	mediaSrc: ["'self'", "blob:", "data:", "https://s3.us-east-2.wasabisys.com", ...(process.env.CSP_MEDIA_SRC || "http://localhost:3010,http://127.0.0.1:3010,http://localhost:3002,http://127.0.0.1:3002,http://localhost:3000,http://127.0.0.1:3000").split(',')],
        connectSrc: ["'self'", "ws:", "wss:", "https://s3.us-east-2.wasabisys.com", ...(process.env.CSP_CONNECT_SRC || "http://localhost:3010,http://127.0.0.1:3010,http://localhost:3002,http://127.0.0.1:3002").split(',')],      },
    },
  }));
  
  logger.info('Middlewares de segurança configurados');
}

/**
 * Configura rate limiting
 */
export function setupRateLimit(app) {
  const NODE_ENV = process.env.NODE_ENV || 'development';

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: process.env.RATE_LIMIT_MAX ? parseInt(process.env.RATE_LIMIT_MAX) : 100, // Configurável via env
    message: {
      error: 'Muitas requisições deste IP, tente novamente em 15 minutos.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: 'Muitas requisições deste IP, tente novamente em 15 minutos.'
      });
    },
    // Excluir rotas de streaming do rate limiting (precisam de alta frequência para HLS)
    skip: (req) => {
      return req.path.includes('/api/streams/') && (req.path.includes('/hls') || req.path.includes('.m3u8') || req.path.includes('.ts'));
    }
  });
  
  app.use('/api/', limiter);
  logger.info('Rate limiting configurado');
}

/**
 * Configura middlewares básicos
 */
export function setupBasicMiddlewares(app) {
  // Compressão
  app.use(compression());

  // Parsing de JSON e URL
  app.use(express.json({
    limit: '1mb',
    verify: (req, res, buf, encoding) => {
      // This will trigger automatic 413 if payload exceeds limit
      if (buf.length > 1024 * 1024) {
        throw new Error('entity.too.large');
      }
    }
  }));
  app.use(express.urlencoded({
    extended: true,
    limit: '1mb',
    verify: (req, res, buf, encoding) => {
      if (buf.length > 1024 * 1024) {
        throw new Error('entity.too.large');
      }
    }
  }));

  // Logger de requisições
  app.use(requestLogger);

  logger.info('Middlewares básicos configurados');
}

/**
 * Configura todos os middlewares
 */
export function setupAllMiddlewares(app) {
  setupSecurityMiddlewares(app);
  setupRateLimit(app);
  setupBasicMiddlewares(app);
  
  logger.info('Todos os middlewares configurados com sucesso');
}