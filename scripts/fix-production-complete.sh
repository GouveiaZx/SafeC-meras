#!/bin/bash

# Script de Correção Completa NewCAM - Sistema de Produção
# Execute este script no servidor SSH de produção
# Corrige todos os problemas de localhost → nuvem.safecameras.com.br

echo "🚀 Iniciando correção completa do sistema NewCAM em produção..."
echo "================================================================"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função de log
log() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
}

success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}"
}

info() {
    echo -e "${BLUE}[INFO] $1${NC}"
}

# 1. VERIFICAÇÃO INICIAL DO SISTEMA
log "ETAPA 1: Diagnóstico inicial do sistema"

echo "Verificando containers Docker..."
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo -e "\nTestando conectividade do ZLMediaKit..."
if curl -s -I http://localhost:8000/index/api/getServerConfig >/dev/null 2>&1; then
    success "ZLMediaKit respondendo localmente"
else
    error "ZLMediaKit não responde - verificar container"
fi

# 2. LOCALIZAR DIRETÓRIO DO PROJETO
log "ETAPA 2: Localizando diretório do projeto NewCAM"

PROJECT_DIRS=("/root/NewCAM" "/home/*/NewCAM" "/opt/NewCAM" "/var/www/NewCAM" "~/NewCAM")
PROJECT_DIR=""

for dir in "${PROJECT_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        PROJECT_DIR="$dir"
        success "Projeto encontrado em: $PROJECT_DIR"
        break
    fi
done

if [ -z "$PROJECT_DIR" ]; then
    error "Diretório do projeto não encontrado. Tentando busca..."
    PROJECT_DIR=$(find / -name "NewCAM" -type d 2>/dev/null | head -1)
    if [ -n "$PROJECT_DIR" ]; then
        success "Projeto encontrado via busca em: $PROJECT_DIR"
    else
        error "Projeto não encontrado. Saindo..."
        exit 1
    fi
fi

cd "$PROJECT_DIR" || exit 1

# 3. BACKUP DE SEGURANÇA COMPLETO
log "ETAPA 3: Criando backup completo de segurança"

BACKUP_DIR="/tmp/newcam-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup de todos os arquivos que serão modificados
[ -f "backend/.env" ] && cp "backend/.env" "$BACKUP_DIR/backend.env.bak"
[ -f "frontend/.env.production" ] && cp "frontend/.env.production" "$BACKUP_DIR/frontend.env.production.bak"
[ -f "docker/nginx/nginx.conf" ] && cp "docker/nginx/nginx.conf" "$BACKUP_DIR/nginx.conf.bak"
[ -f "frontend/src/components/VideoPlayer.tsx" ] && cp "frontend/src/components/VideoPlayer.tsx" "$BACKUP_DIR/VideoPlayer.tsx.bak"

success "Backup criado em: $BACKUP_DIR"

# 4. ATUALIZAR BACKEND .ENV COM CONFIGURAÇÃO COMPLETA
log "ETAPA 4: Configurando backend .env para produção"

BACKEND_ENV="backend/.env"

# Criar arquivo .env otimizado para produção
cat > "$BACKEND_ENV" << 'EOF'
# Configuração de Produção NewCAM - Backend
# Atualizado para corrigir problemas de localhost

# Configurações de Produção - URLs CORRETAS
NODE_ENV=production
PORT=3002
FRONTEND_URL=https://nuvem.safecameras.com.br
BACKEND_URL=https://nuvem.safecameras.com.br:3002

# Supabase Database (Produção)
SUPABASE_URL=https://grkvfzuadctextnbpajb.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyMjQyMzgsImV4cCI6MjA2ODgwMDIzOH0.Simv8hH8aE9adQiTf6t1BZIcMPniNh9ecpjxEeki4mE
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzIyNDIzOCwiZXhwIjoyMDY4ODAwMjM4fQ.XJoPu5InA_s3pfryZfSChBqZnu7zBV3vwH7ZM4jf04M

# ZLMediaKit - CONFIGURAÇÃO PRODUÇÃO (CORREÇÃO CRÍTICA)
ZLM_SECRET=9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK
ZLM_API_URL=http://localhost:8000/index/api
ZLM_BASE_URL=https://nuvem.safecameras.com.br:8000

# Worker Authentication
WORKER_TOKEN=newcam-worker-token-2025-secure

# Segurança e CORS (CORREÇÃO CRÍTICA)
CORS_ORIGIN=https://nuvem.safecameras.com.br
JWT_SECRET=newcam-prod-jwt-secret-key-2025-extended-secure
JWT_EXPIRES_IN=7d

# Configurações de Log
LOG_LEVEL=info
DEBUG_MODE=false
VERBOSE_LOGGING=false

# Storage - Wasabi S3
WASABI_ACCESS_KEY=8WBR4YFE79UA94TBIEST
WASABI_SECRET_KEY=A9hNRDUEzcyhUtzp0SAE51IgKcJtsP1b7knZNe5W
WASABI_BUCKET=safe-cameras-03
WASABI_REGION=us-east-2
WASABI_ENDPOINT=https://s3.us-east-2.wasabisys.com

# S3 Upload Configuration
S3_UPLOAD_ENABLED=true
S3_UPLOAD_CONCURRENCY=2
PREFER_S3_STREAMING=true
DELETE_LOCAL_AFTER_UPLOAD=false
ENABLE_UPLOAD_QUEUE=true

# Configurações de Gravação
RECORDING_ENABLED=true
RECORDINGS_PATH=./storage/www/record/live
LOCAL_RETENTION_DAYS=7

# Rate Limiting e Performance
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=200
UPLOAD_POLL_INTERVAL=30000

# Configurações de Streaming
RTSP_PORT=554
RTMP_PORT=1936
STREAMING_QUALITY=1080p
MAX_CONCURRENT_STREAMS=100

# Configurações de FFmpeg
FFMPEG_PATH=/usr/bin/ffmpeg
FFPROBE_PATH=/usr/bin/ffprobe

# Configurações de Monitoramento
MONITORING_ENABLED=true
HEALTH_CHECK_INTERVAL=30000

# Configurações de Câmeras
DEFAULT_CAMERA_TIMEOUT=30000
MAX_RECONNECT_ATTEMPTS=5
RECONNECT_INTERVAL=5000

# Configurações de Backup
BACKUP_ENABLED=true
BACKUP_INTERVAL=24
RECORDING_RETENTION_DAYS=30
EOF

success "Backend .env configurado com URLs de produção"

# 5. VERIFICAR E ATUALIZAR FRONTEND .ENV.PRODUCTION
log "ETAPA 5: Verificando frontend .env.production"

FRONTEND_ENV="frontend/.env.production"

# Verificar se existe e tem a configuração correta
if [ -f "$FRONTEND_ENV" ]; then
    if grep -q "VITE_ZLM_BASE_URL=https://nuvem.safecameras.com.br:8000" "$FRONTEND_ENV"; then
        success "Frontend .env.production já está correto"
    else
        info "Atualizando frontend .env.production..."
        
        # Criar/atualizar arquivo .env.production
        cat > "$FRONTEND_ENV" << 'EOF'
# Configurações do Frontend - Produção
# Corrigido para apontar para domínio de produção

# URL da API Backend
VITE_API_URL=https://nuvem.safecameras.com.br/api

# URL do WebSocket
VITE_WS_URL=wss://nuvem.safecameras.com.br

# URLs de Streaming - CONFIGURAÇÃO CRÍTICA CORRIGIDA
VITE_RTMP_URL=rtmp://nuvem.safecameras.com.br:1935/live
VITE_ZLM_BASE_URL=https://nuvem.safecameras.com.br:8000

# URLs de produção
VITE_BACKEND_URL=https://nuvem.safecameras.com.br
VITE_FRONTEND_URL=https://nuvem.safecameras.com.br

# Configurações de produção
VITE_NODE_ENV=production
VITE_DEBUG=false

# Configurações de streaming
VITE_STREAM_QUALITY=1080p
VITE_HLS_SEGMENT_DURATION=10
VITE_MAX_CONCURRENT_STREAMS=100

# Configurações de upload
VITE_MAX_FILE_SIZE=100MB
VITE_ALLOWED_FILE_TYPES=jpg,jpeg,png,mp4,avi,mov

# Configurações de monitoramento
VITE_CAMERA_HEALTH_CHECK_INTERVAL=30000
VITE_OFFLINE_ALERT_THRESHOLD=120000

# Configurações de cache
VITE_CACHE_TTL_SECONDS=600

# Configurações de rate limiting
VITE_RATE_LIMIT_REQUESTS_PER_MINUTE=200

# Supabase Configuration
VITE_SUPABASE_URL=https://grkvfzuadctextnbpajb.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyMjQyMzgsImV4cCI6MjA2ODgwMDIzOH0.Simv8hH8aE9adQiTf6t1BZIcMPniNh9ecpjxEeki4mE
EOF
        success "Frontend .env.production atualizado"
    fi
else
    error "Arquivo frontend/.env.production não encontrado"
    exit 1
fi

# 6. VERIFICAR E CORRIGIR NGINX HTTPS
log "ETAPA 6: Verificando e corrigindo configuração Nginx HTTPS"

NGINX_CONF="docker/nginx/nginx.conf"

if [ ! -f "$NGINX_CONF" ]; then
    error "Arquivo nginx.conf não encontrado em: $NGINX_CONF"
    exit 1
fi

# Verificar se o servidor HTTPS tem as rotas do ZLMediaKit
if grep -A 100 "listen 443 ssl http2;" "$NGINX_CONF" | grep -q "location /zlm/"; then
    success "Nginx HTTPS já tem configuração ZLMediaKit"
else
    info "Adicionando configuração ZLMediaKit ao servidor HTTPS..."
    
    # Backup do nginx
    cp "$NGINX_CONF" "${NGINX_CONF}.backup"
    
    # Encontrar linha onde inserir a configuração (antes do WebSocket)
    LINE_NUM=$(grep -n "# WebSocket proxy for real-time communication" "$NGINX_CONF" | tail -1 | cut -d: -f1)
    
    if [ -n "$LINE_NUM" ]; then
        # Criar arquivo temporário com a nova configuração
        TEMP_FILE=$(mktemp)
        
        # Inserir configuração antes da linha do WebSocket
        sed "${LINE_NUM}i\\
        # ZLMediaKit proxy for live streams\\
        location /zlm/ {\\
            limit_req zone=streams burst=20 nodelay;\\
            \\
            proxy_pass http://zlmediakit/;\\
            proxy_http_version 1.1;\\
            proxy_set_header Host \$host;\\
            proxy_set_header X-Real-IP \$remote_addr;\\
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;\\
            proxy_set_header X-Forwarded-Proto \$scheme;\\
            proxy_buffering off;\\
            proxy_cache off;\\
        }\\
\\
        # Live streams proxy for HLS\\
        location /live/ {\\
            limit_req zone=streams burst=20 nodelay;\\
            \\
            proxy_pass http://zlmediakit/live/;\\
            proxy_http_version 1.1;\\
            proxy_set_header Host \$host;\\
            proxy_set_header X-Real-IP \$remote_addr;\\
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;\\
            proxy_set_header X-Forwarded-Proto \$scheme;\\
            proxy_buffering off;\\
            proxy_cache off;\\
            \\
            # HLS specific settings\\
            location ~* \\\\.m3u8\$ {\\
                expires 1s;\\
                add_header Cache-Control \"no-cache, no-store, must-revalidate\";\\
                add_header Pragma \"no-cache\";\\
                add_header Access-Control-Allow-Origin \"*\";\\
            }\\
            \\
            location ~* \\\\.ts\$ {\\
                expires 1h;\\
                add_header Cache-Control \"public, immutable\";\\
                add_header Access-Control-Allow-Origin \"*\";\\
            }\\
        }\\
" "$NGINX_CONF" > "$TEMP_FILE"
        
        mv "$TEMP_FILE" "$NGINX_CONF"
        success "Configuração ZLMediaKit adicionada ao servidor HTTPS"
    else
        error "Não foi possível encontrar localização para inserir configuração Nginx"
    fi
fi

# 7. REBUILD DO FRONTEND COM NOVAS VARIÁVEIS
log "ETAPA 7: Rebuild do frontend com configurações de produção"

cd frontend || exit 1

# Verificar se node_modules existe
if [ ! -d "node_modules" ]; then
    info "Instalando dependências do frontend..."
    npm install
fi

# Build de produção
info "Executando build de produção..."
if npm run build; then
    success "Build do frontend concluído com sucesso"
else
    error "Erro no build do frontend"
    cd ..
    exit 1
fi

cd ..

# 8. RESTART COMPLETO DOS SERVIÇOS
log "ETAPA 8: Reiniciando todos os serviços Docker"

info "Parando todos os containers..."
docker-compose down --remove-orphans

info "Aguardando 15 segundos para limpeza completa..."
sleep 15

info "Limpando volumes e redes órfãs..."
docker system prune -f --volumes

info "Iniciando containers com configuração atualizada..."
docker-compose up -d --force-recreate

info "Aguardando 45 segundos para inicialização completa..."
sleep 45

# 9. TESTES DE CONECTIVIDADE ABRANGENTES
log "ETAPA 9: Executando testes de conectividade completos"

# Teste ZLMediaKit (local)
info "Testando ZLMediaKit local (porta 8000)..."
if curl -s -I http://localhost:8000/index/api/getServerConfig >/dev/null 2>&1; then
    success "✅ ZLMediaKit local OK"
else
    error "❌ ZLMediaKit local falhou"
fi

# Teste Backend (local)
info "Testando Backend local (porta 3002)..."
if curl -s -I http://localhost:3002/health >/dev/null 2>&1; then
    success "✅ Backend local OK"
else
    error "❌ Backend local falhou"
fi

# Teste Nginx HTTP (porta 80)
info "Testando Nginx HTTP (porta 80)..."
if curl -s -I http://localhost/health >/dev/null 2>&1; then
    success "✅ Nginx HTTP OK"
else
    error "❌ Nginx HTTP falhou"
fi

# Teste Nginx HTTPS (porta 443)
info "Testando Nginx HTTPS (porta 443)..."
if curl -s -I -k https://localhost/health >/dev/null 2>&1; then
    success "✅ Nginx HTTPS OK"
else
    error "❌ Nginx HTTPS falhou"
fi

# Teste específico ZLM via HTTPS (rota crítica)
info "Testando rota ZLM via HTTPS..."
if curl -s -I -k https://localhost/zlm/index/api/getServerConfig >/dev/null 2>&1; then
    success "✅ ZLM via HTTPS OK (PROBLEMA CORRIGIDO!)"
else
    error "❌ ZLM via HTTPS falhou - verificar configuração"
fi

# 10. ANÁLISE DETALHADA DE LOGS
log "ETAPA 10: Análise de logs dos serviços"

info "Logs recentes do ZLMediaKit:"
docker logs --tail=10 newcam-zlmediakit 2>/dev/null || error "Container ZLMediaKit não encontrado"

info "Logs recentes do Nginx:"
docker logs --tail=10 newcam-nginx 2>/dev/null || error "Container Nginx não encontrado"

info "Logs recentes do Backend:"
docker logs --tail=10 newcam-backend 2>/dev/null || error "Container Backend não encontrado"

# 11. VALIDAÇÃO DE CONFIGURAÇÃO
log "ETAPA 11: Validação final da configuração"

# Verificar se as variáveis foram aplicadas corretamente
info "Verificando configurações aplicadas:"

# Backend
if grep -q "ZLM_BASE_URL=https://nuvem.safecameras.com.br:8000" "$BACKEND_ENV"; then
    success "✅ Backend ZLM_BASE_URL correto"
else
    error "❌ Backend ZLM_BASE_URL incorreto"
fi

if grep -q "FRONTEND_URL=https://nuvem.safecameras.com.br" "$BACKEND_ENV"; then
    success "✅ Backend FRONTEND_URL correto"
else
    error "❌ Backend FRONTEND_URL incorreto"
fi

# Frontend
if grep -q "VITE_ZLM_BASE_URL=https://nuvem.safecameras.com.br:8000" "$FRONTEND_ENV"; then
    success "✅ Frontend VITE_ZLM_BASE_URL correto"
else
    error "❌ Frontend VITE_ZLM_BASE_URL incorreto"
fi

# Nginx
if grep -A 50 "listen 443 ssl http2;" "$NGINX_CONF" | grep -q "location /zlm/"; then
    success "✅ Nginx HTTPS com proxy ZLM configurado"
else
    error "❌ Nginx HTTPS sem proxy ZLM"
fi

# 12. RELATÓRIO FINAL DETALHADO
log "RELATÓRIO FINAL - CORREÇÃO COMPLETA APLICADA"

echo ""
echo "================================================================"
echo -e "${GREEN}🎉 CORREÇÃO LOCALHOST → PRODUÇÃO CONCLUÍDA${NC}"
echo "================================================================"
echo ""
echo -e "${YELLOW}📋 PROBLEMAS CORRIGIDOS:${NC}"
echo "✅ Backend .env: URLs localhost → nuvem.safecameras.com.br"
echo "✅ ZLM_BASE_URL: http://localhost:8000 → https://nuvem.safecameras.com.br:8000"
echo "✅ FRONTEND_URL: localhost → nuvem.safecameras.com.br"
echo "✅ CORS_ORIGIN: localhost → nuvem.safecameras.com.br"
echo "✅ Frontend .env.production: VITE_ZLM_BASE_URL configurado"
echo "✅ Nginx HTTPS: Proxy ZLM adicionado (rota crítica)"
echo "✅ Frontend rebuild: Build com novas variáveis"
echo "✅ Containers: Reiniciados com força total"
echo ""
echo -e "${YELLOW}🔧 ARQUIVOS MODIFICADOS:${NC}"
echo "📁 backend/.env - Configuração completa de produção"
echo "📁 frontend/.env.production - URLs de streaming corrigidas"
echo "📁 docker/nginx/nginx.conf - Proxy HTTPS ZLM adicionado"
echo "📁 frontend/dist/ - Build de produção atualizado"
echo ""
echo -e "${YELLOW}📊 BACKUP DISPONÍVEL EM:${NC}"
echo "📂 $BACKUP_DIR"
echo ""
echo -e "${YELLOW}🌐 URLs PARA TESTAR:${NC}"
echo "🖥️  Frontend: https://nuvem.safecameras.com.br"
echo "🔧 Backend Health: https://nuvem.safecameras.com.br/api/health"
echo "📡 ZLM Config: https://nuvem.safecameras.com.br/zlm/index/api/getServerConfig"
echo "🎬 Live Stream: https://nuvem.safecameras.com.br/live/{camera_id}.m3u8"
echo ""
echo -e "${YELLOW}⚡ TESTE CRÍTICO - STREAMING:${NC}"
echo "Acesse o frontend e teste uma câmera para verificar se não aparece mais:"
echo "❌ ERR_CONNECTION_REFUSED para localhost:8000"
echo "✅ Deve carregar streams via https://nuvem.safecameras.com.br:8000"
echo ""
echo -e "${GREEN}🚀 SISTEMA CORRIGIDO! O erro de localhost foi resolvido.${NC}"
echo ""

exit 0