# NewCAM - Sistema de Vigilância IP Profissional

Sistema completo de monitoramento de câmeras IP com streaming em tempo real, interface web moderna, backend robusto e sistema de upload S3 assíncrono para vigilância profissional.

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
├── backend/           # API REST, WebSocket e Upload S3 (Node.js + Express)
├── worker/            # Processamento background e upload queue
├── docker/            # Configurações Docker e serviços
├── docs/              # Documentação completa e organizada
├── scripts/           # Scripts de deployment e manutenção
├── storage/           # Armazenamento local (gravações e logs)
└── docker-compose.yml # Orquestração de containers
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
- **React Router** para navegação
- **Lucide React** para ícones
- **HLS.js** para streaming de vídeo
- **Upload status indicators** e **storage badges**

### Backend
- **Node.js** com Express
- **Socket.IO** para WebSockets em tempo real
- **Supabase** (PostgreSQL) como banco principal
- **JWT** + **Supabase Auth** para autenticação
- **Winston** para logs estruturados
- **Upload Queue System** para S3 assíncrono

### Upload & Storage
- **S3Service** com upload multipart
- **UploadQueueService** com retry inteligente
- **PathResolver** para normalização de caminhos
- **Feature Flags** para rollout gradual
- **Wasabi S3** como storage de produção

### Streaming & Recording
- **ZLMediaKit** servidor de mídia principal
- **RTSP/RTMP** protocolos de entrada
- **HLS** streaming adaptativo para web
- **H264 Transcoding** em tempo real para compatibilidade
- **Sistema de gravação** com upload automático

### Infraestrutura
- **Docker** containerização completa
- **Nginx** proxy reverso otimizado
- **PM2** gerenciamento de processos
- **Redis** cache e sessões
- **Database migrations** automáticas

## 📦 Instalação

### Pré-requisitos
- Node.js 22.14.0+
- PostgreSQL ou Supabase
- ZLMediaKit (incluído no projeto)
- PowerShell (Windows)
- Docker e Docker Compose (opcional)
- Git

### 🚀 Início Rápido

```powershell
# Clone o repositório
git clone <repository-url>
cd NewCAM

# Instale as dependências do projeto principal
npm install

# Instale dependências do backend
cd backend
npm install

# Instale dependências do frontend
cd ../frontend
npm install

# Volte para o diretório raiz
cd ..

# Configure as variáveis de ambiente
cp backend/.env.example backend/.env
# Edite o arquivo backend/.env com suas configurações

# Inicie todos os serviços
npm run dev
```

### ✅ Status Atual (Janeiro 2025) - SISTEMA COMPLETO
**FUNCIONANDO**: Sistema 100% operacional com todas as funcionalidades:
- ✅ **Sistema de Gravação S3**: Upload automático para Wasabi S3 com retention policy
- ✅ **Retenção Inteligente**: 7 dias local + S3, depois 30 dias apenas S3
- ✅ **Upload Queue**: Fila assíncrona com retry automático e métricas
- ✅ **S3 Fallback**: Reprodução inteligente local → S3 quando arquivos locais expiram  
- ✅ **AWS SDK v3**: Migração completa com presigned URLs funcionais
- ✅ **Sistema de Usuários**: Gestão completa com roles e permissões (admin, integrator, client, viewer)
- ✅ **Interface de Arquivo**: Filtros avançados, batch operations, export jobs
- ✅ **VideoPlayer**: Reprodução com suporte H264/H265 e transcoding automático
- ✅ **ZLMediaKit**: Streaming RTSP/RTMP/HLS com gravação automática
- ✅ **API Completa**: Endpoints REST + WebSocket para todas as operações
- ✅ **Docker Integration**: Containerização completa com persistência de dados
- ✅ **Documentação**: Sistema totalmente documentado e validado

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

# Wasabi S3 (Sistema de Armazenamento Completo)
WASABI_ACCESS_KEY=your-access-key
WASABI_SECRET_KEY=your-secret-key
WASABI_BUCKET=your-bucket
WASABI_REGION=us-east-2
WASABI_ENDPOINT=https://s3.us-east-2.wasabisys.com

# S3 Upload & Retention (Sistema Avançado)
S3_UPLOAD_ENABLED=true
S3_UPLOAD_CONCURRENCY=2
S3_UPLOAD_MAX_RETRIES=5
S3_PRESIGN_TTL=3600
LOCAL_RETENTION_DAYS=7
S3_RETENTION_DAYS=30
PREFER_S3_STREAMING=true
DELETE_LOCAL_AFTER_UPLOAD=false
ENABLE_UPLOAD_QUEUE=true

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

### 📋 Documentação Completa
- **[Installation Guide](docs/INSTALLATION.md)** - Guia completo de instalação (Windows/Linux/Docker)
- **[Architecture Overview](docs/ARCHITECTURE.md)** - Arquitetura detalhada do sistema
- **[API Reference](docs/API_REFERENCE.md)** - Documentação completa da API REST
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** - Soluções para problemas comuns
- **[Deploy Guide](docs/DEPLOY_GUIDE.md)** - Guia de deploy em produção
- **[CLAUDE.md](CLAUDE.md)** - Instruções técnicas para desenvolvimento com IA

### 🚀 Quick Start
```bash
# 1. Clone e instale dependências
git clone <repository-url> && cd NewCAM
npm install && cd backend && npm install && cd ../frontend && npm install && cd ..

# 2. Configure environment
cp backend/.env.example backend/.env  # Edite com suas configurações

# 3. Inicie todos os serviços
npm run dev
```

### 🔧 Principais Funcionalidades
- ✅ **Streaming em tempo real** com HLS e transcodificação H264
- ✅ **Sistema de gravação** com upload S3 assíncrono
- ✅ **Interface moderna** com React 18 + TypeScript
- ✅ **API REST completa** com autenticação JWT
- ✅ **Upload queue** com retry automático e métricas
- ✅ **Feature flags** para rollout controlado
- ✅ **Sistema de usuários** com roles (admin, integrator, client, viewer)
- ✅ **Gestão de arquivos** com arquivo de gravações avançado
- ✅ **Documentação completa** e troubleshooting

## 📞 Suporte

### 🗂️ Informações do Sistema
- **Versão**: 2.2.0 (Janeiro 2025)
- **Node.js**: 18+ LTS
- **Banco**: Supabase (PostgreSQL) + Redis
- **Streaming**: ZLMediaKit com H264 transcoding
- **Storage**: Local primary + Wasabi S3 backup
- **Upload System**: Queue-based async upload com retry
- **Usuários**: Sistema completo de gestão com roles e permissões
- **Status**: ✅ Funcional e atualizado (usuários e arquivo implementados)

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