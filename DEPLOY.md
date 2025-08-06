# Guia de Deploy - Sistema NewCAM

## Visão Geral

Este documento contém todas as instruções necessárias para fazer o deploy do sistema NewCAM no servidor via SSH, configurando o domínio `http://nuvem.safecameras.com.br/`.

## Pré-requisitos

### Servidor
- Ubuntu 20.04 LTS ou superior
- Mínimo 4GB RAM, 8GB recomendado
- Mínimo 50GB de armazenamento
- Acesso SSH como root ou usuário com sudo

### Domínio
- Domínio `nuvem.safecameras.com.br` apontando para o IP do servidor
- Certificado SSL (Let's Encrypt será configurado automaticamente)

## Estrutura do Projeto

```
NewCAM/
├── frontend/          # Aplicação React
├── backend/           # API Node.js/Express
├── worker/            # Serviços de processamento
├── nginx/             # Configurações do Nginx
├── docker-compose.yml # Orquestração dos serviços
├── .env.production    # Variáveis de ambiente de produção
└── scripts/           # Scripts de deploy e manutenção
```

## Portas Utilizadas

| Serviço | Porta Interna | Porta Externa | Descrição |
|---------|---------------|---------------|-----------|
| Frontend | 3000 | 80/443 | Interface web (via Nginx) |
| Backend API | 3002 | - | API REST (interno) |
| ZLMediaKit | 1935, 8080 | 1935, 8080 | Streaming RTMP/HTTP |
| Redis | 6379 | - | Cache e sessões (interno) |
| PostgreSQL | 5432 | - | Banco de dados (interno) |
| Nginx | 80, 443 | 80, 443 | Proxy reverso e SSL |

## Passo 1: Preparação do Servidor

### 1.1 Conectar ao Servidor
```bash
ssh root@SEU_IP_SERVIDOR
# ou
ssh usuario@SEU_IP_SERVIDOR
```

### 1.2 Atualizar Sistema
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git unzip
```

### 1.3 Instalar Docker e Docker Compose
```bash
# Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Instalar Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verificar instalação
docker --version
docker-compose --version
```

### 1.4 Configurar Firewall
```bash
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 1935  # RTMP
sudo ufw allow 8080  # ZLMediaKit HTTP
sudo ufw --force enable
```

## Passo 2: Deploy do Projeto

### 2.1 Clonar/Enviar Projeto
```bash
# Opção 1: Via Git (se repositório estiver configurado)
git clone https://github.com/SEU_USUARIO/NewCAM.git
cd NewCAM

# Opção 2: Via SCP (enviar arquivos locais)
# No computador local:
scp -r NewCAM/ root@SEU_IP_SERVIDOR:/opt/
# No servidor:
cd /opt/NewCAM
```

### 2.2 Configurar Variáveis de Ambiente
```bash
# Copiar arquivo de exemplo
cp .env.example .env.production

# Editar variáveis de produção
nano .env.production
```

**Conteúdo do .env.production:**
```env
# Ambiente
NODE_ENV=production
PORT=3002

# Domínio
DOMAIN=nuvem.safecameras.com.br
FRONTEND_URL=https://nuvem.safecameras.com.br
BACKEND_URL=https://nuvem.safecameras.com.br/api

# Banco de Dados (Supabase)
SUPABASE_URL=https://SEU_PROJETO.supabase.co
SUPABASE_ANON_KEY=SEU_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=SEU_SERVICE_ROLE_KEY

# JWT
JWT_SECRET=SEU_JWT_SECRET_SUPER_SEGURO_AQUI
JWT_EXPIRES_IN=24h
JWT_REFRESH_SECRET=SEU_REFRESH_SECRET_SUPER_SEGURO_AQUI

# Redis
REDIS_URL=redis://redis:6379

# ZLMediaKit
ZLM_API_URL=http://zlmediakit:1935
ZLM_SECRET=SEU_ZLM_SECRET

# Email (opcional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu-email@gmail.com
SMTP_PASS=sua-senha-app

# Logs
LOG_LEVEL=info

# Segurança
INTERNAL_SERVICE_TOKEN=newcam-internal-service-2025
```

### 2.3 Configurar Nginx
```bash
# Criar configuração do Nginx
mkdir -p nginx/conf.d
nano nginx/conf.d/newcam.conf
```

**Conteúdo do nginx/conf.d/newcam.conf:**
```nginx
server {
    listen 80;
    server_name nuvem.safecameras.com.br;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name nuvem.safecameras.com.br;
    
    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/nuvem.safecameras.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nuvem.safecameras.com.br/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security Headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Frontend (React)
    location / {
        proxy_pass http://frontend:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Backend API
    location /api/ {
        proxy_pass http://backend:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts para uploads
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        client_max_body_size 100M;
    }
    
    # WebSocket para Socket.IO
    location /socket.io/ {
        proxy_pass http://backend:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Streams HLS
    location /streams/ {
        proxy_pass http://backend:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Cache para streams
        proxy_cache_valid 200 1s;
        proxy_cache_bypass $http_cache_control;
        add_header X-Cache-Status $upstream_cache_status;
    }
    
    # ZLMediaKit HTTP API
    location /zlm/ {
        proxy_pass http://zlmediakit:8080/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# RTMP Proxy (se necessário)
stream {
    upstream rtmp_backend {
        server zlmediakit:1935;
    }
    
    server {
        listen 1935;
        proxy_pass rtmp_backend;
        proxy_timeout 1s;
        proxy_responses 1;
    }
}
```

### 2.4 Criar Docker Compose
```bash
nano docker-compose.yml
```

**Conteúdo do docker-compose.yml:**
```yaml
version: '3.8'

services:
  # Frontend React
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.prod
    container_name: newcam-frontend
    environment:
      - REACT_APP_API_URL=https://nuvem.safecameras.com.br/api
      - REACT_APP_WS_URL=wss://nuvem.safecameras.com.br
    volumes:
      - frontend_build:/app/build
    networks:
      - newcam-network
    restart: unless-stopped

  # Backend API
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.prod
    container_name: newcam-backend
    env_file:
      - .env.production
    volumes:
      - ./storage:/app/storage
      - ./logs:/app/logs
      - recordings:/app/recordings
    networks:
      - newcam-network
    depends_on:
      - redis
    restart: unless-stopped

  # Redis Cache
  redis:
    image: redis:7-alpine
    container_name: newcam-redis
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    networks:
      - newcam-network
    restart: unless-stopped

  # ZLMediaKit Streaming
  zlmediakit:
    image: zlmediakit/zlmediakit:master
    container_name: newcam-zlmediakit
    ports:
      - "1935:1935"  # RTMP
      - "8080:80"    # HTTP API
    volumes:
      - ./zlmediakit/config:/opt/media-server/conf
      - recordings:/opt/media-server/www/record
    networks:
      - newcam-network
    restart: unless-stopped

  # Nginx Proxy
  nginx:
    image: nginx:alpine
    container_name: newcam-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - /etc/letsencrypt:/etc/letsencrypt:ro
      - frontend_build:/var/www/html
    networks:
      - newcam-network
    depends_on:
      - frontend
      - backend
    restart: unless-stopped

  # Certbot para SSL
  certbot:
    image: certbot/certbot
    container_name: newcam-certbot
    volumes:
      - /etc/letsencrypt:/etc/letsencrypt
      - /var/lib/letsencrypt:/var/lib/letsencrypt
    command: certonly --webroot --webroot-path=/var/www/certbot --email admin@safecameras.com.br --agree-tos --no-eff-email -d nuvem.safecameras.com.br
    networks:
      - newcam-network

volumes:
  redis_data:
  recordings:
  frontend_build:

networks:
  newcam-network:
    driver: bridge
```

## Passo 3: Configurar SSL

### 3.1 Obter Certificado SSL
```bash
# Parar nginx temporariamente
docker-compose down nginx

# Obter certificado
sudo certbot certonly --standalone -d nuvem.safecameras.com.br --email admin@safecameras.com.br --agree-tos --no-eff-email

# Configurar renovação automática
echo "0 12 * * * /usr/bin/certbot renew --quiet" | sudo crontab -
```

## Passo 4: Build e Deploy

### 4.1 Criar Dockerfiles de Produção

**Frontend Dockerfile.prod:**
```dockerfile
# Build stage
FROM node:18-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Backend Dockerfile.prod:**
```dockerfile
FROM node:18-alpine
WORKDIR /app

# Instalar dependências do sistema (ZLMediaKit será usado para processamento de mídia)
RUN apk add --no-cache curl wget

# Copiar arquivos de dependências
COPY package*.json ./
RUN npm ci --only=production

# Copiar código fonte
COPY . .

# Criar diretórios necessários
RUN mkdir -p storage logs recordings

# Expor porta
EXPOSE 3002

# Comando de inicialização
CMD ["npm", "start"]
```

### 4.2 Executar Deploy
```bash
# Build e iniciar serviços
docker-compose up -d --build

# Verificar status
docker-compose ps

# Verificar logs
docker-compose logs -f
```

## Passo 5: Configuração Pós-Deploy

### 5.1 Configurar Banco de Dados
```bash
# Executar migrações (se necessário)
docker-compose exec backend npm run migrate

# Criar usuário admin inicial
docker-compose exec backend npm run seed:admin
```

### 5.2 Configurar ZLMediaKit
```bash
# Criar configuração do ZLMediaKit
mkdir -p zlmediakit/config
nano zlmediakit/config/config.ini
```

### 5.3 Testar Sistema
```bash
# Verificar se todos os serviços estão rodando
docker-compose ps

# Testar conectividade
curl -I https://nuvem.safecameras.com.br
curl -I https://nuvem.safecameras.com.br/api/health
```

## Passo 6: Monitoramento e Manutenção

### 6.1 Scripts de Manutenção

**scripts/backup.sh:**
```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/backups/newcam"

mkdir -p $BACKUP_DIR

# Backup de volumes
docker run --rm -v newcam_recordings:/data -v $BACKUP_DIR:/backup alpine tar czf /backup/recordings_$DATE.tar.gz -C /data .
docker run --rm -v newcam_redis_data:/data -v $BACKUP_DIR:/backup alpine tar czf /backup/redis_$DATE.tar.gz -C /data .

# Manter apenas últimos 7 dias
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
```

**scripts/update.sh:**
```bash
#!/bin/bash
echo "Atualizando sistema NewCAM..."

# Backup antes da atualização
./scripts/backup.sh

# Pull das imagens
docker-compose pull

# Rebuild e restart
docker-compose up -d --build

# Limpeza de imagens antigas
docker image prune -f

echo "Atualização concluída!"
```

### 6.2 Monitoramento
```bash
# Verificar logs em tempo real
docker-compose logs -f

# Verificar uso de recursos
docker stats

# Verificar espaço em disco
df -h
du -sh /var/lib/docker/
```

### 6.3 Configurar Logrotate
```bash
sudo nano /etc/logrotate.d/newcam
```

```
/opt/NewCAM/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 root root
    postrotate
        docker-compose -f /opt/NewCAM/docker-compose.yml restart backend
    endscript
}
```

## Comandos Úteis

### Gerenciamento de Serviços
```bash
# Parar todos os serviços
docker-compose down

# Iniciar serviços
docker-compose up -d

# Reiniciar serviço específico
docker-compose restart backend

# Ver logs de serviço específico
docker-compose logs -f backend

# Executar comando no container
docker-compose exec backend bash
```

### Troubleshooting
```bash
# Verificar conectividade de rede
docker network ls
docker network inspect newcam_newcam-network

# Verificar volumes
docker volume ls
docker volume inspect newcam_recordings

# Limpar sistema
docker system prune -f
docker volume prune -f
```

## Segurança

### Configurações Recomendadas
1. **Firewall:** Apenas portas 22, 80, 443, 1935, 8080 abertas
2. **SSH:** Desabilitar login root, usar chaves SSH
3. **SSL:** Certificados Let's Encrypt com renovação automática
4. **Backup:** Backup diário automatizado
5. **Monitoramento:** Logs centralizados e alertas

### Hardening do Servidor
```bash
# Desabilitar login root SSH
sudo sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart ssh

# Configurar fail2ban
sudo apt install fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

## Conclusão

Após seguir todos os passos, o sistema NewCAM estará disponível em:
- **Frontend:** https://nuvem.safecameras.com.br
- **API:** https://nuvem.safecameras.com.br/api
- **RTMP:** rtmp://nuvem.safecameras.com.br:1935/live
- **ZLMediaKit:** https://nuvem.safecameras.com.br/zlm

### Credenciais Padrão
- **Email:** admin@newcam.com
- **Senha:** admin123

**⚠️ IMPORTANTE:** Altere as credenciais padrão imediatamente após o primeiro login!

### Suporte
Para suporte técnico ou dúvidas sobre o deploy, consulte:
- Logs do sistema: `docker-compose logs`
- Documentação da API: https://nuvem.safecameras.com.br/api/docs
- Health check: https://nuvem.safecameras.com.br/api/health