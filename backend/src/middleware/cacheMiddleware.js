/**
 * Middleware de Cache para otimização automática de rotas
 * Sistema NewCAM - Gravação Contínua
 */

import CacheService from '../services/CacheService.js';
import { logger } from '../config/logger.js';

/**
 * Middleware de cache para rotas GET
 */
export const cacheMiddleware = (options = {}) => {
  const {
    ttl = 300,           // TTL padrão: 5 minutos
    keyGenerator = null, // Função personalizada para gerar chave
    condition = null,    // Condição para aplicar cache
    skipCache = false    // Pular cache (útil para desenvolvimento)
  } = options;

  return async (req, res, next) => {
    // Aplicar cache apenas para métodos GET
    if (req.method !== 'GET') {
      return next();
    }

    // Verificar condição personalizada
    if (condition && !condition(req)) {
      return next();
    }

    // Pular cache se configurado
    if (skipCache || process.env.SKIP_CACHE === 'true') {
      return next();
    }

    try {
      // Gerar chave do cache
      const cacheKey = keyGenerator 
        ? keyGenerator(req)
        : generateDefaultCacheKey(req);

      logger.debug(`Verificando cache para: ${cacheKey}`);

      // Tentar obter dados do cache
      const cachedData = await CacheService.getOrSet(
        cacheKey,
        async () => {
          // Capturar resposta original
          return await captureResponse(req, res, next);
        },
        ttl
      );

      if (cachedData && cachedData.fromCache) {
        // Dados do cache - enviar resposta
        res.set('X-Cache', 'HIT');
        res.set('X-Cache-Key', cacheKey);
        return res.status(cachedData.status).json(cachedData.data);
      }

      // Cache miss - continuar com o fluxo normal
      res.set('X-Cache', 'MISS');
      res.set('X-Cache-Key', cacheKey);
      
      // Interceptar resposta para armazenar no cache
      interceptResponse(res, cacheKey, ttl);
      
      next();

    } catch (error) {
      logger.error('Erro no middleware de cache:', error);
      // Em caso de erro, continuar sem cache
      next();
    }
  };
};

/**
 * Middleware específico para câmeras
 */
export const cameraCacheMiddleware = cacheMiddleware({
  ttl: 300, // 5 minutos
  keyGenerator: (req) => {
    const baseKey = 'api:cameras';
    if (req.params.id) {
      return `${baseKey}:${req.params.id}`;
    }
    
    // Incluir query parameters na chave
    const queryString = new URLSearchParams(req.query).toString();
    return queryString ? `${baseKey}:list:${queryString}` : `${baseKey}:list`;
  },
  condition: (req) => {
    // Não cachear se houver parâmetros de busca em tempo real
    return !req.query.realtime;
  }
});

/**
 * Middleware específico para gravações
 */
export const recordingCacheMiddleware = cacheMiddleware({
  ttl: 600, // 10 minutos
  keyGenerator: (req) => {
    const baseKey = 'api:recordings';
    const cameraId = req.params.cameraId || req.query.camera_id;
    
    if (cameraId) {
      const queryString = new URLSearchParams(req.query).toString();
      return queryString 
        ? `${baseKey}:camera:${cameraId}:${queryString}`
        : `${baseKey}:camera:${cameraId}`;
    }
    
    return `${baseKey}:list:${new URLSearchParams(req.query).toString()}`;
  }
});

/**
 * Middleware específico para métricas
 */
export const metricsCacheMiddleware = cacheMiddleware({
  ttl: 60, // 1 minuto
  keyGenerator: (req) => {
    const baseKey = 'api:metrics';
    const type = req.params.type || 'system';
    const queryString = new URLSearchParams(req.query).toString();
    
    return queryString 
      ? `${baseKey}:${type}:${queryString}`
      : `${baseKey}:${type}`;
  }
});

/**
 * Middleware específico para status do sistema
 */
export const statusCacheMiddleware = cacheMiddleware({
  ttl: 30, // 30 segundos
  keyGenerator: (req) => {
    return `api:status:${req.path.replace(/\//g, ':')}`;
  }
});

/**
 * Middleware para invalidação de cache
 */
export const cacheInvalidationMiddleware = (patterns = []) => {
  return async (req, res, next) => {
    // Aplicar apenas para métodos que modificam dados
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next();
    }

    // Executar a operação original primeiro
    const originalSend = res.send;
    
    res.send = async function(data) {
      // Verificar se a operação foi bem-sucedida
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          // Invalidar cache baseado nos padrões fornecidos
          for (const pattern of patterns) {
            const resolvedPattern = typeof pattern === 'function' 
              ? pattern(req, res)
              : pattern;
            
            if (resolvedPattern) {
              await CacheService.invalidate(resolvedPattern);
              logger.debug(`Cache invalidado: ${resolvedPattern}`);
            }
          }
        } catch (error) {
          logger.error('Erro ao invalidar cache:', error);
        }
      }
      
      // Chamar o método original
      originalSend.call(this, data);
    };

    next();
  };
};

/**
 * Middleware para invalidação automática baseada na rota
 */
export const autoInvalidationMiddleware = {
  cameras: cacheInvalidationMiddleware([
    'api:cameras:*',
    'api:metrics:*',
    'api:status:*'
  ]),
  
  recordings: cacheInvalidationMiddleware([
    (req) => `api:recordings:*`,
    (req) => req.params.cameraId ? `api:recordings:camera:${req.params.cameraId}:*` : null,
    'api:metrics:*'
  ]),
  
  settings: cacheInvalidationMiddleware([
    'api:cameras:*',
    'api:settings:*',
    'api:status:*'
  ])
};

/**
 * Gerar chave padrão do cache
 */
function generateDefaultCacheKey(req) {
  const path = req.path.replace(/\//g, ':');
  const queryString = new URLSearchParams(req.query).toString();
  
  return queryString 
    ? `api${path}:${queryString}`
    : `api${path}`;
}

/**
 * Capturar resposta para cache
 */
async function captureResponse(req, res, next) {
  return new Promise((resolve) => {
    const originalSend = res.send;
    
    res.send = function(data) {
      try {
        const responseData = {
          status: res.statusCode,
          data: typeof data === 'string' ? JSON.parse(data) : data,
          fromCache: true,
          timestamp: new Date().toISOString()
        };
        
        resolve(responseData);
      } catch (error) {
        logger.error('Erro ao capturar resposta para cache:', error);
        resolve(null);
      }
      
      // Restaurar método original e enviar resposta
      res.send = originalSend;
      originalSend.call(this, data);
    };
    
    next();
  });
}

/**
 * Interceptar resposta para armazenar no cache
 */
function interceptResponse(res, cacheKey, ttl) {
  const originalSend = res.send;
  
  res.send = async function(data) {
    // Armazenar no cache apenas se a resposta for bem-sucedida
    if (res.statusCode >= 200 && res.statusCode < 300) {
      try {
        const responseData = {
          status: res.statusCode,
          data: typeof data === 'string' ? JSON.parse(data) : data,
          fromCache: true,
          timestamp: new Date().toISOString()
        };
        
        await CacheService.getOrSet(
          cacheKey,
          async () => responseData,
          ttl
        );
        
        logger.debug(`Resposta armazenada no cache: ${cacheKey}`);
      } catch (error) {
        logger.error('Erro ao armazenar resposta no cache:', error);
      }
    }
    
    // Chamar método original
    originalSend.call(this, data);
  };
}

/**
 * Middleware para estatísticas de cache
 */
export const cacheStatsMiddleware = async (req, res, next) => {
  if (req.path === '/api/cache/stats' && req.method === 'GET') {
    try {
      const stats = await CacheService.getStats();
      return res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Erro ao obter estatísticas do cache:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao obter estatísticas do cache'
      });
    }
  }
  
  next();
};

/**
 * Middleware para limpeza manual do cache
 */
export const cacheClearMiddleware = async (req, res, next) => {
  if (req.path === '/api/cache/clear' && req.method === 'POST') {
    try {
      const { pattern } = req.body;
      
      let clearedKeys = 0;
      
      if (pattern) {
        clearedKeys = await CacheService.invalidate(pattern);
      } else {
        clearedKeys = await CacheService.clearAll();
      }
      
      return res.json({
        success: true,
        message: `Cache limpo: ${clearedKeys} chaves removidas`,
        cleared_keys: clearedKeys
      });
    } catch (error) {
      logger.error('Erro ao limpar cache:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao limpar cache'
      });
    }
  }
  
  next();
};

export default {
  cacheMiddleware,
  cameraCacheMiddleware,
  recordingCacheMiddleware,
  metricsCacheMiddleware,
  statusCacheMiddleware,
  cacheInvalidationMiddleware,
  autoInvalidationMiddleware,
  cacheStatsMiddleware,
  cacheClearMiddleware
};