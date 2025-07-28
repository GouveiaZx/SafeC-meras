/**
 * Configurações de Rate Limiting para o servidor NewCAM
 * Protege contra ataques de força bruta e spam
 */

// Configuração principal de rate limiting
const rateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: parseInt(process.env.RATE_LIMIT_REQUESTS_PER_MINUTE) || 1000, // máximo de requests por IP (aumentado para desenvolvimento)
  message: {
    error: 'Muitas tentativas de acesso',
    message: 'Você excedeu o limite de requisições. Tente novamente em 15 minutos.',
    retryAfter: 15 * 60 // segundos
  },
  standardHeaders: true, // Retorna rate limit info nos headers `RateLimit-*`
  legacyHeaders: false, // Desabilita headers `X-RateLimit-*`
  skip: (req) => {
    // Pula rate limiting para health checks e desenvolvimento
    return req.path === '/health' || process.env.NODE_ENV === 'development';
  },
  keyGenerator: (req) => {
    // Usa IP real considerando proxies
    return req.ip || req.connection.remoteAddress;
  }
};

// Configuração específica para autenticação (mais restritiva)
const authRateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 50, // máximo 50 tentativas de login (aumentado para desenvolvimento)
  message: {
    error: 'Muitas tentativas de login',
    message: 'Você excedeu o limite de tentativas de login. Tente novamente em 15 minutos.',
    retryAfter: 15 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Não conta requests bem-sucedidos
  skipFailedRequests: false // Conta requests que falharam
};

// Configuração de slow down (reduz velocidade gradualmente)
const slowDownConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutos
  delayAfter: 50, // Permite 50 requests por IP sem delay
  delayMs: () => 500, // Adiciona 500ms de delay após o limite
  maxDelayMs: 20000, // Máximo de 20 segundos de delay
  skipSuccessfulRequests: false,
  skipFailedRequests: false
};

// Configuração específica para upload de arquivos
const uploadRateLimitConfig = {
  windowMs: 60 * 60 * 1000, // 1 hora
  max: parseInt(process.env.MAX_CONCURRENT_UPLOADS) || 10,
  message: {
    error: 'Limite de uploads excedido',
    message: 'Você excedeu o limite de uploads por hora. Tente novamente mais tarde.',
    retryAfter: 60 * 60
  },
  standardHeaders: true,
  legacyHeaders: false
};

export {
  rateLimitConfig,
  authRateLimitConfig,
  slowDownConfig,
  uploadRateLimitConfig
};