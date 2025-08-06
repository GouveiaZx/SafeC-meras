#!/usr/bin/env pwsh
# Inicializar apenas serviços de infraestrutura via Docker

Write-Host "=== INICIANDO SERVIÇOS DOCKER ===" -ForegroundColor Cyan
Write-Host ""

# Verificar se Docker está rodando
Write-Host "[1/5] Verificando Docker..." -ForegroundColor Yellow
try {
    docker --version | Out-Null
    Write-Host "✅ Docker disponível" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker não está rodando. Inicie o Docker Desktop primeiro." -ForegroundColor Red
    exit 1
}

Write-Host ""

# Parar containers existentes
Write-Host "[2/5] Parando containers existentes..." -ForegroundColor Yellow
docker-compose down
Write-Host "✅ Containers parados" -ForegroundColor Green

Write-Host ""

# Iniciar apenas serviços de infraestrutura
Write-Host "[3/5] Iniciando serviços de infraestrutura..." -ForegroundColor Yellow
Write-Host "Serviços: PostgreSQL, Redis, ZLMediaKit" -ForegroundColor White

docker-compose up -d postgres redis zlmediakit

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Serviços Docker iniciados" -ForegroundColor Green
} else {
    Write-Host "❌ Erro ao iniciar serviços Docker" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Aguardar inicialização
Write-Host "[4/5] Aguardando inicialização..." -ForegroundColor Yellow
Write-Host "Aguardando 15 segundos para estabilização..." -ForegroundColor White
Start-Sleep -Seconds 15

# Verificar status
Write-Host "[5/5] Verificando status dos serviços..." -ForegroundColor Yellow

$services = @(
    @{Name="PostgreSQL"; Port=5432},
    @{Name="Redis"; Port=6379},
    @{Name="ZLMediaKit"; Port=8000}
)

$allOk = $true
foreach ($service in $services) {
    $connection = Test-NetConnection -ComputerName localhost -Port $service.Port -WarningAction SilentlyContinue
    if ($connection.TcpTestSucceeded) {
        Write-Host "✅ $($service.Name) - Porta $($service.Port) ATIVA" -ForegroundColor Green
    } else {
        Write-Host "❌ $($service.Name) - Porta $($service.Port) INATIVA" -ForegroundColor Red
        $allOk = $false
    }
}

Write-Host ""

if ($allOk) {
    Write-Host "✅ TODOS OS SERVIÇOS DOCKER ESTÃO ATIVOS" -ForegroundColor Green
    Write-Host ""
    Write-Host "Próximos passos:" -ForegroundColor Cyan
    Write-Host "1. Verificar se Frontend/Backend estão rodando" -ForegroundColor White
    Write-Host "2. Iniciar Worker: cd worker && npm start" -ForegroundColor White
    Write-Host "3. Testar sistema: http://localhost:5174" -ForegroundColor White
} else {
    Write-Host "❌ ALGUNS SERVIÇOS FALHARAM" -ForegroundColor Red
    Write-Host "Verifique os logs: docker-compose logs" -ForegroundColor White
}

Write-Host ""
Write-Host "=== FIM DA INICIALIZAÇÃO ===" -ForegroundColor Cyan