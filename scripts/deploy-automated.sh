#!/bin/bash

# =========================================================
# SCRIPT DE DEPLOY AUTOMATIZADO - SISTEMA NEWCAM
# =========================================================
# Servidor: nuvem.safecameras.com.br (66.94.104.241)
# Autor: NewCAM Development Team
# Versão: 2.0
# Data: $(date +%Y-%m-%d)

set -e  # Exit on any error

# =========================================================
# CONFIGURAÇÕES
# =========================================================
SERVER_IP="66.94.104.241"
SERVER_USER="root"
SERVER_PATH="/var/www/newcam"
LOCAL_PROJECT_PATH="$(pwd)"
BACKUP_PREFIX="newcam_deploy_$(date +%Y%m%d_%H%M%S)"
SSH_KEY_PATH="$HOME/.ssh/id_rsa"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# =========================================================
# FUNÇÕES AUXILIARES
# =========================================================

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

show_banner() {
    echo "==========================================================="
    echo "🚀 DEPLOY AUTOMATIZADO - SISTEMA NEWCAM"
    echo "==========================================================="
    echo "Servidor: nuvem.safecameras.com.br"
    echo "IP: $SERVER_IP"
    echo "Timestamp: $(date)"
    echo "==========================================================="
    echo ""
}

check_prerequisites() {
    log_info "Verificando pré-requisitos..."
    
    # Verificar se estamos no diretório correto
    if [[ ! -f "package.json" ]] || [[ ! -d "backend" ]] || [[ ! -d "frontend" ]]; then
        log_error "Execute este script no diretório raiz do projeto NewCAM"
        exit 1
    fi
    
    # Verificar Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js não encontrado. Instale Node.js 18+"
        exit 1
    fi
    
    # Verificar npm
    if ! command -v npm &> /dev/null; then
        log_error "npm não encontrado"
        exit 1
    fi
    
    # Verificar SSH key
    if [[ ! -f "$SSH_KEY_PATH" ]]; then
        log_warning "Chave SSH não encontrada em $SSH_KEY_PATH"
        log_info "Certifique-se de ter acesso SSH ao servidor"
    fi
    
    # Verificar conexão com servidor
    if ! ssh -q -o ConnectTimeout=5 -o BatchMode=yes "$SERVER_USER@$SERVER_IP" exit; then
        log_error "Não foi possível conectar ao servidor $SERVER_IP"
        log_info "Verifique sua conexão SSH e credenciais"
        exit 1
    fi
    
    log_success "Pré-requisitos verificados"
}

build_project() {
    log_info "🔨 Iniciando build do projeto..."
    
    # Limpar builds anteriores
    log_info "Limpando builds anteriores..."
    rm -rf frontend/dist/ backend/dist/ || true
    
    # Build do frontend
    log_info "📦 Fazendo build do frontend..."
    cd frontend
    
    # Configurar ambiente de produção
    cp .env.production .env
    
    # Instalar dependências
    npm ci --silent
    
    # Build
    npm run build
    
    if [[ ! -d "dist" ]]; then
        log_error "Build do frontend falhou - diretório dist não criado"
        exit 1
    fi
    
    cd ..
    log_success "Build do frontend concluído"
    
    # Preparar backend
    log_info "📦 Preparando backend..."
    cd backend
    
    # Configurar ambiente de produção
    cp .env.production .env
    
    # Instalar apenas dependências de produção
    npm ci --production --silent
    
    cd ..
    log_success "Backend preparado"
    
    # Preparar worker
    log_info "📦 Preparando worker..."
    cd worker
    
    # Configurar ambiente de produção
    cp .env.production .env
    
    # Instalar apenas dependências de produção
    npm ci --production --silent
    
    cd ..
    log_success "Worker preparado"
    
    log_success "Build do projeto concluído"
}

create_deployment_package() {
    log_info "📦 Criando pacote de deploy..."
    
    local package_name="${BACKUP_PREFIX}.tar.gz"
    
    # Criar arquivo de exclusões
    cat > /tmp/deploy_exclude.txt << EOF
node_modules
.git
*.log
.env.local
.env.development
coverage
.nyc_output
.cache
dist
build
.DS_Store
Thumbs.db
*.swp
*.swo
*~
.vscode
.idea
storage/www/record
storage/recordings
storage/temp
backups
logs/*.log
EOF

    # Criar pacote tar
    log_info "Compactando arquivos..."
    tar -czf "$package_name" \
        --exclude-from="/tmp/deploy_exclude.txt" \
        --exclude="$package_name" \
        .
    
    if [[ ! -f "$package_name" ]]; then
        log_error "Falha ao criar pacote de deploy"
        exit 1
    fi
    
    local package_size=$(du -sh "$package_name" | cut -f1)
    log_success "Pacote criado: $package_name ($package_size)"
    
    # Limpar arquivo temporário
    rm -f /tmp/deploy_exclude.txt
    
    echo "$package_name"
}

upload_to_server() {
    local package_name="$1"
    
    log_info "📤 Enviando pacote para servidor..."
    
    # Upload do pacote
    scp "$package_name" "$SERVER_USER@$SERVER_IP:/tmp/"
    
    if [[ $? -ne 0 ]]; then
        log_error "Falha no upload do pacote"
        exit 1
    fi
    
    log_success "Pacote enviado para servidor"
}

deploy_on_server() {
    local package_name="$1"
    
    log_info "🚀 Executando deploy no servidor..."
    
    # Script para executar no servidor
    ssh "$SERVER_USER@$SERVER_IP" << EOF
set -e

echo "🔧 Iniciando deploy no servidor..."

# Parar serviços
echo "Parando serviços..."
pm2 stop all || true

# Criar backup do deployment atual
if [[ -d "$SERVER_PATH" ]]; then
    echo "Criando backup do deployment atual..."
    sudo tar -czf "/var/backups/${BACKUP_PREFIX}_rollback.tar.gz" -C "$SERVER_PATH" . || true
fi

# Criar diretório se não existir
sudo mkdir -p "$SERVER_PATH"
sudo chown -R \$USER:\$USER "$SERVER_PATH"

# Extrair novo deployment
echo "Extraindo arquivos..."
cd "$SERVER_PATH"
tar -xzf "/tmp/$package_name" --strip-components=0

# Configurar ambiente de produção
echo "Configurando ambiente de produção..."
cp .env.production.unified .env
cp .env backend/
cp .env frontend/
cp .env worker/

# Criar diretórios necessários
mkdir -p storage/{recordings,thumbnails,temp,logs}
mkdir -p logs

# Instalar dependências do backend (se necessário)
cd backend
if [[ ! -d "node_modules" ]]; then
    echo "Instalando dependências do backend..."
    npm ci --production --silent
fi
cd ..

# Instalar dependências do worker (se necessário)
cd worker
if [[ ! -d "node_modules" ]]; then
    echo "Instalando dependências do worker..."
    npm ci --production --silent
fi
cd ..

# Configurar permissões
sudo chown -R www-data:www-data "$SERVER_PATH/storage"
sudo chmod -R 755 "$SERVER_PATH/storage"

# Configurar nginx se não existir
if [[ ! -f "/etc/nginx/sites-available/newcam" ]]; then
    echo "Configurando Nginx..."
    sudo cp nginx.conf /etc/nginx/sites-available/newcam
    sudo ln -sf /etc/nginx/sites-available/newcam /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default
    sudo nginx -t && sudo systemctl reload nginx
fi

# Iniciar serviços com PM2
echo "Iniciando serviços..."
pm2 delete all || true
pm2 start ecosystem.config.js
pm2 save

# Verificar status
sleep 5
pm2 status

# Health check
echo "Verificando health check..."
curl -f http://localhost:3002/health || echo "Health check falhou"

echo "✅ Deploy concluído!"

# Limpar arquivo temporário
rm -f "/tmp/$package_name"
EOF

    if [[ $? -ne 0 ]]; then
        log_error "Falha no deploy no servidor"
        log_warning "Execute rollback se necessário: ssh $SERVER_USER@$SERVER_IP 'cd $SERVER_PATH && tar -xzf /var/backups/${BACKUP_PREFIX}_rollback.tar.gz'"
        exit 1
    fi
    
    log_success "Deploy executado no servidor"
}

run_health_checks() {
    log_info "🏥 Executando verificações de saúde..."
    
    # Aguardar serviços iniciarem
    sleep 10
    
    # Health check via SSH
    ssh "$SERVER_USER@$SERVER_IP" << 'EOF'
echo "Verificando serviços..."

# PM2 status
echo "=== PM2 Status ==="
pm2 status

# Health check HTTP
echo "=== Health Check HTTP ==="
curl -s http://localhost:3002/health | jq . || echo "Health endpoint não respondeu"

# Nginx status
echo "=== Nginx Status ==="
sudo systemctl is-active nginx

# Disk space
echo "=== Disk Usage ==="
df -h /var/www/newcam

# Memory usage
echo "=== Memory Usage ==="
free -h
EOF

    # Health check externo
    log_info "Testando acesso externo..."
    if curl -s -f "https://nuvem.safecameras.com.br/api/health" > /dev/null; then
        log_success "✅ Sistema acessível externamente"
    else
        log_warning "⚠️ Sistema pode não estar acessível externamente"
    fi
    
    log_success "Verificações de saúde concluídas"
}

cleanup() {
    log_info "🧹 Limpando arquivos temporários..."
    
    # Remover pacote local
    rm -f "${BACKUP_PREFIX}.tar.gz"
    
    # Restaurar arquivos .env locais
    if [[ -f "backend/.env.development" ]]; then
        cp backend/.env.development backend/.env
    fi
    
    if [[ -f "frontend/.env.development" ]]; then
        cp frontend/.env.development frontend/.env
    fi
    
    if [[ -f "worker/.env.development" ]]; then
        cp worker/.env.development worker/.env
    fi
    
    log_success "Limpeza concluída"
}

show_completion_info() {
    echo ""
    echo "==========================================================="
    echo "🎉 DEPLOY CONCLUÍDO COM SUCESSO!"
    echo "==========================================================="
    echo "🌐 URL: https://nuvem.safecameras.com.br"
    echo "🔍 Health: https://nuvem.safecameras.com.br/api/health"
    echo "📊 Logs: ssh $SERVER_USER@$SERVER_IP 'pm2 logs'"
    echo "📈 Monitor: ssh $SERVER_USER@$SERVER_IP 'pm2 monit'"
    echo ""
    echo "🔄 Rollback (se necessário):"
    echo "ssh $SERVER_USER@$SERVER_IP 'cd $SERVER_PATH && tar -xzf /var/backups/${BACKUP_PREFIX}_rollback.tar.gz && pm2 restart all'"
    echo "==========================================================="
}

# =========================================================
# FUNÇÃO PRINCIPAL
# =========================================================

main() {
    show_banner
    
    # Verificar argumentos
    if [[ "$1" == "--help" ]] || [[ "$1" == "-h" ]]; then
        echo "Uso: $0 [opções]"
        echo ""
        echo "Opções:"
        echo "  --dry-run    Simular deploy sem executar"
        echo "  --force      Forçar deploy sem confirmação"
        echo "  --help, -h   Mostrar esta ajuda"
        echo ""
        exit 0
    fi
    
    local dry_run=false
    local force=false
    
    if [[ "$1" == "--dry-run" ]]; then
        dry_run=true
        log_warning "Modo DRY RUN ativado - nenhuma alteração será feita"
    fi
    
    if [[ "$1" == "--force" ]]; then
        force=true
    fi
    
    # Confirmação do usuário
    if [[ "$force" != true ]]; then
        echo -n "Confirma o deploy para PRODUÇÃO (nuvem.safecameras.com.br)? [y/N]: "
        read -r confirmation
        if [[ "$confirmation" != "y" ]] && [[ "$confirmation" != "Y" ]]; then
            log_info "Deploy cancelado pelo usuário"
            exit 0
        fi
    fi
    
    # Executar steps do deploy
    check_prerequisites
    
    if [[ "$dry_run" != true ]]; then
        build_project
        local package_name=$(create_deployment_package)
        upload_to_server "$package_name"
        deploy_on_server "$package_name"
        run_health_checks
        cleanup
        show_completion_info
    else
        log_info "DRY RUN: Simulando build do projeto..."
        log_info "DRY RUN: Simulando criação do pacote..."
        log_info "DRY RUN: Simulando upload para servidor..."
        log_info "DRY RUN: Simulando deploy no servidor..."
        log_success "DRY RUN concluído - nenhuma alteração foi feita"
    fi
}

# =========================================================
# TRAP PARA CLEANUP EM CASO DE ERRO
# =========================================================

trap 'log_error "Deploy falhou! Executando limpeza..."; cleanup; exit 1' ERR

# =========================================================
# EXECUÇÃO
# =========================================================

main "$@"