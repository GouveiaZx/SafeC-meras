# Guia de Instalação - NewCAM

## Visão Geral

NewCAM é um sistema profissional de vigilância IP com streaming em tempo real, interface web e backend robusto para monitoramento profissional.

## Requisitos do Sistema

### Desenvolvimento Local
- **Node.js**: 18+ LTS
- **Docker**: 20.10+
- **Docker Compose**: 2.0+
- **Sistema Operacional**: Windows 10/11, Ubuntu 20.04+, CentOS 8+
- **RAM**: Mínimo 8GB, Recomendado 16GB
- **Disco**: Mínimo 50GB SSD

### Produção
- **Servidor**: Ubuntu 20.04+ ou CentOS 8+
- **CPU**: 4 cores mínimo, 8+ recomendado
- **RAM**: 16GB mínimo, 32GB+ para muitas câmeras
- **Disco**: SSD 500GB+ (dependendo da retenção de gravações)
- **Rede**: 1Gbps recomendado

## Instalação Local (Desenvolvimento)

### 1. Clone do Repositório
```bash
git clone https://github.com/your-org/newcam.git
cd newcam
```

### 2. Configuração de Dependências
```bash
# Instalar dependências de todos os serviços
npm install

# Instalar dependências específicas
cd backend && npm install
cd ../frontend && npm install
cd ../worker && npm install
```

### 3. Configuração do Ambiente
```bash
# Copiar arquivo de exemplo
cp backend/.env.example backend/.env

# Editar configurações necessárias
nano backend/.env
```

### 4. Configuração do Docker
```bash
# Iniciar serviços de infraestrutura
docker-compose up -d

# Verificar serviços
docker ps
```

### 5. Configuração do Banco de Dados
```bash
# Executar migrações
cd backend
npm run migrate

# Criar usuário administrador
ADMIN_EMAIL=admin@newcam.local ADMIN_PASSWORD=admin123 ADMIN_NAME=Administrador node src/scripts/createAdminUser.js
```

### 6. Iniciar Serviços
```bash
# Desenvolvimento (todos os serviços)
npm run dev

# Ou individualmente
npm run dev:backend    # Backend API (porta 3002)
npm run dev:frontend   # Frontend (porta 5173)
npm run dev:worker     # Worker service
```

## Instalação Windows

### Pré-requisitos
1. **Windows 10/11** com WSL2 habilitado
2. **Docker Desktop** instalado e configurado
3. **Node.js 18+** instalado
4. **Git** para controle de versão

### Passos Específicos Windows
```powershell
# Instalar dependências via Chocolatey (opcional)
choco install nodejs docker-desktop git

# Clone e configuração
git clone https://github.com/your-org/newcam.git
cd newcam

# Executar script de instalação Windows
.\scripts\install\install-windows.ps1

# Configurar Docker Desktop
# - Habilitar integração WSL2
# - Alocar pelo menos 8GB RAM
# - Habilitar Kubernetes (opcional)
```

### Configurações Windows Específicas
```env
# backend/.env - Configurações para Windows
RECORDINGS_PATH=./storage/www/record/live
FFMPEG_PATH=ffmpeg  # Se no PATH do sistema
DOCKER_HOST=npipe:////./pipe/docker_engine
```

## Instalação Linux (Ubuntu/Debian)

### Pré-requisitos
```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar dependências básicas
sudo apt install -y curl wget git build-essential

# Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Instalar Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Instalar Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar FFmpeg
sudo apt install -y ffmpeg
```

### Configuração Linux
```bash
# Clone do projeto
git clone https://github.com/your-org/newcam.git
cd newcam

# Executar script de instalação
chmod +x scripts/install/install-linux.sh
./scripts/install/install-linux.sh

# Configurar permissões
sudo chown -R $USER:$USER storage/
chmod -R 755 storage/
```

## Configuração de Produção

### 1. Configuração do Servidor
```bash
# Instalar dependências de produção
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx

# Configurar PM2 para gerenciamento de processos
npm install -g pm2

# Configurar systemd services
sudo cp scripts/systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable newcam-backend newcam-worker
```

### 2. Configuração SSL/HTTPS
```bash
# Configurar certificados Let's Encrypt
sudo certbot --nginx -d your-domain.com

# Configurar renovação automática
sudo crontab -e
# Adicionar: 0 12 * * * /usr/bin/certbot renew --quiet
```

### 3. Configuração Nginx
```nginx
# /etc/nginx/sites-available/newcam
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        root /path/to/newcam/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /live {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Configuração de Banco de Dados

### Supabase (Recomendado)
1. Criar projeto em https://supabase.com
2. Configurar variáveis no .env:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### PostgreSQL Local (Alternativo)
```bash
# Instalar PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Configurar banco
sudo -u postgres createdb newcam
sudo -u postgres createuser newcam_user
sudo -u postgres psql -c "ALTER USER newcam_user PASSWORD 'secure_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE newcam TO newcam_user;"
```

## Verificação da Instalação

### Testes de Saúde
```bash
# Verificar serviços Docker
docker ps

# Verificar aplicação
curl http://localhost:3002/health
curl http://localhost:3002/api/health

# Verificar ZLMediaKit
curl http://localhost:8000/index/api/getServerConfig

# Verificar frontend
curl http://localhost:5173 # desenvolvimento
curl http://localhost # produção
```

### Logs e Monitoramento
```bash
# Logs dos serviços
docker-compose logs -f

# Logs da aplicação
tail -f backend/storage/logs/combined.log

# Status dos serviços systemd (produção)
sudo systemctl status newcam-backend
sudo systemctl status newcam-worker
```

## Solução de Problemas Comuns

### Problema: Docker não inicia
```bash
# Verificar status do Docker
sudo systemctl status docker

# Reiniciar Docker
sudo systemctl restart docker

# Verificar permissões do usuário
sudo usermod -aG docker $USER
newgrp docker
```

### Problema: Erro de permissões storage/
```bash
# Corrigir permissões
sudo chown -R $USER:$USER storage/
chmod -R 755 storage/
```

### Problema: ZLMediaKit não conecta
```bash
# Verificar container
docker logs newcam-zlmediakit

# Verificar configuração
cat docker/zlmediakit/config.ini

# Reiniciar container
docker-compose restart zlmediakit
```

### Problema: Frontend não conecta com backend
```bash
# Verificar CORS no backend/.env
CORS_ORIGIN=http://localhost:5173

# Verificar proxy do Vite
cat frontend/vite.config.ts
```

## Próximos Passos

Após a instalação bem-sucedida:

1. **Configurar Câmeras**: Ver [CAMERA_SETUP.md](CAMERA_SETUP.md)
2. **Configurar Gravações**: Ver [RECORDING_SETUP.md](RECORDING_SETUP.md)
3. **Monitoramento**: Ver [MONITORING.md](MONITORING.md)
4. **Backup**: Ver [BACKUP.md](BACKUP.md)

## Suporte

Para problemas durante a instalação:
- Verificar logs: `docker-compose logs -f`
- Consultar documentação: [docs/](.)
- Reportar issues: GitHub Issues