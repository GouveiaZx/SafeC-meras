#!/usr/bin/env pwsh
# Diagnostico completo do sistema NewCAM

Write-Host "=== DIAGNOSTICO SISTEMA NEWCAM ===" -ForegroundColor Cyan
Write-Host ""

# Verificar Docker
Write-Host "[1/6] Verificando Docker..." -ForegroundColor Yellow
try {
    docker --version | Out-Null
    Write-Host "OK Docker disponivel" -ForegroundColor Green
    
    $containers = docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    if ($containers.Count -gt 1) {
        Write-Host "Containers ativos:" -ForegroundColor White
        $containers | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
    } else {
        Write-Host "ERRO Nenhum container ativo" -ForegroundColor Red
    }
} catch {
    Write-Host "ERRO Docker nao disponivel" -ForegroundColor Red
}

Write-Host ""

# Verificar portas
Write-Host "[2/6] Verificando portas..." -ForegroundColor Yellow
$ports = @(3002, 5174, 8000, 5432, 6379)
$services = @("Backend", "Frontend", "ZLMediaKit", "PostgreSQL", "Redis")

for ($i = 0; $i -lt $ports.Length; $i++) {
    $port = $ports[$i]
    $service = $services[$i]
    
    $connection = Test-NetConnection -ComputerName localhost -Port $port -WarningAction SilentlyContinue
    if ($connection.TcpTestSucceeded) {
        Write-Host "OK $service (porta $port) - ATIVA" -ForegroundColor Green
    } else {
        Write-Host "ERRO $service (porta $port) - INATIVA" -ForegroundColor Red
    }
}

Write-Host ""

# Verificar APIs
Write-Host "[3/6] Testando APIs..." -ForegroundColor Yellow

# Backend Health
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3002/health" -TimeoutSec 5
    Write-Host "OK Backend Health - Status $($response.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "ERRO Backend Health - Falhou" -ForegroundColor Red
}

# ZLMediaKit API
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/index/api/getServerConfig" -TimeoutSec 5
    Write-Host "OK ZLMediaKit API - Status $($response.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "ERRO ZLMediaKit API - Falhou" -ForegroundColor Red
}

# Frontend
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5174" -TimeoutSec 5
    Write-Host "OK Frontend - Status $($response.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "ERRO Frontend - Falhou" -ForegroundColor Red
}

Write-Host ""

# Verificar Worker via WebSocket
Write-Host "[3.5/6] Verificando Worker..." -ForegroundColor Yellow
$workerProcesses = Get-Process | Where-Object {$_.ProcessName -eq "node" -and $_.MainWindowTitle -like "*worker*"}
if ($workerProcesses.Count -gt 0) {
    Write-Host "OK Worker - Processo ativo" -ForegroundColor Green
} else {
    # Verificar se há processo node rodando worker
    $allNodeProcesses = Get-Process | Where-Object {$_.ProcessName -eq "node"}
    $workerFound = $false
    foreach ($proc in $allNodeProcesses) {
        try {
            $cmdLine = (Get-WmiObject Win32_Process -Filter "ProcessId = $($proc.Id)").CommandLine
            if ($cmdLine -like "*worker*") {
                Write-Host "OK Worker - Conectado via WebSocket" -ForegroundColor Green
                $workerFound = $true
                break
            }
        } catch { }
    }
    if (-not $workerFound) {
        Write-Host "ERRO Worker - Não encontrado" -ForegroundColor Red
    }
}

Write-Host ""

# Verificar processos Node.js
Write-Host "[4/6] Verificando processos Node.js..." -ForegroundColor Yellow
$nodeProcesses = Get-Process | Where-Object {$_.ProcessName -eq "node"}
if ($nodeProcesses.Count -gt 0) {
    Write-Host "Processos Node.js ativos: $($nodeProcesses.Count)" -ForegroundColor Green
    $nodeProcesses | ForEach-Object {
        Write-Host "   PID: $($_.Id) - $($_.ProcessName)" -ForegroundColor Gray
    }
} else {
    Write-Host "ERRO Nenhum processo Node.js ativo" -ForegroundColor Red
}

Write-Host ""

# Verificar arquivos de configuracao
Write-Host "[5/6] Verificando configuracoes..." -ForegroundColor Yellow

$configFiles = @(
    "frontend/.env",
    "backend/.env",
    "frontend/vite.config.ts",
    "docker-compose.yml"
)

foreach ($file in $configFiles) {
    if (Test-Path $file) {
        Write-Host "OK $file - Existe" -ForegroundColor Green
    } else {
        Write-Host "ERRO $file - Nao encontrado" -ForegroundColor Red
    }
}

Write-Host ""

# Resumo e recomendacoes
Write-Host "[6/6] Resumo e Recomendacoes" -ForegroundColor Yellow
Write-Host "" 

$frontendActive = Test-NetConnection -ComputerName localhost -Port 5174 -WarningAction SilentlyContinue
$backendActive = Test-NetConnection -ComputerName localhost -Port 3002 -WarningAction SilentlyContinue
$zlmActive = Test-NetConnection -ComputerName localhost -Port 8000 -WarningAction SilentlyContinue

if ($frontendActive.TcpTestSucceeded -and $backendActive.TcpTestSucceeded) {
    Write-Host "OK Frontend e Backend estao rodando localmente" -ForegroundColor Green
    
    if (-not $zlmActive.TcpTestSucceeded) {
        Write-Host "RECOMENDACAO: Iniciar ZLMediaKit e servicos Docker" -ForegroundColor Yellow
        Write-Host "   Execute: .\scripts\iniciar-servicos-docker.ps1" -ForegroundColor White
    } else {
        Write-Host "OK Todos os servicos principais estao ativos" -ForegroundColor Green
    }
} else {
    Write-Host "RECOMENDACAO: Iniciar sistema completo" -ForegroundColor Yellow
    Write-Host "   Execute: .\scripts\iniciar-sistema-hibrido.ps1" -ForegroundColor White
}

Write-Host ""
Write-Host "=== FIM DO DIAGNOSTICO ===" -ForegroundColor Cyan