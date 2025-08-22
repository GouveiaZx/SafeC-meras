#!/bin/bash

# Script de Deploy para Produção - NewCAM
# Servidor: nuvem.safecameras.com.br (66.94.104.241)

echo "=== Deploy NewCAM para Produção ==="
echo "Servidor: nuvem.safecameras.com.br"
echo "IP: 66.94.104.241"
echo ""

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}1. Preparando arquivos de produção...${NC}"

# Copiar arquivos de ambiente de produção
cp frontend/.env.production frontend/.env
cp backend/.env.production backend/.env
cp worker/.env.production worker/.env
cp frontend/src/config/streaming.production.json frontend/src/config/streaming.json

echo -e "${GREEN}✓ Arquivos de ambiente configurados para produção${NC}"

# Instalar dependências e fazer build do frontend
echo -e "${YELLOW}2. Fazendo build do frontend...${NC}"
cd frontend
npm install
npm run build
cd ..
echo -e "${GREEN}✓ Build do frontend concluído${NC}"

# Instalar dependências do backend
echo -e "${YELLOW}3. Instalando dependências do backend...${NC}"
cd backend
npm install
cd ..
echo -e "${GREEN}✓ Dependências do backend instaladas${NC}"

# Instalar dependências do worker
echo -e "${YELLOW}4. Instalando dependências do worker...${NC}"
cd worker
npm install
cd ..
echo -e "${GREEN}✓ Dependências do worker instaladas${NC}"

echo -e "${YELLOW}5. Criando arquivo de configuração do Nginx...${NC}"

# Criar configuração do Nginx
cat > nginx.conf << 'EOF'
server {
    listen 80;
    listen 443 ssl http2;
    server_name nuvem.safecameras.com.br;

    # SSL Configuration (adicionar certificados SSL)
    # ssl_certificate /path/to/certificate.crt;
    # ssl_certificate_key /path/to/private.key;

    # Redirect HTTP to HTTPS
    if ($scheme != "https") {
        return 301 https://$server_name$request_uri;
    }

    # Frontend (arquivos estáticos)
    location / {
        root /var/www/newcam/frontend/dist;
        try_files $uri $uri/ /index.html;
        
        # Cache para arquivos estáticos
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # API Backend
    location /api {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # WebSocket para streaming
    location /ws {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ZLMediaKit streaming (porta 8000)
    location /live {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Headers para streaming
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods 'GET, POST, OPTIONS';
        add_header Access-Control-Allow-Headers 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range';
    }

    # ZLMediaKit API
    location /index/api {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Logs
    access_log /var/log/nginx/newcam_access.log;
    error_log /var/log/nginx/newcam_error.log;
}
EOF

echo -e "${GREEN}✓ Configuração do Nginx criada${NC}"

echo -e "${YELLOW}6. Criando scripts de serviço systemd...${NC}"

# Script do backend
cat > newcam-backend.service << 'EOF'
[Unit]
Description=NewCAM Backend Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/newcam/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=newcam-backend

[Install]
WantedBy=multi-user.target
EOF

# Script do worker
cat > newcam-worker.service << 'EOF'
[Unit]
Description=NewCAM Worker Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/newcam/worker
Environment=NODE_ENV=production
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=newcam-worker

[Install]
WantedBy=multi-user.target
EOF

echo -e "${GREEN}✓ Scripts de serviço criados${NC}"

echo -e "${YELLOW}7. Criando script de instalação no servidor...${NC}"

# Script para executar no servidor
cat > install-on-server.sh << 'EOF'
#!/bin/bash

echo "=== Instalação NewCAM no Servidor ==="

# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar dependências
sudo apt install -y nginx nodejs npm postgresql postgresql-contrib redis-server

# Instalar PM2 para gerenciar processos Node.js
sudo npm install -g pm2

# Criar diretório da aplicação
sudo mkdir -p /var/www/newcam
sudo chown -R $USER:$USER /var/www/newcam

# Copiar arquivos (assumindo que já foram enviados)
cp -r * /var/www/newcam/

# Configurar Nginx
sudo cp nginx.conf /etc/nginx/sites-available/newcam
sudo ln -sf /etc/nginx/sites-available/newcam /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# Configurar PostgreSQL
sudo -u postgres createdb newcam
sudo -u postgres psql -c "CREATE USER newcam WITH PASSWORD 'newcam123';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE newcam TO newcam;"

# Configurar serviços systemd
sudo cp newcam-backend.service /etc/systemd/system/
sudo cp newcam-worker.service /etc/systemd/system/
sudo systemctl daemon-reload

# Iniciar serviços
cd /var/www/newcam/backend
npm run migrate # Se houver migrações

# Usar PM2 para gerenciar os serviços
cd /var/www/newcam/backend
pm2 start server.js --name "newcam-backend"

cd /var/www/newcam/worker
pm2 start index.js --name "newcam-worker"

# Salvar configuração do PM2
pm2 save
pm2 startup

# Habilitar serviços
sudo systemctl enable nginx
sudo systemctl enable postgresql
sudo systemctl enable redis-server

echo "✓ Instalação concluída!"
echo "Acesse: https://nuvem.safecameras.com.br"
EOF

chmod +x install-on-server.sh

echo -e "${GREEN}✓ Script de instalação criado${NC}"

echo ""
echo -e "${GREEN}=== Deploy preparado com sucesso! ===${NC}"
echo ""
echo -e "${YELLOW}Próximos passos:${NC}"
echo "1. Envie todos os arquivos para o servidor"
echo "2. Execute o script install-on-server.sh no servidor"
echo "3. Configure SSL/TLS (Let's Encrypt recomendado)"
echo "4. Configure o firewall para as portas necessárias"
echo ""
echo -e "${YELLOW}Portas que devem estar abertas:${NC}"
echo "- 80 (HTTP)"
echo "- 443 (HTTPS)"
echo "- 3002 (Backend - interno)"
echo "- 8000 (ZLMediaKit - interno)"
echo "- 1935 (RTMP)"
echo "- 5432 (PostgreSQL - interno)"
echo "- 6379 (Redis - interno)"
echo ""
echo -e "${GREEN}Comando para enviar arquivos:${NC}"
echo "rsync -avz --exclude node_modules --exclude .git . root@66.94.104.241:/tmp/newcam/"
echo ""
echo -e "${GREEN}Comando para conectar ao servidor:${NC}"
echo "ssh root@66.94.104.241"