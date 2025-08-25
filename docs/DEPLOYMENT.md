# 🚀 Guia de Deploy - Sistema NewCAM

## 📋 Visão Geral

Este guia detalha o processo completo de deploy do Sistema NewCAM para produção no servidor `nuvem.safecameras.com.br` (66.94.104.241).

### ✅ Status do Sistema (Janeiro 2025)
- **Sistema Limpo**: Todos os arquivos temporários e logs removidos
- **S3 Upload**: Sistema de upload para Wasabi S3 100% funcional
- **AWS SDK v3**: Migração completa com presigned URLs funcionais
- **Docker**: Configuração otimizada para produção
- **PM2**: Configuração completa para gerenciamento de processos

## 🔧 Pré-requisitos

### Servidor de Produção
- **Sistema Operacional**: Ubuntu 20.04+ LTS
- **RAM**: Mínimo 8GB, Recomendado 16GB
- **Storage**: Mínimo 100GB SSD NVMe
- **CPU**: 4+ cores (para processamento de vídeo)
- **Rede**: Porta 443 (HTTPS), 80 (HTTP), 1935 (RTMP), 554 (RTSP), 8000 (HLS)

### Portas Necessárias
- **80**: HTTP (Nginx)
- **443**: HTTPS/SSL (Nginx)
- **3002**: Backend API (interno)
- **3003**: Worker Service (interno)
- **8000**: ZLMediaKit HTTP/HLS
- **1935**: RTMP Streaming
- **554**: RTSP Streaming
- **6379**: Redis (interno)

### Software Necessário
```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar dependências base
sudo apt install -y nginx nodejs npm postgresql redis-server

# Instalar Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar PM2 para gerenciamento de processos
sudo npm install -g pm2
```

## 📦 Estrutura de Deploy

### Diretórios no Servidor
```
/var/www/newcam/
├── backend/
│   ├── src/
│   ├── package.json
│   └── ecosystem.config.js
├── frontend/
│   └── dist/
├── worker/
│   ├── src/
│   └── package.json
├── storage/
│   ├── recordings/
│   ├── thumbnails/
│   └── temp/
├── logs/
└── .env.production
```

## 🛠️ Processo de Deploy

### 1. Build Local
```bash
# No diretório do projeto
npm run build:all
```

### 2. Deploy Automatizado
```bash
# Executar script de deploy
./scripts/deploy.sh

# Ou deploy manual
chmod +x deploy-production.sh
./deploy-production.sh
```

### 3. Configuração do Servidor
```bash
# Conectar ao servidor
ssh root@66.94.104.241

# Executar script de instalação
./install-on-server.sh
```

## ⚙️ Configuração de Serviços

### PM2 Configuration (ecosystem.config.js)
```javascript
module.exports = {
  apps: [
    {
      name: 'newcam-backend',
      script: './backend/src/server.js',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      }
    },
    {
      name: 'newcam-worker',
      script: './worker/src/worker.js',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    }
  ]
};
```

### Nginx Configuration
```nginx
server {
    listen 443 ssl http2;
    server_name nuvem.safecameras.com.br;

    # SSL Configuration
    ssl_certificate /etc/ssl/certs/newcam.crt;
    ssl_certificate_key /etc/ssl/private/newcam.key;

    # Frontend
    location / {
        root /var/www/newcam/frontend/dist;
        try_files $uri $uri/ /index.html;
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
    }

    # WebSocket
    location /ws {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Streaming
    location /live {
        proxy_pass http://localhost:8000;
        add_header Access-Control-Allow-Origin *;
    }
}
```

## 🔒 Configuração SSL

### Usando Let's Encrypt
```bash
# Instalar Certbot
sudo apt install snapd
sudo snap install core; sudo snap refresh core
sudo snap install --classic certbot

# Gerar certificado
sudo certbot --nginx -d nuvem.safecameras.com.br

# Auto-renovação
sudo systemctl enable certbot.timer
```

## 🔥 Firewall e Segurança

### UFW Configuration
```bash
# Configurar firewall
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw allow 1935/tcp # RTMP
sudo ufw enable
```

### Fail2Ban (Opcional)
```bash
sudo apt install fail2ban
sudo systemctl enable fail2ban
```

## 📊 Monitoramento

### Health Checks
```bash
# Verificar status dos serviços
pm2 status
pm2 monit

# Verificar logs
pm2 logs
tail -f /var/log/nginx/newcam_error.log
```

### Sistema de Backup
```bash
# Configurar backup automático
sudo crontab -e

# Adicionar linha para backup diário às 2:00
0 2 * * * /var/www/newcam/scripts/backup.sh
```

## 🚨 Troubleshooting

### Problemas Comuns

1. **Serviço não inicia**
   ```bash
   pm2 restart all
   sudo systemctl restart nginx
   ```

2. **Erro de permissões**
   ```bash
   sudo chown -R www-data:www-data /var/www/newcam/
   sudo chmod -R 755 /var/www/newcam/
   ```

3. **Erro de SSL**
   ```bash
   sudo certbot renew
   sudo nginx -t && sudo systemctl reload nginx
   ```

4. **Database issues**
   ```bash
   # Verificar Supabase connection
   curl -H "apikey: [SUPABASE_ANON_KEY]" \
        "https://grkvfzuadctextnbpajb.supabase.co/rest/v1/cameras"
   ```

## 📝 Checklist de Deploy

- [ ] Build local concluído
- [ ] Arquivos enviados para servidor
- [ ] Dependências instaladas
- [ ] Variáveis de ambiente configuradas
- [ ] SSL/TLS configurado
- [ ] Firewall configurado
- [ ] PM2 configurado e rodando
- [ ] Nginx configurado e rodando
- [ ] Health checks funcionando
- [ ] Backup configurado
- [ ] Monitoramento ativo

## 🔄 Rollback

### Em caso de problemas
```bash
# Parar serviços
pm2 stop all

# Reverter para backup anterior
cd /var/www/newcam
tar -xzf /var/backups/newcam/newcam_backup_[timestamp].tar.gz

# Reiniciar serviços
pm2 start all
```

## 📞 Suporte

- **Logs**: `/var/log/newcam/`
- **Status**: `https://nuvem.safecameras.com.br/api/health`
- **Admin**: `gouveiarx@gmail.com`

---
*Documentação atualizada: $(date)*