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
- **API Docs**: http://localhost:3002/api/docs

## 🏗️ Arquitetura do Sistema

```
NewCAM/
├── frontend/          # Interface web (React + TypeScript + Vite)
├── backend/           # API REST e WebSocket (Node.js + Express)
├── worker/            # Processamento de vídeo e tarefas
├── database/          # Schemas e migrações PostgreSQL
├── docker/            # Configurações Docker
├── storage/           # Armazenamento (gravações, logs, streams)
├── docs/              # Documentação
├── scripts/           # Scripts de automação
└── nginx-newcam.conf  # Configuração Nginx
```

## 🌐 Mapeamento de Portas

### 📱 Servidor de Produção (66.94.104.241)

| Serviço | Porta | URL/Endpoint | Status | Descrição |
|---------|-------|--------------|--------|-----------|
| **Nginx** | `80` | http://66.94.104.241 | ✅ | Proxy reverso e frontend |
| **Backend API** | `3002` | /api/* | ✅ | API REST + WebSocket |
| **PostgreSQL** | `5432` | localhost:5432 | ✅ | Banco de dados |
| **Redis** | `6379` | localhost:6379 | ✅ | Cache e sessões |
| **ZLMediaKit** | `9902` | localhost:9902 | ✅ | Servidor de streaming |
| **ZLMediaKit RTMP** | `1935` | rtmp://66.94.104.241:1935 | ✅ | Streaming RTMP |
| **ZLMediaKit HTTP** | `8080` | http://66.94.104.241:8080 | ✅ | HTTP-FLV/HLS |
| **ZLMediaKit RTSP** | `554` | rtsp://66.94.104.241:554 | ✅ | Streaming RTSP |

### 🖥️ Desenvolvimento Local

| Serviço | Porta | URL | Descrição |
|---------|-------|-----|----------|
| **Frontend** | `5174` | http://localhost:5174 | Interface React + Vite |
| **Backend** | `3003` | http://localhost:3003 | API REST + WebSocket |
| **SRS** | `8081` | http://localhost:8081 | Servidor de streaming SRS |
| **ZLMediaKit** | `8080` | localhost:8080 | Servidor de streaming ZLM |
| **Supabase** | `54321` | https://grkvfzuadctextnbpajb.supabase.co | Banco de dados |

## 🚀 Tecnologias

### Frontend
- **React 18** com TypeScript
- **Vite** para build otimizado
- **Tailwind CSS** para estilização
- **Zustand** para gerenciamento de estado
- **React Router** para navegação
- **Lucide React** para ícones
- **HLS.js** para streaming HLS com autenticação

### Backend
- **Node.js** com Express
- **Socket.IO** para WebSockets
- **PostgreSQL** banco principal
- **Redis** para cache
- **JWT** para autenticação
- **Winston** para logs

### Streaming
- **ZLMediaKit** servidor de mídia
- **RTSP/RTMP** protocolos de streaming
- **HLS** streaming adaptativo
- **WebRTC** comunicação P2P

### Infraestrutura
- **Docker** containerização
- **Nginx** proxy reverso
- **PM2** gerenciamento de processos
- **Ubuntu 20.04** sistema operacional

## 🚨 Correções Críticas Aplicadas

### ✅ Problemas Resolvidos
1. **Erro 400 - Stream já ativo** - Coluna `stream_type` ausente no banco de dados
2. **Porta 3002 em uso** - Processo travado do backend
3. **Configuração RTMP** - Valores incorretos no banco de dados

### 📋 Documentação Completa para Migração

### 📖 Documentação Principal
- **[MIGRACAO_SERVIDOR_CLIENTE.md](./MIGRACAO_SERVIDOR_CLIENTE.md)** - Guia completo de migração passo a passo
- **[README_SERVIDOR_CLIENTE.md](./README_SERVIDOR_CLIENTE.md)** - Documentação de deploy e configuração
- **[CHECKLIST_MIGRACAO_CLIENTE.md](./CHECKLIST_MIGRACAO_CLIENTE.md)** - Checklist interativo para acompanhamento
- **[RESUMO_CORRECOES.md](./RESUMO_CORRECOES.md)** - Resumo de todas as correções aplicadas
- **[CONFIG_SERVIDOR_CLIENTE.env](./CONFIG_SERVIDOR_CLIENTE.env)** - Template de configuração de ambiente

### 🔧 Scripts de Auxílio
- **[verificar-migracao.js](./verificar-migracao.js)** - Verificação automática pré-migração
- **[diagnostico_completo.js](./diagnostico_completo.js)** - Diagnóstico completo do sistema
- **[diagnostico_simples.js](./diagnostico_simples.js)** - Verificação rápida de conexões
- **[COMANDOS_RAPIDOS.md](./COMANDOS_RAPIDOS.md)** - Comandos essenciais para operação

### 🚀 Início Rápido para Migração
```bash
# 1. Verificar sistema
node diagnostico_completo.js

# 2. Validar configurações
node verificar-migracao.js

# 3. Seguir checklist
# Abrir CHECKLIST_MIGRACAO_CLIENTE.md

# 4. Configurar ambiente
# Copiar CONFIG_SERVIDOR_CLIENTE.env para .env
```

## 📦 Instalação

### Pré-requisitos
- Node.js 18+
- PostgreSQL 13+
- Redis 6+
- Docker (opcional)
- FFmpeg (para processamento)

### 🚀 Desenvolvimento Local

```bash
# 1. Clone o repositório
git clone <repository-url>
cd NewCAM

# 2. Verificar sistema antes de iniciar
node verificar-migracao.js

# 3. Backend
cd backend
npm install
cp .env.example .env
# Configure as variáveis no .env (Supabase URLs e keys)
npm run dev

# 4. Frontend (novo terminal)
cd frontend
npm install
cp .env.example .env
# Configure as variáveis no .env
npm run dev
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

### Variáveis de Ambiente

#### Backend (.env)
```env
NODE_ENV=development
PORT=3003
SUPABASE_URL=https://grkvfzuadctextnbpajb.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=your-secret-key
CORS_ORIGIN=http://localhost:5174
```

#### Frontend (.env)
```env
VITE_API_URL=http://localhost:3002/api
VITE_WS_URL=ws://localhost:3002
VITE_SUPABASE_URL=https://grkvfzuadctextnbpajb.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Banco de Dados

O projeto utiliza **Supabase** como banco de dados. As tabelas e dados já estão configurados:

- **URL**: https://grkvfzuadctextnbpajb.supabase.co
- **Usuários**: Já cadastrados no sistema
- **Câmeras**: Configuradas e prontas para uso
- **Políticas RLS**: Ativas para segurança

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
- `GET /api/cameras/:id/stream` - Stream da câmera

### Gravações
- `GET /api/recordings` - Listar gravações
- `GET /api/recordings/:id` - Detalhes da gravação
- `DELETE /api/recordings/:id` - Excluir gravação

## 🎥 Streaming

### Protocolos Suportados
- **RTSP**: `rtsp://66.94.104.241:554/live/stream`
- **RTMP**: `rtmp://66.94.104.241:1935/live/stream`
- **HLS**: `http://66.94.104.241:8080/live/stream.m3u8`
- **HTTP-FLV**: `http://66.94.104.241:8080/live/stream.flv`

### Configuração de Câmeras

```json
{
  "name": "Câmera Principal",
  "rtsp_url": "rtsp://admin:password@192.168.1.100:554/stream",
  "enabled": true,
  "recording": true,
  "motion_detection": true
}
```

## 🔧 Monitoramento

### PM2 (Produção)
```bash
# Status dos processos
pm2 status

# Logs em tempo real
pm2 logs

# Reiniciar serviços
pm2 restart all

# Monitoramento
pm2 monit
```

### Docker
```bash
# Status dos containers
docker ps

# Logs dos serviços
docker-compose logs -f newcam-backend
docker-compose logs -f newcam-postgres
docker-compose logs -f newcam-redis
docker-compose logs -f newcam-zlmediakit

# Reiniciar serviços
docker-compose restart
```

## 🛠️ Desenvolvimento

### Scripts Úteis

```bash
# Backend
npm run dev          # Desenvolvimento
npm run build        # Build para produção
npm run test         # Executar testes
npm run lint         # Verificar código

# Frontend
npm run dev          # Servidor de desenvolvimento
npm run build        # Build para produção
npm run preview      # Preview da build
npm run lint         # ESLint

# Worker
npm start            # Iniciar worker
npm run dev          # Desenvolvimento
```

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

## 🧪 Testes

```bash
# Backend
cd backend
npm test

# Frontend
cd frontend
npm test

# Testes E2E
npm run test:e2e
```

## 📊 Performance

### Métricas Monitoradas
- CPU e memória dos processos
- Latência das APIs
- Qualidade dos streams
- Uso de armazenamento
- Conexões simultâneas

### Otimizações
- Cache Redis para consultas frequentes
- Compressão gzip no Nginx
- Lazy loading de componentes
- Otimização de imagens
- CDN para assets estáticos

## 🔒 Segurança

### Medidas Implementadas
- Autenticação JWT
- HTTPS em produção
- Rate limiting
- Validação de entrada
- Sanitização de dados
- CORS configurado
- Headers de segurança

### Configuração SSL (Produção)
```bash
# Certbot para Let's Encrypt
sudo certbot --nginx -d seu-dominio.com
```

## 📝 Logs

### Localização dos Logs
- **Backend**: `/var/www/newcam/backend/logs/`
- **Worker**: `/var/www/newcam/worker/logs/`
- **Nginx**: `/var/log/nginx/`
- **PM2**: `~/.pm2/logs/`

### Níveis de Log
- `error`: Erros críticos
- `warn`: Avisos importantes
- `info`: Informações gerais
- `debug`: Depuração (apenas desenvolvimento)

## 🚀 Deploy

### Produção

1. **Preparar servidor**:
```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar dependências
sudo apt install -y nodejs npm nginx postgresql redis-server
```

2. **Deploy da aplicação**:
```bash
# Clonar código
git clone <repository> /var/www/newcam
cd /var/www/newcam

# Instalar dependências
npm install --production

# Build do frontend
cd frontend && npm run build

# Configurar PM2
pm2 start ecosystem.config.js
pm2 startup
pm2 save
```

3. **Configurar Nginx**:
```bash
# Copiar configuração
sudo cp nginx-newcam.conf /etc/nginx/sites-available/newcam
sudo ln -s /etc/nginx/sites-available/newcam /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 🆘 Troubleshooting

### Problemas Comuns

#### Backend não inicia
```bash
# Verificar logs
pm2 logs newcam-backend

# Verificar porta
sudo netstat -tlnp | grep 3002

# Reiniciar
pm2 restart newcam-backend
```

#### Frontend não carrega
```bash
# Verificar build
cd frontend && npm run build

# Verificar Nginx
sudo nginx -t
sudo systemctl status nginx
```

#### Streaming não funciona
```bash
# Verificar ZLMediaKit
docker logs newcam-zlmediakit

# Testar API
curl http://localhost:9902/index/api/getServerConfig
```

#### Banco de dados
```bash
# Verificar PostgreSQL
sudo systemctl status postgresql

# Conectar ao banco
psql -U postgres -d newcam

# Verificar conexões
SELECT * FROM pg_stat_activity;
```

## 📚 Documentação

### 📋 Documentos Essenciais
- [Status do Sistema](docs/STATUS-SISTEMA.md) - Status atual e comandos essenciais
- [Desenvolvimento Local](docs/DESENVOLVIMENTO-LOCAL.md) - Guia completo para desenvolvimento
- [Credenciais e Login](docs/CREDENCIAIS-LOGIN.md) - Informações de acesso e autenticação
- [Configuração do Supabase](docs/configuracao-supabase.md) - Setup do banco de dados
- [Deploy em Produção](docs/PRODUCTION-README.md) - Configuração para produção

## 📞 Suporte

### Informações do Sistema
- **Versão**: 1.0.0
- **Node.js**: 18+
- **Banco**: PostgreSQL 13+
- **Cache**: Redis 6+
- **Servidor**: Ubuntu 20.04

### Comandos de Diagnóstico
```bash
# Status geral
pm2 status
docker ps
sudo systemctl status nginx postgresql redis

# Verificar portas
sudo netstat -tlnp | grep -E '(3002|5432|6379|9902)'

# Logs recentes
pm2 logs --lines 50
sudo tail -f /var/log/nginx/error.log
```

---

**NewCAM** - Sistema de Vigilância Profissional  
Desenvolvido com ❤️ para segurança e monitoramento eficiente.