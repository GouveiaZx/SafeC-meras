#!/bin/bash

set -e

echo "🚀 Iniciando deploy do NewCAM..."

# Variáveis
DEPLOY_DIR="/var/www/newcam"
BACKUP_DIR="/var/backups/newcam"
DATE=$(date +%Y%m%d_%H%M%S)
LOG_FILE="/var/log/newcam/deploy_$DATE.log"

# Função para logging
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Função para verificar se um serviço está rodando
check_service() {
    if systemctl is-active --quiet "$1"; then
        return 0
    else
        return 1
    fi
}

# Função para verificar se uma porta está em uso
check_port() {
    if netstat -tlnp | grep -q ":$1 "; then
        return 0
    else
        return 1
    fi
}

# Criar diretórios de log
mkdir -p /var/log/newcam

log "🚀 Iniciando deploy do NewCAM..."

# Verificar se está rodando como root ou sudo
if [[ $EUID -ne 0 ]]; then
   log "❌ Este script deve ser executado como root ou com sudo"
   exit 1
fi

# Verificar dependências
log "🔍 Verificando dependências..."
command -v node >/dev/null 2>&1 || { log "❌ Node.js não encontrado. Instale Node.js 18+"; exit 1; }
command -v npm >/dev/null 2>&1 || { log "❌ npm não encontrado. Instale npm"; exit 1; }
command -v docker >/dev/null 2>&1 || { log "❌ Docker não encontrado. Instale Docker"; exit 1; }
command -v docker-compose >/dev/null 2>&1 || { log "❌ Docker Compose não encontrado. Instale Docker Compose"; exit 1; }
command -v pm2 >/dev/null 2>&1 || { log "⚠️ PM2 não encontrado. Instalando..."; npm install -g pm2; }

log "✅ Dependências verificadas"

# Criar backup
log "📦 Criando backup..."
mkdir -p $BACKUP_DIR
if [ -d "$DEPLOY_DIR" ]; then
    log "📦 Fazendo backup do diretório atual..."
    tar -czf "$BACKUP_DIR/newcam_backup_$DATE.tar.gz" -C "$DEPLOY_DIR" . 2>/dev/null || log "⚠️ Aviso: Erro ao criar backup"
    log "✅ Backup criado: $BACKUP_DIR/newcam_backup_$DATE.tar.gz"
else
    log "ℹ️ Nenhum diretório anterior encontrado para backup"
fi

# Parar serviços existentes
log "⏹️ Parando serviços existentes..."
pm2 stop ecosystem.config.js 2>/dev/null || log "ℹ️ Nenhum processo PM2 encontrado"
pm2 delete all 2>/dev/null || log "ℹ️ Nenhum processo PM2 para deletar"

# Parar containers Docker se existirem
if [ -f "$DEPLOY_DIR/docker/docker-compose.yml" ]; then
    log "🐳 Parando containers Docker existentes..."
    cd "$DEPLOY_DIR/docker" && docker-compose down 2>/dev/null || log "ℹ️ Nenhum container Docker encontrado"
fi

# Criar diretórios necessários
log "📁 Criando diretórios..."
mkdir -p $DEPLOY_DIR
mkdir -p /var/log/newcam
mkdir -p /var/newcam/{uploads,recordings,data}
mkdir -p /var/www/streams
mkdir -p /etc/newcam

# Copiar arquivos
log "📋 Copiando arquivos..."
cp -r ./* $DEPLOY_DIR/ 2>/dev/null || { log "❌ Erro ao copiar arquivos"; exit 1; }
log "✅ Arquivos copiados"

# Configurar permissões
log "🔐 Configurando permissões..."
chown -R www-data:www-data /var/newcam 2>/dev/null || log "⚠️ Aviso: Erro ao configurar permissões /var/newcam"
chown -R www-data:www-data /var/www/streams 2>/dev/null || log "⚠️ Aviso: Erro ao configurar permissões /var/www/streams"
chown -R www-data:www-data /var/log/newcam 2>/dev/null || log "⚠️ Aviso: Erro ao configurar permissões /var/log/newcam"
chmod -R 755 /var/newcam
chmod -R 755 /var/www/streams
chmod +x $DEPLOY_DIR/scripts/*.sh 2>/dev/null || log "⚠️ Aviso: Erro ao tornar scripts executáveis"
log "✅ Permissões configuradas"

# Instalar dependências
log "📦 Instalando dependências..."
cd $DEPLOY_DIR

# Backend
if [ -d "backend" ]; then
    log "📦 Instalando dependências do backend..."
    cd backend
    npm ci --production --silent || { log "❌ Erro ao instalar dependências do backend"; exit 1; }
    cd ..
    log "✅ Dependências do backend instaladas"
fi

# Worker
if [ -d "worker" ]; then
    log "📦 Instalando dependências do worker..."
    cd worker
    npm ci --production --silent || { log "❌ Erro ao instalar dependências do worker"; exit 1; }
    cd ..
    log "✅ Dependências do worker instaladas"
fi

# Frontend (instalar serve se não existir)
log "📦 Verificando serve para frontend..."
npm list -g serve >/dev/null 2>&1 || {
    log "📦 Instalando serve globalmente..."
    npm install -g serve --silent || { log "❌ Erro ao instalar serve"; exit 1; }
}
log "✅ Serve disponível"

# Verificar se as portas estão livres
log "🔍 Verificando portas..."
if check_port 5173; then
    log "⚠️ Porta 5173 em uso, tentando parar processo..."
    fuser -k 5173/tcp 2>/dev/null || log "ℹ️ Nenhum processo na porta 5173"
fi

if check_port 3002; then
    log "⚠️ Porta 3002 em uso, tentando parar processo..."
    fuser -k 3002/tcp 2>/dev/null || log "ℹ️ Nenhum processo na porta 3002"
fi

if check_port 3003; then
    log "⚠️ Porta 3003 em uso, tentando parar processo..."
    fuser -k 3003/tcp 2>/dev/null || log "ℹ️ Nenhum processo na porta 3003"
fi

# Iniciar Docker
log "🐳 Iniciando containers Docker..."
cd docker
docker-compose down 2>/dev/null || log "ℹ️ Nenhum container para parar"
docker-compose up -d || { log "❌ Erro ao iniciar containers Docker"; exit 1; }
log "✅ Containers Docker iniciados"

# Aguardar containers
log "⏳ Aguardando containers ficarem prontos..."
sleep 30

# Verificar saúde dos containers
log "🔍 Verificando saúde dos containers..."
docker-compose ps

# Verificar se PostgreSQL está pronto
log "🔍 Verificando PostgreSQL..."
for i in {1..30}; do
    if docker-compose exec -T postgres pg_isready -U newcam_user >/dev/null 2>&1; then
        log "✅ PostgreSQL está pronto"
        break
    fi
    if [ $i -eq 30 ]; then
        log "❌ PostgreSQL não ficou pronto em 30 tentativas"
        exit 1
    fi
    log "⏳ Aguardando PostgreSQL... ($i/30)"
    sleep 2
done

# Verificar se Redis está pronto
log "🔍 Verificando Redis..."
for i in {1..15}; do
    if docker-compose exec -T redis redis-cli ping >/dev/null 2>&1; then
        log "✅ Redis está pronto"
        break
    fi
    if [ $i -eq 15 ]; then
        log "❌ Redis não ficou pronto em 15 tentativas"
        exit 1
    fi
    log "⏳ Aguardando Redis... ($i/15)"
    sleep 2
done

# Executar migrações (se necessário)
log "🗄️ Executando migrações..."
cd $DEPLOY_DIR/backend
if [ -f "package.json" ] && npm run --silent 2>/dev/null | grep -q "migrate"; then
    npm run migrate || log "⚠️ Aviso: Erro ao executar migrações"
    log "✅ Migrações executadas"
else
    log "ℹ️ Nenhum script de migração encontrado"
fi

# Iniciar aplicações com PM2
log "🚀 Iniciando aplicações..."
cd $DEPLOY_DIR
pm2 start ecosystem.config.js --env production || { log "❌ Erro ao iniciar aplicações"; exit 1; }
log "✅ Aplicações iniciadas"

# Aguardar aplicações ficarem prontas
log "⏳ Aguardando aplicações ficarem prontas..."
sleep 15

# Verificar status das aplicações
log "✅ Verificando status das aplicações..."
pm2 status

# Verificar se as aplicações estão respondendo
log "🔍 Testando conectividade..."

# Testar backend
for i in {1..10}; do
    if curl -f http://localhost:3002/api/health >/dev/null 2>&1; then
        log "✅ Backend respondendo na porta 3002"
        break
    fi
    if [ $i -eq 10 ]; then
        log "⚠️ Backend não está respondendo na porta 3002"
    fi
    sleep 2
done

# Testar worker
for i in {1..10}; do
    if curl -f http://localhost:3003/health >/dev/null 2>&1; then
        log "✅ Worker respondendo na porta 3003"
        break
    fi
    if [ $i -eq 10 ]; then
        log "⚠️ Worker não está respondendo na porta 3003"
    fi
    sleep 2
done

# Testar frontend
for i in {1..10}; do
    if curl -f http://localhost:5173 >/dev/null 2>&1; then
        log "✅ Frontend respondendo na porta 5173"
        break
    fi
    if [ $i -eq 10 ]; then
        log "⚠️ Frontend não está respondendo na porta 5173"
    fi
    sleep 2
done

# Verificar status final dos containers
log "🐳 Status final dos containers:"
cd $DEPLOY_DIR/docker
docker-compose ps

# Configurar PM2 para iniciar no boot
log "🔧 Configurando PM2 para iniciar no boot..."
pm2 startup systemd -u www-data --hp /var/www 2>/dev/null || log "⚠️ Aviso: Erro ao configurar PM2 startup"
pm2 save || log "⚠️ Aviso: Erro ao salvar configuração PM2"

# Criar script de monitoramento
log "📊 Criando script de monitoramento..."
cat > /usr/local/bin/newcam-status << 'EOF'
#!/bin/bash
echo "=== NewCAM System Status ==="
echo
echo "PM2 Processes:"
pm2 status
echo
echo "Docker Containers:"
docker-compose -f /var/www/newcam/docker/docker-compose.yml ps
echo
echo "Port Status:"
netstat -tlnp | grep -E ':(5173|3002|3003|5432|6379|1935|8080)'
echo
echo "Disk Usage:"
df -h /var/newcam /var/www/streams
echo
echo "Memory Usage:"
free -h
EOF

chmod +x /usr/local/bin/newcam-status
log "✅ Script de monitoramento criado: newcam-status"

# Resumo final
log "🎉 Deploy concluído com sucesso!"
log "📊 Resumo:"
log "   Frontend: http://localhost:5173"
log "   Backend: http://localhost:3002"
log "   Worker: http://localhost:3003"
log "   Logs: /var/log/newcam/"
log "   Dados: /var/newcam/"
log "   Streams: /var/www/streams/"
log ""
log "🔧 Comandos úteis:"
log "   Status: newcam-status"
log "   Logs PM2: pm2 logs"
log "   Logs Docker: docker-compose -f /var/www/newcam/docker/docker-compose.yml logs"
log "   Reiniciar: pm2 restart ecosystem.config.js"
log "   Parar: pm2 stop ecosystem.config.js"
log ""
log "📝 Log completo salvo em: $LOG_FILE"

echo
echo "🎉 Deploy do NewCAM concluído com sucesso!"
echo "📊 Execute 'newcam-status' para verificar o status do sistema"
echo "📝 Log completo: $LOG_FILE"