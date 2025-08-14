# Guia de Troubleshooting - Sistema de Gravações

## 1. Diagnóstico Rápido de Problemas

### 1.1 Erro 500 na Exclusão de Gravações

**Sintomas:**
- Erro 500 (Internal Server Error)
- Mensagem: "Gravação não encontrada ou acesso negado"
- Frontend mostra erro na console

**Verificações Imediatas:**

1. **Verificar logs do servidor:**
   ```bash
   # No diretório do projeto
   tail -f logs/app.log | grep "RecordingService"
   ```

2. **Verificar se o usuário tem acesso à câmera:**
   ```sql
   -- No Supabase SQL Editor
   SELECT u.id, u.email, u.role, u.camera_access, c.id as camera_id, c.name
   FROM users u
   LEFT JOIN cameras c ON c.id = ANY(u.camera_access)
   WHERE u.id = 'USER_ID_AQUI';
   ```

3. **Verificar se a gravação existe e sua câmera:**
   ```sql
   SELECT r.id, r.camera_id, r.status, c.name as camera_name, c.active
   FROM recordings r
   JOIN cameras c ON c.id = r.camera_id
   WHERE r.id = 'RECORDING_ID_AQUI';
   ```

### 1.2 Usuário Não Vê Gravações

**Verificações:**

1. **Verificar permissões do usuário:**
   ```sql
   SELECT id, email, role, camera_access, active
   FROM users
   WHERE id = 'USER_ID_AQUI';
   ```

2. **Verificar câmeras ativas:**
   ```sql
   SELECT id, name, active, status
   FROM cameras
   WHERE active = true;
   ```

3. **Verificar gravações existentes:**
   ```sql
   SELECT r.id, r.camera_id, r.created_at, c.name
   FROM recordings r
   JOIN cameras c ON c.id = r.camera_id
   WHERE c.active = true
   ORDER BY r.created_at DESC
   LIMIT 10;
   ```

## 2. Problemas Comuns e Soluções

### 2.1 "Gravação não encontrada ou acesso negado"

**Causa 1: Usuário sem permissão para a câmera**
```sql
-- Adicionar acesso à câmera para o usuário
UPDATE users 
SET camera_access = array_append(camera_access, 'CAMERA_ID_AQUI')
WHERE id = 'USER_ID_AQUI';
```

**Causa 2: Câmera inativa**
```sql
-- Ativar câmera
UPDATE cameras 
SET active = true 
WHERE id = 'CAMERA_ID_AQUI';
```

**Causa 3: Gravação de câmera inexistente**
```sql
-- Verificar integridade dos dados
SELECT r.id, r.camera_id
FROM recordings r
LEFT JOIN cameras c ON c.id = r.camera_id
WHERE c.id IS NULL;
```

### 2.2 Erro de Arquivo Não Encontrado

**Verificar estrutura de diretórios:**
```bash
# Verificar se o diretório existe
ls -la storage/www/record/

# Verificar permissões
ls -la storage/www/
```

**Corrigir permissões:**
```bash
# Dar permissões adequadas
chmod -R 755 storage/
chown -R node:node storage/
```

### 2.3 Problemas de Performance na Listagem

**Verificar índices no banco:**
```sql
-- Criar índices se não existirem
CREATE INDEX IF NOT EXISTS idx_recordings_camera_id ON recordings(camera_id);
CREATE INDEX IF NOT EXISTS idx_recordings_created_at ON recordings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recordings_status ON recordings(status);
CREATE INDEX IF NOT EXISTS idx_cameras_active ON cameras(active);
```

## 3. Comandos de Depuração

### 3.1 Verificar Estado do Sistema

```javascript
// No console do Node.js ou em um script de teste
const { Camera } = require('./src/models/Camera.js');
const RecordingService = require('./src/services/RecordingService.js');

// Verificar câmeras de um usuário
const cameras = await Camera.findByUserId('USER_ID');
console.log('Câmeras do usuário:', cameras.map(c => ({ id: c.id, name: c.name })));

// Verificar gravações
const recordings = await RecordingService.searchRecordings({ user_id: 'USER_ID', limit: 5 });
console.log('Gravações encontradas:', recordings.data.length);
```

### 3.2 Testar Exclusão Manualmente

```javascript
// Testar exclusão de uma gravação específica
try {
  const result = await RecordingService.deleteRecording('RECORDING_ID', 'USER_ID');
  console.log('Exclusão bem-sucedida:', result);
} catch (error) {
  console.error('Erro na exclusão:', error.message);
}
```

### 3.3 Verificar Logs em Tempo Real

```bash
# Monitorar logs do servidor
tail -f logs/app.log | grep -E "(RecordingService|deleteRecording|Camera.findByUserId)"

# Filtrar apenas erros
tail -f logs/app.log | grep -E "(ERROR|error)"
```

## 4. Scripts de Manutenção

### 4.1 Limpeza de Gravações Órfãs

```javascript
// cleanup_orphaned_recordings.js
import { supabase } from './src/config/database.js';
import fs from 'fs/promises';
import path from 'path';

async function cleanupOrphanedRecordings() {
  // Buscar gravações sem câmera correspondente
  const { data: orphaned } = await supabase
    .from('recordings')
    .select('id, file_path')
    .not('camera_id', 'in', 
      supabase.from('cameras').select('id')
    );
  
  console.log(`Encontradas ${orphaned.length} gravações órfãs`);
  
  for (const recording of orphaned) {
    // Deletar arquivo se existir
    if (recording.file_path) {
      try {
        await fs.unlink(path.join('storage/www/record', recording.file_path));
      } catch (e) {
        console.log(`Arquivo não encontrado: ${recording.file_path}`);
      }
    }
    
    // Deletar registro
    await supabase.from('recordings').delete().eq('id', recording.id);
  }
  
  console.log('Limpeza concluída');
}
```

### 4.2 Verificação de Integridade

```javascript
// integrity_check.js
async function checkIntegrity() {
  // Verificar gravações sem arquivo
  const { data: recordings } = await supabase
    .from('recordings')
    .select('id, file_path')
    .not('file_path', 'is', null);
  
  let missingFiles = 0;
  
  for (const recording of recordings) {
    const filePath = path.join('storage/www/record', recording.file_path);
    try {
      await fs.access(filePath);
    } catch {
      console.log(`Arquivo ausente: ${recording.id} - ${recording.file_path}`);
      missingFiles++;
    }
  }
  
  console.log(`Verificação concluída. ${missingFiles} arquivos ausentes.`);
}
```

## 5. Monitoramento Preventivo

### 5.1 Alertas de Espaço em Disco

```bash
#!/bin/bash
# disk_monitor.sh
USAGE=$(df /path/to/storage | awk 'NR==2 {print $5}' | sed 's/%//')
if [ $USAGE -gt 80 ]; then
  echo "ALERTA: Uso de disco em ${USAGE}%"
  # Executar limpeza automática
  node cleanup_old_recordings.js
fi
```

### 5.2 Verificação de Saúde do Sistema

```javascript
// health_check.js
async function healthCheck() {
  const checks = {
    database: false,
    storage: false,
    permissions: false
  };
  
  try {
    // Verificar conexão com banco
    const { data } = await supabase.from('cameras').select('count').limit(1);
    checks.database = true;
  } catch (e) {
    console.error('Erro no banco:', e.message);
  }
  
  try {
    // Verificar acesso ao storage
    await fs.access('storage/www/record');
    checks.storage = true;
  } catch (e) {
    console.error('Erro no storage:', e.message);
  }
  
  try {
    // Verificar permissões de escrita
    const testFile = 'storage/www/record/.test';
    await fs.writeFile(testFile, 'test');
    await fs.unlink(testFile);
    checks.permissions = true;
  } catch (e) {
    console.error('Erro de permissões:', e.message);
  }
  
  console.log('Status do sistema:', checks);
  return checks;
}
```

## 6. Checklist de Resolução de Problemas

### 6.1 Para Erro 500 na Exclusão

- [ ] Verificar logs do servidor
- [ ] Confirmar que o usuário existe e está ativo
- [ ] Verificar se o usuário tem acesso à câmera da gravação
- [ ] Confirmar que a câmera está ativa
- [ ] Verificar se a gravação existe no banco
- [ ] Testar exclusão manualmente via código
- [ ] Verificar permissões do diretório de storage
- [ ] Confirmar que não há gravação ativa sendo processada

### 6.2 Para Problemas de Acesso

- [ ] Verificar role do usuário (admin vs regular)
- [ ] Confirmar array camera_access do usuário
- [ ] Verificar se as câmeras estão ativas
- [ ] Testar função Camera.findByUserId() diretamente
- [ ] Verificar se há gravações para as câmeras permitidas
- [ ] Confirmar filtros aplicados na busca

### 6.3 Para Problemas de Performance

- [ ] Verificar índices do banco de dados
- [ ] Analisar queries lentas nos logs
- [ ] Verificar tamanho da tabela recordings
- [ ] Considerar paginação adequada
- [ ] Verificar se há limpeza automática configurada
- [ ] Monitorar uso de memória do servidor

## 7. Contatos e Recursos

### 7.1 Logs Importantes
- **Aplicação**: `logs/app.log`
- **Banco de Dados**: Supabase Dashboard > Logs
- **Sistema**: `/var/log/syslog` (Linux)

### 7.2 Comandos Úteis
```bash
# Reiniciar serviço
npm run dev

# Verificar processos
ps aux | grep node

# Monitorar recursos
top -p $(pgrep node)

# Verificar conectividade
telnet localhost 3002
```

---

**Última Atualização**: $(Get-Date -Format "yyyy-MM-dd")
**Versão**: 1.