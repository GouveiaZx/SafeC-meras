# NewCAM - Sistema de Vigilância por Câmeras IP

## 📋 Visão Geral

O NewCAM é um sistema completo de monitoramento de câmeras IP com streaming em tempo real, gravação contínua e interface web moderna. O sistema oferece vigilância profissional com arquitetura distribuída e alta disponibilidade.

### 🎯 Características Principais
- **Streaming em Tempo Real**: Suporte a RTSP, RTMP, HLS e WebRTC
- **Gravação Contínua**: Armazenamento automático com upload para S3
- **Interface Moderna**: Dashboard responsivo em React
- **Arquitetura Distribuída**: Microserviços containerizados
- **Alta Disponibilidade**: Sistema robusto com fallback automático

## 🏗️ Arquitetura do Sistema

```mermaid
graph TD
    A[React Frontend] --> B[Nginx Proxy]
    B --> C[Backend API]
    C --> D[PostgreSQL/Supabase]
    C --> E[Redis Cache]
    C --> F[ZLMediaKit]
    C --> G[Worker Service]
    F --> H[Câmeras IP]
    G --> I[Wasabi S3]
    
    subgraph "Frontend Layer"
        A
    end
    
    subgraph "Proxy Layer"
        B
    end
    
    subgraph "Backend Services"
        C
        G
    end
    
    subgraph "Media Layer"
        F
    end
    
    subgraph "Data Layer"
        D
        E
        I
    end
    
    subgraph "External"
        H
    end
```

## 🌐 Configuração de Portas e Serviços

### 🚀 Produção (Servidor: 66.94.104.241)

| Serviço | Porta | URL/Endpoint | Status | Descrição |
|---------|-------|--------------|--------|-----------|
| **Nginx** | `80` | http://66.94.104.241 | ✅ | Proxy reverso e frontend |
| **Backend API** | `3002` | /api/* | ✅ | API REST + WebSocket |
| **ZLMediaKit** | `8000` | /zlm/* | ✅ | Servidor de streaming |
| **SRS** | `8080` | /srs/* | ✅ | Servidor de streaming alternativo |
| **PostgreSQL** | `5432` | localhost:5432 | ✅ | Banco de dados (Supabase) |

### 🖥️ Desenvolvimento Local

| Serviço | Porta | URL | Descrição |
|---------|-------|-----|----------|
| **Frontend** | `5173` | http://localhost:5173 | Interface React + Vite |
| **Backend** | `3002` | http://localhost:3002 | API REST + WebSocket |
| **Worker** | `3001` | localhost:3001 | Monitoramento de câmeras |
| **ZLMediaKit** | `8000` | localhost:8000 | Servidor de streaming |
| **PostgreSQL** | `5432` | localhost:5432 | Banco de dados |
| **Redis** | `6379` | localhost:6379 | Cache e sessões |

## 🚀 Tecnologias Utilizadas

### Frontend
- **React 18** com TypeScript
- **Vite** para build otimizado e desenvolvimento rápido
- **Tailwind CSS** para estilização responsiva
- **Zustand** para gerenciamento de estado
- **React Router** para navegação SPA
- **HLS.js** para reprodução de streaming de vídeo
- **Lucide React** para ícones modernos
- **Axios** para requisições HTTP

### Backend
- **Node.js 18+** com Express.js
- **Socket.IO** para comunicação WebSocket em tempo real
- **Supabase** (PostgreSQL) como banco principal
- **Redis** para cache e gerenciamento de sessões
- **JWT** para autenticação segura
- **Winston** para sistema de logs
- **Bull** para filas de processamento
- **AWS SDK** para integração S3

### Streaming e Mídia
- **ZLMediaKit** servidor de mídia principal
- **SRS** servidor de mídia alternativo
- **FFmpeg** para processamento de vídeo
- **RTSP/RTMP** protocolos de entrada
- **HLS** streaming adaptativo para web
- **HTTP-FLV** streaming de baixa latência

### Infraestrutura
- **Docker** e **Docker Compose** para containerização
- **Nginx** como proxy reverso
- **Ubuntu 20.04** sistema operacional
- **Wasabi S3** armazenamento de gravações
- **Supabase** backend-as-a-service

## 📁 Estrutura do Projeto

```
NewCAM/
├── frontend/                 # Interface React
│   ├── src/
│   │   ├── components/      # Componentes reutilizáveis
│   │   ├── pages/          # Páginas da aplicação
│   │   ├── hooks/          # Custom hooks
│   │   ├── store/          # Gerenciamento de estado
│   │   └── utils/          # Utilitários
│   ├── package.json
│   └── vite.config.ts
├── backend/                  # API Node.js
│   ├── src/
│   │   ├── routes/         # Rotas da API
│   │   ├── middleware/     # Middlewares
│   │   ├── services/       # Lógica de negócio
│   │   ├── models/         # Modelos de dados
│   │   └── utils/          # Utilitários
│   ├── package.json
│   └── .env
├── worker/                   # Serviço de monitoramento
│   ├── src/
│   ├── package.json
│   └── .env
├── docker/                   # Configurações Docker
│   ├── docker-compose.yml
│   └── Dockerfile.*
├── docs/                     # Documentação
├── scripts/                  # Scripts de automação
├── supabase/                # Configurações Supabase
├── .env                     # Variáveis de ambiente
├── package.json             # Scripts principais
└── README.md
```

## 📡 APIs Disponíveis

### Autenticação
- `POST /api/auth/login` - Login do usuário
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Perfil do usuário
- `POST /api/auth/refresh` - Renovar token JWT

### Câmeras
- `GET /api/cameras` - Listar todas as câmeras
- `POST /api/cameras` - Adicionar nova câmera
- `PUT /api/cameras/:id` - Atualizar câmera
- `DELETE /api/cameras/:id` - Remover câmera
- `POST /api/cameras/:id/start-stream` - Iniciar streaming
- `POST /api/cameras/:id/stop-stream` - Parar streaming

### Streaming
- `GET /api/streams` - Listar streams ativos
- `POST /api/streams/:id/start` - Iniciar stream
- `POST /api/streams/:id/stop` - Parar stream
- `GET /api/streams/:id/status` - Status do stream

### Gravações
- `GET /api/recordings` - Listar gravações
- `GET /api/recordings/:id` - Detalhes da gravação
- `DELETE /api/recordings/:id` - Excluir gravação
- `GET /api/recordings/:id/download` - Download da gravação

### Sistema
- `GET /api/health` - Status da aplicação
- `GET /api/status` - Status detalhado dos serviços
- `GET /api/metrics` - Métricas do sistema

### Hooks ZLMediaKit
- `POST /api/hook/on_publish` - Callback de publicação
- `POST /api/hook/on_play` - Callback de reprodução
- `POST /api/hook/on_stream_changed` - Mudança de stream
- `POST /api/hook/on_record_mp4` - Callback de gravação

## ⚙️ Configuração e Instalação

### Pré-requisitos
- **Node.js 18+**
- **Docker** e **Docker Compose**
- **Git**
- **Conta Supabase** (para banco de dados)
- **Conta Wasabi** (para armazenamento S3)

### 🚀 Instalação para Desenvolvimento

#### 1. Clone e Configure o Projeto
```bash
# Clone o repositório
git clone <repository-url>
cd NewCAM

# Configure variáveis de ambiente
cp .env.example .env
# Edite o .env com suas configurações
```

#### 2. Inicie os Serviços Docker
```bash
# Inicie PostgreSQL, Redis e ZLMediaKit
docker-compose up -d postgres redis zlmediakit

# Verifique se os containers estão rodando
docker ps
```

#### 3. Configure e Inicie o Backend
```bash
cd backend
npm install
cp .env.example .env
# Configure as variáveis do backend
npm run dev
```

#### 4. Configure e Inicie o Frontend
```bash
# Em um novo terminal
cd frontend
npm install
npm run dev
```

#### 5. Inicie o Worker (Opcional)
```bash
# Em um novo terminal
cd worker
npm install
npm start
```

### 🐳 Instalação com Docker (Recomendado)

```bash
# Inicie todos os serviços
docker-compose up -d

# Verifique os containers
docker ps

# Acompanhe os logs
docker-compose logs -f

# Parar todos os serviços
docker-compose down
```

## 🔐 Configuração de Autenticação

### Login Padrão
- **Usuário**: gouveiarx@gmail.com
- **Senha**: Teste123

### Variáveis de Ambiente Essenciais

#### Arquivo .env (Raiz)
```env
# Supabase
SUPABASE_URL=https://grkvfzuadctextnbpajb.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Streaming
ZLM_API_URL=http://localhost:8000
ZLM_SECRET=035c73f7-bb6b-4889-a715-d9eb2d1925cc
SRS_API_URL=http://localhost:8080

# Wasabi S3
WASABI_ACCESS_KEY=your-access-key
WASABI_SECRET_KEY=your-secret-key
WASABI_BUCKET=your-bucket
WASABI_REGION=us-east-1
WASABI_ENDPOINT=https://s3.wasabisys.com

# Worker
WORKER_TOKEN=your-worker-token
```

#### Arquivo backend/.env
```env
# Banco de Dados
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/newcam

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=24h

# Servidor
PORT=3002
NODE_ENV=development
```

## 🔧 Status Atual do Sistema

### ✅ Componentes Funcionais
- **Frontend React**: Interface responsiva operacional
- **Backend API**: Endpoints principais funcionando
- **ZLMediaKit**: Servidor de streaming ativo
- **PostgreSQL**: Banco de dados configurado
- **Redis**: Cache e sessões operacionais
- **Docker**: Containerização completa
- **Nginx**: Proxy reverso em produção

### 🔄 Funcionalidades Implementadas
- **Autenticação JWT**: Login/logout seguro
- **Gerenciamento de Câmeras**: CRUD completo
- **Streaming em Tempo Real**: HLS e RTSP
- **Gravação Contínua**: Armazenamento automático
- **Upload S3**: Backup em nuvem
- **Dashboard**: Interface de monitoramento
- **WebSocket**: Comunicação em tempo real
- **Sistema de Logs**: Monitoramento detalhado

### 📊 Métricas Atuais
- **Uptime**: 99.5% (produção)
- **Latência Média**: <200ms
- **Streams Simultâneos**: Até 50 câmeras
- **Armazenamento**: Ilimitado (S3)
- **Usuários Concorrentes**: Até 100

## 🚀 Comandos de Execução

### Desenvolvimento Local
```bash
# Instalar dependências
npm install

# Desenvolvimento (todos os serviços)
npm run dev

# Apenas frontend
npm run dev:frontend

# Apenas backend
npm run dev:backend

# Testes
npm test

# Build para produção
npm run build
```

### Docker Compose
```bash
# Iniciar todos os serviços
docker-compose up -d

# Iniciar serviços específicos
docker-compose up -d postgres redis

# Logs em tempo real
docker-compose logs -f

# Parar serviços
docker-compose down

# Rebuild containers
docker-compose up --build
```

## 📚 Documentação Adicional

- **README.md**: Documentação principal do projeto
- **DEPLOY.md**: Guia de deploy em produção
- **docs/**: Documentação técnica detalhada
- **.trae/documents/**: Análises e relatórios do sistema

## 🔍 Monitoramento e Logs

### Endpoints de Saúde
- **Local**: http://localhost:3002/api/health
- **Produção**: http://66.94.104.241/api/health

### Logs do Sistema
```bash
# Logs do backend
tail -f backend/logs/app.log

# Logs do Docker
docker-compose logs -f backend

# Logs do ZLMediaKit
docker-compose logs -f zlmediakit
```

---

**Sistema NewCAM** - Vigilância Profissional por Câmeras IP  
**Versão**: 2.0  
**Última Atualização**: Janeiro 2025  
**Status**: ✅ Operacional