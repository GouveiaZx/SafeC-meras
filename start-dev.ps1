# Script de Inicialização do Ambiente de Desenvolvimento NewCAM
# Configurado para modo desenvolvimento local:
# - Frontend: localhost:5173 (Vite)
# - Backend: localhost:3002 (Node.js local)
# - ZLMediaKit: localhost:8000 (Docker)
# - Redis: localhost:6379 (Docker)

Write-Host "🚀 Iniciando ambiente de desenvolvimento NewCAM..." -ForegroundColor Green
Write-Host "" 

# Verificar se Docker está rodando
Write-Host "🐳 Verificando Docker..." -ForegroundColor Yellow
try {
    docker --version | Out-Null
    Write-Host "✅ Docker está disponível" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker não está disponível. Por favor, inicie o Docker Desktop." -ForegroundColor Red
    exit 1
}

# Parar serviços Docker existentes
Write-Host "🛑 Parando serviços Docker existentes..." -ForegroundColor Yellow
docker-compose down 2>$null

# Iniciar serviços Docker necessários (ZLMediaKit e Redis)
Write-Host "🔧 Iniciando ZLMediaKit e Redis via Docker..." -ForegroundColor Yellow
docker-compose up -d zlmediakit redis

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Serviços Docker iniciados com sucesso" -ForegroundColor Green
} else {
    Write-Host "❌ Erro ao iniciar serviços Docker" -ForegroundColor Red
    exit 1
}

# Aguardar serviços ficarem prontos
Write-Host "⏳ Aguardando serviços ficarem prontos..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Verificar se as portas estão disponíveis
Write-Host "🔍 Verificando disponibilidade das portas..." -ForegroundColor Yellow

# Verificar porta 3002 (Backend)
$backendPort = Test-NetConnection -ComputerName localhost -Port 3002 -InformationLevel Quiet -WarningAction SilentlyContinue
if ($backendPort) {
    Write-Host "⚠️  Porta 3002 já está em uso. Parando processo..." -ForegroundColor Yellow
    # Tentar parar processo na porta 3002
    $process = Get-NetTCPConnection -LocalPort 3002 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
    if ($process) {
        Stop-Process -Id $process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
}

# Verificar porta 5173 (Frontend)
$frontendPort = Test-NetConnection -ComputerName localhost -Port 5173 -InformationLevel Quiet -WarningAction SilentlyContinue
if ($frontendPort) {
    Write-Host "⚠️  Porta 5173 já está em uso. Parando processo..." -ForegroundColor Yellow
    # Tentar parar processo na porta 5173
    $process = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
    if ($process) {
        Stop-Process -Id $process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
}

Write-Host "" 
Write-Host "🎯 Iniciando serviços locais..." -ForegroundColor Green
Write-Host "" 

# Iniciar Backend em nova janela do PowerShell
Write-Host "🔧 Iniciando Backend (localhost:3002)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend'; npm run dev" -WindowStyle Normal

# Aguardar backend iniciar
Start-Sleep -Seconds 5

# Iniciar Frontend em nova janela do PowerShell
Write-Host "🎨 Iniciando Frontend (localhost:5173)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\frontend'; npm run dev" -WindowStyle Normal

# Aguardar frontend iniciar
Start-Sleep -Seconds 8

Write-Host "" 
Write-Host "🎉 Ambiente de desenvolvimento iniciado com sucesso!" -ForegroundColor Green
Write-Host "" 
Write-Host "📋 Serviços disponíveis:" -ForegroundColor Cyan
Write-Host "   • Frontend:    http://localhost:5173" -ForegroundColor White
Write-Host "   • Backend:     http://localhost:3002" -ForegroundColor White
Write-Host "   • ZLMediaKit:  http://localhost:8000" -ForegroundColor White
Write-Host "   • Redis:       localhost:6379" -ForegroundColor White
Write-Host "" 
Write-Host "🔧 Para parar todos os serviços, execute: ./stop-dev.ps1" -ForegroundColor Yellow
Write-Host "" 

# Testar conectividade
Write-Host "🧪 Testando conectividade..." -ForegroundColor Yellow

# Testar Backend
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3002/api/health" -TimeoutSec 10
    if ($response.success) {
        Write-Host "✅ Backend respondendo corretamente" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️  Backend ainda não está respondendo (pode levar alguns segundos)" -ForegroundColor Yellow
}

# Testar ZLMediaKit
try {
    $response = Invoke-RestMethod -Uri "http://localhost:8000/index/api/getServerConfig" -TimeoutSec 5
    Write-Host "✅ ZLMediaKit respondendo corretamente" -ForegroundColor Green
} catch {
    Write-Host "⚠️  ZLMediaKit ainda não está respondendo" -ForegroundColor Yellow
}

Write-Host "" 
Write-Host "🚀 Ambiente pronto para desenvolvimento!" -ForegroundColor Green
Write-Host "   Abra http://localhost:5173 no seu navegador" -ForegroundColor White
Write-Host "" 

# Manter o script aberto
Write-Host "Pressione qualquer tecla para fechar este script..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")