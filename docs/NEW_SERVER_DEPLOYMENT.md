# 🚀 Guia de Deploy - Novo Servidor NewCAM

**Servidor Novo**: 186.233.4.8
**Data de Migração**: Janeiro 2025
**Versão**: NewCAM v2.0 (Docker)

## 📋 Índice

1. [Especificações do Servidor](#especificações-do-servidor)
2. [Pré-requisitos](#pré-requisitos)
3. [Checklist Pré-Deploy](#checklist-pré-deploy)
4. [Procedimento de Deploy](#procedimento-de-deploy)
5. [Migração de Dados](#migração-de-dados)
6. [Verificação Pós-Deploy](#verificação-pós-deploy)
7. [Rollback](#rollback)
8. [Troubleshooting](#troubleshooting)

---

## 🖥️ Especificações do Servidor

### Informações de Acesso
- **IP Público**: 186.233.4.8
- **Usuário Root**: root (senha: @safecameras2025)
- **Usuário Suporte**: suporte (senha: @suporte2025)
- **Sistema Operacional**: Ubuntu 20.04+ / Debian 11+

### Requisitos Mínimos
- **CPU**: 4 cores (recomendado: 8 cores)
- **RAM**: 8GB (recomendado: 16GB)
- **Disco**: 100GB SSD (recomendado: 500GB+ para gravações)
- **Rede**: 100Mbps uplink (recomendado: 1Gbps)

### Portas Necessárias
- **80**: HTTP (Nginx)
- **443**: HTTPS (Nginx - futuro)
- **3002**: Backend API
- **8000**: ZLMediaKit HTTP API
- **554**: RTSP
- **1935**: RTMP
- **1985**: SRS API
- **6379**: Redis (interno)
- **5432**: PostgreSQL (se local)

---

## ✅ Pré-requisitos

### Softwares Necessários no Servidor

```bash
# Conectar ao servidor
ssh root@186.233.4.8

# Atualizar sistema
apt update && apt upgrade -y

# Instalar dependências base
apt install -y \
  git \
  curl \
  wget \
  build-essential \
  software-properties-common \
  apt-transport-https \
  ca-certificates \
  gnupg \
  lsb-release

# Instalar Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Verificar versões
node --version  # deve ser >= v18.0.0
npm --version   # deve ser >= 8.0.0

# Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
systemctl enable docker
systemctl start docker

# Instalar Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Verificar Docker
docker --version          # deve ser >= 20.10.0
docker-compose --version  # deve ser >= 2.0.0

# Instalar PM2 globalmente
npm install -g pm2

# Verificar PM2
pm2 --version
```

### Configuração do Firewall

```bash
# UFW (Ubuntu)
ufw allow 22/tcp     # SSH
ufw allow 80/tcp     # HTTP
ufw allow 443/tcp    # HTTPS
ufw allow 3002/tcp   # Backend
ufw allow 8000/tcp   # ZLMediaKit
ufw allow 554/tcp    # RTSP
ufw allow 1935/tcp   # RTMP
ufw allow 1985/tcp   # SRS
ufw enable
ufw status

# OU iptables (alternativa)
iptables -A INPUT -p tcp --dport 22 -j ACCEPT
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j ACCEPT
iptables -A INPUT -p tcp --dport 3002 -j ACCEPT
iptables -A INPUT -p tcp --dport 8000 -j ACCEPT
iptables -A INPUT -p tcp --dport 554 -j ACCEPT
iptables -A INPUT -p tcp --dport 1935 -j ACCEPT
iptables -A INPUT -p tcp --dport 1985 -j ACCEPT
iptables-save > /etc/iptables/rules.v4
```

---

## 📝 Checklist Pré-Deploy

### 1. Preparação Local

- [ ] Código atualizado no branch `main`
- [ ] Testes executando 100% (132/132 tests passing)
- [ ] Dependências atualizadas (`npm audit fix`)
- [ ] Build do frontend gerado localmente
- [ ] Arquivos `.env.production` preparados
- [ ] Backup dos dados antigos (se aplicável)
- [ ] Git commit e push de todas as mudanças

### 2. Servidor Remoto

- [ ] Acesso SSH funcionando
- [ ] Softwares instalados (Node, Docker, PM2)
- [ ] Portas abertas no firewall
- [ ] Espaço em disco suficiente (`df -h`)
- [ ] Estrutura de diretórios criada

### 3. Serviços Externos

- [ ] Supabase acessível (https://grkvfzuadctextnbpajb.supabase.co)
- [ ] Wasabi S3 configurado
- [ ] Credenciais validadas
- [ ] DNS configurado (se usar domínio)

---

## 🚀 Procedimento de Deploy

### Fase 1: Preparação do Servidor

```bash
# 1. Conectar como root
ssh root@186.233.4.8

# 2. Criar estrutura de diretórios
mkdir -p /root/NewCAM
mkdir -p /root/NewCAM/storage/logs
mkdir -p /root/NewCAM/storage/www/record/live
mkdir -p /root/NewCAM/backups
mkdir -p /root/NewCAM/scripts

# 3. Configurar permissões
chmod -R 755 /root/NewCAM
chown -R root:root /root/NewCAM

# 4. Verificar espaço em disco
df -h /root/NewCAM
```

### Fase 2: Clone do Repositório

```bash
# Opção A: Clone do repositório Git
cd /root
git clone https://github.com/seu-usuario/NewCAM.git
cd NewCAM
git checkout main

# Opção B: Upload via SCP (do computador local)
# Local: scp -r ./NewCAM root@186.233.4.8:/root/

# Verificar arquivos
ls -la
```

### Fase 3: Configuração de Environment

```bash
cd /root/NewCAM

# Backend .env
cat > backend/.env << 'EOF'
# Database - Supabase
SUPABASE_URL=https://grkvfzuadctextnbpajb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzIyNDIzOCwiZXhwIjoyMDY4ODAwMjM4fQ.XJoPu5InA_s3pfryZfSChBqZnu7zBV3vwH7ZM4jf04M

# ZLMediaKit
ZLM_SECRET=9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK
ZLM_API_URL=http://localhost:8000/index/api
ZLM_BASE_URL=http://186.233.4.8:8000

# URLs
BACKEND_URL=http://186.233.4.8
FRONTEND_URL=http://186.233.4.8

# Environment
NODE_ENV=production
PORT=3002
WORKER_TOKEN=newcam-worker-token-2025-secure

# Rate Limiting (Production)
RATE_LIMIT_MAX=100

# Wasabi S3
WASABI_ACCESS_KEY=8WBR4YFE79UA94TBIEST
WASABI_SECRET_KEY=A9hNRDUEzcyhUtzp0SAE51IgKcJtsP1b7knZNe5W
WASABI_BUCKET=safe-cameras-03
WASABI_ENDPOINT=https://s3.wasabisys.com

# S3 Upload Configuration
S3_UPLOAD_ENABLED=true
S3_UPLOAD_CONCURRENCY=2
PREFER_S3_STREAMING=true
DELETE_LOCAL_AFTER_UPLOAD=false
EOF

# Frontend .env.production
cat > frontend/.env.production << 'EOF'
VITE_API_URL=http://186.233.4.8/api
VITE_WS_URL=ws://186.233.4.8
VITE_ZLM_BASE_URL=http://186.233.4.8:8000
VITE_BACKEND_URL=http://186.233.4.8
VITE_FRONTEND_URL=http://186.233.4.8
VITE_NODE_ENV=production

VITE_SUPABASE_URL=https://grkvfzuadctextnbpajb.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyMjQyMzgsImV4cCI6MjA2ODgwMDIzOH0.Simv8hH8aE9adQiTf6t1BZIcMPniNh9ecpjxEeki4mE
EOF

# Worker .env
cat > worker/.env << 'EOF'
NODE_ENV=production
WORKER_TOKEN=newcam-worker-token-2025-secure
BACKEND_URL=http://localhost:3002

SUPABASE_URL=https://grkvfzuadctextnbpajb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzIyNDIzOCwiZXhwIjoyMDY4ODAwMjM4fQ.XJoPu5InA_s3pfryZfSChBqZnu7zBV3vwH7ZM4jf04M

WASABI_ACCESS_KEY=8WBR4YFE79UA94TBIEST
WASABI_SECRET_KEY=A9hNRDUEzcyhUtzp0SAE51IgKcJtsP1b7knZNe5W
WASABI_BUCKET=safe-cameras-03
WASABI_ENDPOINT=https://s3.wasabisys.com
EOF

# Verificar arquivos criados
ls -la backend/.env
ls -la frontend/.env.production
ls -la worker/.env
```

### Fase 4: Instalação de Dependências

```bash
cd /root/NewCAM

# Instalar dependências raiz
npm install

# Instalar dependências do backend
cd backend
npm install
cd ..

# Instalar dependências do worker
cd worker
npm install
cd ..

# Instalar dependências do frontend (para build)
cd frontend
npm install
cd ..

# Verificar instalações
echo "✅ Dependências instaladas"
```

### Fase 5: Build do Frontend

```bash
cd /root/NewCAM/frontend

# Build de produção
npm run build

# Verificar build
ls -lh dist/
du -sh dist/

# Deve aparecer:
# - dist/index.html
# - dist/assets/ (JS e CSS compilados)

cd ..
```

### Fase 6: Iniciar Containers Docker

```bash
cd /root/NewCAM

# Verificar docker-compose.yml
cat docker-compose.yml

# Iniciar containers
docker-compose up -d

# Aguardar inicialização (30-60 segundos)
sleep 30

# Verificar status
docker ps

# Deve mostrar:
# - newcam-zlmediakit
# - newcam-redis
# - newcam-nginx (se configurado)

# Verificar logs
docker-compose logs --tail=50

# Logs individuais
docker logs newcam-zlmediakit --tail=20
docker logs newcam-redis --tail=20
```

### Fase 7: Iniciar Backend e Worker com PM2

```bash
cd /root/NewCAM

# Verificar ecosystem.config.js
cat ecosystem.config.js

# Iniciar aplicação com PM2
pm2 start ecosystem.config.js

# Verificar processos
pm2 list

# Deve mostrar:
# - newcam-backend (port 3002)
# - newcam-worker

# Verificar logs
pm2 logs --lines 20

# Salvar configuração PM2
pm2 save

# Configurar PM2 para iniciar no boot
pm2 startup
# Executar o comando que PM2 mostrar

# Verificar status
pm2 status
```

### Fase 8: Configurar Nginx (se necessário)

```bash
# Se não estiver usando container nginx, configurar manualmente

cat > /etc/nginx/sites-available/newcam << 'EOF'
server {
    listen 80;
    server_name 186.233.4.8;

    # Frontend estático
    location / {
        root /root/NewCAM/frontend/dist;
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache";
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket
    location /socket.io {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }

    # ZLMediaKit
    location /zlm/ {
        proxy_pass http://localhost:8000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
EOF

# Ativar site
ln -s /etc/nginx/sites-available/newcam /etc/nginx/sites-enabled/

# Testar configuração
nginx -t

# Recarregar nginx
systemctl reload nginx
```

---

## 📦 Migração de Dados

### Do Servidor Antigo (66.94.104.241)

```bash
# No servidor ANTIGO (66.94.104.241)

# 1. Criar backup de gravações
cd /root/OldNewCAM
tar -czf /root/recordings-backup-$(date +%Y%m%d).tar.gz storage/www/record/

# 2. Criar backup de logs (opcional)
tar -czf /root/logs-backup-$(date +%Y%m%d).tar.gz storage/logs/

# 3. Exportar configurações
tar -czf /root/config-backup-$(date +%Y%m%d).tar.gz \
  backend/.env \
  frontend/.env.production \
  docker-compose.yml \
  ecosystem.config.js

# 4. Listar backups criados
ls -lh /root/*backup*.tar.gz
```

```bash
# No servidor NOVO (186.233.4.8)

# 1. Baixar backups do servidor antigo
scp root@66.94.104.241:/root/recordings-backup-*.tar.gz /root/backups/
scp root@66.94.104.241:/root/config-backup-*.tar.gz /root/backups/

# 2. Extrair gravações (se necessário)
cd /root/NewCAM
tar -xzf /root/backups/recordings-backup-*.tar.gz

# 3. Verificar integridade
ls -lR storage/www/record/ | wc -l
du -sh storage/www/record/
```

### Migração de Banco de Dados

O banco de dados já está no Supabase, então não é necessário migração. Apenas garantir que:

```bash
# Testar conexão com Supabase
cd /root/NewCAM/backend
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://grkvfzuadctextnbpajb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzIyNDIzOCwiZXhwIjoyMDY4ODAwMjM4fQ.XJoPu5InA_s3pfryZfSChBqZnu7zBV3vwH7ZM4jf04M'
);
supabase.from('cameras').select('count').then(console.log);
"
```

---

## ✅ Verificação Pós-Deploy

### 1. Testes de Conectividade

```bash
# Health checks
curl http://localhost:3002/health
curl http://186.233.4.8/api/health

# ZLMediaKit
curl http://localhost:8000/index/api/getServerConfig
curl http://186.233.4.8:8000/index/api/getServerConfig

# Frontend
curl -I http://186.233.4.8/

# WebSocket (deve retornar erro 400, mas significa que está respondendo)
curl -I http://186.233.4.8/socket.io/
```

### 2. Verificar Serviços

```bash
# Docker containers
docker ps
docker stats --no-stream

# PM2 processos
pm2 list
pm2 monit

# Portas em uso
netstat -tulpn | grep -E '3002|8000|554|1935|6379'

# Logs em tempo real
pm2 logs --lines 50
docker-compose logs -f --tail=50
```

### 3. Teste Funcional no Navegador

Acesse: **http://186.233.4.8**

- [ ] Página carrega corretamente
- [ ] Login funciona (gouveiarx@gmail.com / Teste123)
- [ ] Dashboard exibe dados
- [ ] Câmeras são listadas
- [ ] Stream de câmera funciona
- [ ] Gravações são exibidas
- [ ] Player de vídeo funciona
- [ ] Upload de arquivos funciona

### 4. Monitoramento Inicial (primeiros 30 minutos)

```bash
# CPU e memória
top

# Logs de erro
pm2 logs --err --lines 100
docker-compose logs | grep -i error

# Espaço em disco
df -h

# Conexões ativas
netstat -an | grep ESTABLISHED | wc -l

# Processos Node.js
ps aux | grep node
```

---

## ⚠️ Rollback

Caso algo dê errado, procedimento de rollback:

### Rollback Rápido (5 minutos)

```bash
# 1. Parar serviços
pm2 stop all
docker-compose down

# 2. Reverter para backup anterior
cd /root
mv NewCAM NewCAM.failed
tar -xzf backups/newcam-backup-YYYYMMDD.tar.gz

# 3. Reiniciar serviços
cd NewCAM
docker-compose up -d
pm2 resurrect

# 4. Verificar
curl http://localhost:3002/health
pm2 list
docker ps
```

### Rollback para Servidor Antigo

Se precisar voltar ao servidor antigo (66.94.104.241):

```bash
# 1. No servidor antigo, reativar serviços
ssh root@66.94.104.241
cd /root/OldNewCAM
pm2 start ecosystem.config.js
docker-compose up -d

# 2. Atualizar DNS ou notificar usuários
# (usar IP antigo temporariamente)

# 3. Investigar problema no servidor novo
# antes de tentar novamente
```

---

## 🔧 Troubleshooting

### Problema: Containers não iniciam

```bash
# Ver logs detalhados
docker-compose logs

# Verificar portas em conflito
netstat -tulpn | grep -E '8000|6379|5432'

# Limpar e rebuild
docker-compose down -v
docker-compose up -d --build

# Verificar espaço em disco
df -h
```

### Problema: Backend não conecta ao ZLMediaKit

```bash
# Verificar se ZLMediaKit está rodando
docker logs newcam-zlmediakit
curl http://localhost:8000/index/api/getServerConfig

# Verificar variável ZLM_SECRET no .env
cat backend/.env | grep ZLM_SECRET

# Testar API manualmente
curl -X POST "http://localhost:8000/index/api/getServerConfig" \
  -d "secret=9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK"
```

### Problema: Frontend não carrega

```bash
# Verificar build
ls -la frontend/dist/

# Rebuild
cd frontend
rm -rf dist node_modules
npm install
npm run build

# Verificar nginx
nginx -t
systemctl status nginx
curl -I http://localhost/
```

### Problema: Gravações não funcionam

```bash
# Verificar paths de gravação
ls -la storage/www/record/live/

# Verificar permissões
chmod -R 755 storage/www/record/

# Testar ZLMediaKit recording
curl -X POST "http://localhost:8000/index/api/startRecord" \
  -d "secret=9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK" \
  -d "vhost=__defaultVhost__" \
  -d "app=live" \
  -d "stream=test" \
  -d "type=1"

# Ver logs do backend
pm2 logs newcam-backend | grep -i record
```

### Problema: Erro de conexão com Supabase

```bash
# Testar conectividade
curl https://grkvfzuadctextnbpajb.supabase.co

# Verificar credenciais
cat backend/.env | grep SUPABASE

# Verificar firewall
ufw status
iptables -L -n | grep -i drop

# Testar DNS
nslookup grkvfzuadctextnbpajb.supabase.co
ping grkvfzuadctextnbpajb.supabase.co
```

### Problema: Rate Limiting muito agressivo

```bash
# Ajustar RATE_LIMIT_MAX temporariamente
echo "RATE_LIMIT_MAX=500" >> backend/.env

# Reiniciar backend
pm2 restart newcam-backend

# Verificar logs
pm2 logs newcam-backend | grep "Too many requests"
```

---

## 📊 Métricas de Sucesso

Deploy considerado bem-sucedido quando:

- [ ] Todos os containers rodando (`docker ps`)
- [ ] Backend respondendo health check (200 OK)
- [ ] Frontend acessível no navegador
- [ ] Login funcionando
- [ ] Streaming de câmera funcional
- [ ] Gravações sendo salvas
- [ ] S3 upload funcionando
- [ ] Sem erros críticos nos logs (30 min)
- [ ] CPU < 70%, RAM < 80%
- [ ] Latência API < 500ms

---

## 📞 Contatos de Suporte

- **Email**: gouveiarx@gmail.com
- **Documentação**: [docs/README.md](./README.md)
- **Comandos SSH**: [docs/COMANDOS_SSH_PRODUCAO.md](./COMANDOS_SSH_PRODUCAO.md)

---

**📅 Criado**: 11 de Janeiro de 2025
**🔄 Última atualização**: 11 de Janeiro de 2025
**✍️ Autor**: NewCAM DevOps Team
