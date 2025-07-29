# 📋 Documentação de Migração - NewCAM para Servidor Cliente

## 🎯 Objetivo
Guia completo para migração do sistema NewCAM de desenvolvimento local para servidor de produção do cliente, incluindo todas as correções críticas aplicadas.

## 🚨 Problemas Críticos Resolvidos

### 1. Erro 400 - Stream já ativo
**Causa**: Coluna `stream_type` ausente no banco de dados Supabase
**Solução**: Migration adicionada para criar e popular coluna
**Impacto**: Sistema não conseguia identificar tipo de stream (RTMP/RTSP)

### 2. Porta 3002 em uso
**Causa**: Processo travado do backend
**Solução**: Identificação e encerramento forçado do processo
**Impacto**: Backend não iniciava corretamente

## 📁 Estrutura de Arquivos Essenciais

### Backend
```
backend/
├── .env (configurações de ambiente)
├── src/services/StreamingService.js (serviço de streaming)
├── src/routes/streams.js (endpoints de stream)
├── database/migrations/ (migrations do banco)
└── zlmediakit/ (configuração ZLMediaKit)
```

### Frontend
```
frontend/
├── .env (configurações do frontend)
├── src/services/api.ts (configuração da API)
└── src/components/CameraCard.tsx (componente de câmera)
```

## 🔧 Configurações Necessárias

### 1. Banco de Dados Supabase

#### Migration Obrigatória
```sql
-- Migration: add_stream_type_to_cameras
ALTER TABLE cameras ADD COLUMN stream_type VARCHAR(10) DEFAULT 'rtsp';

-- Atualizar valores baseados nos URLs existentes
UPDATE cameras SET stream_type = CASE 
    WHEN rtmp_url IS NOT NULL AND rtmp_url != '' THEN 'rtmp' 
    ELSE 'rtsp' 
END WHERE stream_type = 'rtsp' OR stream_type IS NULL;
```

#### Verificar estrutura
```sql
-- Verificar se a coluna existe
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'cameras' AND column_name = 'stream_type';

-- Verificar dados da câmera RTMP
SELECT id, name, stream_type, rtmp_url, status FROM cameras 
WHERE rtmp_url IS NOT NULL;
```

### 2. Variáveis de Ambiente (Backend)

#### .env (Backend)
```bash
# Supabase
SUPABASE_URL=https://[PROJECT_ID].supabase.co
SUPABASE_ANON_KEY=[ANON_KEY]
SUPABASE_SERVICE_ROLE_KEY=[SERVICE_ROLE_KEY]

# Streaming
STREAMING_SERVER=zlm
ZLM_API_URL=http://localhost:8080
ZLM_SECRET_KEY=[ZLM_SECRET]

# Portas
PORT=3002
```

#### .env (Frontend)
```bash
VITE_API_URL=http://localhost:3002
VITE_WS_URL=ws://localhost:3002
```

### 3. Configuração ZLMediaKit

#### Arquivo: zlmediakit/config.ini
```ini
[general]
mediaServerId=zlm_server_01

[http]
port=8080
sslport=8443

[rtmp]
port=1935

[rtsp]
port=554
```

## 🚀 Checklist de Migração

### Pré-Migração
- [ ] Backup completo do banco de dados
- [ ] Verificar todas as variáveis de ambiente
- [ ] Testar conectividade com Supabase
- [ ] Validar configurações do ZLMediaKit

### Durante Migração
- [ ] Executar migration do banco de dados
- [ ] Copiar arquivos .env para servidor
- [ ] Instalar dependências (npm install)
- [ ] Configurar ZLMediaKit no servidor
- [ ] Testar endpoints de API

### Pós-Migração
- [ ] Verificar logs do backend
- [ ] Testar cadastro de câmeras
- [ ] Testar início/parada de streams
- [ ] Validar streaming RTMP/RTSP
- [ ] Verificar monitoramento de câmeras

## 🧪 Testes de Validação

### Teste 1: Banco de Dados
```bash
# Verificar coluna stream_type
psql -h [host] -d [database] -c "\d cameras"

# Verificar dados
psql -h [host] -d [database] -c "SELECT id, name, stream_type, status FROM cameras LIMIT 5"
```

### Teste 2: API Backend
```bash
# Health check
curl http://localhost:3002/api/health

# Listar câmeras
curl http://localhost:3002/api/cameras

# Testar stream (substituir ID)
curl -X POST http://localhost:3002/api/streams/[CAMERA_ID]/start
```

### Teste 3: Frontend
```bash
# Verificar build
npm run build

# Testar localmente
npm run dev
```

## 📝 Logs e Monitoramento

### Backend Logs
- Local: `backend/logs/`
- Docker: `docker logs newcam-backend`

### ZLMediaKit Logs
- Local: `zlmediakit/logs/`
- Docker: `docker logs zlmediakit`

### Monitoramento de Câmeras
- Endpoint: `GET /api/cameras/status`
- WebSocket: `ws://localhost:3002/socket.io`

## 🔍 Solução de Problemas

### Erro 400 ao iniciar stream
1. Verificar se a coluna `stream_type` existe no banco
2. Confirmar que o valor está correto (rtmp/rtsp)
3. Verificar logs do backend para detalhes

### Porta 3002 em uso
1. Identificar processo: `Get-NetTCPConnection -LocalPort 3002`
2. Encerrar processo: `taskkill /PID [PID] /F`
3. Reiniciar backend

### Câmera aparece offline
1. Verificar configuração RTMP/RTSP
2. Validar URL da câmera
3. Verificar logs do ZLMediaKit
4. Testar conectividade manual

## 📞 Contatos de Suporte

### Documentação Interna
- README.md (raiz do projeto)
- docs/PRODUCTION-README.md
- docs/STATUS-SISTEMA.md

### Scripts de Auxílio
- `start-all-services.ps1` - Inicialização completa
- `scripts/migrate-camera-stream-type.js` - Migration de dados
- `diagnostico_simples.js` - Diagnóstico rápido

## 🔄 Manutenção Contínua

### Tarefas Semanais
- [ ] Verificar logs de erro
- [ ] Validar conectividade das câmeras
- [ ] Atualizar dependências de segurança
- [ ] Backup do banco de dados

### Tarefas Mensais
- [ ] Revisão de performance
- [ ] Atualização de documentação
- [ ] Teste de recuperação de desastres
- [ ] Auditoria de segurança

---

**Última atualização**: [Data da migração]
**Responsável**: [Nome do responsável]
**Versão**: v1.0.0