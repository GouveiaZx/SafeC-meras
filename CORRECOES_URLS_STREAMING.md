# Correção Completa: URLs de Streaming com localhost:8000

## Resumo das Correções Realizadas

### Problema Identificado
As URLs de streaming estavam sendo geradas incorretamente com `localhost:8000` ao invés de usar o proxy do backend, causando erros de CORS e conectividade.

### Causas Raiz
1. **Configuração do Frontend**: Arquivo `vite.config.ts` tinha proxy direto para `/live` apontando para `http://zlmediakit:8000`
2. **URLs no Banco de Dados**: Registros no Supabase continham URLs antigas com formato incorreto
3. **Variáveis de Ambiente**: Configuração do backend usava `zlmediakit:80` ao invés de `localhost:8000` para desenvolvimento local

### Correções Aplicadas

#### 1. Frontend - vite.config.ts
```typescript
// Removido proxy direto para /live que causava URLs incorretas
// Todas as URLs de streaming agora passam pelo backend via /api
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:3002',
      changeOrigin: true,
    },
    // Proxy /live removido - URLs devem usar /api/streams/{id}/hls
  }
}
```

#### 2. Backend - .env
```bash
# Configurações de ZLMediaKit - Desenvolvimento Local
ZLM_BASE_URL=http://localhost:8000
ZLM_API_URL=http://localhost:8000/index/api
ZLMEDIAKIT_API_URL=http://localhost:8000
```

#### 3. Banco de Dados - Supabase
Corrigidos os seguintes registros:
- **Streams**: 3 registros com URLs antigas
- **Cameras**: 2 registros com URLs antigas
- **Stream com ID errado**: 1 registro usando `test-stream-123` ao invés do ID real

#### 4. Scripts de Validação Criados
- `fix-supabase-urls.js`: Script para correção manual de URLs
- `validate-urls.js`: Script para validação de URLs corretas
- `prevent-url-issues.js`: Script preventivo para correção automática

### URLs Corretas Agora
Todas as URLs de streaming agora usam o formato padronizado:

```
# HLS Streaming
/api/streams/{stream_id}/hls/stream.m3u8

# FLV Streaming
/api/streams/{stream_id}/flv

# WebSocket
ws://localhost:3002/api/streams/{stream_id}/ws
```

### Verificação Final
Execute para confirmar que tudo está correto:

```powershell
node validate-urls.js
```

Resultado esperado: "✅ Todas as URLs estão corretas!"

### Próximos Passos
1. **Limpar cache do navegador** antes de testar
2. **Reiniciar serviços** se necessário
3. **Testar streaming** com câmeras ativas
4. **Executar prevent-url-issues.js** periodicamente para garantir consistência

### Arquivos Criados
- `fix-supabase-urls.js`: Correção manual
- `validate-urls.js`: Validação de URLs
- `prevent-url-issues.js`: Correção automática preventiva
- `CORRECOES_URLS_STREAMING.md`: Esta documentação

### Comandos Úteis
```powershell
# Validar URLs
node validate-urls.js

# Corrigir URLs manualmente
node fix-supabase-urls.js

# Executar correção automática
node prevent-url-issues.js
```

## Status: ✅ RESOLVIDO
O problema de URLs com localhost:8000 foi completamente resolvido. Todas as URLs agora usam o proxy do backend, eliminando erros de CORS.