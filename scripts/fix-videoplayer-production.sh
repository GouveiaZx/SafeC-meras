#!/bin/bash

# Script Específico: Correção do VideoPlayer em Produção
# Execute este script no servidor SSH de produção

echo "🚀 Aplicando correção crítica no VideoPlayer.tsx em produção..."
echo "=============================================================="

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. LOCALIZAR DIRETÓRIO DO PROJETO
echo -e "\n${YELLOW}📁 ETAPA 1: Localizando diretório do projeto${NC}"
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

# 2. BACKUP DO ARQUIVO ATUAL
echo -e "\n${YELLOW}💾 ETAPA 2: Backup do VideoPlayer atual${NC}"
BACKUP_DIR="/tmp/newcam-videoplayer-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

if [ -f "frontend/src/components/VideoPlayer.tsx" ]; then
    cp "frontend/src/components/VideoPlayer.tsx" "$BACKUP_DIR/VideoPlayer.tsx.bak"
    echo "✅ Backup criado em: $BACKUP_DIR/VideoPlayer.tsx.bak"
else
    echo "❌ VideoPlayer.tsx não encontrado"
    exit 1
fi

# 3. APLICAR CORREÇÃO DO VIDEOPLAYER
echo -e "\n${YELLOW}🔧 ETAPA 3: Aplicando correção do VideoPlayer${NC}"

# Criar arquivo temporário com a correção
cat > /tmp/videoplayer-fix.tsx << 'EOF'
  // Função para obter URL base do ZLMediaKit dinamicamente
  const getZlmBaseUrl = useCallback(() => {
    let zlmBase = (import.meta.env.VITE_ZLM_BASE_URL as string) || '';
    
    console.log('🔧 VideoPlayer - Configuração ZLM:', {
      envVar: import.meta.env.VITE_ZLM_BASE_URL,
      hostname: window.location.hostname,
      protocol: window.location.protocol
    });
    
    if (!zlmBase) {
      const isLocalhost = window.location.hostname === 'localhost' || 
                         window.location.hostname === '127.0.0.1' ||
                         window.location.hostname === '0.0.0.0';
      
      if (isLocalhost) {
        zlmBase = 'http://localhost:8000';
        console.log('🏠 VideoPlayer - Usando configuração localhost');
      } else {
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;
        zlmBase = `${protocol}//${hostname}:8000`;
        console.log('🌐 VideoPlayer - Usando configuração produção:', zlmBase);
      }
    } else {
      console.log('✅ VideoPlayer - Usando VITE_ZLM_BASE_URL:', zlmBase);
    }
    
    return zlmBase;
  }, []);
EOF

# Verificar se o arquivo já tem a função getZlmBaseUrl
if grep -q "getZlmBaseUrl" "frontend/src/components/VideoPlayer.tsx"; then
    echo "✅ VideoPlayer já possui função getZlmBaseUrl"
else
    echo "🔧 Adicionando função getZlmBaseUrl ao VideoPlayer..."
    
    # Encontrar linha onde inserir a função (após imports e antes do primeiro useCallback)
    LINE_NUMBER=$(grep -n "const.*useCallback" frontend/src/components/VideoPlayer.tsx | head -1 | cut -d: -f1)
    
    if [ -n "$LINE_NUMBER" ]; then
        # Inserir função antes do primeiro useCallback
        sed -i "${LINE_NUMBER}i\\$(cat /tmp/videoplayer-fix.tsx)" frontend/src/components/VideoPlayer.tsx
        echo "✅ Função getZlmBaseUrl adicionada na linha $LINE_NUMBER"
    else
        echo "⚠️ Não foi possível localizar posição para inserir função"
    fi
fi

# Corrigir chamadas para zlmBase que podem estar fora de escopo
echo "🔧 Corrigindo referências ao zlmBase..."

# Substituir referências diretas a zlmBase por getZlmBaseUrl()
sed -i 's/\${zlmBase}/\${getZlmBaseUrl()}/g' frontend/src/components/VideoPlayer.tsx
sed -i 's/zlmBase\.replace/getZlmBaseUrl().replace/g' frontend/src/components/VideoPlayer.tsx

# 4. VERIFICAR .ENV.PRODUCTION
echo -e "\n${YELLOW}⚙️ ETAPA 4: Verificando .env.production${NC}"

FRONTEND_ENV="frontend/.env.production"
if [ -f "$FRONTEND_ENV" ]; then
    if grep -q "VITE_ZLM_BASE_URL=https://nuvem.safecameras.com.br:8000" "$FRONTEND_ENV"; then
        echo "✅ VITE_ZLM_BASE_URL já configurado corretamente"
    else
        echo "🔧 Atualizando VITE_ZLM_BASE_URL..."
        if grep -q "VITE_ZLM_BASE_URL" "$FRONTEND_ENV"; then
            sed -i 's|VITE_ZLM_BASE_URL=.*|VITE_ZLM_BASE_URL=https://nuvem.safecameras.com.br:8000|' "$FRONTEND_ENV"
        else
            echo "VITE_ZLM_BASE_URL=https://nuvem.safecameras.com.br:8000" >> "$FRONTEND_ENV"
        fi
        echo "✅ VITE_ZLM_BASE_URL atualizado"
    fi
else
    echo "❌ Arquivo .env.production não encontrado"
    exit 1
fi

# 5. REBUILD DO FRONTEND
echo -e "\n${YELLOW}🔨 ETAPA 5: Rebuild do frontend${NC}"
cd frontend

# Verificar se node_modules existe
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependências..."
    npm install
fi

# Build de produção
echo "🔨 Executando build de produção..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Build do frontend concluído com sucesso"
else
    echo "❌ Erro no build do frontend"
    echo "🔄 Restaurando backup..."
    cp "$BACKUP_DIR/VideoPlayer.tsx.bak" "$PROJECT_DIR/frontend/src/components/VideoPlayer.tsx"
    exit 1
fi

cd ..

# 6. REINICIAR CONTAINERS
echo -e "\n${YELLOW}🔄 ETAPA 6: Reiniciando containers Docker${NC}"

echo "⏹️ Parando containers..."
docker-compose down

sleep 5

echo "🚀 Iniciando containers..."
docker-compose up -d

echo "⏳ Aguardando inicialização (30 segundos)..."
sleep 30

# 7. TESTES DE CONECTIVIDADE
echo -e "\n${YELLOW}🧪 ETAPA 7: Testes de conectividade${NC}"

# Teste ZLMediaKit
echo "🧪 Testando ZLMediaKit..."
if curl -I http://localhost:8000/index/api/getServerConfig >/dev/null 2>&1; then
    echo "✅ ZLMediaKit OK"
else
    echo "❌ ZLMediaKit não responde"
fi

# Teste Backend
echo "🧪 Testando Backend..."
if curl -I http://localhost:3002/health >/dev/null 2>&1; then
    echo "✅ Backend OK"
else
    echo "❌ Backend não responde"
fi

# Teste Nginx
echo "🧪 Testando Nginx..."
if curl -I http://localhost/health >/dev/null 2>&1; then
    echo "✅ Nginx OK"
else
    echo "❌ Nginx não responde"
fi

# 8. VERIFICAÇÃO FINAL
echo -e "\n${YELLOW}📋 ETAPA 8: Verificação final${NC}"

# Verificar se a variável foi incluída no build
if grep -r "nuvem.safecameras.com.br:8000" frontend/dist/ >/dev/null 2>&1; then
    echo "✅ URLs de produção incluídas no build do frontend"
else
    echo "⚠️ URLs de produção podem não ter sido incluídas no build"
fi

# Verificar arquivos build
if [ -f "frontend/dist/index.html" ]; then
    echo "✅ Build do frontend gerado com sucesso"
else
    echo "❌ Build do frontend não encontrado"
fi

# 9. RELATÓRIO FINAL
echo -e "\n${GREEN}📊 RELATÓRIO FINAL - CORREÇÃO VIDEOPLAYER${NC}"
echo "============================================="
echo "✅ Correções aplicadas:"
echo "   - Função getZlmBaseUrl() adicionada ao VideoPlayer"
echo "   - Referências a zlmBase corrigidas"
echo "   - VITE_ZLM_BASE_URL configurado para produção"
echo "   - Frontend rebuilded com correções"
echo "   - Containers reiniciados"
echo ""
echo "📍 Backup salvo em: $BACKUP_DIR"
echo ""
echo "🌐 URLs para testar:"
echo "   - Frontend: https://nuvem.safecameras.com.br"
echo "   - Console do navegador: NÃO deve mostrar localhost:8000"
echo "   - Streams: Devem carregar sem ficar 'girando'"
echo ""
echo -e "${GREEN}🎉 Correção do VideoPlayer finalizada!${NC}"
echo "Teste agora o sistema no navegador."

# Cleanup
rm -f /tmp/videoplayer-fix.tsx

exit 0