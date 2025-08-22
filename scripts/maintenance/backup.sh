#!/bin/bash

set -e

# Configurações
BACKUP_DIR="/var/backups/newcam"
DATE=$(date +%Y%m%d_%H%M%S)
LOG_FILE="/var/log/newcam/backup_$DATE.log"
RETENTION_DAYS=30
COMPRESSION_LEVEL=6

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

# Função para verificar espaço em disco
check_disk_space() {
    local required_space=$1
    local available_space=$(df "$BACKUP_DIR" | tail -1 | awk '{print $4}')
    
    if [ "$available_space" -lt "$required_space" ]; then
        log_error "Espaço insuficiente. Necessário: ${required_space}KB, Disponível: ${available_space}KB"
        return 1
    fi
    return 0
}

# Função para calcular tamanho estimado
estimate_backup_size() {
    local total_size=0
    
    # Tamanho da aplicação
    if [ -d "/var/www/newcam" ]; then
        local app_size=$(du -sk /var/www/newcam 2>/dev/null | awk '{print $1}' || echo 0)
        total_size=$((total_size + app_size))
    fi
    
    # Tamanho dos dados
    if [ -d "/var/newcam" ]; then
        local data_size=$(du -sk /var/newcam 2>/dev/null | awk '{print $1}' || echo 0)
        total_size=$((total_size + data_size))
    fi
    
    # Tamanho dos streams
    if [ -d "/var/www/streams" ]; then
        local streams_size=$(du -sk /var/www/streams 2>/dev/null | awk '{print $1}' || echo 0)
        total_size=$((total_size + streams_size))
    fi
    
    # Adicionar 50% para compressão e margem de segurança
    total_size=$((total_size * 3 / 2))
    
    echo $total_size
}

# Função para backup do banco de dados
backup_database() {
    log_info "Iniciando backup do banco de dados..."
    
    local db_backup_file="$BACKUP_DIR/database_$DATE.sql"
    
    # Verificar se PostgreSQL está rodando
    if ! docker-compose -f /var/www/newcam/docker/docker-compose.yml exec -T postgres pg_isready -U newcam_user >/dev/null 2>&1; then
        log_error "PostgreSQL não está acessível"
        return 1
    fi
    
    # Fazer backup do banco
    if docker-compose -f /var/www/newcam/docker/docker-compose.yml exec -T postgres pg_dump -U newcam_user -d newcam_db > "$db_backup_file" 2>/dev/null; then
        log_success "Backup do banco de dados criado: $db_backup_file"
        
        # Comprimir backup do banco
        gzip -$COMPRESSION_LEVEL "$db_backup_file"
        log_success "Backup do banco comprimido: ${db_backup_file}.gz"
        return 0
    else
        log_error "Falha ao criar backup do banco de dados"
        return 1
    fi
}

# Função para backup dos arquivos
backup_files() {
    log_info "Iniciando backup dos arquivos..."
    
    local files_backup="$BACKUP_DIR/files_$DATE.tar.gz"
    local temp_list="/tmp/newcam_backup_list_$DATE.txt"
    
    # Criar lista de arquivos para backup
    {
        echo "/var/www/newcam"
        echo "/var/newcam"
        echo "/var/www/streams"
        echo "/etc/newcam"
    } > "$temp_list"
    
    # Criar arquivo de exclusões
    local exclude_file="/tmp/newcam_backup_exclude_$DATE.txt"
    {
        echo "*/node_modules/*"
        echo "*/logs/*"
        echo "*/.git/*"
        echo "*/tmp/*"
        echo "*/cache/*"
        echo "*/.npm/*"
        echo "*/coverage/*"
        echo "*/dist/*"
        echo "*/build/*"
    } > "$exclude_file"
    
    # Criar backup dos arquivos
    if tar -czf "$files_backup" \
        --exclude-from="$exclude_file" \
        --files-from="$temp_list" \
        --ignore-failed-read \
        2>/dev/null; then
        log_success "Backup dos arquivos criado: $files_backup"
        
        # Limpar arquivos temporários
        rm -f "$temp_list" "$exclude_file"
        return 0
    else
        log_error "Falha ao criar backup dos arquivos"
        rm -f "$temp_list" "$exclude_file"
        return 1
    fi
}

# Função para backup da configuração do Docker
backup_docker_config() {
    log_info "Iniciando backup da configuração Docker..."
    
    local docker_backup="$BACKUP_DIR/docker_config_$DATE.tar.gz"
    
    if [ -d "/var/www/newcam/docker" ]; then
        if tar -czf "$docker_backup" -C /var/www/newcam docker/ 2>/dev/null; then
            log_success "Backup da configuração Docker criado: $docker_backup"
            return 0
        else
            log_error "Falha ao criar backup da configuração Docker"
            return 1
        fi
    else
        log_warning "Diretório de configuração Docker não encontrado"
        return 1
    fi
}

# Função para backup da configuração PM2
backup_pm2_config() {
    log_info "Iniciando backup da configuração PM2..."
    
    local pm2_backup="$BACKUP_DIR/pm2_config_$DATE.tar.gz"
    
    # Criar diretório temporário
    local temp_dir="/tmp/pm2_backup_$DATE"
    mkdir -p "$temp_dir"
    
    # Copiar configurações PM2
    if [ -f "/var/www/newcam/ecosystem.config.js" ]; then
        cp "/var/www/newcam/ecosystem.config.js" "$temp_dir/"
    fi
    
    # Salvar lista de processos PM2
    pm2 jlist > "$temp_dir/pm2_processes.json" 2>/dev/null || echo "[]" > "$temp_dir/pm2_processes.json"
    
    # Salvar configuração de startup
    pm2 startup dump > "$temp_dir/pm2_startup.sh" 2>/dev/null || echo "# No startup config" > "$temp_dir/pm2_startup.sh"
    
    # Criar arquivo tar
    if tar -czf "$pm2_backup" -C "$temp_dir" . 2>/dev/null; then
        log_success "Backup da configuração PM2 criado: $pm2_backup"
        rm -rf "$temp_dir"
        return 0
    else
        log_error "Falha ao criar backup da configuração PM2"
        rm -rf "$temp_dir"
        return 1
    fi
}

# Função para criar backup completo
create_full_backup() {
    log_info "Criando backup completo..."
    
    local full_backup="$BACKUP_DIR/newcam_full_backup_$DATE.tar.gz"
    local temp_dir="/tmp/newcam_full_backup_$DATE"
    
    mkdir -p "$temp_dir"
    
    # Copiar todos os backups individuais
    cp "$BACKUP_DIR"/database_$DATE.sql.gz "$temp_dir/" 2>/dev/null || log_warning "Backup do banco não encontrado"
    cp "$BACKUP_DIR"/files_$DATE.tar.gz "$temp_dir/" 2>/dev/null || log_warning "Backup dos arquivos não encontrado"
    cp "$BACKUP_DIR"/docker_config_$DATE.tar.gz "$temp_dir/" 2>/dev/null || log_warning "Backup do Docker não encontrado"
    cp "$BACKUP_DIR"/pm2_config_$DATE.tar.gz "$temp_dir/" 2>/dev/null || log_warning "Backup do PM2 não encontrado"
    
    # Criar arquivo de informações do sistema
    {
        echo "NewCAM Backup Information"
        echo "========================"
        echo "Date: $(date)"
        echo "Hostname: $(hostname)"
        echo "OS: $(uname -a)"
        echo "Docker Version: $(docker --version 2>/dev/null || echo 'Not available')"
        echo "Node Version: $(node --version 2>/dev/null || echo 'Not available')"
        echo "PM2 Version: $(pm2 --version 2>/dev/null || echo 'Not available')"
        echo ""
        echo "Backup Contents:"
        ls -la "$temp_dir"
    } > "$temp_dir/backup_info.txt"
    
    # Criar backup completo
    if tar -czf "$full_backup" -C "$temp_dir" . 2>/dev/null; then
        log_success "Backup completo criado: $full_backup"
        
        # Calcular tamanho do backup
        local backup_size=$(du -sh "$full_backup" | awk '{print $1}')
        log_info "Tamanho do backup completo: $backup_size"
        
        rm -rf "$temp_dir"
        return 0
    else
        log_error "Falha ao criar backup completo"
        rm -rf "$temp_dir"
        return 1
    fi
}

# Função para limpar backups antigos
cleanup_old_backups() {
    log_info "Limpando backups antigos (>$RETENTION_DAYS dias)..."
    
    local deleted_count=0
    
    # Encontrar e deletar backups antigos
    while IFS= read -r -d '' file; do
        rm -f "$file"
        ((deleted_count++))
        log_info "Removido: $(basename "$file")"
    done < <(find "$BACKUP_DIR" -name "*.tar.gz" -o -name "*.sql.gz" -type f -mtime +$RETENTION_DAYS -print0 2>/dev/null)
    
    if [ $deleted_count -gt 0 ]; then
        log_success "$deleted_count backups antigos removidos"
    else
        log_info "Nenhum backup antigo para remover"
    fi
}

# Função principal
main() {
    echo "🗄️ Iniciando backup do NewCAM..."
    
    # Verificar se está rodando como root
    if [[ $EUID -ne 0 ]]; then
        log_error "Este script deve ser executado como root ou com sudo"
        exit 1
    fi
    
    # Criar diretórios necessários
    mkdir -p "$BACKUP_DIR"
    mkdir -p "/var/log/newcam"
    
    log_info "Iniciando backup do NewCAM em $DATE"
    
    # Estimar tamanho necessário
    local estimated_size=$(estimate_backup_size)
    log_info "Tamanho estimado do backup: $((estimated_size / 1024))MB"
    
    # Verificar espaço em disco
    if ! check_disk_space $estimated_size; then
        log_error "Espaço insuficiente para backup"
        exit 1
    fi
    
    local success_count=0
    local total_operations=4
    
    # Executar backups
    if backup_database; then
        ((success_count++))
    fi
    
    if backup_files; then
        ((success_count++))
    fi
    
    if backup_docker_config; then
        ((success_count++))
    fi
    
    if backup_pm2_config; then
        ((success_count++))
    fi
    
    # Criar backup completo se pelo menos um backup individual foi bem-sucedido
    if [ $success_count -gt 0 ]; then
        if create_full_backup; then
            ((success_count++))
        fi
    fi
    
    # Limpar backups antigos
    cleanup_old_backups
    
    # Resumo final
    log_info "Backup concluído: $success_count/$total_operations operações bem-sucedidas"
    
    if [ $success_count -eq $total_operations ]; then
        log_success "🎉 Backup completo realizado com sucesso!"
        log_info "📁 Localização: $BACKUP_DIR"
        log_info "📝 Log: $LOG_FILE"
        exit 0
    else
        log_warning "⚠️ Backup parcial realizado ($success_count/$total_operations)"
        log_info "📁 Localização: $BACKUP_DIR"
        log_info "📝 Log: $LOG_FILE"
        exit 1
    fi
}

# Verificar argumentos
case "${1:-}" in
    --database-only)
        mkdir -p "$BACKUP_DIR" "/var/log/newcam"
        log_info "Executando backup apenas do banco de dados"
        backup_database
        ;;
    --files-only)
        mkdir -p "$BACKUP_DIR" "/var/log/newcam"
        log_info "Executando backup apenas dos arquivos"
        backup_files
        ;;
    --config-only)
        mkdir -p "$BACKUP_DIR" "/var/log/newcam"
        log_info "Executando backup apenas das configurações"
        backup_docker_config
        backup_pm2_config
        ;;
    --cleanup)
        mkdir -p "$BACKUP_DIR" "/var/log/newcam"
        log_info "Executando limpeza de backups antigos"
        cleanup_old_backups
        ;;
    --help|-h)
        echo "Uso: $0 [opção]"
        echo "Opções:"
        echo "  --database-only    Backup apenas do banco de dados"
        echo "  --files-only       Backup apenas dos arquivos"
        echo "  --config-only      Backup apenas das configurações"
        echo "  --cleanup          Limpar backups antigos"
        echo "  --help, -h         Mostrar esta ajuda"
        echo ""
        echo "Sem argumentos: executa backup completo"
        ;;
    "")
        main
        ;;
    *)
        echo "Opção inválida: $1"
        echo "Use --help para ver as opções disponíveis"
        exit 1
        ;;
esac