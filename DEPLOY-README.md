# Deploy NewCAM para Produção

## Informações do Servidor
- **Domínio**: nuvem.safecameras.com.br
- **IP**: 66.94.104.241
- **Usuário**: root
- **Senha**: 98675423

## Arquivos de Configuração Criados

### Arquivos de Ambiente (.env)
- `frontend/.env.production` - Configurações do frontend para produção
- `backend/.env.production` - Configurações do backend para produção
- `worker/.env.production` - Configurações do worker para produção
- `frontend/src/config/streaming.production.json` - Configurações de streaming para produção

### Scripts de Deploy
- `deploy-production.sh` - Script principal de preparação para deploy
- `install-on-server.sh` - Script para executar no servidor
- `nginx.conf` - Configuração do Nginx
- `newcam-backend.service` - Serviço systemd para o backend
- `newcam-worker.service` - Serviço systemd para o worker

## Principais Alterações para Produção

### URLs Alteradas
- `localhost` → `nuvem.safecameras.com.br`
- HTTP → HTTPS (exceto serviços internos)
- WebSocket: `ws://` → `wss://`

### Configurações Otimizadas
- Qualidade de streaming: 720p → 1080p
- Streams concorrentes: 10 → 50
- Cache TTL: 300s → 600s
- Rate limiting: 100 → 200 req/min
- Logs: debug → info
- Retenção de backup: 7 → 30 dias

## Passo a Passo do Deploy

### 1. Preparar Arquivos Localmente
```bash
# Executar o script de preparação
bash deploy-production.sh
```

### 2. Enviar Arquivos para o Servidor
```bash
# Usando rsync (recomendado)
rsync -avz --exclude node_modules --exclude .git . root@66.94.104.241:/tmp/newcam/

# Ou usando SCP
scp -r . root@66.94.104.241:/tmp/newcam/
```

### 3. Conectar ao Servidor
```bash
ssh root@66.94.104.241
# Senha: 98675423
```

### 4. Executar Instalação no Servidor
```bash
cd /tmp/newcam
bash install-on-server.sh
```

### 5. Configurar SSL/TLS (Recomendado)
```bash
# Instalar Certbot
sudo apt install certbot python3-certbot-nginx

# Obter certificado SSL
sudo certbot --nginx -d nuvem.safecameras.com.br

# Renovação automática
sudo crontab -e
# Adicionar: 0 12 * * * /usr/bin/certbot renew --quiet
```

### 6. Configurar Firewall
```bash
# Configurar UFW
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 1935/tcp  # RTMP
sudo ufw --force enable
```

## Portas Utilizadas

| Porta | Serviço | Acesso |
|-------|---------|--------|
| 80 | HTTP (Nginx) | Público |
| 443 | HTTPS (Nginx) | Público |
| 1935 | RTMP (Streaming) | Público |
| 3002 | Backend API | Interno |
| 8000 | ZLMediaKit | Interno |
| 5432 | PostgreSQL | Interno |
| 6379 | Redis | Interno |

## Comandos Úteis no Servidor

### Gerenciar Serviços com PM2
```bash
# Ver status dos serviços
pm2 status

# Ver logs
pm2 logs newcam-backend
pm2 logs newcam-worker

# Reiniciar serviços
pm2 restart newcam-backend
pm2 restart newcam-worker

# Parar serviços
pm2 stop newcam-backend
pm2 stop newcam-worker
```

### Gerenciar Nginx
```bash
# Testar configuração
sudo nginx -t

# Recarregar configuração
sudo systemctl reload nginx

# Ver logs
sudo tail -f /var/log/nginx/newcam_access.log
sudo tail -f /var/log/nginx/newcam_error.log
```

### Banco de Dados
```bash
# Conectar ao PostgreSQL
sudo -u postgres psql newcam

# Backup do banco
pg_dump -U newcam -h localhost newcam > backup.sql

# Restaurar backup
psql -U newcam -h localhost newcam < backup.sql
```

## Monitoramento

### Logs da Aplicação
```bash
# Backend
tail -f /var/www/newcam/backend/logs/app.log

# PM2 logs
pm2 logs

# System logs
sudo journalctl -u newcam-backend -f
sudo journalctl -u newcam-worker -f
```

### Verificar Status dos Serviços
```bash
# PM2
pm2 status

# Nginx
sudo systemctl status nginx

# PostgreSQL
sudo systemctl status postgresql

# Redis
sudo systemctl status redis-server
```

## Troubleshooting

### Problemas Comuns

1. **Erro 502 Bad Gateway**
   - Verificar se o backend está rodando: `pm2 status`
   - Verificar logs: `pm2 logs newcam-backend`

2. **Streaming não funciona**
   - Verificar se ZLMediaKit está rodando na porta 8000
   - Verificar configurações de firewall
   - Verificar logs do backend

3. **Banco de dados não conecta**
   - Verificar se PostgreSQL está rodando: `sudo systemctl status postgresql`
   - Verificar credenciais no arquivo .env
   - Verificar se o banco 'newcam' existe

4. **Redis não conecta**
   - Verificar se Redis está rodando: `sudo systemctl status redis-server`
   - Verificar configurações no arquivo .env

### Comandos de Diagnóstico
```bash
# Verificar portas em uso
sudo netstat -tlnp

# Verificar processos
ps aux | grep node

# Verificar espaço em disco
df -h

# Verificar memória
free -h

# Verificar CPU
top
```

## Backup e Manutenção

### Backup Automático
```bash
# Criar script de backup
sudo crontab -e

# Adicionar backup diário às 2:00 AM
0 2 * * * /var/www/newcam/scripts/backup.sh
```

### Atualizações
```bash
# Atualizar dependências
cd /var/www/newcam/backend
npm update

cd /var/www/newcam/worker
npm update

# Reiniciar serviços
pm2 restart all
```

## Contatos e Suporte

- **Servidor**: nuvem.safecameras.com.br
- **Acesso SSH**: ssh root@66.94.104.241
- **Senha**: 98675423

---

**Nota**: Lembre-se de alterar as senhas padrão e configurar autenticação por chave SSH para maior segurança.