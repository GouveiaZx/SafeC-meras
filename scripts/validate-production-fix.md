# Checklist de Validação - Correção Erro 500 - NewCAM Produção

## ✅ Verificações Pré-Execução

### Sistema Base
- [ ] Servidor tem Node.js 18+ instalado
- [ ] Docker e Docker Compose funcionando
- [ ] Portas 3002, 8000, 6379, 554, 1935 disponíveis
- [ ] Certificado SSL válido para `nuvem.safecameras.com.br`
- [ ] Nginx ou proxy reverso configurado

### Banco de Dados
- [ ] Conectividade com Supabase funcionando
- [ ] Credenciais `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` corretas
- [ ] Tabelas existem e têm as permissões corretas

## 🔧 Execução dos Scripts

### 1. Diagnóstico Inicial
```bash
cd /var/www/newcam  # ou diretório do projeto
chmod +x scripts/diagnose-production.sh
./scripts/diagnose-production.sh
```

**Resultado esperado:** 
- ✅ Todas as verificações em verde
- ❌ Problemas identificados claramente

### 2. Aplicação das Correções
```bash
chmod +x scripts/fix-production-500.sh
./scripts/fix-production-500.sh
```

**Resultado esperado:**
- ✅ Serviços iniciados sem erro
- ✅ Backend respondendo na porta 3002
- ✅ ZLMediaKit respondendo na porta 8000

## 📋 Verificações Pós-Correção

### Containers Docker
```bash
docker ps
```
**Verificar se estão rodando:**
- [ ] `newcam-zlmediakit` ou similar (porta 8000)
- [ ] `redis` (porta 6379)
- [ ] Outros containers necessários

### Processos Node.js
```bash
# Se usando PM2
pm2 list

# Se usando Node diretamente
ps aux | grep node
```
**Verificar:**
- [ ] Backend rodando (server.js)
- [ ] Worker rodando (start-worker.js)

### Conectividade de Rede
```bash
# Backend
curl -I http://localhost:3002/health

# ZLMediaKit
curl -I http://localhost:8000

# API do ZLMediaKit
curl "http://localhost:8000/index/api/getServerConfig?secret=9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK"
```
**Resultados esperados:**
- [ ] Backend: HTTP 200
- [ ] ZLMediaKit: HTTP 200 ou 302
- [ ] API ZLM: JSON com configurações

### Teste HTTPS Externa
```bash
curl -I https://nuvem.safecameras.com.br
```
**Resultado esperado:**
- [ ] HTTP 200 ou 304
- [ ] Certificado SSL válido

## 🎯 Teste de Funcionalidades

### 1. Interface Web
**Acesse:** `https://nuvem.safecameras.com.br`
- [ ] Página carrega sem erros 404/500
- [ ] Login funciona
- [ ] Dashboard aparece

### 2. Gestão de Câmeras
**Na interface, vá para Câmeras:**
- [ ] Lista de câmeras aparece
- [ ] Botão "Iniciar Stream" aparece

### 3. Iniciar Stream (TESTE CRÍTICO)
**Clique em "Iniciar Stream" de uma câmera:**
- [ ] **NÃO aparece erro 500** ❌➡️✅
- [ ] Stream inicia com sucesso
- [ ] Player de vídeo funciona
- [ ] HLS stream é reproduzido

### 4. Logs em Tempo Real
**Terminal 1:**
```bash
pm2 logs newcam-backend
# ou
tail -f backend/logs/error.log
```

**Terminal 2:**
```bash
docker logs -f newcam-zlmediakit
```

**Verificar durante teste de stream:**
- [ ] Sem erros críticos nos logs
- [ ] ZLMediaKit aceita conexões
- [ ] Webhooks funcionam

## 🔍 Troubleshooting

### Se ainda houver erro 500:

#### Verificar variáveis de ambiente:
```bash
cat backend/.env | grep -E "^(SUPABASE|ZLM|NODE_ENV|PORT)"
```

#### Verificar logs detalhados:
```bash
# Backend
tail -50 backend/logs/error.log

# PM2
pm2 logs --lines 50

# Docker
docker logs --tail 50 newcam-zlmediakit
```

#### Testar conectividade Supabase:
```bash
cd backend
node -e "
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('cameras').select('count').then(r => console.log('✅ Supabase OK:', r.data)).catch(e => console.log('❌ Supabase ERROR:', e.message));
"
```

### Erros Comuns e Soluções:

| Erro | Causa Provável | Solução |
|------|----------------|---------|
| HTTP 500 ao iniciar stream | ZLMediaKit não responde | `docker restart newcam-zlmediakit` |
| "CORS error" | CORS mal configurado | Verificar `corsConfig` em `backend/src/config/cors.js` |
| "Cannot connect to Supabase" | Credenciais inválidas | Verificar `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` |
| "Worker not connected" | Worker não autenticando | Verificar `WORKER_TOKEN` |
| Process crashed | Dependências faltando | `npm install` em backend/ e worker/ |

## 📊 Checklist Final

### ✅ Critérios de Sucesso
- [ ] **PRINCIPAL**: Botão "Iniciar Stream" funciona sem erro 500
- [ ] Interface web carrega completamente
- [ ] Login de usuário funciona
- [ ] Streaming de vídeo funciona
- [ ] Logs não mostram erros críticos
- [ ] Todos os containers Docker rodando
- [ ] Backend e Worker com status saudável

### 📞 Se Tudo Funcionar
1. Fazer backup da configuração:
   ```bash
   cp backend/.env backend/.env.production.working
   ```

2. Documentar a configuração funcionando

3. Configurar monitoramento:
   ```bash
   pm2 startup
   pm2 save
   ```

### 🆘 Se Ainda Houver Problemas
1. Coletar logs detalhados de todos os serviços
2. Verificar conectividade de rede interna
3. Validar certificados SSL
4. Testar em ambiente local para comparação
5. Considerar rollback temporário se crítico

---

**Data de execução:** ________________  
**Executado por:** ________________  
**Status final:** [ ] ✅ Sucesso [ ] ❌ Falhou [ ] ⚠️ Parcial  
**Observações:** _________________________________