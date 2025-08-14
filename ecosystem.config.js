module.exports = {
  apps: [
    {
      name: 'newcam-backend',
      script: './backend/src/server.js',
      cwd: '/var/www/newcam',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      },
      error_file: '/var/log/newcam/backend-error.log',
      out_file: '/var/log/newcam/backend-out.log',
      log_file: '/var/log/newcam/backend.log',
      time: true,
      max_memory_restart: '1G',
      restart_delay: 4000,
      watch: false,
      ignore_watch: ['node_modules', 'logs'],
      env_production: {
        NODE_ENV: 'production',
        PORT: 3002
      }
    },
    {
      name: 'newcam-worker',
      script: './worker/src/worker.js',
      cwd: '/var/www/newcam',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3003
      },
      error_file: '/var/log/newcam/worker-error.log',
      out_file: '/var/log/newcam/worker-out.log',
      log_file: '/var/log/newcam/worker.log',
      time: true,
      max_memory_restart: '2G',
      restart_delay: 4000,
      watch: false,
      ignore_watch: ['node_modules', 'logs'],
      env_production: {
        NODE_ENV: 'production',
        PORT: 3003
      }
    },
    {
      name: 'newcam-frontend',
      script: 'serve',
      args: '-s dist -l 5173',
      cwd: '/var/www/newcam/frontend',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production'
      },
      error_file: '/var/log/newcam/frontend-error.log',
      out_file: '/var/log/newcam/frontend-out.log',
      log_file: '/var/log/newcam/frontend.log',
      time: true,
      watch: false,
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ],

  deploy: {
    production: {
      user: 'www-data',
      host: 'localhost',
      ref: 'origin/main',
      repo: 'git@github.com:username/newcam.git',
      path: '/var/www/newcam',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};