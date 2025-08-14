# Correções do Sistema de Gravações - NewCAM

## 1. Resumo Executivo

Este documento detalha as correções implementadas no sistema de gravações do NewCAM para resolver problemas de acesso, exclusão e padronização de permissões. As correções garantem que usuários vejam apenas gravações de câmeras autorizadas e possam excluí-las adequadamente.

## 2. Problemas Identificados

### 2.1 Erro 500 na Exclusão de Gravações
- **Sintoma**: Erro 500 (Internal Server Error) ao tentar excluir gravações
- **Mensagem**: "Gravação não encontrada ou acesso negado"
- **Causa Raiz**: Problemas técnicos na função `deleteRecording`

### 2.2 Inconsistência no Acesso às Gravações
- **Problema**: Diferentes funções usavam métodos distintos para validar acesso
- **Impacto**: Usuários podiam visualizar gravações mas não excluí-las

### 2.3 Falta de Padronização
- **Problema**: Código duplicado e lógicas diferentes para validação de acesso
- **Impacto**: Dificuldade de manutenção e possíveis falhas de segurança

## 3. Correções Implementadas

### 3.1 Padronização do Acesso às Gravações

#### Função `Camera.findByUserId(userId)`
Todas as funções de gravação agora usam esta função para validar acesso:

```javascript
// Validar acesso usando Camera.findByUserId
const { Camera } = await import('../models/Camera.js');
const cameras = await Camera.findByUserId(userId);
const allowedCameraIds = cameras.map(camera => camera.id);

if (allowedCameraIds.length === 0) {
  logger.warn(`Usuário ${userId} não tem acesso a nenhuma câmera`);
  throw new Error('Gravação não encontrada ou acesso negado');
}
```

#### Funções Padronizadas
1. **`searchRecordings()`** - Busca de gravações com filtros
2. **`getRecordingById()`** - Obtenção de gravação específica
3. **`deleteRecording()`** - Exclusão de gravação específica
4. **`stopRecordingById()`** - Parada de gravação por ID

### 3.2 Correções Técnicas na Exclusão

#### Problema: Uso Incorreto do fs
**Antes:**
```javascript
const stats = await fs.stat(filePath); // ❌ Incorreto
await fs.unlink(filePath); // ❌ Incorreto
```

**Depois:**
```javascript
const stats = await fsPromises.stat(filePath); // ✅ Correto
await fsPromises.unlink(filePath); // ✅ Correto
```

#### Problema: Instanciação Incorreta do SegmentationService
**Antes:**
```javascript
const SegmentationService = (await import('./SegmentationService.js')).default;
await SegmentationService.stopRecording(streamKey, streamInfo); // ❌ Incorreto
```

**Depois:**
```javascript
const SegmentationServiceClass = (await import('./SegmentationService.js')).default;
const segmentationService = new SegmentationServiceClass();
await segmentationService.stopRecording(streamKey, streamInfo); // ✅ Correto
```

### 3.3 Implementação de Logs de Depuração

Adicionados logs detalhados para facilitar o diagnóstico:

```javascript
logger.info(`[RecordingService] Deletando gravação: ${recordingId}`);
logger.warn(`[RecordingService] Usuário ${userId} não tem acesso a nenhuma câmera`);
logger.info(`[RecordingService] Arquivo deletado: ${filePath}`);
logger.error(`[RecordingService] Erro ao deletar gravação ${recordingId}:`, error);
```

## 4. Validação de Permissões

### 4.1 Lógica de Acesso

```javascript
// Buscar usuário para verificar permissões
const user = await import('./User.js').then(m => m.User.findById(userId));

if (!user) {
  return [];
}

let query = supabaseAdmin
  .from(TABLES.CAMERAS)
  .select('*')
  .eq('active', true);

// Se não for admin, filtrar por acesso do usuário
if (user.role !== 'admin') {
  if (!user.camera_access || user.camera_access.length === 0) {
    return [];
  }
  query = query.in('id', user.camera_access);
}
```

### 4.2 Privilégios de Administrador
- **Administradores**: Acesso total a todas as câmeras ativas
- **Usuários Regulares**: Acesso apenas às câmeras em `user.camera_access`
- **Usuários sem Acesso**: Array vazio, nenhuma gravação visível

## 5. Fluxo de Exclusão Corrigido

### 5.1 Etapas da Exclusão

1. **Validação de Acesso**
   - Buscar câmeras permitidas para o usuário
   - Verificar se a gravação pertence a uma câmera autorizada

2. **Busca da Gravação**
   ```javascript
   const { data: recording, error: findError } = await supabase
     .from('recordings')
     .select('*, cameras!inner(*)')
     .eq('id', recordingId)
     .in('camera_id', allowedCameraIds)
     .single();
   ```

3. **Exclusão do Arquivo Físico**
   - Verificar se o arquivo existe
   - Calcular espaço liberado
   - Deletar arquivo usando `fsPromises.unlink()`

4. **Parada de Gravação Ativa**
   - Se status = 'recording', parar a gravação primeiro
   - Usar instância correta do SegmentationService

5. **Exclusão do Registro**
   - Remover registro do banco de dados
   - Retornar informações sobre espaço liberado

## 6. Correção da Rota de Busca

### 6.1 Problema na Passagem de Parâmetros
**Antes:**
```javascript
const recordings = await RecordingService.searchRecordings(filters, userId); // ❌ Incorreto
```

**Depois:**
```javascript
const recordings = await RecordingService.searchRecordings({ ...filters, user_id: userId }); // ✅ Correto
```

### 6.2 Verificação de Acesso na Rota
```javascript
// Verificar acesso à câmera específica se fornecida
if (camera_id) {
  const { Camera } = await import('../models/Camera.js');
  const userCameras = await Camera.findByUserId(userId);
  const hasAccess = userCameras.some(camera => camera.id === camera_id);
  
  if (!hasAccess) {
    return res.status(403).json({
      success: false,
      message: 'Acesso negado à câmera especificada'
    });
  }
}
```

## 7. Tratamento de Erros

### 7.1 Hierarquia de Erros
1. **Erro de Acesso**: "Gravação não encontrada ou acesso negado"
2. **Erro de Arquivo**: Log de warning, continua execução
3. **Erro de Parada**: Log de warning, continua execução
4. **Erro de Banco**: Propaga erro, falha a operação

### 7.2 Logs Estruturados
```javascript
try {
  // Operação
  logger.info(`[RecordingService] Operação realizada com sucesso`);
} catch (error) {
  logger.error(`[RecordingService] Erro na operação:`, error);
  throw error;
}
```

## 8. Testes e Validação

### 8.1 Cenários de Teste
1. **Usuário Admin**: Deve ver e excluir todas as gravações
2. **Usuário Regular**: Deve ver apenas gravações de câmeras autorizadas
3. **Usuário sem Acesso**: Não deve ver nenhuma gravação
4. **Gravação Ativa**: Deve parar antes de excluir
5. **Arquivo Inexistente**: Deve continuar e excluir registro

### 8.2 Verificações Pós-Correção
- ✅ Exclusão de gravações funcionando corretamente
- ✅ Logs adequados sendo gerados
- ✅ Tratamento de erros apropriado
- ✅ Verificação de permissões funcionando
- ✅ Padronização implementada em todas as funções

## 9. Manutenção Futura

### 9.1 Pontos de Atenção
1. **Sempre usar `fsPromises`** para operações de arquivo em código assíncrono
2. **Instanciar serviços corretamente** antes de usar métodos
3. **Manter logs estruturados** para facilitar depuração
4. **Usar `Camera.findByUserId()`** para todas as validações de acesso

### 9.2 Padrões Estabelecidos
- Validação de acesso no início de cada função
- Logs informativos em operações importantes
- Tratamento gracioso de erros de arquivo
- Retorno consistente de informações sobre espaço liberado

## 10. Arquivos Modificados

### 10.1 Backend
- `backend/src/services/RecordingService.js`
  - Função `deleteRecording()` - Correções técnicas e logs
  - Função `searchRecordings()` - Padronização de acesso
  - Função `getRecordingById()` - Padronização de acesso
  - Função `stopRecordingById()` - Padronização de acesso

- `backend/src/routes/recordings.js`
  - Rota `GET /api/recordings` - Correção na passagem de parâmetros
  - Rota `DELETE /api/recordings/:id` - Mantida estrutura existente

- `backend/src/models/Camera.js`
  - Função `findByUserId()` - Validação robusta de permissões

### 10.2 Documentação
- `backend/docs/RECORDING_FIXES.md` - Documentação das correções
- Este documento - Documentação completa do sistema

## 11. Conclusão

As correções implementadas resolvem completamente os problemas de acesso e exclusão de gravações, estabelecendo um padrão consistente e seguro para o sistema. A padronização usando `Camera.findByUserId()` garante que todas as operações respeitem as permissões do usuário, enquanto as correções técnicas eliminam os erros 500 na exclusão.

O sistema agora oferece:
- **Segurança**: Usuários só acessam gravações autorizadas
- **Consistência**: Mesma lógica de validação em todas as funções
- **Confiabilidade**: Tratamento robusto de erros e logs detalhados
- **Manutenibilidade**: Código padronizado e bem documentado

---

**Data da Documentação**: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
**Versão**: 1.0
**Autor**: Sistema de Documentação Automática