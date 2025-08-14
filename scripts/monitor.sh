#!/bin/bash

# Configurações
LOG_FILE="/var/log/newcam/monitor.log"
ALERT_EMAIL="admin@example.com"
CHECK_INTERVAL=60
MAX_CPU_USAGE=80
MAX_MEMORY_USAGE=85
MAX_DISK_USAGE=90
MIN_FREE_SPACE_GB=5

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Função para logging
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] ✅ $1${NC}" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ❌ $1${NC}" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️ $1${NC}" | tee -a "$LOG_FILE"
}

log_info() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] ℹ️ $1${NC}" | tee -a "$LOG_FILE"
}

# Função para enviar alertas (placeholder)
send_alert() {
    local subject="$1"
    local message="$2"
    
    # Aqui você pode implementar notificações via email, Slack, etc.
    log_error "ALERTA: $subject - $message"
    
    # Exemplo de envio de email (descomente se configurado)
    # echo "$message" | mail -s "$subject" "$ALERT_EMAIL"
    
    # Exemplo de webhook Slack (descomente se configurado)
    # curl -X POST -H 'Content-type: application/json' \
    #   --data "{\"text\":\"$subject: $message\"}" \
    #   YOUR_SLACK_WEBHOOK_URL
}

# Função para verificar processos PM2
check_pm2_processes() {
    log_info "Verificando processos PM2..."
    
    if ! command -v pm2 >/dev/null 2>&1; then
        log_error "PM2 não encontrado"
        return 1
    fi
    
    local pm2_status=$(pm2 jlist 2>/dev/null)
    local processes_down=0
    
    # Verificar se há processos parados
    if echo "$pm2_status" | grep -q '"status":"stopped"'; then
        processes_down=$(echo "$pm2_status" | grep -c '"status":"stopped"')
        log_warning "$processes_down processo(s) PM2 parado(s)"
        
        # Tentar reiniciar processos parados
        log_info "Tentando reiniciar processos parados..."
        pm2 restart all 2>/dev/null
        sleep 5
        
        # Verificar novamente
        pm2_status=$(pm2 jlist 2>/dev/null)
        if echo "$pm2_status" | grep -q '"status":"stopped"'; then
            send_alert "NewCAM - Processos PM2 Falhou" "Falha ao reiniciar processos PM2"
            return 1
        else
            log_success "Processos PM2 reiniciados com sucesso"
        fi
    else
        log_success "Todos os processos PM2 estão rodando"
    fi
    
    return 0
}

# Função para verificar containers Docker
check_docker_containers() {
    log_info "Verificando containers Docker..."
    
    if ! command -v docker >/dev/null 2>&1; then
        log_error "Docker não encontrado"
        return 1
    fi
    
    local compose_file="/var/www/newcam/docker/docker-compose.yml"
    
    if [ ! -f "$compose_file" ]; then
        log_error "Arquivo docker-compose.yml não encontrado"
        return 1
    fi
    
    # Verificar status dos containers
    local containers_down=$(docker-compose -f "$compose_file" ps -q --filter "status=exited")
    
    if [ -n "$containers_down" ]; then
        log_warning "Containers Docker parados detectados"
        
        # Tentar reiniciar containers
        log_info "Tentando reiniciar containers..."
        docker-compose -f "$compose_file" up -d
        sleep 10
        
        # Verificar novamente
        containers_down=$(docker-compose -f "$compose_file" ps -q --filter "status=exited")
        if [ -n "$containers_down" ]; then
            send_alert "NewCAM - Containers Docker Falhou" "Falha ao reiniciar containers Docker"
            return 1
        else
            log_success "Containers Docker reiniciados com sucesso"
        fi
    else
        log_success "Todos os containers Docker estão rodando"
    fi
    
    return 0
}

# Função para verificar conectividade das aplicações
check_application_health() {
    log_info "Verificando saúde das aplicações..."
    
    local errors=0
    
    # Verificar Frontend (porta 5173)
    if curl -f -s http://localhost:5173 >/dev/null 2>&1; then
        log_success "Frontend respondendo (porta 5173)"
    else
        log_error "Frontend não está respondendo (porta 5173)"
        ((errors++))
    fi
    
    # Verificar Backend (porta 3002)
    if curl -f -s http://localhost:3002/api/health >/dev/null 2>&1; then
        log_success "Backend respondendo (porta 3002)"
    else
        log_error "Backend não está respondendo (porta 3002)"
        ((errors++))
    fi
    
    # Verificar Worker (porta 3003)
    if curl -f -s http://localhost:3003/health >/dev/null 2>&1; then
        log_success "Worker respondendo (porta 3003)"
    else
        log_error "Worker não está respondendo (porta 3003)"
        ((errors++))
    fi
    
    if [ $errors -gt 0 ]; then
        send_alert "NewCAM - Aplicações com Problemas" "$errors aplicação(ões) não estão respondendo"
        return 1
    fi
    
    return 0
}

# Função para verificar banco de dados
check_database() {
    log_info "Verificando banco de dados..."
    
    local compose_file="/var/www/newcam/docker/docker-compose.yml"
    
    if docker-compose -f "$compose_file" exec -T postgres pg_isready -U newcam_user >/dev/null 2>&1; then
        log_success "PostgreSQL está respondendo"
        
        # Verificar conexões ativas
        local connections=$(docker-compose -f "$compose_file" exec -T postgres psql -U newcam_user -d newcam_db -t -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';" 2>/dev/null | tr -d ' \n')
        
        if [ -n "$connections" ] && [ "$connections" -gt 0 ]; then
            log_info "Conexões ativas no banco: $connections"
        fi
        
        return 0
    else
        log_error "PostgreSQL não está respondendo"
        send_alert "NewCAM - Banco de Dados" "PostgreSQL não está respondendo"
        return 1
    fi
}

# Função para verificar Redis
check_redis() {
    log_info "Verificando Redis..."
    
    local compose_file="/var/www/newcam/docker/docker-compose.yml"
    
    if docker-compose -f "$compose_file" exec -T redis redis-cli ping >/dev/null 2>&1; then
        log_success "Redis está respondendo"
        
        # Verificar uso de memória do Redis
        local redis_memory=$(docker-compose -f "$compose_file" exec -T redis redis-cli info memory | grep used_memory_human | cut -d: -f2 | tr -d '\r')
        
        if [ -n "$redis_memory" ]; then
            log_info "Uso de memória Redis: $redis_memory"
        fi
        
        return 0
    else
        log_error "Redis não está respondendo"
        send_alert "NewCAM - Redis" "Redis não está respondendo"
        return 1
    fi
}

# Função para verificar uso de recursos do sistema
check_system_resources() {
    log_info "Verificando recursos do sistema..."
    
    # Verificar CPU
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    cpu_usage=${cpu_usage%.*}  # Remover decimais
    
    if [ "$cpu_usage" -gt "$MAX_CPU_USAGE" ]; then
        log_warning "Alto uso de CPU: ${cpu_usage}%"
        send_alert "NewCAM - Alto Uso de CPU" "Uso de CPU: ${cpu_usage}% (limite: ${MAX_CPU_USAGE}%)"
    else
        log_success "Uso de CPU normal: ${cpu_usage}%"
    fi
    
    # Verificar Memória
    local memory_info=$(free | grep Mem)
    local total_mem=$(echo $memory_info | awk '{print $2}')
    local used_mem=$(echo $memory_info | awk '{print $3}')
    local memory_usage=$((used_mem * 100 / total_mem))
    
    if [ "$memory_usage" -gt "$MAX_MEMORY_USAGE" ]; then
        log_warning "Alto uso de memória: ${memory_usage}%"
        send_alert "NewCAM - Alto Uso de Memória" "Uso de memória: ${memory_usage}% (limite: ${MAX_MEMORY_USAGE}%)"
    else
        log_success "Uso de memória normal: ${memory_usage}%"
    fi
    
    # Verificar Disco
    local disk_info=$(df / | tail -1)
    local disk_usage=$(echo $disk_info | awk '{print $5}' | sed 's/%//')
    local available_gb=$(echo $disk_info | awk '{print $4}')
    available_gb=$((available_gb / 1024 / 1024))
    
    if [ "$disk_usage" -gt "$MAX_DISK_USAGE" ]; then
        log_warning "Alto uso de disco: ${disk_usage}%"
        send_alert "NewCAM - Alto Uso de Disco" "Uso de disco: ${disk_usage}% (limite: ${MAX_DISK_USAGE}%)"
    elif [ "$available_gb" -lt "$MIN_FREE_SPACE_GB" ]; then
        log_warning "Pouco espaço livre: ${available_gb}GB"
        send_alert "NewCAM - Pouco Espaço em Disco" "Espaço livre: ${available_gb}GB (mínimo: ${MIN_FREE_SPACE_GB}GB)"
    else
        log_success "Uso de disco normal: ${disk_usage}% (${available_gb}GB livres)"
    fi
}

# Função para verificar logs de erro
check_error_logs() {
    log_info "Verificando logs de erro..."
    
    local error_count=0
    local log_dirs=("/var/log/newcam" "/var/www/newcam/backend/logs" "/var/www/newcam/worker/logs")
    
    for log_dir in "${log_dirs[@]}"; do
        if [ -d "$log_dir" ]; then
            # Procurar por erros nos últimos 5 minutos
            local recent_errors=$(find "$log_dir" -name "*.log" -type f -mmin -5 -exec grep -l -i "error\|exception\|fatal" {} \; 2>/dev/null | wc -l)
            
            if [ "$recent_errors" -gt 0 ]; then
                log_warning "$recent_errors arquivo(s) de log com erros recentes em $log_dir"
                ((error_count += recent_errors))
            fi
        fi
    done
    
    if [ $error_count -gt 0 ]; then
        log_warning "Total de $error_count arquivo(s) com erros recentes"
    else
        log_success "Nenhum erro recente encontrado nos logs"
    fi
}

# Função para verificar conectividade de rede
check_network_connectivity() {
    log_info "Verificando conectividade de rede..."
    
    # Verificar conectividade externa
    if ping -c 1 -W 5 8.8.8.8 >/dev/null 2>&1; then
        log_success "Conectividade externa OK"
    else
        log_error "Sem conectividade externa"
        send_alert "NewCAM - Conectividade" "Sem conectividade com a internet"
    fi
    
    # Verificar portas importantes
    local ports=(5173 3002 3003 5432 6379 1935 8080)
    local ports_down=0
    
    for port in "${ports[@]}"; do
        if netstat -tlnp 2>/dev/null | grep -q ":$port "; then
            log_success "Porta $port está aberta"
        else
            log_warning "Porta $port não está em uso"
            ((ports_down++))
        fi
    done
    
    if [ $ports_down -gt 2 ]; then
        send_alert "NewCAM - Portas" "$ports_down portas importantes não estão em uso"
    fi
}

# Função para gerar relatório de status
generate_status_report() {
    local report_file="/tmp/newcam_status_$(date +%Y%m%d_%H%M%S).txt"
    
    {
        echo "NewCAM System Status Report"
        echo "==========================="
        echo "Generated: $(date)"
        echo "Hostname: $(hostname)"
        echo ""
        
        echo "PM2 Processes:"
        pm2 status 2>/dev/null || echo "PM2 not available"
        echo ""
        
        echo "Docker Containers:"
        docker-compose -f /var/www/newcam/docker/docker-compose.yml ps 2>/dev/null || echo "Docker not available"
        echo ""
        
        echo "System Resources:"
        echo "CPU Usage: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}')"
        echo "Memory Usage:"
        free -h
        echo "Disk Usage:"
        df -h /
        echo ""
        
        echo "Network Ports:"
        netstat -tlnp | grep -E ':(5173|3002|3003|5432|6379|1935|8080)'
        echo ""
        
        echo "Recent Logs (last 10 lines):"
        tail -n 10 "$LOG_FILE" 2>/dev/null || echo "No monitor logs available"
        
    } > "$report_file"
    
    echo "$report_file"
}

# Função principal de monitoramento
run_monitoring_cycle() {
    log_info "Iniciando ciclo de monitoramento..."
    
    local checks_passed=0
    local total_checks=8
    
    # Executar todas as verificações
    check_pm2_processes && ((checks_passed++))
    check_docker_containers && ((checks_passed++))
    check_application_health && ((checks_passed++))
    check_database && ((checks_passed++))
    check_redis && ((checks_passed++))
    check_system_resources && ((checks_passed++))
    check_error_logs && ((checks_passed++))
    check_network_connectivity && ((checks_passed++))
    
    # Resumo do ciclo
    log_info "Ciclo de monitoramento concluído: $checks_passed/$total_checks verificações passaram"
    
    if [ $checks_passed -eq $total_checks ]; then
        log_success "Todos os sistemas estão funcionando normalmente"
    elif [ $checks_passed -ge $((total_checks * 3 / 4)) ]; then
        log_warning "Sistema funcionando com alguns problemas menores"
    else
        log_error "Sistema com problemas significativos"
        send_alert "NewCAM - Sistema Crítico" "Apenas $checks_passed/$total_checks verificações passaram"
    fi
}

# Função principal
main() {
    # Criar diretório de logs
    mkdir -p "/var/log/newcam"
    
    case "${1:-}" in
        --daemon)
            log_info "Iniciando monitor em modo daemon..."
            while true; do
                run_monitoring_cycle
                sleep $CHECK_INTERVAL
            done
            ;;
        --report)
            echo "Gerando relatório de status..."
            report_file=$(generate_status_report)
            echo "Relatório gerado: $report_file"
            cat "$report_file"
            ;;
        --pm2)
            check_pm2_processes
            ;;
        --docker)
            check_docker_containers
            ;;
        --health)
            check_application_health
            ;;
        --database)
            check_database
            ;;
        --redis)
            check_redis
            ;;
        --resources)
            check_system_resources
            ;;
        --logs)
            check_error_logs
            ;;
        --network)
            check_network_connectivity
            ;;
        --help|-h)
            echo "Uso: $0 [opção]"
            echo "Opções:"
            echo "  --daemon       Executar em modo daemon (monitoramento contínuo)"
            echo "  --report       Gerar relatório de status"
            echo "  --pm2          Verificar apenas processos PM2"
            echo "  --docker       Verificar apenas containers Docker"
            echo "  --health       Verificar apenas saúde das aplicações"
            echo "  --database     Verificar apenas banco de dados"
            echo "  --redis        Verificar apenas Redis"
            echo "  --resources    Verificar apenas recursos do sistema"
            echo "  --logs         Verificar apenas logs de erro"
            echo "  --network      Verificar apenas conectividade"
            echo "  --help, -h     Mostrar esta ajuda"
            echo ""
            echo "Sem argumentos: executa um ciclo completo de monitoramento"
            ;;
        "")
            run_monitoring_cycle
            ;;
        *)
            echo "Opção inválida: $1"
            echo "Use --help para ver as opções disponíveis"
            exit 1
            ;;
    esac
}

# Executar função principal
main "$@"