#!/bin/bash

set -e

echo "🔍 Verificando pré-requisitos do NewCAM..."
echo

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Contadores
ERRORS=0
WARNINGS=0
SUCCESS=0

# Função para logging com cores
log_success() {
    echo -e "${GREEN}✅ $1${NC}"
    ((SUCCESS++))
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
    ((ERRORS++))
}

log_warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
    ((WARNINGS++))
}

log_info() {
    echo -e "${BLUE}ℹ️ $1${NC}"
}

# Verificar sistema operacional
log_info "Sistema Operacional: $(uname -s) $(uname -r)"
echo

# Verificar se está rodando como root
echo "🔐 Verificando permissões..."
if [[ $EUID -eq 0 ]]; then
    log_success "Executando como root"
else
    log_warning "Não está executando como root. Algumas operações podem falhar."
    log_info "Execute com: sudo $0"
fi
echo

# Verificar Node.js
echo "📦 Verificando Node.js..."
if command -v node >/dev/null 2>&1; then
    NODE_VERSION=$(node --version)
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
    log_success "Node.js encontrado: $NODE_VERSION"
    
    if [ "$NODE_MAJOR" -ge 18 ]; then
        log_success "Versão do Node.js é compatível (>=18)"
    else
        log_error "Versão do Node.js muito antiga. Requerido: >=18, Atual: $NODE_VERSION"
    fi
else
    log_error "Node.js não encontrado. Instale Node.js 18 ou superior"
    log_info "Instalar: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs"
fi
echo

# Verificar npm
echo "📦 Verificando npm..."
if command -v npm >/dev/null 2>&1; then
    NPM_VERSION=$(npm --version)
    log_success "npm encontrado: v$NPM_VERSION"
else
    log_error "npm não encontrado. Instale npm"
fi
echo

# Verificar Docker
echo "🐳 Verificando Docker..."
if command -v docker >/dev/null 2>&1; then
    DOCKER_VERSION=$(docker --version | cut -d' ' -f3 | sed 's/,//')
    log_success "Docker encontrado: $DOCKER_VERSION"
    
    # Verificar se Docker está rodando
    if docker info >/dev/null 2>&1; then
        log_success "Docker daemon está rodando"
    else
        log_error "Docker daemon não está rodando"
        log_info "Iniciar: sudo systemctl start docker"
    fi
    
    # Verificar permissões Docker
    if docker ps >/dev/null 2>&1; then
        log_success "Permissões Docker OK"
    else
        log_warning "Usuário atual não tem permissões Docker"
        log_info "Adicionar ao grupo: sudo usermod -aG docker $USER"
    fi
else
    log_error "Docker não encontrado. Instale Docker"
    log_info "Instalar: curl -fsSL https://get.docker.com | sh"
fi
echo

# Verificar Docker Compose
echo "🐳 Verificando Docker Compose..."
if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_VERSION=$(docker-compose --version | cut -d' ' -f3 | sed 's/,//')
    log_success "Docker Compose encontrado: $COMPOSE_VERSION"
elif docker compose version >/dev/null 2>&1; then
    COMPOSE_VERSION=$(docker compose version --short)
    log_success "Docker Compose (plugin) encontrado: $COMPOSE_VERSION"
else
    log_error "Docker Compose não encontrado"
    log_info "Instalar: sudo curl -L \"https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)\" -o /usr/local/bin/docker-compose && sudo chmod +x /usr/local/bin/docker-compose"
fi
echo

# Verificar PM2
echo "⚡ Verificando PM2..."
if command -v pm2 >/dev/null 2>&1; then
    PM2_VERSION=$(pm2 --version)
    log_success "PM2 encontrado: v$PM2_VERSION"
else
    log_warning "PM2 não encontrado. Será instalado durante o deploy"
    log_info "Instalar manualmente: npm install -g pm2"
fi
echo

# Verificar curl
echo "🌐 Verificando curl..."
if command -v curl >/dev/null 2>&1; then
    CURL_VERSION=$(curl --version | head -n1 | cut -d' ' -f2)
    log_success "curl encontrado: $CURL_VERSION"
else
    log_error "curl não encontrado. Instale curl"
    log_info "Instalar: sudo apt-get install curl"
fi
echo

# Verificar git
echo "📝 Verificando git..."
if command -v git >/dev/null 2>&1; then
    GIT_VERSION=$(git --version | cut -d' ' -f3)
    log_success "git encontrado: $GIT_VERSION"
else
    log_warning "git não encontrado. Recomendado para versionamento"
    log_info "Instalar: sudo apt-get install git"
fi
echo

# Verificar portas
echo "🔌 Verificando portas..."
PORTS=(5173 3002 3003 5432 6379 1935 8080)
for port in "${PORTS[@]}"; do
    if netstat -tlnp 2>/dev/null | grep -q ":$port "; then
        PROCESS=$(netstat -tlnp 2>/dev/null | grep ":$port " | awk '{print $7}' | head -n1)
        log_warning "Porta $port em uso por: $PROCESS"
    else
        log_success "Porta $port disponível"
    fi
done
echo

# Verificar espaço em disco
echo "💾 Verificando espaço em disco..."
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
DISK_AVAILABLE=$(df -h / | tail -1 | awk '{print $4}')

if [ "$DISK_USAGE" -lt 80 ]; then
    log_success "Espaço em disco OK: ${DISK_AVAILABLE} disponível (${DISK_USAGE}% usado)"
elif [ "$DISK_USAGE" -lt 90 ]; then
    log_warning "Espaço em disco baixo: ${DISK_AVAILABLE} disponível (${DISK_USAGE}% usado)"
else
    log_error "Espaço em disco crítico: ${DISK_AVAILABLE} disponível (${DISK_USAGE}% usado)"
fi
echo

# Verificar memória
echo "🧠 Verificando memória..."
MEM_TOTAL=$(free -m | grep '^Mem:' | awk '{print $2}')
MEM_AVAILABLE=$(free -m | grep '^Mem:' | awk '{print $7}')
MEM_USAGE_PERCENT=$((100 - (MEM_AVAILABLE * 100 / MEM_TOTAL)))

log_info "Memória total: ${MEM_TOTAL}MB"
log_info "Memória disponível: ${MEM_AVAILABLE}MB"

if [ "$MEM_TOTAL" -ge 2048 ]; then
    log_success "Memória suficiente: ${MEM_TOTAL}MB (recomendado: >=2GB)"
elif [ "$MEM_TOTAL" -ge 1024 ]; then
    log_warning "Memória limitada: ${MEM_TOTAL}MB (recomendado: >=2GB)"
else
    log_error "Memória insuficiente: ${MEM_TOTAL}MB (mínimo: 1GB, recomendado: >=2GB)"
fi
echo

# Verificar diretórios necessários
echo "📁 Verificando diretórios..."
DIRECTORIES=("/var/log" "/var/www" "/tmp")
for dir in "${DIRECTORIES[@]}"; do
    if [ -d "$dir" ] && [ -w "$dir" ]; then
        log_success "Diretório $dir existe e é gravável"
    elif [ -d "$dir" ]; then
        log_warning "Diretório $dir existe mas não é gravável"
    else
        log_error "Diretório $dir não existe"
    fi
done
echo

# Verificar conectividade de rede
echo "🌐 Verificando conectividade..."
if ping -c 1 google.com >/dev/null 2>&1; then
    log_success "Conectividade com internet OK"
else
    log_warning "Sem conectividade com internet. Algumas funcionalidades podem não funcionar"
fi

if ping -c 1 registry.npmjs.org >/dev/null 2>&1; then
    log_success "Conectividade com npm registry OK"
else
    log_warning "Sem conectividade com npm registry"
fi

if ping -c 1 hub.docker.com >/dev/null 2>&1; then
    log_success "Conectividade com Docker Hub OK"
else
    log_warning "Sem conectividade com Docker Hub"
fi
echo

# Verificar firewall
echo "🔥 Verificando firewall..."
if command -v ufw >/dev/null 2>&1; then
    UFW_STATUS=$(ufw status | head -n1 | awk '{print $2}')
    if [ "$UFW_STATUS" = "active" ]; then
        log_warning "UFW firewall está ativo. Verifique se as portas necessárias estão abertas"
        log_info "Abrir portas: sudo ufw allow 5173,3002,3003,1935,8080/tcp"
    else
        log_success "UFW firewall está inativo"
    fi
else
    log_info "UFW não encontrado"
fi
echo

# Resumo final
echo "📊 RESUMO DA VERIFICAÇÃO"
echo "========================"
echo -e "${GREEN}✅ Sucessos: $SUCCESS${NC}"
echo -e "${YELLOW}⚠️ Avisos: $WARNINGS${NC}"
echo -e "${RED}❌ Erros: $ERRORS${NC}"
echo

if [ $ERRORS -eq 0 ]; then
    if [ $WARNINGS -eq 0 ]; then
        echo -e "${GREEN}🎉 Sistema pronto para deploy!${NC}"
        exit 0
    else
        echo -e "${YELLOW}⚠️ Sistema pode ser usado, mas há avisos a considerar${NC}"
        exit 0
    fi
else
    echo -e "${RED}❌ Corrija os erros antes de prosseguir com o deploy${NC}"
    exit 1
fi