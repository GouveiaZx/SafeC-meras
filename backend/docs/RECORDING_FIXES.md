# Correções no Sistema de Gravações

## Problema Resolvido: Erro 500 ao Excluir Gravações

### Descrição do Problema
Ao tentar excluir gravações através da interface, o sistema retornava erro 500 com a mensagem "Gravação não encontrada ou acesso negado".

### Causa Raiz
O problema estava relacionado a dois erros principais no arquivo `RecordingService.js`:

1. **Uso incorreto de `fs` sem promises**: O código estava usando `fs.unlink`, `fs.stat`, `fs.readdir` e `fs.access` diretamente, sem usar a versão `promises`, causando problemas de compatibilidade com código assíncrono.

2. **Chamada incorreta do SegmentationService**: O código estava tentando chamar `SegmentationService.stopRecording` como método estático, mas deveria instanciar a classe primeiro.

### Correções Implementadas

#### 1. Correção do uso de `fs`
- Substituído `fs.unlink` por `fsPromises.unlink`
- Substituído `fs.stat` por `fsPromises.stat`
- Substituído `fs.readdir` por `fsPromises.readdir`
- Substituído `fs.access` por `fsPromises.access`

#### 2. Correção da chamada do SegmentationService
Antes:
```javascript
await SegmentationService.stopRecording(streamKey, streamInfo);
```

Depois:
```javascript
const SegmentationServiceClass = (await import('./SegmentationService.js')).default;
const segmentationService = new SegmentationServiceClass();
await segmentationService.stopRecording(streamKey, streamInfo);
```

### Funções Corrigidas
- `deleteRecording()` - Função principal de exclusão
- `stopRecordingForCamera()` - Para parar gravação de câmera específica
- `stopRecordingById()` - Para parar gravação por ID
- `cleanupOldExports()` - Limpeza de exports antigos
- `cleanupOldRecordings()` - Limpeza de gravações antigas
- `fileExists()` - Verificação de existência de arquivo

### Validação
Após as correções:
- ✅ Exclusão de gravações funcionando corretamente
- ✅ Logs adequados sendo gerados
- ✅ Tratamento de erros apropriado
- ✅ Verificação de permissões funcionando

### Lições Aprendidas
1. **Sempre usar `fs.promises`** para operações de arquivo em código assíncrono
2. **Verificar se métodos são estáticos ou de instância** antes de chamar
3. **Adicionar logs de depuração temporários** para identificar problemas rapidamente
4. **Testar exclusões após correções** para garantir funcionamento

### Arquivos Modificados
- `backend/src/services/RecordingService.js`

### Data da Correção
12 de Agosto de 2025

---

## Notas Importantes

### Sistema de Permissões
O sistema de exclusão de gravações utiliza o modelo `Camera.findByUserId()` para verificar quais câmeras o usuário tem acesso, garantindo que apenas gravações de câmeras autorizadas possam ser excluídas.

### Tratamento de Arquivos
O sistema tenta deletar o arquivo físico da gravação, mas continua com a exclusão do registro no banco mesmo se o arquivo não existir (tratamento adequado de erro ENOENT).

### Gravações Ativas
Se uma gravação estiver ativa (status 'recording'), o sistema automaticamente para a gravação antes de excluí-la.