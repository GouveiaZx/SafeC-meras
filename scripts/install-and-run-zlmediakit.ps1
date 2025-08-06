# Script automatizado para instalar e executar ZLMediaKit no Windows
# NewCAM - Sistema de Monitoramento
# Versão: 1.0.0

param(
    [switch]$SkipDownload,
    [switch]$ForceReinstall,
    [string]$Version = "latest"
)

# Configurações
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$ZLM_DIR = "C:\zlmediakit"
$ZLM_BIN_DIR = "$ZLM_DIR\bin"
$ZLM_CONF_DIR = "$ZLM_DIR\conf"
$ZLM_WWW_DIR = "$ZLM_DIR\www"
$ZLM_EXECUTABLE = "$ZLM_BIN_DIR\MediaServer.exe"
$CONFIG_SOURCE = "$PSScriptRoot\..\docker\zlmediakit\config.ini"
$CONFIG_DEST = "$ZLM_CONF_DIR\config.ini"
$GITHUB_API_URL = "https://api.github.com/repos/ZLMediaKit/ZLMediaKit/releases"
$DOWNLOAD_DIR = "$env:TEMP\zlmediakit-download"

# Função para logging
function Write-Log {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $color = switch ($Level) {
        "ERROR" { "Red" }
        "WARN" { "Yellow" }
        "SUCCESS" { "Green" }
        default { "White" }
    }
    Write-Host "[$timestamp] [$Level] $Message" -ForegroundColor $color
}

# Função para verificar se o processo está rodando
function Test-ZLMediaKitRunning {
    $process = Get-Process -Name "MediaServer" -ErrorAction SilentlyContinue
    return $null -ne $process
}

# Função para parar ZLMediaKit se estiver rodando
function Stop-ZLMediaKit {
    if (Test-ZLMediaKitRunning) {
        Write-Log "Parando ZLMediaKit em execução..." "WARN"
        Get-Process -Name "MediaServer" | Stop-Process -Force
        Start-Sleep -Seconds 2
    }
}

# Função para obter a URL de download mais recente
function Get-LatestDownloadUrl {
    try {
        Write-Log "Obtendo informações da versão mais recente..."
        $releases = Invoke-RestMethod -Uri $GITHUB_API_URL -Headers @{"User-Agent" = "NewCAM-Installer"}
        
        if ($Version -eq "latest") {
            $release = $releases[0]
        } else {
            $release = $releases | Where-Object { $_.tag_name -eq $Version } | Select-Object -First 1
            if (-not $release) {
                throw "Versão $Version não encontrada"
            }
        }
        
        $asset = $release.assets | Where-Object { $_.name -like "*win64*.zip" } | Select-Object -First 1
        if (-not $asset) {
            throw "Asset win64 não encontrado na release $($release.tag_name)"
        }
        
        Write-Log "Versão encontrada: $($release.tag_name)" "SUCCESS"
        return @{
            Url = $asset.browser_download_url
            Name = $asset.name
            Version = $release.tag_name
        }
    } catch {
        Write-Log "Erro ao obter informações de release: $($_.Exception.Message)" "ERROR"
        throw
    }
}

# Função para baixar ZLMediaKit
function Download-ZLMediaKit {
    param($DownloadInfo)
    
    try {
        $zipPath = "$DOWNLOAD_DIR\$($DownloadInfo.Name)"
        
        # Criar diretório de download
        if (-not (Test-Path $DOWNLOAD_DIR)) {
            New-Item -ItemType Directory -Path $DOWNLOAD_DIR -Force | Out-Null
        }
        
        # Verificar se já foi baixado
        if ((Test-Path $zipPath) -and -not $ForceReinstall) {
            Write-Log "Arquivo já existe: $zipPath" "WARN"
            return $zipPath
        }
        
        Write-Log "Baixando ZLMediaKit $($DownloadInfo.Version)..."
        Write-Log "URL: $($DownloadInfo.Url)"
        
        # Download com progress
        $webClient = New-Object System.Net.WebClient
        $webClient.DownloadFile($DownloadInfo.Url, $zipPath)
        
        if (-not (Test-Path $zipPath)) {
            throw "Falha no download: arquivo não encontrado"
        }
        
        $fileSize = (Get-Item $zipPath).Length / 1MB
        Write-Log "Download concluído: $([math]::Round($fileSize, 2)) MB" "SUCCESS"
        
        return $zipPath
    } catch {
        Write-Log "Erro no download: $($_.Exception.Message)" "ERROR"
        throw
    }
}

# Função para extrair ZLMediaKit
function Extract-ZLMediaKit {
    param($ZipPath)
    
    try {
        Write-Log "Extraindo ZLMediaKit..."
        
        # Parar serviço se estiver rodando
        Stop-ZLMediaKit
        
        # Remover diretório existente se ForceReinstall
        if ($ForceReinstall -and (Test-Path $ZLM_DIR)) {
            Write-Log "Removendo instalação anterior..." "WARN"
            Remove-Item -Path $ZLM_DIR -Recurse -Force
        }
        
        # Criar estrutura de diretórios
        @($ZLM_DIR, $ZLM_BIN_DIR, $ZLM_CONF_DIR, $ZLM_WWW_DIR) | ForEach-Object {
            if (-not (Test-Path $_)) {
                New-Item -ItemType Directory -Path $_ -Force | Out-Null
                Write-Log "Diretório criado: $_"
            }
        }
        
        # Extrair arquivo
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [System.IO.Compression.ZipFile]::ExtractToDirectory($ZipPath, $DOWNLOAD_DIR)
        
        # Encontrar diretório extraído
        $extractedDir = Get-ChildItem -Path $DOWNLOAD_DIR -Directory | Where-Object { $_.Name -like "*ZLMediaKit*" -or $_.Name -like "*win64*" } | Select-Object -First 1
        
        if (-not $extractedDir) {
            throw "Diretório extraído não encontrado"
        }
        
        Write-Log "Diretório extraído: $($extractedDir.FullName)"
        
        # Copiar arquivos para destino final
        $sourceFiles = Get-ChildItem -Path $extractedDir.FullName -Recurse
        foreach ($file in $sourceFiles) {
            $relativePath = $file.FullName.Substring($extractedDir.FullName.Length + 1)
            $destPath = Join-Path $ZLM_BIN_DIR $relativePath
            
            if ($file.PSIsContainer) {
                if (-not (Test-Path $destPath)) {
                    New-Item -ItemType Directory -Path $destPath -Force | Out-Null
                }
            } else {
                $destDir = Split-Path $destPath -Parent
                if (-not (Test-Path $destDir)) {
                    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
                }
                Copy-Item -Path $file.FullName -Destination $destPath -Force
            }
        }
        
        Write-Log "Extração concluída" "SUCCESS"
        
    } catch {
        Write-Log "Erro na extração: $($_.Exception.Message)" "ERROR"
        throw
    }
}

# Função para copiar configuração
function Copy-Configuration {
    try {
        Write-Log "Copiando configuração..."
        
        if (Test-Path $CONFIG_SOURCE) {
            Copy-Item -Path $CONFIG_SOURCE -Destination $CONFIG_DEST -Force
            Write-Log "Configuração copiada de: $CONFIG_SOURCE" "SUCCESS"
        } else {
            Write-Log "Arquivo de configuração não encontrado, criando configuração padrão..." "WARN"
            
            $defaultConfig = @'
[api]
secret=035c73f7-bb6b-4889-a715-d9eb2d1925cc
apiDebug=1

[general]
enableVhost=0
flowThreshold=1024
maxStreamWaitMS=15000
mediaServerId=NewCAM-ZLM
modifyStamp=1

[hls]
segDur=2
segNum=3
segRetain=5
fileBufSize=65536
filePath=./www

[hook]
enable=1
on_flow_report=http://localhost:3002/api/hook/on_flow_report
on_http_access=http://localhost:3002/api/hook/on_http_access
on_play=http://localhost:3002/api/hook/on_play
on_publish=http://localhost:3002/api/hook/on_publish
on_record_mp4=http://localhost:3002/api/hook/on_record_mp4
on_rtsp_auth=http://localhost:3002/api/hook/on_rtsp_auth
on_rtsp_realm=http://localhost:3002/api/hook/on_rtsp_realm
on_server_started=http://localhost:3002/api/hook/on_server_started
on_shell_login=http://localhost:3002/api/hook/on_shell_login
on_stream_changed=http://localhost:3002/api/hook/on_stream_changed
on_stream_none_reader=http://localhost:3002/api/hook/on_stream_none_reader
on_stream_not_found=http://localhost:3002/api/hook/on_stream_not_found
timeoutSec=10

[http]
charSet=utf-8
keepAliveSecond=30
maxReqSize=40960
notFound=<html><head><title>404 Not Found</title></head><body><center><h1>Resource not found</h1></center></body></html>
port=8080
rootPath=./www
sslport=443

[record]
appName=record
filePath=./www
fileRepeat=0
fileSecond=3600
fastStart=0
sampleMS=500

[rtmp]
handshakeSecond=15
keepAliveSecond=15
modifyStamp=0
port=1935
sslport=19350

[rtp]
audioMtuSize=1400
clearCount=10
cycleMS=46800000
maxRtpCount=50
videoMtuSize=1400

[rtsp]
authBasic=0
handshakeSecond=15
keepAliveSecond=15
port=554
sslport=322

[shell]
maxReqSize=1024
port=9000
'@
            
            $defaultConfig | Out-File -FilePath $CONFIG_DEST -Encoding UTF8
            Write-Log "Configuração padrão criada" "SUCCESS"
        }
        
    } catch {
        Write-Log "Erro ao copiar configuração: $($_.Exception.Message)" "ERROR"
        throw
    }
}

# Função para criar script de inicialização
function Create-StartScript {
    $startScript = @'
@echo off
echo Iniciando ZLMediaKit...
cd /d "C:\zlmediakit\bin"
start "ZLMediaKit" MediaServer.exe -c "../conf/config.ini"
echo ZLMediaKit iniciado!
echo API disponivel em: http://localhost:8080/index/api/
echo HLS disponivel em: http://localhost:8080/
echo RTMP disponivel em: rtmp://localhost:1935/
echo RTSP disponivel em: rtsp://localhost:554/
pause
'@
    
    $startScriptPath = "$ZLM_DIR\start-zlmediakit.bat"
    $startScript | Out-File -FilePath $startScriptPath -Encoding ASCII
    Write-Log "Script de inicialização criado: $startScriptPath" "SUCCESS"
    
    # Criar também versão PowerShell
    $psStartScript = @'
# Script PowerShell para iniciar ZLMediaKit
Write-Host "Iniciando ZLMediaKit..." -ForegroundColor Green
Set-Location "C:\zlmediakit\bin"
Start-Process -FilePath "MediaServer.exe" -ArgumentList "-c", "../conf/config.ini" -WindowStyle Normal
Write-Host "ZLMediaKit iniciado!" -ForegroundColor Green
Write-Host "API disponivel em: http://localhost:8080/index/api/" -ForegroundColor Yellow
Write-Host "HLS disponivel em: http://localhost:8080/" -ForegroundColor Yellow
Write-Host "RTMP disponivel em: rtmp://localhost:1935/" -ForegroundColor Yellow
Write-Host "RTSP disponivel em: rtsp://localhost:554/" -ForegroundColor Yellow
'@
    
    $psStartScriptPath = "$ZLM_DIR\start-zlmediakit.ps1"
    $psStartScript | Out-File -FilePath $psStartScriptPath -Encoding UTF8
    Write-Log "Script PowerShell criado: $psStartScriptPath" "SUCCESS"
}

# Função para testar instalação
function Test-Installation {
    try {
        Write-Log "Verificando instalação..."
        
        # Verificar se executável existe
        if (-not (Test-Path $ZLM_EXECUTABLE)) {
            throw "MediaServer.exe não encontrado em: $ZLM_EXECUTABLE"
        }
        
        # Verificar se configuração existe
        if (-not (Test-Path $CONFIG_DEST)) {
            throw "Arquivo de configuração não encontrado em: $CONFIG_DEST"
        }
        
        Write-Log "Instalação verificada com sucesso" "SUCCESS"
        return $true
        
    } catch {
        Write-Log "Erro na verificação: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

# Função para iniciar ZLMediaKit
function Start-ZLMediaKit {
    try {
        Write-Log "Iniciando ZLMediaKit..."
        
        # Verificar se já está rodando
        if (Test-ZLMediaKitRunning) {
            Write-Log "ZLMediaKit já está em execução" "WARN"
            return
        }
        
        # Mudar para diretório do executável
        Set-Location $ZLM_BIN_DIR
        
        # Iniciar processo
        $process = Start-Process -FilePath $ZLM_EXECUTABLE -ArgumentList "-c", "../conf/config.ini" -PassThru -WindowStyle Normal
        
        # Aguardar um pouco para verificar se iniciou
        Start-Sleep -Seconds 3
        
        if ($process.HasExited) {
            throw "ZLMediaKit falhou ao iniciar (código de saída: $($process.ExitCode))"
        }
        
        Write-Log "ZLMediaKit iniciado com sucesso (PID: $($process.Id))" "SUCCESS"
        
        # Aguardar um pouco mais e testar conectividade
        Start-Sleep -Seconds 2
        
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:8080/index/api/getApiList?secret=035c73f7-bb6b-4889-a715-d9eb2d1925cc" -TimeoutSec 10
            if ($response.StatusCode -eq 200) {
                Write-Log "API ZLMediaKit respondendo corretamente" "SUCCESS"
            }
        } catch {
            Write-Log "API ainda não está respondendo (normal nos primeiros segundos)" "WARN"
        }
        
    } catch {
        Write-Log "Erro ao iniciar ZLMediaKit: $($_.Exception.Message)" "ERROR"
        throw
    }
}

# Função principal
function Main {
    try {
        Write-Log "=== INSTALAÇÃO AUTOMÁTICA DO ZLMEDIAKIT ===" "SUCCESS"
        Write-Log "Versão do script: 1.0.0"
        Write-Log "Data: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        Write-Log ""
        
        # Verificar se já está instalado
        if ((Test-Path $ZLM_EXECUTABLE) -and -not $ForceReinstall) {
            Write-Log "ZLMediaKit já está instalado em: $ZLM_DIR" "WARN"
            Write-Log "Use -ForceReinstall para reinstalar"
            
            if (Test-Installation) {
                Write-Log "Instalação existente válida, iniciando..." "SUCCESS"
                Start-ZLMediaKit
                return
            }
        }
        
        # Download
        if (-not $SkipDownload) {
            $downloadInfo = Get-LatestDownloadUrl
            $zipPath = Download-ZLMediaKit -DownloadInfo $downloadInfo
            Extract-ZLMediaKit -ZipPath $zipPath
        }
        
        # Configuração
        Copy-Configuration
        Create-StartScript
        
        # Verificação
        if (-not (Test-Installation)) {
            throw "Falha na verificação da instalação"
        }
        
        # Iniciar
        Start-ZLMediaKit
        
        Write-Log "" 
        Write-Log "=== INSTALAÇÃO CONCLUÍDA COM SUCESSO ===" "SUCCESS"
        Write-Log "Diretório de instalação: $ZLM_DIR"
        Write-Log "Executável: $ZLM_EXECUTABLE"
        Write-Log "Configuração: $CONFIG_DEST"
        Write-Log ""
        Write-Log "URLs de acesso:"
        Write-Log "- API: http://localhost:8080/index/api/"
        Write-Log "- HLS: http://localhost:8080/"
        Write-Log "- RTMP: rtmp://localhost:1935/"
        Write-Log "- RTSP: rtsp://localhost:554/"
        Write-Log ""
        Write-Log "Para parar: Get-Process MediaServer | Stop-Process"
        Write-Log "Para reiniciar: & '$ZLM_DIR\start-zlmediakit.ps1'"
        
    } catch {
        Write-Log "ERRO FATAL: $($_.Exception.Message)" "ERROR"
        Write-Log "Stack trace: $($_.ScriptStackTrace)" "ERROR"
        exit 1
    } finally {
        # Limpeza
        if (Test-Path $DOWNLOAD_DIR) {
            try {
                Remove-Item -Path $DOWNLOAD_DIR -Recurse -Force
                Write-Log "Arquivos temporários removidos"
            } catch {
                Write-Log "Aviso: Não foi possível remover arquivos temporários: $DOWNLOAD_DIR" "WARN"
            }
        }
    }
}

# Executar script principal
Main