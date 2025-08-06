# Arquitetura Técnica - Sistema NewCAM

## 1. Arquitetura Geral do Sistema

### 1.1 Diagrama de Arquitetura

```mermaid
graph TD
    A[User Browser] --> B[React Frontend Application]
    B --> C[Nginx Proxy]
    C --> D[Backend API]
    D --> E[Supabase Database]
    D --> F[Redis Cache]
    D --> G[ZLMediaKit]
    D --> H[Worker Service]
    G --> I[Câmeras IP RTSP]
    H --> J[Wasabi S3 Storage]
    
    subgraph "Frontend Layer"
        B
    end
    
    subgraph "Proxy Layer"
        C
    end
    
    subgraph "Backend Layer"
        D
        H
    end
    
    subgraph "Media Layer"
        G
    end
    
    subgraph "Data Layer"
        E
        F
        J
    end
    
    subgraph "External Services"
        I
    end
```

## 2. Descrição das Tecnologias

- **Frontend**: React@18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js@18 + Express + Socket.IO
- **Database**: Supabase (PostgreSQL)
- **Cache**: Redis
- **Media Server**: ZLMediaKit
- **Storage**: Wasabi S3
- **Containerization**: Docker + Docker Compose

## 3. Definições de Rotas

### 3.1 Frontend Routes

| Route | Purpose |
|-------|--------|
| `/` | Dashboard principal com grid de câmeras |
| `/dashboard` | Dashboard com métricas e estatísticas |
| `/cameras` | Gerenciamento de câmeras (CRUD) |
| `/cameras/:id` | Visualização individual da câmera |
| `/recordings` | Lista de gravações disponíveis |
| `/recordings/:id` | Reprodução de gravação específica |
| `/settings` | Configurações do sistema |
| `/login` | Página de autenticação |

### 3.2 Proxy Configuration (Vite)

```typescript
proxy: {
  '/api': {
    target: 'http://localhost:3002',
    changeOrigin: true,
    secure: false
  },
  '/live': {
    target: 'http://localhost:8000',
    changeOrigin: true,
    secure: false
  },
  '/hls': {
    target: 'http://localhost:8000',
    changeOrigin: true,
    secure: false
  }
}
```

## 4. Definições de API

### 4.1 Core API

#### Autenticação
```
POST /api/auth/login
```

Request:
| Param Name | Param Type | isRequired | Description |
|------------|------------|------------|-------------|
| email | string | true | Email do usuário |
| password | string | true | Senha do usuário |

Response:
| Param Name | Param Type | Description |
|------------|------------|-------------|
| token | string | JWT token para autenticação |
| user | object | Dados do usuário |

Example:
```json
{
  "email": "gouveiarx@gmail.com",
  "password": "Teste123"
}
```

#### Câmeras
```
GET /api/cameras
```

Response:
| Param Name | Param Type | Description |
|------------|------------|-------------|
| cameras | array | Lista de câmeras cadastradas |

```
POST /api/cameras
```

Request:
| Param Name | Param Type | isRequired | Description |
|------------|------------|------------|-------------|
| name | string | true | Nome da câmera |
| rtsp_url | string | true | URL RTSP da câmera |
| location | string | false | Localização da câmera |

#### Streaming
```
POST /api/streams/:id/start
```

Request:
| Param Name | Param Type | isRequired | Description |
|------------|------------|------------|-------------|
| id | string | true | ID da câmera |

Response:
| Param Name | Param Type | Description |
|------------|------------|-------------|
| hls_url | string | URL do stream HLS |
| status | string | Status do stream |

#### Gravações
```
GET /api/recordings
```

Response:
| Param Name | Param Type | Description |
|------------|------------|-------------|
| recordings | array | Lista de gravações disponíveis |

### 4.2 ZLMediaKit Hooks

```
POST /api/hook/on_publish
```

Request:
| Param Name | Param Type | isRequired | Description |
|------------|------------|------------|-------------|
| app | string | true | Nome da aplicação |
| stream | string | true | Nome do stream |
| params | string | false | Parâmetros adicionais |

```
POST /api/hook/on_record_mp4
```

Request:
| Param Name | Param Type | isRequired | Description |
|------------|------------|------------|-------------|
| app | string | true | Nome da aplicação |
| stream | string | true | Nome do stream |
| file_path | string | true | Caminho do arquivo gravado |

## 5. Arquitetura do Servidor

```mermaid
graph TD
    A[Client Request] --> B[Nginx Proxy]
    B --> C[Express Router]
    C --> D[Authentication Middleware]
    D --> E[Controller Layer]
    E --> F[Service Layer]
    F --> G[Repository Layer]
    G --> H[(Supabase Database)]
    
    F --> I[ZLMediaKit API]
    F --> J[Redis Cache]
    F --> K[S3 Storage]
    
    subgraph "Server Architecture"
        C
        D
        E
        F
        G
    end
    
    subgraph "External Services"
        I
        J
        K
        H
    end
```

### 5.1 Middleware Stack

1. **CORS Middleware**: Configuração de origens permitidas
2. **Authentication Middleware**: Validação JWT
3. **Rate Limiting**: Proteção contra spam
4. **Logging Middleware**: Winston para logs estruturados
5. **Error Handler**: Tratamento centralizado de erros

### 5.2 Service Layer

- **CameraService**: Gerenciamento de câmeras
- **StreamingService**: Controle de streams
- **RecordingService**: Gerenciamento de gravações
- **AuthService**: Autenticação e autorização
- **S3Service**: Upload e download de arquivos

## 6. Modelo de Dados

### 6.1 Definição do Modelo de Dados

```mermaid
erDiagram
    USERS ||--o{ CAMERAS : owns
    CAMERAS ||--o{ STREAMS : generates
    CAMERAS ||--o{ RECORDINGS : creates
    STREAMS ||--o{ STREAM_SESSIONS : has
    RECORDINGS ||--o{ RECORDING_FILES : contains
    
    USERS {
        uuid id PK
        string email
        string password_hash
        string name
        timestamp created_at
        timestamp updated_at
    }
    
    CAMERAS {
        uuid id PK
        uuid user_id FK
        string name
        string rtsp_url
        string location
        boolean is_active
        json settings
        timestamp created_at
        timestamp updated_at
    }
    
    STREAMS {
        uuid id PK
        uuid camera_id FK
        string stream_key
        string hls_url
        string status
        timestamp started_at
        timestamp ended_at
    }
    
    RECORDINGS {
        uuid id PK
        uuid camera_id FK
        string file_path
        string s3_url
        integer duration
        bigint file_size
        timestamp recorded_at
        timestamp uploaded_at
    }
    
    STREAM_SESSIONS {
        uuid id PK
        uuid stream_id FK
        string client_ip
        timestamp connected_at
        timestamp disconnected_at
    }
    
    RECORDING_FILES {
        uuid id PK
        uuid recording_id FK
        string file_name
        string file_type
        string local_path
        string s3_key
        timestamp created_at
    }
```

### 6.2 Data Definition Language

#### Tabela de Usuários
```sql
-- create table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- create index
CREATE INDEX idx_users_email ON users(email);

-- init data
INSERT INTO users (email, password_hash, name) VALUES 
('gouveiarx@gmail.com', '$2b$10$hashed_password', 'Admin User');
```

#### Tabela de Câmeras
```sql
-- create table
CREATE TABLE cameras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    rtsp_url VARCHAR(500) NOT NULL,
    location VARCHAR(200),
    is_active BOOLEAN DEFAULT true,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- create index
CREATE INDEX idx_cameras_user_id ON cameras(user_id);
CREATE INDEX idx_cameras_is_active ON cameras(is_active);
```

#### Tabela de Streams
```sql
-- create table
CREATE TABLE streams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    camera_id UUID REFERENCES cameras(id) ON DELETE CASCADE,
    stream_key VARCHAR(100) UNIQUE NOT NULL,
    hls_url VARCHAR(500),
    status VARCHAR(20) DEFAULT 'inactive',
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE
);

-- create index
CREATE INDEX idx_streams_camera_id ON streams(camera_id);
CREATE INDEX idx_streams_status ON streams(status);
CREATE INDEX idx_streams_started_at ON streams(started_at DESC);
```

#### Tabela de Gravações
```sql
-- create table
CREATE TABLE recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    camera_id UUID REFERENCES cameras(id) ON DELETE CASCADE,
    file_path VARCHAR(500) NOT NULL,
    s3_url VARCHAR(500),
    duration INTEGER, -- em segundos
    file_size BIGINT, -- em bytes
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    uploaded_at TIMESTAMP WITH TIME ZONE
);

-- create index
CREATE INDEX idx_recordings_camera_id ON recordings(camera_id);
CREATE INDEX idx_recordings_recorded_at ON recordings(recorded_at DESC);
CREATE INDEX idx_recordings_uploaded_at ON recordings(uploaded_at DESC);
```

#### Políticas RLS (Row Level Security)
```sql
-- Habilitar RLS
ALTER TABLE cameras ENABLE ROW LEVEL SECURITY;
ALTER TABLE streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;

-- Políticas para câmeras
CREATE POLICY "Users can view own cameras" ON cameras
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cameras" ON cameras
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own cameras" ON cameras
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own cameras" ON cameras
    FOR DELETE USING (auth.uid() = user_id);

-- Políticas para streams
CREATE POLICY "Users can view own streams" ON streams
    FOR SELECT USING (auth.uid() IN (
        SELECT user_id FROM cameras WHERE id = streams.camera_id
    ));

-- Políticas para gravações
CREATE POLICY "Users can view own recordings" ON recordings
    FOR SELECT USING (auth.uid() IN (
        SELECT user_id FROM cameras WHERE id = recordings.camera_id
    ));
```

## 7. Configuração de Ambiente

### 7.1 Variáveis de Ambiente Essenciais

```env
# Supabase
SUPABASE_URL=https://grkvfzuadctextnbpajb.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# ZLMediaKit
ZLM_API_URL=http://localhost:8000
ZLM_SECRET=035c73f7-bb6b-4889-a715-d9eb2d1925cc

# Redis
REDIS_URL=redis://localhost:6379

# S3 Storage
WASABI_ACCESS_KEY=your-access-key
WASABI_SECRET_KEY=your-secret-key
WASABI_BUCKET=your-bucket
WASABI_REGION=us-east-1
WASABI_ENDPOINT=https://s3.wasabisys.com

# JWT
JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=24h

# Server
PORT=3002
NODE_ENV=development
```

### 7.2 Docker Configuration

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: newcam
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  zlmediakit:
    image: panjjo/zlmediakit:latest
    ports:
      - "8000:80"
      - "554:554"
      - "1935:1935"
      - "8080:8080"
    volumes:
      - zlm_data:/opt/media

  backend:
    build: ./backend
    ports:
      - "3002:3002"
    depends_on:
      - postgres
      - redis
      - zlmediakit
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/newcam
      - REDIS_URL=redis://redis:6379
      - ZLM_API_URL=http://zlmediakit:80

  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    depends_on:
      - backend

  worker:
    build: ./worker
    depends_on:
      - backend
      - redis
    environment:
      - BACKEND_URL=http://backend:3002
      - REDIS_URL=redis://redis:6379

volumes:
  postgres_data:
  redis_data:
  zlm_data:

networks:
  default:
    name: newcam_network
```

---

**Arquitetura Técnica NewCAM**  
**Versão**: 2.0  
**Última Atualização**: Janeiro 2025  
**Status**: ✅ Documentado