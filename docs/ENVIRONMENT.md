# 🌍 Configuração de Ambiente - Sistema NewCAM

## 📋 Visão Geral

Este documento detalha todas as variáveis de ambiente necessárias para o Sistema NewCAM em diferentes ambientes (desenvolvimento, staging, produção).

## 🏗️ Estrutura de Arquivos

```
NewCAM/
├── .env.production.unified    # ✅ Arquivo unificado para produção
├── .env.example              # Template para desenvolvimento
├── backend/.env              # Desenvolvimento backend
├── backend/.env.production   # Produção backend
├── frontend/.env             # Desenvolvimento frontend
├── frontend/.env.production  # Produção frontend
├── worker/.env               # Desenvolvimento worker
└── worker/.env.production    # Produção worker
```

## 🔧 Variáveis por Categoria

### Core Application
| Variável | Desenvolvimento | Produção | Descrição |
|----------|----------------|-----------|-----------|
| `NODE_ENV` | development | production | Ambiente de execução |
| `PORT` | 3002 | 3002 | Porta do backend |
| `WORKER_PORT` | 3001 | 3001 | Porta do worker |

### Database (Supabase)
| Variável | Valor | Descrição |
|----------|-------|-----------|
| `SUPABASE_URL` | https://grkvfzuadctextnbpajb.supabase.co | URL da instância Supabase |
| `SUPABASE_ANON_KEY` | eyJhbGci... | Chave anônima para acesso público |
| `SUPABASE_SERVICE_ROLE_KEY` | eyJhbGci... | Chave de serviço para operações admin |

### ZLMediaKit (Streaming)
| Variável | Valor | Descrição |
|----------|-------|-----------|
| `ZLM_SECRET` | 9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK | Secret para API do ZLMediaKit |
| `ZLM_API_URL` | http://localhost:8000/index/api | URL da API ZLMediaKit |
| `ZLM_BASE_URL` | http://localhost:8000 | URL base do ZLMediaKit |

### Storage (Wasabi S3)
| Variável | Valor | Descrição |
|----------|-------|-----------|
| `WASABI_ACCESS_KEY` | 8WBR4YFE79UA94TBIEST | Chave de acesso Wasabi |
| `WASABI_SECRET_KEY` | A9hNRDUE... | Chave secreta Wasabi |
| `WASABI_BUCKET` | safe-cameras-03 | Nome do bucket |
| `WASABI_ENDPOINT` | https://s3.wasabisys.com | Endpoint Wasabi |

### Upload Configuration
| Variável | Desenvolvimento | Produção | Descrição |
|----------|----------------|-----------|-----------|
| `S3_UPLOAD_ENABLED` | false | true | Habilitar upload S3 |
| `S3_UPLOAD_CONCURRENCY` | 2 | 3 | Uploads simultâneos |
| `PREFER_S3_STREAMING` | false | true | Preferir streaming S3 |
| `DELETE_LOCAL_AFTER_UPLOAD` | false | true | Deletar local após upload |

### Frontend URLs
| Variável | Desenvolvimento | Produção |
|----------|----------------|-----------|
| `VITE_API_BASE_URL` | http://localhost:3002/api | https://nuvem.safecameras.com.br/api |
| `VITE_WS_URL` | ws://localhost:3002 | wss://nuvem.safecameras.com.br |
| `VITE_STREAMING_BASE_URL` | http://localhost:8000 | https://nuvem.safecameras.com.br |

### Security
| Variável | Desenvolvimento | Produção | Descrição |
|----------|----------------|-----------|-----------|
| `JWT_SECRET` | dev-secret | newcam-jwt-secret-production-2025 | Secret para JWT |
| `WORKER_TOKEN` | newcam-worker-token-2025-secure | newcam-worker-token-2025-secure | Token autenticação worker |
| `CORS_ORIGIN` | * | https://nuvem.safecameras.com.br | Origem CORS permitida |

### Logging
| Variável | Desenvolvimento | Produção | Descrição |
|----------|----------------|-----------|-----------|
| `LOG_LEVEL` | debug | info | Nível de log |
| `LOG_FILE` | ./logs/app.log | /var/log/newcam/application.log | Arquivo de log |
| `ERROR_LOG_FILE` | ./logs/error.log | /var/log/newcam/error.log | Arquivo de erro |

### Storage Paths
| Variável | Desenvolvimento | Produção |
|----------|----------------|-----------|
| `STORAGE_BASE_PATH` | ./storage | /var/www/newcam/storage |
| `RECORDING_PATH` | ./storage/recordings | /var/www/newcam/storage/recordings |
| `TEMP_PATH` | ./storage/temp | /var/www/newcam/storage/temp |

## 🚀 Configuração por Ambiente

### Desenvolvimento Local
```bash
# Copiar template
cp .env.example .env

# Editar valores necessários
nano .env
```

### Staging/Teste
```bash
# Usar configuração de desenvolvimento com ajustes
cp .env.example .env.staging
# Ajustar URLs para servidor de teste
```

### Produção
```bash
# Usar arquivo unificado
cp .env.production.unified .env

# Aplicar em cada serviço
cp .env backend/
cp .env frontend/
cp .env worker/
```

## 🔒 Segurança das Variáveis

### Variáveis Sensíveis
⚠️ **NUNCA commitar no Git:**
- `SUPABASE_SERVICE_ROLE_KEY`
- `WASABI_SECRET_KEY` 
- `JWT_SECRET`
- `WORKER_TOKEN`

### Gestão de Secrets
```bash
# Usar gerenciador de secrets em produção
# Exemplo com HashiCorp Vault:
vault kv put secret/newcam/prod \
  supabase_service_key="..." \
  wasabi_secret="..." \
  jwt_secret="..."
```

## 🔄 Migração entre Ambientes

### Development → Staging
```bash
# Copiar e ajustar URLs
cp .env .env.staging
sed -i 's/localhost/staging.safecameras.com.br/g' .env.staging
```

### Staging → Production
```bash
# Usar arquivo de produção
cp .env.production.unified .env.production
```

## 📊 Validação de Configuração

### Script de Validação
```bash
# Verificar variáveis essenciais
./scripts/validate-env.sh

# Testar conexões
curl $SUPABASE_URL/rest/v1/ \
  -H "apikey: $SUPABASE_ANON_KEY"
```

### Health Check Environment
```javascript
// Verificar no endpoint /api/health
{
  "environment": "production",
  "database": "connected",
  "storage": "available",
  "streaming": "active"
}
```

## 🛠️ Troubleshooting

### Problemas Comuns

1. **Supabase Connection Failed**
   ```bash
   # Verificar URL e keys
   echo $SUPABASE_URL
   echo $SUPABASE_ANON_KEY | cut -c1-20
   ```

2. **S3 Upload Errors**
   ```bash
   # Testar credenciais Wasabi
   aws s3 ls s3://$WASABI_BUCKET \
     --endpoint-url=$WASABI_ENDPOINT \
     --profile wasabi
   ```

3. **Streaming Issues**
   ```bash
   # Verificar ZLMediaKit
   curl $ZLM_API_URL/getServerConfig?secret=$ZLM_SECRET
   ```

## 📝 Template Completo

### .env.example
```bash
# ===========================================
# NEWCAM DEVELOPMENT ENVIRONMENT
# ===========================================
NODE_ENV=development
PORT=3002
WORKER_PORT=3001

# Database
SUPABASE_URL=https://grkvfzuadctextnbpajb.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Streaming
ZLM_SECRET=your_zlm_secret_here
ZLM_API_URL=http://localhost:8000/index/api
ZLM_BASE_URL=http://localhost:8000

# Storage
WASABI_ACCESS_KEY=your_access_key_here
WASABI_SECRET_KEY=your_secret_key_here
WASABI_BUCKET=your_bucket_name
WASABI_ENDPOINT=https://s3.wasabisys.com

# Upload Settings
S3_UPLOAD_ENABLED=false
S3_UPLOAD_CONCURRENCY=2
PREFER_S3_STREAMING=false
DELETE_LOCAL_AFTER_UPLOAD=false

# Frontend
VITE_API_BASE_URL=http://localhost:3002/api
VITE_WS_URL=ws://localhost:3002
VITE_STREAMING_BASE_URL=http://localhost:8000

# Security
JWT_SECRET=your_jwt_secret_here
WORKER_TOKEN=your_worker_token_here
CORS_ORIGIN=*

# Logging
LOG_LEVEL=debug
LOG_FILE=./logs/app.log
ERROR_LOG_FILE=./logs/error.log
```

## 📞 Suporte

Para dúvidas sobre configuração de ambiente:
- **Email**: admin@safecameras.com.br
- **Docs**: `/docs/TROUBLESHOOTING.md`
- **Health**: `https://nuvem.safecameras.com.br/api/health`

---
*Documentação atualizada: $(date)*