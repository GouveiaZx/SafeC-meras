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
