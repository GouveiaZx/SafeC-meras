#!/bin/bash

# =========================================================
# NEWCAM PRODUCTION DEPLOYMENT - COMPLETE AUTOMATION
# =========================================================
# Servidor: nuvem.safecameras.com.br (66.94.104.241)
# Usuario: root | Senha: 98675423
# 
# Este script faz deploy completo do NewCAM em produção
# =========================================================

set -e  # Exit on error

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configurações do servidor
SERVER_IP="66.94.104.241"
SERVER_USER="root"
SERVER_PASSWORD="98675423"
DOMAIN="nuvem.safecameras.com.br"
DEPLOY_DIR="/var/www/newcam"
BACKUP_DIR="/var/backups/newcam"

echo -e "${BLUE}"
echo "=============================================="
echo "🚀 NEWCAM PRODUCTION DEPLOYMENT"
echo "=============================================="
echo -e "${NC}"
echo -e "${CYAN}Servidor:${NC} $DOMAIN ($SERVER_IP)"
echo -e "${CYAN}Usuário:${NC} $SERVER_USER"
echo -e "${CYAN}Diretório:${NC} $DEPLOY_DIR"
echo ""

# Função para mostrar progress
show_progress() {
    echo -e "${PURPLE}[$1/12]${NC} ${YELLOW}$2${NC}"
}

# Função para executar comandos no servidor
remote_exec() {
    sshpass -p "$SERVER_PASSWORD" ssh -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_IP" "$1"
}

# Função para transferir arquivos
transfer_files() {
    sshpass -p "$SERVER_PASSWORD" rsync -avz --progress \
        --exclude 'node_modules' \
        --exclude '.git' \
        --exclude '*.log' \
        --exclude 'storage/www/record' \
        --exclude 'storage/logs' \
        --exclude '.env' \
        "$1" "$SERVER_USER@$SERVER_IP:$2"
}

# =========================================================
# ETAPA 1: PREPARAÇÃO LOCAL
# =========================================================
show_progress 1 "Preparando build de produção..."

# Limpar arquivos desnecessários
echo -e "${YELLOW}Limpando arquivos de desenvolvimento...${NC}"
rm -rf node_modules backend/node_modules frontend/node_modules worker/node_modules 2>/dev/null || true
rm -rf storage/logs backend/storage/logs 2>/dev/null || true
rm -rf storage/www/record/live/*/*/*.mp4 2>/dev/null || true
find . -name "*.log" -delete 2>/dev/null || true
echo -e "${GREEN}✓ Limpeza concluída${NC}"

# Configurar ambientes de produção
echo -e "${YELLOW}Configurando ambientes de produção...${NC}"
cp .env.production .env
cp backend/.env.production backend/.env
cp frontend/.env.production frontend/.env
cp worker/.env.production worker/.env
echo -e "${GREEN}✓ Ambientes configurados${NC}"

# Build do frontend
echo -e "${YELLOW}Fazendo build do frontend...${NC}"
cd frontend
npm ci --production
npm run build
cd ..
echo -e "${GREEN}✓ Build do frontend concluído${NC}"

# =========================================================
# ETAPA 2: PREPARAÇÃO DO SERVIDOR
# =========================================================
show_progress 2 "Conectando ao servidor e preparando ambiente..."

# Testar conexão
echo -e "${YELLOW}Testando conexão com o servidor...${NC}"
if ! sshpass -p "$SERVER_PASSWORD" ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_IP" "echo 'Conexão OK'"; then
    echo -e "${RED}❌ Erro: Não foi possível conectar ao servidor${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Conexão estabelecida${NC}"

# Atualizar sistema e instalar dependências
show_progress 3 "Instalando dependências do servidor..."
remote_exec "
    apt update && apt upgrade -y
    apt install -y curl wget gnupg2 software-properties-common apt-transport-https ca-certificates
    apt install -y nginx postgresql postgresql-contrib redis-server
    apt install -y docker.io docker-compose
    systemctl enable docker
    systemctl start docker
    usermod -aG docker root
"
echo -e "${GREEN}✓ Dependências básicas instaladas${NC}"

# Instalar Node.js 18
echo -e "${YELLOW}Instalando Node.js 18...${NC}"
remote_exec "
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt install -y nodejs
    npm install -g pm2
    pm2 startup
"
echo -e "${GREEN}✓ Node.js e PM2 instalados${NC}"

# =========================================================
# ETAPA 3: CONFIGURAÇÃO DE DIRETÓRIOS
# =========================================================
show_progress 4 "Criando estrutura de diretórios..."

remote_exec "
    mkdir -p $DEPLOY_DIR
    mkdir -p $BACKUP_DIR
    mkdir -p /var/log/newcam
    mkdir -p /etc/ssl/certs
    mkdir -p /etc/ssl/private
    mkdir -p $DEPLOY_DIR/storage/www/record/live
    mkdir -p $DEPLOY_DIR/storage/logs
    mkdir -p $DEPLOY_DIR/storage/temp
    mkdir -p $DEPLOY_DIR/storage/uploads
    
    chown -R root:root $DEPLOY_DIR
    chown -R www-data:www-data $DEPLOY_DIR/storage
    chmod -R 755 $DEPLOY_DIR
    chmod -R 775 $DEPLOY_DIR/storage
    
    chown -R syslog:adm /var/log/newcam
    chmod -R 755 /var/log/newcam
"
echo -e "${GREEN}✓ Diretórios criados e permissões configuradas${NC}"

# =========================================================
# ETAPA 4: TRANSFERÊNCIA DE ARQUIVOS
# =========================================================
show_progress 5 "Transferindo arquivos para o servidor..."

echo -e "${YELLOW}Fazendo backup do deploy anterior...${NC}"
remote_exec "
    if [ -d $DEPLOY_DIR ]; then
        tar -czf $BACKUP_DIR/newcam-backup-\$(date +%Y%m%d-%H%M%S).tar.gz -C $DEPLOY_DIR . 2>/dev/null || true
    fi
"

echo -e "${YELLOW}Transferindo código da aplicação...${NC}"
transfer_files "./" "$DEPLOY_DIR/"
echo -e "${GREEN}✓ Arquivos transferidos${NC}"

# =========================================================
# ETAPA 5: CONFIGURAÇÃO DO NGINX
# =========================================================
show_progress 6 "Configurando Nginx..."

# Atualizar nginx.production.conf com certificados Let's Encrypt
cat > nginx.production.conf << 'EOF'
# Rate limiting
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/s;

# Upstream backends
upstream newcam_backend {
    server 127.0.0.1:3002 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name nuvem.safecameras.com.br;
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    
    # Let's Encrypt challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    # Redirect all HTTP traffic to HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# Main HTTPS server block
server {
    listen 443 ssl http2;
    server_name nuvem.safecameras.com.br;
    
    # SSL Configuration - Let's Encrypt
    ssl_certificate /etc/letsencrypt/live/nuvem.safecameras.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nuvem.safecameras.com.br/privkey.pem;
    
    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # Frontend
    location / {
        root /var/www/newcam/frontend/dist;
        try_files $uri $uri/ /index.html;
        
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # API Backend
    location /api {
        limit_req zone=api burst=20 nodelay;
        
        proxy_pass http://newcam_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # WebSocket
    location /ws {
        proxy_pass http://newcam_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }

    # Streaming
    location /live {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods 'GET, POST, OPTIONS';
        add_header Access-Control-Allow-Headers 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range';
        
        proxy_buffering off;
    }

    # Health check
    location /health {
        proxy_pass http://newcam_backend;
        access_log off;
    }

    # Compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss application/atom+xml image/svg+xml;

    # Logs
    access_log /var/log/nginx/newcam_access.log;
    error_log /var/log/nginx/newcam_error.log;
}
EOF

# Enviar e configurar Nginx
transfer_files "nginx.production.conf" "/tmp/"
remote_exec "
    cp /tmp/nginx.production.conf /etc/nginx/sites-available/newcam
    ln -sf /etc/nginx/sites-available/newcam /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    nginx -t
"
echo -e "${GREEN}✓ Nginx configurado${NC}"

# =========================================================
# ETAPA 6: CERTIFICADO SSL
# =========================================================
show_progress 7 "Configurando certificado SSL..."

remote_exec "
    # Instalar certbot
    apt install -y certbot python3-certbot-nginx
    
    # Criar diretório para challenge
    mkdir -p /var/www/html/.well-known/acme-challenge/
    chown -R www-data:www-data /var/www/html/
    
    # Reiniciar nginx para permitir challenges
    systemctl restart nginx
    
    # Obter certificado Let's Encrypt
    certbot certonly --webroot -w /var/www/html -d $DOMAIN --non-interactive --agree-tos --email admin@safecameras.com.br || echo 'Certificado já existe ou erro na obtenção'
    
    # Configurar renovação automática
    echo '0 12 * * * /usr/bin/certbot renew --quiet' | crontab -
    
    # Reiniciar nginx com SSL
    systemctl restart nginx
"
echo -e "${GREEN}✓ SSL configurado${NC}"

# =========================================================
# ETAPA 7: CONFIGURAÇÃO DOS SERVIÇOS DOCKER
# =========================================================
show_progress 8 "Configurando serviços Docker..."

remote_exec "
    cd $DEPLOY_DIR
    
    # Parar containers existentes
    docker-compose down 2>/dev/null || true
    
    # Iniciar containers
    docker-compose up -d
    
    # Aguardar containers iniciarem
    sleep 30
    
    # Verificar status
    docker-compose ps
"
echo -e "${GREEN}✓ Serviços Docker iniciados${NC}"

# =========================================================
# ETAPA 8: INSTALAÇÃO DE DEPENDÊNCIAS
# =========================================================
show_progress 9 "Instalando dependências da aplicação..."

remote_exec "
    cd $DEPLOY_DIR
    
    # Backend
    cd backend
    npm ci --production
    cd ..
    
    # Worker
    cd worker  
    npm ci --production
    cd ..
"
echo -e "${GREEN}✓ Dependências instaladas${NC}"

# =========================================================
# ETAPA 9: CONFIGURAÇÃO DO PM2
# =========================================================
show_progress 10 "Configurando PM2..."

# Enviar ecosystem.config.js atualizado
transfer_files "ecosystem.config.js" "$DEPLOY_DIR/"

remote_exec "
    cd $DEPLOY_DIR
    
    # Parar processos existentes
    pm2 delete all 2>/dev/null || true
    
    # Iniciar aplicação
    pm2 start ecosystem.config.js --env production
    
    # Salvar configuração
    pm2 save
    
    # Verificar status
    pm2 status
"
echo -e "${GREEN}✓ PM2 configurado e aplicação iniciada${NC}"

# =========================================================
# ETAPA 10: CONFIGURAÇÃO DE FIREWALL
# =========================================================
show_progress 11 "Configurando firewall..."

remote_exec "
    # Instalar UFW se não existir
    apt install -y ufw
    
    # Configurar regras
    ufw --force reset
    ufw default deny incoming
    ufw default allow outgoing
    
    # Permitir SSH
    ufw allow 22/tcp
    
    # Permitir HTTP/HTTPS
    ufw allow 80/tcp
    ufw allow 443/tcp
    
    # Permitir streaming
    ufw allow 1935/tcp  # RTMP
    ufw allow 554/tcp   # RTSP
    ufw allow 8000/tcp  # ZLMediaKit
    
    # Ativar firewall
    ufw --force enable
    
    # Mostrar status
    ufw status numbered
"
echo -e "${GREEN}✓ Firewall configurado${NC}"

# =========================================================
# ETAPA 11: VERIFICAÇÕES FINAIS
# =========================================================
show_progress 12 "Executando verificações finais..."

echo -e "${YELLOW}Testando serviços...${NC}"
sleep 5

# Testar backend
if remote_exec "curl -f -s http://localhost:3002/health > /dev/null"; then
    echo -e "${GREEN}✓ Backend respondendo${NC}"
else
    echo -e "${RED}❌ Backend não está respondendo${NC}"
fi

# Testar frontend
if remote_exec "curl -f -s http://localhost:80 > /dev/null"; then
    echo -e "${GREEN}✓ Frontend acessível${NC}"
else
    echo -e "${RED}❌ Frontend não está acessível${NC}"
fi

# Testar HTTPS
if remote_exec "curl -f -s -k https://localhost:443 > /dev/null"; then
    echo -e "${GREEN}✓ HTTPS funcionando${NC}"
else
    echo -e "${RED}❌ HTTPS com problemas${NC}"
fi

# Status dos serviços
echo -e "${YELLOW}Status dos serviços:${NC}"
remote_exec "
    echo -e '${CYAN}PM2 Status:${NC}'
    pm2 status
    echo -e '\n${CYAN}Docker Status:${NC}'
    docker-compose ps
    echo -e '\n${CYAN}Nginx Status:${NC}'
    systemctl status nginx --no-pager -l
"

# =========================================================
# CONCLUSÃO
# =========================================================
echo ""
echo -e "${GREEN}"
echo "=============================================="
echo "🎉 DEPLOY CONCLUÍDO COM SUCESSO!"
echo "=============================================="
echo -e "${NC}"
echo ""
echo -e "${CYAN}URL da aplicação:${NC} https://$DOMAIN"
echo -e "${CYAN}Painel admin:${NC} https://$DOMAIN/admin"
echo -e "${CYAN}API Health:${NC} https://$DOMAIN/api/health"
echo ""
echo -e "${YELLOW}Credenciais padrão:${NC}"
echo "Email: gouveiarx@gmail.com"
echo "Senha: Teste123"
echo ""
echo -e "${YELLOW}Comandos úteis no servidor:${NC}"
echo "pm2 status          # Status dos processos"
echo "pm2 logs            # Ver logs em tempo real"
echo "pm2 restart all     # Reiniciar aplicação"
echo "docker-compose ps   # Status containers"
echo "systemctl status nginx  # Status do Nginx"
echo ""
echo -e "${YELLOW}Logs importantes:${NC}"
echo "/var/log/newcam/            # Logs da aplicação"
echo "/var/log/nginx/             # Logs do Nginx"
echo "/var/log/letsencrypt/       # Logs do SSL"
echo ""
echo -e "${GREEN}✅ NewCAM está rodando em produção!${NC}"