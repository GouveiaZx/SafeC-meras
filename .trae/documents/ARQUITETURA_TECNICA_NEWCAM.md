# 🏗️ NewCAM - Arquitetura Técnica

## 1. Arquitetura Geral do Sistema

### 📊 Diagrama de Arquitetura

```mermaid
graph TB
    subgraph "Frontend Layer"
        A[React Frontend]
        B[Vite Dev Server]
    end
    
    subgraph "Backend Layer"
        C[Node.js API Server]
        D[Worker Process]
        E[Streaming Service]
    end
    
    subgraph "Streaming Layer"
        F[ZLMediaKit]
        G[SRS Server]
    end
    
    subgraph "Database Layer"
        H[Supabase PostgreSQL]
        I[Redis Cache]
    end
    
    subgraph "Storage Layer"
        J[Local Storage]
        K[Wasabi S3]
    end
    
    subgraph "External Services"
        L[IP Cameras]
        M[RTSP/RTMP Sources]
    end
    
    A --> C
    C --> H
    C --> I
    C --> F
    C --> G
    D --> C
    E --> F
    E --> G
    C --> J
    C --> K
    F --> L
    F --> M
    G --> L
    G --> M
```

### 🔧 Componentes Principais

#### Frontend (React)
- **Framework**: React 18 com TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **State Management**: React Context + Hooks
- **Routing**: React Router DOM
- **HTTP Client**: Axios

#### Backend (Node.js)
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Authentication**: JWT
- **File Upload**: Multer
- **Logging**: Winston
- **Security**: Helmet, CORS

#### Streaming
- **Primary**: ZLMediaKit
- **Secondary**: SRS (Simple Realtime Server)
- **Protocols**: RTSP, RTMP, HLS
- **Processing**: FFmpeg

#### Database
- **Primary**: Supabase (PostgreSQL)
- **Cache**: Redis
- **Storage**: Wasabi S3 + Local Storage

---

## 2. Tecnologias e Dependências

### Frontend
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.8.0",
    "typescript": "^4.9.4",
    "axios": "^1.3.0",
    "tailwindcss": "^3.2.0",
    "lucide-react": "^0.263.0",
    "react-hot-toast": "^2.4.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^3.1.0",
    "vite": "^4.1.0"
  }
}
```

### Backend
```json
{
  "dependencies": {
    "express": "^4.18.2",
    "@supabase/supabase-js": "^2.21.0",
    "jsonwebtoken": "^9.0.0",
    "bcryptjs": "^2.4.3",
    "multer": "^1.4.5",
    "winston": "^3.8.2",
    "helmet": "^6.1.5",
    "cors": "^2.8.5",
    "redis": "^4.6.5",
    "aws-sdk": "^2.1345.0"
  }
}
```

---

## 3. Definições de Rotas

### Frontend Routes

| Rota | Componente | Descrição |
|------|------------|----------|
| `/` | Dashboard | Página principal com visão geral |
| `/login` | Login | Autenticação de usuários |
| `/cameras` | Cameras | Gerenciamento de câmeras |
| `/streams` | Streams | Visualização de streams ativos |
| `/recordings` | Recordings | Histórico de gravações |
| `/settings` | Settings | Configurações do sistema |
| `/profile` | Profile | Perfil do usuário |

### Backend API Routes

#### Autenticação
```
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh
GET    /api/auth/me
```

#### Câmeras
```
GET    /api/cameras
POST   /api/cameras
GET    /api/cameras/:id
PUT    /api/cameras/:id
DELETE /api/cameras/:id
POST   /api/cameras/:id/test-connection
```

#### Streams
```
GET    /api/streams
POST   /api/streams/start/:cameraId
POST   /api/streams/stop/:streamId
GET    /api/streams/:cameraId/hls/:file
GET    /api/streams/:streamId/status
```

#### Gravações
```
GET    /api/recordings
GET    /api/recordings/:id
DELETE /api/recordings/:id
GET    /api/recordings/:id/download
```

#### Métricas
```
GET    /api/metrics/dashboard
GET    /api/metrics/cameras/:id
GET    /api/metrics/streams
GET    /api/metrics/system
```

---

## 4. APIs e Integrações

### 4.1 API de Autenticação

#### POST `/api/auth/login`
**Descrição**: Autenticar usuário

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "User Name",
      "role": "admin"
    }
  }
}
```

### 4.2 API de Câmeras

#### POST `/api/cameras`
**Descrição**: Criar nova câmera

**Request:**
```json
{
  "name": "Câmera Principal",
  "stream_type": "rtsp",
  "rtsp_url": "rtsp://user:pass@192.168.1.100:554/stream",
  "location": "Entrada Principal",
  "recording_enabled": true,
  "retention_days": 30
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Câmera Principal",
    "stream_type": "rtsp",
    "rtsp_url": "rtsp://user:pass@192.168.1.100:554/stream",
    "ip_address": "192.168.1.100",
    "location": "Entrada Principal",
    "status": "offline",
    "recording_enabled": true,
    "retention_days": 30,
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

### 4.3 API de Streaming

#### POST `/api/streams/start/:cameraId`
**Descrição**: Iniciar stream de uma câmera

**Request:**
```json
{
  "quality": "medium",
  "format": "hls",
  "audio": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "stream_id": "uuid",
    "camera_id": "uuid",
    "status": "active",
    "urls": {
      "hls": "http://localhost:3000/api/streams/uuid/hls/playlist.m3u8",
      "rtmp": "rtmp://localhost:1935/live/uuid",
      "rtsp": "rtsp://localhost:8554/live/uuid"
    },
    "started_at": "2024-01-01T00:00:00Z"
  }
}
```

---

## 5. Arquitetura do Servidor

### 📊 Diagrama de Camadas

```mermaid
graph TD
    A[Client / Frontend] --> B[Controller Layer]
    B --> C[Service Layer]
    C --> D[Repository Layer]
    D --> E[(Database)]
    
    B --> F[Middleware Layer]
    F --> G[Authentication]
    F --> H[Validation]
    F --> I[Logging]
    
    C --> J[External Services]
    J --> K[ZLMediaKit]
    J --> L[Wasabi S3]
    J --> M[Redis Cache]
    
    subgraph "Server Architecture"
        B
        C
        D
        F
        G
        H
        I
    end
```

### 🔧 Camadas do Sistema

#### Controller Layer
- **Responsabilidade**: Gerenciar requisições HTTP
- **Localização**: `src/controllers/`
- **Funções**: Validação de entrada, formatação de resposta

#### Service Layer
- **Responsabilidade**: Lógica de negócio
- **Localização**: `src/services/`
- **Funções**: Processamento de dados, integração com APIs

#### Repository Layer
- **Responsabilidade**: Acesso a dados
- **Localização**: `src/models/`
- **Funções**: Queries, transações, cache

#### Middleware Layer
- **Responsabilidade**: Interceptação de requisições
- **Localização**: `src/middleware/`
- **Funções**: Autenticação, validação, logging

---

## 6. Modelo de Dados

### 📊 Diagrama ER

```mermaid
erDiagram
    USERS ||--o{ CAMERAS : owns
    CAMERAS ||--o{ STREAMS : generates
    CAMERAS ||--o{ RECORDINGS : records
    STREAMS ||--o{ STREAM_METRICS : has
    CAMERAS ||--o{ CAMERA_METRICS : monitors
    USERS ||--o{ USER_SESSIONS : has
    
    USERS {
        uuid id PK
        string email UK
        string password_hash
        string name
        string role
        timestamp created_at
        timestamp updated_at
    }
    
    CAMERAS {
        uuid id PK
        uuid user_id FK
        string name
        string stream_type
        string rtsp_url
        string rtmp_url
        string ip_address
        string location
        string status
        boolean recording_enabled
        integer retention_days
        timestamp created_at
        timestamp updated_at
    }
    
    STREAMS {
        uuid id PK
        uuid camera_id FK
        string status
        json urls
        integer viewers
        integer bitrate
        timestamp started_at
        timestamp ended_at
    }
    
    RECORDINGS {
        uuid id PK
        uuid camera_id FK
        string filename
        string file_path
        bigint file_size
        integer duration
        timestamp recorded_at
        timestamp created_at
    }
    
    STREAM_METRICS {
        uuid id PK
        uuid stream_id FK
        integer viewers
        integer bitrate
        float fps
        timestamp recorded_at
    }
    
    CAMERA_METRICS {
        uuid id PK
        uuid camera_id FK
        string status
        integer response_time
        timestamp recorded_at
    }
    
    USER_SESSIONS {
        uuid id PK
        uuid user_id FK
        string token_hash
        timestamp expires_at
        timestamp created_at
    }
```

### 📝 DDL (Data Definition Language)

#### Tabela: users
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Permissões Supabase
GRANT SELECT ON users TO anon;
GRANT ALL PRIVILEGES ON users TO authenticated;
```

#### Tabela: cameras
```sql
CREATE TABLE cameras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    stream_type VARCHAR(10) NOT NULL CHECK (stream_type IN ('rtsp', 'rtmp')),
    rtsp_url TEXT,
    rtmp_url TEXT,
    ip_address INET,
    location VARCHAR(255),
    status VARCHAR(20) DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'error')),
    recording_enabled BOOLEAN DEFAULT false,
    retention_days INTEGER DEFAULT 30,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_cameras_user_id ON cameras(user_id);
CREATE INDEX idx_cameras_status ON cameras(status);
CREATE INDEX idx_cameras_stream_type ON cameras(stream_type);

-- Permissões Supabase
GRANT SELECT ON cameras TO anon;
GRANT ALL PRIVILEGES ON cameras TO authenticated;
```

#### Tabela: streams
```sql
CREATE TABLE streams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    camera_id UUID REFERENCES cameras(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error')),
    urls JSONB,
    viewers INTEGER DEFAULT 0,
    bitrate INTEGER DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_streams_camera_id ON streams(camera_id);
CREATE INDEX idx_streams_status ON streams(status);
CREATE INDEX idx_streams_started_at ON streams(started_at DESC);

-- Permissões Supabase
GRANT SELECT ON streams TO anon;
GRANT ALL PRIVILEGES ON streams TO authenticated;
```

---

## 7. Configurações de Ambiente

### 🔧 Variáveis de Ambiente

#### Backend (.env)
```env
# Servidor
PORT=3000
NODE_ENV=development
HOST=localhost

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# JWT
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=24h

# ZLMediaKit
ZLM_SECRET=your_zlm_secret
ZLMEDIAKIT_API_URL=http://localhost:8000
ZLMEDIAKIT_RTSP_PORT=8554
ZLMEDIAKIT_RTMP_PORT=1935
ZLMEDIAKIT_HTTP_PORT=8000

# SRS (opcional)
SRS_API_URL=http://localhost:1985
SRS_RTMP_PORT=1935
SRS_HTTP_PORT=8080

# Redis
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=
REDIS_DB=0

# Storage
STORAGE_TYPE=local # local | s3
LOCAL_STORAGE_PATH=./storage

# Wasabi S3
WASABI_ACCESS_KEY=your_access_key
WASABI_SECRET_KEY=your_secret_key
WASABI_BUCKET=your_bucket_name
WASABI_REGION=us-east-1
WASABI_ENDPOINT=https://s3.us-east-1.wasabisys.com

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/app.log

# Security
CORS_ORIGIN=http://localhost:5173
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100
```

#### Frontend (.env)
```env
# API
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000

# Features
VITE_ENABLE_RECORDINGS=true
VITE_ENABLE_METRICS=true
VITE_ENABLE_NOTIFICATIONS=true

# Debug
VITE_DEBUG_MODE=false
VITE_LOG_LEVEL=info
```

### ⚙️ Configuração ZLMediaKit

#### config.ini
```ini
[api]
port=8000
secret=your_secret_here
apiDebug=1

[general]
mediaServerId=NewCAM_Server
serverName=NewCAM

[rtsp]
port=8554
sslPort=322

[rtmp]
port=1935
sslPort=19350

[rtp]
port=10000

[hls]
segDur=2
segNum=3
segRetain=5
filePath=./storage/hls/

[hook]
enable=1
on_flow_report=
on_http_access=
on_play=
on_publish=
on_record_mp4=
on_rtsp_realm=
on_rtsp_auth=
on_stream_changed=
on_stream_none_reader=
on_stream_not_found=
on_server_started=

[record]
appName=live
filePath=./storage/recordings/
fileSecond=3600
```

---

## 8. Segurança e Performance

### 🔒 Medidas de Segurança

#### Autenticação e Autorização
```javascript
// JWT Configuration
const jwtConfig = {
  secret: process.env.JWT_SECRET,
  expiresIn: '24h',
  algorithm: 'HS256'
};

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 requests por IP
  message: 'Too many requests from this IP'
});

// CORS Configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN,
  credentials: true,
  optionsSuccessStatus: 200
};
```

#### Validação de Dados
```javascript
// Schema de validação para câmeras
const cameraSchema = {
  name: {
    type: 'string',
    required: true,
    minLength: 3,
    maxLength: 255
  },
  stream_type: {
    type: 'string',
    enum: ['rtsp', 'rtmp'],
    required: true
  },
  rtsp_url: {
    type: 'string',
    format: 'uri',
    required: function() {
      return this.stream_type === 'rtsp';
    }
  }
};
```

### ⚡ Otimizações de Performance

#### Cache Strategy
```javascript
// Redis Cache Configuration
const cacheConfig = {
  cameras: {
    ttl: 300, // 5 minutos
    key: 'cameras:list'
  },
  streams: {
    ttl: 60, // 1 minuto
    key: 'streams:active'
  },
  metrics: {
    ttl: 30, // 30 segundos
    key: 'metrics:dashboard'
  }
};
```

#### Database Optimization
```sql
-- Índices para performance
CREATE INDEX CONCURRENTLY idx_cameras_status_user ON cameras(status, user_id);
CREATE INDEX CONCURRENTLY idx_streams_active ON streams(status) WHERE status = 'active';
CREATE INDEX CONCURRENTLY idx_recordings_date ON recordings(recorded_at DESC);

-- Particionamento por data (recordings)
CREATE TABLE recordings_2024_01 PARTITION OF recordings
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
```

---

## 9. Monitoramento e Logs

### 📊 Sistema de Logs

#### Configuração Winston
```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log' 
    }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});
```

### 📈 Métricas de Sistema

#### Health Check Endpoint
```javascript
// GET /api/health
app.get('/api/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: await checkDatabase(),
      redis: await checkRedis(),
      zlmediakit: await checkZLMediaKit(),
      storage: await checkStorage()
    },
    metrics: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage()
    }
  };
  
  res.json(health);
});
```

---

## 10. Deploy e DevOps

### 🐳 Docker Configuration

#### docker-compose.yml
```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    volumes:
      - ./storage:/app/storage
      - ./logs:/app/logs
    depends_on:
      - redis
      - zlmediakit
    restart: unless-stopped

  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - backend
    restart: unless-stopped

  worker:
    build: ./worker
    environment:
      - NODE_ENV=production
    depends_on:
      - backend
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped

  zlmediakit:
    build: ./docker/zlmediakit
    ports:
      - "8000:8000"
      - "8554:8554"
      - "1935:1935"
    volumes:
      - ./storage:/opt/media/storage
    restart: unless-stopped

volumes:
  redis_data:
```

### 🚀 CI/CD Pipeline

#### GitHub Actions
```yaml
name: Deploy NewCAM

on:
  push:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to production
        run: |
          docker-compose -f docker-compose.prod.yml up -d --build
```

---

**🏗️ Arquitetura Técnica - NewCAM v2.1.0**

*Documentação técnica completa para desenvolvedores e arquitetos de sistema.*