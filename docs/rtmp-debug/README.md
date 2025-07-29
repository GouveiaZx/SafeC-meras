# Documentação de Debug RTMP

Esta pasta contém documentos de análise, debug e soluções relacionados aos problemas de cadastro de câmeras RTMP no sistema NewCAM.

## Arquivos de Análise

- **ANALISE_ERRO_CADASTRO_CAMERA.md** - Análise detalhada dos erros 400 no cadastro de câmeras RTMP
- **INSTRUCOES_TESTE_DEBUG_RTMP.md** - Instruções para testar e debugar o cadastro de câmeras RTMP
- **INSTRUCOES_TESTE_DEBUG_RTMP_BACKEND.md** - Instruções específicas para debug no backend

## Arquivos de Soluções

- **SOLUCAO_ERRO_CADASTRO_CAMERA_RTMP.md** - Solução para problemas de autenticação no localStorage
- **SOLUCAO_ERRO_RTMP_FINAL.md** - Solução completa para erros de validação no backend
- **TESTE_CADASTRO_RTMP_CORRIGIDO.md** - Documentação da correção do erro 400 no campo stream_type

## Status dos Problemas

Os principais problemas identificados e suas soluções:

1. **Erro 400 - Validação stream_type**: Corrigido através da adição do tipo 'nonEmptyString'
2. **Problema de autenticação**: Corrigido através da padronização das chaves do localStorage
3. **Validação de IP restritiva**: Ajustada para permitir campos opcionais

## Scripts de Teste Relacionados

Os scripts de teste relacionados estão localizados na pasta `/tests/` na raiz do projeto.