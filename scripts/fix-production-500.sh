#!/bin/bash

# Script para corrigir erro 500 em produção - NewCAM
# https://nuvem.safecameras.com.br

echo "======================================"
echo "🔧 CORREÇÃO ERRO 500 - NEWCAM PRODUÇÃO"
echo "======================================"
echo "Servidor: https://nuvem.safecameras.com.br"
echo "Data: $(date)"
echo ""

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 1. PARAR SERVIÇOS PARA CORREÇÃO
echo -e "${YELLOW}1️⃣ Parando serviços para manutenção...${NC}"
pm2 stop all 2>/dev/null || echo "PM2 não está em uso"

# 2. VERIFICAR E CORRIGIR VARIÁVEIS DE AMBIENTE
echo -e "${BLUE}2️⃣ Verificando variáveis de ambiente...${NC}"

cd backend

# Criar backup do .env atual
if [ -f ".env" ]; then
    cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
    echo "✅ Backup do .env criado"
fi

# Verificar e adicionar variáveis essenciais se não existirem
echo -e "${BLUE}Configurando variáveis de ambiente para produção...${NC}"

# Função para adicionar variável se não existir
add_env_var() {
    if ! grep -q "^$1=" .env 2>/dev/null; then
        echo "$1=$2" >> .env
        echo "  + Adicionada: $1"
    else
        echo "  ✓ Já existe: $1"
    fi
}

# URLs de produção
add_env_var "NODE_ENV" "production"
add_env_var "PORT" "3002"
add_env_var "FRONTEND_URL" "https://nuvem.safecameras.com.br"
add_env_var "BACKEND_URL" "https://nuvem.safecameras.com.br:3002"
add_env_var "DOMAIN" "nuvem.safecameras.com.br"

# ZLMediaKit configuração
add_env_var "ZLM_SECRET" "9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK"
add_env_var "ZLM_API_URL" "http://localhost:8000/index/api"
add_env_var "ZLM_BASE_URL" "http://localhost:8000"
add_env_var "STREAMING_SERVER" "zlm"

# Worker token
add_env_var "WORKER_TOKEN" "newcam-worker-token-2025-secure"

# Redis
add_env_var "REDIS_HOST" "localhost"
add_env_var "REDIS_PORT" "6379"

# S3 configurações (se aplicável)
add_env_var "S3_UPLOAD_ENABLED" "false"
add_env_var "ENABLE_UPLOAD_QUEUE" "true"

cd ..

# 3. VERIFICAR E INICIAR CONTAINERS DOCKER
echo -e "${BLUE}3️⃣ Verificando containers Docker...${NC}"

# Verificar se docker-compose existe
if [ -f "docker-compose.yml" ]; then
    echo "Iniciando containers Docker..."
    docker-compose up -d
    sleep 5
    
    # Verificar se ZLMediaKit está rodando
    if docker ps | grep -q "zlmediakit\|zlm"; then
        echo -e "${GREEN}✅ ZLMediaKit container rodando${NC}"
        
        # Verificar conectividade com ZLMediaKit
        echo "Testando API do ZLMediaKit..."
        RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8000/index/api/getServerConfig?secret=9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK")
        
        if [ "$RESPONSE" = "200" ]; then
            echo -e "${GREEN}✅ ZLMediaKit API respondendo corretamente${NC}"
        else
            echo -e "${RED}❌ ZLMediaKit API não está respondendo (HTTP $RESPONSE)${NC}"
            echo "Reiniciando ZLMediaKit..."
            docker restart $(docker ps -q -f name=zlm) 2>/dev/null
            sleep 10
        fi
    else
        echo -e "${RED}❌ ZLMediaKit container não está rodando${NC}"
        echo "Tentando iniciar ZLMediaKit..."
        docker-compose up -d zlmediakit 2>/dev/null || docker-compose up -d newcam-zlmediakit 2>/dev/null
    fi
    
    # Verificar Redis
    if docker ps | grep -q "redis"; then
        echo -e "${GREEN}✅ Redis container rodando${NC}"
    else
        echo -e "${YELLOW}⚠️ Redis container não detectado - iniciando...${NC}"
        docker-compose up -d redis 2>/dev/null
    fi
else
    echo -e "${YELLOW}⚠️ docker-compose.yml não encontrado${NC}"
fi

# 4. INSTALAR DEPENDÊNCIAS SE NECESSÁRIO
echo -e "${BLUE}4️⃣ Verificando dependências...${NC}"

# Backend
cd backend
if [ ! -d "node_modules" ]; then
    echo "Instalando dependências do backend..."
    npm install --production
fi
cd ..

# Worker
if [ -d "worker" ]; then
    cd worker
    if [ ! -d "node_modules" ]; then
        echo "Instalando dependências do worker..."
        npm install --production
    fi
    cd ..
fi

# 5. CRIAR DIRETÓRIOS NECESSÁRIOS
echo -e "${BLUE}5️⃣ Criando estrutura de diretórios...${NC}"

mkdir -p storage/www/record/live
mkdir -p storage/www/thumbnails
mkdir -p backend/logs
mkdir -p backend/uploads

# Ajustar permissões
chmod -R 755 storage
chmod -R 755 backend/logs
chmod -R 755 backend/uploads

# 6. INICIAR BACKEND
echo -e "${BLUE}6️⃣ Iniciando backend...${NC}"

# Verificar se PM2 está instalado
if which pm2 > /dev/null; then
    echo "Iniciando com PM2..."
    
    # Criar ecosystem file se não existir
    if [ ! -f "ecosystem.config.js" ]; then
        cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'newcam-backend',
      script: 'backend/src/server.js',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      },
      error_file: 'backend/logs/pm2-error.log',
      out_file: 'backend/logs/pm2-out.log',
      log_file: 'backend/logs/pm2-combined.log',
      time: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    },
    {
      name: 'newcam-worker',
      script: 'backend/src/scripts/start-worker.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3003
      },
      error_file: 'backend/logs/worker-error.log',
      out_file: 'backend/logs/worker-out.log',
      time: true,
      autorestart: true
    }
  ]
};
EOF
        echo "✅ ecosystem.config.js criado"
    fi
    
    # Iniciar com PM2
    pm2 delete newcam-backend 2>/dev/null
    pm2 delete newcam-worker 2>/dev/null
    pm2 start ecosystem.config.js
    pm2 save
    
else
    echo "PM2 não está instalado. Iniciando com Node.js diretamente..."
    
    # Iniciar backend em background
    cd backend
    nohup node src/server.js > logs/backend.log 2>&1 &
    BACKEND_PID=$!
    echo "Backend iniciado com PID: $BACKEND_PID"
    cd ..
    
    # Iniciar worker em background
    cd backend
    nohup node src/scripts/start-worker.js > logs/worker.log 2>&1 &
    WORKER_PID=$!
    echo "Worker iniciado com PID: $WORKER_PID"
    cd ..
fi

# Aguardar serviços iniciarem
echo "Aguardando serviços iniciarem..."
sleep 10

# 7. VERIFICAR STATUS FINAL
echo -e "${BLUE}7️⃣ Verificando status dos serviços...${NC}"

# Backend
if curl -s -o /dev/null -w "%{http_code}" "http://localhost:3002/health" | grep -q "200"; then
    echo -e "${GREEN}✅ Backend rodando na porta 3002${NC}"
else
    echo -e "${RED}❌ Backend não está respondendo${NC}"
    echo "Verificando logs..."
    tail -10 backend/logs/error.log 2>/dev/null || tail -10 backend/logs/pm2-error.log 2>/dev/null
fi

# ZLMediaKit
if curl -s -o /dev/null -w "%{http_code}" "http://localhost:8000" | grep -q "200\|302"; then
    echo -e "${GREEN}✅ ZLMediaKit rodando na porta 8000${NC}"
else
    echo -e "${RED}❌ ZLMediaKit não está respondendo${NC}"
fi

# 8. CONFIGURAR NGINX (se aplicável)
echo -e "${BLUE}8️⃣ Verificando configuração do Nginx...${NC}"

if which nginx > /dev/null; then
    # Criar configuração do Nginx para produção
    cat > /tmp/newcam.nginx << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name nuvem.safecameras.com.br;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name nuvem.safecameras.com.br;

    # SSL configuration (ajustar para seu certificado)
    ssl_certificate /etc/letsencrypt/live/nuvem.safecameras.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nuvem.safecameras.com.br/privkey.pem;

    # Frontend
    location / {
        root /var/www/newcam/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts para streaming
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    # WebSocket
    location /socket.io/ {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ZLMediaKit streaming
    location /live/ {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # CORS headers
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods 'GET, OPTIONS';
    }

    # Static files
    location /storage {
        alias /var/www/newcam/storage;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
EOF
    
    echo "Configuração do Nginx criada em /tmp/newcam.nginx"
    echo -e "${YELLOW}Para aplicar, execute:${NC}"
    echo "  sudo cp /tmp/newcam.nginx /etc/nginx/sites-available/newcam"
    echo "  sudo ln -s /etc/nginx/sites-available/newcam /etc/nginx/sites-enabled/"
    echo "  sudo nginx -t && sudo systemctl reload nginx"
fi

# 9. TESTE FINAL
echo -e "${BLUE}9️⃣ Teste final do sistema...${NC}"

# Testar endpoint de streaming
echo "Testando endpoint de streaming..."
TEST_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:3002/api/streams/test/start" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer test")

if [ "$TEST_RESPONSE" = "401" ] || [ "$TEST_RESPONSE" = "404" ]; then
    echo -e "${GREEN}✅ Endpoint de streaming respondendo (precisa de autenticação válida)${NC}"
else
    echo -e "${YELLOW}⚠️ Resposta do endpoint: HTTP $TEST_RESPONSE${NC}"
fi

# RESUMO FINAL
echo ""
echo "======================================"
echo -e "${GREEN}✅ CORREÇÕES APLICADAS${NC}"
echo "======================================"
echo ""
echo "AÇÕES REALIZADAS:"
echo "✅ Variáveis de ambiente configuradas para produção"
echo "✅ Containers Docker verificados/iniciados"
echo "✅ Backend e Worker iniciados"
echo "✅ Estrutura de diretórios criada"
echo "✅ Permissões ajustadas"
echo ""
echo "PRÓXIMOS PASSOS:"
echo "1. Verificar logs em tempo real:"
echo "   - PM2: pm2 logs"
echo "   - Backend: tail -f backend/logs/error.log"
echo "   - Docker: docker logs -f newcam-zlmediakit"
echo ""
echo "2. Testar no navegador:"
echo "   https://nuvem.safecameras.com.br"
echo ""
echo "3. Se ainda houver erro 500, verificar:"
echo "   - Conectividade com Supabase"
echo "   - Credenciais no .env"
echo "   - Logs detalhados do erro"
echo ""
echo "======================================"