# ✅ Checklist Final de Deploy - NewCAM

## 📋 Visão Geral
Este checklist garante que todos os aspectos do sistema NewCAM estejam prontos para produção no servidor `nuvem.safecameras.com.br` (66.94.104.241).

## 🔧 Pré-Requisitos do Servidor

### Sistema Base
- [ ] **Ubuntu 20.04+ LTS** instalado e atualizado
- [ ] **16GB RAM** (mínimo 8GB)
- [ ] **100GB SSD NVMe** disponível
- [ ] **4+ CPU cores** para processamento de vídeo
- [ ] **Acesso root SSH** configurado

### Softwares Essenciais
```bash
# Verificar instalações necessárias
- [ ] sudo apt update && sudo apt upgrade -y
- [ ] curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
- [ ] sudo apt install -y nodejs nginx docker.io docker-compose
- [ ] sudo npm install -g pm2
- [ ] sudo systemctl enable docker nginx
```

### Verificação de Rede
- [ ] **DNS configurado**: `nuvem.safecameras.com.br` → `66.94.104.241`
- [ ] **Certificado SSL**: Let's Encrypt instalado e configurado
- [ ] **Connectividade**: SSH, HTTP, HTTPS funcionais

## 🔐 Segurança e Firewall

### UFW Configuration
```bash
# Configurar firewall
- [ ] sudo ufw allow 22/tcp    # SSH (obrigatório)
- [ ] sudo ufw allow 80/tcp    # HTTP (redirect HTTPS)
- [ ] sudo ufw allow 443/tcp   # HTTPS (interface web)
- [ ] sudo ufw allow 1935/tcp  # RTMP (ingestão câmeras)
- [ ] sudo ufw allow 554/tcp   # RTSP (streaming clientes)
- [ ] sudo ufw --force enable
- [ ] sudo ufw status verbose  # Verificar configuração
```

### SSL/TLS Certificates
```bash
# Let's Encrypt
- [ ] sudo snap install --classic certbot
- [ ] sudo certbot --nginx -d nuvem.safecameras.com.br
- [ ] sudo systemctl enable certbot.timer  # Auto-renovação
```

## 📦 Arquivos de Deploy

### Estrutura no Servidor
```bash
# Criar estrutura de diretórios
- [ ] sudo mkdir -p /var/www/newcam/{backend,frontend,worker,storage,logs}
- [ ] sudo mkdir -p /var/www/newcam/storage/{recordings,thumbnails,temp}
- [ ] sudo mkdir -p /var/log/newcam
- [ ] sudo mkdir -p /var/backups/newcam
- [ ] sudo chown -R www-data:www-data /var/www/newcam
- [ ] sudo chmod -R 755 /var/www/newcam
```

### Arquivos Essenciais
- [ ] `.env.production` → `/var/www/newcam/.env`
- [ ] `docker-compose.prod.yml` → `/var/www/newcam/docker-compose.yml`
- [ ] `ecosystem.config.js` → `/var/www/newcam/ecosystem.config.js`
- [ ] `frontend/dist/` → `/var/www/newcam/frontend/dist/`
- [ ] `backend/` → `/var/www/newcam/backend/`
- [ ] `worker/` → `/var/www/newcam/worker/`

## 🎯 Deploy Automatizado

### Executar Deploy Script
```bash
# No diretório local do projeto
- [ ] chmod +x deploy-production.sh
- [ ] ./deploy-production.sh
```

### Verificar Outputs
- [ ] **Build local** concluído sem erros
- [ ] **SSH connection** estabelecida com servidor
- [ ] **Backup criado** no servidor
- [ ] **Arquivos sincronizados** via rsync
- [ ] **Dependencies instaladas** (backend + worker)
- [ ] **PM2 configurado** e services started
- [ ] **Docker containers** iniciados
- [ ] **Nginx configurado** e recarregado

## 🐳 Docker Services

### Container Status
```bash
# No servidor, verificar containers
- [ ] docker-compose ps
```

#### Containers Esperados:
- [ ] **newcam-redis-prod** - Status: Up (porta 6379)
- [ ] **newcam-zlmediakit-prod** - Status: Up (portas 554, 1935, 8000)
- [ ] **newcam-nginx-prod** - Status: Up (portas 80, 443)
- [ ] **watchtower** - Status: Up (auto-updates)

### Docker Health Check
```bash
# Verificar logs dos containers
- [ ] docker logs newcam-redis-prod
- [ ] docker logs newcam-zlmediakit-prod
- [ ] docker logs newcam-nginx-prod
```

## 🚀 Services Node.js (PM2)

### PM2 Status
```bash
# Verificar status PM2
- [ ] pm2 status
```

#### Processes Esperados:
- [ ] **newcam-backend** - Status: online (porta 3002)
- [ ] **newcam-worker** - Status: online (porta 3003)

### PM2 Health Check
```bash
- [ ] pm2 logs newcam-backend
- [ ] pm2 logs newcam-worker  
- [ ] pm2 monit  # Dashboard de monitoramento
```

## 🌐 Web Services

### Nginx Configuration
```bash
# Verificar configuração Nginx
- [ ] sudo nginx -t
- [ ] sudo systemctl status nginx
- [ ] sudo systemctl reload nginx
```

### SSL Status
```bash
# Verificar certificados
- [ ] sudo certbot certificates
- [ ] openssl s_client -connect nuvem.safecameras.com.br:443 -servername nuvem.safecameras.com.br
```

## 🔍 Testes de Conectividade

### Endpoints Públicos
- [ ] **Interface Web**: https://nuvem.safecameras.com.br
  - Status esperado: 200 OK (React app carrega)
- [ ] **API Health**: https://nuvem.safecameras.com.br/api/health
  - Status esperado: 200 OK (JSON response)
- [ ] **WebSocket**: wss://nuvem.safecameras.com.br/ws
  - Status esperado: Connection established

### Endpoints Internos (servidor apenas)
```bash
# No servidor, testar endpoints internos
- [ ] curl -I http://localhost:3002/api/health
- [ ] curl -I http://localhost:3003/health
- [ ] curl -I http://localhost:8000/index/api/getServerConfig
- [ ] redis-cli ping
```

### Streaming Endpoints
- [ ] **RTMP Test**: `rtmp://nuvem.safecameras.com.br:1935/live/test`
- [ ] **RTSP Test**: `rtsp://nuvem.safecameras.com.br:554/live/test`
- [ ] **HLS Test**: `https://nuvem.safecameras.com.br/live/test.m3u8`

## 💾 Database & Storage

### Supabase Connection
```bash
# Testar conexão Supabase
- [ ] curl -H "apikey: [SUPABASE_ANON_KEY]" \
       "https://grkvfzuadctextnbpajb.supabase.co/rest/v1/cameras"
```

### Wasabi S3 Storage
```bash
# Testar credenciais S3 (no servidor)
- [ ] cd /var/www/newcam
- [ ] node -e "
import S3Service from './backend/src/services/S3Service.js';
S3Service.listFiles('recordings/', 1).then(r => 
  console.log('S3 OK:', r.files.length, 'files')
).catch(e => console.error('S3 Error:', e.message));"
```

### Redis Cache
```bash
# Testar Redis
- [ ] redis-cli ping
- [ ] redis-cli info replication
```

## 📊 Verificações de Portas

### Portas Públicas (Acessíveis da Internet)
```bash
# Verificar portas abertas
- [ ] nmap -p 80,443,554,1935 nuvem.safecameras.com.br
```

#### Resultados Esperados:
- [ ] **80/tcp** open (HTTP - redirect para HTTPS)
- [ ] **443/tcp** open (HTTPS - interface web)
- [ ] **554/tcp** open (RTSP streaming)
- [ ] **1935/tcp** open (RTMP ingest)

### Portas Internas (Localhost apenas)
```bash
# No servidor
- [ ] netstat -tlnp | grep -E ':(3002|3003|8000|6379) '
```

#### Resultados Esperados:
- [ ] **127.0.0.1:3002** - Backend API
- [ ] **127.0.0.1:3003** - Worker Service
- [ ] **127.0.0.1:8000** - ZLMediaKit HTTP
- [ ] **127.0.0.1:6379** - Redis Cache

## 🔧 Configurações de Produção

### Environment Variables
```bash
# Verificar variáveis essenciais no .env
- [ ] NODE_ENV=production
- [ ] PORT=3002
- [ ] SUPABASE_URL configurada
- [ ] WASABI credentials configuradas
- [ ] ZLM_SECRET configurado
- [ ] CORS_ORIGIN=https://nuvem.safecameras.com.br
```

### Log Configuration
```bash
# Verificar logs
- [ ] tail -f /var/log/newcam/application.log
- [ ] tail -f /var/log/newcam/error.log
- [ ] sudo tail -f /var/log/nginx/access.log
- [ ] sudo tail -f /var/log/nginx/error.log
```

## 🎬 Teste de Streaming

### Camera Integration Test
```bash
# Testar integração de câmera (no servidor)
- [ ] cd /var/www/newcam
- [ ] SUPABASE_URL=https://grkvfzuadctextnbpajb.supabase.co \
      SUPABASE_SERVICE_ROLE_KEY=[KEY] \
      node backend/src/scripts/createAdminUser.js
- [ ] ADMIN_EMAIL=admin@newcam.local \
      ADMIN_PASSWORD=admin123 \
      node backend/src/scripts/startCameraStreaming.js
```

### Stream Validation
- [ ] **Camera added** to database successfully
- [ ] **RTSP stream** activated in ZLMediaKit
- [ ] **HLS stream** available via web interface
- [ ] **Recording started** automatically
- [ ] **Upload queue** processing files to S3

## 📈 Monitoring & Alerts

### Health Monitoring
```bash
# Setup monitoramento contínuo
- [ ] pm2 install pm2-server-monit
- [ ] pm2 set pm2-server-monit:secret [SECRET_KEY]
- [ ] pm2 set pm2-server-monit:public [PUBLIC_KEY]
```

### Log Rotation
```bash
# Configurar logrotate
- [ ] sudo cat > /etc/logrotate.d/newcam << 'EOF'
/var/log/newcam/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 www-data www-data
    postrotate
        pm2 reload all
    endscript
}
EOF
```

## 🗂️ Backup & Recovery

### Automated Backups
```bash
# Configurar backup automático
- [ ] sudo crontab -e
# Adicionar: 0 2 * * * /var/www/newcam/scripts/backup.sh
```

### Rollback Preparedness
- [ ] **rollback-production.sh** copiado para servidor
- [ ] **Permissões executáveis** configuradas: `chmod +x rollback-production.sh`
- [ ] **Backup inicial** criado antes do deploy
- [ ] **Teste de rollback** validado (opcional)

## 🎯 Testes Finais End-to-End

### Interface Web
- [ ] **Login funcionando** com credentials de admin
- [ ] **Dashboard carregando** métricas corretamente
- [ ] **Cameras page** exibe lista de câmeras
- [ ] **Archive page** lista gravações
- [ ] **User management** funcional (admin only)

### API Endpoints
- [ ] `GET /api/health` retorna status OK
- [ ] `GET /api/cameras` lista câmeras
- [ ] `GET /api/recordings` lista gravações
- [ ] `POST /api/auth/login` autentica usuários
- [ ] `WebSocket /ws` estabelece conexão

### Recording System
- [ ] **Gravações automáticas** iniciando quando streams ficam online
- [ ] **Upload S3** processando arquivos via queue
- [ ] **Local cleanup** removendo arquivos após upload
- [ ] **Playback** funcionando (local + S3 fallback)
- [ ] **Thumbnails** sendo gerados automaticamente

## ✅ Deploy Completo

### Checklist Final
- [ ] **Todos os containers** rodando corretamente
- [ ] **Todos os serviços PM2** online
- [ ] **Nginx** serving web interface
- [ ] **SSL** funcionando corretamente
- [ ] **Firewall** configurado adequadamente
- [ ] **Logs** sendo escritos corretamente
- [ ] **Backup** configurado
- [ ] **Monitoramento** ativo
- [ ] **Interface web** acessível publicamente
- [ ] **API endpoints** respondendo
- [ ] **Streaming** funcional
- [ ] **Recording system** operacional

## 🚨 Contatos de Emergência

### Em caso de problemas
- **Rollback**: `./rollback-production.sh emergency`
- **Logs**: `pm2 logs` ou `docker-compose logs`
- **Status**: `pm2 status` e `docker-compose ps`
- **Admin**: gouveiarx@gmail.com

### URLs Importantes
- **Interface**: https://nuvem.safecameras.com.br
- **API Health**: https://nuvem.safecameras.com.br/api/health
- **PM2 Web**: http://app.pm2.io (se configurado)
- **Server SSH**: `ssh root@66.94.104.241`

---
**✅ CHECKLIST CONCLUÍDO - SISTEMA PRONTO PARA PRODUÇÃO**
*Última atualização: Janeiro 2025*