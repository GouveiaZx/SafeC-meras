# Script para iniciar todos os serviços do NewCAM
# Executa em ordem: Backend, Frontend, Worker (SimpleStreaming), SRS

Write-Host "=== Iniciando NewCAM - Sistema de Câmeras ===" -ForegroundColor Green
Write-Host ""

# Função para verificar se uma porta está em uso
function Test-Port {
    param([int]$Port)
    $connection = Test-NetConnection -ComputerName localhost -Port $Port -WarningAction SilentlyContinue
    return $connection.TcpTestSucceeded
}

# Função para aguardar que uma porta fique disponível
function Wait-ForPort {
    param([int]$Port, [string]$ServiceName, [int]$TimeoutSeconds = 30)
    Write-Host "Aguardando $ServiceName na porta $Port..." -ForegroundColor Yellow
    $timeout = (Get-Date).AddSeconds($TimeoutSeconds)
    
    while ((Get-Date) -lt $timeout) {
        if (Test-Port -Port $Port) {
            Write-Host "✓ $ServiceName está ativo na porta $Port" -ForegroundColor Green
            return $true
        }
        Start-Sleep -Seconds 2
    }
    
    Write-Host "✗ Timeout aguardando $ServiceName na porta $Port" -ForegroundColor Red
    return $false
}

# Verificar se já existem serviços rodando
Write-Host "Verificando serviços existentes..." -ForegroundColor Cyan

$ports = @{
    3002 = "Backend"
    5173 = "Frontend"
    8081 = "SimpleStreaming"
    1935 = "SRS RTMP"
    1985 = "SRS API"
    8080 = "SRS HTTP"
}

foreach ($port in $ports.Keys) {
    if (Test-Port -Port $port) {
        Write-Host "✓ $($ports[$port]) já está rodando na porta $port" -ForegroundColor Green
    }
}

Write-Host ""

# 1. Iniciar Backend
if (-not (Test-Port -Port 3002)) {
    Write-Host "1. Iniciando Backend..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'C:\Users\GouveiaRx\Downloads\NewCAM\backend'; npm start" -WindowStyle Normal
    Wait-ForPort -Port 3002 -ServiceName "Backend"
} else {
    Write-Host "1. Backend já está rodando" -ForegroundColor Green
}

# 2. Iniciar Worker (SimpleStreaming)
if (-not (Test-Port -Port 8081)) {
    Write-Host "2. Iniciando SimpleStreaming Worker..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'C:\Users\GouveiaRx\Downloads\NewCAM\worker'; node simple_streaming_server.js" -WindowStyle Normal
    Wait-ForPort -Port 8081 -ServiceName "SimpleStreaming"
} else {
    Write-Host "2. SimpleStreaming já está rodando" -ForegroundColor Green
}

# 3. Iniciar SRS (se não estiver rodando)
if (-not (Test-Port -Port 1935)) {
    Write-Host "3. Iniciando SRS..." -ForegroundColor Cyan
    if (Test-Path "C:\srs\start-srs.ps1") {
        Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'C:\srs'; .\start-srs.ps1" -WindowStyle Normal
        Wait-ForPort -Port 1935 -ServiceName "SRS"
    } else {
        Write-Host "✗ SRS não encontrado em C:\srs" -ForegroundColor Red
    }
} else {
    Write-Host "3. SRS já está rodando" -ForegroundColor Green
}

# 4. Iniciar Frontend
if (-not (Test-Port -Port 5173)) {
    Write-Host "4. Iniciando Frontend..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'C:\Users\GouveiaRx\Downloads\NewCAM\frontend'; npm run dev" -WindowStyle Normal
    Wait-ForPort -Port 5173 -ServiceName "Frontend"
} else {
    Write-Host "4. Frontend já está rodando" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Status dos Serviços ===" -ForegroundColor Green
Write-Host "Frontend:        http://localhost:5173" -ForegroundColor White
Write-Host "Backend API:     http://localhost:3002" -ForegroundColor White
Write-Host "SimpleStreaming: http://localhost:8081" -ForegroundColor White
Write-Host "SRS RTMP:        rtmp://localhost:1935" -ForegroundColor White
Write-Host "SRS HTTP-FLV:    http://localhost:8080" -ForegroundColor White
Write-Host "SRS API:         http://localhost:1985/api/v1" -ForegroundColor White
Write-Host ""
Write-Host "=== NewCAM está pronto para uso! ===" -ForegroundColor Green
Write-Host "Acesse: http://localhost:5173 para fazer login" -ForegroundColor Yellow
Write-Host ""
Write-Host "Pressione qualquer tecla para sair..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")