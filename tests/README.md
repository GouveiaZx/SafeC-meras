# Scripts de Teste

Esta pasta contém scripts de teste para depuração e validação do sistema NewCAM, especialmente relacionados ao cadastro de câmeras RTMP.

## Scripts de Teste RTMP

- **testCameraRegistration.js** - Script principal para testar o cadastro de câmeras RTMP
- **testFrontendPayload.js** - Teste de payload do frontend
- **test_frontend_exact.js** - Teste exato do frontend
- **test_frontend_token.js** - Teste de autenticação com token
- **test_rtmp_camera_with_auth.js** - Teste de câmera RTMP com autenticação
- **test_rtmp_debug.js** - Script de debug específico para RTMP
- **test_rtmp_fix.js** - Script de teste para validar correções RTMP

## Como Usar

Cada script pode ser executado individualmente para testar aspectos específicos do sistema:

```bash
node testCameraRegistration.js
node test_rtmp_debug.js
# etc...
```

## Documentação Relacionada

Para mais informações sobre os problemas e soluções relacionados ao RTMP, consulte a pasta `/docs/rtmp-debug/`.

## Nota

Estes scripts foram criados durante o processo de debug e correção dos problemas de cadastro de câmeras RTMP. Eles devem ser mantidos para futuras análises e tentativas de solução.