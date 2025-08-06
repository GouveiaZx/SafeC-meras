#!/bin/bash

# Script de Manutenção e Monitoramento - NewCAM
# Para ser executado via cron diariamente

set -e

# Configurações
APP_PATH="/opt/newcam"
BACKUP_PATH="/var/backups/newcam"
LOG_PATH="/var/log/newcam"
MAX_BACKUP_DAYS=7
MAX_LOG_DAYS=30
ALERT_EMAIL="admin@seu-dominio.com"
DOMAIN="seu-dominio.com"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Função para log
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" >> $LOG_PATH/maintenance.log
}

error() {
    echo -e "${RED}[ERRO] $1${NC}"
    echo "[ERRO] [$(date +'%Y-%m-%d %H:%M:%S')] $1" >> $LOG_PATH/maintenance.log
    send_alert "ERRO NewCAM" "$1"
}

warning() {
    echo -e "${YELLOW}[AVISO] $1${NC}"
    echo "[AVISO] [$(date +'%Y-%m-%d %H:%M:%S')] $1" >> $LOG_PATH/maintenance.log
}

# Função para enviar alertas
send_alert() {
    local subject="$1"
    local message="$2"
    
    if command -v mail &> /dev/null; then
        echo "$message" | mail -s "$subject" $ALERT_EMAIL
    fi
    
    # Log do alerta
    log "Alerta enviado: $subject - $message"
}

# Verificar se os serviços estão rodando
check_services() {
    log "Verificando status dos serviços..."
    
    cd $APP_PATH
    
    # Verificar containers Docker
    local containers=("newcam_postgres" "newcam_backend" "newcam_frontend" "newcam_zlmediakit" "newcam_nginx")
    
    for container in "${containers[@]}"; do
        if ! docker ps | grep -q $container; then
            error "Container $container não está rodando!"
            
            # Tentar reiniciar
            log "Tentando reiniciar $container..."
            docker-compose -f docker-compose.production.yml restart $container
            
            sleep 10
            
            if docker ps | grep -q $container; then
                log "Container $container reiniciado com sucesso"
            else
                error "Falha ao reiniciar container $container"
            fi
        else
            log "Container $container está rodando"
        fi
    done
}

# Verificar saúde da aplicação
check_health() {
    log "Verificando saúde da aplicação..."
    
    # Verificar frontend
    if ! curl -f -s "https://$DOMAIN/health" > /dev/null; then
        error "Frontend não está respondendo em https://$DOMAIN"
    else
        log "Frontend está saudável"
    fi
    
    # Verificar API
    if ! curl -f -s "https://api.$DOMAIN/health" > /dev/null; then
        error "API não está respondendo em https://api.$DOMAIN"
    else
        log "API está saudável"
    fi
    
    # Verificar ZLMediaKit
    if ! curl -f -s "http://localhost:8000/index/api/getServerConfig" > /dev/null; then
        error "ZLMediaKit não está respondendo"
    else
        log "ZLMediaKit está saudável"
    fi
}

# Verificar uso de disco
check_disk_usage() {
    log "Verificando uso de disco..."
    
    local disk_usage=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
    
    if [ $disk_usage -gt 85 ]; then
        error "Uso de disco alto: ${disk_usage}%"
    elif [ $disk_usage -gt 75 ]; then
        warning "Uso de disco moderado: ${disk_usage}%"
    else
        log "Uso de disco normal: ${disk_usage}%"
    fi
}

# Verificar uso de memória
check_memory_usage() {
    log "Verificando uso de memória..."
    
    local mem_usage=$(free | awk 'NR==2{printf "%.0f", $3*100/$2 }')
    
    if [ $mem_usage -gt 90 ]; then
        error "Uso de memória alto: ${mem_usage}%"
    elif [ $mem_usage -gt 80 ]; then
        warning "Uso de memória moderado: ${mem_usage}%"
    else
        log "Uso de memória normal: ${mem_usage}%"
    fi
}

# Fazer backup do banco de dados
backup_database() {
    log "Iniciando backup do banco de dados..."
    
    local backup_file="$BACKUP_PATH/db_backup_$(date +%Y%m%d_%H%M%S).sql"
    
    mkdir -p $BACKUP_PATH
    
    # Fazer backup usando docker
    if docker exec newcam_postgres pg_dump -U newcam_user newcam_prod > $backup_file; then
        log "Backup do banco criado: $backup_file"
        
        # Comprimir backup
        gzip $backup_file
        log "Backup comprimido: ${backup_file}.gz"
    else
        error "Falha ao criar backup do banco de dados"
    fi
}

# Fazer backup dos arquivos de configuração
backup_configs() {
    log "Fazendo backup das configurações..."
    
    local config_backup="$BACKUP_PATH/config_backup_$(date +%Y%m%d_%H%M%S).tar.gz"
    
    tar -czf $config_backup \
        $APP_PATH/.env.production \
        $APP_PATH/docker-compose.production.yml \
        $APP_PATH/docker/nginx/nginx.production.conf \
        $APP_PATH/docker/zlmediakit/config.ini \
        /etc/ssl/newcam/ 2>/dev/null || true
    
    if [ -f $config_backup ]; then
        log "Backup de configurações criado: $config_backup"
    else
        warning "Falha ao criar backup de configurações"
    fi
}

# Limpar backups antigos
cleanup_backups() {
    log "Limpando backups antigos..."
    
    find $BACKUP_PATH -name "*.sql.gz" -mtime +$MAX_BACKUP_DAYS -delete
    find $BACKUP_PATH -name "*.tar.gz" -mtime +$MAX_BACKUP_DAYS -delete
    
    log "Backups antigos removidos (mais de $MAX_BACKUP_DAYS dias)"
}

# Limpar logs antigos
cleanup_logs() {
    log "Limpando logs antigos..."
    
    find $LOG_PATH -name "*.log" -mtime +$MAX_LOG_DAYS -delete
    find /var/log/nginx -name "*.log" -mtime +$MAX_LOG_DAYS -delete
    
    # Rotacionar logs do Docker
    docker system prune -f --filter "until=720h" > /dev/null 2>&1 || true
    
    log "Logs antigos removidos (mais de $MAX_LOG_DAYS dias)"
}

# Otimizar banco de dados
optimize_database() {
    log "Otimizando banco de dados..."
    
    # Executar VACUUM e ANALYZE
    docker exec newcam_postgres psql -U newcam_user -d newcam_prod -c "VACUUM ANALYZE;" > /dev/null 2>&1
    
    log "Otimização do banco concluída"
}

# Verificar certificados SSL
check_ssl_certificates() {
    log "Verificando certificados SSL..."
    
    local cert_file="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
    
    if [ -f "$cert_file" ]; then
        local expiry_date=$(openssl x509 -enddate -noout -in "$cert_file" | cut -d= -f2)
        local expiry_timestamp=$(date -d "$expiry_date" +%s)
        local current_timestamp=$(date +%s)
        local days_until_expiry=$(( (expiry_timestamp - current_timestamp) / 86400 ))
        
        if [ $days_until_expiry -lt 7 ]; then
            error "Certificado SSL expira em $days_until_expiry dias!"
        elif [ $days_until_expiry -lt 30 ]; then
            warning "Certificado SSL expira em $days_until_expiry dias"
        else
            log "Certificado SSL válido por mais $days_until_expiry dias"
        fi
    else
        error "Certificado SSL não encontrado!"
    fi
}

# Atualizar sistema
update_system() {
    log "Verificando atualizações do sistema..."
    
    # Atualizar lista de pacotes
    apt-get update > /dev/null 2>&1
    
    # Verificar se há atualizações de segurança
    local security_updates=$(apt list --upgradable 2>/dev/null | grep -c security || echo "0")
    
    if [ $security_updates -gt 0 ]; then
        warning "$security_updates atualizações de segurança disponíveis"
        
        # Aplicar apenas atualizações de segurança
        unattended-upgrade -d > /dev/null 2>&1 || true
        
        log "Atualizações de segurança aplicadas"
    else
        log "Sistema atualizado"
    fi
}

# Gerar relatório de status
generate_status_report() {
    log "Gerando relatório de status..."
    
    local report_file="$LOG_PATH/status_report_$(date +%Y%m%d).txt"
    
    cat > $report_file << EOF
=== Relatório de Status NewCAM - $(date) ===

Serviços Docker:
$(docker-compose -f $APP_PATH/docker-compose.production.yml ps)

Uso de Recursos:
Disco: $(df -h / | awk 'NR==2 {print $5}')
Memória: $(free -h | awk 'NR==2{printf "%.1f%%", $3*100/$2}')
CPU: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)%

Conexões de Rede:
$(netstat -tuln | grep -E ':(80|443|554|1935|3000|3001|8000)' | wc -l) conexões ativas

Últimos Logs de Erro:
$(tail -20 $LOG_PATH/maintenance.log | grep ERROR || echo "Nenhum erro recente")

Espaço em Disco por Diretório:
$(du -sh $APP_PATH $BACKUP_PATH $LOG_PATH 2>/dev/null)

Processos com Maior Uso de CPU:
$(ps aux --sort=-%cpu | head -10)

Processos com Maior Uso de Memória:
$(ps aux --sort=-%mem | head -10)
EOF

    log "Relatório gerado: $report_file"
}

# Função principal
main() {
    log "=== Iniciando manutenção NewCAM ==="
    
    # Criar diretórios se não existirem
    mkdir -p $BACKUP_PATH $LOG_PATH
    
    # Executar verificações
    check_services
    check_health
    check_disk_usage
    check_memory_usage
    check_ssl_certificates
    
    # Fazer backups
    backup_database
    backup_configs
    
    # Limpeza
    cleanup_backups
    cleanup_logs
    
    # Otimizações
    optimize_database
    
    # Atualizações
    update_system
    
    # Relatório
    generate_status_report
    
    log "=== Manutenção concluída ==="
}

# Verificar se está sendo executado como root
if [ "$EUID" -ne 0 ]; then
    echo "Este script deve ser executado como root"
    exit 1
fi

# Executar função principal
main "$@"