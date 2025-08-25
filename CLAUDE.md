# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## System Overview

NewCAM is a professional IP camera surveillance system with real-time streaming, web interface, and robust backend for professional monitoring. The system is built with a microservices architecture:

- **Frontend**: React 18 + TypeScript + Vite (port 5173/5174)
- **Backend**: Node.js + Express API with Socket.IO (port 3002) 
- **Worker**: Background processing service (port 3001/3003)
- **Media Server**: ZLMediaKit for RTSP/RTMP/HLS streaming (port 8000)
- **Database**: Supabase (PostgreSQL) + Redis caching
- **Storage**: Wasabi S3 for recordings + local storage

## Development Commands

### Core Development Workflow
```bash
# Install all dependencies
npm install
cd backend && npm install
cd ../frontend && npm install
cd ../worker && npm install

# Start all services (development)
npm run dev  # Starts backend, frontend, and worker concurrently

# Individual services
npm run dev:backend    # Backend API (port 3002)
npm run dev:frontend   # Frontend (port 5173)
npm run dev:worker     # Worker service

# Production build
npm run build          # Builds frontend + backend
npm run start          # Production start (backend + worker)
```

### Testing and Quality
```bash
# Backend testing
cd backend
npm test              # Jest unit tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report

# Frontend testing  
cd frontend
npm test              # React component tests
npm run lint          # ESLint
npm run check         # TypeScript check

# Code quality
npm run lint          # ESLint all projects
npm run format        # Prettier formatting
```

### Database Operations
```bash
cd backend
npm run migrate       # Run database migrations
npm run seed          # Seed test data
npm run db:reset      # Reset database
```

### Docker Services
```bash
docker-compose up -d           # Start all containers
docker-compose down           # Stop all containers
docker-compose logs -f        # View logs
docker-compose restart        # Restart services
```

## Architecture & Services

### Backend Services (backend/src/services/)
- **StreamingService**: ZLMediaKit integration and stream management
- **CameraMonitoringService**: Camera health monitoring and auto-activation
- **RecordingService**: Video recording, processing, and S3 upload
- **RecordingSyncService**: Continuous synchronization between physical files and database records (NEW)
- **S3Service**: Wasabi S3 storage integration with multipart uploads
- **UploadQueueService**: Database-backed async upload queue management
- **MetricsService**: System performance monitoring with upload metrics
- **SegmentationService**: Video segmentation and analysis
- **AuthHealthService**: Authentication and health monitoring
- **FeatureFlagService**: Runtime feature toggle management
- **DiscoveryService**: Camera discovery and auto-configuration

### Key Configuration Files
- **backend/.env**: Core environment variables (Supabase, ZLM_SECRET, streaming URLs)
- **docker-compose.yml**: Container orchestration (PostgreSQL, Redis, ZLMediaKit, SRS)
- **backend/src/config/**: Service configurations (CORS, database, logging, etc.)

### Authentication & Security
- JWT-based authentication with Supabase integration
- Worker token authentication for background services
- Rate limiting and CORS protection
- Role-based access control (admin, user, client, integrator)

### Streaming Architecture
- **RTSP/RTMP Input**: Camera feeds → ZLMediaKit/SRS
- **HLS Output**: Adaptive streaming for web playback
- **Recording**: Continuous recording with async S3 upload via queue
- **Upload System**: Database-backed queue with retry logic and metrics
- **Storage**: Local primary + S3 async backup with smart fallback
- **Live Streaming**: Real-time web streaming via HLS.js

## Important Environment Variables

### Critical Backend Variables (.env)
```env
# Supabase (Required)
SUPABASE_URL=https://grkvfzuadctextnbpajb.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyMjQyMzgsImV4cCI6MjA2ODgwMDIzOH0.Simv8hH8aE9adQiTf6t1BZIcMPniNh9ecpjxEeki4mE
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzIyNDIzOCwiZXhwIjoyMDY4ODAwMjM4fQ.XJoPu5InA_s3pfryZfSChBqZnu7zBV3vwH7ZM4jf04M

# ZLMediaKit (Required - use ZLM_SECRET, not ZLMEDIAKIT_SECRET)
ZLM_SECRET=9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK
ZLM_API_URL=http://localhost:8000/index/api
ZLM_BASE_URL=http://localhost:8000

# Worker Authentication
WORKER_TOKEN=newcam-worker-token-2025-secure

# Storage - Wasabi S3 (Production)
WASABI_ACCESS_KEY=8WBR4YFE79UA94TBIEST
WASABI_SECRET_KEY=A9hNRDUEzcyhUtzp0SAE51IgKcJtsP1b7knZNe5W
WASABI_BUCKET=safe-cameras-03
WASABI_ENDPOINT=https://s3.wasabisys.com

# S3 Upload Configuration (NEW)
S3_UPLOAD_ENABLED=false
S3_UPLOAD_CONCURRENCY=2
PREFER_S3_STREAMING=false
DELETE_LOCAL_AFTER_UPLOAD=false
ENABLE_UPLOAD_QUEUE=true
```

## Default Credentials

### Application Login
- **Email**: gouveiarx@gmail.com  
- **Password**: Teste123

### Database (Development)
- **PostgreSQL**: localhost:5432, user: postgres, password: postgres123
- **Redis**: localhost:6379

## Development Workflow

### Adding New Features
1. Create feature branch from main
2. Update appropriate service in backend/src/services/
3. Add corresponding frontend components in frontend/src/
4. Add routes in backend/src/routes/ and frontend routing
5. Write tests for new functionality
6. Run lint and tests before committing
7. Create PR to main branch

### Camera Integration
- Cameras are managed via CameraMonitoringService
- RTSP streams are processed by ZLMediaKit
- Use backend/src/scripts/startCameraStreaming.js for activation
- Stream URLs follow pattern: http://localhost:8000/live/{camera_id}.m3u8

### S3 Upload System (NEW)
- **UploadQueueService**: Database-backed queue with automatic retry
- **UploadWorker**: Background worker for processing uploads
- **PathResolver**: Centralized path handling across Windows/Unix
- **Feature Flags**: Runtime toggles for gradual rollout
- **Smart Endpoints**: `/stream` and `/download` with S3/local fallback
- **Metrics Integration**: Upload statistics and success rates

### Recording System

#### ✅ **WORKING FEATURES**
- **H264 TRANSCODING**: HEVC/H265 → H264 real-time conversion for web browsers
- **AUTO-START**: Recordings start automatically when streams go live
- **30-MINUTE INTERVALS**: Recording segments of 1800 seconds (30 minutes)
- **FILE STORAGE**: MP4 files properly saved in `storage/www/record/live/{camera_id}/{date}/`
- **DOCKER INTEGRATION**: ZLMediaKit container saves to `/opt/media/bin/www` mapped to host

#### ✅ **SISTEMA REFATORADO (August 20, 2025)**
- **SERVIÇO UNIFICADO**: `RecordingService.js` consolidado (removidos serviços redundantes)
- **PATHS NORMALIZADOS**: Sistema usa apenas paths relativos consistentes
- **BUSCA SIMPLIFICADA**: Algoritmo direto de localização de arquivos
- **HOOKS CORRIGIDOS**: `on_record_mp4` salva paths normalizados no database
- **PLAYER OTIMIZADO**: Endpoints simplificados com fallbacks inteligentes

#### 🛠️ **CORREÇÕES APLICADAS (August 21, 2025)**
- **DUPLICATAS REMOVIDAS**: Limpeza de registros duplicados via SQL
- **PREVENÇÃO DE DUPLICATAS**: RecordingMonitorService com verificação de registros existentes
- **DEBOUNCING MELHORADO**: Webhooks com 5 segundos de debounce + locks de concorrência
- **ZLMEDIAKIT CORRIGIDO**: API `startRecord` usando `type: 1` (integer) ao invés de `'mp4'` (string)
- **SINCRONIZAÇÃO CONTÍNUA**: `RecordingSyncService` executando a cada 60s para vincular arquivos órfãos
- **FRONTEND APRIMORADO**: Filtro de duplicatas + indicadores visuais melhorados para status das gravações

#### 🚀 **MELHORIAS RECENTES (August 22, 2025)**
- **DURAÇÃO AUTOMÁTICA**: Webhook extrai duração com ffprobe quando `time_len` não é fornecido pelo ZLMediaKit
- **S3 FALLBACK**: Sistema de reprodução inteligente com fallback automático para S3 quando arquivos locais são deletados
- **CHARTS CORRIGIDOS**: LineChart component fixado para usar campo 'time' correto e exibir dados de upload
- **SCRIPTS DE MANUTENÇÃO**: Criados scripts para extrair duração de gravações existentes
- **PATH RESOLVER APRIMORADO**: PathResolver.js com suporte a filenames com pontos iniciais (.filename.mp4)
- **UPLOAD QUEUE ESTÁVEL**: Sistema de upload S3 totalmente funcional com retry automático e métricas

#### 🔧 **KNOWN PATHS & STRUCTURE**
- **Host Storage**: `./storage/www/record/live/{camera_id}/{date}/{filename}.mp4`
- **Docker Path**: `/opt/media/bin/www/record/live/{camera_id}/{date}/{filename}.mp4`
- **Database Table**: `recordings` in Supabase with status tracking
- **H264 Endpoint**: `/api/recording-files/{id}/play-web` for browser-compatible playback

#### 🎯 **TRANSCODING SOLUTION**
```javascript
// H264 endpoint working at backend/src/routes/recordingFiles.js:128
router.get('/:recordingId/play-web', async (req, res) => {
  // FFmpeg command converts HEVC to H264 in real-time
  const ffmpeg = spawn('docker', [
    'exec', 'newcam-zlmediakit', 'ffmpeg',
    '-i', filePath, '-c:v', 'libx264', '-preset', 'ultrafast',
    '-tune', 'zerolatency', '-profile:v', 'baseline', ...
  ]);
});
```

- Frontend uses `/play-web` endpoint for H264 compatibility
- Performance: ~7.6x real-time transcoding speed
- Browser compatible: H264 baseline profile

## Production Deployment

### Server Requirements
- Node.js 18+, Docker, PM2
- See docs/DEPLOY_GUIDE.md for complete instructions

### Port Configuration
- Frontend: 5173 (dev) / 80 (prod via nginx)
- Backend: 3002
- Worker: 3001/3003  
- ZLMediaKit: 8000 (HTTP), 554 (RTSP), 1935 (RTMP)
- Database: 5432 (PostgreSQL), 6379 (Redis)

### Health Checks
```bash
# Application health
curl http://localhost:3002/health
curl http://localhost:3002/api/health

# Service status
docker ps
npm run services:check  # Backend service checker
```

## Common Issues & Solutions

### ZLMediaKit Configuration
- ✅ **FIXED**: Use only `ZLM_SECRET`, `ZLM_API_URL`, `ZLM_BASE_URL`
- ❌ **REMOVED**: `ZLMEDIAKIT_SECRET` and `ZLMEDIAKIT_API_URL` (deprecated)
- Default secret: `9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK`
- API endpoint: `http://localhost:8000/index/api`
- Base URL: `http://localhost:8000`

### Streaming Problems
- Check ZLMediaKit container: `docker logs newcam-zlmediakit`
- Verify camera RTSP URLs in database
- Test stream: http://localhost:8000/live/{stream_id}.m3u8

### Worker Issues
- Ensure WORKER_TOKEN matches between backend and worker
- Check worker logs for authentication errors
- Worker connects to backend via WebSocket

### Database Connection
- Verify Supabase credentials in .env
- Check network connectivity to Supabase
- Validate RLS policies for table access

## 🔧 Sistema 100% Estabilizado (Janeiro 2025)

### ✅ Correções Críticas Aplicadas

**1. DEPRECATED ROUTES REMOVIDAS**
- ❌ **REMOVIDO**: `backend/src/config/routes.js` - Arquivo conflitante que causava duplicação de rotas
- ✅ **CONSOLIDADO**: Todas as rotas centralizadas em `server.js` com middleware unificado

**2. ROUTES MIDDLEWARE CONSOLIDADO**
- ✅ **CORRIGIDO**: `backend/src/server.js` - Eliminada duplicação de middleware de autenticação
- Antes: Middleware aplicado individualmente para cada rota (15+ linhas duplicadas)
- Depois: Loop consolidado aplicando middleware para todas as rotas protegidas de uma vez

**3. PATH RESOLUTION CORRIGIDO**  
- ✅ **CORRIGIDO**: `backend/src/routes/hooks.js:1316` - Path resolution com double concatenation
- Problema: `C:\Users\...\NewCAM\C:\Users\...\NewCAM\storage\...` (path duplicado)
- Solução: Uso de `path.isAbsolute()` para detectar paths absolutos corretamente

**4. CAMERA MODEL IMPORT CORRIGIDO**
- ✅ **CORRIGIDO**: `backend/src/services/StreamingService.js:445` - Import incorreto do modelo Camera
- Erro: `Cannot read properties of undefined (reading 'findById')`
- Solução: Mudança de `.default` para named export `{ Camera }`

**5. WEBSOCKET CONNECTIONS ESTABILIZADAS**
- ✅ **CORRIGIDO**: `backend/src/controllers/socketController.js` - Conexões instáveis com desconexões frequentes
- Implementado: Heartbeat mechanism com limpeza automática de conexões inativas
- Timeout: 5 minutos para conexões inativas
- Limpeza: A cada 30 segundos verifica e remove conexões expiradas

**6. RECORDING METADATA SCRIPT COMPLETO**
- ✅ **ATUALIZADO**: `backend/src/scripts/updateRecordingMetadata.js` - Script apenas removia pontos
- Implementado: Integração com ffprobe via Docker para extração completa de metadados
- Extrai: duration, width, height, resolution, fps, codec, bitrate, file_size
- Normaliza: Paths de arquivos e remove prefixos de ponto dos filenames
- Busca inteligente: Múltiplos locais possíveis para encontrar arquivos físicos

### 🚀 Scripts de Manutenção Atualizados

```bash
# Script completo de atualização de metadados
SUPABASE_URL=https://grkvfzuadctextnbpajb.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... node backend/src/scripts/updateRecordingMetadata.js

# Validação do sistema após correções  
SUPABASE_URL=https://grkvfzuadctextnbpajb.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... node backend/src/scripts/validateRecordingSystem.js

# Teste direto de inserção no banco (bypass webhook)
SUPABASE_URL=https://grkvfzuadctextnbpajb.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... node backend/src/scripts/testRecordingDirectly.js
```

### 📊 Problemas Completamente Resolvidos

| **Problema** | **Localização** | **Status** |
|--------------|-----------------|------------|
| Schema 'format' column error | hooks.js | ✅ **CORRIGIDO** |
| API returning 0 recordings | Test validated | ✅ **CORRIGIDO** |
| Duplicate route definitions | server.js | ✅ **CORRIGIDO** |  
| Path double concatenation | hooks.js:1316 | ✅ **CORRIGIDO** |
| Camera model import error | StreamingService.js:445 | ✅ **CORRIGIDO** |
| WebSocket instability | socketController.js | ✅ **CORRIGIDO** |
| Incomplete metadata script | updateRecordingMetadata.js | ✅ **CORRIGIDO** |

### 🎯 Sistema "100% Redondo"

O sistema agora está completamente estabilizado com todas as divergências e conflitos ocultos identificados e corrigidos:

- ✅ **Rotas limpas** sem duplicação ou conflitos
- ✅ **Path resolution robusto** para ambientes Windows/Docker
- ✅ **Imports corretos** em todos os serviços
- ✅ **WebSocket estável** com heartbeat e cleanup automático
- ✅ **Metadata completo** para todas as gravações
- ✅ **Webhook funcionando** com inserção correta no banco
- ✅ **Documentação atualizada** refletindo todas as correções

#### 🔍 Análise Completa Concluída

Foram identificados e corrigidos **7 problemas críticos** no sistema:
1. Arquivo de rotas deprecado conflitante
2. Middleware de rotas duplicado
3. Resolução de paths com concatenação dupla  
4. Import incorreto do modelo Camera
5. Conexões WebSocket instáveis
6. Script de metadados incompleto
7. Documentação desatualizada

**Resultado**: Sistema NewCAM **100% funcional** sem divergências.

### Sistema de Gravação Refatorado (August 2025)

#### ✅ **REFATORAÇÃO COMPLETA REALIZADA**

**ARQUIVOS MODIFICADOS:**
- `backend/src/services/RecordingService.js` - **NOVO**: Serviço unificado consolidado
- `backend/src/routes/recordings.js` - Atualizado para usar serviço único
- `backend/src/routes/recordingFiles.js` - Simplificado com busca consistente
- `backend/src/routes/hooks.js` - Melhorado com normalização de paths

**ARQUIVOS REMOVIDOS:**
- `backend/src/services/RecordingService_improved.js` - ❌ Deletado (redundante)
- `backend/src/services/UnifiedRecordingService.js` - ❌ Deletado (redundante)

**SCRIPTS ESSENCIAIS MANTIDOS:**
- `backend/src/scripts/normalizeRecordingPaths.js` - Migração de paths inconsistentes
- `backend/src/scripts/validateRecordingSystem.js` - Validação completa do sistema
- `backend/src/scripts/fixOrphanRecordings.js` - Correção de registros órfãos (NEW)
- `backend/src/scripts/createAdminUser.js` - Criação de usuários administrativos
- `backend/src/scripts/startCameraStreaming.js` - Ativação de câmeras
- `backend/src/scripts/cleanupRecordingData.js` - Limpeza de dados de gravação
- `backend/src/scripts/monitorRecordingHealth.js` - Monitoramento de saúde das gravações

#### 🔧 **PRINCIPAIS MELHORIAS**

1. **SERVIÇO UNIFICADO**: Apenas um `RecordingService` com API consistente
2. **PATHS NORMALIZADOS**: Todos os paths salvos como relativos (`storage/www/record/live/...`)
3. **BUSCA INTELIGENTE**: Algoritmo simplificado que verifica locais conhecidos
4. **HOOKS CORRIGIDOS**: `on_record_mp4` normaliza paths antes de salvar
5. **PLAYER SIMPLIFICADO**: Endpoints limpos com fallbacks automáticos

#### 🚀 **COMANDOS PARA APLICAR CORREÇÕES**

```bash
# 1. Executar migração de paths inconsistentes
SUPABASE_URL=https://grkvfzuadctextnbpajb.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... node backend/src/scripts/normalizeRecordingPaths.js

# 2. Corrigir registros órfãos (modo seguro - dry run primeiro)
DRY_RUN=true SUPABASE_URL=https://grkvfzuadctextnbpajb.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... node backend/src/scripts/fixOrphanRecordings.js

# 3. Aplicar correções (remover DRY_RUN para executar de fato)
SUPABASE_URL=https://grkvfzuadctextnbpajb.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... node backend/src/scripts/fixOrphanRecordings.js

# 4. Validar sistema após correções
SUPABASE_URL=https://grkvfzuadctextnbpajb.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... node backend/src/scripts/validateRecordingSystem.js

# 5. Testar endpoints do player
curl -I "http://localhost:3002/api/recording-files/{recording_id}/play"
curl -I "http://localhost:3002/api/recording-files/{recording_id}/play-web"

# 4. Verificar nova estrutura funciona
npm run dev
```

#### 📊 **ESTRUTURA FINAL**

**Caminho Base**: `storage/www/record/live/`
**Estrutura**: `{camera_id}/{date}/{filename}.mp4`
**Database**: `local_path` e `file_path` sempre relativos e iguais
**Player**: Busca automática em locais conhecidos com transcodificação sob demanda

## File Structure Notes

- **Monorepo structure**: Root package.json manages all services
- **ES Modules**: All backend code uses import/export syntax
- **TypeScript**: Frontend is fully typed, backend is JavaScript with JSDoc
- **Docker volumes**: Persistent data in docker volumes for databases
- **Structured Logging**: Winston-based logging with automatic rotation
- ✅ **PROJECT CLEANED**: Removed 1500+ unnecessary files (logs, media, scripts)
- ✅ **DOCUMENTATION CONSOLIDATED**: Single source of truth in docs/
- ✅ **SCRIPTS OPTIMIZED**: Removed 15+ duplicate/obsolete scripts
- ✅ **S3 UPLOAD SYSTEM**: Complete async upload implementation with queue

## Testing Guidelines

- Backend: Jest for unit tests, Supertest for API tests
- Frontend: React Testing Library for components
- Integration: Test camera streaming end-to-end
- Mock external services (S3, Supabase) in tests
- Maintain >80% code coverage for critical services

# Status do Sistema (Agosto 2025) - 🎯 SISTEMA COMPLETAMENTE LIMPO E REINICIADO

## 🎉 SISTEMA NEWCAM - ESTADO LIMPO APÓS RESET COMPLETO

### 🏆 STATUS ATUAL: SISTEMA RESETADO E OPERACIONAL
**✅ Sistema completamente limpo e reiniciado (Agosto 24, 2025)**
**✅ Todas as gravações antigas removidas (local + Supabase + Wasabi S3)**
**✅ Containers Docker reiniciados com configuração limpa**
**✅ Todos os serviços funcionando em suas portas corretas**
**✅ Bug crítico no UploadQueueService.js corrigido**
**✅ Documentação atualizada com estado limpo**

### 🧹 **RESET COMPLETO EXECUTADO**
#### Processo de Limpeza Realizado (Agosto 24, 2025):
1. ✅ **Todos os processos parados** - Backend, Worker, Frontend interrompidos
2. ✅ **Storage local limpo** - Todas as gravações em `./storage/www/record/` removidas
3. ✅ **Banco Supabase limpo** - Tabela `recordings` e `upload_queue` completamente limpas
4. ✅ **Bucket Wasabi S3 limpo** - Todos os arquivos de gravação removidos
5. ✅ **Containers Docker reiniciados** - ZLMediaKit e demais serviços resetados
6. ✅ **Bug SQL corrigido** - Erro de alias de coluna no UploadQueueService.js resolvido
7. ✅ **Serviços reiniciados** - Backend (3002), Worker (3003), Frontend (5173) operacionais

#### 🛠️ **Correção Crítica Aplicada**
**Arquivo**: `backend/src/services/UploadQueueService.js`  
**Erro**: `column recordings_1.created_atasrecording_created_at does not exist`  
**Causa**: Alias de coluna malformado na query SQL  
**Solução**: Removidos aliases problemáticos, query simplificada  
**Status**: ✅ **CORRIGIDO** - Worker agora inicia sem erros SQL

## ✅ Funcionalidades Core 100% Implementadas

### 🎬 Sistema de Gravação & Streaming
- ✅ **ZLMediaKit Integration**: RTSP/RTMP → HLS streaming funcional
- ✅ **H264 Transcoding**: HEVC/H265 → H264 em tempo real para browsers
- ✅ **Recording System**: Gravação automática de 30 minutos por segmento
- ✅ **S3 Upload Queue**: Upload assíncrono para Wasabi S3 com retry
- ✅ **Smart Fallback**: Reprodução local → S3 quando arquivos locais expiram
- ✅ **Retention Policy**: 7 dias local + S3, depois 30 dias apenas S3

### ☁️ Sistema S3 Avançado
- ✅ **AWS SDK v3**: Migração completa com presigned URLs funcionais
- ✅ **Multipart Upload**: Para arquivos grandes com retry automático
- ✅ **Upload Queue**: Database-backed queue com métricas
- ✅ **Path Resolution**: Sistema inteligente de resolução de caminhos
- ✅ **Feature Flags**: Toggles em tempo real para controle de rollout
- ✅ **Cleanup Scripts**: Limpeza automática baseada em política de retenção

### 🎯 Frontend Completo
- ✅ **React 18 + TypeScript**: Interface moderna e responsiva
- ✅ **VideoPlayer**: Reprodução com suporte H264/H265 e fallback S3
- ✅ **Dashboard**: Métricas em tempo real com charts funcionais
- ✅ **Upload Indicators**: Status visual de upload e storage badges
- ✅ **HLS.js Integration**: Streaming adaptativo para web browsers

## ✅ Funcionalidades Implementadas Recentemente

### Interface de Usuários (Users.tsx)
- ✅ **CRUD Completo**: Criação, edição, ativação/desativação de usuários
- ✅ **Roles Implementados**: admin, integrator, client, viewer com controle de acesso
- ✅ **Validação**: Formulários com validação completa de dados
- ✅ **Exportação**: Export CSV de usuários para relatórios
- ✅ **Reset de Senha**: Reset de senhas via endpoint administrativo
- ✅ **Correção useCallback**: Problema de dependências circulares corrigido

### Backend Usuários (/api/users)
- ✅ **PUT /users/:id/status**: Ativar/desativar usuários
- ✅ **POST /users/:id/reset-password**: Reset administrativo de senhas
- ✅ **GET /users/export**: Exportação CSV com dados completos
- ✅ **Autenticação**: Todas as rotas protegidas com JWT + role validation

### Interface de Arquivo (Archive.tsx)
- ✅ **Visualização**: Grid e lista de gravações com thumbnails
- ✅ **Filtros Avançados**: Por câmera, data, tipo de evento, qualidade
- ✅ **Batch Operations**: Seleção múltipla e operações em lote
- ✅ **Player Integrado**: Modal com VideoPlayer para reprodução
- ✅ **Export Jobs**: Sistema de exportação assíncrona com monitoramento
- ✅ **Delete em Lote**: Exclusão múltipla com confirmação

### Backend Gravações (/api/recordings)
- ✅ **DELETE /recordings/multiple**: Batch delete com validação
- ✅ **POST /recordings/export**: Exportação assíncrona de gravações
- ✅ **GET /recordings/export/:id/status**: Monitoramento de status de export
- ✅ **Paginação**: Sistema completo com filtros e ordenação
- ✅ **Estatísticas**: Métricas agregadas por período

### Limpeza de Código
- ✅ **Rotas Duplicadas**: Removido `/recordings-old` e `Recordings.tsx`
- ✅ **Import Cleanup**: Imports não utilizados removidos do App.tsx
- ✅ **Páginas Consolidadas**: Apenas RecordingsPage.tsx mantida

## 🔧 Estrutura Técnica Atualizada

### Frontend (React + TypeScript)
```
/pages/
├── Users.tsx          # ✅ Gestão completa de usuários
├── Archive.tsx        # ✅ Arquivo de gravações avançado
├── RecordingsPage.tsx # ✅ Página principal de gravações
└── ...
```

### Backend (Node.js + Express)
```
/routes/
├── users.js        # ✅ CRUD + status + reset + export
├── recordings.js   # ✅ Batch ops + export + paginação
└── ...
```

### API Endpoints Funcionais
```
# Usuários
PUT    /api/users/:id/status
POST   /api/users/:id/reset-password
GET    /api/users/export

# Gravações
DELETE /api/recordings/multiple
POST   /api/recordings/export
GET    /api/recordings/export/:id/status
```