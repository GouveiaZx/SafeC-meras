# Plano de Limpeza e Otimização - NewCAM

## 🎯 Objetivo
Este documento detalha as ações específicas de limpeza e otimização identificadas na análise completa do projeto NewCAM.

---

## 🧹 Limpeza de Arquivos e Diretórios

### ❌ Arquivos/Diretórios para Remoção

**1. Backups e Arquivos Temporários**
```bash
# Remover backup antigo
rm -rf backup-before-production/

# Remover configurações Vercel não utilizadas
rm -rf .vercel/

# Remover script obsoleto
rm start-all-services.ps1
```

**2. Código Fonte ZLMediaKit Desnecessário**
```bash
# Manter apenas configurações, remover código fonte completo
rm -rf backend/zlmediakit/ZLMediaKit/
# Manter apenas: backend/docker/zlmediakit/config.ini
```

**3. Logs Antigos**
```bash
# Limpar logs antigos (manter apenas últimos 7 dias)
find backend/storage/logs/ -name "*.log" -mtime +7 -delete
```

**4. Arquivos de Cache e Build**
```bash
# Frontend
rm -rf frontend/dist/
rm -rf frontend/node_modules/.cache/

# Backend
rm -rf backend/node_modules/.cache/
```

---

## 🔧 Otimizações de Código

### 1. Configurações de Ambiente

**Arquivo: `backend/.env`**
- ✅ Supabase configurado corretamente
- ⚠️ **AÇÃO:** Configurar Wasabi S3 com credenciais reais
- ⚠️ **AÇÃO:** Gerar JWT_SECRET seguro para produção
- ⚠️ **AÇÃO:** Configurar SendGrid (opcional)

```env
# Gerar nova chave JWT segura
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")

# Configurar Wasabi S3
WASABI_ACCESS_KEY_ID=sua_chave_real
WASABI_SECRET_ACCESS_KEY=sua_chave_secreta_real
```

### 2. Limpeza de Código

**Backend - Remover TODOs Críticos**
- `backend/src/routes/streams.js` - Implementar controle real de streams
- `backend/src/routes/cameras.js` - Melhorar teste de conexão
- `backend/src/routes/dashboard.js` - Otimizar métricas

**Frontend - Páginas "Em Desenvolvimento"**
- Verificar se todas as páginas estão funcionais
- Remover placeholders de desenvolvimento

---

## 📊 Otimizações de Performance

### 1. Banco de Dados
```sql
-- Limpar logs antigos automaticamente
DELETE FROM system_logs WHERE created_at < NOW() - INTERVAL '30 days';

-- Otimizar índices
REINDEX DATABASE newcam;
```

### 2. Armazenamento
```bash
# Configurar limpeza automática de gravações antigas
# Manter apenas últimos 30 dias (configurável)
find backend/recordings/ -name "*.mp4" -mtime +30 -delete
```

### 3. Logs
```bash
# Configurar rotação de logs
# Manter apenas 5 arquivos de 10MB cada
logrotate -f /etc/logrotate.d/newcam
```

---

## 🔒 Melhorias de Segurança

### 1. Chaves de Produção
```bash
# Gerar novas chaves seguras
JWT_SECRET=$(openssl rand -hex 64)
SESSION_SECRET=$(openssl rand -hex 32)
WORKER_TOKEN=$(openssl rand -hex 32)
```

### 2. Configurações SSL
```env
# Para produção
HTTPS_ENABLED=true
SSL_CERT_PATH=/path/to/cert.pem
SSL_KEY_PATH=/path/to/private.key
```

### 3. Rate Limiting
```javascript
// Ajustar para produção
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100  // Reduzir de 1000 para 100
```

---

## 📁 Reestruturação de Diretórios

### Estrutura Atual vs Otimizada

**Antes:**
```
NewCAM/
├── backup-before-production/  ❌ REMOVER
├── .vercel/                   ❌ REMOVER
├── start-all-services.ps1     ❌ REMOVER
├── backend/
│   └── zlmediakit/ZLMediaKit/ ❌ REMOVER
└── ...
```

**Depois:**
```
NewCAM/
├── backend/           # API Node.js
├── frontend/          # Interface React
├── docker/           # Configurações Docker
├── docs/             # Documentação consolidada
├── database/         # Scripts de banco
├── scripts/          # Scripts utilitários
├── storage/          # Armazenamento local
└── .trae/           # Configurações Trae
```

---

## 🚀 Script de Limpeza Automatizada

### `scripts/cleanup.sh`
```bash
#!/bin/bash

echo "🧹 Iniciando limpeza do projeto NewCAM..."

# Remover arquivos desnecessários
echo "Removendo backups antigos..."
rm -rf backup-before-production/
rm -rf .vercel/
rm -f start-all-services.ps1

# Limpar código fonte ZLMediaKit
echo "Limpando código fonte ZLMediaKit..."
rm -rf backend/zlmediakit/ZLMediaKit/

# Limpar logs antigos
echo "Limpando logs antigos..."
find backend/storage/logs/ -name "*.log" -mtime +7 -delete

# Limpar cache
echo "Limpando cache..."
rm -rf frontend/dist/
rm -rf */node_modules/.cache/

# Limpar gravações antigas (opcional)
read -p "Limpar gravações antigas (>30 dias)? [y/N]: " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    find backend/recordings/ -name "*.mp4" -mtime +30 -delete
    echo "Gravações antigas removidas."
fi

echo "✅ Limpeza concluída!"
echo "📊 Espaço liberado: $(du -sh . | cut -f1)"
```

### `scripts/optimize.sh`
```bash
#!/bin/bash

echo "⚡ Iniciando otimização do projeto NewCAM..."

# Otimizar dependências
echo "Otimizando dependências..."
cd backend && npm prune && npm dedupe
cd ../frontend && npm prune && npm dedupe
cd ..

# Gerar chaves de produção
echo "Gerando chaves de produção..."
echo "JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")" >> .env.production
echo "SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" >> .env.production

# Otimizar banco de dados
echo "Otimizando banco de dados..."
# Executar scripts de otimização SQL

echo "✅ Otimização concluída!"
```

---

## 📋 Checklist de Limpeza

### Antes da Limpeza
- [ ] Fazer backup completo do projeto
- [ ] Verificar se não há trabalho não commitado
- [ ] Parar todos os serviços em execução

### Durante a Limpeza
- [ ] Remover arquivos desnecessários
- [ ] Limpar logs antigos
- [ ] Otimizar configurações
- [ ] Gerar chaves de produção
- [ ] Reestruturar diretórios

### Após a Limpeza
- [ ] Testar inicialização do sistema
- [ ] Verificar todas as funcionalidades
- [ ] Validar configurações de produção
- [ ] Atualizar documentação
- [ ] Commit das alterações

---

## 📈 Resultados Esperados

### Métricas de Melhoria
- **Redução de tamanho:** ~30-40% do projeto
- **Arquivos removidos:** ~50+ arquivos desnecessários
- **Performance:** +20% na inicialização
- **Segurança:** Chaves de produção seguras
- **Manutenibilidade:** Estrutura mais limpa

### Benefícios
- ✅ **Projeto mais limpo** e organizado
- ✅ **Melhor performance** de inicialização
- ✅ **Segurança aprimorada** com chaves reais
- ✅ **Facilidade de manutenção** aumentada
- ✅ **Deploy mais rápido** com menos arquivos

---

**📅 Criado em:** Janeiro 2025  
**⏱️ Tempo estimado:** 2-3 horas  
**🎯 Prioridade:** ALTA