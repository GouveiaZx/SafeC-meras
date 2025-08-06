#!/bin/bash

# Script de Verificação Pré-Deploy - NewCAM
# Valida se tudo está pronto para o deploy

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Contadores
ERRORS=0
WARNINGS=0
CHECKS=0

# Função para log
log() {
    echo -e "${BLUE}[INFO] $1${NC}"
}

success() {
    echo -e "${GREEN}[✓] $1${NC}"
    ((CHECKS++))
}

warning() {
    echo -e "${YELLOW}[⚠] $1${NC}"
    ((WARNINGS++))
    ((CHECKS++))
}

error() {
    echo -e "${RED}[✗] $1${NC}"
    ((ERRORS++))
    ((CHECKS++))
}

echo -e "${BLUE}=== Verificação Pré-Deploy NewCAM ===${NC}"
echo ""

# Verificar se estamos no diretório correto
log "Verificando diretório do projeto..."
if [ ! -f "package.json" ] || [ ! -d "backend" ] || [ ! -d "frontend" ]; then
    error "Não está no diretório raiz do projeto NewCAM"
else
    success "Diretório do projeto correto"
fi

# Verificar arquivos essenciais
log "Verificando arquivos essenciais..."

essential_files=(
    ".env.production"
    "docker-compose.production.yml"
    "deploy.sh"
    "backend/package.json"
    "frontend/package.json"
    "docker/zlmediakit/Dockerfile.registrar"
    "docker/zlmediakit/Dockerfile.processor"
    "docker/nginx/nginx.production.conf"
    "scripts/maintenance.sh"
    "scripts/post-deploy-setup.sh"
)

for file in "${essential_files[@]}"; do
    if [ -f "$file" ]; then
        success "Arquivo encontrado: $file"
    else
        error "Arquivo não encontrado: $file"
    fi
done

# Verificar diretórios essenciais
log "Verificando diretórios essenciais..."

essential_dirs=(
    "backend/src"
    "frontend/src"
    "docker/zlmediakit"
    "docker/nginx"
    "scripts"
    "storage"
)

for dir in "${essential_dirs[@]}"; do
    if [ -d "$dir" ]; then
        success "Diretório encontrado: $dir"
    else
        error "Diretório não encontrado: $dir"
    fi
done

# Verificar scripts wrapper do ZLMedia
log "Verificando scripts wrapper ZLMedia..."
if [ -f "docker/zlmediakit/wrappers/zlmedia" ]; then
    success "Script zlmedia encontrado"
else
    error "Script zlmedia não encontrado"
fi

if [ -f "docker/zlmediakit/wrappers/zlmediaprobe" ]; then
    success "Script zlmediaprobe encontrado"
else
    error "Script zlmediaprobe não encontrado"
fi

# Verificar permissões dos scripts
log "Verificando permissões dos scripts..."

scripts_to_check=(
    "deploy.sh"
    "scripts/maintenance.sh"
    "scripts/post-deploy-setup.sh"
    "docker/zlmediakit/wrappers/zlmedia"
    "docker/zlmediakit/wrappers/zlmediaprobe"
)

for script in "${scripts_to_check[@]}"; do
    if [ -f "$script" ]; then
        if [ -x "$script" ]; then
            success "Script executável: $script"
        else
            warning "Script não executável: $script (será corrigido automaticamente)"
            chmod +x "$script" 2>/dev/null || error "Falha ao tornar $script executável"
        fi
    fi
done

# Verificar configuração .env.production
log "Verificando configuração .env.production..."

if [ -f ".env.production" ]; then
    # Verificar se ainda tem valores padrão
    if grep -q "seu-dominio.com" .env.production; then
        warning "Arquivo .env.production contém valores padrão (seu-dominio.com)"
    else
        success "Arquivo .env.production parece configurado"
    fi
    
    # Verificar variáveis críticas
    critical_vars=("DOMAIN" "DB_PASSWORD" "JWT_SECRET" "ZLM_SECRET")
    
    for var in "${critical_vars[@]}"; do
        if grep -q "^$var=" .env.production; then
            value=$(grep "^$var=" .env.production | cut -d'=' -f2)
            if [ -n "$value" ] && [ "$value" != "sua_chave_aqui" ] && [ "$value" != "senha_aqui" ]; then
                success "Variável $var configurada"
            else
                error "Variável $var não configurada ou com valor padrão"
            fi
        else
            error "Variável $var não encontrada em .env.production"
        fi
    done
else
    error "Arquivo .env.production não encontrado"
fi

# Verificar configuração do Nginx
log "Verificando configuração do Nginx..."

if [ -f "docker/nginx/nginx.production.conf" ]; then
    if grep -q "\${DOMAIN}" docker/nginx/nginx.production.conf; then
        success "Configuração do Nginx usa variável de domínio"
    else
        warning "Configuração do Nginx pode não estar usando variáveis corretas"
    fi
fi

# Verificar Dockerfiles
log "Verificando Dockerfiles..."

dockerfiles=(
    "backend/Dockerfile"
    "frontend/Dockerfile"
    "worker/Dockerfile"
    "docker/zlmediakit/Dockerfile.registrar"
    "docker/zlmediakit/Dockerfile.processor"
)

for dockerfile in "${dockerfiles[@]}"; do
    if [ -f "$dockerfile" ]; then
        success "Dockerfile encontrado: $dockerfile"
    else
        error "Dockerfile não encontrado: $dockerfile"
    fi
done

# Verificar dependências locais
log "Verificando dependências locais..."

# Verificar Git
if command -v git &> /dev/null; then
    success "Git instalado"
else
    error "Git não instalado"
fi

# Verificar rsync
if command -v rsync &> /dev/null; then
    success "Rsync instalado"
else
    error "Rsync não instalado"
fi

# Verificar curl
if command -v curl &> /dev/null; then
    success "Curl instalado"
else
    error "Curl não instalado"
fi

# Verificar SSH
if command -v ssh &> /dev/null; then
    success "SSH instalado"
else
    error "SSH não instalado"
fi

# Verificar se há mudanças não commitadas (se for um repo git)
log "Verificando status do Git..."
if [ -d ".git" ]; then
    if git diff --quiet && git diff --cached --quiet; then
        success "Não há mudanças não commitadas"
    else
        warning "Há mudanças não commitadas no Git"
    fi
    
    # Verificar branch atual
    current_branch=$(git branch --show-current 2>/dev/null || echo "unknown")
    if [ "$current_branch" = "main" ] || [ "$current_branch" = "master" ]; then
        success "Está na branch principal ($current_branch)"
    else
        warning "Não está na branch principal (atual: $current_branch)"
    fi
else
    warning "Não é um repositório Git"
fi

# Verificar tamanho dos arquivos
log "Verificando tamanho dos arquivos..."

total_size=$(du -sh . 2>/dev/null | cut -f1)
log "Tamanho total do projeto: $total_size"

# Verificar se há arquivos muito grandes
large_files=$(find . -type f -size +100M 2>/dev/null | head -5)
if [ -n "$large_files" ]; then
    warning "Arquivos grandes encontrados (>100MB):"
    echo "$large_files"
else
    success "Nenhum arquivo muito grande encontrado"
fi

# Verificar configurações específicas do ZLMediaKit
log "Verificando configurações do ZLMediaKit..."

if [ -f "docker/zlmediakit/config.ini" ]; then
    if grep -q "zlmediakit" docker/zlmediakit/config.ini; then
        success "Configuração ZLMediaKit usa zlmediakit (processos camuflados)"
  else
    warning "Configuração ZLMediaKit pode ainda referenciar processos não camuflados"
    fi
fi

if [ -f "backend/zlmediakit/ZLMediaKit/conf/config.ini" ]; then
    if grep -q "zlmedia" backend/zlmediakit/ZLMediaKit/conf/config.ini; then
        success "Configuração backend ZLMediaKit usa zlmediakit"
    else
        warning "Configuração backend ZLMediaKit pode ainda referenciar processos não camuflados"
    fi
fi

# Verificar processor.py
if [ -f "docker/zlmediakit/processor.py" ]; then
    if grep -q "zlmediakit" docker/zlmediakit/processor.py && ! grep -q "ffmpeg" docker/zlmediakit/processor.py; then
    success "Processor.py usa zlmediakit (processos camuflados)"
  else
    warning "Processor.py pode ainda referenciar processos não camuflados"
    fi
fi

# Verificar se há node_modules (devem ser removidos)
log "Verificando arquivos desnecessários..."

if find . -name "node_modules" -type d | grep -q .; then
    warning "Diretórios node_modules encontrados (serão ignorados no deploy)"
else
    success "Nenhum diretório node_modules encontrado"
fi

if find . -name ".git" -type d | grep -q .; then
    success "Diretório .git encontrado (será ignorado no deploy)"
fi

# Resumo final
echo ""
echo -e "${BLUE}=== Resumo da Verificação ===${NC}"
echo -e "Total de verificações: ${CHECKS}"
echo -e "${GREEN}Sucessos: $((CHECKS - WARNINGS - ERRORS))${NC}"
echo -e "${YELLOW}Avisos: ${WARNINGS}${NC}"
echo -e "${RED}Erros: ${ERRORS}${NC}"
echo ""

if [ $ERRORS -eq 0 ]; then
    if [ $WARNINGS -eq 0 ]; then
        echo -e "${GREEN}🎉 Tudo pronto para deploy!${NC}"
        echo -e "${GREEN}Execute: ./deploy.sh [servidor] [usuario] [dominio]${NC}"
        exit 0
    else
        echo -e "${YELLOW}⚠️  Deploy pode prosseguir, mas há avisos para revisar${NC}"
        echo -e "${YELLOW}Execute: ./deploy.sh [servidor] [usuario] [dominio]${NC}"
        exit 0
    fi
else
    echo -e "${RED}❌ Há erros que devem ser corrigidos antes do deploy${NC}"
    echo ""
    echo -e "${BLUE}Próximos passos:${NC}"
    echo "1. Corrija os erros listados acima"
    echo "2. Execute novamente: ./scripts/pre-deploy-check.sh"
    echo "3. Quando tudo estiver OK, execute: ./deploy.sh [servidor] [usuario] [dominio]"
    exit 1
fi