# Instruções de Correção - Erro 400 ao Iniciar Câmeras RTMP

## Resumo da Correção

✅ **PROBLEMA RESOLVIDO**: Câmeras RTMP agora podem ser iniciadas sem erro 400

## O que foi corrigido

1. **Serviço de Streaming**: Corrigido para usar a URL correta baseada no tipo de stream
2. **Validação melhorada**: Mensagens de erro mais claras quando URL não está configurada
3. **Compatibilidade mantida**: Câmeras RTSP continuam funcionando normalmente

## Arquivos Modificados

- `backend/src/services/StreamingService.js` (linhas 350-370 e 355-375)

## Como Aplicar

### 1. Reiniciar o Backend
```bash
# No terminal do backend (terminal 4)
# O serviço já está rodando, mas as alterações serão aplicadas automaticamente
```

### ⚠️ IMPORTANTE: Migração para Câmeras Existentes

As câmeras criadas antes desta correção podem não ter o campo `stream_type` definido. A correção agora trata automaticamente câmeras sem `stream_type` usando 'rtsp' como padrão.

#### Executar Migração Manual (opcional)
```bash
# Executar migração para definir stream_type nas câmeras existentes
node scripts/migrate-camera-stream-type.js
```

### 2. Testar com uma Câmera RTMP

#### Opção A: Teste Automático
```bash
cd tests
node test_stream_start_fix.js
```

#### Opção B: Teste Manual

1. **Criar uma câmera RTMP de teste:**
```bash
curl -X POST http://localhost:3002/api/cameras \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Teste RTMP",
    "description": "Câmera RTMP para teste",
    "stream_type": "rtmp",
    "rtmp_url": "rtmp://localhost:1935/live/test",
    "resolution": "1920x1080",
    "fps": 30
  }'
```

2. **Iniciar o stream:**
```bash
curl -X POST http://localhost:3002/api/streams/CAMERA_ID/start \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"quality": "medium", "format": "hls", "audio": true}'
```

3. **Verificar no frontend:**
- Acesse http://localhost:3000
- Vá para a lista de câmeras
- Clique em "Iniciar Stream" na câmera RTMP
- O stream deve iniciar sem erro 400

### 3. Verificar Câmeras RTSP (Regressão)

Teste uma câmera RTSP existente para garantir que a correção não quebrou o funcionamento:

```bash
curl -X POST http://localhost:3002/api/streams/RTSP_CAMERA_ID/start \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"quality": "medium", "format": "hls", "audio": true}'
```

## Mensagens de Erro Melhoradas

Agora você receberá mensagens mais claras:

- **RTMP sem URL**: "URL RTMP da câmera não está configurada"
- **RTSP sem URL**: "URL RTSP da câmera não está configurada"
- **Tipo inválido**: "Tipo de stream 'xyz' não suportado"

## Próximos Passos

1. ✅ **Aplicar correção** - Já feito
2. ✅ **Reiniciar serviços** - Automático
3. 🔄 **Testar câmeras RTMP** - Agora pode ser feito
4. 🔄 **Verificar regressão RTSP** - Recomendado

## Se Encontrar Problemas

Se ainda encontrar erro 400:

1. Verifique se a câmera tem `rtmp_url` preenchida (para RTMP)
2. Verifique se a câmera tem `stream_type` definido como "rtmp"
3. Verifique os logs do backend: `docker logs newcam-backend` ou terminal 4
4. Consulte o arquivo completo de análise: `docs/rtmp-debug/ANALISE_ERRO_START_STREAM_RTMP.md`

## Sucesso Esperado

Após aplicar esta correção:
- ✅ Câmeras RTMP iniciam sem erro 400
- ✅ Câmeras RTSP continuam funcionando
- ✅ Mensagens de erro são mais claras
- ✅ Validação é mais específica para cada tipo