# DIAGNÓSTICO: Problema de Gravações no Servidor de Produção

**Data:** 26 de Agosto de 2025  
**Servidor:** nuvem.safecameras.com.br (66.94.104.241)  
**Problema:** Sistema de gravações não está funcionando no servidor de produção  

## 🚨 **SITUAÇÃO ATUAL**

### Problema Relatado pelo Usuário
- ✅ Camera ligada com gravação ativa
- ❌ **PROBLEMA**: Nenhuma gravação aparece na aba "Gravações" do frontend
- ✅ Sistema funciona perfeitamente no ambiente local (localhost)
- ❌ **FALHA**: Após deploy no servidor real, gravações param de funcionar

### Status dos Serviços (Verificado)
- ✅ **Backend**: Rodando na porta 3002 (PM2: newcam-backend)
- ✅ **Worker**: Rodando na porta 3003 (PM2: newcam-worker)  
- ✅ **ZLMediaKit**: Container Docker ativo na porta 8000
- ✅ **NGINX**: Proxy reverso funcionando
- ✅ **Supabase**: Conexão com banco de dados OK

## 🔍 **CAUSA RAIZ IDENTIFICADA**

### Webhook de Gravação com Conectividade Falhando
O ZLMediaKit está configurado para notificar o backend quando uma gravação MP4 é finalizada, mas a conexão está falhando:

**Erro nos Logs:**
```log
connection refused:3(connection refused):{
    "app" : "live",
    "hook_index" : 18,
    "mediaServerId" : "zlmediakit-prod",
    "stream" : "1dcb7a66-ffdc-4379-82fc-ba6d9c2764e0"
}
```

### Configuração Local vs Servidor

#### ✅ **LOCAL (Funcionando)**
```ini
# /docker/zlmediakit/config.ini
[hook]
enable=1
on_record_mp4=http://host.docker.internal:3002/api/hook/on_record_mp4
```

#### ❌ **SERVIDOR (Problema Original)**
```ini
# /var/www/newcam/docker/zlmediakit/config.ini
[hook]
enable=1
on_record_mp4=http://localhost:3002/api/hook/recording  # URL INCORRETA
```

#### 🔄 **SERVIDOR (Após Correção)**
```ini
# /var/www/newcam/docker/zlmediakit/config.ini  
[hook]
enable=1
on_record_mp4=http://host.docker.internal:3002/api/hook/on_record_mp4  # CORRIGIDO
```

### ⚠️ **PROBLEMA PERSISTENTE**
Apesar da correção no arquivo de configuração, o ZLMediaKit **ainda está tentando conectar em localhost:3002** em vez de usar `host.docker.internal:3002`.

## 🛠️ **PRÓXIMOS PASSOS OBRIGATÓRIOS**

### 1. **Recriar Container ZLMediaKit (CRÍTICO)**
O container pode estar usando configuração em cache. Necessário recriar:

```bash
ssh root@66.94.104.241

# Parar e remover container atual
docker stop newcam-zlmediakit
docker rm newcam-zlmediakit

# Recriar container com nova configuração
cd /var/www/newcam
docker-compose up -d zlmediakit

# Verificar logs do novo container
docker logs newcam-zlmediakit -f
```

### 2. **Verificar se Configuração Foi Aplicada**
```bash
ssh root@66.94.104.241

# Confirmar que config.ini está correto dentro do container
docker exec newcam-zlmediakit cat /opt/media/conf/config.ini | grep -A 5 "\[hook\]"

# Deve mostrar:
# [hook]
# enable=1
# on_record_mp4=http://host.docker.internal:3002/api/hook/on_record_mp4
```

### 3. **Monitorar Logs em Tempo Real**
```bash
ssh root@66.94.104.241

# Terminal 1: Logs do backend
pm2 logs newcam-backend

# Terminal 2: Logs do ZLMediaKit  
docker logs newcam-zlmediakit -f

# Procurar por:
# - Tentativas de webhook para host.docker.internal:3002 (correto)
# - Conexões bem-sucedidas ao backend
# - Notificações de "on_record_mp4"
```

### 4. **Testar Webhook Manualmente**
```bash
ssh root@66.94.104.241

# Testar conectividade do container para o host
docker exec newcam-zlmediakit curl -v http://host.docker.internal:3002/health

# Deve retornar: HTTP 200 "healthy"
```

### 5. **Iniciar Gravação e Monitorar**
```bash
ssh root@66.94.104.241

# Ligar uma camera com gravação
# Monitorar se webhook é chamado
# Verificar se arquivo MP4 é criado em /var/www/newcam/storage/www/record/live/
```

## 📋 **ARQUIVOS IMPORTANTES**

### Configuração Principal
- **Config ZLMediaKit**: `/var/www/newcam/docker/zlmediakit/config.ini`
- **Docker Compose**: `/var/www/newcam/docker-compose.yml`
- **NGINX Config**: `/var/www/newcam/docker/nginx/nginx.conf`

### Backend Routes (Verificadas)
- **Webhook Handler**: `/var/www/newcam/backend/src/routes/hooks.js`
- **Recordings API**: `/var/www/newcam/backend/src/routes/recordings.js`

### Logs de Monitoramento
```bash
# Backend logs
pm2 logs newcam-backend

# ZLMediaKit logs
docker logs newcam-zlmediakit -f

# NGINX logs
docker logs newcam-nginx -f
```

## ✅ **VALIDAÇÃO DE SUCESSO**

Após aplicar as correções, confirmar:

1. **Webhook Conectividade**: Logs do ZLMediaKit mostram conexão bem-sucedida para `host.docker.internal:3002`
2. **Backend Recebe Webhooks**: Logs do backend mostram recebimento de `POST /api/hook/on_record_mp4`
3. **Arquivos MP4 Criados**: Arquivos aparecem em `/var/www/newcam/storage/www/record/live/{camera_id}/`
4. **Database Updated**: Registros inseridos na tabela `recordings` do Supabase
5. **Frontend Mostra Gravações**: Interface web exibe as gravações na aba correspondente

## 🚨 **COMANDOS SSH DE ACESSO**

```bash
# Conectar ao servidor
ssh root@66.94.104.241

# Navegar para projeto
cd /var/www/newcam

# Status dos serviços
pm2 status
docker ps

# Logs em tempo real
pm2 logs newcam-backend
docker logs newcam-zlmediakit -f
```

## 📞 **INFORMAÇÕES DE CONTEXTO**

- **Servidor**: 66.94.104.241 (nuvem.safecameras.com.br)
- **Usuário SSH**: root  
- **Projeto Path**: /var/www/newcam
- **Backend Port**: 3002 (PM2: newcam-backend)
- **Worker Port**: 3003 (PM2: newcam-worker)
- **ZLMediaKit Port**: 8000 (Docker container)

### Credenciais de Teste
- **Frontend**: http://nuvem.safecameras.com.br
- **Admin**: gouveiarx@gmail.com / Teste123

---
**PRÓXIMA SESSÃO**: Executar os passos 1-5 em sequência e validar que o sistema de gravações está funcionando corretamente no servidor de produção.