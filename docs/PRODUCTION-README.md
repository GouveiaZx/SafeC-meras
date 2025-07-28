# NewCAM - Configuração de Produção

## Servidor de Produção
- **IP**: 66.94.104.241
- **Usuário**: root
- **Caminho**: /var/www/newcam

## Serviços Configurados

### ZLMediaKit (Streaming)
- **Porta**: 8000
- **Secret**: 9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK
- **APIs**: http://66.94.104.241:8000/index/api/

### Backend (API)
- **Porta**: 3000
- **URL**: http://66.94.104.241:3000

### Frontend
- **Porta**: 80 (via Nginx)
- **URL**: http://66.94.104.241

## Comandos de Deploy

### Deploy Completo
```bash
# Executar localmente
node deploy-production.js
./deploy-to-server.sh
```

### Comandos no Servidor

```bash
# Verificar status dos serviços
docker-compose ps
pm2 status

# Logs
docker-compose logs zlmediakit
pm2 logs newcam-backend

# Reiniciar serviços
docker-compose restart zlmediakit
pm2 restart newcam-backend
```

## Configurações Removidas

### Arquivos de Mock/Teste Removidos:
- test_streaming_corrected.js
- test_streaming_complete.js
- test_streaming_final.js
- test_streaming_fixed.js
- test_streaming_simple.js
- test_camera_*.js
- test_*.js
- debug_*.js
- check_*.js
- create_test_*.js
- fix_*.js
- simple_*.js
- backend/src/services/MockStreamingService.js
- backend/src/services/SimpleStreamingService.js
- backend/src/routes/simulation.js
- worker/simple_streaming_server.js
- worker/camera_streaming_fix.js
- test-*.js
- DIAGNOSTICO_*.md
- TESTE_*.md
- SOLUCAO_*.md
- SYNC*.md
- Docker-Desktop-Installer.exe
- ffmpeg.zip

### Serviços Desabilitados:
- MockStreamingService
- SimpleStreamingService
- Rotas de simulação
- Dados de teste

## Monitoramento

### URLs de Verificação:
- **API Health**: http://66.94.104.241:3000/api/health
- **ZLMediaKit**: http://66.94.104.241:8000/index/api/getServerConfig?secret=9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK
- **Frontend**: http://66.94.104.241

### Logs Importantes:
- Backend: `pm2 logs newcam-backend`
- ZLMediaKit: `docker-compose logs zlmediakit`
- Nginx: `docker-compose logs nginx`

## Troubleshooting

### Problemas Comuns:
1. **Streaming não funciona**: Verificar se ZLMediaKit está rodando na porta 8000
2. **API não responde**: Verificar se backend está rodando com PM2
3. **Frontend não carrega**: Verificar se Nginx está configurado corretamente

### Comandos de Diagnóstico:
```bash
# Verificar portas
netstat -tlnp | grep -E '(3000|8000|80)'

# Testar conectividade
curl http://localhost:3000/api/health
curl http://localhost:8000/index/api/getServerConfig?secret=9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK
```
