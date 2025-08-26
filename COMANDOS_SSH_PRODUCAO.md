# 🚀 Comandos para Correção em Produção - NewCAM

## Problema Identificado
O sistema estava lento em produção porque o **VideoPlayer estava tentando acessar `localhost:8000`** ao invés do servidor de produção (`nuvem.safecameras.com.br:8000`).

## Solução Completa via SSH

### 1. Copie o Script para o Servidor
```bash
# No seu computador local, envie o script via SCP
scp scripts/fix-production-urls.sh root@nuvem.safecameras.com.br:/tmp/

# OU copie o conteúdo manualmente via nano/vim no servidor
```

### 2. Execute o Script no Servidor SSH
```bash
# Conectar ao servidor
ssh root@nuvem.safecameras.com.br

# Dar permissão de execução
chmod +x /tmp/fix-production-urls.sh

# Executar o script completo
./tmp/fix-production-urls.sh
```

### 3. Script Manual (Alternativa)
Se preferir executar passo a passo, use estes comandos no servidor:

```bash
# 1. Navegar para o projeto
cd /root/NewCAM  # ou onde estiver o projeto

# 2. Parar serviços
docker-compose down

# 3. Configurar backend
cat > backend/.env << 'EOF'
SUPABASE_URL=https://grkvfzuadctextnbpajb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzIyNDIzOCwiZXhwIjoyMDY4ODAwMjM4fQ.XJoPu5InA_s3pfryZfSChBqZnu7zBV3vwH7ZM4jf04M
ZLM_SECRET=9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK
ZLM_API_URL=http://localhost:8000/index/api
ZLM_BASE_URL=https://nuvem.safecameras.com.br:8000
BACKEND_URL=https://nuvem.safecameras.com.br:3002
FRONTEND_URL=https://nuvem.safecameras.com.br
NODE_ENV=production
PORT=3002
WORKER_TOKEN=newcam-worker-token-2025-secure
EOF

# 4. Configurar frontend
cat > frontend/.env.production << 'EOF'
VITE_API_URL=https://nuvem.safecameras.com.br/api
VITE_WS_URL=wss://nuvem.safecameras.com.br
VITE_ZLM_BASE_URL=https://nuvem.safecameras.com.br:8000
VITE_BACKEND_URL=https://nuvem.safecameras.com.br
VITE_FRONTEND_URL=https://nuvem.safecameras.com.br
VITE_NODE_ENV=production
VITE_SUPABASE_URL=https://grkvfzuadctextnbpajb.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyMjQyMzgsImV4cCI6MjA2ODgwMDIzOH0.Simv8hH8aE9adQiTf6t1BZIcMPniNh9ecpjxEeki4mE
EOF

# 5. Rebuild frontend
cd frontend
npm run build
cd ..

# 6. Reiniciar serviços
docker-compose up -d

# 7. Aguardar inicialização
sleep 30

# 8. Testar conectividade
curl -I http://localhost:8000/index/api/getServerConfig
curl -I http://localhost:3002/health
curl -I http://localhost/health
```

## Verificação dos Resultados

### 1. Testes de URL
```bash
# ZLMediaKit deve responder
curl https://nuvem.safecameras.com.br:8000/index/api/getServerConfig

# Backend deve responder
curl https://nuvem.safecameras.com.br/api/health

# Frontend deve carregar
curl https://nuvem.safecameras.com.br/
```

### 2. Logs para Análise
```bash
# Logs do ZLMediaKit
docker logs newcam-zlmediakit --tail=20

# Logs do Nginx
docker logs newcam-nginx --tail=20

# Status dos containers
docker ps
```

### 3. Teste no Navegador
- Acesse: `https://nuvem.safecameras.com.br`
- Tente iniciar uma câmera
- Verifique se o stream carrega sem ficar "girando"
- Console do navegador não deve mostrar erros de `localhost:8000`

## Principais Correções Aplicadas

1. **Backend `.env`**: URLs de produção configuradas
2. **Frontend `.env.production`**: `VITE_ZLM_BASE_URL=https://nuvem.safecameras.com.br:8000`
3. **VideoPlayer**: Fallback inteligente baseado no hostname
4. **Nginx**: Proxy configurado para ZLMediaKit em HTTPS
5. **Rebuild**: Frontend rebuilded com novas variáveis de ambiente

## Se Algo Não Funcionar

### Restaurar Backup
```bash
# Restaurar arquivos do backup
cp /tmp/newcam-backup-*/backend.env.bak backend/.env
cp /tmp/newcam-backup-*/frontend.env.production.bak frontend/.env.production
cp /tmp/newcam-backup-*/nginx.conf.bak docker/nginx/nginx.conf

# Rebuild e restart
cd frontend && npm run build && cd ..
docker-compose down && docker-compose up -d
```

### Debug Específico
```bash
# Ver erro específico do ZLMediaKit
docker logs newcam-zlmediakit --tail=50

# Testar porta 8000 internamente
docker exec newcam-zlmediakit curl http://localhost:8000/index/api/getServerConfig

# Verificar variáveis de ambiente do frontend
cat frontend/.env.production | grep ZLM

# Verificar build do frontend incluiu as variáveis
grep -r "nuvem.safecameras.com.br" frontend/dist/ || echo "Variáveis não incluídas no build"
```

---

**🎯 Objetivo**: Corrigir o problema de lentidão e streams não carregando em produção
**🔧 Solução**: Configurar URLs corretas para que o frontend acesse o servidor de produção ao invés de localhost
**⏱️ Tempo estimado**: 5-10 minutos para execução completa