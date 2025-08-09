# Configuração Técnica Atualizada - NewCAM

## 📋 Visão Geral

Documento técnico atualizado com todas as configurações necessárias para o funcionamento correto do projeto NewCAM após as correções realizadas em Janeiro 2025.

## 🔧 Configurações Críticas

### 1. Arquivo .env do Backend

**Localização**: `backend/.env`

**Configurações Obrigatórias**:

```env
# Servidor Backend
PORT=3002
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# ZLMediaKit - CONFIGURAÇÃO CRÍTICA
ZLM_SECRET=9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK
ZLM_API_URL=http://localhost:8000/index/api
ZLM_BASE_URL=http://localhost:8000

# ⚠️ IMPORTANTE: NÃO usar ZLMEDIAKIT_SECRET - causa conflito
# ZLMEDIAKIT_SECRET=035c73f7-bb6b-4889-a715-d9eb2d1925cc # REMOVIDO

# Supabase
SUPABASE_URL=https://grkvfzuadctextnbpajb.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyMjQyMzgsImV4cCI6MjA2ODgwMDIzOH0.Simv8hH8aE9adQiTf6t1BZIcMPniNh9ecpjxEeki4mE
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzIyNDIzOCwiZXhwIjoyMDY4ODAwMjM4fQ.XJoPu5InA_s3pfryZfSChBqZnu7zBV3vwH7ZM4jf04M

# Streaming
STREAMING_SERVER=zlm
STREAMING_QUALITY=720p
MAX_CONCURRENT_STREAMS=10

# Autenticação
JWT_SECRET=newcam-dev-jwt-secret-key-2025-extended
JWT_EXPIRES_IN=7d
BCRYPT_ROUNDS=12

# Logs
LOG_LEVEL=debug
DEBUG_MODE=true
VERBOSE_LOGGING=true
```

### 2. Configuração da Câmera no Supabase

**Tabela**: `cameras`

**Configuração Correta**:

```sql
-- Configurar câmera principal
UPDATE cameras 
SET 
    rtsp_url = 'rtsp://visualizar:infotec5384@170.245.45.10:37777/h264/ch4/main/av_stream',
    stream_type = 'rtsp',
    status = 'online',
    name = 'Câmera Principal',
    location = 'Entrada Principal'
WHERE id = 'c18f36e2-a165-4b35-ba1c-dc701b16e939';

-- Verificar configuração
SELECT id, name, rtsp_url, stream_type, status, location
FROM cameras 
WHERE id = 'c18f36e2-a165-4b35-ba1c-dc701b16e939';
```

**Detalhes da URL RTSP**:
- **Protocolo**: RTSP
- **Usuário**: `visualizar`
- **Senha**: `infotec5384`
- **IP**: `170.245.45.10`
- **Porta**: `37777`
- **Caminho**: `/h264/ch4/main/av_stream`
- **URL Completa**: `rtsp://visualizar:infotec5384@170.245.45.10:37777/h264/ch4/main/av_stream`

### 3. Configuração do ZLMediaKit

**Porta**: 8000
**Secret**: `9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK`
**Localização**: `backend/zlmediakit/ZLMediaKit/`

**Inicialização**:
```powershell
cd backend/zlmediakit/ZLMediaKit
./MediaServer.exe
```

**Verificação**:
```powershell
# Testar conectividade
curl http://localhost:8000

# Testar API
curl -X POST http://localhost:8000/index/api/getServerConfig \
  -H "Content-Type: application/json" \
  -d '{"secret":"9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK"}'
```

## 🚀 Processo de Inicialização

### 1. Preparação do Ambiente

```powershell
# Verificar Node.js
node --version  # Deve ser 22.14.0+

# Navegar para o projeto
cd C:\Users\GouveiaRx\Downloads\NewCAM

# Verificar estrutura
ls
```

### 2. Instalação de Dependências

```powershell
# Dependências do projeto principal
npm install

# Dependências do backend
cd backend
npm install

# Dependências do frontend
cd ../frontend
npm install

# Voltar ao diretório raiz
cd ..
```

### 3. Configuração de Ambiente

```powershell
# Copiar arquivo de exemplo (se necessário)
cp backend/.env.example backend/.env

# Editar configurações
notepad backend/.env
```

### 4. Inicialização dos Serviços

```powershell
# Iniciar ZLMediaKit (terminal separado)
cd backend/zlmediakit/ZLMediaKit
./MediaServer.exe

# Iniciar projeto (novo terminal)
cd C:\Users\GouveiaRx\Downloads\NewCAM
npm run dev
```

### 5. Verificação

```powershell
# Verificar serviços rodando
netstat -an | findstr :5173  # Frontend
netstat -an | findstr :3002  # Backend
netstat -an | findstr :8000  # ZLMediaKit

# Testar URLs
curl http://localhost:5173  # Frontend
curl http://localhost:3002/health  # Backend
curl http://localhost:8000  # ZLMediaKit
```

## 🔍 Arquitetura do Sistema

### Componentes Principais

1. **Frontend** (React + Vite)
   - Porta: 5173
   - Localização: `frontend/`
   - Tecnologias: React, TypeScript, Tailwind CSS

2. **Backend** (Node.js + Express)
   - Porta: 3002
   - Localização: `backend/`
   - Tecnologias: Express, Supabase, ZLMediaKit SDK

3. **ZLMediaKit** (Servidor de Streaming)
   - Porta: 8000
   - Localização: `backend/zlmediakit/ZLMediaKit/`
   - Função: Processamento de streams RTSP/RTMP

4. **Supabase** (Banco de Dados)
   - URL: https://grkvfzuadctextnbpajb.supabase.co
   - Função: Armazenamento de dados, autenticação

### Fluxo de Dados

```
Câmera RTSP → ZLMediaKit → Backend → Frontend
     ↓              ↓         ↓        ↓
  Stream         Processamento  API   Interface
```

## 🛠️ Configurações Avançadas

### Variáveis de Ambiente Opcionais

```env
# Redis (Cache)
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379

# Upload/Storage
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=50MB
ALLOWED_FILE_TYPES=jpg,jpeg,png,mp4,avi,mov

# Monitoramento
MONITORING_ENABLED=true
METRICS_PORT=9090
HEALTH_CHECK_INTERVAL=30000

# Segurança
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100
CORS_ORIGIN=http://localhost:5173

# Gravação
RECORDING_ENABLED=true
RECORDING_PATH=./recordings
RECORDING_DURATION=3600
AUTO_DELETE_RECORDINGS=true
RECORDING_RETENTION_DAYS=30
```

### Scripts Package.json

**Projeto Principal**:
```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
    "dev:backend": "cd backend && npm run dev",
    "dev:frontend": "cd frontend && npm run dev"
  }
}
```

**Backend**:
```json
{
  "scripts": {
    "dev": "nodemon src/server.js",
    "start": "node src/server.js"
  }
}
```

**Frontend**:
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

## 🔐 Segurança

### Configurações de Segurança

1. **JWT Secret**: Usar chave forte e única
2. **Supabase Keys**: Manter chaves seguras
3. **ZLM Secret**: Não expor em logs
4. **CORS**: Configurar origins permitidas
5. **Rate Limiting**: Configurar limites apropriados

### Boas Práticas

- Nunca commitar arquivo `.env`
- Usar variáveis de ambiente para secrets
- Configurar HTTPS em produção
- Implementar autenticação robusta
- Monitorar logs de segurança

## 📊 Monitoramento

### Logs Importantes

**Sucesso**:
```
[INFO] ZLMediaKit server está online
[INFO] Serviço de streaming inicializado com servidor: zlm
[INFO] Stream c18f36e2-a165-4b35-ba1c-dc701b16e939 iniciado com sucesso
```

**Erro**:
```
[ERROR] Incorrect secret
[ERROR] OPTIONS:404 Not Found
[ERROR] Stream não encontrado
```

### Métricas

- **CPU**: Monitorar uso dos processos Node.js e MediaServer
- **Memória**: Verificar consumo de RAM
- **Rede**: Monitorar tráfego de streaming
- **Disco**: Verificar espaço para gravações

## 🔄 Backup e Recuperação

### Arquivos Críticos

1. `backend/.env` - Configurações
2. `backend/src/` - Código do backend
3. `frontend/src/` - Código do frontend
4. Banco Supabase - Dados das câmeras

### Procedimento de Backup

```powershell
# Backup de configurações
cp backend/.env backup/.env.backup

# Backup de código
git add .
git commit -m "Backup - $(Get-Date)"
git push

# Backup do banco (via Supabase Dashboard)
# Exportar dados das tabelas principais
```

## 📋 Checklist de Configuração

### Pré-Inicialização
- [ ] Node.js 22.14.0+ instalado
- [ ] Dependências instaladas em todos os diretórios
- [ ] Arquivo `.env` configurado corretamente
- [ ] ZLMediaKit disponível
- [ ] Supabase acessível

### Pós-Inicialização
- [ ] Frontend carregando em localhost:5173
- [ ] Backend respondendo em localhost:3002
- [ ] ZLMediaKit ativo em localhost:8000
- [ ] Câmera configurada no Supabase
- [ ] Stream funcionando sem erros

### Verificação de Funcionalidade
- [ ] Login/logout funcionando
- [ ] Lista de câmeras carregando
- [ ] Iniciar stream sem erro HTTP 500
- [ ] Stream exibindo vídeo
- [ ] Logs sem erros críticos

---

**Última atualização**: Janeiro 2025
**Status**: Configuração validada e funcionando
**Responsável**: Engenheiro de Software Sênior
**Próxima revisão**: Conforme necessário