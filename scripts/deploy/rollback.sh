#!/bin/bash

set -e

# Configurações
BACKUP_DIR="/var/backups/newcam"
DEPLOY_DIR="/var/www/newcam"
LOG_FILE="/var/log/newcam/rollback_$(date +%Y%m%d_%H%M%S).log"

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

# Função para listar backups disponíveis
list_backups() {
    log_info "Backups disponíveis:"
    echo
    
    if [ ! -d "$BACKUP_DIR" ]; then
        log_error "Diretório de backup não encontrado: $BACKUP_DIR"
        return 1
    fi
    
    local backups=()
    local count=0
    
    # Procurar por backups completos
    while IFS= read -r -d '' backup; do
        backups+=("$backup")
        ((count++))
        local backup_name=$(basename "$backup")
        local backup_date=$(echo "$backup_name" | grep -o '[0-9]\{8\}_[0-9]\{6\}' || echo "unknown")
        local backup_size=$(du -sh "$backup" | awk '{print $1}')
        
        echo "$count) $backup_name"
        echo "   Data: $backup_date"
        echo "   Tamanho: $backup_size"
        echo "   Caminho: $backup"
        echo
    done < <(find "$BACKUP_DIR" -name "newcam_full_backup_*.tar.gz" -type f -print0 2>/dev/null | sort -z)
    
    if [ $count -eq 0 ]; then
        log_warning "Nenhum backup completo encontrado"
        
        # Procurar por backups individuais
        log_info "Procurando backups individuais..."
        
        local individual_backups=$(find "$BACKUP_DIR" -name "*.tar.gz" -o -name "*.sql.gz" -type f 2>/dev/null | wc -l)
        
        if [ "$individual_backups" -gt 0 ]; then
            log_info "Encontrados $individual_backups arquivo(s) de backup individual"
            find "$BACKUP_DIR" -name "*.tar.gz" -o -name "*.sql.gz" -type f 2>/dev/null | sort
        else
            log_error "Nenhum backup encontrado"
            return 1
        fi
    else
        echo "${backups[@]}"
    fi
    
    return 0
}

# Função para validar backup
validate_backup() {
    local backup_file="$1"
    
    log_info "Validando backup: $(basename "$backup_file")"
    
    # Verificar se o arquivo existe
    if [ ! -f "$backup_file" ]; then
        log_error "Arquivo de backup não encontrado: $backup_file"
        return 1
    fi
    
    # Verificar integridade do arquivo tar
    if tar -tzf "$backup_file" >/dev/null 2>&1; then
        log_success "Backup válido e íntegro"
    else
        log_error "Backup corrompido ou inválido"
        return 1
    fi
    
    # Listar conteúdo do backup
    log_info "Conteúdo do backup:"
    tar -tzf "$backup_file" | head -20
    
    local file_count=$(tar -tzf "$backup_file" | wc -l)
    log_info "Total de arquivos no backup: $file_count"
    
    return 0
}

# Função para parar serviços
stop_services() {
    log_info "Parando serviços..."
    
    # Parar PM2
    if command -v pm2 >/dev/null 2>&1; then
        log_info "Parando processos PM2..."
        pm2 stop all 2>/dev/null || log_warning "Erro ao parar processos PM2"
        pm2 delete all 2>/dev/null || log_warning "Erro ao deletar processos PM2"
        log_success "Processos PM2 parados"
    fi
    
    # Parar containers Docker
    local compose_file="$DEPLOY_DIR/docker/docker-compose.yml"
    if [ -f "$compose_file" ]; then
        log_info "Parando containers Docker..."
        docker-compose -f "$compose_file" down 2>/dev/null || log_warning "Erro ao parar containers Docker"
        log_success "Containers Docker parados"
    fi
    
    # Aguardar um pouco para garantir que tudo parou
    sleep 5
}

# Função para fazer backup do estado atual antes do rollback
backup_current_state() {
    log_info "Fazendo backup do estado atual antes do rollback..."
    
    local current_backup="$BACKUP_DIR/pre_rollback_$(date +%Y%m%d_%H%M%S).tar.gz"
    
    if [ -d "$DEPLOY_DIR" ]; then
        if tar -czf "$current_backup" -C "$DEPLOY_DIR" . 2>/dev/null; then
            log_success "Backup do estado atual criado: $current_backup"
            return 0
        else
            log_warning "Falha ao criar backup do estado atual"
            return 1
        fi
    else
        log_warning "Diretório de deploy não encontrado para backup"
        return 1
    fi
}

# Função para restaurar arquivos
restore_files() {
    local backup_file="$1"
    local temp_dir="/tmp/newcam_rollback_$(date +%Y%m%d_%H%M%S)"
    
    log_info "Restaurando arquivos do backup..."
    
    # Criar diretório temporário
    mkdir -p "$temp_dir"
    
    # Extrair backup
    log_info "Extraindo backup..."
    if tar -xzf "$backup_file" -C "$temp_dir" 2>/dev/null; then
        log_success "Backup extraído com sucesso"
    else
        log_error "Falha ao extrair backup"
        rm -rf "$temp_dir"
        return 1
    fi
    
    # Verificar estrutura do backup
    if [ -f "$temp_dir/files_"*".tar.gz" ]; then
        # Backup completo com arquivos separados
        log_info "Detectado backup completo, extraindo arquivos..."
        
        local files_backup=$(find "$temp_dir" -name "files_*.tar.gz" | head -1)
        if [ -n "$files_backup" ]; then
            # Remover diretório atual
            if [ -d "$DEPLOY_DIR" ]; then
                log_info "Removendo diretório atual..."
                rm -rf "$DEPLOY_DIR"
            fi
            
            # Criar diretório de deploy
            mkdir -p "$DEPLOY_DIR"
            
            # Extrair arquivos
            if tar -xzf "$files_backup" -C / 2>/dev/null; then
                log_success "Arquivos restaurados com sucesso"
            else
                log_error "Falha ao restaurar arquivos"
                rm -rf "$temp_dir"
                return 1
            fi
        fi
    else
        # Backup direto dos arquivos
        log_info "Detectado backup direto, copiando arquivos..."
        
        # Remover diretório atual
        if [ -d "$DEPLOY_DIR" ]; then
            log_info "Removendo diretório atual..."
            rm -rf "$DEPLOY_DIR"
        fi
        
        # Criar diretório de deploy
        mkdir -p "$DEPLOY_DIR"
        
        # Copiar arquivos
        if cp -r "$temp_dir"/* "$DEPLOY_DIR/" 2>/dev/null; then
            log_success "Arquivos copiados com sucesso"
        else
            log_error "Falha ao copiar arquivos"
            rm -rf "$temp_dir"
            return 1
        fi
    fi
    
    # Limpar diretório temporário
    rm -rf "$temp_dir"
    
    # Configurar permissões
    log_info "Configurando permissões..."
    chown -R www-data:www-data "$DEPLOY_DIR" 2>/dev/null || log_warning "Erro ao configurar permissões"
    chmod +x "$DEPLOY_DIR"/scripts/*.sh 2>/dev/null || log_warning "Erro ao tornar scripts executáveis"
    
    return 0
}

# Função para restaurar banco de dados
restore_database() {
    local backup_file="$1"
    local temp_dir="/tmp/newcam_db_rollback_$(date +%Y%m%d_%H%M%S)"
    
    log_info "Restaurando banco de dados..."
    
    # Criar diretório temporário
    mkdir -p "$temp_dir"
    
    # Extrair backup
    if tar -xzf "$backup_file" -C "$temp_dir" 2>/dev/null; then
        log_success "Backup extraído para restauração do banco"
    else
        log_error "Falha ao extrair backup para restauração do banco"
        rm -rf "$temp_dir"
        return 1
    fi
    
    # Procurar arquivo de backup do banco
    local db_backup=$(find "$temp_dir" -name "database_*.sql.gz" | head -1)
    
    if [ -z "$db_backup" ]; then
        log_warning "Backup do banco de dados não encontrado no arquivo"
        rm -rf "$temp_dir"
        return 1
    fi
    
    # Descomprimir backup do banco
    local sql_file="${db_backup%.gz}"
    gunzip "$db_backup" 2>/dev/null || {
        log_error "Falha ao descomprimir backup do banco"
        rm -rf "$temp_dir"
        return 1
    }
    
    # Verificar se PostgreSQL está rodando
    local compose_file="$DEPLOY_DIR/docker/docker-compose.yml"
    if [ ! -f "$compose_file" ]; then
        log_error "Arquivo docker-compose.yml não encontrado"
        rm -rf "$temp_dir"
        return 1
    fi
    
    # Iniciar PostgreSQL se não estiver rodando
    if ! docker-compose -f "$compose_file" exec -T postgres pg_isready -U newcam_user >/dev/null 2>&1; then
        log_info "Iniciando PostgreSQL..."
        docker-compose -f "$compose_file" up -d postgres
        
        # Aguardar PostgreSQL ficar pronto
        for i in {1..30}; do
            if docker-compose -f "$compose_file" exec -T postgres pg_isready -U newcam_user >/dev/null 2>&1; then
                break
            fi
            if [ $i -eq 30 ]; then
                log_error "PostgreSQL não ficou pronto"
                rm -rf "$temp_dir"
                return 1
            fi
            sleep 2
        done
    fi
    
    # Fazer backup do banco atual
    log_info "Fazendo backup do banco atual..."
    local current_db_backup="$BACKUP_DIR/pre_rollback_db_$(date +%Y%m%d_%H%M%S).sql"
    docker-compose -f "$compose_file" exec -T postgres pg_dump -U newcam_user -d newcam_db > "$current_db_backup" 2>/dev/null || log_warning "Falha ao fazer backup do banco atual"
    
    # Restaurar banco de dados
    log_info "Restaurando banco de dados..."
    if docker-compose -f "$compose_file" exec -T postgres psql -U newcam_user -d newcam_db < "$sql_file" >/dev/null 2>&1; then
        log_success "Banco de dados restaurado com sucesso"
    else
        log_error "Falha ao restaurar banco de dados"
        rm -rf "$temp_dir"
        return 1
    fi
    
    # Limpar
    rm -rf "$temp_dir"
    
    return 0
}

# Função para reinstalar dependências
reinstall_dependencies() {
    log_info "Reinstalando dependências..."
    
    cd "$DEPLOY_DIR"
    
    # Backend
    if [ -d "backend" ] && [ -f "backend/package.json" ]; then
        log_info "Instalando dependências do backend..."
        cd backend
        npm ci --production --silent || {
            log_error "Falha ao instalar dependências do backend"
            return 1
        }
        cd ..
        log_success "Dependências do backend instaladas"
    fi
    
    # Worker
    if [ -d "worker" ] && [ -f "worker/package.json" ]; then
        log_info "Instalando dependências do worker..."
        cd worker
        npm ci --production --silent || {
            log_error "Falha ao instalar dependências do worker"
            return 1
        }
        cd ..
        log_success "Dependências do worker instaladas"
    fi
    
    return 0
}

# Função para iniciar serviços
start_services() {
    log_info "Iniciando serviços..."
    
    cd "$DEPLOY_DIR"
    
    # Iniciar containers Docker
    if [ -f "docker/docker-compose.yml" ]; then
        log_info "Iniciando containers Docker..."
        cd docker
        docker-compose up -d || {
            log_error "Falha ao iniciar containers Docker"
            return 1
        }
        cd ..
        log_success "Containers Docker iniciados"
        
        # Aguardar containers ficarem prontos
        sleep 30
    fi
    
    # Iniciar aplicações com PM2
    if [ -f "ecosystem.config.js" ]; then
        log_info "Iniciando aplicações com PM2..."
        pm2 start ecosystem.config.js --env production || {
            log_error "Falha ao iniciar aplicações"
            return 1
        }
        log_success "Aplicações iniciadas"
        
        # Aguardar aplicações ficarem prontas
        sleep 15
    fi
    
    return 0
}

# Função para verificar saúde após rollback
verify_rollback() {
    log_info "Verificando saúde do sistema após rollback..."
    
    local checks_passed=0
    local total_checks=5
    
    # Verificar PM2
    if pm2 status >/dev/null 2>&1; then
        log_success "PM2 está funcionando"
        ((checks_passed++))
    else
        log_error "PM2 não está funcionando"
    fi
    
    # Verificar containers Docker
    if docker-compose -f "$DEPLOY_DIR/docker/docker-compose.yml" ps >/dev/null 2>&1; then
        log_success "Containers Docker estão funcionando"
        ((checks_passed++))
    else
        log_error "Containers Docker não estão funcionando"
    fi
    
    # Verificar aplicações
    sleep 10
    
    if curl -f -s http://localhost:5173 >/dev/null 2>&1; then
        log_success "Frontend está respondendo"
        ((checks_passed++))
    else
        log_error "Frontend não está respondendo"
    fi
    
    if curl -f -s http://localhost:3002/api/health >/dev/null 2>&1; then
        log_success "Backend está respondendo"
        ((checks_passed++))
    else
        log_error "Backend não está respondendo"
    fi
    
    if curl -f -s http://localhost:3003/health >/dev/null 2>&1; then
        log_success "Worker está respondendo"
        ((checks_passed++))
    else
        log_error "Worker não está respondendo"
    fi
    
    log_info "Verificação concluída: $checks_passed/$total_checks verificações passaram"
    
    if [ $checks_passed -ge $((total_checks * 3 / 4)) ]; then
        log_success "Rollback realizado com sucesso!"
        return 0
    else
        log_error "Rollback pode ter falhado. Verifique os logs."
        return 1
    fi
}

# Função principal de rollback
perform_rollback() {
    local backup_file="$1"
    local include_database="$2"
    
    log_info "Iniciando rollback..."
    log_info "Backup: $(basename "$backup_file")"
    log_info "Incluir banco de dados: $include_database"
    
    # Validar backup
    if ! validate_backup "$backup_file"; then
        log_error "Backup inválido. Abortando rollback."
        return 1
    fi
    
    # Fazer backup do estado atual
    backup_current_state || log_warning "Falha ao fazer backup do estado atual"
    
    # Parar serviços
    stop_services
    
    # Restaurar arquivos
    if ! restore_files "$backup_file"; then
        log_error "Falha ao restaurar arquivos. Abortando rollback."
        return 1
    fi
    
    # Restaurar banco de dados se solicitado
    if [ "$include_database" = "yes" ]; then
        if ! restore_database "$backup_file"; then
            log_warning "Falha ao restaurar banco de dados"
        fi
    fi
    
    # Reinstalar dependências
    if ! reinstall_dependencies; then
        log_warning "Falha ao reinstalar dependências"
    fi
    
    # Iniciar serviços
    if ! start_services; then
        log_error "Falha ao iniciar serviços após rollback"
        return 1
    fi
    
    # Verificar saúde
    if verify_rollback; then
        log_success "🎉 Rollback concluído com sucesso!"
        return 0
    else
        log_error "❌ Rollback pode ter falhado"
        return 1
    fi
}

# Função principal
main() {
    echo "🔄 NewCAM Rollback Tool"
    echo
    
    # Verificar se está rodando como root
    if [[ $EUID -ne 0 ]]; then
        log_error "Este script deve ser executado como root ou com sudo"
        exit 1
    fi
    
    # Criar diretório de logs
    mkdir -p "/var/log/newcam"
    
    case "${1:-}" in
        --list)
            list_backups
            ;;
        --auto)
            # Rollback automático para o backup mais recente
            log_info "Executando rollback automático..."
            
            local latest_backup=$(find "$BACKUP_DIR" -name "newcam_full_backup_*.tar.gz" -type f -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)
            
            if [ -z "$latest_backup" ]; then
                log_error "Nenhum backup encontrado para rollback automático"
                exit 1
            fi
            
            log_info "Backup mais recente: $(basename "$latest_backup")"
            
            # Perguntar sobre banco de dados
            read -p "Incluir rollback do banco de dados? (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                include_db="yes"
            else
                include_db="no"
            fi
            
            perform_rollback "$latest_backup" "$include_db"
            ;;
        --file)
            if [ -z "$2" ]; then
                log_error "Especifique o arquivo de backup"
                echo "Uso: $0 --file <caminho_do_backup>"
                exit 1
            fi
            
            local backup_file="$2"
            local include_db="${3:-no}"
            
            if [ "$include_db" != "yes" ] && [ "$include_db" != "no" ]; then
                # Perguntar sobre banco de dados
                read -p "Incluir rollback do banco de dados? (y/N): " -n 1 -r
                echo
                if [[ $REPLY =~ ^[Yy]$ ]]; then
                    include_db="yes"
                else
                    include_db="no"
                fi
            fi
            
            perform_rollback "$backup_file" "$include_db"
            ;;
        --interactive)
            # Modo interativo
            echo "Modo interativo de rollback"
            echo
            
            # Listar backups
            local backup_list
            backup_list=$(list_backups)
            
            if [ $? -ne 0 ]; then
                log_error "Nenhum backup disponível"
                exit 1
            fi
            
            # Selecionar backup
            echo "Selecione um backup:"
            read -p "Número do backup: " backup_number
            
            local selected_backup=$(echo "$backup_list" | sed -n "${backup_number}p")
            
            if [ -z "$selected_backup" ]; then
                log_error "Seleção inválida"
                exit 1
            fi
            
            log_info "Backup selecionado: $(basename "$selected_backup")"
            
            # Confirmar
            read -p "Confirma o rollback? (y/N): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                log_info "Rollback cancelado"
                exit 0
            fi
            
            # Perguntar sobre banco de dados
            read -p "Incluir rollback do banco de dados? (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                include_db="yes"
            else
                include_db="no"
            fi
            
            perform_rollback "$selected_backup" "$include_db"
            ;;
        --help|-h)
            echo "Uso: $0 [opção]"
            echo "Opções:"
            echo "  --list                    Listar backups disponíveis"
            echo "  --auto                    Rollback automático para o backup mais recente"
            echo "  --file <backup> [db]      Rollback de arquivo específico (db: yes/no)"
            echo "  --interactive             Modo interativo de seleção"
            echo "  --help, -h                Mostrar esta ajuda"
            echo ""
            echo "Exemplos:"
            echo "  $0 --list"
            echo "  $0 --auto"
            echo "  $0 --file /var/backups/newcam/backup.tar.gz yes"
            echo "  $0 --interactive"
            ;;
        "")
            # Modo padrão - interativo
            main --interactive
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