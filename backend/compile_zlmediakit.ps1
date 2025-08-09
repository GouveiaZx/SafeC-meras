# Script para compilar ZLMediaKit no Windows
# Requer Visual Studio 2019 ou superior com C++ tools

Write-Host "Compilando ZLMediaKit..." -ForegroundColor Green

# Verificar se o Visual Studio esta instalado
$vsPath = Get-ChildItem "C:\Program Files*\Microsoft Visual Studio\*\*\Common7\Tools\VsDevCmd.bat" -ErrorAction SilentlyContinue | Select-Object -First 1

if (-not $vsPath) {
    Write-Host "Visual Studio nao encontrado. Por favor, instale o Visual Studio 2019 ou superior com C++ tools." -ForegroundColor Red
    Write-Host "Download: https://visualstudio.microsoft.com/downloads/" -ForegroundColor Yellow
    exit 1
}

Write-Host "Visual Studio encontrado: $($vsPath.FullName)" -ForegroundColor Green

# Navegar para o diretorio do ZLMediaKit
$zlmPath = "C:\Users\GouveiaRx\Downloads\NewCAM\backend\zlmediakit\ZLMediaKit"
Set-Location $zlmPath

Write-Host "Diretorio atual: $(Get-Location)" -ForegroundColor Blue

# Criar diretorio de build
if (Test-Path "build") {
    Write-Host "Removendo diretorio build existente..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force "build"
}

New-Item -ItemType Directory -Name "build" | Out-Null
Set-Location "build"

Write-Host "Configurando projeto com CMake..." -ForegroundColor Blue

# Configurar com CMake
try {
    & cmake .. -G "Visual Studio 16 2019" -A x64 -DCMAKE_BUILD_TYPE=Release -DENABLE_WEBRTC=false -DENABLE_FFMPEG=false -DENABLE_TESTS=false -DENABLE_API=true
    
    if ($LASTEXITCODE -ne 0) {
        throw "CMake configuration failed"
    }
    
    Write-Host "Configuracao CMake concluida com sucesso" -ForegroundColor Green
    
} catch {
    Write-Host "Erro na configuracao CMake: $_" -ForegroundColor Red
    Write-Host "Tentando configuracao alternativa..." -ForegroundColor Yellow
    
    # Tentar configuracao mais simples
    & cmake .. -DCMAKE_BUILD_TYPE=Release -DENABLE_WEBRTC=false -DENABLE_FFMPEG=false -DENABLE_TESTS=false
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Configuracao CMake falhou completamente" -ForegroundColor Red
        exit 1
    }
}

Write-Host "Compilando projeto..." -ForegroundColor Blue

# Compilar
try {
    & cmake --build . --config Release --target MediaServer
    
    if ($LASTEXITCODE -ne 0) {
        throw "Build failed"
    }
    
    Write-Host "Compilacao concluida com sucesso!" -ForegroundColor Green
    
} catch {
    Write-Host "Erro na compilacao: $_" -ForegroundColor Red
    Write-Host "Tentando compilacao completa..." -ForegroundColor Yellow
    
    & cmake --build . --config Release
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Compilacao falhou completamente" -ForegroundColor Red
        exit 1
    }
}

# Verificar se o MediaServer foi criado
$mediaServerPath = Get-ChildItem -Recurse -Name "MediaServer.exe" -ErrorAction SilentlyContinue

if ($mediaServerPath) {
    Write-Host "MediaServer compilado com sucesso!" -ForegroundColor Green
    Write-Host "Localizacao: $mediaServerPath" -ForegroundColor Blue
    
    # Copiar para um local mais acessivel
    $targetDir = "$zlmPath\release\windows\Release"
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    
    Copy-Item $mediaServerPath $targetDir -Force
    Copy-Item "$zlmPath\conf\config.ini" $targetDir -Force
    Copy-Item "$zlmPath\default.pem" $targetDir -Force
    
    Write-Host "Arquivos copiados para: $targetDir" -ForegroundColor Green
    
} else {
    Write-Host "MediaServer.exe nao foi encontrado apos a compilacao" -ForegroundColor Red
    Write-Host "Listando arquivos gerados:" -ForegroundColor Yellow
    Get-ChildItem -Recurse -Name "*.exe" | ForEach-Object { Write-Host "  - $_" }
    exit 1
}

Write-Host "Compilacao do ZLMediaKit concluida!" -ForegroundColor Green
Write-Host "Para iniciar o MediaServer, execute:" -ForegroundColor Blue
Write-Host "   cd $targetDir" -ForegroundColor Gray
Write-Host "   .\MediaServer.exe" -ForegroundColor Gray