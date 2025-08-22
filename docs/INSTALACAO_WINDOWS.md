# NewCAM - Guia de Instalação para Windows

Este guia fornece instruções detalhadas para instalar e executar o NewCAM no Windows Server ou Windows Desktop.

## 📋 Índice

- [Pré-requisitos](#pré-requisitos)
- [Instalação Rápida](#instalação-rápida)
- [Instalação Manual](#instalação-manual)
- [Configuração do PostgreSQL](#configuração-do-postgresql)
- [Configuração do Redis](#configuração-do-redis)
- [Configuração do Nginx](#configuração-do-nginx)
- [Solução de Problemas](#solução-de-problemas)
- [Comandos Úteis](#comandos-úteis)

## Pré-requisitos

### Sistema Operacional
- Windows 10/11 ou Windows Server 2019/2022
- PowerShell 5.1 ou superior
- Permissões de administrador

### Dependências

#### Instalação via Chocolatey (Recomendado)
```powershell
# Instalar Chocolatey (se ainda não tiver)
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))

# Instalar dependências
choco install nodejs postgresql redis-64 nginx git pm2 -y
```

#### Instalação Manual
- [Node.js 22.14.0+](https://nodejs.org/)
- [PostgreSQL 15+](https://www.postgresql.org/download/windows/)
- [Redis para Windows](https://github.com/tporadowski/redis/releases)
- [Nginx para Windows](https://nginx.org/en/download.html)
- [Git para Windows](https://git-scm.com/download/win)
- [PM2](https://pm2.keymetrics.io/)

## Instalação Rápida

### Método 1: Scripts Automáticos (Recomendado)

1. **Clone o repositório**
```powershell
git clone <repository-url>
cd NewCAM
```

2. **Execute o script de instalação**
```powershell
# Como administrador
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
.\install-on-server.ps1
```

3. **Execute o deploy**
```powershell
.\deploy-production.ps1 -domain "seu-dominio.com" -email "admin@seu-dominio.com"
```

4. **Verifique a instalação**
```powershell
.\health-check.ps1
```

### Método 2: Docker no Windows

1. **Instalar Docker Desktop**
```powershell
choco install docker-desktop -y
```

2. **Iniciar com Docker**
```powershell
docker-compose up -d
```

## Instalação Manual

### 1. Configuração do Ambiente

#### Variáveis de Ambiente
```powershell
# Adicionar ao PATH
[Environment]::SetEnvironmentVariable("PATH", $env:PATH + ";C:\Program Files\PostgreSQL\15\bin;C:\Program Files\Redis;C:\nginx", "Machine")

# Configurar variáveis do sistema
[System.Environment]::SetEnvironmentVariable("NODE_ENV", "production", "Machine")
[System.Environment]::SetEnvironmentVariable("DATABASE_URL", "postgresql://newcam:newcam123@localhost:5432/newcam", "Machine")
[System.Environment]::SetEnvironmentVariable("REDIS_URL", "redis://localhost:6379", "Machine")
```

### 2. Configuração do PostgreSQL

#### Instalação e Configuração
```powershell
# Iniciar serviço PostgreSQL
net start postgresql-x64-15

# Criar banco de dados e usuário
psql -U postgres -c "CREATE USER newcam WITH PASSWORD 'newcam123';"
psql -U postgres -c "CREATE DATABASE newcam OWNER newcam;"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE newcam TO newcam;"
```

#### Configuração do pg_hba.conf
```powershell
# Localizar arquivo pg_hba.conf
$pgConfigPath = "C:\Program Files\PostgreSQL\15\data\pg_hba.conf"

# Adicionar configuração para newcam
Add-Content $pgConfigPath @"

# NewCAM Configuration
host    newcam      newcam      127.0.0.1/32      md5
host    newcam      newcam      ::1/128           md5
"@

# Reiniciar PostgreSQL
net stop postgresql-x64-15
net start postgresql-x64-15
```

### 3. Configuração do Redis

#### Instalação e Configuração
```powershell
# Configurar Redis
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
maxmemory 256mb
maxmemory-policy allkeys-lru
"@

$redisConf | Out-File -FilePath "C:\Program Files\Redis\redis.conf" -Encoding UTF8

# Iniciar Redis
net start redis
```

### 4. Configuração do Nginx

#### Configuração do Site
```powershell
# Criar configuração do site
$nginxConfig = @"
server {
    listen 80;
    server_name localhost;
    
    root C:\newcam\frontend\dist;
    index index.html;
    
    # Frontend
    location / {
        try_files \$uri \$uri/ /index.html;
    }
    
    # API Backend
    location /api {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
    
    # WebSocket para streaming
    location /ws {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
    
    # Arquivos estáticos
    location /static {
        alias C:\newcam\frontend\dist\assets;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Arquivos de upload
    location /uploads {
        alias C:\newcam\storage;
        expires 1d;
    }
}
"@

$nginxConfig | Out-File -FilePath "C:\nginx\conf\sites-available\newcam.conf" -Encoding UTF8

# Criar link simbólico (Windows)
New-Item -ItemType SymbolicLink -Path "C:\nginx\conf\sites-enabled\newcam.conf" -Target "C:\nginx\conf\sites-available\newcam.conf" -Force
```

### 5. Configuração do Backend

#### Instalação e Configuração
```powershell
# Copiar arquivos
copy .env.example .env

# Instalar dependências
cd backend
npm install

# Configurar PM2
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

$ecosystemConfig | Out-File -FilePath "backend\ecosystem.config.js" -Encoding UTF8

# Iniciar com PM2
pm2 start ecosystem.config.js --env production
pm2 startup
pm2 save
```

### 6. Configuração do Frontend

#### Build e Configuração
```powershell
cd frontend
npm install
npm run build
```

## Comandos Úteis

### Gerenciamento de Serviços
```powershell
# PostgreSQL
net start postgresql-x64-15
net stop postgresql-x64-15

# Redis
net start redis
net stop redis

# Nginx
net start nginx
net stop nginx

# PM2
pm2 start ecosystem.config.js --env production
pm2 restart all
pm2 stop all
pm2 logs
```

### Monitoramento
```powershell
# Verificar portas
netstat -an | findstr :3002
netstat -an | findstr :5432
netstat -an | findstr :6379

# Verificar processos
tasklist /FI "IMAGENAME eq node.exe"
tasklist /FI "IMAGENAME eq postgres.exe"
tasklist /FI "IMAGENAME eq redis-server.exe"

# Logs
Get-Content "C:\Program Files\PostgreSQL\15\data\log\*.log" -Tail 50
Get-Content "C:\Program Files\Redis\redis.log" -Tail 50
Get-Content "C:\nginx\logs\error.log" -Tail 50
```

### Backup e Restauração
```powershell
# Backup do banco de dados
pg_dump -U newcam -h localhost newcam > backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql

# Restaurar banco de dados
psql -U newcam -h localhost newcam < backup.sql

# Backup de arquivos
Compress-Archive -Path "C:\newcam\storage" -DestinationPath "backup_storage_$(Get-Date -Format 'yyyyMMdd_HHmmss').zip"
```

## Solução de Problemas

### Problemas Comuns

#### 1. PostgreSQL não inicia
```powershell
# Verificar logs
type "C:\Program Files\PostgreSQL\15\data\log\*.log"

# Corrigir permissões
icacls "C:\Program Files\PostgreSQL\15\data" /grant "postgres:(OI)(CI)F" /T
```

#### 2. Redis não conecta
```powershell
# Verificar se está rodando
netstat -an | findstr :6379

# Reiniciar Redis
net stop redis
net start redis
```

#### 3. Nginx erro 403
```powershell
# Verificar permissões
icacls "C:\newcam\frontend\dist" /grant "IIS_IUSRS:(OI)(CI)RX" /T

# Verificar logs
type "C:\nginx\logs\error.log"
```

#### 4. Node.js porta em uso
```powershell
# Encontrar processo que está usando a porta
netstat -ano | findstr :3002
taskkill /PID <PID> /F
```

### Firewall do Windows
```powershell
# Abrir portas no firewall
New-NetFirewallRule -DisplayName "NewCAM-Backend" -Direction Inbound -Protocol TCP -LocalPort 3002 -Action Allow
New-NetFirewallRule -DisplayName "NewCAM-Frontend" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
New-NetFirewallRule -DisplayName "NewCAM-HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
```

## SSL com Let's Encrypt (Windows)

### Instalação do Certbot
```powershell
# Baixar Certbot
Invoke-WebRequest -Uri "https://dl.eff.org/certbot-beta-installer-win_amd64.exe" -OutFile "certbot-installer.exe"
Start-Process -FilePath "certbot-installer.exe" -Wait

# Configurar SSL
certbot --nginx -d seu-dominio.com
```

## Verificação Final

Execute o script de verificação:
```powershell
.\health-check.ps1 -verbose
```

## Suporte

Para problemas específicos do Windows:
1. Execute `.\health-check.ps1` para diagnóstico
2. Verifique os logs em `C:\newcam\storage\logs\`
3. Consulte a [documentação oficial](docs/WINDOWS-TROUBLESHOOTING.md)

## Atualizações

Para atualizar o sistema:
```powershell
# Parar serviços
pm2 stop all

# Atualizar código
git pull origin main

# Atualizar dependências
cd backend && npm update
cd ..\frontend && npm update

# Reiniciar serviços
pm2 restart all
```