/**
 * Configurações de CORS para o servidor NewCAM
 * Controla quais origens podem acessar a API
 */

const corsConfig = {
  origin: function (origin, callback) {
    // Lista de origens permitidas
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://localhost:5176',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
      'http://127.0.0.1:5175',
      'http://127.0.0.1:5176',
      'http://66.94.104.241',
      'http://66.94.104.241:80',
      'http://66.94.104.241:3000',
      'http://66.94.104.241:5173',
      process.env.FRONTEND_URL,
      process.env.DOMAIN
    ].filter(Boolean); // Remove valores undefined/null

    // Em desenvolvimento, permite qualquer origem
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }

    // Em produção, verifica se a origem está na lista permitida
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Não permitido pelo CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'X-API-Key',
    'Range',
    'Accept-Ranges',
    'Content-Range',
    'If-Range',
    'If-Modified-Since',
    'If-None-Match',
    'Pragma',
    'Expires',
    'User-Agent',
    'Referer'
  ],
  exposedHeaders: [
    'X-Total-Count',
    'X-Page-Count',
    'X-Current-Page',
    'X-Per-Page',
    'Accept-Ranges',
    'Content-Range',
    'Content-Length',
    'Content-Type',
    'ETag',
    'Last-Modified',
    'Cache-Control',
    'Pragma'
  ],
  maxAge: 86400, // 24 horas
  preflightContinue: false,
  optionsSuccessStatus: 200
};

export { corsConfig };