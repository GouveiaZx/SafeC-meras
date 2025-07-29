# 🚀 NewCAM - Deploy no Servidor do Cliente

## 📋 Visão Geral
Este guia contém todas as instruções necessárias para implantar o sistema NewCAM no servidor de produção do cliente, incluindo todas as correções críticas aplicadas.

## 🎯 O que foi Corrigido

### ✅ Problemas Críticos Resolvidos
1. **Erro 400 ao iniciar stream RTMP** - Coluna `stream_type` ausente no banco
2. **Porta 3002 em uso** - Processo travado do backend
3. **Configuração de câmeras RTMP** - Valores incorretos no banco

### 📊 Status do Sistema
- **Backend**: ✅ Funcionando (Porta 3002)
- **Frontend**: ✅ Funcionando (Porta 5173)
- **ZLMediaKit**: ✅ Configurado
- **Supabase**: ✅ Migration aplicada

## 🚀 Início Rápido

### 1. Preparação do Servidor
```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar PM2 globalmente
sudo npm install -g pm2

# Instalar ZLMediaKit
git clone https://github.com/ZLMediaKit/ZLMediaKit.git
cd ZLMediaKit && sudo ./build_for_linux.sh
```

### 2. Configuração do Projeto
```bash
# Clonar projeto
git clone [URL_DO_REPOSITORIO]
cd NewCAM

# Backend
npm install
npm run build

# Frontend
cd frontend
npm install
npm run build
```

### 3. Configuração de Ambiente
```bash
# Copiar arquivos de configuração
cp CONFIG_SERVIDOR_CLIENTE.env backend/.env
cp CONFIG_SERVIDOR_CLIENTE.env frontend/.env

# Editar com valores reais
nano backend/.env
nano frontend/.env
```

### 4. Banco de Dados
```bash
# Executar migration (se necessário)
cd backend
npm run migrate

# Verificar estrutura
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('cameras').select('*').limit(1).then(console.log);
"
```

### 5. Inicialização com PM2
```bash
# Backend
pm2 start ecosystem.config.js --env production

# Frontend (servidor estático)
pm2 start "serve -s dist -p 80" --name newcam-frontend

# ZLMediaKit
pm2 start "./ZLMediaKit/release/linux/Debug/MediaServer" --name zlmediakit
```

## 📁 Estrutura de Arquivos no Servidor

```
/opt/newcam/
├── backend/
│   ├── .env
│   ├── dist/
│   ├── node_modules/
│   └── ecosystem.config.js
├── frontend/
│   ├── .env
│   ├── dist/
│   └── node_modules/
├── zlmediakit/
│   ├── config.ini
│   └── logs/
├── logs/
│   ├── backend.log
│   ├── frontend.log
│   └── zlmediakit.log
└── scripts/
    ├── deploy.sh
    ├── backup.sh
    └── monitor.sh
```

## 🔧 Scripts de Deploy

### Script: deploy.sh
```bash
#!/bin/bash
# Script de deploy automatizado

echo "🚀 Iniciando deploy do NewCAM..."

# Parar serviços existentes
pm2 stop all

# Atualizar código
git pull origin main

# Backend
cd backend
npm install
npm run build
npm run migrate
cd ..

# Frontend
cd frontend
npm install
npm run build
cd ..

# Iniciar serviços
pm2 start ecosystem.config.js --env production

echo "✅ Deploy concluído!"
```

### Script: monitor.sh
```bash
#!/bin/bash
# Script de monitoramento

echo "📊 Status do Sistema:"
echo "===================="

# PM2 Status
pm2 status

# Portas
echo ""
echo "🔌 Portas em uso:"
netstat -tlnp | grep -E ":3002|:5173|:8080|:1935"

# Logs recentes
echo ""
echo "📋 Logs recentes:"
pm2 logs --lines 10
```

## 🧪 Testes de Validação

### Teste 1: Banco de Dados
```bash
# Verificar estrutura
curl -H "apikey: [SUPABASE_ANON_KEY]" \
     [SUPABASE_URL]/rest/v1/cameras?select=*
```

### Teste 2: Backend
```bash
# Health check
curl http://localhost:3002/api/health

# Testar câmera RTMP
curl -X POST http://localhost:3002/api/streams/[CAMERA_ID]/start
```

### Teste 3: Frontend
```bash
# Acessar no navegador
http://[SEU_SERVIDOR]:80

# Verificar WebSocket
ws://[SEU_SERVIDOR]:3002
```

## 📊 Monitoramento

### Dashboard PM2
```bash
# Interface web do PM2
pm2 web

# Monitoramento em tempo real
pm2 monit
```

### Logs
```bash
# Backend
pm2 logs newcam-backend

# Frontend
pm2 logs newcam-frontend

# ZLMediaKit
pm2 logs zlmediakit
```

## 🔐 Segurança

### Firewall (UFW)
```bash
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 3002/tcp  # Backend API
sudo ufw allow 8080/tcp  # ZLMediaKit
sudo ufw allow 1935/tcp  # RTMP
sudo ufw enable
```

### Nginx (Reverso Proxy)
```nginx
server {
    listen 80;
    server_name seu-dominio.com;

    location / {
        proxy_pass http://localhost:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api {
        proxy_pass http://localhost:3002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /socket.io {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## 🔄 Backup e Recuperação

### Backup Automático
```bash
#!/bin/bash
# backup.sh

date=$(date +%Y%m%d_%H%M%S)
tar -czf /opt/backups/newcam_$date.tar.gz \
    /opt/newcam/backend/.env \
    /opt/newcam/frontend/.env \
    /opt/newcam/backend/storage/
```

### Cron Job
```bash
# Adicionar ao crontab
0 2 * * * /opt/newcam/scripts/backup.sh
```

## 📞 Suporte

### Comandos Úteis
```bash
# Verificar status
curl http://localhost:3002/api/health

# Reiniciar serviços
pm2 restart all

# Verificar logs
pm2 logs --lines 50

# Estatísticas
pm2 show [nome-do-servico]
```

### Contatos
- **Suporte Técnico**: [seu-email@empresa.com]
- **Documentação**: /docs/README_SERVIDOR_CLIENTE.md
- **Scripts**: /scripts/

## 🚨 Solução de Problemas

### Problema: Erro 400 ao iniciar stream
**Solução**: Executar migration do banco de dados
```bash
cd backend
npm run migrate
```

### Problema: Porta 3002 em uso
**Solução**: Identificar e matar processo
```bash
sudo lsof -i :3002
sudo kill -9 [PID]
```

### Problema: Câmera aparece offline
**Solução**: Verificar configuração RTMP
```bash
# Verificar URL da câmera
curl http://localhost:3002/api/cameras/[ID]
```

---

**Última atualização**: $(date)
**Versão**: 1.0.0
**Status**: ✅ Pronto para produção