# 🚪 Configuração de Portas - Sistema NewCAM

## 📋 Visão Geral
Este documento especifica todas as portas necessárias para o funcionamento completo do Sistema NewCAM em produção no servidor `nuvem.safecameras.com.br` (66.94.104.241).

## 🌐 Portas Públicas (Internet)

### Web Services (Nginx)
| Porta | Protocolo | Serviço | Descrição | Firewall |
|-------|-----------|---------|-----------|----------|
| **80** | HTTP | Nginx | Redirecionamento para HTTPS | ✅ Público |
| **443** | HTTPS | Nginx + SSL | Interface web principal | ✅ Público |

### Streaming Services
| Porta | Protocolo | Serviço | Descrição | Firewall |
|-------|-----------|---------|-----------|----------|
| **1935** | RTMP | ZLMediaKit | Ingestão RTMP de câmeras | ✅ Público |
| **554** | RTSP | ZLMediaKit | Streaming RTSP para clientes | ✅ Público |

## 🏠 Portas Internas (Localhost)

### Application Services
| Porta | Protocolo | Serviço | Descrição | Binding |
|-------|-----------|---------|-----------|---------|
| **3002** | HTTP | Backend API | API REST principal | 127.0.0.1 |
| **3003** | HTTP | Worker Service | Serviço de processamento | 127.0.0.1 |
| **8000** | HTTP | ZLMediaKit | HTTP-HLS e API interna | 127.0.0.1 |

### Database & Cache
| Porta | Protocolo | Serviço | Descrição | Binding |
|-------|-----------|---------|-----------|---------|
| **6379** | TCP | Redis | Cache e sessões | 127.0.0.1 |

## 🔧 Configuração UFW (Ubuntu Firewall)

### Comandos de Configuração
```bash
# SSH (obrigatório para administração)
sudo ufw allow 22/tcp

# Web Services
sudo ufw allow 80/tcp    # HTTP (redirect to HTTPS)
sudo ufw allow 443/tcp   # HTTPS (interface web)

# Streaming Services
sudo ufw allow 1935/tcp  # RTMP (ingestão de câmeras)
sudo ufw allow 554/tcp   # RTSP (streaming para clientes)

# Ativar firewall
sudo ufw --force enable

# Verificar status
sudo ufw status verbose
```

### Exemplo de Output Esperado
```
Status: active
Logging: on (low)
Default: deny (incoming), allow (outgoing), disabled (routed)
New profiles: skip

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW IN    Anywhere
80/tcp                     ALLOW IN    Anywhere
443/tcp                    ALLOW IN    Anywhere
1935/tcp                   ALLOW IN    Anywhere
554/tcp                    ALLOW IN    Anywhere
```

## 🐳 Docker Port Mapping

### docker-compose.prod.yml
```yaml
services:
  # Nginx (Web Server)
  nginx:
    ports:
      - "80:80"      # HTTP
      - "443:443"    # HTTPS

  # ZLMediaKit (Media Server)
  zlmediakit:
    ports:
      - "1935:1935"  # RTMP
      - "8000:80"    # HTTP-HLS (mapeado internamente)
      - "554:554"    # RTSP

  # Redis (Cache)
  redis:
    ports:
      - "127.0.0.1:6379:6379"  # Apenas localhost
```

## 🔒 Configuração Nginx (Proxy Reverso)

### /etc/nginx/sites-available/newcam
```nginx
server {
    listen 443 ssl http2;
    server_name nuvem.safecameras.com.br;

    # Frontend (React App)
    location / {
        root /var/www/newcam/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # API Backend (Internal: 3002)
    location /api {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket (Internal: 3002)
    location /ws {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # HLS Streaming (Internal: 8000)
    location /live {
        proxy_pass http://127.0.0.1:8000;
        add_header Access-Control-Allow-Origin *;
        add_header Cache-Control no-cache;
    }

    # Recording Files (Internal: 3002)
    location /recordings {
        proxy_pass http://127.0.0.1:3002;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## 🎯 Mapeamento de Serviços

### Fluxo de Dados
```
Internet → [443/HTTPS] → Nginx → [3002] → Backend API
Internet → [1935/RTMP] → ZLMediaKit → [Records] → Backend API
Internet → [554/RTSP] → ZLMediaKit → [Stream] → Clients
Backend → [6379] → Redis → [Cache/Sessions]
Backend → [8000] → ZLMediaKit → [HLS/API]
Backend → [3003] → Worker → [S3 Upload/Processing]
```

### URLs de Acesso
- **Interface Web**: `https://nuvem.safecameras.com.br`
- **API Health**: `https://nuvem.safecameras.com.br/api/health`
- **HLS Stream**: `https://nuvem.safecameras.com.br/live/{camera_id}.m3u8`
- **RTMP Ingest**: `rtmp://nuvem.safecameras.com.br:1935/live/{stream_key}`
- **RTSP Stream**: `rtsp://nuvem.safecameras.com.br:554/live/{stream_id}`

## 🔍 Verificação de Portas

### Comandos de Verificação
```bash
# Verificar portas em uso
sudo netstat -tlnp | grep -E ':(80|443|3002|3003|8000|1935|554|6379)'

# Verificar conectividade externa
curl -I https://nuvem.safecameras.com.br
telnet nuvem.safecameras.com.br 1935
telnet nuvem.safecameras.com.br 554

# Verificar serviços internos
curl -I http://localhost:3002/api/health
curl -I http://localhost:8000/index/api/getServerConfig
redis-cli ping
```

### Output Esperado netstat
```
tcp   0   0 0.0.0.0:80      0.0.0.0:*    LISTEN    1234/nginx
tcp   0   0 0.0.0.0:443     0.0.0.0:*    LISTEN    1234/nginx
tcp   0   0 127.0.0.1:3002  0.0.0.0:*    LISTEN    5678/node
tcp   0   0 127.0.0.1:3003  0.0.0.0:*    LISTEN    5679/node
tcp   0   0 127.0.0.1:6379  0.0.0.0:*    LISTEN    9012/redis-server
tcp   0   0 0.0.0.0:1935    0.0.0.0:*    LISTEN    3456/zlmediakit
tcp   0   0 0.0.0.0:554     0.0.0.0:*    LISTEN    3456/zlmediakit
tcp   0   0 127.0.0.1:8000  0.0.0.0:*    LISTEN    3456/zlmediakit
```

## ⚠️ Segurança e Restrições

### Princípios de Segurança
1. **Bind Localhost**: Serviços internos (3002, 3003, 6379, 8000) apenas em 127.0.0.1
2. **Firewall Restritivo**: Apenas portas necessárias abertas para Internet
3. **SSL Obrigatório**: Todo tráfego web criptografado via HTTPS
4. **Proxy Reverso**: Nginx como único ponto de entrada web
5. **No Direct Access**: Bancos e serviços internos não expostos

### Portas BLOQUEADAS (não devem estar acessíveis)
- ❌ **3002**: Backend API (apenas via Nginx)
- ❌ **3003**: Worker Service (interno apenas)
- ❌ **6379**: Redis (localhost apenas)
- ❌ **8000**: ZLMediaKit HTTP (apenas via Nginx)

## 🚨 Troubleshooting

### Problemas Comuns

**1. Porta 80/443 não acessível**
```bash
sudo systemctl status nginx
sudo nginx -t
sudo certbot certificates
```

**2. RTMP não funciona (1935)**
```bash
docker logs newcam-zlmediakit-prod
sudo ufw status | grep 1935
telnet localhost 1935
```

**3. RTSP não conecta (554)**
```bash
docker exec newcam-zlmediakit-prod netstat -tlnp
ffplay rtsp://localhost:554/live/test
```

**4. API não responde (3002)**
```bash
pm2 status
pm2 logs newcam-backend
curl http://localhost:3002/api/health
```

**5. Worker offline (3003)**
```bash
pm2 logs newcam-worker
curl http://localhost:3003/health
```

### Logs Relevantes
```bash
# Nginx
sudo tail -f /var/log/nginx/error.log

# PM2 Services
pm2 logs --lines 50

# Docker Services
docker logs newcam-zlmediakit-prod
docker logs newcam-redis-prod

# System
sudo journalctl -u nginx -f
sudo journalctl -u docker -f
```

## 📊 Monitoramento de Portas

### Script de Verificação
```bash
#!/bin/bash
echo "=== NewCAM Ports Health Check ==="
echo "Date: $(date)"
echo "=================================="

# Public ports
echo "Public Ports:"
echo "HTTP (80): $(curl -s -o /dev/null -w "%{http_code}" http://nuvem.safecameras.com.br || echo "DOWN")"
echo "HTTPS (443): $(curl -s -o /dev/null -w "%{http_code}" https://nuvem.safecameras.com.br || echo "DOWN")"

# Internal services
echo "Internal Services:"
echo "Backend (3002): $(curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/api/health || echo "DOWN")"
echo "Worker (3003): $(curl -s -o /dev/null -w "%{http_code}" http://localhost:3003/health || echo "DOWN")"
echo "ZLM HTTP (8000): $(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/index/api/getServerConfig || echo "DOWN")"
echo "Redis (6379): $(redis-cli ping 2>/dev/null || echo "DOWN")"

echo "=================================="
```

---
*Documentação atualizada: Janeiro 2025*
*Sistema NewCAM - Configuração de Portas Completa*