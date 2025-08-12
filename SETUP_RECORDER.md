# 🎬 Configuração Completa do Sistema de Gravação NewCAM

## ✅ Status Atual: Sistema Pronto para Gravações de 30 Minutos

### 📋 Verificação Completa Realizada

#### 🔧 1. Limpeza e Preparação do Sistema
- ✅ **Todas gravações problemáticas removidas** do banco de dados
- ✅ **Diretório de gravações verificado** e criado automaticamente
- ✅ **Estrutura de arquivos corrigida** para sempre usar `.mp4` no final

#### 📊 2. Banco de Dados Atualizado
- ✅ **Caminhos corrigidos** para incluir extensão `.mp4`
- ✅ **Metadados sincronizados** entre arquivos físicos e banco
- ✅ **Gravação de teste criada** e validada com sucesso

#### 🔄 3. Webhook Configurado
- ✅ **Handler on_record_mp4** implementado e funcional
- ✅ **Validação de dados** robusta com tratamento de erros
- ✅ **Prevenção de duplicatas** via cache e verificação

#### ⏱️ 4. Corte de 30 Minutos Garantido
- ✅ **Configuração ZLMediaKit** para `segDur=1800` (30 minutos)
- ✅ **Webhook automático** para processar cada segmento
- ✅ **Sincronização imediata** com Supabase

#### 🎯 5. Player Funcional
- ✅ **Streaming via Range requests** implementado
- ✅ **Download de arquivos** disponível
- ✅ **Autenticação via JWT** configurada

## 🚀 Como Garantir Gravações de 30 Minutos

### 1. Iniciar o Sistema
```bash
# Iniciar servidor NewCAM
npm run dev

# Verificar status (em outro terminal)
node backend/validate_complete_flow.js
```

### 2. Verificar Configuração ZLMediaKit
```bash
# Executar verificador de configuração
node backend/check_zlm_config.js
```

### 3. Monitorar Gravações em Tempo Real
```bash
# Monitor contínuo de 30 minutos
node backend/monitor_30min_recordings.js 1

# Verificar gravações recentes
node backend/monitor_30min_recordings.js 3
```

### 4. Testar Fluxo Completo
```bash
# Teste completo do fluxo
node backend/validate_complete_flow.js
```

## 📁 Estrutura de Arquivos Correta

```
NewCAM/
├── recordings/                 # Arquivos MP4 gerados
├── backend/src/routes/hooks.js # Webhook handler
├── backend/src/services/RecordingService.js # Serviço de gravação
└── zlmediakit/ZLMediaKit/conf/config.ini # Configuração ZLM
```

## ⚙️ Configuração ZLMediaKit (config.ini)

```ini
[record]
enable=1
fileFormat=mp4
segDur=1800  # 30 minutos
filePath=./www/record
autoRecord=1

[hook]
on_record_mp4=http://localhost:3002/api/webhooks/on_record_mp4
on_publish=http://localhost:3002/api/webhooks/on_publish
enable=1
```

## 🔍 Verificação de Funcionamento

### Indicadores de Sucesso:
1. **Arquivos criados** a cada 30 minutos exatamente
2. **Webhook recebido** para cada segmento
3. **Registro no banco** imediatamente após corte
4. **Player acessível** via interface web
5. **Download disponível** para todos os arquivos

### URLs de Teste:
- **Webhook**: `http://localhost:3002/api/webhooks/on_record_mp4`
- **Player**: `http://localhost:3002/recordings`
- **API**: `http://localhost:3002/api/recordings/[id]/stream`

## 🛠️ Scripts de Diagnóstico

### 1. Diagnóstico Rápido
```bash
# Verificar se tudo está funcionando
node backend/validate_complete_flow.js
```

### 2. Criar Gravação de Teste
```bash
# Simular gravação de 30 minutos
node backend/monitor_30min_recordings.js 2
```

### 3. Verificar Configuração
```bash
# Verificar configuração ZLMediaKit
node backend/check_zlm_config.js
```

## 📊 Monitoramento

### Logs Importantes:
- **Webhook logs**: Verificar em `backend/logs/zlm-hooks.log`
- **Erros de gravação**: Verificar em `backend/logs/recording-service.log`
- **Status das câmeras**: Atualizado em tempo real

### Alertas de Problemas:
- **Duração incorreta**: Verificar configuração `segDur`
- **Webhook não recebido**: Verificar URL no ZLMediaKit
- **Arquivos não encontrados**: Verificar permissões de diretório

## ✅ Checklist Final

- [ ] Servidor NewCAM rodando (`npm run dev`)
- [ ] ZLMediaKit rodando (porta 8080)
- [ ] Configuração `segDur=1800` aplicada
- [ ] Webhook URL configurada corretamente
- [ ] Câmeras ativas com gravação habilitada
- [ ] Diretório de gravações acessível
- [ ] Teste de gravação realizado com sucesso

## 🚨 Solução de Problemas

### Se as gravações não aparecerem:
1. Verificar logs do ZLMediaKit
2. Confirmar webhook está configurado
3. Testar manualmente: `node backend/validate_complete_flow.js`
4. Verificar câmeras têm `recording_enabled=true`

### Se duração estiver errada:
1. Verificar `segDur=1800` no config.ini
2. Reiniciar ZLMediaKit após mudanças
3. Limpar cache: `processedRecordings.clear()`

---

**✅ Sistema configurado e validado para gravações automáticas de 30 minutos!**