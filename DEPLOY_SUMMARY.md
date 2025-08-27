# 🚀 NewCAM - Sistema de Deploy Completo

## ✅ Arquivos Criados/Atualizados

### 📜 Scripts de Deploy
1. **`scripts/deploy-production-complete.sh`** - Script principal de deploy automatizado
2. **`scripts/cleanup-for-production.sh`** - Script de limpeza para produção  
3. **`scripts/deploy-production.sh`** - Script original atualizado

### ⚙️ Configurações de Produção
1. **`.env.production`** - Ambiente raiz otimizado
2. **`backend/.env.production`** - Backend com paths corretos
3. **`frontend/.env.production`** - Frontend já configurado
4. **`worker/.env.production`** - Worker service configurado
5. **`nginx.production.conf`** - Nginx com SSL Let's Encrypt
6. **`ecosystem.config.js`** - PM2 já otimizado

### 📚 Documentação
1. **`docs/PRODUCTION_DEPLOYMENT_GUIDE.md`** - Guia completo de deploy

---

## 🎯 Como Fazer o Deploy

### Opção 1: Deploy Automatizado (Recomendado)
```bash
# 1. Limpar projeto
./scripts/cleanup-for-production.sh

# 2. Deploy completo
./scripts/deploy-production-complete.sh
```

### Opção 2: Deploy Manual
1. Siga o guia em `docs/PRODUCTION_DEPLOYMENT_GUIDE.md`
2. Execute os scripts individualmente

---

## 🔧 Configurações do Servidor

### Informações de Acesso
- **Domínio**: nuvem.safecameras.com.br
- **IP**: 66.94.104.241
- **Usuário**: root  
- **Senha**: 98675423

### Portas Configuradas
- **80**: HTTP (redireciona para HTTPS)
- **443**: HTTPS (frontend + API)
- **3002**: Backend (interno)
- **3001**: Worker (interno)
- **8000**: ZLMediaKit (interno)
- **1935**: RTMP streaming
- **554**: RTSP streaming

### Serviços Incluídos
- ✅ **Nginx** com SSL automático (Let's Encrypt)
- ✅ **PM2** para gerenciamento de processos
- ✅ **Docker** para ZLMediaKit, Redis, SRS
- ✅ **Firewall UFW** configurado
- ✅ **Monitoramento** e health checks
- ✅ **Backup automático** diário

---

## 🔒 Recursos de Segurança

### SSL/TLS
- Certificados Let's Encrypt automáticos
- Renovação automática configurada
- Headers de segurança otimizados
- Redirecionamento HTTP → HTTPS

### Firewall
- UFW configurado com regras mínimas
- Apenas portas necessárias abertas
- Proteção contra ataques comuns

### Rate Limiting
- API: 10 req/s, burst 20
- Auth: 5 req/s, burst 5
- Proteção contra DDoS

---

## 🧹 Limpeza Automática

O sistema remove automaticamente:
- ❌ **600MB+** de node_modules
- ❌ **91MB** de mídia de teste  
- ❌ **10-50MB** de logs de desenvolvimento
- ❌ Arquivos .git, documentação desnecessária
- ❌ Cache, arquivos temporários, backups

**Total economizado: ~700MB**

---

## 📊 Monitoramento Incluído

### Logs Estruturados
- `/var/log/newcam/backend.log`
- `/var/log/newcam/worker.log`
- `/var/log/nginx/newcam_*.log`

### Health Checks
- Backend: `https://nuvem.safecameras.com.br/api/health`
- Frontend: `https://nuvem.safecameras.com.br/health`
- Containers: `docker-compose ps`
- Processos: `pm2 status`

### Métricas
- CPU, memória, disco
- Upload S3 statistics
- Camera status monitoring
- Stream health checks

---

## 🔄 Comandos Úteis

### Deploy e Atualizações
```bash
# Deploy completo
./scripts/deploy-production-complete.sh

# Apenas limpeza
./scripts/cleanup-for-production.sh

# Deploy simples (servidor já configurado)
./scripts/deploy-production.sh
```

### Manutenção no Servidor
```bash
# Status geral
pm2 status
docker-compose ps
systemctl status nginx

# Logs em tempo real
pm2 logs
tail -f /var/log/newcam/backend.log

# Reiniciar serviços
pm2 restart all
docker-compose restart
systemctl restart nginx

# Renovar SSL
certbot renew
```

---

## 🎉 Resultado Final

Após executar o deploy, você terá:

### ✅ **Aplicação Funcionando**
- **URL**: https://nuvem.safecameras.com.br
- **Admin**: gouveiarx@gmail.com / Teste123
- **API**: https://nuvem.safecameras.com.br/api/health

### ✅ **Ambiente Otimizado**
- Produção com SSL automático
- Monitoramento completo
- Backups configurados
- Performance otimizada

### ✅ **Manutenção Simplificada**
- Comandos padronizados
- Logs centralizados
- Health checks automáticos
- Rollback facilitado

---

## 📞 Suporte

### Em Caso de Problemas
1. Consulte `docs/PRODUCTION_DEPLOYMENT_GUIDE.md`
2. Verifique logs: `pm2 logs`
3. Status dos serviços: `pm2 status`
4. Health checks das URLs públicas

### Rollback de Emergência
```bash
# No servidor
pm2 stop all
cd /var/www/newcam
tar -xzf /var/backups/newcam/backup-*.tar.gz
pm2 start ecosystem.config.js --env production
```

---

**🚀 NewCAM está pronto para produção! Execute `./scripts/deploy-production-complete.sh` para começar.**