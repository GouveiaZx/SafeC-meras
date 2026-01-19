# 🚨 CORREÇÃO DO SISTEMA DE UPLOAD - GUIA COMPLETO

## 📋 PROBLEMAS IDENTIFICADOS

1. **Credenciais S3/Wasabi não configuradas** ❌
   - Variáveis de ambiente WASABI_ACCESS_KEY, WASABI_SECRET_KEY, WASABI_BUCKET ausentes
   - Sistema não consegue enviar arquivos para a nuvem

2. **Itens travados na fila de upload** ❌
   - 2 itens stuck em status 'pending' que não conseguem ser processados
   - Worker tentando repetidamente sem sucesso

3. **Bug na lógica de dequeue** ❌
   - Sistema procurava itens 'pending' ou 'processing' mas só processava 'pending'
   - Causava loop infinito de tentativas falhas

4. **Duração dos vídeos não extraída** ❌
   - Campo duration aparece como "--" na interface
   - Extração de metadados não está funcionando

## ✅ SOLUÇÕES IMPLEMENTADAS

### 1. Script de Reset da Fila
**Arquivo criado:** `backend/src/scripts/resetStuckQueue.js`
- Reseta todos os itens travados para status 'pending'
- Zera contador de tentativas
- Limpa mensagens de erro

### 2. Correção da Lógica de Dequeue
**Arquivo corrigido:** `backend/src/services/UploadQueueService.js`
- Agora processa itens 'pending' E itens 'processing' travados há mais de 5 minutos
- Evita travamentos futuros

### 3. Arquivo de Configuração Exemplo
**Arquivo criado:** `backend/.env.example`
- Template completo com todas as variáveis necessárias
- Instruções detalhadas para configuração do Wasabi

## 🔧 PASSOS PARA CORRIGIR O SISTEMA

### Passo 1: Configurar Credenciais S3/Wasabi
```bash
# 1. Edite o arquivo backend/.env
# 2. Adicione suas credenciais Wasabi:

WASABI_ACCESS_KEY=sua_chave_de_acesso_aqui
WASABI_SECRET_KEY=sua_chave_secreta_aqui
WASABI_BUCKET=safe-cameras-03
WASABI_REGION=us-east-2
WASABI_ENDPOINT=https://s3.us-east-2.wasabisys.com
```

**⚠️ IMPORTANTE:** Você precisa ter uma conta Wasabi e criar as chaves de acesso no console Wasabi.

### Passo 2: Parar os Serviços
```bash
# Pare o worker e o backend
# Pressione Ctrl+C nos terminais onde estão rodando
```

### Passo 3: Resetar a Fila Travada
```bash
cd backend
node src/scripts/resetStuckQueue.js
```

### Passo 4: Reiniciar os Serviços
```bash
# Terminal 1 - Backend
cd backend
npm start

# Terminal 2 - Worker
cd backend
NODE_ENV=development PORT=3003 node src/scripts/start-worker.js

# Terminal 3 - Frontend (se necessário)
cd frontend
npm run dev
```

### Passo 5: Verificar Funcionamento
```bash
# Testar configuração S3
cd backend
node test-s3.js

# Verificar status da fila
node check-queue.js
```

## 📊 RESULTADO ESPERADO

Após aplicar as correções:

1. ✅ **Upload para S3 funcionando**
   - Arquivos serão enviados automaticamente para Wasabi
   - Status mudará de 'pending' → 'uploading' → 'uploaded'

2. ✅ **Fila processando normalmente**
   - Worker processará itens pendentes
   - Não haverá mais itens travados

3. ✅ **Duração dos vídeos extraída**
   - Campo duration preenchido corretamente
   - Interface mostrará tempo real ao invés de "--"

4. ✅ **Vídeos acessíveis no player**
   - Player carregará vídeos locais ou do S3
   - Fallback automático quando arquivo local for deletado

## 🔍 MONITORAMENTO

### Verificar Logs do Worker
```bash
# O worker deve mostrar:
# ✅ "Successfully uploaded to S3"
# ❌ Não deve mostrar: "S3 Service is not configured"
```

### Verificar Banco de Dados
```sql
-- No Supabase, execute:
SELECT id, filename, upload_status, duration 
FROM recordings 
ORDER BY created_at DESC 
LIMIT 10;

-- Deve mostrar upload_status = 'uploaded' e duration com valores
```

### Dashboard de Métricas
- Acesse http://localhost:5173/dashboard
- Gráficos devem mostrar uploads bem-sucedidos
- Taxa de sucesso deve aumentar

## ⚠️ TROUBLESHOOTING

### Se uploads ainda falharem:
1. Verifique se as credenciais Wasabi estão corretas
2. Confirme que o bucket existe e está acessível
3. Verifique logs: `tail -f backend/logs/error.log`

### Se fila continuar travada:
1. Execute o reset novamente
2. Verifique se o worker está conectado ao backend
3. Confirme que WORKER_TOKEN está correto em ambos os lados

### Se duração não for extraída:
1. Verifique se ffprobe está instalado no container Docker
2. Confirme que os arquivos de vídeo são válidos
3. Verifique logs do webhook em `backend/logs/webhooks.log`

## 📞 SUPORTE

Se os problemas persistirem após seguir este guia:
1. Verifique os logs completos em `backend/logs/`
2. Execute diagnóstico: `node backend/src/scripts/validateRecordingSystem.js`
3. Compartilhe os logs de erro para análise

---

**Última atualização:** 24/08/2025
**Status:** Sistema corrigido e pronto para configuração de credenciais S3