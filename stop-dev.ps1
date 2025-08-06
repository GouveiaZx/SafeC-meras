# Script para Parar o Ambiente de Desenvolvimento NewCAM

Write-Host "🛑 Parando ambiente de desenvolvimento NewCAM..." -ForegroundColor Red
Write-Host "" 

# Parar serviços Docker
Write-Host "🐳 Parando serviços Docker..." -ForegroundColor Yellow
docker-compose down

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Serviços Docker parados com sucesso" -ForegroundColor Green
} else {
    Write-Host "⚠️  Erro ao parar serviços Docker (podem já estar parados)" -ForegroundColor Yellow
}

# Parar processos nas portas específicas
Write-Host "🔧 Parando processos locais..." -ForegroundColor Yellow

# Parar processo na porta 3002 (Backend)
try {
    $backendProcess = Get-NetTCPConnection -LocalPort 3002 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
    if ($backendProcess) {
        Stop-Process -Id $backendProcess -Force -ErrorAction SilentlyContinue
        Write-Host "✅ Backend (porta 3002) parado" -ForegroundColor Green
    } else {
        Write-Host "ℹ️  Nenhum processo encontrado na porta 3002" -ForegroundColor Gray
    }
} catch {
    Write-Host "ℹ️  Porta 3002 já estava livre" -ForegroundColor Gray
}

# Parar processo na porta 5173 (Frontend)
try {
    $frontendProcess = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
    if ($frontendProcess) {
        Stop-Process -Id $frontendProcess -Force -ErrorAction SilentlyContinue
        Write-Host "✅ Frontend (porta 5173) parado" -ForegroundColor Green
    } else {
        Write-Host "ℹ️  Nenhum processo encontrado na porta 5173" -ForegroundColor Gray
    }
} catch {
    Write-Host "ℹ️  Porta 5173 já estava livre" -ForegroundColor Gray
}

# Parar processos Node.js relacionados ao projeto (opcional)
Write-Host "🔍 Verificando processos Node.js relacionados..." -ForegroundColor Yellow
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
    $_.MainWindowTitle -like "*NewCAM*" -or 
    $_.ProcessName -eq "node" -and 
    (Get-Process -Id $_.Id -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path) -like "*NewCAM*"
}

if ($nodeProcesses) {
    Write-Host "🛑 Parando processos Node.js relacionados ao NewCAM..." -ForegroundColor Yellow
    $nodeProcesses | ForEach-Object {
        try {
            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
            Write-Host "✅ Processo Node.js (PID: $($_.Id)) parado" -ForegroundColor Green
        } catch {
            Write-Host "⚠️  Não foi possível parar processo PID: $($_.Id)" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "ℹ️  Nenhum processo Node.js relacionado encontrado" -ForegroundColor Gray
}

Write-Host "" 
Write-Host "✅ Ambiente de desenvolvimento parado com sucesso!" -ForegroundColor Green
Write-Host "" 
Write-Host "🔧 Para iniciar novamente, execute: ./start-dev.ps1" -ForegroundColor Cyan
Write-Host "" 

# Verificar se as portas estão realmente livres
Write-Host "🔍 Verificando se as portas estão livres..." -ForegroundColor Yellow

$ports = @(3002, 5173, 8000, 6379)
foreach ($port in $ports) {
    $connection = Test-NetConnection -ComputerName localhost -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue
    if ($connection) {
        Write-Host "⚠️  Porta $port ainda está em uso" -ForegroundColor Yellow
    } else {
        Write-Host "✅ Porta $port está livre" -ForegroundColor Green
    }
}

Write-Host "" 
Write-Host "Pressione qualquer tecla para fechar..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")