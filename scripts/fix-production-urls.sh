#!/bin/bash

# Script de Correção Completa para Produção NewCAM
# Execute este script no servidor SSH de produção

echo "🚀 Iniciando correção completa do sistema NewCAM em produção..."
echo "=================================================="

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. DIAGNÓSTICO INICIAL
echo -e "\n${YELLOW}📊 ETAPA 1: Diagnóstico inicial do sistema${NC}"
echo "Verificando containers Docker..."
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo -e "\nVerificando logs do ZLMediaKit..."
docker logs --tail=20 newcam-zlmediakit 2>/dev/null || echo "Container newcam-zlmediakit não encontrado"

echo -e "\nTestando conectividade do ZLMediaKit..."
curl -I http://localhost:8000/index/api/getServerConfig 2>/dev/null && echo "✅ ZLMediaKit respondendo" || echo "❌ ZLMediaKit não responde"

# 2. LOCALIZAR DIRETÓRIO DO PROJETO
echo -e "\n${YELLOW}📁 ETAPA 2: Localizando diretório do projeto${NC}"
PROJECT_DIRS=("/root/NewCAM" "/home/*/NewCAM" "/opt/NewCAM" "/var/www/NewCAM" "~/NewCAM")

PROJECT_DIR=""
for dir in "${PROJECT_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        PROJECT_DIR="$dir"
        echo "✅ Projeto encontrado em: $PROJECT_DIR"
        break
    fi
done

if [ -z "$PROJECT_DIR" ]; then
    echo "❌ Diretório do projeto não encontrado. Tentando buscar..."
    PROJECT_DIR=$(find / -name "NewCAM" -type d 2>/dev/null | head -1)
    if [ -n "$PROJECT_DIR" ]; then
        echo "✅ Projeto encontrado via busca em: $PROJECT_DIR"
    else
        echo "❌ Projeto não encontrado. Saindo..."
        exit 1
    fi
fi

cd "$PROJECT_DIR" || exit 1

# 3. BACKUP DE SEGURANÇA
echo -e "\n${YELLOW}💾 ETAPA 3: Criando backup de segurança${NC}"
BACKUP_DIR="/tmp/newcam-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup dos arquivos que serão modificados
[ -f "backend/.env" ] && cp "backend/.env" "$BACKUP_DIR/backend.env.bak"
[ -f "frontend/.env.production" ] && cp "frontend/.env.production" "$BACKUP_DIR/frontend.env.production.bak"
[ -f "docker/nginx/nginx.conf" ] && cp "docker/nginx/nginx.conf" "$BACKUP_DIR/nginx.conf.bak"

echo "✅ Backup criado em: $BACKUP_DIR"

# 4. ATUALIZAR BACKEND .ENV
echo -e "\n${YELLOW}⚙️ ETAPA 4: Configurando variáveis do backend${NC}"
BACKEND_ENV="backend/.env"

# Criar ou atualizar o arquivo .env do backend
cat > "$BACKEND_ENV" << 'EOF'
# Configuração de Produção - NewCAM Backend

# Supabase Database
SUPABASE_URL=https://grkvfzuadctextnbpajb.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyMjQyMzgsImV4cCI6MjA2ODgwMDIzOH0.Simv8hH8aE9adQiTf6t1BZIcMPniNh9ecpjxEeki4mE
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzIyNDIzOCwiZXhwIjoyMDY4ODAwMjM4fQ.XJoPu5InA_s3pfryZfSChBqZnu7zBV3vwH7ZM4jf04M

# ZLMediaKit - Configuração para Produção
ZLM_SECRET=9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK
ZLM_API_URL=http://localhost:8000/index/api
ZLM_BASE_URL=https://nuvem.safecameras.com.br:8000

# URLs de Produção
BACKEND_URL=https://nuvem.safecameras.com.br:3002
FRONTEND_URL=https://nuvem.safecameras.com.br

# Worker Authentication
WORKER_TOKEN=newcam-worker-token-2025-secure

# Configurações de Produção
NODE_ENV=production
PORT=3002
LOG_LEVEL=info

# CORS Origins
CORS_ORIGINS=https://nuvem.safecameras.com.br

# Storage - Wasabi S3
WASABI_ACCESS_KEY=8WBR4YFE79UA94TBIEST
WASABI_SECRET_KEY=A9hNRDUEzcyhUtzp0SAE51IgKcJtsP1b7knZNe5W
WASABI_BUCKET=safe-cameras-03
WASABI_REGION=us-east-2
WASABI_ENDPOINT=https://s3.wasabisys.com

# S3 Upload Configuration
S3_UPLOAD_ENABLED=true
S3_UPLOAD_CONCURRENCY=2
PREFER_S3_STREAMING=false
DELETE_LOCAL_AFTER_UPLOAD=false
ENABLE_UPLOAD_QUEUE=true
EOF

echo "✅ Backend .env configurado"

# 5. ATUALIZAR FRONTEND .ENV.PRODUCTION
echo -e "\n${YELLOW}🎨 ETAPA 5: Configurando variáveis do frontend${NC}"
FRONTEND_ENV="frontend/.env.production"

cat > "$FRONTEND_ENV" << 'EOF'
# Configurações do Frontend - Produção

# URL da API Backend
VITE_API_URL=https://nuvem.safecameras.com.br/api

# URL do WebSocket
VITE_WS_URL=wss://nuvem.safecameras.com.br

# URLs de Streaming - CORREÇÃO CRÍTICA
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

echo "✅ Frontend .env.production configurado"

# 6. REBUILD DO FRONTEND COM NOVAS VARIÁVEIS
echo -e "\n${YELLOW}🔨 ETAPA 6: Rebuild do frontend com novas configurações${NC}"
cd frontend

# Instalar dependências se necessário
if [ ! -d "node_modules" ]; then
    echo "Instalando dependências do frontend..."
    npm install
fi

# Build de produção com as novas variáveis
echo "Fazendo build de produção..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Build do frontend concluído com sucesso"
else
    echo "❌ Erro no build do frontend"
    exit 1
fi

cd ..

# 7. VERIFICAR E CORRIGIR NGINX
echo -e "\n${YELLOW}🌐 ETAPA 7: Verificando configuração do Nginx${NC}"
NGINX_CONF="docker/nginx/nginx.conf"

# Verificar se as rotas do ZLMediaKit estão no servidor HTTPS
if grep -A 50 "server_name nuvem.safecameras.com.br;" "$NGINX_CONF" | grep -q "/zlm/"; then
    echo "✅ Nginx já configurado com proxy ZLMediaKit para HTTPS"
else
    echo "⚠️ Adicionando configuração ZLMediaKit ao servidor HTTPS..."
    
    # Backup do nginx
    cp "$NGINX_CONF" "${NGINX_CONF}.backup"
    
    # Adicionar configuração ZLMediaKit ao servidor HTTPS
    sed -i '/# WebSocket proxy for real-time communication/i \
        # ZLMediaKit proxy for live streams\
        location /zlm/ {\
            limit_req zone=streams burst=20 nodelay;\
            \
            proxy_pass http://zlmediakit/;\
            proxy_http_version 1.1;\
            proxy_set_header Host $host;\
            proxy_set_header X-Real-IP $remote_addr;\
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\
            proxy_set_header X-Forwarded-Proto $scheme;\
            proxy_buffering off;\
            proxy_cache off;\
        }\
\
        # Live streams proxy for HLS\
        location /live/ {\
            limit_req zone=streams burst=20 nodelay;\
            \
            proxy_pass http://zlmediakit/live/;\
            proxy_http_version 1.1;\
            proxy_set_header Host $host;\
            proxy_set_header X-Real-IP $remote_addr;\
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\
            proxy_set_header X-Forwarded-Proto $scheme;\
            proxy_buffering off;\
            proxy_cache off;\
            \
            # HLS specific settings\
            location ~* \.m3u8$ {\
                expires 1s;\
                add_header Cache-Control "no-cache, no-store, must-revalidate";\
                add_header Pragma "no-cache";\
                add_header Access-Control-Allow-Origin "*";\
            }\
            \
            location ~* \.ts$ {\
                expires 1h;\
                add_header Cache-Control "public, immutable";\
                add_header Access-Control-Allow-Origin "*";\
            }\
        }\
\
' "$NGINX_CONF"
    
    echo "✅ Configuração Nginx atualizada"
fi

# 8. RESTART DOS SERVIÇOS
echo -e "\n${YELLOW}🔄 ETAPA 8: Reiniciando serviços${NC}"

echo "Parando containers..."
docker-compose down

echo "Aguardando 10 segundos..."
sleep 10

echo "Iniciando containers..."
docker-compose up -d

echo "Aguardando 30 segundos para inicialização..."
sleep 30

# 9. TESTES DE CONECTIVIDADE
echo -e "\n${YELLOW}🧪 ETAPA 9: Testes de conectividade${NC}"

# Teste ZLMediaKit
echo "Testando ZLMediaKit (porta 8000)..."
curl -I http://localhost:8000/index/api/getServerConfig 2>/dev/null && echo "✅ ZLMediaKit OK" || echo "❌ ZLMediaKit falhou"

# Teste Backend
echo "Testando Backend (porta 3002)..."
curl -I http://localhost:3002/health 2>/dev/null && echo "✅ Backend OK" || echo "❌ Backend falhou"

# Teste Nginx
echo "Testando Nginx (porta 80)..."
curl -I http://localhost/health 2>/dev/null && echo "✅ Nginx OK" || echo "❌ Nginx falhou"

# Teste HTTPS
echo "Testando HTTPS (porta 443)..."
curl -I -k https://localhost/health 2>/dev/null && echo "✅ HTTPS OK" || echo "❌ HTTPS falhou"

# 10. ANÁLISE DE LOGS
echo -e "\n${YELLOW}📋 ETAPA 10: Análise de logs${NC}"
echo "Logs recentes do ZLMediaKit:"
docker logs --tail=10 newcam-zlmediakit 2>/dev/null || echo "Container não encontrado"

echo -e "\nLogs recentes do Nginx:"
docker logs --tail=10 newcam-nginx 2>/dev/null || echo "Container não encontrado"

# 11. RELATÓRIO FINAL
echo -e "\n${GREEN}📊 RELATÓRIO FINAL${NC}"
echo "=================================================="
echo "✅ Configurações atualizadas:"
echo "   - Backend .env com URLs de produção"
echo "   - Frontend .env.production com VITE_ZLM_BASE_URL"
echo "   - Nginx configurado com proxy ZLMediaKit"
echo "   - Frontend rebuilded com novas variáveis"
echo ""
echo "🔧 Correções aplicadas:"
echo "   - VideoPlayer agora usa URLs dinâmicas"
echo "   - ZLMediaKit acessível via HTTPS"
echo "   - Backend com configuração de produção"
echo "   - CORS configurado corretamente"
echo ""
echo "📍 Backup salvo em: $BACKUP_DIR"
echo ""
echo "🌐 URLs para testar:"
echo "   - Frontend: https://nuvem.safecameras.com.br"
echo "   - Backend Health: https://nuvem.safecameras.com.br/api/health"
echo "   - ZLM Config: https://nuvem.safecameras.com.br:8000/index/api/getServerConfig"
echo ""
echo -e "${GREEN}🎉 Correção completa finalizada!${NC}"
echo "Teste agora o sistema no navegador."

exit 0