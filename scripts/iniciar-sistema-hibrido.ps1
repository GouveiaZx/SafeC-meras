#!/usr/bin/env pwsh
# Inicializar sistema NewCAM em modo híbrido completo

Write-Host "=== INICIANDO SISTEMA NEWCAM HÍBRIDO ===" -ForegroundColor Cyan
Write-Host ""

# Verificar pré-requisitos
Write-Host "[1/7] Verificando pré-requisitos..." -ForegroundColor Yellow

# Docker
try {
    docker --version | Out-Null
    Write-Host "✅ Docker disponível" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker não disponível" -ForegroundColor Red
    exit 1
}

# Node.js
try {
    node --version | Out-Null
    Write-Host "✅ Node.js disponível" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js não disponível" -ForegroundColor Red
    exit 1
}

# NPM
try {
    npm --version | Out-Null
    Write-Host "✅ NPM disponível" -ForegroundColor Green
} catch {
    Write-Host "❌ NPM não disponível" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Verificar se já existem processos
Write-Host "[2/7] Verificando processos existentes..." -ForegroundColor Yellow

$frontendActive = Test-NetConnection -ComputerName localhost -Port 5174 -WarningAction SilentlyContinue
$backendActive = Test-NetConnection -ComputerName localhost -Port 3002 -WarningAction SilentlyContinue

if ($frontendActive.TcpTestSucceeded) {
    Write-Host "⚠️  Frontend já está rodando na porta 5174" -ForegroundColor Yellow
} else {
    Write-Host "✅ Porta 5174 livre para Frontend" -ForegroundColor Green
}

if ($backendActive.TcpTestSucceeded) {
    Write-Host "⚠️  Backend já está rodando na porta 3002" -ForegroundColor Yellow
} else {
    Write-Host "✅ Porta 3002 livre para Backend" -ForegroundColor Green
}

Write-Host ""

# Iniciar serviços Docker
Write-Host "[3/7] Iniciando serviços Docker..." -ForegroundColor Yellow
docker-compose down
docker-compose up -d postgres redis zlmediakit

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Serviços Docker iniciados" -ForegroundColor Green
} else {
    Write-Host "❌ Erro ao iniciar serviços Docker" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Aguardar Docker
Write-Host "[4/7] Aguardando estabilização do Docker..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Instalar dependências
Write-Host "[5/7] Verificando dependências..." -ForegroundColor Yellow

if (-not (Test-Path "frontend/node_modules")) {
    Write-Host "Instalando dependências do Frontend..." -ForegroundColor White
    cd frontend
    npm install
    cd ..
}

if (-not (Test-Path "backend/node_modules")) {
    Write-Host "Instalando dependências do Backend..." -ForegroundColor White
    cd backend
    npm install
    cd ..
}

if (-not (Test-Path "worker/node_modules")) {
    Write-Host "Instalando dependências do Worker..." -ForegroundColor White
    cd worker
    npm install
    cd ..
}

Write-Host "✅ Dependências verificadas" -ForegroundColor Green

Write-Host ""

# Iniciar Frontend (se não estiver rodando)
Write-Host "[6/7] Iniciando aplicações..." -ForegroundColor Yellow

if (-not $frontendActive.TcpTestSucceeded) {
    Write-Host "Iniciando Frontend..." -ForegroundColor White
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\frontend'; npm run dev"
    Start-Sleep -Seconds 3
}

# Iniciar Backend (se não estiver rodando)
if (-not $backendActive.TcpTestSucceeded) {
    Write-Host "Iniciando Backend..." -ForegroundColor White
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\backend'; npm run dev"
    Start-Sleep -Seconds 3
}

# Iniciar Worker
Write-Host "Iniciando Worker..." -ForegroundColor White
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\worker'; npm start"

Write-Host ""

# Validação final
Write-Host "[7/7] Validação final..." -ForegroundColor Yellow
Write-Host "Aguardando 10 segundos para inicialização completa..." -ForegroundColor White
Start-Sleep -Seconds 10

$services = @(
    @{Name="Frontend"; Port=5174; URL="http://localhost:5174"},
    @{Name="Backend"; Port=3002; URL="http://localhost:3002/health"},
    @{Name="ZLMediaKit"; Port=8000; URL="http://localhost:8000/index/api/getServerConfig"},
    @{Name="Worker"; Port=3003; URL=""},
    @{Name="PostgreSQL"; Port=5432; URL=""},
    @{Name="Redis"; Port=6379; URL=""}
)

$allOk = $true
foreach ($service in $services) {
    $connection = Test-NetConnection -ComputerName localhost -Port $service.Port -WarningAction SilentlyContinue
    if ($connection.TcpTestSucceeded) {
        Write-Host "✅ $($service.Name) - Porta $($service.Port) ATIVA" -ForegroundColor Green
        
        if ($service.URL -and $service.URL -ne "") {
            try {
                $response = Invoke-WebRequest -Uri $service.URL -TimeoutSec 5
                Write-Host "   HTTP Status: $($response.StatusCode)" -ForegroundColor Green
            } catch {
                Write-Host "   HTTP Error: $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
    } else {
        Write-Host "❌ $($service.Name) - Porta $($service.Port) INATIVA" -ForegroundColor Red
        $allOk = $false
    }
}

Write-Host ""

if ($allOk) {
    Write-Host "🎉 SISTEMA NEWCAM INICIADO COM SUCESSO!" -ForegroundColor Green
    Write-Host ""
    Write-Host "URLs de Acesso:" -ForegroundColor Cyan
    Write-Host "• Frontend: http://localhost:5174" -ForegroundColor White
    Write-Host "• Backend API: http://localhost:3002" -ForegroundColor White
    Write-Host "• ZLMediaKit: http://localhost:8000" -ForegroundColor White
    Write-Host ""
    Write-Host "Para parar o sistema:" -ForegroundColor Cyan
    Write-Host "• Feche os terminais do Frontend, Backend e Worker" -ForegroundColor White
    Write-Host "• Execute: docker-compose down" -ForegroundColor White
} else {
    Write-Host "❌ ALGUNS SERVIÇOS FALHARAM" -ForegroundColor Red
    Write-Host "Verifique os logs dos terminais abertos" -ForegroundColor White
}

Write-Host ""
Write-Host "=== FIM DA INICIALIZAÇÃO ===" -ForegroundColor Cyan