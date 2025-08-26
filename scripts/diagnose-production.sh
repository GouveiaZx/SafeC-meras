#!/bin/bash

# Script de diagnóstico para servidor de produção NewCAM
# Executa verificações completas do sistema para identificar problemas

echo "======================================"
echo "🔍 DIAGNÓSTICO NEWCAM - PRODUÇÃO"
echo "======================================"
echo "Servidor: https://nuvem.safecameras.com.br"
echo "Data: $(date)"
echo ""

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Função para verificar status
check_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2${NC}"
    else
        echo -e "${RED}❌ $2${NC}"
        ERROR_COUNT=$((ERROR_COUNT + 1))
    fi
}

ERROR_COUNT=0

# 1. VERIFICAR CONTAINERS DOCKER
echo "1️⃣ VERIFICANDO CONTAINERS DOCKER"
echo "--------------------------------"

# Verificar se Docker está rodando
docker info > /dev/null 2>&1
check_status $? "Docker daemon está rodando"

# Listar containers em execução
echo "Containers ativos:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Verificar containers específicos
echo ""
echo "Verificando containers essenciais:"

# ZLMediaKit (porta 8000)
docker ps | grep -q "zlmediakit\|zlm"
check_status $? "ZLMediaKit container"

# Redis (porta 6379)
docker ps | grep -q "redis"
check_status $? "Redis container"

# PostgreSQL (se usando local)
docker ps | grep -q "postgres"
if [ $? -eq 0 ]; then
    check_status 0 "PostgreSQL container (opcional)"
fi

# 2. VERIFICAR PORTAS
echo ""
echo "2️⃣ VERIFICANDO PORTAS"
echo "--------------------"

# Backend (3002)
netstat -tuln | grep -q ":3002"
check_status $? "Backend porta 3002"

# Worker (3003)
netstat -tuln | grep -q ":3003"
check_status $? "Worker porta 3003"

# ZLMediaKit HTTP (8000)
netstat -tuln | grep -q ":8000"
check_status $? "ZLMediaKit HTTP porta 8000"

# ZLMediaKit RTSP (554)
netstat -tuln | grep -q ":554"
check_status $? "ZLMediaKit RTSP porta 554"

# ZLMediaKit RTMP (1935)
netstat -tuln | grep -q ":1935"
check_status $? "ZLMediaKit RTMP porta 1935"

# Redis (6379)
netstat -tuln | grep -q ":6379"
check_status $? "Redis porta 6379"

# 3. VERIFICAR PROCESSOS NODE
echo ""
echo "3️⃣ VERIFICANDO PROCESSOS NODE.JS"
echo "--------------------------------"

# Backend
ps aux | grep -v grep | grep -q "node.*server.js\|node.*backend"
check_status $? "Backend Node.js processo"

# Worker
ps aux | grep -v grep | grep -q "node.*worker\|node.*start-worker"
check_status $? "Worker Node.js processo"

# PM2 (se usando)
which pm2 > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "PM2 detectado - listando processos:"
    pm2 list
fi

# 4. VERIFICAR VARIÁVEIS DE AMBIENTE
echo ""
echo "4️⃣ VERIFICANDO VARIÁVEIS DE AMBIENTE"
echo "------------------------------------"

# Procurar arquivo .env
if [ -f "backend/.env" ]; then
    echo -e "${GREEN}✅ Arquivo backend/.env encontrado${NC}"
    
    # Verificar variáveis essenciais
    echo "Verificando variáveis críticas:"
    
    grep -q "^SUPABASE_URL=" backend/.env
    check_status $? "SUPABASE_URL definida"
    
    grep -q "^SUPABASE_SERVICE_ROLE_KEY=" backend/.env
    check_status $? "SUPABASE_SERVICE_ROLE_KEY definida"
    
    grep -q "^ZLM_SECRET=" backend/.env
    check_status $? "ZLM_SECRET definida"
    
    grep -q "^ZLM_API_URL=" backend/.env
    check_status $? "ZLM_API_URL definida"
    
    grep -q "^WORKER_TOKEN=" backend/.env
    check_status $? "WORKER_TOKEN definida"
    
    # Verificar URLs de produção
    echo ""
    echo "URLs configuradas:"
    grep "^ZLM_BASE_URL=" backend/.env | head -1
    grep "^ZLM_API_URL=" backend/.env | head -1
    grep "^BACKEND_URL=" backend/.env | head -1
    grep "^FRONTEND_URL=" backend/.env | head -1
else
    echo -e "${RED}❌ Arquivo backend/.env NÃO encontrado${NC}"
    ERROR_COUNT=$((ERROR_COUNT + 1))
fi

# 5. TESTAR CONECTIVIDADE COM ZLMEDIAKIT
echo ""
echo "5️⃣ TESTANDO CONECTIVIDADE COM ZLMEDIAKIT"
echo "----------------------------------------"

# Testar API do ZLMediaKit
ZLM_URL="http://localhost:8000/index/api/getServerConfig"
ZLM_SECRET=$(grep "^ZLM_SECRET=" backend/.env 2>/dev/null | cut -d'=' -f2 | tr -d '"')

if [ ! -z "$ZLM_SECRET" ]; then
    echo "Testando API do ZLMediaKit..."
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$ZLM_URL?secret=$ZLM_SECRET")
    
    if [ "$RESPONSE" = "200" ]; then
        echo -e "${GREEN}✅ ZLMediaKit API respondendo (HTTP $RESPONSE)${NC}"
    else
        echo -e "${RED}❌ ZLMediaKit API não respondendo (HTTP $RESPONSE)${NC}"
        ERROR_COUNT=$((ERROR_COUNT + 1))
    fi
else
    echo -e "${YELLOW}⚠️ ZLM_SECRET não encontrado - não foi possível testar API${NC}"
fi

# 6. VERIFICAR LOGS DE ERRO
echo ""
echo "6️⃣ VERIFICANDO LOGS DE ERRO RECENTES"
echo "------------------------------------"

# Logs do backend (últimas 20 linhas de erro)
if [ -f "backend/logs/error.log" ]; then
    echo "Últimos erros do backend:"
    tail -20 backend/logs/error.log | grep -i "error\|fatal\|critical" | tail -5
fi

# Logs do Docker ZLMediaKit
echo ""
echo "Logs recentes do ZLMediaKit:"
docker logs --tail 10 $(docker ps -q -f name=zlm) 2>&1 | grep -i "error\|fail" | tail -5

# 7. TESTAR ENDPOINTS DA API
echo ""
echo "7️⃣ TESTANDO ENDPOINTS DA API"
echo "----------------------------"

# Health check backend
echo "Testando health check do backend..."
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3002/health")
if [ "$HEALTH" = "200" ]; then
    echo -e "${GREEN}✅ Backend health check OK (HTTP $HEALTH)${NC}"
else
    echo -e "${RED}❌ Backend health check FALHOU (HTTP $HEALTH)${NC}"
    ERROR_COUNT=$((ERROR_COUNT + 1))
fi

# API status
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3002/api/health")
if [ "$API_STATUS" = "200" ]; then
    echo -e "${GREEN}✅ API health check OK (HTTP $API_STATUS)${NC}"
else
    echo -e "${RED}❌ API health check FALHOU (HTTP $API_STATUS)${NC}"
    ERROR_COUNT=$((ERROR_COUNT + 1))
fi

# 8. VERIFICAR NGINX (se aplicável)
echo ""
echo "8️⃣ VERIFICANDO NGINX/PROXY REVERSO"
echo "----------------------------------"

# Verificar se nginx está rodando
ps aux | grep -v grep | grep -q "nginx"
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Nginx está rodando${NC}"
    
    # Verificar configuração do site
    if [ -f "/etc/nginx/sites-enabled/newcam" ] || [ -f "/etc/nginx/sites-enabled/default" ]; then
        echo "Configuração do Nginx detectada"
        nginx -t 2>&1 | grep -q "successful"
        check_status $? "Configuração do Nginx válida"
    fi
else
    echo -e "${YELLOW}⚠️ Nginx não detectado (pode estar usando outro proxy)${NC}"
fi

# 9. VERIFICAR CERTIFICADO SSL
echo ""
echo "9️⃣ VERIFICANDO SSL/HTTPS"
echo "-----------------------"

# Testar HTTPS
HTTPS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://nuvem.safecameras.com.br")
if [ "$HTTPS_STATUS" = "200" ] || [ "$HTTPS_STATUS" = "304" ]; then
    echo -e "${GREEN}✅ HTTPS respondendo (HTTP $HTTPS_STATUS)${NC}"
else
    echo -e "${YELLOW}⚠️ HTTPS status: $HTTPS_STATUS${NC}"
fi

# 10. VERIFICAR CORS
echo ""
echo "🔟 VERIFICANDO CONFIGURAÇÃO CORS"
echo "--------------------------------"

# Testar CORS headers
CORS_TEST=$(curl -s -I -X OPTIONS "http://localhost:3002/api/streams" \
    -H "Origin: https://nuvem.safecameras.com.br" \
    -H "Access-Control-Request-Method: POST" | grep -i "access-control-allow-origin")

if [ ! -z "$CORS_TEST" ]; then
    echo -e "${GREEN}✅ CORS headers configurados${NC}"
    echo "  $CORS_TEST"
else
    echo -e "${RED}❌ CORS headers não detectados${NC}"
    ERROR_COUNT=$((ERROR_COUNT + 1))
fi

# RESUMO FINAL
echo ""
echo "======================================"
echo "📊 RESUMO DO DIAGNÓSTICO"
echo "======================================"

if [ $ERROR_COUNT -eq 0 ]; then
    echo -e "${GREEN}✅ SISTEMA OPERACIONAL - Nenhum erro detectado${NC}"
else
    echo -e "${RED}❌ PROBLEMAS DETECTADOS: $ERROR_COUNT${NC}"
    echo ""
    echo "AÇÕES RECOMENDADAS:"
    echo "1. Verificar logs detalhados com: docker logs [container_name]"
    echo "2. Reiniciar containers parados: docker-compose up -d"
    echo "3. Verificar variáveis de ambiente em backend/.env"
    echo "4. Testar conectividade com Supabase"
    echo "5. Verificar configuração de CORS para produção"
fi

echo ""
echo "Para logs detalhados, execute:"
echo "  - Backend: tail -f backend/logs/error.log"
echo "  - ZLMediaKit: docker logs -f newcam-zlmediakit"
echo "  - PM2: pm2 logs"
echo ""
echo "======================================"