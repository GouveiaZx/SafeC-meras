# 🚀 NewCAM Production Deployment Guide

## Servidor de Produção
- **Domínio**: nuvem.safecameras.com.br
- **IP**: 66.94.104.241  
- **Usuário**: root
- **Senha**: 98675423

---

## 📋 Pré-requisitos

### 1. Ambiente Local
```bash
# Instalar dependências de deploy
npm install -g sshpass rsync

# Verificar conectividade
ping 66.94.104.241
```

### 2. Servidor de Produção
- Ubuntu 20.04+ ou Debian 11+
- Acesso root via SSH
- Domínio configurado apontando para o IP
- Porta 22 (SSH) aberta

---

## 🎯 Deploy Automatizado (Recomendado)

### Opção 1: Deploy Completo (Novo Servidor)
```bash
# 1. Limpar projeto para produção
chmod +x scripts/cleanup-for-production.sh
./scripts/cleanup-for-production.sh

# 2. Executar deploy completo
chmod +x scripts/deploy-production-complete.sh
./scripts/deploy-production-complete.sh
```

### Opção 2: Deploy Simples (Servidor Já Configurado)
```bash
# Deploy usando script original
chmod +x scripts/deploy-production.sh
./scripts/deploy-production.sh
```

---

## 🔧 Deploy Manual (Passo a Passo)

### Etapa 1: Preparação Local
```bash
# Limpar arquivos desnecessários
rm -rf node_modules backend/node_modules frontend/node_modules worker/node_modules
rm -rf storage/logs backend/storage/logs
find . -name "*.log" -delete

# Configurar ambientes
cp .env.production .env
cp backend/.env.production backend/.env
cp frontend/.env.production frontend/.env
cp worker/.env.production worker/.env

# Build do frontend
cd frontend
npm ci --production
npm run build
cd ..
```

### Etapa 2: Transferir Arquivos
```bash
# Usando rsync (recomendado)
sshpass -p "98675423" rsync -avz --progress \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '*.log' \
  --exclude 'storage/www/record' \
  ./ root@66.94.104.241:/var/www/newcam/

# Ou usando SCP
scp -r . root@66.94.104.241:/var/www/newcam/
```

### Etapa 3: Configurar Servidor
```bash
# Conectar ao servidor
ssh root@66.94.104.241

# Atualizar sistema
apt update && apt upgrade -y

# Instalar dependências
apt install -y nginx nodejs npm postgresql redis-server docker.io docker-compose
npm install -g pm2

# Configurar diretórios
mkdir -p /var/www/newcam
mkdir -p /var/log/newcam
mkdir -p /var/backups/newcam
chown -R www-data:www-data /var/www/newcam/storage
```

### Etapa 4: Configurar Nginx
```bash
# Copiar configuração
cp /var/www/newcam/nginx.production.conf /etc/nginx/sites-available/newcam
ln -sf /etc/nginx/sites-available/newcam /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Testar configuração
nginx -t
```

### Etapa 5: SSL com Let's Encrypt
```bash
# Instalar certbot
apt install -y certbot python3-certbot-nginx

# Obter certificado
certbot certonly --webroot -w /var/www/html \
  -d nuvem.safecameras.com.br \
  --non-interactive --agree-tos \
  --email admin@safecameras.com.br

# Configurar renovação automática
echo '0 12 * * * /usr/bin/certbot renew --quiet' | crontab -
```

### Etapa 6: Iniciar Serviços
```bash
cd /var/www/newcam

# Instalar dependências
cd backend && npm ci --production && cd ..
cd worker && npm ci --production && cd ..

# Iniciar containers Docker
docker-compose up -d

# Iniciar aplicação com PM2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup

# Reiniciar Nginx
systemctl restart nginx
```

---

## 🔥 Firewall e Segurança

### Configurar UFW
```bash
# Instalar e configurar firewall
apt install -y ufw
ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# Permitir portas necessárias
ufw allow 22/tcp      # SSH
ufw allow 80/tcp      # HTTP
ufw allow 443/tcp     # HTTPS
ufw allow 1935/tcp    # RTMP
ufw allow 554/tcp     # RTSP

# Ativar firewall
ufw --force enable
ufw status
```

### Configurar Fail2Ban (Opcional)
```bash
apt install -y fail2ban
systemctl enable fail2ban
systemctl start fail2ban
```

---

## 📊 Verificações Pós-Deploy

### 1. Testar Serviços
```bash
# Health check do backend
curl http://localhost:3002/health

# Testar frontend
curl http://localhost:80

# Testar HTTPS
curl -k https://localhost:443

# Status dos processos
pm2 status
docker-compose ps
systemctl status nginx
```

### 2. Testar URLs Públicas
- https://nuvem.safecameras.com.br
- https://nuvem.safecameras.com.br/api/health
- https://nuvem.safecameras.com.br/health

### 3. Verificar Logs
```bash
# Logs da aplicação
tail -f /var/log/newcam/backend.log
tail -f /var/log/newcam/worker.log

# Logs do Nginx
tail -f /var/log/nginx/newcam_error.log

# Logs do PM2
pm2 logs
```

---

## 🔄 Comandos de Manutenção

### PM2
```bash
pm2 status              # Status dos processos
pm2 restart all         # Reiniciar todos os processos
pm2 stop all           # Parar todos os processos
pm2 logs               # Ver logs em tempo real
pm2 monit              # Monitor de recursos
pm2 reload all         # Reload sem downtime
```

### Docker
```bash
docker-compose ps      # Status dos containers
docker-compose logs    # Logs dos containers
docker-compose restart # Reiniciar containers
docker-compose down && docker-compose up -d  # Reiniciar completo
```

### Nginx
```bash
nginx -t               # Testar configuração
systemctl reload nginx # Recarregar configuração
systemctl restart nginx # Reiniciar serviço
systemctl status nginx  # Status do serviço
```

### Certificados SSL
```bash
certbot certificates   # Listar certificados
certbot renew --dry-run # Testar renovação
certbot renew          # Renovar certificados
```

---

## 🚨 Troubleshooting

### Problemas Comuns

#### 1. Backend não responde
```bash
# Verificar status
pm2 status
pm2 logs newcam-backend

# Reiniciar backend
pm2 restart newcam-backend
```

#### 2. Frontend não carrega
```bash
# Verificar Nginx
nginx -t
systemctl status nginx

# Verificar build do frontend
ls -la /var/www/newcam/frontend/dist/

# Recriar build
cd /var/www/newcam/frontend
npm run build
```

#### 3. SSL não funciona
```bash
# Verificar certificados
certbot certificates

# Renovar certificados
certbot renew

# Verificar configuração Nginx
nginx -t
```

#### 4. Containers Docker não iniciam
```bash
# Verificar status
docker-compose ps

# Ver logs
docker-compose logs

# Reiniciar
docker-compose down
docker-compose up -d
```

#### 5. Erro de permissões
```bash
# Corrigir permissões
chown -R www-data:www-data /var/www/newcam/storage
chown -R root:root /var/www/newcam
chmod -R 755 /var/www/newcam
chmod -R 775 /var/www/newcam/storage
```

### Logs Importantes
- `/var/log/newcam/backend.log` - Logs do backend
- `/var/log/newcam/worker.log` - Logs do worker
- `/var/log/nginx/newcam_error.log` - Logs de erro do Nginx
- `/var/log/nginx/newcam_access.log` - Logs de acesso do Nginx
- `pm2 logs` - Logs dos processos PM2

---

## 🔄 Atualizações

### Deploy de Atualizações
```bash
# No servidor de produção
cd /var/www/newcam

# Fazer backup
tar -czf /var/backups/newcam/backup-$(date +%Y%m%d-%H%M%S).tar.gz .

# Atualizar código (git pull ou rsync)
git pull origin main  # ou transferir arquivos atualizados

# Instalar novas dependências
cd backend && npm ci --production && cd ..
cd worker && npm ci --production && cd ..

# Rebuild frontend se necessário
cd frontend && npm ci && npm run build && cd ..

# Reiniciar serviços
pm2 reload all
```

### Rollback (se necessário)
```bash
# Parar aplicação
pm2 stop all

# Restaurar backup
cd /var/www/newcam
rm -rf ./*
tar -xzf /var/backups/newcam/backup-YYYYMMDD-HHMMSS.tar.gz

# Reiniciar aplicação
pm2 start ecosystem.config.js --env production
```

---

## 📈 Monitoramento

### Ferramentas Recomendadas
- **PM2 Monitoring**: `pm2 monit`
- **htop**: Para monitorar recursos do sistema
- **df -h**: Para monitorar espaço em disco
- **free -h**: Para monitorar memória

### Alertas Automáticos
Configure alertas para:
- CPU > 80%
- Memória > 85%
- Disco > 90%
- Processos offline
- Certificado SSL expirando

---

## 📞 Suporte

### Credenciais de Acesso
- **URL**: https://nuvem.safecameras.com.br
- **Admin**: gouveiarx@gmail.com
- **Senha**: Teste123

### Contatos
- **Email**: admin@safecameras.com.br
- **Servidor**: root@66.94.104.241

### Backup e Recuperação
- Backups automáticos em `/var/backups/newcam/`
- Retenção: 30 dias
- Backup diário às 02:00

---

## ✅ Checklist de Deploy

### Antes do Deploy
- [ ] Código testado em desenvolvimento
- [ ] Build do frontend funcionando
- [ ] Configurações de produção verificadas
- [ ] Backup do servidor atual (se aplicável)

### Durante o Deploy
- [ ] Arquivos transferidos com sucesso
- [ ] Dependências instaladas
- [ ] Serviços Docker iniciados
- [ ] PM2 processos rodando
- [ ] Nginx configurado e funcionando
- [ ] SSL certificado ativo

### Após o Deploy  
- [ ] URLs públicas acessíveis
- [ ] Health checks passando
- [ ] Logs sem erros críticos
- [ ] Monitoramento ativo
- [ ] Backup pós-deploy criado

---

**🎉 Deploy concluído com sucesso! NewCAM está rodando em produção em https://nuvem.safecameras.com.br**