# NewCAM - Sistema de Vigilância por Câmeras IP

Sistema completo de monitoramento de câmeras IP com streaming em tempo real, interface web moderna e backend robusto para vigilância profissional.

## 🌐 Acesso à Aplicação

### 🚀 Produção (Servidor)
- **URL Principal**: http://66.94.104.241
- **API Health Check**: http://66.94.104.241/api/health
- **Status**: ✅ Online e Funcional

### 🔧 Desenvolvimento Local
- **Frontend**: http://localhost:5174
- **Backend API**: http://localhost:3002
- **Health Check**: http://localhost:3002/health

## 🏗️ Arquitetura do Sistema

```
NewCAM/
├── frontend/          # Interface web (React + TypeScript + Vite)
├── backend/           # API REST e WebSocket (Node.js + Express)
├── worker/            # Monitoramento de câmeras
├── docker/            # Configurações Docker e serviços
├── docs/              # Documentação essencial
├── scripts/           # Scripts de instalação e migração
└── nginx.conf         # Configuração Nginx
```

## 🌐 Mapeamento de Portas

### 📱 Servidor de Produção (66.94.104.241)

| Serviço | Porta | URL/Endpoint | Status | Descrição |
|---------|-------|--------------|--------|-----------||
| **Nginx** | `80` | http://66.94.104.241 | ✅ | Proxy reverso e frontend |
| **Backend API** | `3002` | /api/* | ✅ | API REST + WebSocket |
| **ZLMediaKit** | `8000` | /zlm/* | ✅ | Servidor de streaming |
| **SRS** | `8080` | /srs/* | ✅ | Servidor de streaming alternativo |
| **PostgreSQL** | `5432` | localhost:5432 | ✅ | Banco de dados (Supabase) |

### 🖥️ Desenvolvimento Local

| Serviço | Porta | URL | Descrição |
|---------|-------|-----|----------|
| **Frontend** | `5174` | http://localhost:5174 | Interface React + Vite |
| **Backend** | `3002` | http://localhost:3002 | API REST + WebSocket |
| **Worker** | `3001` | localhost:3001 | Monitoramento de câmeras |
| **ZLMediaKit** | `8000` | localhost:8000 | Servidor de streaming |
| **SRS** | `8080` | localhost:8080 | Servidor de streaming alternativo |

## 🚀 Tecnologias

### Frontend
- **React 18** com TypeScript
- **Vite** para build otimizado
- **Tailwind CSS** para estilização
- **Zustand** para gerenciamento de estado
- **React Router** para navegação
- **Lucide React** para ícones
- **HLS.js** para streaming de vídeo

### Backend
- **Node.js** com Express
- **Socket.IO** para WebSockets
- **Supabase** (PostgreSQL) como banco principal
- **JWT** para autenticação
- **Winston** para logs
- **Axios** para requisições HTTP

### Streaming
- **ZLMediaKit** servidor de mídia principal
- **SRS** servidor de mídia alternativo
- **RTSP/RTMP** protocolos de entrada
- **HLS** streaming adaptativo para web
- **HTTP-FLV** streaming de baixa latência

### Infraestrutura
- **Docker** containerização
- **Nginx** proxy reverso
- **Ubuntu 20.04** sistema operacional
- **Wasabi S3** armazenamento de gravações

## 📦 Instalação

### Pré-requisitos
- Node.js 18+
- Docker e Docker Compose
- Git

### 🚀 Desenvolvimento Local

```bash
# 1. Clone o repositório
git clone <repository-url>
cd NewCAM

# 2. Configure as variáveis de ambiente
cp .env.example .env
# Edite o .env com suas configurações

# 3. Inicie os serviços com Docker
docker-compose up -d

# 4. Instale dependências do backend
cd backend
npm install
cp .env.example .env
# Configure as variáveis do backend
npm run dev

# 5. Instale dependências do frontend (novo terminal)
cd frontend
npm install
npm run dev

# 6. Inicie o worker (novo terminal)
cd worker
npm install
npm start
```

### 🐳 Docker (Recomendado)

```bash
# Inicie todos os serviços
docker-compose up -d

# Verifique os containers
docker ps

# Logs dos serviços
docker-compose logs -f
```

## ⚙️ Configuração

### Variáveis de Ambiente Principais

#### Raiz do Projeto (.env)
```env
# Supabase
SUPABASE_URL=https://grkvfzuadctextnbpajb.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Streaming
ZLM_API_URL=http://localhost:8000
ZLM_SECRET=035c73f7-bb6b-4889-a715-d9eb2d1925cc
SRS_API_URL=http://localhost:8080
SRS_SECRET=your-srs-secret

# Wasabi S3
WASABI_ACCESS_KEY=your-access-key
WASABI_SECRET_KEY=your-secret-key
WASABI_BUCKET=your-bucket
WASABI_REGION=us-east-1
WASABI_ENDPOINT=https://s3.wasabisys.com

# Worker
WORKER_TOKEN=your-worker-token
```

## 🔐 Autenticação

### Login Padrão
- **Usuário**: gouveiarx@gmail.com
- **Senha**: Teste123

### Endpoints de Autenticação
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Perfil do usuário
- `POST /api/auth/refresh` - Renovar token

## 📡 API Endpoints

### Saúde do Sistema
- `GET /api/health` - Status da aplicação
- `GET /api/status` - Status detalhado dos serviços

### Câmeras
- `GET /api/cameras` - Listar câmeras
- `POST /api/cameras` - Adicionar câmera
- `PUT /api/cameras/:id` - Atualizar câmera
- `DELETE /api/cameras/:id` - Remover câmera
- `POST /api/cameras/:id/start-stream` - Iniciar stream
- `POST /api/cameras/:id/stop-stream` - Parar stream

### Gravações
- `GET /api/recordings` - Listar gravações
- `GET /api/recordings/:id` - Detalhes da gravação
- `DELETE /api/recordings/:id` - Excluir gravação

### Hooks (ZLMediaKit)
- `POST /api/hook/on_publish` - Callback de publicação
- `POST /api/hook/on_play` - Callback de reprodução
- `POST /api/hook/on_stream_changed` - Callback de mudança de stream
- `POST /api/hook/on_record_mp4` - Callback de gravação

## 🎥 Streaming

### Protocolos Suportados
- **RTSP**: Entrada de câmeras IP
- **RTMP**: Entrada de streams RTMP
- **HLS**: Saída para web (`.m3u8`)
- **HTTP-FLV**: Saída de baixa latência (`.flv`)

### URLs de Streaming
- **HLS**: `http://localhost:8000/live/{stream_id}.m3u8`
- **HTTP-FLV**: `http://localhost:8000/live/{stream_id}.flv`
- **RTMP**: `rtmp://localhost:1935/live/{stream_id}`

## 🔧 Monitoramento

### Docker
```bash
# Status dos containers
docker ps

# Logs dos serviços
docker-compose logs -f backend
docker-compose logs -f worker
docker-compose logs -f zlmediakit
docker-compose logs -f srs

# Reiniciar serviços
docker-compose restart
```

### Verificação de Saúde
```bash
# API Health Check
curl http://localhost:3002/health

# ZLMediaKit Status
curl http://localhost:8000/index/api/getServerConfig

# SRS Status
curl http://localhost:8080/api/v1/summaries
```

## 🛠️ Scripts Úteis

### Instalação de Serviços
```powershell
# Instalar ZLMediaKit
.\scripts\install-zlmediakit.ps1

# Instalar SRS
.\scripts\install-srs.ps1

# Iniciar todos os serviços
.\start-all-services.ps1
```

### Migração de Dados
```bash
# Migrar tipo de stream das câmeras
node scripts\migrate-camera-stream-type.js

# Migrar campo IP das câmeras
node scripts\run_ip_field_migration.js
```

## 🧪 Desenvolvimento

### Estrutura de Pastas

```
src/
├── components/      # Componentes React reutilizáveis
├── pages/          # Páginas da aplicação
├── hooks/          # Custom hooks
├── services/       # Serviços e APIs
├── utils/          # Utilitários
├── types/          # Tipos TypeScript
├── contexts/       # Contextos React
└── styles/         # Estilos globais
```

### Scripts de Desenvolvimento

```bash
# Backend
cd backend
npm run dev          # Desenvolvimento
npm run build        # Build para produção
npm run lint         # Verificar código

# Frontend
cd frontend
npm run dev          # Servidor de desenvolvimento
npm run build        # Build para produção
npm run preview      # Preview da build
npm run lint         # ESLint

# Worker
cd worker
npm start            # Iniciar worker
npm run dev          # Desenvolvimento
```

## 🔒 Segurança

### Medidas Implementadas
- Autenticação JWT
- CORS configurado
- Rate limiting
- Validação de entrada
- Sanitização de dados
- Headers de segurança
- Tokens de worker para autenticação

## 📝 Logs

### Localização dos Logs
- **Backend**: `backend/logs/`
- **Worker**: `worker/logs/`
- **Docker**: `docker-compose logs`

### Níveis de Log
- `error`: Erros críticos
- `warn`: Avisos importantes
- `info`: Informações gerais
- `debug`: Depuração (apenas desenvolvimento)

## 🆘 Troubleshooting

### Problemas Comuns

#### Backend não inicia
```bash
# Verificar logs
docker-compose logs backend

# Verificar porta
netstat -ano | findstr :3002

# Reiniciar
docker-compose restart backend
```

#### Streaming não funciona
```bash
# Verificar ZLMediaKit
docker-compose logs zlmediakit

# Testar API
curl http://localhost:8000/index/api/getServerConfig

# Verificar configuração
type docker\zlmediakit\config.ini
```

#### Worker não conecta
```bash
# Verificar logs do worker
docker-compose logs worker

# Verificar token
echo $WORKER_TOKEN

# Reiniciar worker
docker-compose restart worker
```

## 📚 Documentação

### 📋 Documentos Essenciais
- [Desenvolvimento Local](docs/DESENVOLVIMENTO-LOCAL.md) - Guia completo para desenvolvimento
- [Credenciais e Login](docs/CREDENCIAIS-LOGIN.md) - Informações de acesso
- [Configuração do Supabase](docs/configuracao-supabase.md) - Setup do banco de dados
- [Deploy em Produção](docs/PRODUCTION-README.md) - Configuração para produção

## 📞 Suporte

### Informações do Sistema
- **Versão**: 2.0.0
- **Node.js**: 18+
- **Banco**: Supabase (PostgreSQL)
- **Streaming**: ZLMediaKit + SRS
- **Armazenamento**: Wasabi S3

### Comandos de Diagnóstico
```bash
# Status geral
docker ps
docker-compose ps

# Verificar portas
netstat -ano | findstr -E "(3002|3001|8000|8080|5174)"

# Logs recentes
docker-compose logs --tail=50
```

---

**NewCAM** - Sistema de Vigilância Profissional  
Desenvolvido com ❤️ para segurança e monitoramento eficiente.