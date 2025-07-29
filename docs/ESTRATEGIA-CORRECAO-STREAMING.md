# Estratégia Final para Correção dos Erros de Streaming HLS

## 🔍 Diagnóstico dos Problemas Identificados

### Problemas Encontrados:
1. **Erro `net::ERR_EMPTY_RESPONSE`** - O servidor não está retornando conteúdo para as URLs HLS
2. **Erro `manifestLoadError`** - Falha no carregamento do manifesto `.m3u8`
3. **Configuração incorreta da API do ZLMediaKit** - Backend tentando acessar porta 9902 que não existe
4. **Streams não estão sendo criados** - Nenhum stream ativo nos servidores

### Status Atual dos Serviços:
- ✅ **ZLMediaKit**: Ativo na porta 8000 (HTTP) e 1935 (RTMP)
- ✅ **SRS**: Ativo na porta 8001 (HTTP) e 1936 (RTMP)
- ✅ **Backend**: Configurado para usar ZLMediaKit (`STREAMING_SERVER=zlm`)
- ❌ **API ZLMediaKit**: Configuração incorreta (porta 9902 não existe)
- ❌ **Streams HLS**: Não estão sendo gerados

## 🛠️ Plano de Correção (MCPs - Minimum Corrective Procedures)

### MCP 1: Corrigir Configuração da API do ZLMediaKit

**Problema**: Backend está tentando acessar `http://localhost:9902/index/api` mas a API do ZLMediaKit está em `http://localhost:8000/index/api`

**Correção**:
```bash
# Atualizar variável de ambiente no backend/.env
ZLM_API_URL=http://localhost:8000/index/api
```

### MCP 2: Verificar e Corrigir Configuração de Streaming

**Problema**: Streams não estão sendo criados corretamente

**Ações**:
1. Verificar se as câmeras estão enviando streams RTSP
2. Confirmar se o ZLMediaKit está recebendo os streams
3. Verificar se a conversão para HLS está funcionando

### MCP 3: Corrigir Roteamento de URLs HLS

**Problema**: URLs `http://localhost:8001/live/{camera_id}/index.m3u8` não estão sendo servidas corretamente

**Análise**:
- Backend configurado para ZLM mas URLs apontam para porta 8001 (SRS)
- Necessário alinhar configuração

**Opções de Correção**:

#### Opção A: Usar ZLMediaKit (Recomendado)
```bash
# URLs HLS devem ser:
http://localhost:8000/live/{camera_id}/index.m3u8
```

#### Opção B: Usar SRS
```bash
# Alterar backend/.env:
STREAMING_SERVER=srs
SRS_BASE_URL=http://localhost:8001
```

### MCP 4: Verificar Configuração de CORS e Proxy

**Problema**: Possíveis bloqueios de CORS ou proxy

**Verificações**:
1. Confirmar configuração CORS no backend
2. Verificar se NGINX está fazendo proxy corretamente
3. Testar acesso direto às URLs HLS

### MCP 5: Implementar Fallback e Retry Logic

**Problema**: Sistema não tem fallback robusto entre servidores

**Melhorias**:
1. Implementar fallback automático SRS ↔ ZLMediaKit
2. Melhorar retry logic no frontend
3. Adicionar health checks mais robustos

## 🚀 Sequência de Execução

### Fase 1: Correções Imediatas (5-10 minutos)

1. **Corrigir API URL do ZLMediaKit**
   ```bash
   # Editar backend/.env
   ZLM_API_URL=http://localhost:8000/index/api
   ```

2. **Reiniciar Backend**
   ```bash
   # No diretório backend
   npm run dev
   ```

3. **Testar API do ZLMediaKit**
   ```bash
   curl -X POST http://localhost:8000/index/api/getMediaList \
        -H "Content-Type: application/json" \
        -d '{"secret":"9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK"}'
   ```

### Fase 2: Alinhamento de Configuração (10-15 minutos)

4. **Decidir Servidor Principal**
   - **Opção A**: Manter ZLMediaKit e ajustar URLs frontend
   - **Opção B**: Mudar para SRS e manter URLs atuais

5. **Atualizar URLs no Frontend** (se Opção A)
   ```typescript
   // Alterar de:
   http://localhost:8001/live/{camera_id}/index.m3u8
   // Para:
   http://localhost:8000/live/{camera_id}/index.m3u8
   ```

6. **OU Alterar Backend** (se Opção B)
   ```bash
   # backend/.env
   STREAMING_SERVER=srs
   SRS_BASE_URL=http://localhost:8001
   ```

### Fase 3: Teste e Validação (10-15 minutos)

7. **Testar Criação de Stream**
   - Iniciar stream de uma câmera
   - Verificar se arquivo .m3u8 é criado
   - Testar acesso via browser

8. **Validar HLS Player**
   - Testar reprodução no frontend
   - Verificar logs do browser
   - Confirmar ausência de erros

### Fase 4: Otimizações (15-20 minutos)

9. **Implementar Health Checks**
   - Adicionar verificação de status dos servidores
   - Implementar fallback automático

10. **Melhorar Error Handling**
    - Adicionar retry logic mais robusto
    - Implementar notificações de erro

## 🔧 Comandos de Teste e Verificação

### Testar ZLMediaKit
```bash
# Verificar status
curl http://localhost:8000

# Testar API
curl -X POST http://localhost:8000/index/api/getMediaList \
     -H "Content-Type: application/json" \
     -d '{"secret":"9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK"}'

# Verificar streams ativos
curl -X POST http://localhost:8000/index/api/getMediaList \
     -H "Content-Type: application/json" \
     -d '{"secret":"9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK"}'
```

### Testar SRS
```bash
# Verificar status
curl http://localhost:8001

# Verificar API
curl http://localhost:1985/api/v1/summaries

# Verificar streams
curl http://localhost:1985/api/v1/streams
```

### Testar URLs HLS
```bash
# Testar acesso direto ao manifesto
curl http://localhost:8000/live/{camera_id}/index.m3u8
# OU
curl http://localhost:8001/live/{camera_id}/index.m3u8
```

## 📊 Critérios de Sucesso

### ✅ Indicadores de Correção Bem-Sucedida:
1. **API Responses**: ZLMediaKit API responde corretamente na porta 8000
2. **Stream Creation**: Streams são criados quando câmeras são iniciadas
3. **HLS Manifests**: Arquivos .m3u8 são gerados e acessíveis
4. **Frontend Playback**: VideoPlayer reproduz streams sem erros
5. **No Console Errors**: Ausência de `net::ERR_EMPTY_RESPONSE` e `manifestLoadError`

### 🔍 Monitoramento Contínuo:
1. **Logs do Backend**: Verificar criação de streams
2. **Logs do ZLMediaKit**: Confirmar recebimento de streams RTSP
3. **Network Tab**: Verificar requests HLS no browser
4. **Console Logs**: Monitorar erros do VideoPlayer

## 🚨 Troubleshooting Adicional

### Se os problemas persistirem:

1. **Verificar Firewall/Antivírus**
   - Confirmar que portas 8000, 8001, 1935, 1936 estão liberadas

2. **Verificar Recursos do Sistema**
   - Confirmar que containers Docker têm recursos suficientes
   - Verificar uso de CPU/RAM

3. **Verificar Configuração de Rede**
   - Testar conectividade entre containers
   - Verificar configuração de bridge network

4. **Logs Detalhados**
   ```bash
   # Logs detalhados dos containers
   docker logs newcam-zlmediakit --follow
   docker logs newcam-srs --follow
   docker logs newcam-nginx --follow
   ```

## Status das Correções

### ✅ Correções Implementadas

### 1. URL da API do ZLMediaKit
- **Status**: ✅ Corrigida
- **Mudança**: `.env` - `ZLM_API_URL=http://localhost:8000/index/api`
- **Resultado**: API respondendo corretamente na porta 8000

### 2. Nomenclatura HLS
- **Status**: ✅ Alinhada
- **Mudanças**:
  - Backend (`streams.js`): Rota de proxy usa `hls.m3u8` como padrão
  - Frontend (`StreamViewPage.tsx`): URL HLS usa `hls.m3u8`
- **Resultado**: Consistência entre frontend, backend e ZLMediaKit

### 3. Rota de Proxy HLS
- **Status**: ✅ Corrigida
- **Mudança**: `streams.js` - Rota alterada para `/:stream_id/hls/*`
- **Resultado**: Captura correta de caminhos completos dos segmentos

### 4. Streaming de Segmentos
- **Status**: ✅ Corrigida
- **Mudanças**:
  - Tratamento específico para requisições HEAD
  - Implementação de ReadableStream para requisições GET
- **Resultado**: Proxy HLS funcionando para manifestos e segmentos

### 5. Rota de Redirecionamento HLS
- **Status**: ✅ Corrigida
- **Arquivo**: `backend/src/routes/streams.js`
- **Problema**: HLS.js fazia requisições para `/hls` sem arquivo, causando erro 404
- **Solução**: 
  - Adicionada rota `/:stream_id/hls` que redireciona para `/hls/hls.m3u8`
  - Mantém o token de autenticação no redirecionamento
  - Resolve compatibilidade com diferentes players HLS
- **Resultado**: Eliminação de erros 404 e melhoria na compatibilidade HLS

### 🔄 Correções Pendentes
1. **Configuração de roteamento** - Definir se usar porta 8000 (ZLMediaKit) ou 8001 (SRS)
2. **Verificação de CORS e proxy**
3. **Implementação de fallback e retry**

## 📝 Próximos Passos Após Correção

1. **Documentar Configuração Final**
2. **Criar Scripts de Monitoramento**
3. **Implementar Alertas de Falha**
4. **Otimizar Performance de Streaming**
5. **Adicionar Métricas de Qualidade**

---

**Tempo Estimado Total**: 40-60 minutos
**Prioridade**: CRÍTICA
**Responsável**: Equipe de Desenvolvimento
**Data de Criação**: 29/07/2025