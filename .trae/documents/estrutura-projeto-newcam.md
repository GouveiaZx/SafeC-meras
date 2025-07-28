# 📁 Estrutura do Projeto NewCAM - Sistema de Vigilância por Câmeras IP

## 🏗️ Visão Geral da Arquitetura de Pastas

```
NewCAM/
├── 📁 frontend/                    # Aplicação React/Next.js
│   ├── 📁 public/
│   │   ├── 📁 icons/
│   │   ├── 📁 images/
│   │   └── favicon.ico
│   ├── 📁 src/
│   │   ├── 📁 components/          # Componentes reutilizáveis
│   │   │   ├── 📁 ui/              # Componentes base (Button, Input, etc.)
│   │   │   ├── 📁 layout/          # Header, Sidebar, Footer
│   │   │   ├── 📁 camera/          # Componentes específicos de câmera
│   │   │   ├── 📁 dashboard/       # Componentes do dashboard
│   │   │   └── 📁 auth/            # Componentes de autenticação
│   │   ├── 📁 pages/               # Páginas da aplicação
│   │   │   ├── 📁 admin/           # Páginas do administrador
│   │   │   ├── 📁 integrator/      # Páginas do integrador
│   │   │   ├── 📁 client/          # Páginas do cliente
│   │   │   └── 📁 auth/            # Login, registro
│   │   ├── 📁 hooks/               # Custom hooks React
│   │   ├── 📁 services/            # Serviços de API
│   │   ├── 📁 utils/               # Utilitários e helpers
│   │   ├── 📁 types/               # Definições TypeScript
│   │   ├── 📁 contexts/            # Context providers
│   │   └── 📁 styles/              # Estilos globais e Tailwind
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   └── tsconfig.json
│
├── 📁 backend/                     # API REST Node.js/Express
│   ├── 📁 src/
│   │   ├── 📁 controllers/         # Controladores da API
│   │   │   ├── authController.js
│   │   │   ├── cameraController.js
│   │   │   ├── userController.js
│   │   │   ├── recordingController.js
│   │   │   └── dashboardController.js
│   │   ├── 📁 middleware/          # Middlewares
│   │   │   ├── auth.js
│   │   │   ├── validation.js
│   │   │   ├── rateLimiter.js
│   │   │   └── errorHandler.js
│   │   ├── 📁 models/              # Modelos do banco de dados
│   │   │   ├── User.js
│   │   │   ├── Camera.js
│   │   │   ├── Recording.js
│   │   │   └── AccessLog.js
│   │   ├── 📁 routes/              # Rotas da API
│   │   │   ├── auth.js
│   │   │   ├── cameras.js
│   │   │   ├── users.js
│   │   │   ├── recordings.js
│   │   │   └── dashboard.js
│   │   ├── 📁 services/            # Serviços de negócio
│   │   │   ├── authService.js
│   │   │   ├── cameraService.js
│   │   │   ├── s3Service.js
│   │   │   ├── emailService.js
│   │   │   └── streamService.js
│   │   ├── 📁 utils/               # Utilitários
│   │   │   ├── database.js
│   │   │   ├── logger.js
│   │   │   ├── validators.js
│   │   │   └── helpers.js
│   │   ├── 📁 config/              # Configurações
│   │   │   ├── database.js
│   │   │   ├── s3.js
│   │   │   ├── email.js
│   │   │   └── jwt.js
│   │   └── app.js                  # Aplicação principal
│   ├── package.json
│   └── server.js                   # Servidor HTTP
│
├── 📁 worker/                      # Worker para processamento de vídeo
│   ├── 📁 src/
│   │   ├── 📁 services/            # Serviços do worker
│   │   │   ├── streamCapture.js    # Captura RTSP/RTMP
│   │   │   ├── hlsGenerator.js     # Geração HLS
│   │   │   ├── s3Uploader.js       # Upload para Wasabi
│   │   │   ├── cameraMonitor.js    # Monitoramento de câmeras
│   │   │   └── cleanupService.js   # Limpeza automática
│   │   ├── 📁 utils/
│   │   │   ├── ffmpeg.js           # Wrapper FFmpeg
│   │   │   ├── logger.js
│   │   │   └── helpers.js
│   │   ├── 📁 config/
│   │   │   ├── media.js            # Configurações de mídia
│   │   │   ├── storage.js          # Configurações de armazenamento
│   │   │   └── monitoring.js       # Configurações de monitoramento
│   │   └── worker.js               # Worker principal
│   └── package.json
│
├── 📁 media-servers/               # Servidores de mídia
│   ├── 📁 zlmediakit/              # Configurações ZLMediaKit
│   │   ├── config.ini
│   │   └── Dockerfile
│   ├── 📁 srs/                     # Configurações SRS Server
│   │   ├── srs.conf
│   │   └── Dockerfile
│   └── 📁 nginx/                   # Proxy reverso e HLS
│       ├── nginx.conf
│       └── Dockerfile
│
├── 📁 database/                    # Scripts e migrações do banco
│   ├── 📁 migrations/              # Migrações SQL
│   │   ├── 001_create_users.sql
│   │   ├── 002_create_cameras.sql
│   │   ├── 003_create_recordings.sql
│   │   ├── 004_create_access_logs.sql
│   │   └── 005_create_indexes.sql
│   ├── 📁 seeds/                   # Dados iniciais
│   │   ├── admin_user.sql
│   │   └── sample_data.sql
│   └── 📁 schemas/                 # Esquemas e documentação
│       ├── database_schema.md
│       └── relationships.md
│
├── 📁 docker/                      # Configurações Docker
│   ├── 📁 development/            # Ambiente de desenvolvimento
│   │   ├── docker-compose.dev.yml
│   │   └── .env.dev
│   ├── 📁 production/             # Ambiente de produção
│   │   ├── docker-compose.prod.yml
│   │   └── .env.prod
│   └── 📁 scripts/                # Scripts de deploy
│       ├── build.sh
│       ├── deploy.sh
│       └── backup.sh
│
├── 📁 docs/                        # Documentação do projeto
│   ├── 📁 api/                     # Documentação da API
│   │   ├── endpoints.md
│   │   ├── authentication.md
│   │   └── examples.md
│   ├── 📁 deployment/              # Guias de deploy
│   │   ├── docker-setup.md
│   │   ├── production-deploy.md
│   │   └── monitoring.md
│   ├── 📁 development/             # Guias de desenvolvimento
│   │   ├── setup.md
│   │   ├── coding-standards.md
│   │   └── testing.md
│   └── README.md                   # Documentação principal
│
├── 📁 scripts/                     # Scripts utilitários
│   ├── setup.sh                   # Setup inicial do projeto
│   ├── start-dev.sh               # Iniciar ambiente de desenvolvimento
│   ├── build-all.sh               # Build de todos os serviços
│   └── test.sh                     # Executar testes
│
├── 📁 tests/                       # Testes automatizados
│   ├── 📁 unit/                    # Testes unitários
│   ├── 📁 integration/             # Testes de integração
│   ├── 📁 e2e/                     # Testes end-to-end
│   └── 📁 fixtures/                # Dados de teste
│
├── 📁 storage/                     # Armazenamento local temporário
│   ├── 📁 recordings/              # Gravações temporárias
│   ├── 📁 hls/                     # Arquivos HLS temporários
│   └── 📁 logs/                    # Logs da aplicação
│
├── .env                            # Variáveis de ambiente
├── .env.example                    # Exemplo de variáveis
├── .gitignore                      # Arquivos ignorados pelo Git
├── docker-compose.yml              # Compose principal
├── package.json                    # Dependências do projeto
├── README.md                       # Documentação principal
└── LICENSE                         # Licença do projeto
```

## 🔧 Detalhamento dos Módulos Principais

### 📱 Frontend (React/Next.js)
**Responsabilidades:**
- Interface de usuário responsiva
- Autenticação e autorização por níveis
- Visualização de streams HLS em tempo real
- Gerenciamento de câmeras e gravações
- Dashboard com métricas e logs
- Download de gravações por período

**Tecnologias:**
- Next.js 14+ com App Router
- TypeScript para tipagem
- Tailwind CSS para estilização
- React Query para gerenciamento de estado
- Socket.io para atualizações em tempo real
- Video.js para reprodução de vídeo

### 🔧 Backend (Node.js/Express)
**Responsabilidades:**
- API REST para todas as operações
- Autenticação JWT com refresh tokens
- Gerenciamento de usuários e permissões
- Integração com banco de dados Supabase
- Comunicação com worker via Redis/Queue
- Logs de auditoria e monitoramento

**Tecnologias:**
- Node.js com Express.js
- PostgreSQL via Supabase
- JWT para autenticação
- Bcrypt para hash de senhas
- Multer para upload de arquivos
- Bull Queue para processamento assíncrono

### ⚙️ Worker (Processamento de Vídeo)
**Responsabilidades:**
- Captura de streams RTSP/RTMP
- Conversão para formato HLS
- Upload contínuo para Wasabi S3
- Monitoramento de status das câmeras
- Limpeza automática por política de retenção
- Geração de thumbnails e metadados

**Tecnologias:**
- Node.js para orquestração
- FFmpeg para processamento de vídeo
- ZLMediaKit para captura RTSP
- SRS Server para streaming RTMP
- AWS SDK para integração S3
- Cron jobs para tarefas agendadas

### 🗄️ Banco de Dados (Supabase/PostgreSQL)
**Estrutura Principal:**
- **users**: Usuários do sistema (admin, integrador, cliente)
- **cameras**: Configurações e metadados das câmeras
- **recordings**: Registros de gravações e localização no S3
- **access_logs**: Logs de acesso e auditoria
- **notifications**: Sistema de notificações e alertas
- **settings**: Configurações globais do sistema

### 🐳 Docker & Orquestração
**Serviços Containerizados:**
- **frontend**: Aplicação Next.js
- **backend**: API Node.js
- **worker**: Processador de vídeo
- **zlmediakit**: Servidor de mídia RTSP
- **srs**: Servidor RTMP
- **nginx**: Proxy reverso e servidor HLS
- **redis**: Cache e filas de processamento
- **postgres**: Banco de dados (desenvolvimento)

## 🔐 Configurações de Segurança

### Variáveis de Ambiente (.env)
```bash
# Configurações da Aplicação
NODE_ENV=development
PORT=3000
API_PORT=3001
WORKER_PORT=3002

# JWT e Segurança
JWT_SECRET=sua_chave_jwt_super_secreta_aqui
JWT_REFRESH_SECRET=sua_chave_refresh_jwt_aqui
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Banco de Dados Supabase
DATABASE_URL=postgresql://postgres.grkvfzuadctextnbpajb:[uYGWj7yTFo3pAzkT]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
SUPABASE_URL=https://grkvfzuadctextnbpajb.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyMjQyMzgsImV4cCI6MjA2ODgwMDIzOH0.Simv8hH8aE9adQiTf6t1BZIcMPniNh9ecpjxEeki4mE
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzIyNDIzOCwiZXhwIjoyMDY4ODAwMjM4fQ.XJoPu5InA_s3pfryZfSChBqZnu7zBV3vwH7ZM4jf04M

# Armazenamento Wasabi S3
WASABI_ACCESS_KEY=8WBR4YFE79UA94TBIEST
WASABI_SECRET_KEY=A9hNRDUEzcyhUtzp0SAE51IgKcJtsP1b7knZNe5W
WASABI_BUCKET=safe-cameras-03
WASABI_REGION=us-east-1
WASABI_ENDPOINT=https://s3.wasabisys.com

# Configurações de Email (SendGrid)
SENDGRID_API_KEY=sua_api_key_sendgrid_aqui
SENDGRID_FROM_EMAIL=noreply@newcam.com
SENDGRID_FROM_NAME=NewCAM System

# Configurações de Mídia
RTSP_PORT=554
RTMP_PORT=1935
HLS_PORT=8080
STREAM_QUALITY=720p
RECORDING_SEGMENT_DURATION=300
HLS_SEGMENT_DURATION=10

# Configurações de Monitoramento
CAMERA_HEALTH_CHECK_INTERVAL=30
OFFLINE_ALERT_THRESHOLD=120
STORAGE_CLEANUP_INTERVAL=3600
DEFAULT_RETENTION_DAYS=30

# Redis (Cache e Filas)
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=

# Configurações de Desenvolvimento
DEBUG=true
LOG_LEVEL=debug
ENABLE_CORS=true
CORS_ORIGIN=http://localhost:3000
```

## 📋 Próximos Passos de Implementação

### Fase 1: Configuração Base (Semana 1)
1. **Setup do ambiente de desenvolvimento**
   - Configuração do Docker Compose
   - Setup do banco de dados Supabase
   - Configuração das variáveis de ambiente

2. **Estrutura inicial do projeto**
   - Criação da estrutura de pastas
   - Setup do frontend Next.js
   - Setup do backend Express.js
   - Configuração do worker base

### Fase 2: Autenticação e Usuários (Semana 2)
1. **Sistema de autenticação**
   - Login/logout com JWT
   - Middleware de autorização
   - Gestão de níveis de acesso

2. **Gerenciamento de usuários**
   - CRUD de usuários
   - Perfis por nível de acesso
   - Interface de administração

### Fase 3: Gerenciamento de Câmeras (Semana 3-4)
1. **Cadastro e configuração**
   - Interface de cadastro RTSP/RTMP
   - Teste de conectividade
   - Configurações de gravação

2. **Monitoramento básico**
   - Status online/offline
   - Logs de conectividade
   - Alertas básicos

### Fase 4: Processamento de Vídeo (Semana 5-6)
1. **Captura e streaming**
   - Integração ZLMediaKit/SRS
   - Geração de streams HLS
   - Player de vídeo no frontend

2. **Gravação e armazenamento**
   - Upload para Wasabi S3
   - Metadados de gravação
   - Sistema de limpeza automática

### Fase 5: Dashboard e Relatórios (Semana 7)
1. **Interface de monitoramento**
   - Dashboard em tempo real
   - Métricas de uso
   - Logs de acesso

2. **Sistema de download**
   - Busca por período
   - Download de gravações
   - Histórico de downloads

### Fase 6: Otimização e Deploy (Semana 8)
1. **Testes e otimização**
   - Testes automatizados
   - Otimização de performance
   - Monitoramento de recursos

2. **Deploy em produção**
   - Configuração de produção
   - Monitoramento e logs
   - Backup e recuperação

## 🔍 Informações Adicionais Necessárias

### Credenciais e Configurações Pendentes:
1. **SendGrid ou AWS SES**
   - API Key para envio de emails
   - Templates de notificação
   - Domínio verificado

2. **Certificados SSL/HTTPS**
   - Certificado para domínio de produção
   - Configuração de proxy reverso

3. **Configurações de Produção**
   - Domínio final da aplicação
   - Configurações de firewall
   - Políticas de backup

4. **Monitoramento e Alertas**
   - Configuração de logs centralizados
   - Métricas de performance
   - Alertas de sistema

Esta estrutura fornece uma base sólida e escalável para o desenvolvimento do sistema NewCAM, mantendo a organização e facilitando a manutenção durante todo o ciclo de vida do projeto.