# Scripts de Deploy e Manutenção - NewCAM

Este diretório contém scripts essenciais para deploy, monitoramento, backup e manutenção do sistema NewCAM.

## 📋 Scripts Disponíveis

### 🚀 deploy.sh
**Script principal de deploy**

```bash
# Executar deploy completo
sudo ./deploy.sh
```

**Funcionalidades:**
- Verificação de dependências
- Backup automático antes do deploy
- Instalação de dependências
- Configuração de containers Docker
- Inicialização com PM2
- Verificação de saúde pós-deploy
- Configuração de monitoramento

**Pré-requisitos:**
- Node.js 18+
- Docker e Docker Compose
- PM2 (instalado automaticamente)
- Permissões de root/sudo

---

### 🔍 check-requirements.sh
**Verificação de pré-requisitos do sistema**

```bash
# Verificar se o sistema está pronto para deploy
sudo ./check-requirements.sh
```

**Verificações realizadas:**
- ✅ Node.js e npm
- ✅ Docker e Docker Compose
- ✅ PM2
- ✅ Portas disponíveis (5173, 3002, 3003, 5432, 6379, 1935, 8080)
- ✅ Espaço em disco e memória
- ✅ Conectividade de rede
- ✅ Permissões de diretórios
- ✅ Firewall

**Códigos de saída:**
- `0`: Sistema pronto
- `1`: Erros encontrados

---

### 🗄️ backup.sh
**Sistema de backup completo**

```bash
# Backup completo
sudo ./backup.sh

# Backup apenas do banco de dados
sudo ./backup.sh --database-only

# Backup apenas dos arquivos
sudo ./backup.sh --files-only

# Backup apenas das configurações
sudo ./backup.sh --config-only

# Limpar backups antigos
sudo ./backup.sh --cleanup
```

**Componentes do backup:**
- 📊 Banco de dados PostgreSQL
- 📁 Arquivos da aplicação
- 🐳 Configurações Docker
- ⚡ Configurações PM2
- 📦 Backup completo consolidado

**Localização:** `/var/backups/newcam/`
**Retenção:** 30 dias (configurável)

---

### 📊 monitor.sh
**Sistema de monitoramento**

```bash
# Verificação única
sudo ./monitor.sh

# Modo daemon (monitoramento contínuo)
sudo ./monitor.sh --daemon

# Gerar relatório de status
./monitor.sh --report

# Verificações específicas
./monitor.sh --pm2        # Apenas PM2
./monitor.sh --docker     # Apenas Docker
./monitor.sh --health     # Apenas saúde das aplicações
./monitor.sh --database   # Apenas banco de dados
./monitor.sh --redis      # Apenas Redis
./monitor.sh --resources  # Apenas recursos do sistema
./monitor.sh --logs       # Apenas logs de erro
./monitor.sh --network    # Apenas conectividade
```

**Monitoramento inclui:**
- 🔄 Processos PM2
- 🐳 Containers Docker
- 🌐 Saúde das aplicações (Frontend, Backend, Worker)
- 🗄️ PostgreSQL e Redis
- 💻 Recursos do sistema (CPU, Memória, Disco)
- 📝 Logs de erro
- 🌍 Conectividade de rede

**Alertas automáticos** para problemas críticos

---

### 🔄 rollback.sh
**Sistema de rollback**

```bash
# Listar backups disponíveis
sudo ./rollback.sh --list

# Rollback automático (backup mais recente)
sudo ./rollback.sh --auto

# Rollback de arquivo específico
sudo ./rollback.sh --file /var/backups/newcam/backup.tar.gz

# Modo interativo
sudo ./rollback.sh --interactive
```

**Funcionalidades:**
- 📋 Listagem de backups disponíveis
- ✅ Validação de integridade dos backups
- 💾 Backup do estado atual antes do rollback
- 🔄 Restauração de arquivos e banco de dados
- 🔧 Reinstalação de dependências
- 🚀 Reinicialização de serviços
- ✅ Verificação de saúde pós-rollback

---

## 🛠️ Configuração Inicial

### 1. Preparar o Servidor

```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar dependências básicas
sudo apt install -y curl wget git htop net-tools

# Verificar pré-requisitos
sudo ./check-requirements.sh
```

### 2. Executar Deploy

```bash
# Deploy completo
sudo ./deploy.sh
```

### 3. Configurar Monitoramento

```bash
# Adicionar ao crontab para monitoramento automático
echo "*/5 * * * * /var/www/newcam/scripts/monitor.sh" | sudo crontab -

# Backup diário
echo "0 2 * * * /var/www/newcam/scripts/backup.sh" | sudo crontab -
```

---

## 📁 Estrutura de Diretórios

```
/var/www/newcam/          # Aplicação principal
├── frontend/             # Frontend React
├── backend/              # Backend Node.js
├── worker/               # Worker Node.js
├── docker/               # Configurações Docker
├── scripts/              # Scripts de manutenção
└── ecosystem.config.js   # Configuração PM2

/var/newcam/              # Dados da aplicação
├── uploads/              # Arquivos enviados
├── recordings/           # Gravações
└── data/                 # Dados diversos

/var/www/streams/         # Streams de vídeo

/var/backups/newcam/      # Backups

/var/log/newcam/          # Logs
├── deploy_*.log          # Logs de deploy
├── backup_*.log          # Logs de backup
├── monitor.log           # Logs de monitoramento
└── rollback_*.log        # Logs de rollback
```

---

## 🔧 Comandos Úteis

### Status do Sistema
```bash
# Status geral (criado pelo deploy)
newcam-status

# Status PM2
pm2 status
pm2 logs

# Status Docker
docker-compose -f /var/www/newcam/docker/docker-compose.yml ps
docker-compose -f /var/www/newcam/docker/docker-compose.yml logs
```

### Controle de Serviços
```bash
# Reiniciar aplicações
pm2 restart ecosystem.config.js

# Reiniciar containers
docker-compose -f /var/www/newcam/docker/docker-compose.yml restart

# Parar tudo
pm2 stop all
docker-compose -f /var/www/newcam/docker/docker-compose.yml down
```

### Logs
```bash
# Logs das aplicações
pm2 logs

# Logs dos containers
docker-compose -f /var/www/newcam/docker/docker-compose.yml logs -f

# Logs do sistema
tail -f /var/log/newcam/monitor.log
```

---

## 🚨 Troubleshooting

### Problema: Aplicação não inicia
```bash
# Verificar logs
pm2 logs

# Verificar portas
netstat -tlnp | grep -E ':(5173|3002|3003)'

# Reiniciar serviços
pm2 restart all
```

### Problema: Containers Docker não sobem
```bash
# Verificar logs
docker-compose -f /var/www/newcam/docker/docker-compose.yml logs

# Verificar recursos
docker system df
docker system prune

# Reiniciar containers
docker-compose -f /var/www/newcam/docker/docker-compose.yml down
docker-compose -f /var/www/newcam/docker/docker-compose.yml up -d
```

### Problema: Banco de dados inacessível
```bash
# Verificar container PostgreSQL
docker-compose -f /var/www/newcam/docker/docker-compose.yml exec postgres pg_isready -U newcam_user

# Verificar logs do PostgreSQL
docker-compose -f /var/www/newcam/docker/docker-compose.yml logs postgres

# Conectar ao banco
docker-compose -f /var/www/newcam/docker/docker-compose.yml exec postgres psql -U newcam_user -d newcam_db
```

### Problema: Alto uso de recursos
```bash
# Verificar recursos
./monitor.sh --resources

# Verificar processos
top
htop

# Limpar logs antigos
find /var/log -name "*.log" -mtime +7 -delete
```

---

## 📞 Suporte

### Logs Importantes
- **Deploy**: `/var/log/newcam/deploy_*.log`
- **Monitoramento**: `/var/log/newcam/monitor.log`
- **Backup**: `/var/log/newcam/backup_*.log`
- **Rollback**: `/var/log/newcam/rollback_*.log`
- **PM2**: `pm2 logs`
- **Docker**: `docker-compose logs`

### Comandos de Diagnóstico
```bash
# Relatório completo do sistema
./monitor.sh --report

# Verificar integridade dos backups
./backup.sh --cleanup

# Testar conectividade
curl -f http://localhost:5173
curl -f http://localhost:3002/api/health
curl -f http://localhost:3003/health
```

### Contatos
- **Logs de erro**: Verificar `/var/log/newcam/`
- **Status em tempo real**: `newcam-status`
- **Monitoramento**: `./monitor.sh --daemon`

---

## 📝 Notas Importantes

1. **Sempre execute os scripts como root/sudo**
2. **Faça backup antes de mudanças importantes**
3. **Monitore os logs regularmente**
4. **Mantenha os backups organizados**
5. **Teste o rollback em ambiente de desenvolvimento**
6. **Configure alertas para monitoramento automático**
7. **Mantenha as dependências atualizadas**
8. **Documente mudanças de configuração**

---

*Última atualização: $(date '+%Y-%m-%d')*