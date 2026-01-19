# 🚀 Comandos para Produção - NewCAM
**Servidor**: 186.233.4.8
**Usuários**: root (@safecameras2025) / suporte (@suporte2025)

## Acesso SSH

### Conectar como root
```bash
ssh root@186.233.4.8
# Senha: @safecameras2025
```

### Conectar como suporte
```bash
ssh suporte@186.233.4.8
# Senha: @suporte2025
```

## Comandos de Deploy

### 1. Deploy Completo
```bash
# Conectar ao servidor
ssh root@186.233.4.8

# Navegar para o projeto
cd /root/NewCAM  # ou onde estiver o projeto

# Parar serviços
docker-compose down

# Atualizar código (se usando git)
git pull origin main

# Rebuild frontend com variáveis de produção
cd frontend
npm run build
cd ..

# Reiniciar serviços
docker-compose up -d

# Aguardar inicialização
sleep 30

# Verificar status
docker ps
```

### 2. Configuração de Ambiente

#### Backend (.env)
```bash
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
EOF
```

#### Frontend (.env.production)
```bash
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
```

## Verificação e Testes

### 1. Verificar Status dos Serviços
```bash
# Status dos containers
docker ps

# Logs do Backend
docker logs newcam-backend --tail=50

# Logs do ZLMediaKit
docker logs newcam-zlmediakit --tail=50

# Logs do Nginx
docker logs newcam-nginx --tail=50
```

### 2. Testes de Conectividade
```bash
# Health check do backend
curl http://localhost:3002/health
curl http://186.233.4.8/api/health

# ZLMediaKit API
curl http://localhost:8000/index/api/getServerConfig
curl http://186.233.4.8:8000/index/api/getServerConfig

# Frontend
curl -I http://186.233.4.8/
```

### 3. Teste no Navegador
- Acesse: `http://186.233.4.8`
- Faça login com: gouveiarx@gmail.com / Teste123
- Tente iniciar uma câmera
- Verifique se o stream carrega corretamente

## Monitoramento

### Logs em Tempo Real
```bash
# Todos os containers
docker-compose logs -f

# Backend apenas
docker logs -f newcam-backend

# Filtrar erros
docker-compose logs | grep -i error
```

### Uso de Recursos
```bash
# CPU e memória dos containers
docker stats

# Espaço em disco
df -h

# Processos Node.js
ps aux | grep node
```

## Troubleshooting

### Problema: Containers não iniciam
```bash
# Verificar logs de erro
docker-compose logs

# Limpar e rebuild
docker-compose down -v
docker-compose up -d --build

# Verificar portas em uso
netstat -tulpn | grep -E '3002|8000|5173|1935'
```

### Problema: Frontend não carrega
```bash
# Rebuild do frontend
cd frontend
rm -rf dist node_modules
npm install
npm run build
cd ..

# Restart do nginx
docker-compose restart nginx
```

### Problema: Câmeras não streamam
```bash
# Verificar ZLMediaKit
docker logs newcam-zlmediakit

# Testar API do ZLMediaKit
curl http://localhost:8000/index/api/getServerConfig

# Verificar se a porta 8000 está acessível externamente
curl http://186.233.4.8:8000/index/api/getServerConfig
```

### Problema: Banco de dados não conecta
```bash
# Verificar credenciais do Supabase
cat backend/.env | grep SUPABASE

# Testar conexão (dentro do container)
docker exec newcam-backend curl https://grkvfzuadctextnbpajb.supabase.co
```

## Backup e Restore

### Criar Backup
```bash
# Backup dos dados
mkdir -p /root/backups
tar -czf /root/backups/newcam-backup-$(date +%Y%m%d).tar.gz \
  /root/NewCAM/backend/.env \
  /root/NewCAM/frontend/.env.production \
  /root/NewCAM/storage
```

### Restore do Backup
```bash
# Extrair backup
cd /root
tar -xzf backups/newcam-backup-YYYYMMDD.tar.gz

# Rebuild e restart
cd NewCAM
docker-compose down
cd frontend && npm run build && cd ..
docker-compose up -d
```

## Manutenção

### Limpeza de Logs
```bash
# Limpar logs antigos
find /root/NewCAM/storage/logs -name "*.log" -mtime +30 -delete

# Limpar logs do Docker
docker system prune -a --volumes -f
```

### Atualização do Sistema
```bash
# Atualizar pacotes do sistema
apt update && apt upgrade -y

# Atualizar Docker
apt install docker-ce docker-ce-cli containerd.io -y

# Atualizar Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
```

## Referências Rápidas

### Portas Utilizadas
- **80**: Nginx (HTTP)
- **443**: Nginx (HTTPS - se configurado)
- **3002**: Backend API
- **8000**: ZLMediaKit (HTTP)
- **554**: RTSP
- **1935**: RTMP
- **6379**: Redis

### Arquivos Importantes
- `/root/NewCAM/backend/.env` - Configuração do backend
- `/root/NewCAM/frontend/.env.production` - Configuração do frontend
- `/root/NewCAM/docker-compose.yml` - Orquestração dos containers
- `/root/NewCAM/storage/` - Armazenamento local de gravações

---

**📅 Última atualização**: 11 de Janeiro de 2025
**🌐 Servidor**: 186.233.4.8
**👥 Acessos**: root / suporte
