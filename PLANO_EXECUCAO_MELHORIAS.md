# Plano de Execução - Melhorias do Sistema de Câmeras

## Problemas Identificados

### 1. Seletor de Qualidade Não Funcional
- **Problema**: O seletor de qualidade apenas atualiza o estado local, não faz chamada à API
- **Localização**: `frontend/src/pages/Cameras.tsx` - função `handleQualityChange`
- **Impacto**: Usuário seleciona qualidade mas stream não muda

### 2. Status da Câmera Fica Offline Durante Stream
- **Problema**: Quando stream é iniciado, câmera não atualiza status para 'online'
- **Localização**: `backend/src/services/StreamingService.js` - função `startStream`
- **Impacto**: Interface mostra câmera offline mesmo com stream ativo

### 3. Campo IP Não Preenche Automaticamente
- **Problema**: Ao inserir URL RTMP, campo IP não extrai hostname automaticamente
- **Localização**: `frontend/src/pages/Cameras.tsx` - modal de adicionar câmera
- **Impacto**: Usuário precisa copiar/colar IP manualmente

## Plano de Execução

### Etapa 1: Auto-preenchimento do Campo IP
**Prioridade**: Alta (implementação simples, feedback imediato)

#### 1.1 Implementar Função de Extração de Hostname
```javascript
const extractHostnameFromUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    // Fallback com regex para URLs RTMP
    const match = url.match(/rtmp:\/\/([^:\/]+)/);
    return match ? match[1] : '';
  }
};
```

#### 1.2 Adicionar useEffect para Monitorar RTMP URL
- Monitorar mudanças no campo `rtmp_url`
- Extrair hostname automaticamente
- Preencher campo `ip_address`
- Permitir edição manual pelo usuário

#### 1.3 Arquivos a Modificar
- `frontend/src/pages/Cameras.tsx`

### Etapa 2: Corrigir Seletor de Qualidade
**Prioridade**: Alta (funcionalidade visível ao usuário)

#### 2.1 Criar Mapeamento de Qualidades
```javascript
const qualityMapping = {
  '1080p': 'high',
  '720p': 'medium', 
  '480p': 'low'
};
```

#### 2.2 Implementar Chamada à API
- Modificar `handleQualityChange` para fazer PUT `/api/streams/:stream_id/quality`
- Adicionar loading state durante mudança
- Tratar erros e mostrar feedback
- Atualizar estado local apenas após sucesso da API

#### 2.3 Melhorar UX
- Mostrar indicador de loading no seletor
- Desabilitar seletor durante mudança
- Toast de sucesso/erro

#### 2.4 Arquivos a Modificar
- `frontend/src/pages/Cameras.tsx`
- `frontend/src/lib/api.ts` (adicionar endpoint se necessário)

### Etapa 3: Corrigir Status da Câmera
**Prioridade**: Média (mudanças no backend, mais complexa)

#### 3.1 Modificar StreamingService.startStream()
```javascript
// Após sucesso na criação do stream
if (streamConfig) {
  await camera.updateStatus('online');
  await camera.updateStreamingStatus(true);
}
```

#### 3.2 Modificar StreamingService.stopStream()
```javascript
// Após parar o stream
if (stopped) {
  await camera.updateStreamingStatus(false);
  // Verificar se deve ficar offline ou manter online
  const shouldStayOnline = await camera.checkConnectivity();
  await camera.updateStatus(shouldStayOnline ? 'online' : 'offline');
}
```

#### 3.3 Implementar Verificação Periódica
- Adicionar job/cron para verificar status dos streams ativos
- Manter câmera online enquanto stream estiver ativo
- Detectar quando stream para e atualizar status

#### 3.4 Arquivos a Modificar
- `backend/src/services/StreamingService.js`
- `backend/src/models/Camera.js` (se necessário)
- `backend/src/routes/streams.js`

## Ordem de Implementação

1. **Etapa 1** - Auto-preenchimento IP (30 min)
2. **Etapa 2** - Seletor de qualidade funcional (1 hora)
3. **Etapa 3** - Status da câmera (1.5 horas)

## Riscos e Mitigações

### Riscos
- Mudanças no backend podem afetar streams ativos
- Chamadas à API de qualidade podem falhar
- Status da câmera pode ficar inconsistente

### Mitigações
- Testar mudanças em ambiente de desenvolvimento
- Implementar fallbacks para chamadas de API
- Adicionar logs detalhados para debug
- Manter compatibilidade com código existente

## Testes Necessários

### Etapa 1
- [ ] URL RTMP válida extrai hostname corretamente
- [ ] URL inválida não quebra o formulário
- [ ] Campo IP pode ser editado manualmente

### Etapa 2
- [ ] Mudança de qualidade faz chamada à API
- [ ] Loading state funciona corretamente
- [ ] Erros são tratados adequadamente
- [ ] Stream realmente muda de qualidade

### Etapa 3
- [ ] Câmera fica online após iniciar stream
- [ ] Status é atualizado corretamente ao parar stream
- [ ] Verificação periódica funciona
- [ ] Não há vazamentos de memória

## Critérios de Sucesso

- ✅ Campo IP preenche automaticamente ao inserir URL RTMP
- ✅ Seletor de qualidade realmente muda a qualidade do stream
- ✅ Câmera permanece online enquanto stream estiver ativo
- ✅ Interface reflete status real da câmera
- ✅ Todas as funcionalidades existentes continuam funcionando

## Próximos Passos

1. Implementar Etapa 1 (auto-preenchimento IP)
2. Testar e validar funcionamento
3. Implementar Etapa 2 (seletor qualidade)
4. Testar e validar funcionamento
5. Implementar Etapa 3 (status câmera)
6. Testes finais e validação completa
7. Deploy e monitoramento

---

**Data de Criação**: $(date)
**Estimativa Total**: 3 horas
**Status**: Planejamento Concluído ✅