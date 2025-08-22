# Guia de Solução de Problemas - NewCAM

## Problemas Comuns e Soluções

### 🚨 Problemas de Instalação

#### Docker não inicia ou falha
**Sintomas**: `docker-compose up` falha ou containers não iniciam

**Soluções**:
```bash
# Verificar status do Docker
sudo systemctl status docker

# Reiniciar Docker
sudo systemctl restart docker

# Verificar permissões do usuário
sudo usermod -aG docker $USER
newgrp docker

# Limpar containers e volumes antigos
docker-compose down -v
docker system prune -a

# Verificar recursos disponíveis
docker system df
```

#### Erro de permissões em storage/
**Sintomas**: `EACCES: permission denied` ao acessar storage/

**Soluções**:
```bash
# Corrigir permissões
sudo chown -R $USER:$USER storage/
chmod -R 755 storage/

# Criar diretórios faltantes
mkdir -p storage/{www,logs,temp,recordings}
mkdir -p storage/www/{record,hls,thumbnails}

# Verificar permissões Docker
sudo usermod -aG docker $USER
```

#### Node.js ou npm falha na instalação
**Sintomas**: Erro durante `npm install`

**Soluções**:
```bash
# Limpar cache npm
npm cache clean --force

# Remover node_modules e reinstalar
rm -rf node_modules package-lock.json
npm install

# Usar versão correta do Node.js (18+)
nvm install 18
nvm use 18

# Verificar espaço em disco
df -h
```

### 🎥 Problemas de Streaming

#### ZLMediaKit não conecta ou falha
**Sintomas**: Streams não aparecem, erro 500 em endpoints de câmera

**Diagnóstico**:
```bash
# Verificar status do container
docker ps | grep zlmediakit
docker logs newcam-zlmediakit

# Testar API do ZLMediaKit
curl http://localhost:8000/index/api/getServerConfig

# Verificar configuração
cat docker/zlmediakit/config.ini
```

**Soluções**:
```bash
# Reiniciar container
docker-compose restart zlmediakit

# Verificar se a porta 8000 está livre
netstat -tlnp | grep 8000
lsof -i :8000

# Recriar container com configuração limpa
docker-compose down
docker-compose up -d zlmediakit

# Verificar variáveis de ambiente
echo $ZLM_SECRET
echo $ZLM_API_URL
```

#### Streams RTSP não funcionam
**Sintomas**: Câmeras aparecem offline, streams não iniciam

**Diagnóstico**:
```bash
# Testar RTSP diretamente
ffplay rtsp://192.168.1.100:554/stream1

# Verificar conectividade de rede
ping 192.168.1.100
telnet 192.168.1.100 554

# Verificar logs de streaming
docker logs newcam-zlmediakit | grep RTSP
```

**Soluções**:
```bash
# Verificar credenciais RTSP
rtsp://username:password@192.168.1.100:554/stream1

# Ajustar timeout de conexão
# Em backend/.env:
DEFAULT_CAMERA_TIMEOUT=30000

# Verificar firewall
sudo ufw status
sudo iptables -L

# Testar diferentes URLs RTSP
rtsp://192.168.1.100:554/stream1
rtsp://192.168.1.100/live/main
rtsp://192.168.1.100/h264
```

#### HLS streams não carregam no frontend
**Sintomas**: Player mostra erro de carregamento

**Diagnóstico**:
```bash
# Testar URL HLS diretamente
curl http://localhost:8000/live/camera-uuid.m3u8

# Verificar CORS
curl -H "Origin: http://localhost:5173" \
     -H "Access-Control-Request-Method: GET" \
     -H "Access-Control-Request-Headers: X-Requested-With" \
     -X OPTIONS \
     http://localhost:8000/live/camera-uuid.m3u8
```

**Soluções**:
```bash
# Verificar configuração CORS no backend
# backend/.env:
CORS_ORIGIN=http://localhost:5173

# Verificar proxy do Vite
# frontend/vite.config.ts:
proxy: {
  '/live': {
    target: 'http://localhost:8000',
    changeOrigin: true
  }
}

# Limpar cache do navegador
# Ctrl+Shift+R ou F12 > Network > Disable cache
```

### 📹 Problemas de Gravação

#### Gravações não são salvas
**Sintomas**: Streams funcionam mas não há arquivos MP4

**Diagnóstico**:
```bash
# Verificar webhook de gravação
curl -X POST http://localhost:3002/api/hooks/on_record_mp4 \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# Verificar pasta de gravações
ls -la storage/www/record/live/
docker exec newcam-zlmediakit ls -la /opt/media/bin/www/record/

# Verificar logs de gravação
grep "recording" backend/storage/logs/combined.log
```

**Soluções**:
```bash
# Verificar configuração de recording no ZLMediaKit
docker exec newcam-zlmediakit cat /opt/media/conf/config.ini | grep record

# Corrigir permissões de escrita
docker exec newcam-zlmediakit chmod -R 777 /opt/media/bin/www/

# Verificar espaço em disco
df -h

# Reiniciar gravação
curl -X POST http://localhost:3002/api/recordings/start \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"camera_id": "uuid"}'
```

#### Arquivos MP4 corrompidos ou incompletos
**Sintomas**: Arquivos não reproduzem ou têm duração incorreta

**Diagnóstico**:
```bash
# Verificar integridade do arquivo
ffprobe storage/www/record/live/camera-uuid/file.mp4

# Verificar logs durante gravação
docker logs newcam-zlmediakit | grep ERROR
```

**Soluções**:
```bash
# Reparar arquivo MP4 corrompido
ffmpeg -i corrupted.mp4 -c copy fixed.mp4

# Ajustar configuração de recording
# docker/zlmediakit/config.ini:
[record]
fastStart=1
fileSecond=1800

# Verificar recursos do sistema durante gravação
top
iostat 1
```

#### Player não reproduz gravações (H264/HEVC)
**Sintomas**: Erro de codec não suportado no navegador

**Diagnóstico**:
```bash
# Verificar codec do arquivo
ffprobe -show_streams storage/www/record/live/camera-uuid/file.mp4

# Testar endpoint de transcodificação
curl -I http://localhost:3002/api/recording-files/uuid/play-web \
  -H "Authorization: Bearer $TOKEN"
```

**Soluções**:
```bash
# Usar endpoint H264 para navegador
/api/recording-files/:id/play-web

# Verificar FFmpeg no container
docker exec newcam-zlmediakit ffmpeg -version

# Configurar transcodificação H264
# backend/src/routes/recordingFiles.js
'-c:v', 'libx264', '-preset', 'ultrafast'
```

### ☁️ Problemas de Upload S3

#### Uploads para S3/Wasabi falham
**Sintomas**: Gravações ficam com status "failed" de upload

**Diagnóstico**:
```bash
# Verificar configuração S3
curl http://localhost:3002/api/recordings/upload/queue-stats \
  -H "Authorization: Bearer $TOKEN"

# Verificar credenciais Wasabi
aws s3 ls s3://safe-cameras-03 \
  --endpoint-url=https://s3.wasabisys.com

# Verificar logs de upload
grep "upload" backend/storage/logs/combined.log
```

**Soluções**:
```bash
# Verificar configuração no .env
S3_UPLOAD_ENABLED=true
WASABI_ACCESS_KEY=your-key
WASABI_SECRET_KEY=your-secret
WASABI_BUCKET=safe-cameras-03
WASABI_ENDPOINT=https://s3.wasabisys.com

# Retry uploads falhados
curl -X POST http://localhost:3002/api/recordings/upload/retry-failed \
  -H "Authorization: Bearer $TOKEN"

# Verificar conectividade
ping s3.wasabisys.com
curl -I https://s3.wasabisys.com
```

#### Upload queue não processa
**Sintomas**: Arquivos ficam em "queued" por muito tempo

**Diagnóstico**:
```bash
# Verificar worker status
curl http://localhost:3002/api/worker/status \
  -H "Authorization: Bearer $TOKEN"

# Verificar logs do worker
tail -f worker/storage/logs/worker.log
```

**Soluções**:
```bash
# Reiniciar worker
npm run dev:worker

# Verificar configuração da fila
ENABLE_UPLOAD_QUEUE=true
S3_UPLOAD_CONCURRENCY=2

# Processar fila manualmente
node backend/src/scripts/processUploadQueue.js
```

### 🔐 Problemas de Autenticação

#### Login falha ou tokens expiram
**Sintomas**: Erro 401 Unauthorized, redirecionamento para login

**Diagnóstico**:
```bash
# Testar login diretamente
curl -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@newcam.local","password":"admin123"}'

# Verificar configuração JWT
echo $JWT_SECRET
echo $JWT_EXPIRES_IN
```

**Soluções**:
```bash
# Verificar credenciais padrão
Email: gouveiarx@gmail.com
Senha: Teste123

# Criar novo usuário admin
ADMIN_EMAIL=admin@newcam.local ADMIN_PASSWORD=admin123 ADMIN_NAME=Administrador \
  node backend/src/scripts/createAdminUser.js

# Verificar configuração Supabase
SUPABASE_URL=https://grkvfzuadctextnbpajb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-key
```

#### Problemas de conexão com Supabase
**Sintomas**: Erro de database connection

**Diagnóstico**:
```bash
# Testar conectividade Supabase
curl https://grkvfzuadctextnbpajb.supabase.co/rest/v1/cameras \
  -H "apikey: $SUPABASE_ANON_KEY"

# Verificar logs de database
grep "database" backend/storage/logs/error.log
```

**Soluções**:
```bash
# Verificar chaves Supabase
SUPABASE_URL=https://grkvfzuadctextnbpajb.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Verificar RLS policies no Supabase
# Dashboard > Authentication > Policies

# Testar conexão local
psql postgresql://postgres:password@localhost:5432/newcam
```

### 🖥️ Problemas de Frontend

#### Frontend não conecta com backend
**Sintomas**: Erro de CORS, API calls falham

**Diagnóstico**:
```bash
# Verificar se backend está rodando
curl http://localhost:3002/health

# Verificar configuração CORS
curl -H "Origin: http://localhost:5173" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS \
     http://localhost:3002/api/cameras
```

**Soluções**:
```bash
# Verificar configuração CORS no backend
# backend/.env:
CORS_ORIGIN=http://localhost:5173
FRONTEND_URL=http://localhost:5173

# Verificar proxy do Vite
# frontend/vite.config.ts:
server: {
  proxy: {
    '/api': 'http://localhost:3002'
  }
}

# Verificar portas
netstat -tlnp | grep -E "(3002|5173)"
```

#### Build do frontend falha
**Sintomas**: Erro durante `npm run build`

**Diagnóstico**:
```bash
# Verificar dependências
cd frontend
npm ls

# Verificar TypeScript
npx tsc --noEmit

# Verificar ESLint
npm run lint
```

**Soluções**:
```bash
# Limpar cache e reinstalar
rm -rf node_modules package-lock.json
npm install

# Corrigir problemas TypeScript
npx tsc --noEmit --skipLibCheck

# Build sem verificação de tipos (temporário)
npm run build -- --mode production --skip-type-check
```

### 🐛 Problemas de Performance

#### Sistema lento ou com alta CPU
**Sintomas**: Interface lenta, alta utilização de recursos

**Diagnóstico**:
```bash
# Verificar uso de recursos
top
htop
docker stats

# Verificar métricas do sistema
curl http://localhost:3002/api/metrics \
  -H "Authorization: Bearer $TOKEN"
```

**Soluções**:
```bash
# Otimizar configuração ZLMediaKit
# docker/zlmediakit/config.ini:
[general]
flowThreshold=1024
maxReaderSize=30

# Ajustar concorrência de upload
S3_UPLOAD_CONCURRENCY=1

# Limpar arquivos antigos
node backend/src/scripts/cleanupRecordingData.js

# Otimizar database queries
# Verificar índices no Supabase
```

#### Gravações consomem muito espaço
**Sintomas**: Disco cheio, sistema lento

**Diagnóstico**:
```bash
# Verificar uso de disco
du -sh storage/
df -h

# Contar arquivos de gravação
find storage/www/record -name "*.mp4" | wc -l
```

**Soluções**:
```bash
# Configurar limpeza automática
AUTO_DELETE_RECORDINGS=true
RECORDING_RETENTION_DAYS=7

# Executar limpeza manual
node backend/src/scripts/cleanupRecordingData.js

# Configurar upload S3 e remoção local
S3_UPLOAD_ENABLED=true
DELETE_LOCAL_AFTER_UPLOAD=true
LOCAL_RETENTION_DAYS=1
```

## 🔧 Ferramentas de Diagnóstico

### Scripts de Diagnóstico
```bash
# Health check completo
./scripts/system-health-check.js

# Validar sistema de gravação
node backend/src/scripts/validateRecordingSystem.js

# Verificar configuração
node backend/src/scripts/checkConfiguration.js

# Testar conectividade
./scripts/test-connectivity.sh
```

### Logs Importantes
```bash
# Backend logs
tail -f backend/storage/logs/combined.log
tail -f backend/storage/logs/error.log

# Worker logs
tail -f worker/storage/logs/worker.log

# ZLMediaKit logs
docker logs -f newcam-zlmediakit

# Sistema logs
journalctl -f -u newcam-backend
journalctl -f -u newcam-worker
```

### Comandos de Limpeza
```bash
# Limpar logs antigos
find . -name "*.log" -mtime +7 -delete

# Limpar cache Docker
docker system prune -a

# Limpar node_modules
find . -name "node_modules" -type d -exec rm -rf {} +

# Limpar arquivos temporários
rm -rf storage/temp/*
rm -rf uploads/temp/*
```

## 📞 Quando Buscar Ajuda

### Informações para Coleta
Antes de reportar um problema, colete:

1. **Versão do sistema**: `git rev-parse HEAD`
2. **Logs relevantes**: últimas 100 linhas dos logs de erro
3. **Configuração**: arquivo .env (sem credenciais)
4. **Ambiente**: OS, Docker version, Node.js version
5. **Passos para reproduzir**: sequência exata de ações

### Comando de Diagnóstico Completo
```bash
#!/bin/bash
echo "=== NewCAM Diagnostic Report ==="
echo "Date: $(date)"
echo "Git Version: $(git rev-parse HEAD)"
echo "Node.js: $(node --version)"
echo "Docker: $(docker --version)"
echo "OS: $(uname -a)"
echo ""

echo "=== Service Status ==="
docker ps
echo ""

echo "=== Disk Usage ==="
df -h
echo ""

echo "=== Memory Usage ==="
free -h
echo ""

echo "=== Recent Errors ==="
tail -20 backend/storage/logs/error.log
echo ""

echo "=== API Health ==="
curl -s http://localhost:3002/health | jq .
```

### Canais de Suporte
- **GitHub Issues**: Para bugs e solicitações de features
- **Documentação**: Consultar docs/ para informações detalhadas
- **Logs**: Sempre incluir logs relevantes ao reportar problemas