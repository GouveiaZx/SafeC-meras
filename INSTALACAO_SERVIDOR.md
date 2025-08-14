# Instalação do NewCAM em Servidor de Produção

## Informações do Servidor

### Acesso SSH
- **Servidor**: 66.94.104.241
- **Usuário**: root
- **Senha**: 98675423
- **Domínio**: nuvem.safecameras.com.br

### Portas dos Serviços
- **Backend API**: 3002
- **Worker**: 3003  
- **Frontend Dev**: 5173 (apenas desenvolvimento)
- **ZLMediaKit**: 8000, 8080 (HTTP), 1985 (API), 1935 (RTMP)
- **PostgreSQL**: 5432
- **Redis**: 6379

## Pré-requisitos do Sistema

### Sistema Operacional
- Ubuntu 20.04 LTS ou superior (recomendado)
- CentOS 8+ ou RHEL 8+
- Debian 11+

### Recursos Mínimos
- CPU: 4 cores
- RAM: 8GB
- Armazenamento: 100GB SSD
- Rede: 100Mbps

### Dependências Obrigatórias
```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar dependências essenciais
sudo apt install -y curl wget git build-essential

# Node.js 18+ (recomendado 20 LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Docker e Docker Compose v2
sudo apt install -y docker.io
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker $USER

# Instalar Docker Compose v2
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# PostgreSQL 14+ (opcional se usar Docker)
sudo apt install -y postgresql postgresql-contrib

# Redis (opcional se usar Docker)
sudo apt install -y redis-server

# Nginx
sudo apt install -y nginx

# FFmpeg (para processamento de vídeo)
sudo apt install -y ffmpeg

# Certbot (para SSL)
sudo apt install -y certbot python3-certbot-nginx
```

### PostgreSQL (Supabase)
```bash
# Instalar PostgreSQL 14+
sudo apt install -y postgresql postgresql-contrib

# Configurar PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Criar usuário e banco
sudo -u postgres psql
CREATE USER newcam WITH PASSWORD 'SuaSenh@Forte123';
CREATE DATABASE newcam OWNER newcam;
GRANT ALL PRIVILEGES ON DATABASE newcam TO newcam;
\q
```

### Redis
```bash
# Instalar Redis
sudo apt install -y redis-server

# Configurar Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Verificar
redis-cli ping
```

### Nginx
```bash
# Instalar Nginx
sudo apt install -y nginx

# Iniciar serviços
sudo systemctl start nginx
sudo systemctl enable nginx
```

## Configuração do Domínio

### DNS e SSL
1. **Configurar DNS**: Apontar `nuvem.safecameras.com.br` para o IP do servidor
2. **Instalar Certbot** para SSL automático:
```bash
sudo apt install -y certbot python3-certbot-nginx

# Gerar certificado SSL
sudo certbot --nginx -d nuvem.safecameras.com.br

# Configurar renovação automática
sudo crontab -e
# Adicionar linha:
0 12 * * * /usr/bin/certbot renew --quiet
```

## Instalação do Projeto

### 1. Preparar Diretório
```bash
# Criar estrutura de diretórios
sudo mkdir -p /var/www/newcam
sudo chown -R $USER:$USER /var/www/newcam
cd /var/www/newcam

# Extrair projeto do ZIP
unzip NewCAM.zip
cd NewCAM
```

### 2. Configurar Variáveis de Ambiente

#### Backend
```bash
# Criar arquivo .env do backend
cp backend/.env.example backend/.env
nano backend/.env
```

**Configuração do backend/.env:**
```env
# Servidor
NODE_ENV=production
PORT=3002
HOST=0.0.0.0
FRONTEND_URL=https://nuvem.safecameras.com.br

# Banco de dados
DATABASE_URL=postgresql://newcam:SuaSenh@Forte123@localhost:5432/newcam
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=newcam
DATABASE_USER=newcam
DATABASE_PASSWORD=SuaSenh@Forte123

# JWT
JWT_SECRET=SEU_JWT_SECRET_SUPER_SEGURO_AQUI_256_BITS
JWT_REFRESH_SECRET=SEU_REFRESH_SECRET_SUPER_SEGURO_AQUI_256_BITS
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# Redis
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379

# Streaming
ZLM_API_URL=https://nuvem.safecameras.com.br/index/api
ZLM_BASE_URL=https://nuvem.safecameras.com.br
ZLMEDIAKIT_API_URL=https://nuvem.safecameras.com.br/index/api
ZLMEDIAKIT_SECRET=035c73f7-bb6b-4889-a715-d9eb2d1925cc

# CORS
CORS_ORIGIN=https://nuvem.safecameras.com.br
CORS_CREDENTIALS=true

# Logs
LOG_LEVEL=info
LOG_FILE=/var/log/newcam/backend.log

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

#### Frontend
```bash
# Criar arquivo .env do frontend
cp frontend/.env.example frontend/.env
nano frontend/.env
```

**Configuração do frontend/.env:**
```env
VITE_API_URL=https://nuvem.safecameras.com.br/api
VITE_WS_URL=wss://nuvem.safecameras.com.br
VITE_ZLM_BASE_URL=https://nuvem.safecameras.com.br
VITE_DOMAIN=nuvem.safecameras.com.br
```

#### Worker
```bash
# Criar arquivo .env do worker
cp worker/.env.example worker/.env
nano worker/.env
```

**Configuração do worker/.env:**
```env
NODE_ENV=production
PORT=3003
BACKEND_URL=https://nuvem.safecameras.com.br/api
REDIS_URL=redis://localhost:6379
LOG_LEVEL=info
```

### 3. Instalar Dependências

```bash
# Backend
cd backend
npm install --production
cd ..

# Frontend
cd frontend
npm install
npm run build
cd ..

# Worker
cd worker
npm install --production
cd ..
```

### 4. Configurar ZLMediaKit

```bash
# Baixar e configurar ZLMediaKit
./scripts/install-zlmediakit-production.sh

# Ou instalação manual:
cd /opt
sudo wget https://github.com/ZLMediaKit/ZLMediaKit/releases/latest/download/ZLMediaKit_linux.tar.gz
sudo tar -xzf ZLMediaKit_linux.tar.gz
sudo mv ZLMediaKit* ZLMediaKit
sudo chown -R $USER:$USER /opt/ZLMediaKit

# Configurar config.ini
sudo cp config.ini /opt/ZLMediaKit/conf/config.ini
```

### 5. Configurar Nginx

```bash
# Backup da configuração atual
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup

# Copiar configuração do projeto
sudo cp docker/nginx/nginx.conf /etc/nginx/sites-available/newcam
sudo ln -sf /etc/nginx/sites-available/newcam /etc/nginx/sites-enabled/newcam
sudo rm -f /etc/nginx/sites-enabled/default

# Criar diretórios para arquivos estáticos
sudo mkdir -p /var/www/newcam/frontend/dist
sudo mkdir -p /var/www/newcam/uploads
sudo mkdir -p /var/www/newcam/streams
sudo mkdir -p /var/www/newcam/recordings

# Copiar build do frontend
sudo cp -r frontend/dist/* /var/www/newcam/frontend/dist/

# Ajustar permissões
sudo chown -R www-data:www-data /var/www/newcam
sudo chmod -R 755 /var/www/newcam

# Testar configuração
sudo nginx -t
sudo systemctl reload nginx
```

### 6. Configurar Serviços (SystemD)

#### Backend Service
```bash
sudo nano /etc/systemd/system/newcam-backend.service
```

```ini
[Unit]
Description=NewCAM Backend API
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/newcam/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=newcam-backend

[Install]
WantedBy=multi-user.target
```

#### Worker Service
```bash
sudo nano /etc/systemd/system/newcam-worker.service
```

```ini
[Unit]
Description=NewCAM Worker
After=network.target newcam-backend.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/newcam/worker
Environment=NODE_ENV=production
ExecStart=/usr/bin/node src/worker.js
Restart=always
RestartSec=5
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=newcam-worker

[Install]
WantedBy=multi-user.target
```

#### ZLMediaKit Service
```bash
sudo nano /etc/systemd/system/zlmediakit.service
```

```ini
[Unit]
Description=ZLMediaKit Streaming Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/ZLMediaKit
ExecStart=/opt/ZLMediaKit/bin/MediaServer -c /opt/ZLMediaKit/conf/config.ini
Restart=always
RestartSec=5
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=zlmediakit

[Install]
WantedBy=multi-user.target
```

### 7. Configurar Logs
```bash
# Criar diretórios de log
sudo mkdir -p /var/log/newcam
sudo chown -R www-data:www-data /var/log/newcam

# Configurar logrotate
sudo nano /etc/logrotate.d/newcam
```

```
/var/log/newcam/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 www-data www-data
    postrotate
        systemctl reload newcam-backend newcam-worker
    endscript
}
```

## Inicialização dos Serviços

### 1. Configurar Banco de Dados
```bash
# Executar migrations (se necessário)
cd /var/www/newcam/backend
npm run migrate

# Ou importar dump do banco
psql -U newcam -h localhost newcam < database_backup.sql
```

### 2. Iniciar Serviços
```bash
# Recarregar systemd
sudo systemctl daemon-reload

# Habilitar serviços para inicialização automática
sudo systemctl enable newcam-backend
sudo systemctl enable newcam-worker
sudo systemctl enable zlmediakit

# Iniciar serviços
sudo systemctl start zlmediakit
sudo systemctl start newcam-backend
sudo systemctl start newcam-worker

# Verificar status
sudo systemctl status zlmediakit
sudo systemctl status newcam-backend
sudo systemctl status newcam-worker
```

### 3. Verificar Funcionamento
```bash
# Testar API
curl -I https://nuvem.safecameras.com.br/api/health

# Testar ZLMediaKit
curl -I https://nuvem.safecameras.com.br/index/api/getServerConfig

# Testar frontend
curl -I https://nuvem.safecameras.com.br

# Verificar logs
sudo journalctl -u newcam-backend -f
sudo journalctl -u newcam-worker -f
sudo journalctl -u zlmediakit -f
```

## Docker (Alternativa)

Se preferir usar Docker em produção:

```bash
# Configurar variáveis para produção
cp .env.example .env
nano .env

# Atualizar domínio no docker-compose.yml
sed -i 's/localhost/nuvem.safecameras.com.br/g' docker/docker-compose.yml

# Iniciar com Docker
docker-compose -f docker/docker-compose.yml up -d

# Verificar containers
docker-compose ps
```

## Monitoramento e Manutenção

### Logs Úteis
```bash
# Backend
sudo journalctl -u newcam-backend -f

# Worker
sudo journalctl -u newcam-worker -f

# ZLMediaKit
sudo journalctl -u zlmediakit -f

# Nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Comandos de Manutenção
```bash
# Reiniciar serviços
sudo systemctl restart newcam-backend
sudo systemctl restart newcam-worker
sudo systemctl restart zlmediakit
sudo systemctl reload nginx

# Verificar recursos
htop
df -h
free -h

# Backup banco de dados
pg_dump -U newcam -h localhost newcam > backup_$(date +%Y%m%d_%H%M%S).sql
```

### URLs de Acesso
- **Frontend**: https://nuvem.safecameras.com.br
- **API**: https://nuvem.safecameras.com.br/api
- **Health Check**: https://nuvem.safecameras.com.br/api/health
- **ZLMediaKit**: https://nuvem.safecameras.com.br/index/api

## Troubleshooting

### Problemas Comuns

1. **Erro 502 Bad Gateway**
   - Verificar se os serviços estão rodando
   - Verificar logs do backend/worker

2. **Problemas de SSL**
   - Renovar certificado: `sudo certbot renew`
   - Verificar configuração Nginx

3. **Falha na autenticação**
   - Verificar JWT_SECRET no .env
   - Verificar conexão com banco de dados

4. **Problemas de streaming**
   - Verificar se ZLMediaKit está rodando
   - Verificar configuração de CORS
   - Verificar webhooks

### Contatos de Suporte
Para dúvidas ou problemas, contate a equipe de desenvolvimento.

---

**Última atualização**: $(date)
**Versão do Projeto**: 1.0.0