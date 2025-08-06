# Script para reiniciar o ZLMediaKit Docker com as correções aplicadas
# Autor: Sistema NewCAM

Write-Host "[RESTART] Iniciando reinicializacao do ZLMediaKit Docker..." -ForegroundColor Cyan

# Verificar se o Docker está rodando
Write-Host "[CHECK] Verificando status do Docker..." -ForegroundColor Yellow
try {
    docker --version | Out-Null
    Write-Host "[CHECK] Docker esta disponivel" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Docker nao esta disponivel ou nao esta rodando" -ForegroundColor Red
    exit 1
}

# Verificar se o docker-compose.yml existe
if (-not (Test-Path "docker-compose.yml")) {
    Write-Host "[ERROR] Arquivo docker-compose.yml nao encontrado" -ForegroundColor Red
    exit 1
}

# Parar o container do ZLMediaKit
Write-Host "[STOP] Parando container ZLMediaKit..." -ForegroundColor Yellow
docker-compose stop zlmediakit

if ($LASTEXITCODE -eq 0) {
    Write-Host "[STOP] Container ZLMediaKit parado com sucesso" -ForegroundColor Green
} else {
    Write-Host "[WARN] Falha ao parar container (pode ja estar parado)" -ForegroundColor Yellow
}

# Remover o container para garantir que as configurações sejam recarregadas
Write-Host "[REMOVE] Removendo container ZLMediaKit..." -ForegroundColor Yellow
docker-compose rm -f zlmediakit

if ($LASTEXITCODE -eq 0) {
    Write-Host "[REMOVE] Container ZLMediaKit removido com sucesso" -ForegroundColor Green
} else {
    Write-Host "[WARN] Falha ao remover container (pode nao existir)" -ForegroundColor Yellow
}

# Aguardar um momento
Write-Host "[WAIT] Aguardando 3 segundos..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Recriar e iniciar o container
Write-Host "[START] Recriando e iniciando container ZLMediaKit..." -ForegroundColor Yellow
docker-compose up -d zlmediakit

if ($LASTEXITCODE -eq 0) {
    Write-Host "[START] Container ZLMediaKit iniciado com sucesso" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Falha ao iniciar container ZLMediaKit" -ForegroundColor Red
    exit 1
}

# Aguardar o container inicializar
Write-Host "[WAIT] Aguardando inicializacao (10 segundos)..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Verificar se o container está rodando
Write-Host "[CHECK] Verificando status do container..." -ForegroundColor Yellow
$containerInfo = docker ps --filter "name=newcam_zlmediakit" --format "table {{.Status}}"

if ($containerInfo -like "*Up*") {
    Write-Host "[CHECK] Container ZLMediaKit esta rodando" -ForegroundColor Green
    
    # Verificar se a API está respondendo
    Write-Host "[API] Testando API do ZLMediaKit..." -ForegroundColor Yellow
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:8000/index/api/getServerConfig" -Method GET -TimeoutSec 5
        Write-Host "[API] API do ZLMediaKit esta respondendo" -ForegroundColor Green
        
        # Mostrar algumas configurações importantes
        Write-Host "[CONFIG] Configuracoes aplicadas:" -ForegroundColor Cyan
        Write-Host "   - enable_mp4: Habilitado" -ForegroundColor White
        Write-Host "   - fileSecond: 1800s" -ForegroundColor White
        Write-Host "   - fileBufSize: 131072 bytes" -ForegroundColor White
        Write-Host "   - forceVideoCodec: H264" -ForegroundColor White
        Write-Host "   - forceAudioCodec: AAC" -ForegroundColor White
        Write-Host "   - fastStart: Habilitado" -ForegroundColor White
        
    } catch {
        Write-Host "[WARN] API ainda nao esta respondendo" -ForegroundColor Yellow
    }
    
} else {
    Write-Host "[ERROR] Container ZLMediaKit nao esta rodando" -ForegroundColor Red
    
    # Mostrar logs para debug
    Write-Host "[LOGS] Ultimas linhas do log:" -ForegroundColor Yellow
    docker-compose logs --tail=20 zlmediakit
    
    exit 1
}

# Verificar se o diretório de gravações existe
Write-Host "[DIR] Verificando diretorio de gravacoes..." -ForegroundColor Yellow
if (-not (Test-Path "storage\recordings")) {
    Write-Host "[DIR] Criando diretorio de gravacoes..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path "storage\recordings" -Force | Out-Null
    Write-Host "[DIR] Diretorio de gravacoes criado" -ForegroundColor Green
} else {
    Write-Host "[DIR] Diretorio de gravacoes ja existe" -ForegroundColor Green
}

Write-Host "" -ForegroundColor White
Write-Host "[SUCCESS] ZLMediaKit reiniciado com sucesso!" -ForegroundColor Green
Write-Host "" -ForegroundColor White
Write-Host "[INFO] Proximos passos recomendados:" -ForegroundColor Cyan
Write-Host "   1. Testar uma gravacao manual" -ForegroundColor White
Write-Host "   2. Verificar se os arquivos MP4 estao sendo criados corretamente" -ForegroundColor White
Write-Host "   3. Executar o script de limpeza se necessario" -ForegroundColor White
Write-Host "   4. Monitorar os logs: docker-compose logs -f zlmediakit" -ForegroundColor White
Write-Host "" -ForegroundColor White
Write-Host "[URLS] URLs importantes:" -ForegroundColor Cyan
Write-Host "   - API: http://localhost:8000/index/api" -ForegroundColor White
Write-Host "   - Gravacoes: http://localhost:8000/recordings" -ForegroundColor White
Write-Host "" -ForegroundColor White

exit 0