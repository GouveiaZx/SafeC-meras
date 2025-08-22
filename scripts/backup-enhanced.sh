#!/bin/bash

# =========================================================
# SCRIPT DE BACKUP APRIMORADO - SISTEMA NEWCAM
# =========================================================
# Backup automatizado com rotação, compressão e verificação
# Crontab: 0 2 * * * /var/www/newcam/scripts/backup-enhanced.sh

set -e

# =========================================================
# CONFIGURAÇÕES
# =========================================================
BACKUP_BASE_DIR="/var/backups/newcam"
APP_DIR="/var/www/newcam"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$BACKUP_BASE_DIR/$TIMESTAMP"
RETENTION_DAYS=30
COMPRESSION_LEVEL=6
LOG_FILE="/var/log/newcam/backup.log"

# S3 Configuration (opcional)
S3_BACKUP_ENABLED=${S3_BACKUP_ENABLED:-false}
S3_BUCKET=${S3_BUCKET:-""}
S3_PREFIX="newcam-backups"

# Email configuration
ALERT_EMAIL=${ALERT_EMAIL:-"admin@safecameras.com.br"}

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# =========================================================
# FUNÇÕES AUXILIARES
# =========================================================

log_message() {
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

send_alert() {
    local subject="$1"
    local message="$2"
    
    log_error "ALERT: $subject - $message"
    
    # Send email if configured
    if command -v mail &> /dev/null && [[ -n "$ALERT_EMAIL" ]]; then
        echo "$message" | mail -s "NewCAM Backup Alert - $subject" "$ALERT_EMAIL"
    fi
}

check_disk_space() {
    local required_gb="$1"
    local available_kb=$(df "$BACKUP_BASE_DIR" | tail -1 | awk '{print $4}')
    local available_gb=$((available_kb / 1024 / 1024))
    
    if [[ $available_gb -lt $required_gb ]]; then
        log_error "Espaço insuficiente. Necessário: ${required_gb}GB, Disponível: ${available_gb}GB"
        return 1
    fi
    
    log_info "Espaço disponível: ${available_gb}GB"
    return 0
}

estimate_backup_size() {
    local total_size=0
    
    # Application files
    if [[ -d "$APP_DIR" ]]; then
        local app_size=$(du -sk "$APP_DIR" --exclude="node_modules" --exclude="storage/recordings" --exclude="logs" 2>/dev/null | awk '{print $1}' || echo 0)
        total_size=$((total_size + app_size))
    fi
    
    # Convert to GB and add 50% margin
    total_size=$((total_size * 3 / 2 / 1024 / 1024))
    
    echo $total_size
}

# =========================================================
# FUNÇÕES DE BACKUP
# =========================================================

backup_application_files() {
    log_info "Iniciando backup dos arquivos da aplicação..."
    
    local app_backup="$BACKUP_DIR/application_$TIMESTAMP.tar.gz"
    local temp_list="/tmp/newcam_app_backup_list_$TIMESTAMP.txt"
    local exclude_file="/tmp/newcam_app_exclude_$TIMESTAMP.txt"
    
    # Create list of files to backup
    {
        echo "$APP_DIR/backend/src"
        echo "$APP_DIR/frontend/dist"
        echo "$APP_DIR/worker/src"
        echo "$APP_DIR/ecosystem.config.js"
        echo "$APP_DIR/nginx.production.conf"
        echo "$APP_DIR/.env.production.unified"
        echo "$APP_DIR/package.json"
        echo "$APP_DIR/scripts"
        echo "$APP_DIR/docs"
    } > "$temp_list"
    
    # Create exclude list
    {
        echo "*/node_modules/*"
        echo "*/logs/*"
        echo "*/.git/*"
        echo "*/tmp/*"
        echo "*/cache/*"
        echo "*/.npm/*"
        echo "*/coverage/*"
        echo "*/storage/recordings/*"
        echo "*/storage/temp/*"
    } > "$exclude_file"
    
    # Create backup
    if tar -czf "$app_backup" \
        --exclude-from="$exclude_file" \
        --files-from="$temp_list" \
        --ignore-failed-read \
        2>/dev/null; then
        
        local backup_size=$(du -sh "$app_backup" | awk '{print $1}')
        log_success "Backup da aplicação criado: $app_backup ($backup_size)"
        
        # Cleanup temp files
        rm -f "$temp_list" "$exclude_file"
        return 0
    else
        log_error "Falha ao criar backup da aplicação"
        rm -f "$temp_list" "$exclude_file"
        return 1
    fi
}

backup_configuration() {
    log_info "Iniciando backup das configurações..."
    
    local config_backup="$BACKUP_DIR/configuration_$TIMESTAMP.tar.gz"
    local temp_dir="/tmp/newcam_config_backup_$TIMESTAMP"
    
    mkdir -p "$temp_dir"
    
    # Copy environment files
    find "$APP_DIR" -name ".env*" -not -path "*/node_modules/*" -exec cp {} "$temp_dir/" \; 2>/dev/null || true
    
    # Copy docker configuration
    if [[ -f "$APP_DIR/docker-compose.yml" ]]; then
        cp "$APP_DIR/docker-compose.yml" "$temp_dir/"
    fi
    
    # Copy nginx configuration
    if [[ -f "$APP_DIR/nginx.production.conf" ]]; then
        cp "$APP_DIR/nginx.production.conf" "$temp_dir/"
    fi
    
    # Copy ecosystem configuration
    if [[ -f "$APP_DIR/ecosystem.config.js" ]]; then
        cp "$APP_DIR/ecosystem.config.js" "$temp_dir/"
    fi
    
    # Save PM2 configuration
    if command -v pm2 &> /dev/null; then
        pm2 save 2>/dev/null || true
        pm2 dump > "$temp_dir/pm2_processes.json" 2>/dev/null || echo "[]" > "$temp_dir/pm2_processes.json"
    fi
    
    # Save system information
    {
        echo "NewCAM Configuration Backup"
        echo "=========================="
        echo "Date: $(date)"
        echo "Hostname: $(hostname)"
        echo "OS: $(uname -a)"
        echo "Node Version: $(node --version 2>/dev/null || echo 'Not available')"
        echo "PM2 Version: $(pm2 --version 2>/dev/null || echo 'Not available')"
        echo "Docker Version: $(docker --version 2>/dev/null || echo 'Not available')"
        echo ""
        echo "Environment Variables (masked):"
        env | grep -E '^(NODE_ENV|PORT|LOG_LEVEL)=' || true
        echo ""
        echo "Network Configuration:"
        ip addr show 2>/dev/null | grep -A2 "inet " | head -10 || true
    } > "$temp_dir/system_info.txt"
    
    # Create tar
    if tar -czf "$config_backup" -C "$temp_dir" . 2>/dev/null; then
        local backup_size=$(du -sh "$config_backup" | awk '{print $1}')
        log_success "Backup de configuração criado: $config_backup ($backup_size)"
        rm -rf "$temp_dir"
        return 0
    else
        log_error "Falha ao criar backup de configuração"
        rm -rf "$temp_dir"
        return 1
    fi
}

backup_database() {
    log_info "Iniciando backup do banco de dados..."
    
    local db_backup="$BACKUP_DIR/database_$TIMESTAMP.sql"
    
    # Check if using Supabase (external) or local PostgreSQL
    if [[ -n "${SUPABASE_URL:-}" ]]; then
        log_info "Usando Supabase - criando backup de metadados..."
        
        # Create a metadata backup for Supabase
        local metadata_file="$BACKUP_DIR/supabase_metadata_$TIMESTAMP.json"
        
        {
            echo "{"
            echo "  \"backup_type\": \"supabase_metadata\","
            echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
            echo "  \"supabase_url\": \"${SUPABASE_URL}\","
            echo "  \"tables\": ["
            echo "    \"cameras\","
            echo "    \"recordings\","
            echo "    \"users\","
            echo "    \"system_metrics\""
            echo "  ]"
            echo "}"
        } > "$metadata_file"
        
        log_success "Backup de metadados Supabase criado: $metadata_file"
        return 0
        
    elif docker ps --format "table {{.Names}}" | grep -q "postgres"; then
        log_info "Detectado PostgreSQL local via Docker..."
        
        # Try Docker PostgreSQL backup
        if docker exec $(docker ps -qf "name=postgres") pg_dump -U newcam_user -d newcam_db > "$db_backup" 2>/dev/null; then
            gzip -$COMPRESSION_LEVEL "$db_backup"
            log_success "Backup do banco de dados criado: ${db_backup}.gz"
            return 0
        else
            log_warning "Falha no backup do PostgreSQL via Docker"
            return 1
        fi
    else
        log_info "Banco de dados externo ou não local - pulando backup"
        return 0
    fi
}

backup_logs() {
    log_info "Iniciando backup dos logs..."
    
    local logs_backup="$BACKUP_DIR/logs_$TIMESTAMP.tar.gz"
    local temp_dir="/tmp/newcam_logs_backup_$TIMESTAMP"
    
    mkdir -p "$temp_dir"
    
    # Copy application logs (last 7 days only)
    local log_dirs=("/var/log/newcam" "$APP_DIR/backend/logs" "$APP_DIR/worker/logs")
    
    for log_dir in "${log_dirs[@]}"; do
        if [[ -d "$log_dir" ]]; then
            local dest_dir="$temp_dir/$(basename "$log_dir")"
            mkdir -p "$dest_dir"
            
            # Copy recent log files
            find "$log_dir" -name "*.log" -mtime -7 -exec cp {} "$dest_dir/" \; 2>/dev/null || true
        fi
    done
    
    # Copy nginx logs (if accessible)
    if [[ -d "/var/log/nginx" ]]; then
        mkdir -p "$temp_dir/nginx"
        find "/var/log/nginx" -name "*newcam*" -mtime -7 -exec cp {} "$temp_dir/nginx/" \; 2>/dev/null || true
    fi
    
    # Create tar if there are files
    if [[ -n "$(find "$temp_dir" -type f 2>/dev/null)" ]]; then
        if tar -czf "$logs_backup" -C "$temp_dir" . 2>/dev/null; then
            local backup_size=$(du -sh "$logs_backup" | awk '{print $1}')
            log_success "Backup de logs criado: $logs_backup ($backup_size)"
            rm -rf "$temp_dir"
            return 0
        else
            log_error "Falha ao criar backup de logs"
            rm -rf "$temp_dir"
            return 1
        fi
    else
        log_info "Nenhum log recente encontrado para backup"
        rm -rf "$temp_dir"
        return 0
    fi
}

create_backup_manifest() {
    log_info "Criando manifesto do backup..."
    
    local manifest_file="$BACKUP_DIR/backup_manifest.json"
    
    {
        echo "{"
        echo "  \"backup_info\": {"
        echo "    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
        echo "    \"hostname\": \"$(hostname)\","
        echo "    \"version\": \"1.0\","
        echo "    \"type\": \"full_backup\""
        echo "  },"
        echo "  \"system_info\": {"
        echo "    \"os\": \"$(uname -o 2>/dev/null || uname -s)\","
        echo "    \"kernel\": \"$(uname -r)\","
        echo "    \"architecture\": \"$(uname -m)\","
        echo "    \"node_version\": \"$(node --version 2>/dev/null || echo 'N/A')\","
        echo "    \"docker_version\": \"$(docker --version 2>/dev/null | cut -d' ' -f3 | cut -d',' -f1 || echo 'N/A')\""
        echo "  },"
        echo "  \"backup_files\": ["
        
        local first=true
        for file in "$BACKUP_DIR"/*.tar.gz "$BACKUP_DIR"/*.sql.gz "$BACKUP_DIR"/*.json; do
            if [[ -f "$file" ]]; then
                [[ "$first" = true ]] && first=false || echo ","
                local filename=$(basename "$file")
                local size=$(du -sh "$file" | awk '{print $1}')
                local checksum=$(sha256sum "$file" | awk '{print $1}')
                echo "    {"
                echo "      \"filename\": \"$filename\","
                echo "      \"size\": \"$size\","
                echo "      \"checksum\": \"$checksum\""
                echo -n "    }"
            fi
        done
        echo ""
        echo "  ]"
        echo "}"
    } > "$manifest_file"
    
    log_success "Manifesto criado: $manifest_file"
}

# =========================================================
# FUNÇÕES DE UPLOAD E ROTAÇÃO
# =========================================================

upload_to_s3() {
    if [[ "$S3_BACKUP_ENABLED" != "true" ]] || [[ -z "$S3_BUCKET" ]]; then
        log_info "Upload S3 desabilitado ou não configurado"
        return 0
    fi
    
    log_info "Iniciando upload para S3..."
    
    if ! command -v aws &> /dev/null; then
        log_warning "AWS CLI não encontrado - pulando upload S3"
        return 1
    fi
    
    local backup_archive="$BACKUP_BASE_DIR/newcam_backup_$TIMESTAMP.tar.gz"
    
    # Create consolidated backup archive
    if tar -czf "$backup_archive" -C "$BACKUP_DIR" . 2>/dev/null; then
        # Upload to S3
        if aws s3 cp "$backup_archive" "s3://$S3_BUCKET/$S3_PREFIX/" 2>/dev/null; then
            log_success "Backup enviado para S3: s3://$S3_BUCKET/$S3_PREFIX/$(basename "$backup_archive")"
            rm -f "$backup_archive"
            return 0
        else
            log_error "Falha no upload para S3"
            rm -f "$backup_archive"
            return 1
        fi
    else
        log_error "Falha ao criar arquivo consolidado para S3"
        return 1
    fi
}

cleanup_old_backups() {
    log_info "Limpando backups antigos (>$RETENTION_DAYS dias)..."
    
    local deleted_count=0
    
    # Find and delete old backup directories
    while IFS= read -r -d '' dir; do
        if [[ -d "$dir" ]]; then
            rm -rf "$dir"
            ((deleted_count++))
            log_info "Removido: $(basename "$dir")"
        fi
    done < <(find "$BACKUP_BASE_DIR" -maxdepth 1 -type d -mtime +$RETENTION_DAYS -print0 2>/dev/null)
    
    if [[ $deleted_count -gt 0 ]]; then
        log_success "$deleted_count backups antigos removidos"
    else
        log_info "Nenhum backup antigo para remover"
    fi
    
    # Cleanup S3 old backups if enabled
    if [[ "$S3_BACKUP_ENABLED" == "true" ]] && [[ -n "$S3_BUCKET" ]] && command -v aws &> /dev/null; then
        local cutoff_date=$(date -d "$RETENTION_DAYS days ago" +%Y-%m-%d)
        aws s3 ls "s3://$S3_BUCKET/$S3_PREFIX/" | while read -r line; do
            local file_date=$(echo "$line" | awk '{print $1}')
            local file_name=$(echo "$line" | awk '{print $4}')
            
            if [[ "$file_date" < "$cutoff_date" ]] && [[ -n "$file_name" ]]; then
                aws s3 rm "s3://$S3_BUCKET/$S3_PREFIX/$file_name"
                log_info "Removido do S3: $file_name"
            fi
        done 2>/dev/null || true
    fi
}

# =========================================================
# FUNÇÃO PRINCIPAL
# =========================================================

main() {
    log_info "🗄️ Iniciando backup do NewCAM ($TIMESTAMP)..."
    
    # Create directories
    mkdir -p "$BACKUP_DIR"
    mkdir -p "$(dirname "$LOG_FILE")"
    
    # Check available disk space
    local estimated_size=$(estimate_backup_size)
    log_info "Tamanho estimado do backup: ${estimated_size}GB"
    
    if ! check_disk_space $((estimated_size + 1)); then
        send_alert "Backup Failed" "Espaço em disco insuficiente"
        exit 1
    fi
    
    local success_count=0
    local total_operations=4
    
    # Execute backup operations
    if backup_application_files; then
        ((success_count++))
    fi
    
    if backup_configuration; then
        ((success_count++))
    fi
    
    if backup_database; then
        ((success_count++))
    fi
    
    if backup_logs; then
        ((success_count++))
    fi
    
    # Create manifest
    create_backup_manifest
    
    # Calculate total backup size
    local total_size=$(du -sh "$BACKUP_DIR" | awk '{print $1}')
    log_info "Tamanho total do backup: $total_size"
    
    # Upload to S3 if enabled
    upload_to_s3
    
    # Cleanup old backups
    cleanup_old_backups
    
    # Final summary
    log_info "Backup concluído: $success_count/$total_operations operações bem-sucedidas"
    
    if [[ $success_count -eq $total_operations ]]; then
        log_success "🎉 Backup completo realizado com sucesso!"
        log_info "📁 Localização: $BACKUP_DIR"
        log_info "📊 Tamanho: $total_size"
        log_info "📝 Log: $LOG_FILE"
        exit 0
    else
        log_warning "⚠️ Backup parcial realizado ($success_count/$total_operations)"
        send_alert "Backup Partial" "Apenas $success_count de $total_operations operações foram bem-sucedidas"
        exit 1
    fi
}

# =========================================================
# EXECUÇÃO
# =========================================================

case "${1:-}" in
    --help|-h)
        echo "Uso: $0 [opção]"
        echo "Opções:"
        echo "  --app-only     Backup apenas da aplicação"
        echo "  --config-only  Backup apenas das configurações"
        echo "  --db-only      Backup apenas do banco de dados"
        echo "  --logs-only    Backup apenas dos logs"
        echo "  --cleanup      Apenas limpeza de backups antigos"
        echo "  --help, -h     Mostrar esta ajuda"
        echo ""
        echo "Sem argumentos: executa backup completo"
        ;;
    --app-only)
        mkdir -p "$BACKUP_DIR" "$(dirname "$LOG_FILE")"
        backup_application_files
        ;;
    --config-only)
        mkdir -p "$BACKUP_DIR" "$(dirname "$LOG_FILE")"
        backup_configuration
        ;;
    --db-only)
        mkdir -p "$BACKUP_DIR" "$(dirname "$LOG_FILE")"
        backup_database
        ;;
    --logs-only)
        mkdir -p "$BACKUP_DIR" "$(dirname "$LOG_FILE")"
        backup_logs
        ;;
    --cleanup)
        mkdir -p "$(dirname "$LOG_FILE")"
        cleanup_old_backups
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