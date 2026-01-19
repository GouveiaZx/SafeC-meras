# ⚡ Quick Setup - SRS RTMP Integration

## ✅ Passos Já Executados Automaticamente (via MCP)

### 1. ✅ Database Migration Aplicada
- Tabela `rtmp_stream_pool` criada no Supabase
- Campos adicionados na tabela `cameras`
- Triggers e funções criadas automaticamente
- Índices de performance aplicados

### 2. ✅ Backend Completo
- `SRSIntegrationService.js` criado
- Routes `/api/rtmp/*` configuradas
- Webhooks SRS `/api/srs/webhook/*` criados
- Variáveis de ambiente adicionadas ao `.env`
- Rotas registradas no `server.js`

### 3. ✅ Frontend Base
- `RTMPPoolManager.tsx` criado
- `RTMPConfigDisplay.tsx` criado
- Rota `/rtmp-pool` adicionada ao App.tsx
- Requer apenas login como ADMIN para acesso

---

## 🔧 Próximos Passos Manuais (Rápidos)

### Passo 1: Configurar Servidor SRS Remoto (5 min)

Edite `backend/.env` e ajuste as configurações do seu servidor SRS:

```env
# Substitua 'localhost' pelo IP/domínio do seu servidor SRS
SRS_SERVER_HOST=SEU_SERVIDOR_IP_OU_DOMINIO
SRS_API_URL=http://SEU_SERVIDOR_IP:1985/api/v1
SRS_RTMP_PORT=1936  # Porta RTMP do seu servidor
```

### Passo 2: Configurar Webhooks no Servidor SRS (10 min)

No seu servidor SRS com HAProxy, edite o arquivo de configuração do SRS (geralmente `srs.conf`):

```nginx
http_hooks {
    enabled on;
    on_publish http://SEU_BACKEND_IP:3002/api/srs/webhook/on-publish;
    on_unpublish http://SEU_BACKEND_IP:3002/api/srs/webhook/on-unpublish;
}
```

**Substitua `SEU_BACKEND_IP` pelo IP público do servidor NewCAM.**

Reinicie o SRS:
```bash
# Exemplo (ajuste conforme sua instalação)
systemctl restart srs
# ou
docker restart srs-container
```

### Passo 3: Inicializar Pool de URLs (2 min)

#### Opção A: Via Interface Web (Recomendado)
1. Faça login como ADMIN no NewCAM
2. Acesse menu "RTMP Pool" (ou `/rtmp-pool`)
3. Clique no botão **"Initialize Pool"**
4. Aguarde confirmação (100 URLs criadas)

#### Opção B: Via API (Curl)
```bash
# Obtenha seu token JWT fazendo login no sistema
# Depois execute:

curl -X POST http://localhost:3002/api/rtmp/initialize \
  -H "Authorization: Bearer SEU_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

### Passo 4: Testar Geração de URL (5 min)

1. Vá para "Câmeras" → "Adicionar Câmera"
2. Selecione tipo de stream: **RTMP**
3. Clique no botão **"Gerar URL RTMP"**
4. Copie a URL gerada
5. Configure na sua câmera física
6. Aguarde a câmera transmitir
7. Verifique status no RTMP Pool Manager

---

## 📊 Como Usar o Sistema

### Fluxo Completo

```
1. ADMIN acessa "RTMP Pool Manager"
   → Visualiza pool de 100 URLs disponíveis

2. Usuário cria nova câmera:
   → Seleciona "RTMP Dinâmico"
   → Clica "Gerar URL RTMP"
   → Sistema aloca próxima URL sequencial (ex: stream042)

3. URL é exibida no formato:
   Servidor: rtmp://seu-servidor:1936/live
   Stream Key: stream042
   URL Completa: rtmp://seu-servidor:1936/live/stream042

4. Usuário copia URL e configura na câmera física

5. Câmera transmite → SRS recebe stream

6. SRS envia webhook para backend:
   POST /api/srs/webhook/on-publish

7. Backend atualiza status:
   - Stream: "available" → "streaming"
   - Camera: status → "online"

8. Sistema inicia gravação automaticamente (se habilitada)
```

### Gerenciamento do Pool

**No RTMP Pool Manager você pode:**
- ✅ Ver todas as URLs e seus status
- ✅ Filtrar por status (available, assigned, streaming)
- ✅ Sincronizar com SRS manualmente
- ✅ Refill do pool (adicionar +50 URLs)
- ✅ Liberar URLs manualmente
- ✅ Ver estatísticas em tempo real

---

## 🔍 Verificações e Troubleshooting

### Verificar se Migration Funcionou
```sql
-- No Supabase SQL Editor:
SELECT COUNT(*) FROM rtmp_stream_pool;
-- Deve retornar 0 (antes de inicializar) ou 100+ (depois)

SELECT * FROM rtmp_stream_pool LIMIT 5;
-- Deve mostrar streams com sequential_number, stream_key, etc.
```

### Verificar Backend Funcionando
```bash
# Health check das rotas
curl http://localhost:3002/api/rtmp/stats
# Deve retornar JSON com estatísticas do pool

curl http://localhost:3002/api/srs/webhook/health
# Deve retornar: {"success":true,"message":"SRS webhook handler is operational"}
```

### Verificar SRS Acessível
```bash
# Teste se backend consegue acessar SRS
curl http://SEU_SERVIDOR_SRS:1985/api/v1/streams/
# Deve retornar lista de streams ativos (ou array vazio)
```

### Problemas Comuns

#### Pool está vazio
**Solução**: Clique "Initialize Pool" na interface ou execute via API

#### SRS webhooks não funcionam
**Solução**:
- Verifique firewall permite SRS → Backend
- Teste: `curl http://SEU_BACKEND:3002/api/srs/webhook/health`
- Verifique logs do SRS

#### Streams mostram "assigned" mas câmera está transmitindo
**Solução**: Clique "Sync with SRS" no Pool Manager

#### Não consigo gerar novas URLs
**Solução**:
- Verifique pool disponível: clique "Stats"
- Se necessário, clique "Refill Pool"

---

## 📁 Arquivos Importantes Criados

```
backend/
├── migrations/
│   └── 20250110_create_rtmp_stream_pool.sql
├── src/
│   ├── services/
│   │   └── SRSIntegrationService.js
│   ├── routes/
│   │   ├── rtmpPool.js
│   │   └── srsWebhooks.js
│   └── models/
│       └── Camera.js (campos RTMP adicionados)

frontend/
├── src/
│   ├── pages/
│   │   └── RTMPPoolManager.tsx
│   ├── components/
│   │   └── RTMPConfigDisplay.tsx
│   └── App.tsx (rota adicionada)

docs/
├── SRS_RTMP_INTEGRATION_GUIDE.md (guia completo)
└── QUICK_SETUP_SRS.md (este arquivo)

.env (variáveis SRS adicionadas)
.env.example (template atualizado)
```

---

## 🎯 Endpoints API Disponíveis

```
# Pool Management (requer autenticação ADMIN)
GET    /api/rtmp/pool                - Listar streams
GET    /api/rtmp/stats               - Estatísticas
POST   /api/rtmp/request-url         - Solicitar nova URL
POST   /api/rtmp/initialize          - Inicializar pool
POST   /api/rtmp/sync                - Sincronizar com SRS
POST   /api/rtmp/refill              - Refill (+50 URLs)
DELETE /api/rtmp/:id/release         - Liberar stream

# Webhooks SRS (chamados pelo servidor SRS - sem autenticação JWT)
POST   /api/srs/webhook/on-publish   - Stream iniciado
POST   /api/srs/webhook/on-unpublish - Stream parado
GET    /api/srs/webhook/health       - Health check
```

---

## 🚀 Teste Rápido End-to-End

1. **Inicialize o pool:**
   - Interface: RTMP Pool → "Initialize Pool"
   - Verifique: 100 streams criadas

2. **Teste geração de URL:**
   - Câmeras → Adicionar → RTMP → Gerar URL
   - Copie a URL gerada

3. **Simule stream (teste):**
   ```bash
   # Com FFmpeg (se disponível)
   ffmpeg -re -i video-teste.mp4 -c copy -f flv rtmp://seu-servidor:1936/live/stream001
   ```

4. **Verifique status:**
   - RTMP Pool Manager → Stream001 deve mostrar "streaming"
   - Câmera deve mostrar status "online"

---

## 📞 Suporte

- **Guia Completo**: [docs/SRS_RTMP_INTEGRATION_GUIDE.md](docs/SRS_RTMP_INTEGRATION_GUIDE.md)
- **Logs Backend**: `backend/storage/logs/`
- **Logs SRS**: Verifique logs do seu servidor SRS

---

**Status da Implementação**:
- ✅ Backend: 100% Completo
- ✅ Database: Migrated
- ✅ Frontend Base: Completo
- 🟡 Configuração SRS Remoto: Requer ajuste manual (5 min)
- 🟡 Modal de Câmera: Opcional - integração manual (15 min)

**Tempo Estimado para Finalizar**: 15-25 minutos
