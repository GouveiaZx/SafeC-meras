# Guia de Deploy - Sistema NewCAM

## Visão Geral
Este documento contém instruções completas para deploy do sistema NewCAM no servidor, incluindo frontend, backend, worker e todas as configurações necessárias.

## Estrutura do Sistema
- **Frontend**: Porta 5173
- **Backend**: Porta 3002  
- **Worker**: Porta 3003
- **Docker**: Containers para serviços auxiliares

## Pré-requisitos no Servidor
- Node.js 18+ instalado
- Docker e Docker Compose instalados
- PM2 para gerenciamento de processos
- Nginx para proxy reverso (opcional)

## Estrutura de Arquivos para Deploy

```
newcam-deploy/
├── frontend/
│   ├── dist/           # Build do frontend
│   └── package.json
├── backend/
│   ├── src/
│   ├── package.json
│   └── .env
├── worker/
│   ├── src/
│   ├── package.json
│   └── .env
├── docker/
│   ├── docker-compose.yml
│   └── .env
├── scripts/
│   ├── deploy.sh
│   ├── start-services.sh
│   └── stop-services.sh
└── ecosystem.config.js  # Configuração PM2
```

## Passo a Passo do Deploy

### 1. Preparação Local

#### 1.1 Build do Frontend
```bash
cd frontend
npm install
npm run build
```

#### 1.2 Preparar Backend
```bash
cd backend
npm install --production
```

#### 1.3 Preparar Worker
```bash
cd worker
npm install --production
```

### 2. Configuração de Ambiente

#### 2.1 Backend (.env)
```env
# Servidor
PORT=3002
NODE_ENV=production

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/newcam
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=7d

# Streaming
STREAMING_SERVER_URL=http://localhost:1935
HLS_OUTPUT_DIR=/var/www/streams
RTMP_SERVER_URL=rtmp://localhost:1935/live

# Storage
UPLOAD_DIR=/var/newcam/uploads
RECORDING_DIR=/var/newcam/recordings

# Redis
REDIS_URL=redis://localhost:6379

# Logs
LOG_LEVEL=info
LOG_DIR=/var/log/newcam
```

#### 2.2 Worker (.env)
```env
# Servidor
PORT=3003
NODE_ENV=production

# Database (mesmo do backend)
DATABASE_URL=postgresql://user:password@localhost:5432/newcam
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Worker específico
WORKER_CONCURRENCY=4
JOB_TIMEOUT=300000
RETRY_ATTEMPTS=3

# Processamento
FFMPEG_PATH=/usr/bin/ffmpeg
FFPROBE_PATH=/usr/bin/ffprobe

# Storage
RECORDING_DIR=/var/newcam/recordings
TEMP_DIR=/tmp/newcam

# Redis
REDIS_URL=redis://localhost:6379

# Logs
LOG_LEVEL=info
LOG_DIR=/var/log/newcam
```

#### 2.3 Docker (.env)
```env
# PostgreSQL
POSTGRES_DB=newcam
POSTGRES_USER=newcam_user
POSTGRES_PASSWORD=secure_password_here
POSTGRES_PORT=5432

# Redis
REDIS_PORT=6379
REDIS_PASSWORD=redis_password_here

# SRS (Streaming)
SRS_HTTP_PORT=8080
SRS_RTMP_PORT=1935
SRS_HLS_PORT=8081

# Volumes
DATA_DIR=/var/newcam/data
LOGS_DIR=/var/log/newcam
STREAMS_DIR=/var/www/streams
```

### 3. Docker Compose

#### 3.1 docker-compose.yml
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: newcam-postgres
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports:
      - "${POSTGRES_PORT}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    restart: unless-stopped
    networks:
      - newcam-network

  redis:
    image: redis:7-alpine
    container_name: newcam-redis
    command: redis-server --requirepass ${REDIS_PASSWORD}
    ports:
      - "${REDIS_PORT}:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped
    networks:
      - newcam-network

  srs:
    image: ossrs/srs:5
    container_name: newcam-srs
    ports:
      - "${SRS_RTMP_PORT}:1935"
      - "${SRS_HTTP_PORT}:8080"
      - "${SRS_HLS_PORT}:8081"
    volumes:
      - ./srs.conf:/usr/local/srs/conf/srs.conf
      - ${STREAMS_DIR}:/var/www/streams
    restart: unless-stopped
    networks:
      - newcam-network

  nginx:
    image: nginx:alpine
    container_name: newcam-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ${STREAMS_DIR}:/var/www/streams
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - srs
    restart: unless-stopped
    networks:
      - newcam-network

volumes:
  postgres_data:
  redis_data:

networks:
  newcam-network:
    driver: bridge
```

### 4. Configuração PM2

#### 4.1 ecosystem.config.js
```javascript
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
      restart_delay: 4000
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
      restart_delay: 4000
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
      time: true
    }
  ]
};
```

### 5. Scripts de Deploy

#### 5.1 deploy.sh
```bash
#!/bin/bash

set -e

echo "🚀 Iniciando deploy do NewCAM..."

# Variáveis
DEPLOY_DIR="/var/www/newcam"
BACKUP_DIR="/var/backups/newcam"
DATE=$(date +%Y%m%d_%H%M%S)

# Criar backup
echo "📦 Criando backup..."
mkdir -p $BACKUP_DIR
if [ -d "$DEPLOY_DIR" ]; then
    tar -czf "$BACKUP_DIR/newcam_backup_$DATE.tar.gz" -C "$DEPLOY_DIR" .
fi

# Parar serviços
echo "⏹️ Parando serviços..."
pm2 stop ecosystem.config.js || true

# Criar diretórios
echo "📁 Criando diretórios..."
mkdir -p $DEPLOY_DIR
mkdir -p /var/log/newcam
mkdir -p /var/newcam/{uploads,recordings,data}
mkdir -p /var/www/streams

# Copiar arquivos
echo "📋 Copiando arquivos..."
cp -r ./* $DEPLOY_DIR/

# Instalar dependências
echo "📦 Instalando dependências..."
cd $DEPLOY_DIR

# Backend
cd backend
npm ci --production
cd ..

# Worker
cd worker
npm ci --production
cd ..

# Frontend (instalar serve se não existir)
npm install -g serve

# Configurar permissões
echo "🔐 Configurando permissões..."
chown -R www-data:www-data /var/newcam
chown -R www-data:www-data /var/www/streams
chown -R www-data:www-data /var/log/newcam
chmod -R 755 /var/newcam
chmod -R 755 /var/www/streams

# Iniciar Docker
echo "🐳 Iniciando containers Docker..."
cd docker
docker-compose down || true
docker-compose up -d

# Aguardar containers
echo "⏳ Aguardando containers..."
sleep 30

# Executar migrações (se necessário)
echo "🗄️ Executando migrações..."
cd $DEPLOY_DIR/backend
npm run migrate || true

# Iniciar aplicações
echo "🚀 Iniciando aplicações..."
cd $DEPLOY_DIR
pm2 start ecosystem.config.js

# Verificar status
echo "✅ Verificando status..."
pm2 status
docker-compose -f docker/docker-compose.yml ps

echo "🎉 Deploy concluído com sucesso!"
echo "Frontend: http://localhost:5173"
echo "Backend: http://localhost:3002"
echo "Worker: http://localhost:3003"
```

#### 5.2 start-services.sh
```bash
#!/bin/bash

echo "🚀 Iniciando todos os serviços do NewCAM..."

# Iniciar Docker
echo "🐳 Iniciando containers..."
cd /var/www/newcam/docker
docker-compose up -d

# Aguardar containers
echo "⏳ Aguardando containers..."
sleep 15

# Iniciar aplicações
echo "📱 Iniciando aplicações..."
cd /var/www/newcam
pm2 start ecosystem.config.js

echo "✅ Todos os serviços iniciados!"
pm2 status
```

#### 5.3 stop-services.sh
```bash
#!/bin/bash

echo "⏹️ Parando todos os serviços do NewCAM..."

# Parar aplicações
echo "📱 Parando aplicações..."
pm2 stop ecosystem.config.js

# Parar Docker
echo "🐳 Parando containers..."
cd /var/www/newcam/docker
docker-compose down

echo "✅ Todos os serviços parados!"
```

### 6. Comandos de Deploy

#### 6.1 Preparação do Pacote Local
```bash
# 1. Build do frontend
cd frontend
npm run build

# 2. Criar estrutura de deploy
mkdir newcam-deploy
cp -r frontend/dist newcam-deploy/frontend/
cp frontend/package.json newcam-deploy/frontend/
cp -r backend newcam-deploy/
cp -r worker newcam-deploy/
cp -r docker newcam-deploy/
cp ecosystem.config.js newcam-deploy/
cp -r scripts newcam-deploy/

# 3. Compactar
tar -czf newcam-deploy.tar.gz newcam-deploy/
```

#### 6.2 Deploy no Servidor
```bash
# 1. Enviar arquivo
scp newcam-deploy.tar.gz user@servidor:/tmp/

# 2. No servidor
ssh user@servidor
cd /tmp
tar -xzf newcam-deploy.tar.gz
cd newcam-deploy
sudo chmod +x scripts/*.sh
sudo ./scripts/deploy.sh
```

### 7. Verificação Pós-Deploy

#### 7.1 Verificar Serviços
```bash
# PM2
pm2 status
pm2 logs

# Docker
docker-compose ps
docker-compose logs

# Portas
netstat -tlnp | grep -E ':(5173|3002|3003|5432|6379|1935|8080)'
```

#### 7.2 Testes de Conectividade
```bash
# Frontend
curl http://localhost:5173

# Backend
curl http://localhost:3002/api/health

# Worker
curl http://localhost:3003/health
```

### 8. Monitoramento

#### 8.1 Logs
```bash
# Aplicações
tail -f /var/log/newcam/*.log

# PM2
pm2 logs

# Docker
docker-compose logs -f
```

#### 8.2 Recursos
```bash
# PM2
pm2 monit

# Docker
docker stats

# Sistema
htop
df -h
```

### 9. Troubleshooting

#### 9.1 Problemas Comuns

**Erro de permissão:**
```bash
sudo chown -R www-data:www-data /var/newcam
sudo chown -R www-data:www-data /var/www/streams
```

**Porta em uso:**
```bash
sudo lsof -i :5173
sudo kill -9 <PID>
```

**Container não inicia:**
```bash
docker-compose logs <service_name>
docker-compose restart <service_name>
```

#### 9.2 Rollback
```bash
# Parar serviços
pm2 stop ecosystem.config.js
docker-compose down

# Restaurar backup
cd /var/backups/newcam
tar -xzf newcam_backup_<DATE>.tar.gz -C /var/www/newcam

# Reiniciar
./scripts/start-services.sh
```

### 10. Manutenção

#### 10.1 Backup Automático
```bash
# Adicionar ao crontab
0 2 * * * /var/www/newcam/scripts/backup.sh
```

#### 10.2 Limpeza de Logs
```bash
# Rotacionar logs PM2
pm2 flush

# Limpar logs Docker
docker system prune -f
```

---

## Checklist Final

- [ ] Frontend rodando na porta 5173
- [ ] Backend rodando na porta 3002
- [ ] Worker rodando na porta 3003
- [ ] PostgreSQL funcionando
- [ ] Redis funcionando
- [ ] SRS (streaming) funcionando
- [ ] Nginx configurado
- [ ] Logs sendo gerados
- [ ] Permissões corretas
- [ ] Backup configurado

## Contatos de Suporte

Para problemas durante o deploy, verificar:
1. Logs das aplicações
2. Status dos containers
3. Conectividade de rede
4. Permissões de arquivo
5. Configurações de ambiente

---

**Última atualização:** $(date)
**Versão:** 1.0.0