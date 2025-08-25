#!/bin/bash
# ==================================================
# SCRIPT DE DEPLOYMENT AUTOMATIZADO - NEWCAM
# ==================================================
# Deployment para produção no servidor nuvem.safecameras.com.br
# Execução: ./deploy-production.sh

set -e  # Parar em caso de erro

# ==================================================
# CONFIGURAÇÕES
# ==================================================
SERVER_HOST="66.94.104.241"
SERVER_USER="root"
SERVER_PATH="/var/www/newcam"
LOCAL_PATH="$(pwd)"
BACKUP_PATH="/var/backups/newcam"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ==================================================
# FUNÇÕES UTILITÁRIAS
# ==================================================
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ==================================================
# VERIFICAÇÕES PRÉ-DEPLOYMENT
# ==================================================
pre_checks() {
    log_info "Iniciando verificações pré-deployment..."
    
    # Verificar se arquivos essenciais existem
    if [ ! -f "package.json" ]; then
        log_error "package.json não encontrado!"
        exit 1
    fi
    
    if [ ! -f ".env.production" ]; then
        log_error ".env.production não encontrado!"
        exit 1
    fi
    
    if [ ! -f "docker-compose.prod.yml" ]; then
        log_error "docker-compose.prod.yml não encontrado!"
        exit 1
    fi
    
    # Verificar conectividade SSH
    log_info "Testando conexão SSH com o servidor..."
    if ! ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_HOST" "echo 'SSH OK'"; then
        log_error "Falha na conexão SSH com o servidor!"
        exit 1
    fi
    
    log_success "Verificações pré-deployment concluídas"
}

# ==================================================
# BUILD LOCAL
# ==================================================
build_local() {
    log_info "Iniciando build local..."
    
    # Build do frontend
    log_info "Building frontend..."
    cd frontend
    npm ci --production
    npm run build
    cd ..
    
    # Build do backend (install dependencies)
    log_info "Installing backend dependencies..."
    cd backend
    npm ci --production
    cd ..
    
    # Build do worker
    log_info "Installing worker dependencies..."
    cd worker
    npm ci --production
    cd ..
    
    log_success "Build local concluído"
}

# ==================================================
# BACKUP DO SERVIDOR
# ==================================================
create_backup() {
    log_info "Criando backup no servidor..."
    
    ssh "$SERVER_USER@$SERVER_HOST" << EOF
        # Criar diretório de backup se não existir
        sudo mkdir -p $BACKUP_PATH
        
        # Backup completo se diretório existir
        if [ -d "$SERVER_PATH" ]; then
            TIMESTAMP=\$(date +%Y%m%d_%H%M%S)
            sudo tar -czf $BACKUP_PATH/newcam_backup_\$TIMESTAMP.tar.gz -C $SERVER_PATH .
            echo "Backup criado: newcam_backup_\$TIMESTAMP.tar.gz"
        else
            echo "Primeira instalação - sem backup necessário"
        fi
EOF
    
    log_success "Backup criado no servidor"
}

# ==================================================
# DEPLOY ARQUIVOS
# ==================================================
deploy_files() {
    log_info "Fazendo deploy dos arquivos..."
    
    # Criar estrutura de diretórios no servidor
    ssh "$SERVER_USER@$SERVER_HOST" << EOF
        sudo mkdir -p $SERVER_PATH/{backend,frontend,worker,storage,logs}
        sudo mkdir -p $SERVER_PATH/storage/{recordings,thumbnails,temp}
        sudo mkdir -p /var/log/newcam
        sudo chown -R www-data:www-data $SERVER_PATH
        sudo chmod -R 755 $SERVER_PATH
EOF
    
    # Sync backend
    log_info "Syncing backend..."
    rsync -avz --delete \
        --exclude="node_modules" \
        --exclude="*.log" \
        --exclude=".env*" \
        backend/ "$SERVER_USER@$SERVER_HOST:$SERVER_PATH/backend/"
    
    # Sync frontend build
    log_info "Syncing frontend build..."
    rsync -avz --delete \
        frontend/dist/ "$SERVER_USER@$SERVER_HOST:$SERVER_PATH/frontend/dist/"
    
    # Sync worker
    log_info "Syncing worker..."
    rsync -avz --delete \
        --exclude="node_modules" \
        --exclude="*.log" \
        worker/ "$SERVER_USER@$SERVER_HOST:$SERVER_PATH/worker/"
    
    # Sync configurações de produção
    log_info "Syncing production configs..."
    scp .env.production "$SERVER_USER@$SERVER_HOST:$SERVER_PATH/.env"
    scp docker-compose.prod.yml "$SERVER_USER@$SERVER_HOST:$SERVER_PATH/docker-compose.yml"
    scp ecosystem.config.js "$SERVER_USER@$SERVER_HOST:$SERVER_PATH/"
    scp package.json "$SERVER_USER@$SERVER_HOST:$SERVER_PATH/"
    
    log_success "Arquivos enviados para o servidor"
}

# ==================================================
# CONFIGURAR SERVIDOR
# ==================================================
setup_server() {
    log_info "Configurando servidor..."
    
    ssh "$SERVER_USER@$SERVER_HOST" << 'EOF'
        cd /var/www/newcam
        
        # Instalar dependências
        echo "Instalando dependências do backend..."
        cd backend && npm ci --production && cd ..
        
        echo "Instalando dependências do worker..."
        cd worker && npm ci --production && cd ..
        
        # Configurar PM2
        echo "Configurando PM2..."
        pm2 delete all 2>/dev/null || true
        pm2 start ecosystem.config.js
        pm2 save
        pm2 startup
        
        # Configurar Nginx se não existir
        if [ ! -f "/etc/nginx/sites-available/newcam" ]; then
            echo "Configurando Nginx..."
            cat > /etc/nginx/sites-available/newcam << 'NGINX_EOF'
server {
    listen 80;
    server_name nuvem.safecameras.com.br;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name nuvem.safecameras.com.br;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/nuvem.safecameras.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nuvem.safecameras.com.br/privkey.pem;
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";

    # Frontend
    location / {
        root /var/www/newcam/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # API Backend
    location /api {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket
    location /ws {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # Streaming (ZLMediaKit)
    location /live {
        proxy_pass http://localhost:8000;
        add_header Access-Control-Allow-Origin *;
    }

    # Recordings
    location /recordings {
        proxy_pass http://localhost:3002;
    }
}
NGINX_EOF
            
            ln -sf /etc/nginx/sites-available/newcam /etc/nginx/sites-enabled/
            nginx -t && systemctl reload nginx
        fi
        
        # Configurar firewall
        echo "Configurando firewall..."
        ufw allow 22/tcp   # SSH
        ufw allow 80/tcp   # HTTP
        ufw allow 443/tcp  # HTTPS
        ufw allow 1935/tcp # RTMP
        ufw allow 554/tcp  # RTSP
        ufw --force enable
        
        # Configurar logrotate
        cat > /etc/logrotate.d/newcam << 'LOGROTATE_EOF'
/var/log/newcam/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 www-data www-data
    postrotate
        pm2 reload all
    endscript
}
LOGROTATE_EOF
        
        echo "Configuração do servidor concluída"
EOF
    
    log_success "Servidor configurado"
}

# ==================================================
# INICIAR DOCKER
# ==================================================
start_docker() {
    log_info "Iniciando containers Docker..."
    
    ssh "$SERVER_USER@$SERVER_HOST" << EOF
        cd $SERVER_PATH
        
        # Parar containers existentes
        docker-compose down 2>/dev/null || true
        
        # Iniciar containers de produção
        docker-compose up -d
        
        # Aguardar containers iniciarem
        sleep 30
        
        # Verificar status
        docker-compose ps
        
        echo "Containers Docker iniciados"
EOF
    
    log_success "Containers Docker iniciados"
}

# ==================================================
# HEALTH CHECK
# ==================================================
health_check() {
    log_info "Executando health check..."
    
    ssh "$SERVER_USER@$SERVER_HOST" << EOF
        cd $SERVER_PATH
        
        echo "=== Status PM2 ==="
        pm2 status
        
        echo "=== Status Docker ==="
        docker-compose ps
        
        echo "=== Status Nginx ==="
        systemctl status nginx --no-pager -l
        
        echo "=== Verificação de portas ==="
        netstat -tlnp | grep -E ':(80|443|3002|3003|8000|1935|554|6379) '
        
        echo "=== Logs recentes ==="
        tail -n 10 /var/log/newcam/application.log 2>/dev/null || echo "Log ainda não criado"
EOF
    
    log_success "Health check concluído"
}

# ==================================================
# FUNÇÃO PRINCIPAL
# ==================================================
main() {
    echo "===================================================="
    echo "🚀 DEPLOYMENT NEWCAM PARA PRODUÇÃO"
    echo "===================================================="
    echo "Servidor: $SERVER_HOST"
    echo "Caminho: $SERVER_PATH"
    echo "Data: $(date)"
    echo "===================================================="
    
    pre_checks
    build_local
    create_backup
    deploy_files
    setup_server
    start_docker
    health_check
    
    echo "===================================================="
    log_success "🎉 DEPLOYMENT CONCLUÍDO COM SUCESSO!"
    echo "===================================================="
    echo "✅ Aplicação disponível em: https://nuvem.safecameras.com.br"
    echo "✅ API Health Check: https://nuvem.safecameras.com.br/api/health"
    echo "✅ Logs: ssh $SERVER_USER@$SERVER_HOST 'tail -f /var/log/newcam/application.log'"
    echo "✅ PM2 Monitor: ssh $SERVER_USER@$SERVER_HOST 'pm2 monit'"
    echo "===================================================="
}

# ==================================================
# EXECUÇÃO
# ==================================================
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi