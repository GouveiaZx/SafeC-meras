#!/usr/bin/env pwsh
# Script de Deploy para Produção - NewCAM
# PowerShell equivalente para Windows

param(
    [string]$domain = "localhost",
    [string]$email = "admin@localhost"
)

# Cores para output
$RED = "`e[31m"
$GREEN = "`e[32m"
$YELLOW = "`e[33m"
$BLUE = "`e[34m"
$RESET = "`e[0m"

Write-Host "${BLUE}=== NewCAM Production Deployment ===${RESET}" -ForegroundColor Blue

# Verificar se é administrador
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "${RED}Este script precisa ser executado como administrador${RESET}" -ForegroundColor Red
    exit 1
}

# Criar diretório de deploy
$DEPLOY_DIR = "C:\newcam"
$BACKUP_DIR = "C:\newcam-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

# Backup se existir
if (Test-Path $DEPLOY_DIR) {
    Write-Host "${YELLOW}Criando backup...${RESET}" -ForegroundColor Yellow
    Copy-Item -Path $DEPLOY_DIR -Destination $BACKUP_DIR -Recurse -Force
    Write-Host "${GREEN}Backup criado em: $BACKUP_DIR${RESET}" -ForegroundColor Green
}

# Criar estrutura de diretórios
Write-Host "${BLUE}Criando estrutura de diretórios...${RESET}" -ForegroundColor Blue
$dirs = @(
    "$DEPLOY_DIR",
    "$DEPLOY_DIR\backend",
    "$DEPLOY_DIR\frontend",
    "$DEPLOY_DIR\storage",
    "$DEPLOY_DIR\storage\recordings",
    "$DEPLOY_DIR\storage\thumbnails",
    "$DEPLOY_DIR\storage\logs",
    "$DEPLOY_DIR\ssl"
)

foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

# Copiar arquivos
Write-Host "${BLUE}Copiando arquivos...${RESET}" -ForegroundColor Blue
Copy-Item -Path "backend\*" -Destination "$DEPLOY_DIR\backend" -Recurse -Force
Copy-Item -Path "frontend\*" -Destination "$DEPLOY_DIR\frontend" -Recurse -Force

# Instalar dependências
Write-Host "${BLUE}Instalando dependências...${RESET}" -ForegroundColor Blue
Set-Location "$DEPLOY_DIR\backend"
npm install --production

Set-Location "$DEPLOY_DIR\frontend"
npm install
npm run build

# Configurar variáveis de ambiente
Write-Host "${BLUE}Configurando ambiente...${RESET}" -ForegroundColor Blue
$envContent = @"
NODE_ENV=production
PORT=3002
DATABASE_URL=postgresql://newcam:newcam123@localhost:5432/newcam
REDIS_URL=redis://localhost:6379
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
"@

$envContent | Out-File -FilePath "$DEPLOY_DIR\backend\.env" -Encoding UTF8

# Configurar Nginx
Write-Host "${BLUE}Configurando Nginx...${RESET}" -ForegroundColor Blue
$nginxConfig = @"
server {
    listen 80;
    server_name $domain;
    
    location / {
        root $DEPLOY_DIR\frontend\dist;
        try_files \$uri \$uri/ /index.html;
    }
    
    location /api {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
"@

$nginxConfig | Out-File -FilePath "C:\nginx\conf\sites-available\newcam.conf" -Encoding UTF8

# Configurar serviços do Windows
Write-Host "${BLUE}Configurando serviços...${RESET}" -ForegroundColor Blue

# Criar serviço PM2
$pm2Service = @"
[Unit]
Description=NewCAM Backend Service
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=www-data
WorkingDirectory=$DEPLOY_DIR/backend
ExecStart=pm2 start ecosystem.config.js --env production
ExecReload=pm2 reload ecosystem.config.js --env production
ExecStop=pm2 stop ecosystem.config.js
Restart=always

[Install]
WantedBy=multi-user.target
"@

$pm2Service | Out-File -FilePath "$DEPLOY_DIR\newcam-backend.service" -Encoding UTF8

# Configurar PM2
Set-Location "$DEPLOY_DIR\backend"
$ecosystemConfig = @"
module.exports = {
  apps: [{
    name: 'newcam-backend',
    script: './src/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3002
    }
  }, {
    name: 'newcam-worker',
    script: './src/worker.js',
    instances: 2,
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3003
    }
  }]
};
"@

$ecosystemConfig | Out-File -FilePath "$DEPLOY_DIR\backend\ecosystem.config.js" -Encoding UTF8

# Configurar firewall
Write-Host "${BLUE}Configurando firewall...${RESET}" -ForegroundColor Blue
New-NetFirewallRule -DisplayName "NewCAM-Backend" -Direction Inbound -Protocol TCP -LocalPort 3002 -Action Allow
New-NetFirewallRule -DisplayName "NewCAM-Frontend" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
New-NetFirewallRule -DisplayName "NewCAM-HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow

Write-Host "${GREEN}Deploy concluído com sucesso!${RESET}" -ForegroundColor Green
Write-Host "${YELLOW}Próximos passos:${RESET}" -ForegroundColor Yellow
Write-Host "1. Configure o banco de dados PostgreSQL"
Write-Host "2. Configure o Redis"
Write-Host "3. Execute: pm2 start ecosystem.config.js --env production"
Write-Host "4. Configure o Nginx"
Write-Host "5. Configure SSL com Let's Encrypt"