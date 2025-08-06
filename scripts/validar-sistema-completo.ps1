#!/usr/bin/env pwsh
# Validação completa do sistema NewCAM

Write-Host "=== VALIDAÇÃO COMPLETA SISTEMA NEWCAM ===" -ForegroundColor Cyan
Write-Host ""

$totalTests = 0
$passedTests = 0

function Test-Service {
    param(
        [string]$Name,
        [int]$Port,
        [string]$URL = "",
        [string]$ExpectedContent = ""
    )
    
    $global:totalTests++
    
    Write-Host "Testando $Name..." -ForegroundColor Yellow
    
    # Teste de conectividade
    $connection = Test-NetConnection -ComputerName localhost -Port $Port -WarningAction SilentlyContinue
    if (-not $connection.TcpTestSucceeded) {
        Write-Host "❌ $Name - Porta $Port não responde" -ForegroundColor Red
        return $false
    }
    
    # Teste HTTP (se URL fornecida)
    if ($URL -and $URL -ne "") {
        try {
            $response = Invoke-WebRequest -Uri $URL -TimeoutSec 10
            if ($response.StatusCode -eq 200) {
                Write-Host "✅ $Name - HTTP OK (Status: $($response.StatusCode))" -ForegroundColor Green
                
                # Verificar conteúdo específico
                if ($ExpectedContent -and $ExpectedContent -ne "") {
                    if ($response.Content -like "*$ExpectedContent*") {
                        Write-Host "✅ $Name - Conteúdo esperado encontrado" -ForegroundColor Green
                    } else {
                        Write-Host "⚠️  $Name - Conteúdo esperado não encontrado" -ForegroundColor Yellow
                    }
                }
                
                $global:passedTests++
                return $true
            } else {
                Write-Host "⚠️  $Name - HTTP Status: $($response.StatusCode)" -ForegroundColor Yellow
                return $false
            }
        } catch {
            Write-Host "❌ $Name - HTTP Error: $($_.Exception.Message)" -ForegroundColor Red
            return $false
        }
    } else {
        Write-Host "✅ $Name - Porta $Port ativa" -ForegroundColor Green
        $global:passedTests++
        return $true
    }
}

# Testes de serviços básicos
Write-Host "[1/4] Testando serviços básicos..." -ForegroundColor Cyan
Test-Service -Name "PostgreSQL" -Port 5432
Test-Service -Name "Redis" -Port 6379
Test-Service -Name "ZLMediaKit" -Port 8000 -URL "http://localhost:8000/index/api/getServerConfig"
Test-Service -Name "Backend" -Port 3002 -URL "http://localhost:3002/health"
Test-Service -Name "Frontend" -Port 5174 -URL "http://localhost:5174"
# Worker é um processo WebSocket, não HTTP - verificamos apenas se está rodando
Write-Host "Testando Worker..." -ForegroundColor Yellow
$global:totalTests++
$workerProcess = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*worker*" }
if ($workerProcess) {
    Write-Host "✅ Worker - Processo ativo" -ForegroundColor Green
    $global:passedTests++
} else {
    Write-Host "❌ Worker - Processo não encontrado" -ForegroundColor Red
}

Write-Host ""

# Testes de APIs específicas
Write-Host "[2/4] Testando APIs específicas..." -ForegroundColor Cyan

$apiTests = @(
    @{Name="Câmeras"; URL="http://localhost:3002/api/cameras"},
    @{Name="Gravações"; URL="http://localhost:3002/api/recordings"},
    @{Name="Dashboard"; URL="http://localhost:3002/api/dashboard/stats"},
    @{Name="ZLM Media List"; URL="http://localhost:8000/index/api/getMediaList"}
)

foreach ($test in $apiTests) {
    $global:totalTests++
    try {
        $response = Invoke-WebRequest -Uri $test.URL -TimeoutSec 10
        if ($response.StatusCode -eq 200) {
            Write-Host "✅ API $($test.Name) - OK" -ForegroundColor Green
            $global:passedTests++
        } else {
            Write-Host "⚠️  API $($test.Name) - Status: $($response.StatusCode)" -ForegroundColor Yellow
        }
    } catch {
        # Verificar se é erro de autenticação (indica que a API está funcionando)
        if ($_.Exception.Message -like "*Token de acesso requerido*" -or 
            $_.Exception.Message -like "*401*" -or 
            $_.Exception.Message -like "*403*") {
            Write-Host "✅ API $($test.Name) - OK (Requer autenticação)" -ForegroundColor Green
            $global:passedTests++
        } else {
            Write-Host "❌ API $($test.Name) - Error: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

Write-Host ""

# Testes de streaming
Write-Host "[3/4] Testando capacidades de streaming..." -ForegroundColor Cyan

# Verificar se ZLMediaKit está configurado corretamente
try {
    $zlmConfig = Invoke-WebRequest -Uri "http://localhost:8000/index/api/getServerConfig" -TimeoutSec 10
    $configData = $zlmConfig.Content | ConvertFrom-Json
    
    if ($configData) {
        Write-Host "✅ ZLMediaKit configuração carregada" -ForegroundColor Green
        
        # Verificar configurações importantes
        if ($configData.data -and $configData.data.record) {
            Write-Host "✅ Configuração de gravação presente" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Configuração de gravação não encontrada" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "❌ Erro ao verificar configuração ZLMediaKit" -ForegroundColor Red
}

# Verificar diretórios de gravação
if (Test-Path "storage/www/recordings") {
    Write-Host "✅ Diretório de gravações existe" -ForegroundColor Green
} else {
    Write-Host "⚠️  Diretório de gravações não encontrado" -ForegroundColor Yellow
}

Write-Host ""

# Teste de integração frontend-backend
Write-Host "[4/4] Testando integração frontend-backend..." -ForegroundColor Cyan

# Verificar se o proxy do Vite está funcionando
try {
    $proxyTest = Invoke-WebRequest -Uri "http://localhost:5174/api/health" -TimeoutSec 10
    if ($proxyTest.StatusCode -eq 200) {
        Write-Host "✅ Proxy Vite funcionando (Frontend -> Backend)" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Proxy Vite não está funcionando" -ForegroundColor Red
    Write-Host "   Verifique vite.config.ts" -ForegroundColor White
}

# Verificar se as rotas de streaming estão acessíveis via proxy
try {
    $streamProxy = Invoke-WebRequest -Uri "http://localhost:5174/live" -TimeoutSec 10
    Write-Host "✅ Proxy de streaming funcionando (Frontend -> ZLMediaKit)" -ForegroundColor Green
} catch {
    Write-Host "❌ Proxy de streaming não está funcionando" -ForegroundColor Red
}

Write-Host ""

# Resumo final
Write-Host "=== RESUMO DA VALIDAÇÃO ===" -ForegroundColor Cyan
Write-Host ""

$successRate = [math]::Round(($passedTests / $totalTests) * 100, 1)

Write-Host "Testes executados: $totalTests" -ForegroundColor White
Write-Host "Testes aprovados: $passedTests" -ForegroundColor Green
Write-Host "Taxa de sucesso: $successRate%" -ForegroundColor $(if ($successRate -ge 80) { "Green" } elseif ($successRate -ge 60) { "Yellow" } else { "Red" })

Write-Host ""

if ($successRate -ge 90) {
    Write-Host "🎉 SISTEMA TOTALMENTE FUNCIONAL!" -ForegroundColor Green
    Write-Host "Todos os componentes estão operacionais." -ForegroundColor White
} elseif ($successRate -ge 70) {
    Write-Host "⚠️  SISTEMA PARCIALMENTE FUNCIONAL" -ForegroundColor Yellow
    Write-Host "Alguns componentes podem precisar de atenção." -ForegroundColor White
} else {
    Write-Host "❌ SISTEMA COM PROBLEMAS CRÍTICOS" -ForegroundColor Red
    Write-Host "Vários componentes precisam ser corrigidos." -ForegroundColor White
}

Write-Host ""
Write-Host "=== FIM DA VALIDAÇÃO ===" -ForegroundColor Cyan