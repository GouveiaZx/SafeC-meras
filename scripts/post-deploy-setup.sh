#!/bin/bash

# Script de Configuração Pós-Deploy - NewCAM
# Executa configurações essenciais após o deploy inicial

set -e

# Configurações
APP_PATH="/opt/newcam"
DOMAIN="$1"
EMAIL="$2"

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
    echo "Uso: $0 <dominio> <email>"
    echo "Exemplo: $0 meusite.com admin@meusite.com"
    exit 1
fi

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERRO] $1${NC}"
    exit 1
}

warning() {
    echo -e "${YELLOW}[AVISO] $1${NC}"
}

log "=== Configuração Pós-Deploy NewCAM ==="
log "Domínio: $DOMAIN"
log "Email: $EMAIL"
echo ""

# Verificar se está sendo executado como root
if [ "$EUID" -ne 0 ]; then
    error "Este script deve ser executado como root"
fi

# Atualizar configurações com domínio real
log "Atualizando configurações com domínio..."
cd $APP_PATH

# Atualizar .env.production
sed -i "s/seu-dominio.com/$DOMAIN/g" .env.production
sed -i "s/admin@seu-dominio.com/$EMAIL/g" .env.production

# Atualizar nginx.conf
sed -i "s/\${DOMAIN}/$DOMAIN/g" docker/nginx/nginx.production.conf

# Atualizar script de manutenção
sed -i "s/seu-dominio.com/$DOMAIN/g" scripts/maintenance.sh
sed -i "s/admin@seu-dominio.com/$EMAIL/g" scripts/maintenance.sh

log "Configurações atualizadas"

# Configurar firewall avançado
log "Configurando firewall..."

# Resetar UFW
ufw --force reset

# Políticas padrão
ufw default deny incoming
ufw default allow outgoing

# Permitir SSH (com rate limiting)
ufw limit ssh

# Permitir HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Permitir streaming
ufw allow 554/tcp   # RTSP
ufw allow 1935/tcp  # RTMP
ufw allow 8080/tcp  # HLS/HTTP-FLV

# Permitir apenas conexões locais para serviços internos
ufw allow from 127.0.0.1 to any port 5432  # PostgreSQL
ufw allow from 172.20.0.0/16 to any port 5432  # Docker network

# Ativar firewall
ufw --force enable

log "Firewall configurado"

# Configurar fail2ban
log "Configurando fail2ban..."

cat > /etc/fail2ban/jail.local << EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3
ignoreip = 127.0.0.1/8 ::1

[sshd]
enabled = true
port = ssh
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600

[nginx-http-auth]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log
maxretry = 3
bantime = 1800

[nginx-limit-req]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log
maxretry = 10
bantime = 600
findtime = 600
EOF

systemctl enable fail2ban
systemctl restart fail2ban

log "Fail2ban configurado"

# Configurar logrotate
log "Configurando rotação de logs..."

cat > /etc/logrotate.d/newcam << EOF
/var/log/newcam/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 root root
    postrotate
        docker-compose -f $APP_PATH/docker-compose.production.yml restart nginx || true
    endscript
}

/var/log/nginx/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 www-data www-data
    sharedscripts
    postrotate
        docker-compose -f $APP_PATH/docker-compose.production.yml restart nginx || true
    endscript
}
EOF

log "Logrotate configurado"

# Configurar crontabs
log "Configurando tarefas agendadas..."

# Backup e manutenção diária às 2:00
echo "0 2 * * * root $APP_PATH/scripts/maintenance.sh >> /var/log/newcam/cron.log 2>&1" > /etc/cron.d/newcam-maintenance

# Renovação SSL às 3:00 (diário, mas só renova se necessário)
echo "0 3 * * * root certbot renew --quiet && docker-compose -f $APP_PATH/docker-compose.production.yml restart nginx" > /etc/cron.d/newcam-ssl

# Verificação de saúde a cada 5 minutos
cat > /etc/cron.d/newcam-health << EOF
*/5 * * * * root curl -f -s https://$DOMAIN/health > /dev/null || echo "[\$(date)] Frontend down" >> /var/log/newcam/health.log
*/5 * * * * root curl -f -s https://api.$DOMAIN/health > /dev/null || echo "[\$(date)] API down" >> /var/log/newcam/health.log
EOF

# Limpeza de containers Docker semanalmente
echo "0 4 * * 0 root docker system prune -f --volumes >> /var/log/newcam/docker-cleanup.log 2>&1" > /etc/cron.d/newcam-docker-cleanup

log "Crontabs configurados"

# Configurar monitoramento de recursos
log "Configurando monitoramento..."

# Instalar htop, iotop, nethogs para monitoramento
apt-get update
apt-get install -y htop iotop nethogs ncdu tree

# Criar script de monitoramento em tempo real
cat > /usr/local/bin/newcam-monitor << 'EOF'
#!/bin/bash

echo "=== Monitor NewCAM - $(date) ==="
echo ""

echo "=== Status dos Containers ==="
docker-compose -f /opt/newcam/docker-compose.production.yml ps
echo ""

echo "=== Uso de Recursos ==="
echo "CPU:"
top -bn1 | grep "Cpu(s)" | awk '{print $2 " " $4}'
echo ""
echo "Memória:"
free -h
echo ""
echo "Disco:"
df -h /
echo ""

echo "=== Conexões de Rede ==="
netstat -tuln | grep -E ':(80|443|554|1935|3000|3001|5432|8000)'
echo ""

echo "=== Últimos Logs de Erro ==="
tail -10 /var/log/newcam/maintenance.log | grep -i error || echo "Nenhum erro recente"
echo ""

echo "=== Processos Docker ==="
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"
EOF

chmod +x /usr/local/bin/newcam-monitor

log "Monitoramento configurado (execute: newcam-monitor)"

# Configurar backup automático para cloud (opcional)
log "Configurando backup para cloud..."

# Instalar rclone para backup em cloud
wget -q https://downloads.rclone.org/rclone-current-linux-amd64.zip
unzip -q rclone-current-linux-amd64.zip
cp rclone-*/rclone /usr/local/bin/
chmod +x /usr/local/bin/rclone
rm -rf rclone-*

# Criar script de backup para cloud
cat > /usr/local/bin/newcam-cloud-backup << EOF
#!/bin/bash

# Configurar rclone primeiro com: rclone config
# Este script faz backup dos dados importantes para cloud storage

BACKUP_DATE=\$(date +%Y%m%d)
LOCAL_BACKUP="/var/backups/newcam"
CLOUD_REMOTE="cloud:newcam-backups"  # Configure com rclone config

if rclone listremotes | grep -q "cloud:"; then
    echo "Fazendo backup para cloud..."
    rclone sync \$LOCAL_BACKUP \$CLOUD_REMOTE/\$BACKUP_DATE --progress
    echo "Backup para cloud concluído"
else
    echo "Cloud storage não configurado. Execute: rclone config"
fi
EOF

chmod +x /usr/local/bin/newcam-cloud-backup

log "Backup para cloud configurado (configure com: rclone config)"

# Configurar alertas por email
log "Configurando sistema de email..."

# Instalar postfix para envio de emails
debconf-set-selections <<< "postfix postfix/mailname string $DOMAIN"
debconf-set-selections <<< "postfix postfix/main_mailer_type string 'Internet Site'"
apt-get install -y postfix mailutils

# Configurar postfix básico
postconf -e "myhostname = $DOMAIN"
postconf -e "mydestination = localhost"
postconf -e "relayhost = "
postconf -e "inet_interfaces = loopback-only"

systemctl restart postfix
systemctl enable postfix

log "Sistema de email configurado"

# Configurar permissões finais
log "Configurando permissões..."

# Tornar scripts executáveis
chmod +x $APP_PATH/scripts/*.sh
chmod +x $APP_PATH/deploy.sh

# Configurar propriedade dos diretórios
chown -R 1000:1000 /var/lib/newcam
chown -R 1000:1000 /var/log/newcam
chown -R root:root $APP_PATH/scripts

log "Permissões configuradas"

# Criar aliases úteis
log "Criando aliases úteis..."

cat >> /root/.bashrc << EOF

# Aliases NewCAM
alias newcam-logs='docker-compose -f $APP_PATH/docker-compose.production.yml logs -f'
alias newcam-status='docker-compose -f $APP_PATH/docker-compose.production.yml ps'
alias newcam-restart='docker-compose -f $APP_PATH/docker-compose.production.yml restart'
alias newcam-update='cd $APP_PATH && git pull && docker-compose -f docker-compose.production.yml build && docker-compose -f docker-compose.production.yml up -d'
alias newcam-backup='$APP_PATH/scripts/maintenance.sh'
alias newcam-monitor='/usr/local/bin/newcam-monitor'
EOF

log "Aliases criados"

# Teste final
log "Executando testes finais..."

# Testar conectividade
if curl -f -s "https://$DOMAIN/health" > /dev/null; then
    log "✅ Frontend acessível"
else
    warning "❌ Frontend não acessível"
fi

if curl -f -s "https://api.$DOMAIN/health" > /dev/null; then
    log "✅ API acessível"
else
    warning "❌ API não acessível"
fi

# Testar email
echo "Teste de configuração NewCAM - $(date)" | mail -s "NewCAM Configurado" $EMAIL 2>/dev/null || warning "Sistema de email pode não estar funcionando"

log "=== Configuração Pós-Deploy Concluída ==="
echo ""
log "🎉 NewCAM está configurado e rodando!"
log "🌐 Site: https://$DOMAIN"
log "🔧 API: https://api.$DOMAIN"
log "📊 Monitor: newcam-monitor"
log "📝 Logs: newcam-logs"
log "🔄 Status: newcam-status"
echo ""
log "Próximos passos:"
log "1. Configure backup para cloud: rclone config"
log "2. Configure monitoramento externo (opcional)"
log "3. Teste todas as funcionalidades"
log "4. Configure usuários e câmeras"
echo ""
log "Documentação completa em: $APP_PATH/docs/"