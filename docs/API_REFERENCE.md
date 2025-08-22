# API Reference - NewCAM

Documentação completa da API REST do sistema NewCAM.

## Base URL

```
Development: http://localhost:3002/api
Production:  http://66.94.104.241/api
```

## Autenticação

Todas as rotas protegidas requerem autenticação via JWT Bearer token:

```http
Authorization: Bearer <token>
```

### Endpoints de Autenticação

#### POST /auth/login
Realizar login no sistema.

**Request:**
```json
{
  "email": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "success": true,
  "tokens": {
    "accessToken": "string",
    "refreshToken": "string"
  },
  "user": {
    "id": "string",
    "email": "string",
    "full_name": "string",
    "role": "admin|integrator|client|viewer"
  }
}
```

#### POST /auth/refresh
Renovar token de acesso.

**Request:**
```json
{
  "refreshToken": "string"
}
```

#### GET /auth/me
Obter dados do usuário atual.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "string",
    "email": "string",
    "full_name": "string",
    "role": "string",
    "status": "active|inactive"
  }
}
```

## Usuários

### GET /users
Listar usuários do sistema.

**Parâmetros:**
- `page` (optional): Número da página
- `limit` (optional): Itens por página
- `search` (optional): Busca por nome ou email
- `role` (optional): Filtrar por role
- `status` (optional): Filtrar por status

**Response:**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "string",
        "username": "string",
        "email": "string",
        "full_name": "string",
        "role": "admin|integrator|client|viewer",
        "status": "active|inactive",
        "created_at": "string",
        "last_login": "string"
      }
    ],
    "pagination": {
      "current_page": 1,
      "total_pages": 10,
      "total_count": 100,
      "per_page": 10
    }
  }
}
```

### POST /users
Criar novo usuário.

**Request:**
```json
{
  "username": "string",
  "email": "string",
  "full_name": "string",
  "password": "string",
  "role": "admin|integrator|client|viewer",
  "permissions": ["string"],
  "camera_access": ["string"]
}
```

### PUT /users/:id
Atualizar usuário existente.

### PUT /users/:id/status
Alterar status do usuário.

**Request:**
```json
{
  "status": "active|inactive"
}
```

### POST /users/:id/reset-password
Reset administrativo de senha.

**Request:**
```json
{
  "new_password": "string"
}
```

### GET /users/export
Exportar usuários em CSV.

**Response:** Arquivo CSV com dados dos usuários.

### DELETE /users/:id
Excluir usuário.

## Câmeras

### GET /cameras
Listar câmeras do sistema.

**Response:**
```json
{
  "success": true,
  "cameras": [
    {
      "id": "string",
      "name": "string",
      "location": "string",
      "rtsp_url": "string",
      "status": "active|inactive|offline",
      "stream_type": "rtsp|rtmp",
      "resolution": "string",
      "fps": "number",
      "created_at": "string"
    }
  ]
}
```

### POST /cameras
Criar nova câmera.

**Request:**
```json
{
  "name": "string",
  "location": "string",
  "rtsp_url": "string",
  "stream_type": "rtsp|rtmp",
  "resolution": "string",
  "fps": "number"
}
```

### PUT /cameras/:id
Atualizar câmera existente.

### DELETE /cameras/:id
Excluir câmera.

### POST /cameras/:id/start-stream
Iniciar stream da câmera.

### POST /cameras/:id/stop-stream
Parar stream da câmera.

## Gravações

### GET /recordings
Listar gravações.

**Parâmetros:**
- `page` (optional): Número da página
- `limit` (optional): Itens por página  
- `camera_id` (optional): Filtrar por câmera
- `start_date` (optional): Data inicial (ISO string)
- `end_date` (optional): Data final (ISO string)
- `event_type` (optional): Tipo de evento
- `search` (optional): Busca por nome

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "string",
      "camera_id": "string",
      "camera_name": "string",
      "created_at": "string",
      "duration": "number",
      "duration_formatted": "string",
      "file_size": "number",
      "file_size_formatted": "string",
      "quality": "low|medium|high|ultra",
      "event_type": "motion|scheduled|manual|alert",
      "file_exists": "boolean",
      "download_url": "string",
      "stream_url": "string"
    }
  ],
  "pagination": {
    "pages": 10,
    "total": 100
  }
}
```

### DELETE /recordings/multiple
Excluir múltiplas gravações.

**Request:**
```json
{
  "recording_ids": ["string"],
  "confirm": true
}
```

**Response:**
```json
{
  "success": {
    "deleted_count": 5,
    "deleted_ids": ["id1", "id2", "id3"],
    "errors": []
  }
}
```

### POST /recordings/export
Exportar gravações selecionadas.

**Request:**
```json
{
  "recording_ids": ["string"],
  "format": "zip",
  "include_metadata": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Exportação iniciada",
  "export_id": "string",
  "status_url": "string"
}
```

### GET /recordings/export/:exportId/status
Verificar status de exportação.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "string",
    "status": "pending|processing|completed|failed",
    "progress": 75,
    "download_url": "string",
    "error": "string"
  }
}
```

## Sistema

### GET /health
Verificação de saúde da aplicação.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-21T10:30:00Z",
  "uptime": 3600,
  "services": {
    "database": "healthy",
    "zlmediakit": "healthy",
    "redis": "healthy"
  }
}
```

## Códigos de Status

- `200` - Sucesso
- `201` - Criado com sucesso
- `400` - Requisição inválida
- `401` - Não autorizado
- `403` - Acesso negado (role insuficiente)
- `404` - Recurso não encontrado
- `409` - Conflito (ex: email já existe)
- `422` - Erro de validação
- `500` - Erro interno do servidor

## Roles e Permissões

### admin
- Acesso total ao sistema
- Gerenciamento de usuários
- Configurações avançadas

### integrator  
- Acesso a câmeras e gravações
- Relatórios e logs
- Configurações básicas

### client
- Visualização de câmeras autorizadas
- Acesso a gravações próprias

### viewer
- Apenas visualização de streams
- Acesso limitado a gravações

{
  "email": "admin@newcam.local",
  "password": "admin123"
}
```

**Resposta**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "admin@newcam.local",
      "name": "Administrador",
      "role": "admin"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": "7d"
  }
}
```

### Headers de Autenticação
```http
Authorization: Bearer <jwt_token>
```

## Endpoints de Câmeras

### Listar Câmeras
```http
GET /api/cameras
Authorization: Bearer <token>
```

**Resposta**:
```json
{
  "success": true,
  "data": [
    {
      "id": "camera-uuid",
      "name": "Camera Frontal",
      "ip": "192.168.1.100",
      "rtsp_url": "rtsp://192.168.1.100:554/stream1",
      "status": "online",
      "recording_enabled": true,
      "stream_type": "rtsp",
      "created_at": "2025-01-01T10:00:00Z",
      "updated_at": "2025-01-01T12:00:00Z"
    }
  ],
  "count": 1
}
```

### Criar Câmera
```http
POST /api/cameras
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Nova Câmera",
  "ip": "192.168.1.101",
  "rtsp_url": "rtsp://192.168.1.101:554/stream1",
  "recording_enabled": true,
  "stream_type": "rtsp"
}
```

### Atualizar Câmera
```http
PUT /api/cameras/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Câmera Atualizada",
  "recording_enabled": false
}
```

### Deletar Câmera
```http
DELETE /api/cameras/:id
Authorization: Bearer <token>
```

### Status da Câmera
```http
GET /api/cameras/:id/status
Authorization: Bearer <token>
```

**Resposta**:
```json
{
  "success": true,
  "data": {
    "camera_id": "camera-uuid",
    "status": "online",
    "stream_active": true,
    "recording_active": true,
    "last_seen": "2025-01-01T12:30:00Z",
    "bitrate": 2048000,
    "fps": 25,
    "resolution": "1920x1080"
  }
}
```

## Endpoints de Streams

### Listar Streams Ativos
```http
GET /api/streams
Authorization: Bearer <token>
```

### Iniciar Stream
```http
POST /api/streams/start
Authorization: Bearer <token>
Content-Type: application/json

{
  "camera_id": "camera-uuid",
  "rtsp_url": "rtsp://192.168.1.100:554/stream1"
}
```

### Parar Stream
```http
POST /api/streams/stop
Authorization: Bearer <token>
Content-Type: application/json

{
  "stream_id": "stream-uuid"
}
```

### URL de Stream HLS
```http
GET /api/streams/:id/hls
Authorization: Bearer <token>
```

**Resposta**:
```json
{
  "success": true,
  "data": {
    "hls_url": "http://localhost:8000/live/camera-uuid.m3u8",
    "stream_id": "stream-uuid",
    "status": "active"
  }
}
```

## Endpoints de Gravações

### Listar Gravações
```http
GET /api/recordings?page=1&limit=20&camera_id=uuid&status=completed
Authorization: Bearer <token>
```

**Parâmetros de Query**:
- `page`: Página (padrão: 1)
- `limit`: Itens por página (padrão: 20, máx: 100)
- `camera_id`: Filtrar por câmera
- `status`: `recording`, `completed`, `failed`
- `start_date`: ISO 8601 date
- `end_date`: ISO 8601 date

**Resposta**:
```json
{
  "success": true,
  "data": [
    {
      "id": "recording-uuid",
      "camera_id": "camera-uuid",
      "camera_name": "Camera Frontal",
      "filename": "camera-uuid_20250101_100000.mp4",
      "file_path": "storage/www/record/live/camera-uuid/2025-01-01/",
      "file_size": 104857600,
      "duration": 1800,
      "status": "completed",
      "upload_status": "uploaded",
      "s3_key": "recordings/camera-uuid/2025/01/01/camera-uuid_20250101_100000.mp4",
      "created_at": "2025-01-01T10:00:00Z",
      "completed_at": "2025-01-01T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

### Detalhes da Gravação
```http
GET /api/recordings/:id
Authorization: Bearer <token>
```

### Iniciar Gravação Manual
```http
POST /api/recordings/start
Authorization: Bearer <token>
Content-Type: application/json

{
  "camera_id": "camera-uuid",
  "duration": 3600
}
```

### Parar Gravação
```http
POST /api/recordings/stop
Authorization: Bearer <token>
Content-Type: application/json

{
  "recording_id": "recording-uuid"
}
```

## Endpoints de Arquivos de Gravação

### Stream de Gravação (Reprodução)
```http
GET /api/recording-files/:id/stream
Authorization: Bearer <token>
Range: bytes=0-1023 (opcional)
```

**Resposta**: 
- Status 200: Stream direto do arquivo
- Status 302: Redirect para S3 presigned URL
- Status 206: Partial content (com Range header)

### Stream H264 (Compatível com Navegador)
```http
GET /api/recording-files/:id/play-web
Authorization: Bearer <token>
```

**Resposta**: Stream transcodificado H264 em tempo real

### Download de Gravação
```http
GET /api/recording-files/:id/download
Authorization: Bearer <token>
```

**Resposta**:
- Status 302: Redirect para S3 presigned URL
- Status 200: Download direto do arquivo local
- Headers: `Content-Disposition: attachment; filename="..."`

### Informações do Arquivo
```http
HEAD /api/recording-files/:id/info
Authorization: Bearer <token>
```

**Headers de Resposta**:
```http
Content-Length: 104857600
Content-Type: video/mp4
X-File-Size: 104857600
X-Duration: 1800
X-Storage-Location: s3|local
X-Upload-Status: uploaded
```

## Endpoints de Upload S3

### Status de Upload
```http
GET /api/recordings/:id/upload-status
Authorization: Bearer <token>
```

**Resposta**:
```json
{
  "success": true,
  "data": {
    "recording_id": "recording-uuid",
    "upload_status": "uploading",
    "upload_progress": 65,
    "upload_started_at": "2025-01-01T11:00:00Z",
    "upload_retry_count": 0,
    "s3_key": "recordings/camera-uuid/2025/01/01/file.mp4",
    "s3_size": 67108864
  }
}
```

### Forçar Upload Manual
```http
POST /api/recordings/:id/upload
Authorization: Bearer <token>
```

### Estatísticas da Fila de Upload
```http
GET /api/recordings/upload/queue-stats
Authorization: Bearer <token>
```

**Resposta**:
```json
{
  "success": true,
  "data": {
    "queue_size": 5,
    "processing": 2,
    "completed_today": 150,
    "failed_count": 3,
    "success_rate": 95.2,
    "avg_upload_time": 45000,
    "total_uploaded_size": 10737418240
  }
}
```

### Retry de Uploads Falhados
```http
POST /api/recordings/upload/retry-failed
Authorization: Bearer <token>
Content-Type: application/json

{
  "max_retries": 3,
  "older_than_hours": 1
}
```

## Endpoints de Webhooks

### Webhook ZLMediaKit (Interno)
```http
POST /api/hooks/on_record_mp4
Content-Type: application/json

{
  "mediaServerId": "newcam-server",
  "app": "live",
  "stream": "camera-uuid",
  "file_path": "/opt/media/bin/www/record/live/camera-uuid/2025-01-01/file.mp4",
  "file_size": 104857600,
  "folder": "/opt/media/bin/www/record/live/camera-uuid/2025-01-01/",
  "start_time": 1704096000,
  "time_len": 1800,
  "url": "record/live/camera-uuid/2025-01-01/file.mp4"
}
```

## Endpoints de Monitoramento

### Health Check
```http
GET /api/health
```

**Resposta**:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-01T12:00:00Z",
  "services": {
    "database": "healthy",
    "redis": "healthy",
    "zlmediakit": "healthy",
    "s3": "healthy"
  },
  "version": "1.0.0"
}
```

### Métricas do Sistema
```http
GET /api/metrics
Authorization: Bearer <token>
```

**Resposta**:
```json
{
  "success": true,
  "data": {
    "system": {
      "cpu": 25.5,
      "memory": {
        "used": 8589934592,
        "total": 17179869184,
        "percentage": 50
      },
      "uptime": 86400
    },
    "cameras": {
      "total": 10,
      "online": 8,
      "offline": 2,
      "recording": 6
    },
    "recordings": {
      "total": 1500,
      "today": 25,
      "total_size": 107374182400
    },
    "uploads": {
      "queue_size": 3,
      "processing": 1,
      "completed": 1450,
      "failed": 15,
      "success_rate": 99.0
    }
  }
}
```

### Logs do Sistema
```http
GET /api/logs?level=error&service=recording&limit=100
Authorization: Bearer <token>
```

## Endpoints de Administração

### Listar Usuários
```http
GET /api/users
Authorization: Bearer <token>
```

### Criar Usuário
```http
POST /api/users
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "user@example.com",
  "name": "Novo Usuário",
  "password": "securepassword",
  "role": "user"
}
```

### Configurações do Sistema
```http
GET /api/settings
Authorization: Bearer <token>
```

### Feature Flags
```http
GET /api/feature-flags
Authorization: Bearer <token>
```

**Resposta**:
```json
{
  "success": true,
  "data": {
    "s3_upload_enabled": false,
    "prefer_s3_streaming": false,
    "recording_enabled": true,
    "monitoring_enabled": true,
    "ai_enabled": false
  }
}
```

### Atualizar Feature Flag
```http
PUT /api/feature-flags/:flag_name
Authorization: Bearer <token>
Content-Type: application/json

{
  "enabled": true
}
```

## Códigos de Status HTTP

| Código | Descrição |
|--------|-----------|
| 200 | OK - Sucesso |
| 201 | Created - Recurso criado |
| 204 | No Content - Sucesso sem conteúdo |
| 206 | Partial Content - Conteúdo parcial (Range) |
| 302 | Found - Redirect (S3 URLs) |
| 400 | Bad Request - Dados inválidos |
| 401 | Unauthorized - Token inválido/ausente |
| 403 | Forbidden - Permissão negada |
| 404 | Not Found - Recurso não encontrado |
| 409 | Conflict - Conflito de dados |
| 422 | Unprocessable Entity - Validação falhou |
| 429 | Too Many Requests - Rate limit |
| 500 | Internal Server Error - Erro do servidor |
| 503 | Service Unavailable - Serviço indisponível |

## Estrutura de Resposta

### Sucesso
```json
{
  "success": true,
  "data": { /* dados do resultado */ },
  "message": "Operação realizada com sucesso" // opcional
}
```

### Erro
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dados inválidos fornecidos",
    "details": {
      "field": "email",
      "issue": "Email já está em uso"
    }
  },
  "timestamp": "2025-01-01T12:00:00Z"
}
```

## Rate Limiting

- **Limite**: 200 requests por 15 minutos por IP
- **Headers de Resposta**:
  ```http
  X-RateLimit-Limit: 200
  X-RateLimit-Remaining: 195
  X-RateLimit-Reset: 1704096900
  ```

## WebSocket (Socket.IO)

### Conexão
```javascript
const socket = io('http://localhost:3002', {
  auth: {
    token: 'jwt_token_here'
  }
});
```

### Eventos Disponíveis

#### Camera Status Updates
```javascript
socket.on('camera:status', (data) => {
  console.log('Camera status:', data);
  // { camera_id, status, timestamp }
});
```

#### Recording Events
```javascript
socket.on('recording:started', (data) => {
  console.log('Recording started:', data);
});

socket.on('recording:completed', (data) => {
  console.log('Recording completed:', data);
});
```

#### Upload Progress
```javascript
socket.on('upload:progress', (data) => {
  console.log('Upload progress:', data);
  // { recording_id, progress, status }
});
```

#### System Metrics
```javascript
socket.on('metrics:update', (data) => {
  console.log('System metrics:', data);
});
```

## Exemplos de Uso

### JavaScript/Node.js
```javascript
const axios = require('axios');

const api = axios.create({
  baseURL: 'http://localhost:3002/api',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

// Listar câmeras
const cameras = await api.get('/cameras');

// Criar nova câmera
const newCamera = await api.post('/cameras', {
  name: 'Nova Câmera',
  rtsp_url: 'rtsp://192.168.1.100:554/stream1'
});
```

### cURL
```bash
# Login
curl -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@newcam.local","password":"admin123"}'

# Listar câmeras
curl -X GET http://localhost:3002/api/cameras \
  -H "Authorization: Bearer $TOKEN"

# Stream de gravação
curl -X GET http://localhost:3002/api/recording-files/uuid/stream \
  -H "Authorization: Bearer $TOKEN" \
  -H "Range: bytes=0-1023"
```

## Versionamento da API

- **Versão Atual**: v1
- **Versionamento**: Via URL path (`/api/v1/`)
- **Compatibilidade**: Mantida por pelo menos 6 meses
- **Depreciação**: Comunicada com 90 dias de antecedência

## Documentação Interativa

- **Swagger UI**: `http://localhost:3002/api-docs` (desenvolvimento)
- **Postman Collection**: Disponível no repositório
- **Insomnia Workspace**: Link na documentação principal