# ⚡ Comandos Rápidos - NewCAM

## 🚀 Comandos Essenciais

### Diagnóstico
```bash
# Verificar sistema completo
node diagnostico_completo.js

# Verificar conexões de rede
node diagnostico_simples.js

# Verificar antes da migração
node verificar-migracao.js
```

### Desenvolvimento Local
```bash
# Backend
cd backend && npm run dev

# Frontend
cd frontend && npm run dev

# Build para produção
npm run build
```

### PM2 (Produção)
```bash
# Iniciar serviços
pm2 start ecosystem.config.js

# Verificar status
pm2 status

# Ver logs
pm2 logs backend --lines 50
pm2 logs frontend --lines 50
pm2 logs zlmediakit --lines 50

# Reiniciar serviço
pm2 restart backend
pm2 restart frontend

# Parar serviço
pm2 stop all
```

### Verificação de Portas
```bash
# Linux
sudo lsof -i :3002
sudo netstat -tlnp | grep :3002

# Windows
netstat -ano | findstr :3002
taskkill /PID [PID] /F
```

### Banco de Dados (Supabase)
```bash
# Verificar estrutura
SELECT * FROM cameras LIMIT 5;

# Verificar coluna stream_type
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'cameras' AND column_name = 'stream_type';

# Atualizar câmeras RTMP
UPDATE cameras SET stream_type = 'rtmp' WHERE rtmp_url IS NOT NULL;
```

### ZLMediaKit
```bash
# Status do servidor
curl http://localhost:8080/index/api/getServerConfig

# Listar streams
http://localhost:8080/index/api/getMediaList

# Testar RTMP
ffmpeg -re -i input.mp4 -c:v libx264 -f flv rtmp://localhost/live/test
```

## 📋 Checklist de Deploy

### 1. Pré-deploy
- [ ] Executar `node diagnostico_completo.js`
- [ ] Verificar todos os arquivos .env
- [ ] Confirmar portas disponíveis

### 2. Deploy
- [ ] Copiar código para servidor
- [ ] Instalar dependências (`npm install`)
- [ ] Executar build (`npm run build`)
- [ ] Configurar PM2
- [ ] Testar endpoints

### 3. Validação
- [ ] Backend health: `curl http://localhost:3002/api/health`
- [ ] Frontend: `curl http://localhost:3000`
- [ ] ZLMediaKit: `curl http://localhost:8080/index/api/getServerConfig`

## 🚨 Solução de Problemas

### Erro 400 ao iniciar stream
```bash
# Verificar coluna stream_type
SELECT id, name, stream_type FROM cameras WHERE id = 'sua_camera_id';

# Corrigir se necessário
UPDATE cameras SET stream_type = 'rtmp' WHERE id = 'sua_camera_id';
```

### Porta 3002 em uso
```bash
# Linux
sudo lsof -i :3002
sudo kill -9 [PID]

# Windows
netstat -ano | findstr :3002
taskkill /PID [PID] /F
```

### PM2 não inicia
```bash
# Limpar cache do PM2
pm2 flush
pm2 reload all

# Verificar logs
pm2 logs --lines 100
```

## 📞 Contato de Emergência

**Problemas Críticos:**
1. Execute `node diagnostico_completo.js`
2. Consulte `RESUMO_CORRECOES.md`
3. Verifique `CHECKLIST_MIGRACAO_CLIENTE.md`
4. Entre em contato: suporte@newcam.com.br

---

*Arquivo gerado: $(date)*