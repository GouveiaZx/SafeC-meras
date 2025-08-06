#!/usr/bin/env pwsh
# Validação completa do sistema NewCAM - Identificação de problemas específicos

Write-Host "=== VALIDACAO COMPLETA SISTEMA NEWCAM ===" -ForegroundColor Cyan
Write-Host ""

# Função para testar API com token
function Test-APIWithAuth {
    param(
        [string]$Url,
        [string]$Description,
        [string]$Token = $null
    )
    
    try {
        $headers = @{}
        if ($Token) {
            $headers["Authorization"] = "Bearer $Token"
        }
        
        $response = Invoke-WebRequest -Uri $Url -Method GET -Headers $headers -TimeoutSec 10
        Write-Host "OK $Description - Status $($response.StatusCode)" -ForegroundColor Green
        return $true
    } catch {
        $errorMsg = $_.Exception.Message
        if ($errorMsg -like "*Token*" -or $errorMsg -like "*acesso*") {
            Write-Host "AUTH $Description - Requer autenticacao" -ForegroundColor Yellow
        } else {
            Write-Host "ERRO $Description - Falhou: $errorMsg" -ForegroundColor Red
        }
        return $false
    }
}

# Função para verificar arquivos de gravação
function Test-RecordingFiles {
    Write-Host "[GRAVACOES] Verificando arquivos de gravacao..." -ForegroundColor Yellow
    
    $recordingPaths = @(
        "./storage/recordings",
        "./recordings",
        "./uploads"
    )
    
    $totalFiles = 0
    $totalSize = 0
    
    foreach ($path in $recordingPaths) {
        if (Test-Path $path) {
            $files = Get-ChildItem -Path $path -Recurse -File | Where-Object { $_.Extension -match "\.(mp4|avi|mov|webm|m3u8)$" }
            $pathSize = ($files | Measure-Object -Property Length -Sum).Sum
            $totalFiles += $files.Count
            $totalSize += $pathSize
            
            Write-Host "   $path - $($files.Count) arquivos ($([math]::Round($pathSize / 1MB, 2)) MB)" -ForegroundColor Gray
            
            # Mostrar arquivos mais recentes
            $recentFiles = $files | Sort-Object LastWriteTime -Descending | Select-Object -First 3
            foreach ($file in $recentFiles) {
                $age = (Get-Date) - $file.LastWriteTime
                Write-Host "     $($file.Name) - $([math]::Round($file.Length / 1MB, 2)) MB - $($age.Days)d $($age.Hours)h atras" -ForegroundColor DarkGray
            }
        } else {
            Write-Host "   ERRO $path - Diretorio nao encontrado" -ForegroundColor Red
        }
    }
    
    Write-Host "   Total: $totalFiles arquivos ($([math]::Round($totalSize / 1MB, 2)) MB)" -ForegroundColor White
    return $totalFiles
}

# Função para testar conectividade ZLMediaKit
function Test-ZLMediaKit {
    Write-Host "ZLMEDIAKIT - Testando conectividade..." -ForegroundColor Yellow
    
    $zlmTests = @(
        @{ Url = "http://localhost:8000/index/api/getServerConfig"; Desc = "Config Server" },
        @{ Url = "http://localhost:8000/index/api/getMediaList"; Desc = "Lista de Mídia" },
        @{ Url = "http://localhost:8000/index/api/getThreadsLoad"; Desc = "Carga de Threads" }
    )
    
    $zlmWorking = $false
    foreach ($test in $zlmTests) {
        try {
            $response = Invoke-WebRequest -Uri $test.Url -Method GET -TimeoutSec 5
            if ($response.StatusCode -eq 200) {
                $content = $response.Content | ConvertFrom-Json
                if ($content.code -eq -300) {
                    Write-Host "   AUTH $($test.Desc) - Requer secret (ZLM funcionando)" -ForegroundColor Yellow
                    $zlmWorking = $true
                } elseif ($content.code -eq 0) {
                    Write-Host "   OK $($test.Desc) - OK" -ForegroundColor Green
                    $zlmWorking = $true
                } else {
                    Write-Host "   WARN $($test.Desc) - Codigo: $($content.code)" -ForegroundColor Yellow
                }
            }
        } catch {
            Write-Host "   ERRO $($test.Desc) - Falhou" -ForegroundColor Red
        }
    }
    
    return $zlmWorking
}

# Função para verificar configurações do frontend
function Test-FrontendConfig {
    Write-Host "[FRONTEND] Verificando configuracoes..." -ForegroundColor Yellow
    
    $configIssues = @()
    
    # Verificar .env
    if (Test-Path "frontend/.env") {
        $envContent = Get-Content "frontend/.env" -Raw
        
        # Verificar URLs essenciais
        $requiredVars = @(
            "VITE_API_URL",
            "VITE_ZLM_URL", 
            "VITE_ZLM_HLS_URL",
            "VITE_BACKEND_URL"
        )
        
        foreach ($var in $requiredVars) {
            if ($envContent -match "$var=(.+)") {
                $value = $matches[1]
                Write-Host "   OK $var = $value" -ForegroundColor Green
            } else {
                Write-Host "   ERRO $var - Nao encontrado" -ForegroundColor Red
                $configIssues += "Variável $var ausente"
            }
        }
    } else {
        Write-Host "   ERRO frontend/.env nao encontrado" -ForegroundColor Red
        $configIssues += "Arquivo .env do frontend ausente"
    }
    
    # Verificar vite.config.ts
    if (Test-Path "frontend/vite.config.ts") {
        $viteConfig = Get-Content "frontend/vite.config.ts" -Raw
        
        $requiredProxies = @("/api", "/live", "/recordings", "/hls", "/zlm")
        foreach ($proxy in $requiredProxies) {
            if ($viteConfig -match "'$proxy'") {
                Write-Host "   OK Proxy $proxy configurado" -ForegroundColor Green
            } else {
                Write-Host "   ERRO Proxy $proxy ausente" -ForegroundColor Red
                $configIssues += "Proxy $proxy não configurado"
            }
        }
    } else {
        Write-Host "   ERRO vite.config.ts nao encontrado" -ForegroundColor Red
        $configIssues += "Arquivo vite.config.ts ausente"
    }
    
    return $configIssues
}

# Função para testar APIs específicas de gravação
function Test-RecordingAPIs {
    Write-Host "[APIS] Testando APIs de gravacao..." -ForegroundColor Yellow
    
    $apiTests = @(
        @{ Url = "http://localhost:3002/api/cameras"; Desc = "Lista de Câmeras" },
        @{ Url = "http://localhost:3002/api/recordings"; Desc = "Lista de Gravações" },
        @{ Url = "http://localhost:3002/api/recordings/stats"; Desc = "Estatísticas" },
        @{ Url = "http://localhost:3002/api/system/status"; Desc = "Status do Sistema" }
    )
    
    $workingAPIs = 0
    $authRequiredAPIs = 0
    
    foreach ($test in $apiTests) {
        $result = Test-APIWithAuth -Url $test.Url -Description $test.Desc
        if ($result) {
            $workingAPIs++
        } else {
            # Verificar se é problema de autenticação
            try {
                $response = Invoke-WebRequest -Uri $test.Url -Method GET -TimeoutSec 5
            } catch {
                if ($_.Exception.Message -like "*Token*" -or $_.Exception.Message -like "*acesso*") {
                    $authRequiredAPIs++
                }
            }
        }
    }
    
    Write-Host "   APIs funcionando: $workingAPIs/$($apiTests.Count)" -ForegroundColor White
    Write-Host "   APIs que requerem auth: $authRequiredAPIs" -ForegroundColor White
    
    return @{ Working = $workingAPIs; AuthRequired = $authRequiredAPIs; Total = $apiTests.Count }
}

# Função para verificar problemas específicos do player
function Test-VideoPlayerIssues {
    Write-Host "[PLAYER] Verificando problemas do player de video..." -ForegroundColor Yellow
    
    $playerIssues = @()
    
    # Verificar se VideoPlayer.tsx existe
    if (Test-Path "frontend/src/components/VideoPlayer.tsx") {
        $playerCode = Get-Content "frontend/src/components/VideoPlayer.tsx" -Raw
        
        # Verificar imports essenciais
        $requiredImports = @("Hls", "toast", "globalKeepAlive", "streamHealthMonitor")
        foreach ($import in $requiredImports) {
            if ($playerCode -match $import) {
                Write-Host "   OK Import $import encontrado" -ForegroundColor Green
            } else {
                Write-Host "   ERRO Import $import ausente" -ForegroundColor Red
                $playerIssues += "Import $import ausente no VideoPlayer"
            }
        }
        
        # Verificar funções críticas
        $criticalFunctions = @("initializeHLS", "tryAlternativeFormats", "tryBackendRoutes")
        foreach ($func in $criticalFunctions) {
            if ($playerCode -match $func) {
                Write-Host "   OK Funcao $func encontrada" -ForegroundColor Green
            } else {
                Write-Host "   ERRO Funcao $func ausente" -ForegroundColor Red
                $playerIssues += "Função $func ausente no VideoPlayer"
            }
        }
    } else {
        Write-Host "   ERRO VideoPlayer.tsx nao encontrado" -ForegroundColor Red
        $playerIssues += "Componente VideoPlayer ausente"
    }
    
    return $playerIssues
}

# Função para verificar problemas de navegação
function Test-NavigationIssues {
    Write-Host "[NAVEGACAO] Verificando problemas de navegacao..." -ForegroundColor Yellow
    
    $navIssues = @()
    
    # Verificar App.tsx
    if (Test-Path "frontend/src/App.tsx") {
        $appCode = Get-Content "frontend/src/App.tsx" -Raw
        
        # Verificar rotas essenciais
        $requiredRoutes = @("/recordings", "/archive", "/cameras")
        foreach ($route in $requiredRoutes) {
            if ($appCode -match $route) {
                Write-Host "   OK Rota $route encontrada" -ForegroundColor Green
            } else {
                Write-Host "   ERRO Rota $route ausente" -ForegroundColor Red
                $navIssues += "Rota $route não configurada"
            }
        }
    } else {
        Write-Host "   ERRO App.tsx nao encontrado" -ForegroundColor Red
        $navIssues += "Arquivo App.tsx ausente"
    }
    
    return $navIssues
}

# EXECUÇÃO PRINCIPAL
Write-Host "Iniciando validacao completa..." -ForegroundColor White
Write-Host ""

# 1. Verificar serviços básicos
Write-Host "[1/8] Verificando servicos basicos..." -ForegroundColor Cyan
$services = @(
    @{ Port = 3002; Name = "Backend" },
    @{ Port = 5174; Name = "Frontend" },
    @{ Port = 8000; Name = "ZLMediaKit" },
    @{ Port = 5432; Name = "PostgreSQL" },
    @{ Port = 6379; Name = "Redis" }
)

$activeServices = 0
foreach ($service in $services) {
    $connection = Test-NetConnection -ComputerName localhost -Port $service.Port -WarningAction SilentlyContinue
    if ($connection.TcpTestSucceeded) {
        Write-Host "OK $($service.Name) (porta $($service.Port)) - ATIVO" -ForegroundColor Green
        $activeServices++
    } else {
        Write-Host "ERRO $($service.Name) (porta $($service.Port)) - INATIVO" -ForegroundColor Red
    }
}
Write-Host ""

# 2. Testar ZLMediaKit
Write-Host "[2/8] Testando ZLMediaKit..." -ForegroundColor Cyan
$zlmWorking = Test-ZLMediaKit
Write-Host ""

# 3. Verificar arquivos de gravação
Write-Host "[3/8] Verificando arquivos de gravacao..." -ForegroundColor Cyan
$recordingCount = Test-RecordingFiles
Write-Host ""

# 4. Testar APIs
Write-Host "[4/8] Testando APIs..." -ForegroundColor Cyan
$apiResults = Test-RecordingAPIs
Write-Host ""

# 5. Verificar configurações do frontend
Write-Host "[5/8] Verificando configuracoes do frontend..." -ForegroundColor Cyan
$configIssues = Test-FrontendConfig
Write-Host ""

# 6. Verificar player de vídeo
Write-Host "[6/8] Verificando player de video..." -ForegroundColor Cyan
$playerIssues = Test-VideoPlayerIssues
Write-Host ""

# 7. Verificar navegação
Write-Host "[7/8] Verificando navegacao..." -ForegroundColor Cyan
$navIssues = Test-NavigationIssues
Write-Host ""

# 8. Relatório final
Write-Host "[8/8] Gerando relatório final..." -ForegroundColor Cyan
Write-Host ""

Write-Host "=== RELATORIO FINAL ===" -ForegroundColor Yellow
Write-Host ""

# Status geral
Write-Host "STATUS GERAL:" -ForegroundColor White
Write-Host "   Servicos ativos: $activeServices/5" -ForegroundColor $(if ($activeServices -eq 5) { "Green" } else { "Red" })
Write-Host "   ZLMediaKit funcionando: $(if ($zlmWorking) { "Sim" } else { "Nao" })" -ForegroundColor $(if ($zlmWorking) { "Green" } else { "Red" })
Write-Host "   Arquivos de gravacao: $recordingCount" -ForegroundColor $(if ($recordingCount -gt 0) { "Green" } else { "Yellow" })
Write-Host "   APIs funcionando: $($apiResults.Working)/$($apiResults.Total)" -ForegroundColor $(if ($apiResults.Working -gt 0) { "Green" } else { "Red" })
Write-Host ""

# Problemas identificados
$allIssues = @()
$allIssues += $configIssues
$allIssues += $playerIssues
$allIssues += $navIssues

if ($allIssues.Count -gt 0) {
    Write-Host "PROBLEMAS IDENTIFICADOS:" -ForegroundColor Red
    for ($i = 0; $i -lt $allIssues.Count; $i++) {
        Write-Host "   $($i + 1). $($allIssues[$i])" -ForegroundColor Red
    }
    Write-Host ""
}

# Recomendações específicas
Write-Host "RECOMENDACOES:" -ForegroundColor Yellow

if ($activeServices -lt 5) {
    Write-Host "   1. Iniciar servicos faltantes com: .\scripts\iniciar-servicos-docker.ps1" -ForegroundColor White
}

if ($apiResults.AuthRequired -gt 0) {
    Write-Host "   2. Configurar autenticacao adequada para APIs" -ForegroundColor White
}

if ($configIssues.Count -gt 0) {
    Write-Host "   3. Corrigir configuracoes do frontend (.env e vite.config.ts)" -ForegroundColor White
}

if ($playerIssues.Count -gt 0) {
    Write-Host "   4. Corrigir problemas no componente VideoPlayer" -ForegroundColor White
}

if ($navIssues.Count -gt 0) {
    Write-Host "   5. Corrigir problemas de navegacao no App.tsx" -ForegroundColor White
}

if ($recordingCount -eq 0) {
    Write-Host "   6. Verificar se as cameras estao gravando corretamente" -ForegroundColor White
}

Write-Host ""
Write-Host "=== FIM DA VALIDACAO ===" -ForegroundColor Cyan

# Salvar relatório em arquivo
$reportPath = "./diagnostico-$(Get-Date -Format 'yyyy-MM-dd-HHmm').txt"
$report = @"
=== RELATORIO DE DIAGNOSTICO NEWCAM ===
Data: $(Get-Date)

STATUS GERAL:
- Servicos ativos: $activeServices/5
- ZLMediaKit funcionando: $(if ($zlmWorking) { "Sim" } else { "Nao" })
- Arquivos de gravacao: $recordingCount
- APIs funcionando: $($apiResults.Working)/$($apiResults.Total)

PROBLEMAS IDENTIFICADOS:
$($allIssues | ForEach-Object { "- $_" } | Out-String)

RECOMENDACOES:
- Verificar servicos Docker
- Configurar autenticacao
- Corrigir configuracoes frontend
- Verificar componente VideoPlayer
- Corrigir navegacao
"@

$report | Out-File -FilePath $reportPath -Encoding UTF8
Write-Host "Relatorio salvo em: $reportPath" -ForegroundColor Green