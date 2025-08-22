/**
 * =========================================================
 * PM2 ECOSYSTEM CONFIGURATION - SISTEMA NEWCAM
 * =========================================================
 * Configuração de produção para gerenciamento de processos
 * Servidor: nuvem.safecameras.com.br (66.94.104.241)
 * 
 * Comandos úteis:
 * - pm2 start ecosystem.config.js
 * - pm2 restart all
 * - pm2 stop all
 * - pm2 logs
 * - pm2 monit
 * - pm2 status
 */

module.exports = {
  apps: [
    {
      // =====================================
      // BACKEND API SERVICE
      // =====================================
      name: 'newcam-backend',
      script: './backend/src/server.js',
      cwd: '/var/www/newcam',
      
      // Instâncias e modo de execução
      instances: 1,
      exec_mode: 'fork', // Usar fork por ora, pode mudar para cluster depois
      
      // Variáveis de ambiente
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
        LOG_LEVEL: 'info'
      },
      
      // Configurações de log
      log_file: '/var/log/newcam/backend_combined.log',
      out_file: '/var/log/newcam/backend_out.log',
      error_file: '/var/log/newcam/backend_error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Configurações de restart
      autorestart: true,
      watch: false, // Não usar watch em produção
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      
      // Configurações de recursos
      max_memory_restart: '500M',
      
      // Health check
      health_check_grace_period: 3000,
      health_check_fatal_exceptions: true,
      
      // Ignorar diretórios
      ignore_watch: ['node_modules', 'logs', 'storage']
    },
    
    {
      // =====================================
      // WORKER SERVICE
      // =====================================
      name: 'newcam-worker',
      script: './worker/src/worker.js',
      cwd: '/var/www/newcam',
      
      // Instâncias e modo de execução
      instances: 1,
      exec_mode: 'fork',
      
      // Variáveis de ambiente
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        LOG_LEVEL: 'info',
        WORKER_TOKEN: 'newcam-worker-token-2025-secure'
      },
      
      // Configurações de log
      log_file: '/var/log/newcam/worker_combined.log',
      out_file: '/var/log/newcam/worker_out.log',
      error_file: '/var/log/newcam/worker_error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Configurações de restart
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      
      // Configurações de recursos
      max_memory_restart: '300M',
      
      // Health check
      health_check_grace_period: 3000,
      health_check_fatal_exceptions: true,
      
      // Ignorar diretórios
      ignore_watch: ['node_modules', 'logs', 'storage']
    }
  ],
  
  // =========================================
  // CONFIGURAÇÃO DE DEPLOY
  // =========================================
  deploy: {
    production: {
      user: 'root',
      host: '66.94.104.241',
      ref: 'origin/main',
      repo: 'git@github.com:seu-usuario/newcam-surveillance-system.git',
      path: '/var/www/newcam',
      
      // Comandos de deploy
      'pre-deploy-local': '',
      'post-deploy': 'npm ci --production && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    },
    
    staging: {
      user: 'root',
      host: 'staging.safecameras.com.br',
      ref: 'origin/develop',
      repo: 'git@github.com:seu-usuario/newcam-surveillance-system.git',
      path: '/var/www/newcam-staging',
      
      // Comandos de deploy
      'post-deploy': 'npm ci && pm2 reload ecosystem.config.js --env staging'
    }
  },
  
  // =========================================
  // CONFIGURAÇÕES GLOBAIS
  // =========================================
  
  // Configurações de restart automático
  'shutdown_with_message': true,
  'kill_timeout': 5000,
  'restart_time': true,
  
  // Configurações de merge de logs
  'merge_logs': true,
  
  // Configurações de timestamp
  'time': true
};