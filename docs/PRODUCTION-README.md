# NewCAM - Configuração de Produção

Guia completo para deploy e configuração do sistema NewCAM em ambiente de produção.

## 🌐 Servidor de Produção

### Informações do Servidor
- **IP**: 66.94.104.241
- **Sistema**: Ubuntu 20.04 LTS
- **Usuário**: root
- **Caminho da Aplicação**: /var/www/newcam
- **Status**: ✅ Online e Funcional

### URLs de Acesso
- **Frontend**: http://66.94.104.241
- **API Health Check**: http://66.94.104.241/api/health
- **ZLMediaKit API**: http://66.94.104.241:8000/index/api/
- **SRS API**: http://66.94.104.241:8080/api/v1/

## 🏗️ Arquitetura de Produção

### Serviços Configurados

| Serviço | Porta | Status | Descrição |
|---------|-------|--------|----------|
| **Nginx** | 80 | ✅ | Proxy reverso e frontend |
| **Backend API** | 3002 | ✅ | API REST + WebSocket |
| **Worker** | 3001 | ✅ | Monitoramento de câmeras |
| **ZLMediaKit** | 8000 | ✅ | Servidor de streaming principal |
| **SRS** | 8080 | ✅ | Servidor de streaming alternativo |
| **PostgreSQL** | 5432 | ✅ | Banco de dados (Supabase) |

### Configurações de Streaming

#### ZLMediaKit
- **Porta HTTP**: 8000
- **Porta RTMP**: 1935
- **Porta RTSP**: 554
- **Secret**: 035c73f7-bb6b-4889-a715-d9eb2d1925cc
- **Config**: `/var/www/newcam/docker/zlmediakit/config.ini`

#### SRS (Simple Realtime Server)
- **Porta HTTP**: 8080
- **Porta RTMP**: 1936
- **Config**: `/var/www/newcam/docker/srs/srs.conf`

## 🚀 Deploy em Produção

### Pré-requisitos

```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar dependências
sudo apt install -y nodejs npm nginx docker.io docker-compose git

# Configurar Docker
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker $USER
```

### Processo de Deploy

#### 1. Preparação do Servidor

```bash
# Criar diretório da aplicação
sudo mkdir -p /var/www/newcam
sudo chown -R $USER:$USER /var/www/newcam

# Clonar repositório
cd /var/www
git clone <repository-url> newcam
cd newcam
```

#### 2. Configuração de Ambiente

```bash
# Copiar e configurar variáveis de ambiente
cp .env.example .env

# Editar .env com configurações de produção
nano .env
```

**Variáveis de Produção (.env)**:
```env
# Ambiente
NODE_ENV=production

# Supabase
SUPABASE_URL=https://grkvfzuadctextnbpajb.supabase.co
SUPABASE_ANON_KEY=your-production-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-production-service-role-key

# Streaming
ZLM_API_URL=http://localhost:8000
ZLM_SECRET=035c73f7-bb6b-4889-a715-d9eb2d1925cc
SRS_API_URL=http://localhost:8080
SRS_SECRET=your-srs-secret

# Wasabi S3
WASABI_ACCESS_KEY=your-production-access-key
WASABI_SECRET_KEY=your-production-secret-key
WASABI_BUCKET=newcam-recordings-prod
WASABI_REGION=us-east-1
WASABI_ENDPOINT=https://s3.wasabisys.com

# Worker
WORKER_TOKEN=your-production-worker-token

# URLs
CORS_ORIGIN=http://66.94.104.241
FRONTEND_URL=http://66.94.104.241
```

#### 3. Build e Instalação

```bash
# Instalar dependências do backend
cd backend
npm install --production
cp .env.example .env
# Configurar .env do backend

# Build do frontend
cd ../frontend
npm install
npm run build

# Instalar dependências do worker
cd ../worker
npm install --production
```

#### 4. Configuração do Docker

```bash
# Iniciar serviços Docker
docker-compose up -d

# Verificar containers
docker ps
```

#### 5. Configuração do Nginx

```bash
# Copiar configuração do Nginx
sudo cp nginx.conf /etc/nginx/sites-available/newcam
sudo ln -s /etc/nginx/sites-available/newcam /etc/nginx/sites-enabled/

# Remover configuração padrão
sudo rm /etc/nginx/sites-enabled/default

# Testar e recarregar Nginx
sudo nginx -t
sudo systemctl reload nginx
```

#### 6. Configuração de Processos (PM2)

```bash
# Instalar PM2 globalmente
sudo npm install -g pm2

# Iniciar backend com PM2
cd /var/www/newcam/backend
pm2 start src/server.js --name "newcam-backend" --env production

# Iniciar worker com PM2
cd ../worker
pm2 start src/worker.js --name "newcam-worker" --env production

# Configurar PM2 para inicialização automática
pm2 startup
pm2 save
```

## 🔧 Monitoramento e Manutenção

### Comandos de Monitoramento

```bash
# Status geral dos serviços
docker ps
pm2 status
sudo systemctl status nginx

# Logs em tempo real
pm2 logs newcam-backend
pm2 logs newcam-worker
docker-compose logs -f zlmediakit
docker-compose logs -f srs

# Verificar portas
sudo netstat -tlnp | grep -E '(80|3002|3001|8000|8080)'
```

### Health Checks

```bash
# API Health Check
curl http://localhost:3002/health

# ZLMediaKit Status
curl "http://localhost:8000/index/api/getServerConfig?secret=035c73f7-bb6b-4889-a715-d9eb2d1925cc"

# SRS Status
curl http://localhost:8080/api/v1/summaries

# Frontend
curl -I http://localhost
```

### Comandos de Restart

```bash
# Reiniciar serviços individuais
pm2 restart newcam-backend
pm2 restart newcam-worker
docker-compose restart zlmediakit
docker-compose restart srs
sudo systemctl restart nginx

# Reiniciar todos os serviços
pm2 restart all
docker-compose restart
sudo systemctl restart nginx
```

## 🔒 Segurança

### Configurações de Firewall

```bash
# Configurar UFW
sudo ufw enable
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS (futuro)
sudo ufw allow 1935/tcp  # RTMP
sudo ufw allow 554/tcp   # RTSP
```

### SSL/HTTPS (Recomendado)

```bash
# Instalar Certbot
sudo apt install certbot python3-certbot-nginx

# Obter certificado SSL
sudo certbot --nginx -d seu-dominio.com

# Renovação automática
sudo crontab -e
# Adicionar: 0 12 * * * /usr/bin/certbot renew --quiet
```

## 📊 Backup e Recuperação

### Backup de Configurações

```bash
# Script de backup
#!/bin/bash
BACKUP_DIR="/var/backups/newcam"
DATE=$(date +%Y%m%d_%H%M%S)

# Criar diretório de backup
mkdir -p $BACKUP_DIR/$DATE

# Backup de configurações
cp /var/www/newcam/.env $BACKUP_DIR/$DATE/
cp /var/www/newcam/docker-compose.yml $BACKUP_DIR/$DATE/
cp /etc/nginx/sites-available/newcam $BACKUP_DIR/$DATE/nginx.conf

# Backup de logs PM2
pm2 save
cp ~/.pm2/dump.pm2 $BACKUP_DIR/$DATE/

echo "Backup criado em: $BACKUP_DIR/$DATE"
```

### Restauração

```bash
# Restaurar configurações
cp /var/backups/newcam/YYYYMMDD_HHMMSS/.env /var/www/newcam/
cp /var/backups/newcam/YYYYMMDD_HHMMSS/nginx.conf /etc/nginx/sites-available/newcam

# Reiniciar serviços
pm2 restart all
sudo systemctl restart nginx
docker-compose restart
```

## 🆘 Troubleshooting

### Problemas Comuns

#### 1. Backend não inicia
```bash
# Verificar logs
pm2 logs newcam-backend

# Verificar porta
sudo netstat -tlnp | grep 3002

# Verificar variáveis de ambiente
cat /var/www/newcam/backend/.env

# Reiniciar
pm2 restart newcam-backend
```

#### 2. Streaming não funciona
```bash
# Verificar ZLMediaKit
docker logs newcam-zlmediakit

# Testar API
curl "http://localhost:8000/index/api/getServerConfig?secret=035c73f7-bb6b-4889-a715-d9eb2d1925cc"

# Verificar configuração
cat /var/www/newcam/docker/zlmediakit/config.ini

# Reiniciar
docker-compose restart zlmediakit
```

#### 3. Frontend não carrega
```bash
# Verificar Nginx
sudo nginx -t
sudo systemctl status nginx

# Verificar logs do Nginx
sudo tail -f /var/log/nginx/error.log

# Verificar build do frontend
ls -la /var/www/newcam/frontend/dist/

# Reiniciar Nginx
sudo systemctl restart nginx
```

#### 4. Worker não conecta
```bash
# Verificar logs do worker
pm2 logs newcam-worker

# Verificar token
echo $WORKER_TOKEN

# Verificar conectividade com backend
curl http://localhost:3002/health

# Reiniciar worker
pm2 restart newcam-worker
```

## 📈 Otimização de Performance

### Configurações do Sistema

```bash
# Aumentar limites de arquivo
echo "* soft nofile 65536" >> /etc/security/limits.conf
echo "* hard nofile 65536" >> /etc/security/limits.conf

# Otimizar kernel para streaming
echo "net.core.rmem_max = 134217728" >> /etc/sysctl.conf
echo "net.core.wmem_max = 134217728" >> /etc/sysctl.conf
sudo sysctl -p
```

### Monitoramento de Recursos

```bash
# Instalar htop para monitoramento
sudo apt install htop

# Monitorar uso de CPU e memória
htop

# Monitorar uso de disco
df -h
du -sh /var/www/newcam/*

# Monitorar conexões de rede
ss -tuln
```

## 📞 Suporte e Contato

### Informações do Sistema
- **Versão**: 2.0.0
- **Node.js**: 18+
- **Sistema**: Ubuntu 20.04 LTS
- **Banco**: Supabase (PostgreSQL)
- **Streaming**: ZLMediaKit + SRS
- **Armazenamento**: Wasabi S3

### Logs Importantes
- **Backend**: `pm2 logs newcam-backend`
- **Worker**: `pm2 logs newcam-worker`
- **ZLMediaKit**: `docker logs newcam-zlmediakit`
- **SRS**: `docker logs newcam-srs`
- **Nginx**: `/var/log/nginx/error.log`

---

**NewCAM** - Sistema de Vigilância Profissional  
Configuração de Produção - Versão 2.0.0
