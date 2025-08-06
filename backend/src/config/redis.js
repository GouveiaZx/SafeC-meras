import Redis from 'ioredis';
import { logger } from './logger.js';

// Configuração do Redis
let redisConfig;

if (process.env.REDIS_URL) {
  // Usar REDIS_URL se disponível (formato: redis://host:port)
  redisConfig = process.env.REDIS_URL;
} else {
  // Fallback para configuração individual
  redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB) || 0,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    keepAlive: 30000,
    connectTimeout: 10000,
    commandTimeout: 5000
  };
}

// Cliente Redis principal
const redisClient = new Redis(redisConfig);

// Eventos do Redis
redisClient.on('connect', () => {
  logger.info('Redis conectado com sucesso');
});

redisClient.on('ready', () => {
  logger.info('Redis pronto para uso');
});

redisClient.on('error', (error) => {
  logger.error('Erro no Redis:', error);
});

redisClient.on('close', () => {
  logger.warn('Conexão Redis fechada');
});

redisClient.on('reconnecting', () => {
  logger.info('Reconectando ao Redis...');
});

// Função para conectar ao Redis
export const connectRedis = async () => {
  try {
    // Para ioredis, apenas fazer um ping para forçar a conexão
    await redisClient.ping();
    logger.info('Redis conectado com sucesso');
    return redisClient;
  } catch (error) {
    logger.error('Erro ao conectar ao Redis:', error);
    throw error;
  }
};

// Função para desconectar do Redis
export const disconnectRedis = async () => {
  try {
    await redisClient.quit();
    logger.info('Redis desconectado');
  } catch (error) {
    logger.error('Erro ao desconectar do Redis:', error);
  }
};

// Função para verificar se o Redis está conectado
export const isRedisConnected = () => {
  return redisClient.status === 'ready';
};

// Função para obter estatísticas do Redis
export const getRedisStats = async () => {
  try {
    const info = await redisClient.info();
    const memory = await redisClient.info('memory');
    const stats = await redisClient.info('stats');
    
    return {
      status: redisClient.status,
      info: info,
      memory: memory,
      stats: stats
    };
  } catch (error) {
    logger.error('Erro ao obter estatísticas do Redis:', error);
    return {
      status: 'error',
      error: error.message
    };
  }
};

export default redisClient;
export { redisClient };