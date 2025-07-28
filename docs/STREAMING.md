# Configuração de Streaming - NewCAM

Este documento descreve a configuração e uso dos servidores de streaming no sistema NewCAM.

## 🎯 Visão Geral

O NewCAM suporta múltiplos servidores de streaming para máxima compatibilidade e performance:

- **SRS (Simple Realtime Server)** - Porta 8081 (Principal)
- **ZLMediaKit** - Porta 8080 (Alternativo)
- **SimpleStreamingServer** - Porta 8081 (Simulação/Desenvolvimento)

## 🔧 Configuração Atual

### Portas de Desenvolvimento Local

| Serviço | Porta | URL | Status | Descrição |
|---------|-------|-----|--------|----------|
| **Frontend** | `5174` | http://localhost:5174 | ✅ | Interface React + Vite |
| **Backend** | `3001` | http://localhost:3001 | ✅ | API REST + WebSocket |
| **SRS** | `8081` | http://localhost:8081 | ✅ | Servidor de streaming SRS |
| **ZLMediaKit** | `8080` | http://localhost:8080 | ✅ | Servidor de streaming ZLM |

### Configurações de Streaming

#### SRS (Simple Realtime Server)
- **Container**: `newcam-srs`
- **Porta Host**: `8081`
- **Porta Container**: `8080`
- **Configuração**: `/docker/srs/srs.conf`
- **Status**: ✅ Online e Funcional

**Endpoints SRS:**
- API: `http://localhost:8081/api/v1/`
- HLS: `http://localhost:8081/live/[stream].m3u8`
- HTTP-FLV: `http://localhost:8081/live/[stream].flv`
- RTMP: `rtmp://localhost:1935/live/[stream]`

#### ZLMediaKit
- **Container**: `newcam-zlmediakit`
- **Porta Host**: `8080` (mapeada para 9902)
- **Porta Container**: `8080`
- **Configuração**: `/zlmediakit-package/config/config.ini`
- **Status**: ✅ Online e Funcional

**Endpoints ZLMediaKit:**
- API: `http://localhost:9902/index/api/`
- HLS: `http://localhost:8080/live/[stream].m3u8`
- HTTP-FLV: `http://localhost:8080/live/[stream].flv`
- RTMP: `rtmp://localhost:1935/live/[stream]`
- RTSP: `rtsp://localhost:554/live/[stream]`

## 🚀 Inicialização dos Serviços

### Via Docker Compose (Recomendado)

```bash
# Iniciar todos os serviços
docker-compose up -d

# Verificar status
docker ps

# Logs específicos
docker-compose logs -f newcam-srs
docker-compose logs -f newcam-zlmediakit
```

### Via Scripts PowerShell

```powershell
# Iniciar todos os serviços
.\scripts\start_all_services.ps1

# Verificar portas ativas
netstat -ano | findstr -E ":8080|:8081|:1935|:554"
```

## 🔍 Verificação de Status

### Teste de Conectividade

```powershell
# Testar SRS
Invoke-WebRequest -Uri http://localhost:8081/ -UseBasicParsing

# Testar ZLMediaKit
Invoke-WebRequest -Uri http://localhost:9902/index/api/getServerConfig -UseBasicParsing

# Testar Backend
Invoke-WebRequest -Uri http://localhost:3002/api/streams/test-zlm -UseBasicParsing
```

### Comandos de Diagnóstico

```powershell
# Verificar processos usando as portas
netstat -ano | findstr :8081
netstat -ano | findstr :8080

# Verificar containers Docker
docker ps --filter "name=newcam"

# Verificar logs do backend
npm run logs
```

## ⚙️ Configuração do Backend

### StreamingService.js

O `StreamingService` foi configurado para:

1. **Priorizar SRS** na porta 8081
2. **Fallback para ZLMediaKit** na porta 8080
3. **Detectar automaticamente** servidores online
4. **Alternar dinamicamente** entre servidores

### Variáveis de Ambiente

```env
# .env do Backend
PORT=3001
API_PORT=3001
WORKER_PORT=3003
CORS_ORIGIN=http://localhost:5174

# Streaming
STREAMING_SERVER=zlm
RTSP_PORT=8554
RTMP_PORT=1935
HLS_PORT=8080

# APIs
SRS_API_URL=http://localhost:1985/api/v1
ZLM_API_URL=http://localhost:9902/index/api
```

### RealStreamingService.js

Configurado para usar a porta correta do frontend:

```javascript
const baseUrl = process.env.BASE_URL || 'http://localhost:5174';
```

## 🛠️ Resolução de Problemas

### Erro: "EADDRINUSE" na porta 8081

**Causa**: O SRS já está rodando via Docker

**Solução**: 
1. Use o SRS existente em vez do SimpleStreamingServer
2. Ou pare o container: `docker stop newcam-srs`

### Streaming não funciona

**Verificações**:
1. Containers Docker rodando: `docker ps`
2. Portas abertas: `netstat -ano | findstr :8081`
3. Backend conectado: `curl http://localhost:3002/api/streams/test-zlm`
4. Frontend acessível: `curl http://localhost:5174`

### Performance baixa

**Otimizações**:
1. Ajustar configurações do SRS em `/docker/srs/srs.conf`
2. Configurar ZLMediaKit em `/zlmediakit-package/config/config.ini`
3. Monitorar recursos: `docker stats`

## 📊 Monitoramento

### Métricas Importantes

- **Latência de streaming**: < 3 segundos
- **CPU dos containers**: < 80%
- **Memória**: < 2GB por container
- **Conexões simultâneas**: Até 100 por servidor

### Logs de Streaming

```bash
# SRS
docker-compose logs -f newcam-srs

# ZLMediaKit
docker-compose logs -f newcam-zlmediakit

# Backend
tail -f backend/logs/streaming.log
```

## 🔐 Segurança

### Autenticação

- **SRS**: Configurado via hooks no backend
- **ZLMediaKit**: Secret key configurada
- **Backend**: JWT tokens obrigatórios

### Configurações de Segurança

```ini
# ZLMediaKit config.ini
[api]
secret=9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK

[hook]
enable=1
on_publish=http://host.docker.internal:3001/api/hook/on_publish
on_play=http://host.docker.internal:3001/api/hook/on_play
```

## 📚 Referências

- [Documentação SRS](https://github.com/ossrs/srs)
- [Documentação ZLMediaKit](https://github.com/ZLMediaKit/ZLMediaKit)
- [Docker Compose Reference](https://docs.docker.com/compose/)
- [Configuração Nginx](../docker/nginx/nginx.conf)

---

**Última atualização**: Julho 2025  
**Versão**: 1.0  
**Status**: ✅ Configuração Validada e Funcional