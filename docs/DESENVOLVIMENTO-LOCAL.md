# NewCAM - Configuração de Desenvolvimento Local

## 🚀 Portas dos Serviços

### Serviços Principais
- **Backend API**: http://localhost:3002
- **Frontend**: http://localhost:5173, 5174, 5175 ou 5176 (dependendo da disponibilidade)
- **Worker**: Conecta ao backend na porta 3002 (sem porta própria)

### Serviços Docker
- **SRS (Streaming)**: 
  - RTMP: localhost:1936 (mapeado para 1935 interno)
  - HTTP: localhost:8001 (mapeado para 8000 interno)
  - API: localhost:1985
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379
- **MinIO**: localhost:9000-9001
- **Nginx**: localhost:80

## 🔐 Credenciais de Login

### Login Principal
- **Email**: gouveiarx@gmail.com
- **Senha**: Teste123

### Login Administrativo (Backup)
- **Email**: admin@newcam.com
- **Senha**: admin123

## 🛠️ Comandos de Desenvolvimento

### Iniciar Serviços

```bash
# 1. Iniciar serviços Docker (SRS, PostgreSQL, Redis, etc.)
docker-compose up -d

# 2. Iniciar Backend (porta 3002)
cd backend
npm run dev

# 3. Iniciar Worker (conecta ao backend:3002)
cd worker
npm run dev

# 4. Iniciar Frontend (porta 5173+)
cd frontend
npm run dev
```

### Verificar Status dos Serviços

```bash
# Verificar containers Docker
docker ps

# Verificar portas em uso
netstat -ano | findstr :3002  # Backend
netstat -ano | findstr :5173  # Frontend
netstat -ano | findstr :8001  # SRS
```

## 📡 URLs de Acesso

### Desenvolvimento
- **Frontend**: http://localhost:5173 (ou porta disponível)
- **Backend API**: http://localhost:3002
- **Health Check**: http://localhost:3002/api/health
- **SRS Admin**: http://localhost:8001

### Streaming URLs
- **HLS**: http://localhost:8001/live/stream.m3u8
- **RTMP**: rtmp://localhost:1936/live/stream
- **HTTP-FLV**: http://localhost:8001/live/stream.flv

## 🔧 Configurações de Ambiente

### Backend (.env)
```env
PORT=3002
API_PORT=3002
BACKEND_URL=http://localhost:3002
FRONTEND_URL=http://localhost:5174
```

### Frontend (.env)
```env
VITE_API_URL=http://localhost:3002/api
VITE_WS_URL=ws://localhost:3002
```

### Worker (.env)
```env
BACKEND_URL=http://localhost:3002
WORKER_TOKEN=newcam-worker-token-2025
```

## 🐛 Troubleshooting

### Problemas Comuns

1. **Backend não inicia na porta 3002**
   - Verificar se a porta está em uso: `netstat -ano | findstr :3002`
   - Matar processo se necessário: `taskkill /PID <PID> /F`

2. **Worker não conecta ao backend**
   - Verificar se backend está rodando na porta 3002
   - Verificar token no arquivo .env do worker

3. **Frontend não carrega**
   - Verificar se a porta está disponível
   - Verificar se VITE_API_URL aponta para localhost:3002

4. **Streaming não funciona**
   - Verificar se SRS está rodando: `docker ps | findstr srs`
   - Verificar portas do SRS: 1936 (RTMP), 8001 (HTTP)

### Logs Úteis

```bash
# Logs do Backend
cd backend && npm run dev

# Logs do Worker
cd worker && npm run dev

# Logs do SRS
docker-compose logs -f newcam-srs

# Logs de todos os containers
docker-compose logs -f
```

## 📝 Notas Importantes

- O Worker não tem porta própria, ele se conecta ao Backend via WebSocket
- O Frontend pode usar qualquer porta disponível (5173, 5174, 5175, 5176)
- O SRS usa portas mapeadas: 1936→1935, 8001→8000, 1985→1985
- Sempre verificar se os serviços Docker estão rodando antes de iniciar os serviços Node.js