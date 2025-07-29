# Plano de Melhorias - Sistema de Câmeras

## Problemas Identificados

### 1. Seletor de Qualidade Não Funcional
- **Problema**: O seletor de qualidade está apenas visual, não altera realmente a qualidade do stream
- **Impacto**: Usuários não conseguem ajustar a qualidade conforme necessário
- **Status**: 🔴 Crítico

### 2. Status da Câmera Fica Offline Durante Stream
- **Problema**: Câmeras ficam marcadas como offline mesmo quando estão transmitindo
- **Impacto**: Interface confusa, não reflete o estado real da câmera
- **Status**: 🔴 Crítico

### 3. Auto-preenchimento do IP no Formulário RTMP
- **Problema**: Campo IP não é preenchido automaticamente ao inserir URL RTMP
- **Impacto**: UX ruim, usuário precisa preencher manualmente
- **Status**: 🟡 Melhoria

## Plano de Execução

### Etapa 1: Implementar Funcionalidade Real do Seletor de Qualidade

#### 1.1 Análise do Sistema Atual
- [ ] Verificar como o streaming é gerenciado no backend
- [ ] Identificar se ZLMediaKit/SRS suporta múltiplas qualidades
- [ ] Analisar estrutura de URLs de stream

#### 1.2 Backend - Suporte a Múltiplas Qualidades
- [ ] Modificar `StreamingService.js` para gerar streams em diferentes resoluções
- [ ] Atualizar rotas de streaming para aceitar parâmetro de qualidade
- [ ] Implementar transcoding automático (se necessário)

#### 1.3 Frontend - Integração Real
- [ ] Modificar `VideoPlayer.tsx` para trocar URL do stream baseado na qualidade
- [ ] Atualizar `Cameras.tsx` para gerenciar URLs de diferentes qualidades
- [ ] Implementar lógica de fallback para qualidades indisponíveis

### Etapa 2: Corrigir Status da Câmera Durante Streaming

#### 2.1 Análise do Problema
- [ ] Investigar `Camera.js` e lógica de atualização de status
- [ ] Verificar `StreamingService.js` e como notifica status
- [ ] Analisar `socketController.js` para atualizações em tempo real

#### 2.2 Implementação da Correção
- [ ] Modificar lógica para manter status "online" durante streaming ativo
- [ ] Implementar verificação periódica de stream ativo
- [ ] Atualizar frontend para refletir status correto em tempo real

#### 2.3 Testes
- [ ] Testar com câmeras RTSP
- [ ] Testar com câmeras RTMP
- [ ] Verificar comportamento quando stream é interrompido

### Etapa 3: Auto-preenchimento do IP no Formulário RTMP

#### 3.1 Implementação
- [ ] Modificar `Cameras.tsx` para extrair IP da URL RTMP
- [ ] Adicionar função de parsing de URL
- [ ] Implementar preenchimento automático do campo IP

#### 3.2 Validação
- [ ] Adicionar validação para URLs RTMP válidas
- [ ] Tratar casos de URLs malformadas
- [ ] Manter compatibilidade com RTSP

## Ordem de Execução

1. **Etapa 2** (Status da Câmera) - Mais crítico para UX
2. **Etapa 1** (Seletor de Qualidade) - Funcionalidade principal
3. **Etapa 3** (Auto-preenchimento) - Melhoria de UX

## Considerações Técnicas

### Escalabilidade
- Múltiplas qualidades podem aumentar uso de CPU/banda
- Considerar cache de streams transcodificados
- Implementar limpeza automática de streams inativos

### Manutenibilidade
- Separar lógica de qualidade em serviço dedicado
- Documentar configurações de transcoding
- Adicionar logs detalhados para debugging

## Riscos e Mitigações

### Alto Risco
- **Transcoding em tempo real**: Pode sobrecarregar servidor
  - *Mitigação*: Implementar qualidades pré-definidas, usar hardware acceleration

### Médio Risco
- **Mudança na lógica de status**: Pode afetar outras funcionalidades
  - *Mitigação*: Testes extensivos, rollback plan

### Baixo Risco
- **Auto-preenchimento**: Mudança isolada no frontend
  - *Mitigação*: Validação robusta de entrada

## Próximos Passos

1. Aprovação do plano
2. Início pela Etapa 2 (Status da Câmera)
3. Implementação incremental com testes
4. Deploy e monitoramento

---

**Estimativa Total**: 2-3 dias de desenvolvimento
**Prioridade**: Alta
**Complexidade**: Média-Alta