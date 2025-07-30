# NewCAM - Guia de Desenvolvimento Local

## 🚀 Configuração Rápida

### Pré-requisitos
- Node.js 18+ e npm
- Docker e Docker Compose
- Git

### Inicialização Rápida
```bash
# 1. Clonar e instalar dependências
git clone <repository-url>
cd NewCAM
npm run install-all

# 2. Configurar ambiente
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cp worker/.env.example worker/.env

# 3. Iniciar serviços Docker
docker-compose up -d

# 4. Iniciar aplicação
npm run dev
```

## 🔌 Portas dos Serviços

### Aplicação Principal
- **Frontend**: http://localhost:5173 (Vite dev server)
- **Backend API**: http://localhost:3002
- **Worker**: Conecta ao backend via WebSocket (sem porta própria)

### Serviços Docker
- **SRS (Streaming)**:
  - RTMP: localhost:1936 → container:1935
  - HTTP: localhost:8001 → container:8000
  - API: localhost:1985 → container:1985
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379
- **MinIO**: localhost:9000 (console: 9001)
- **Nginx**: localhost:80

## 🔐 Credenciais de Acesso

### Login Principal
- **Email**: gouveiarx@gmail.com
- **Senha**: Teste123

### Banco de Dados (PostgreSQL)
- **Host**: localhost:5432
- **Database**: newcam
- **User**: postgres
- **Password**: postgres123

## 🛠️ Comandos de Desenvolvimento

### Scripts Principais
```bash
# Instalar todas as dependências
npm run install-all

# Iniciar todos os serviços
npm run dev

# Iniciar serviços individualmente
npm run dev:backend    # Backend na porta 3002
npm run dev:frontend   # Frontend na porta 5173
npm run dev:worker     # Worker conectando ao backend

# Iniciar apenas serviços Docker
docker-compose up -d

# Parar todos os serviços
docker-compose down
npm run stop
```

### Verificação de Status
```bash
# Verificar containers Docker
docker ps

# Verificar portas em uso
netstat -ano | findstr :3002  # Backend
netstat -ano | findstr :5173  # Frontend
netstat -ano | findstr :8001  # SRS HTTP
netstat -ano | findstr :1936  # SRS RTMP

# Health check da aplicação
curl http://localhost:3002/api/health
```

## 📡 URLs de Desenvolvimento

### Aplicação
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3002/api
- **Health Check**: http://localhost:3002/api/health
- **WebSocket**: ws://localhost:3002

### Streaming
- **SRS Console**: http://localhost:8001
- **HLS Stream**: http://localhost:8001/live/{stream_id}.m3u8
- **RTMP Publish**: rtmp://localhost:1936/live/{stream_id}
- **HTTP-FLV**: http://localhost:8001/live/{stream_id}.flv

### Administração
- **MinIO Console**: http://localhost:9001
- **PostgreSQL**: localhost:5432 (use pgAdmin ou similar)

## ⚙️ Configuração de Ambiente

### Backend (.env)
```env
PORT=3002
NODE_ENV=development
BACKEND_URL=http://localhost:3002
FRONTEND_URL=http://localhost:5173

# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Streaming
SRS_HTTP_API_URL=http://localhost:1985/api/v1
SRS_RTMP_URL=rtmp://localhost:1936/live
SRS_HLS_URL=http://localhost:8001/live
```

### Frontend (.env)
```env
VITE_API_URL=http://localhost:3002/api
VITE_WS_URL=ws://localhost:3002
VITE_SRS_HLS_URL=http://localhost:8001/live
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Worker (.env)
```env
BACKEND_URL=http://localhost:3002
WORKER_TOKEN=newcam-worker-token-2025
NODE_ENV=development
```

## 🔧 Desenvolvimento

### Estrutura de Pastas
```
NewCAM/
├── backend/          # API Node.js/Express
├── frontend/         # Interface React/Vite
├── worker/           # Processamento em background
├── docker-compose.yml # Serviços Docker
├── package.json      # Scripts principais
└── docs/            # Documentação
```

### Hot Reload
- **Backend**: Nodemon reinicia automaticamente
- **Frontend**: Vite HMR (Hot Module Replacement)
- **Worker**: Nodemon reinicia automaticamente

### Debugging
```bash
# Backend com debug
cd backend && npm run debug

# Frontend com debug
cd frontend && npm run dev -- --debug

# Logs detalhados
DEBUG=newcam:* npm run dev:backend
```

## 🐛 Troubleshooting

### Problemas Comuns

#### 1. Porta 3002 em uso
```bash
# Verificar processo
netstat -ano | findstr :3002
# Matar processo
taskkill /PID <PID> /F
```

#### 2. Worker não conecta
- Verificar se backend está rodando
- Verificar WORKER_TOKEN no .env
- Verificar logs: `cd worker && npm run dev`

#### 3. Frontend não carrega
- Verificar se VITE_API_URL está correto
- Limpar cache: `cd frontend && npm run build:clean`
- Verificar porta disponível

#### 4. Streaming não funciona
```bash
# Verificar SRS
docker ps | findstr srs
docker-compose logs newcam-srs

# Testar RTMP
ffmpeg -re -i test.mp4 -c copy -f flv rtmp://localhost:1936/live/test
```

#### 5. Banco de dados
```bash
# Verificar PostgreSQL
docker-compose logs newcam-postgres

# Conectar ao banco
psql -h localhost -p 5432 -U postgres -d newcam
```

### Logs Úteis
```bash
# Logs da aplicação
npm run logs

# Logs específicos
cd backend && npm run dev     # Backend logs
cd frontend && npm run dev    # Frontend logs
cd worker && npm run dev      # Worker logs

# Logs Docker
docker-compose logs -f        # Todos os containers
docker-compose logs -f newcam-srs  # Apenas SRS
```

### Reset Completo
```bash
# Parar tudo
docker-compose down -v
npm run stop

# Limpar dados
docker system prune -f
npm run clean

# Reinstalar
npm run install-all
docker-compose up -d
npm run dev
```

## 📝 Notas Importantes

- O Worker não tem porta própria, conecta ao Backend via WebSocket
- O Frontend usa porta dinâmica (5173, 5174, etc.) conforme disponibilidade
- Sempre iniciar serviços Docker antes dos serviços Node.js
- Para desenvolvimento, usar `npm run dev` que inicia tudo automaticamente
- Verificar health checks antes de reportar problemas
- Manter logs abertos durante desenvolvimento para debug

## 🚀 Próximos Passos

1. Configurar IDE com ESLint e Prettier
2. Instalar extensões recomendadas (VS Code)
3. Configurar debugger para Node.js
4. Familiarizar-se com a estrutura do projeto
5. Ler documentação da API em `docs/`

Para mais informações, consulte:
- `README.md` - Visão geral do projeto
- `docs/PRODUCTION-README.md` - Deploy em produção
- `docs/configuracao-supabase.md` - Configuração do banco