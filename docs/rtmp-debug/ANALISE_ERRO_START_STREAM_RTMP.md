# Análise do Erro 400 ao Iniciar Câmeras RTMP

## Descrição do Problema

Ao tentar iniciar uma câmera RTMP, ocorre erro 400 (Bad Request) no endpoint `POST /api/streams/:cameraId/start`. O erro afeta exclusivamente câmeras RTMP, enquanto câmeras RTSP continuam funcionando corretamente.

## Análise Detalhada

### Erro no Console
```
handleStartStream chamado com cameraId: 39e04e41-1b0c-4017-9dec-dae671af8edb
Endpoint construído: /streams/39e04e41-1b0c-4017-9dec-dae671af8edb/start
POST http://localhost:3002/api/streams/39e04e41-1b0c-4017-9dec-dae671af8edb/start 400 (Bad Request)
```

### Causa Raiz Identificada

O problema está no método `startZLMStream` dentro do `StreamingService.js`. O serviço está sempre tentando usar `camera.rtsp_url` para todas as câmeras, independentemente do tipo de stream configurado.

**Linha problemática (linha ~350):**
```javascript
// Configurar proxy RTSP
response = await axios.post(`${this.zlmApiUrl}/addStreamProxy`, {
  secret: this.zlmSecret,
  vhost: '__defaultVhost__',
  app: 'live',
  stream: streamId,
  url: camera.rtsp_url, // ← PROBLEMA: Sempre usa RTSP, mesmo para RTMP
  enable_rtsp: 1,
  enable_rtmp: 1,
  enable_hls: 1,
  enable_mp4: 0
});
```

### Estrutura do Modelo Camera

O modelo `Camera.js` possui os campos necessários:
- `rtsp_url`: para câmeras RTSP
- `rtmp_url`: para câmeras RTMP
- `stream_type`: define o tipo ('rtsp' ou 'rtmp')

### Fluxo de Execução Problemático

1. Usário clica para iniciar stream RTMP
2. Frontend chama `handleStartStream` com cameraId
3. Backend chama `startStream` no StreamingService
4. `startStream` chama `startZLMStream` (ou `startSRSStream`)
5. `startZLMStream` sempre usa `camera.rtsp_url` como URL do stream
6. Se a câmera RTMP não tiver `rtsp_url` preenchido, causa erro de validação

## Solução Proposta

### 1. Correção no StreamingService.js

Modificar o método `startZLMStream` para usar a URL correta baseada no tipo de stream:

```javascript
// Determinar a URL correta baseada no tipo de stream
let streamUrl;
if (camera.stream_type === 'rtmp' && camera.rtmp_url) {
  streamUrl = camera.rtmp_url;
} else if (camera.stream_type === 'rtsp' && camera.rtsp_url) {
  streamUrl = camera.rtsp_url;
} else {
  throw new AppError(`URL de stream não configurada para tipo ${camera.stream_type}`, 400);
}

// Usar a URL determinada
response = await axios.post(`${this.zlmApiUrl}/addStreamProxy`, {
  secret: this.zlmSecret,
  vhost: '__defaultVhost__',
  app: 'live',
  stream: streamId,
  url: streamUrl, // ← CORREÇÃO: Usa URL apropriada
  enable_rtsp: 1,
  enable_rtmp: 1,
  enable_hls: 1,
  enable_mp4: 0
});
```

### 2. Verificação de Segurança

Adicionar validação antes de tentar iniciar o stream:

```javascript
// Verificar se temos URL válida para o tipo de stream
if (camera.stream_type === 'rtmp' && !camera.rtmp_url) {
  throw new AppError('URL RTMP não configurada para esta câmera', 400);
}
if (camera.stream_type === 'rtsp' && !camera.rtsp_url) {
  throw new AppError('URL RTSP não configurada para esta câmera', 400);
}
```

### 3. Atualização do startSRSStream

Verificar se o método `startSRSStream` também precisa de ajustes similares.

## Testes Necessários

1. **Teste RTMP válido**: Câmera RTMP com URL RTMP configurada
2. **Teste RTSP válido**: Câmera RTSP com URL RTSP configurada (regressão)
3. **Teste RTMP sem URL**: Câmera RTMP sem URL RTMP configurada
4. **Teste RTSP sem URL**: Câmera RTSP sem URL RTSP configurada

## Impacto

- **Câmeras RTMP**: Funcionarão corretamente com suas URLs RTMP
- **Câmeras RTSP**: Continuarão funcionando sem alterações
- **Validação**: Melhor mensagem de erro para usuários quando URL não está configurada

## Status

- [x] Análise concluída ✅
- [x] Correção implementada ✅
- [ ] Testes realizados ⏳
- [x] Documentação atualizada ✅

## Correções Aplicadas

### 1. StreamingService.js - startZLMStream
**Arquivo:** `backend/src/services/StreamingService.js`
**Linhas:** ~350-370

**Mudança:** Adicionada lógica para determinar a URL correta baseada no tipo de stream:
- Se `stream_type === 'rtmp'` → usa `camera.rtmp_url`
- Se `stream_type === 'rtsp'` → usa `camera.rtsp_url`
- Se `stream_type === undefined` → usa 'rtsp' como padrão para manter compatibilidade
- Adicionada validação específica para cada tipo

### 2. StreamingService.js - startSRSStream
**Arquivo:** `backend/src/services/StreamingService.js`
**Linhas:** ~355-375

**Mudança:** Adicionada lógica para lidar com diferentes tipos de stream:
- Câmeras RTMP: Usa diretamente a URL RTMP
- Câmeras RTSP: Usa conversão RTSP→RTMP via relay
- Câmeras sem stream_type: Trata como RTSP por padrão
- Adicionada validação específica para cada tipo

### 3. Migração para Câmeras Existentes
**Problema:** Câmeras criadas antes da correção não possuem o campo `stream_type`
**Solução:** Script de migração para definir `stream_type='rtsp'` como padrão para câmeras existentes

## Como Executar os Testes

1. **Teste rápido com script:**
   ```bash
   cd tests
   node test_stream_start_fix.js
   ```

2. **Teste manual via API:**
   - Criar câmera RTMP com URL RTMP válida
   - POST /api/cameras com `{"stream_type": "rtmp", "rtmp_url": "rtmp://..."}`
   - POST /api/streams/{id}/start
   - Verificar resposta 200

3. **Teste regressão RTSP:**
   - Criar câmera RTSP com URL RTSP válida
   - POST /api/cameras com `{"stream_type": "rtsp", "rtsp_url": "rtsp://..."}`
   - POST /api/streams/{id}/start
   - Verificar resposta 200