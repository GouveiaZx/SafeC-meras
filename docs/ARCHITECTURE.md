# Arquitetura do Sistema NewCAM

## Visão Geral

NewCAM é um sistema de vigilância IP profissional construído com arquitetura de microsserviços, oferecendo escalabilidade, confiabilidade e performance para monitoramento em tempo real.

## Arquitetura de Alto Nível

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend      │    │     Worker      │
│   React + TS    │────│   Node.js API   │────│  Background     │
│   Port 5173     │    │   Port 3002     │    │  Processing     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   ZLMediaKit    │
                    │  Media Server   │
                    │   Port 8000     │
                    └─────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Supabase      │
                    │   PostgreSQL    │
                    │   Database      │
                    └─────────────────┘
```

## Componentes Principais

### 1. Frontend (React + TypeScript)
**Localização**: `frontend/`
**Tecnologias**: React 18, TypeScript, Vite, TailwindCSS
**Responsabilidades**:
- Interface de usuário responsiva
- Visualização de streams em tempo real
- Gerenciamento de câmeras
- Dashboard de monitoramento
- Player de gravações com transcodificação H264

**Estrutura**:
```
frontend/
├── src/
│   ├── components/     # Componentes reutilizáveis
│   ├── pages/         # Páginas da aplicação
│   ├── contexts/      # Context API (Auth, etc.)
│   ├── hooks/         # Custom hooks
│   ├── services/      # Chamadas API
│   └── utils/         # Utilitários
├── public/            # Assets estáticos
└── dist/             # Build de produção
```

### 2. Backend (Node.js + Express)
**Localização**: `backend/`
**Tecnologias**: Node.js, Express, Socket.IO, Winston
**Responsabilidades**:
- API REST para gerenciamento
- Autenticação JWT + Supabase
- Integração com ZLMediaKit
- Processamento de webhooks
- Sistema de upload S3 assíncrono

**Estrutura**:
```
backend/
├── src/
│   ├── routes/        # Endpoints da API
│   ├── services/      # Lógica de negócio
│   ├── middleware/    # Middlewares Express
│   ├── config/        # Configurações
│   ├── utils/         # Utilitários
│   ├── scripts/       # Scripts de manutenção
│   └── workers/       # Workers de background
└── storage/          # Armazenamento local
```

### 3. Worker (Processamento Background)
**Localização**: `worker/`
**Tecnologias**: Node.js, Bull Queue, Redis
**Responsabilidades**:
- Upload assíncrono para S3
- Processamento de gravações
- Limpeza de arquivos antigos
- Monitoramento de saúde do sistema

### 4. ZLMediaKit (Servidor de Mídia)
**Tecnologia**: C++ Media Server
**Responsabilidades**:
- Processamento de streams RTSP/RTMP
- Transcodificação de vídeo
- Geração de HLS para web
- Gravação de streams em MP4
- Webhooks para eventos de mídia

**Configuração**:
```ini
# docker/zlmediakit/config.ini
[general]
mediaServerId=newcam-server
flowThreshold=1024

[hls]
segDur=2
segNum=3
segRetain=5

[record]
appName=live
filePath=/opt/media/bin/www/record
```

### 5. Banco de Dados (Supabase/PostgreSQL)
**Tecnologia**: PostgreSQL + Supabase
**Responsabilidades**:
- Dados de câmeras e usuários
- Metadados de gravações
- Filas de upload
- Métricas do sistema
- Logs de auditoria

**Principais Tabelas**:
```sql
-- Câmeras
CREATE TABLE cameras (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  rtsp_url TEXT,
  status camera_status DEFAULT 'offline',
  recording_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Gravações
CREATE TABLE recordings (
  id UUID PRIMARY KEY,
  camera_id UUID REFERENCES cameras(id),
  filename TEXT NOT NULL,
  file_path TEXT,
  file_size BIGINT,
  duration INTEGER,
  upload_status upload_status DEFAULT 'pending',
  s3_key TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Fluxo de Dados

### 1. Streaming em Tempo Real
```
Câmera RTSP → ZLMediaKit → HLS → Frontend
     ↓
  Webhook → Backend → Database (metadata)
```

### 2. Gravação e Upload
```
Stream → ZLMediaKit → MP4 File → Local Storage
   ↓
Webhook → Backend → Upload Queue → Worker → S3
   ↓
Database (metadata + status)
```

### 3. Reprodução de Gravações
```
Frontend Request → Backend API → PathResolver
        ↓
Local File Check → S3 Presigned URL → Stream Response
        ↓
FFmpeg Transcoding (H264) → Frontend Player
```

## Serviços Backend Detalhados

### StreamingService
**Responsabilidades**:
- Comunicação com ZLMediaKit API
- Gerenciamento de streams ativos
- Controle de gravações
- Monitoramento de status

**Métodos principais**:
```javascript
class StreamingService {
  async startStream(cameraId, rtspUrl)
  async stopStream(streamId)
  async getStreamStatus(streamId)
  async startRecording(streamId)
  async stopRecording(streamId)
}
```

### RecordingService (Unificado)
**Responsabilidades**:
- Processamento de webhooks de gravação
- Normalização de paths
- Enfileiramento para upload S3
- Busca inteligente de arquivos

**Funcionalidades**:
- Path normalization across Windows/Unix
- Automatic S3 upload queue enrollment
- Smart file resolution (local → S3)
- Metadata extraction and storage

### UploadQueueService
**Responsabilidades**:
- Gerenciamento de fila de upload
- Retry logic com backoff exponencial
- Status tracking e metrics
- Idempotent operations

**Queue States**:
- `pending` → `queued` → `uploading` → `uploaded`
- `failed` → `retrying` → `cancelled`

### S3Service
**Responsabilidades**:
- Upload multipart para arquivos grandes
- Geração de URLs presignadas
- Progress tracking
- Error handling e retry

**Features**:
```javascript
class S3Service {
  async uploadFile(filePath, key, metadata, progressCallback)
  async uploadLargeFile(filePath, key) // Multipart
  async getSignedUrl(key, options)
  async headObject(key) // Metadata
}
```

### MetricsService
**Responsabilidades**:
- Coleta de métricas do sistema
- Performance monitoring
- Upload queue statistics
- Health alerts

**Métricas coletadas**:
- CPU, Memory, Disk usage
- Camera status (online/offline)
- Recording statistics
- Upload queue metrics
- Network performance

### FeatureFlagService
**Responsabilidades**:
- Runtime feature toggles
- Gradual rollout control
- Dependency validation
- Environment-based configuration

**Flags disponíveis**:
```javascript
const flags = {
  s3_upload_enabled: false,
  prefer_s3_streaming: false,
  delete_local_after_upload: false,
  recording_enabled: true,
  monitoring_enabled: true
}
```

## Integração S3/Wasabi

### Upload Workflow
```
1. Recording Complete → Webhook
2. RecordingService → Normalize Path
3. UploadQueueService → Enqueue
4. UploadWorker → Process Queue
5. S3Service → Upload File
6. Database → Update Status
7. Optional: Delete Local File
```

### Smart Endpoints
```javascript
// /api/recording-files/:id/stream
1. Check S3 availability
2. Generate presigned URL if available
3. Fallback to local file stream
4. Real-time H264 transcoding if needed

// /api/recording-files/:id/download
1. Prefer S3 presigned download URL
2. Fallback to local file download
3. Content-Disposition headers
```

## Segurança

### Autenticação
- JWT tokens com Supabase integration
- Worker token for inter-service communication
- Role-based access control (RBAC)

### Autorização
```javascript
const roles = {
  admin: ['*'],
  user: ['cameras:read', 'recordings:read'],
  client: ['streams:read'],
  integrator: ['api:read', 'webhooks:write']
}
```

### Network Security
- CORS protection
- Rate limiting (200 req/15min)
- Input validation e sanitization
- SQL injection protection via Supabase

## Performance e Escalabilidade

### Otimizações
- **HLS Streaming**: Adaptive bitrate, low latency
- **H264 Transcoding**: Real-time HEVC→H264 conversion
- **Caching**: Redis para sessões e metadata
- **CDN Ready**: S3 compatible com CloudFront
- **Database Indexing**: Optimized queries

### Scaling Strategies
- **Horizontal**: Multiple worker instances
- **Load Balancing**: Nginx upstream
- **Database**: Read replicas, connection pooling
- **Storage**: S3 multi-region, local caching

## Monitoramento e Observabilidade

### Logging
```javascript
const logger = createModuleLogger('ServiceName');
logger.info('Operation completed', { 
  operationId, 
  duration, 
  metadata 
});
```

### Metrics
- Prometheus-compatible metrics
- Custom dashboards
- Real-time alerts
- Performance tracking

### Health Checks
```bash
GET /health          # Application health
GET /api/health      # API health  
GET /api/metrics     # System metrics
```

## Deployment

### Development
```bash
npm run dev  # All services
docker-compose up -d  # Infrastructure
```

### Production
```bash
docker-compose -f docker-compose.prod.yml up -d
pm2 start ecosystem.config.js
nginx -s reload
```

### CI/CD Pipeline
1. **Build**: Frontend build + Backend compilation
2. **Test**: Unit tests + Integration tests
3. **Security**: Vulnerability scanning
4. **Deploy**: Blue-green deployment
5. **Monitor**: Health checks + Rollback

## Próximos Desenvolvimentos

### Roadmap
- [ ] Kubernetes deployment
- [ ] Multi-tenancy support
- [ ] AI-powered motion detection
- [ ] Mobile app (React Native)
- [ ] WebRTC real-time streaming
- [ ] Advanced analytics dashboard

### Melhorias Técnicas
- [ ] GraphQL API
- [ ] Event sourcing
- [ ] Microservices mesh
- [ ] Edge computing support
- [ ] Advanced caching strategies