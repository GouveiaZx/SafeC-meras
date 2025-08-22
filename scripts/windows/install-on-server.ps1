#!/usr/bin/env pwsh
# Script de Instalação do Servidor NewCAM - Windows
# PowerShell equivalente para Windows

param(
    [switch]$skipUpdates = $false
)

# Cores para output
$RED = "`e[31m"
$GREEN = "`e[32m"
$YELLOW = "`e[33m"
$BLUE = "`e[34m"
$RESET = "`e[0m"

Write-Host "${BLUE}=== NewCAM Server Installation ===${RESET}" -ForegroundColor Blue

# Verificar se é administrador
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "${RED}Este script precisa ser executado como administrador${RESET}" -ForegroundColor Red
    exit 1
}

# Atualizar sistema (opcional)
if (-not $skipUpdates) {
    Write-Host "${YELLOW}Atualizando sistema...${RESET}" -ForegroundColor Yellow
    try {
        Install-WindowsUpdate -AcceptAll -AutoReboot
    } catch {
        Write-Host "${YELLOW}Atualizações do Windows não disponíveis ou já instaladas${RESET}" -ForegroundColor Yellow
    }
}

# Instalar Chocolatey (gerenciador de pacotes)
if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
    Write-Host "${BLUE}Instalando Chocolatey...${RESET}" -ForegroundColor Blue
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))
}

# Instalar dependências
Write-Host "${BLUE}Instalando dependências...${RESET}" -ForegroundColor Blue
$packages = @(
    "nodejs",
    "postgresql",
    "redis-64",
    "nginx",
    "git",
    "pm2",
    "python3",
    "7zip"
)

foreach ($package in $packages) {
    Write-Host "${YELLOW}Instalando $package...${RESET}" -ForegroundColor Yellow
    choco install $package -y --no-progress
}

# Configurar PostgreSQL
Write-Host "${BLUE}Configurando PostgreSQL...${RESET}" -ForegroundColor Blue
$pgDataDir = "C:\Program Files\PostgreSQL\15\data"
$pgBinDir = "C:\Program Files\PostgreSQL\15\bin"

# Criar banco de dados e usuário
$env:PATH += ";$pgBinDir"
psql -U postgres -c "CREATE USER newcam WITH PASSWORD 'newcam123';"
psql -U postgres -c "CREATE DATABASE newcam OWNER newcam;"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE newcam TO newcam;"

# Configurar Redis
Write-Host "${BLUE}Configurando Redis...${RESET}" -ForegroundColor Blue
$redisConf = @"
port 6379
bind 127.0.0.1
timeout 300
tcp-keepalive 300
databases 16
save 900 1
save 300 10
save 60 10000
rdbcompression yes
dbfilename dump.rdb
dir C:\\redis\\data
"@

$redisConf | Out-File -FilePath "C:\Program Files\Redis\redis.conf" -Encoding UTF8

# Configurar Nginx
Write-Host "${BLUE}Configurando Nginx...${RESET}" -ForegroundColor Blue
$nginxConfDir = "C:\nginx\conf"

# Criar diretório de sites disponíveis
New-Item -ItemType Directory -Path "$nginxConfDir\sites-available" -Force | Out-Null
New-Item -ItemType Directory -Path "$nginxConfDir\sites-enabled" -Force | Out-Null

# Configuração básica do Nginx
$nginxMainConf = @"
worker_processes auto;
error_log C:/nginx/logs/error.log;
pid C:/nginx/logs/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include C:/nginx/conf/mime.types;
    default_type application/octet-stream;
    
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';
    
    access_log C:/nginx/logs/access.log main;
    
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    
    include C:/nginx/conf/sites-enabled/*;
}
"@

$nginxMainConf | Out-File -FilePath "$nginxConfDir\nginx.conf" -Encoding UTF8

# Configurar PM2
Write-Host "${BLUE}Configurando PM2...${RESET}" -ForegroundColor Blue
npm install -g pm2

# Configurar firewall
Write-Host "${BLUE}Configurando firewall...${RESET}" -ForegroundColor Blue
$ports = @(80, 443, 3002, 3003, 5432, 6379)
foreach ($port in $ports) {
    New-NetFirewallRule -DisplayName "NewCAM-Port-$port" -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow
}

# Criar serviços do Windows
Write-Host "${BLUE}Criando serviços do Windows...${RESET}" -ForegroundColor Blue

# Serviço PostgreSQL
sc.exe create postgresql binPath= "\"C:\Program Files\PostgreSQL\15\bin\pg_ctl.exe\" runservice -N postgresql -D \"C:\Program Files\PostgreSQL\15\data\"" start= auto

# Serviço Redis
sc.exe create redis binPath= "\"C:\Program Files\Redis\redis-server.exe\" \"C:\Program Files\Redis\redis.conf\"" start= auto

# Serviço Nginx
sc.exe create nginx binPath= "C:\nginx\nginx.exe" start= auto

# Iniciar serviços
Write-Host "${BLUE}Iniciando serviços...${RESET}" -ForegroundColor Blue
Start-Service postgresql
Start-Service redis
Start-Service nginx

# Verificar instalação
Write-Host "${GREEN}Verificando instalação...${RESET}" -ForegroundColor Green

$services = @("postgresql", "redis", "nginx")
foreach ($service in $services) {
    $status = Get-Service -Name $service -ErrorAction SilentlyContinue
    if ($status) {
        Write-Host "${GREEN}$service: $($status.Status)${RESET}" -ForegroundColor Green
    } else {
        Write-Host "${RED}$service: Não encontrado${RESET}" -ForegroundColor Red
    }
}

Write-Host "${GREEN}Instalação concluída com sucesso!${RESET}" -ForegroundColor Green
Write-Host "${YELLOW}Próximos passos:${RESET}" -ForegroundColor Yellow
Write-Host "1. Execute o deploy-production.ps1"
Write-Host "2. Configure seu banco de dados"
Write-Host "3. Configure SSL com Let's Encrypt"