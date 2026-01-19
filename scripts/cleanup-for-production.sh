#!/bin/bash

# =========================================================
# SCRIPT DE LIMPEZA PARA PRODUÇÃO - NEWCAM
# =========================================================
# Remove arquivos desnecessários para reduzir tamanho
# e melhorar segurança do deploy
# =========================================================

set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "=============================================="
echo "🧹 LIMPEZA PARA PRODUÇÃO - NEWCAM"
echo "=============================================="
echo -e "${NC}"

# Função para calcular tamanho
calculate_size() {
    if [ -d "$1" ] || [ -f "$1" ]; then
        du -sh "$1" 2>/dev/null | cut -f1 || echo "0K"
    else
        echo "0K"
    fi
}

# Função para remover com log
remove_item() {
    local item="$1"
    local description="$2"
    
    if [ -e "$item" ]; then
        local size=$(calculate_size "$item")
        echo -e "${YELLOW}Removendo $description ($size)...${NC}"
        rm -rf "$item"
        echo -e "${GREEN}✓ Removido: $item${NC}"
    else
        echo -e "${GREEN}✓ Já removido: $item${NC}"
    fi
}

# =========================================================
# 1. REMOVER NODE_MODULES (CRÍTICO - ECONOMIZA ~500MB)
# =========================================================
echo -e "${BLUE}1. Removendo node_modules...${NC}"
remove_item "node_modules" "node_modules raiz"
remove_item "backend/node_modules" "node_modules backend"
remove_item "frontend/node_modules" "node_modules frontend"
remove_item "worker/node_modules" "node_modules worker"

# =========================================================
# 2. REMOVER LOGS DE DESENVOLVIMENTO
# =========================================================
echo -e "${BLUE}2. Removendo logs de desenvolvimento...${NC}"
remove_item "backend/storage/logs" "logs do backend"
remove_item "storage/logs" "logs do storage"
remove_item "worker/worker.log" "log do worker"

# Remover todos os arquivos .log
find . -name "*.log" -type f -exec rm -f {} \; 2>/dev/null || true
find . -name "*.log.*" -type f -exec rm -f {} \; 2>/dev/null || true
echo -e "${GREEN}✓ Arquivos .log removidos${NC}"

# =========================================================
# 3. LIMPAR MÍDIA DE TESTE
# =========================================================
echo -e "${BLUE}3. Removendo mídia de teste...${NC}"

# Remover gravações de teste
if [ -d "storage/www/record/live" ]; then
    find storage/www/record/live -name "*.mp4" -type f -exec rm -f {} \; 2>/dev/null || true
    echo -e "${GREEN}✓ Gravações de teste removidas${NC}"
fi

if [ -d "backend/storage/www/record/live" ]; then
    find backend/storage/www/record/live -name "*.mp4" -type f -exec rm -f {} \; 2>/dev/null || true
    echo -e "${GREEN}✓ Gravações de teste do backend removidas${NC}"
fi

# Remover thumbnails de teste
remove_item "storage/www/thumbnails" "thumbnails de teste"

# =========================================================
# 4. REMOVER ARQUIVOS GIT
# =========================================================
echo -e "${BLUE}4. Removendo arquivos Git...${NC}"
remove_item ".git" "repositório Git"
remove_item ".gitignore" "arquivo gitignore"

# =========================================================
# 5. REMOVER DOCUMENTAÇÃO DESNECESSÁRIA
# =========================================================
echo -e "${BLUE}5. Removendo documentação de desenvolvimento...${NC}"
remove_item "CORREÇÕES_IMPLEMENTADAS.md" "correções implementadas"
remove_item "FIX_UPLOAD_SYSTEM.md" "fix upload system"
remove_item "README.md" "README"

# Manter apenas documentação essencial de produção
if [ -d "docs" ]; then
    echo -e "${YELLOW}Limpando diretório docs (mantendo essenciais)...${NC}"
    cd docs
    # Manter apenas arquivos essenciais para produção
    find . -name "*.md" ! -name "DEPLOY_GUIDE.md" ! -name "PRODUCTION_GUIDE.md" -exec rm -f {} \; 2>/dev/null || true
    cd ..
fi

# =========================================================
# 6. REMOVER ARQUIVOS DE AMBIENTE DE EXEMPLO
# =========================================================
echo -e "${BLUE}6. Removendo arquivos de exemplo...${NC}"
remove_item ".env.example" "exemplo de .env raiz"
remove_item "backend/.env.example" "exemplo de .env backend"
remove_item "frontend/.env.example" "exemplo de .env frontend"
remove_item "worker/.env.example" "exemplo de .env worker"

# =========================================================
# 7. LIMPAR CACHE E ARQUIVOS TEMPORÁRIOS
# =========================================================
echo -e "${BLUE}7. Limpando arquivos temporários...${NC}"

# Cache NPM
find . -name ".npm" -type d -exec rm -rf {} \; 2>/dev/null || true
find . -name "npm-debug.log*" -type f -exec rm -f {} \; 2>/dev/null || true

# Cache do sistema
remove_item ".cache" "cache do sistema"
remove_item "backend/.cache" "cache do backend"
remove_item "frontend/.cache" "cache do frontend"

# Arquivos temporários do Windows
find . -name "Thumbs.db" -exec rm -f {} \; 2>/dev/null || true
find . -name "desktop.ini" -exec rm -f {} \; 2>/dev/null || true

# =========================================================
# 8. REMOVER SCRIPTS DE DESENVOLVIMENTO
# =========================================================
echo -e "${BLUE}8. Removendo scripts desnecessários...${NC}"

if [ -d "scripts" ]; then
    cd scripts
    # Manter apenas scripts essenciais de produção
    find . -name "*.js" ! -name "system-health-check.js" ! -name "monitor.sh" -exec rm -f {} \; 2>/dev/null || true
    
    # Remover scripts de desenvolvimento específicos
    remove_item "cleanup_project.js" "script de limpeza de projeto"
    remove_item "run_ip_field_migration.js" "script de migração IP"
    remove_item "migrate-camera-stream-type.js" "script de migração de stream"
    remove_item "monitor-continuous.js" "monitor contínuo"
    
    cd ..
fi

# =========================================================
# 9. LIMPAR DIRETÓRIOS VAZIOS
# =========================================================
echo -e "${BLUE}9. Removendo diretórios vazios...${NC}"
find . -type d -empty -delete 2>/dev/null || true
echo -e "${GREEN}✓ Diretórios vazios removidos${NC}"

# =========================================================
# 10. CONFIGURAR PERMISSÕES DE PRODUÇÃO
# =========================================================
echo -e "${BLUE}10. Configurando permissões de produção...${NC}"

# Remover permissões de execução desnecessárias
find . -name "*.js" ! -path "*/node_modules/*" -exec chmod 644 {} \; 2>/dev/null || true
find . -name "*.json" -exec chmod 644 {} \; 2>/dev/null || true
find . -name "*.md" -exec chmod 644 {} \; 2>/dev/null || true

# Manter scripts executáveis
chmod +x scripts/*.sh 2>/dev/null || true

# Proteger arquivos de ambiente
chmod 600 .env* 2>/dev/null || true
chmod 600 backend/.env* 2>/dev/null || true
chmod 600 frontend/.env* 2>/dev/null || true
chmod 600 worker/.env* 2>/dev/null || true

echo -e "${GREEN}✓ Permissões configuradas${NC}"

# =========================================================
# RELATÓRIO FINAL
# =========================================================
echo ""
echo -e "${GREEN}"
echo "=============================================="
echo "🎉 LIMPEZA CONCLUÍDA!"
echo "=============================================="
echo -e "${NC}"

# Calcular tamanho final
total_size=$(du -sh . 2>/dev/null | cut -f1)
echo -e "${BLUE}Tamanho final do projeto:${NC} $total_size"

# Verificar arquivos que restaram
echo ""
echo -e "${BLUE}Estrutura final:${NC}"
echo "📁 Diretórios principais:"
ls -la | grep "^d" | awk '{print "  " $9}'

echo ""
echo -e "${BLUE}Arquivos de configuração:${NC}"
ls -la *.env* 2>/dev/null | awk '{print "  " $9 " (" $5 " bytes)"}' || echo "  Nenhum arquivo .env encontrado"

echo ""
echo -e "${YELLOW}Próximos passos:${NC}"
echo "1. Execute o build do frontend: cd frontend && npm ci && npm run build"
echo "2. Execute o deploy: ./scripts/deploy-production-complete.sh"
echo "3. Teste a aplicação em produção"

echo ""
echo -e "${GREEN}✅ Projeto limpo e pronto para produção!${NC}"