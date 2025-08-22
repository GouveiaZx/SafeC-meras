# Script para instalar e configurar ZLMediaKit no Windows
# NewCAM - Sistema de Monitoramento

param(
    [string]$InstallPath = (Join-Path $env:ProgramData 'ZLMediaKit'),
    [string]$WebhookHost = "localhost",
    [int]$WebhookPort = 3002,
    [string]$ProjectPath = $null,
    [int]$HttpPort = 8080,
    [int]$RtmpPort = 1935,
    [int]$RtspPort = 554,
    [int]$SslPort = 443,
    [int]$RtmpSslPort = 19350,
    [int]$RtspSslPort = 322
)

Write-Host "Instalando ZLMediaKit para NewCAM..." -ForegroundColor Green

# Detectar automaticamente o caminho do projeto se não fornecido
if ([string]::IsNullOrEmpty($ProjectPath)) {
    $scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
    $ProjectPath = Split-Path -Parent $scriptPath
    Write-Host "Caminho do projeto detectado: $ProjectPath" -ForegroundColor Cyan
}

# Logar parâmetros selecionados
Write-Host "Parâmetros de instalação:" -ForegroundColor Cyan
Write-Host " - InstallPath: $InstallPath" -ForegroundColor White
Write-Host " - Webhook: http://$WebhookHost:$WebhookPort" -ForegroundColor White
Write-Host " - HttpPort: $HttpPort | RtspPort: $RtspPort | RtmpPort: $RtmpPort" -ForegroundColor White
Write-Host " - SSL Http: $SslPort | RTSP SSL: $RtspSslPort | RTMP SSL: $RtmpSslPort" -ForegroundColor White

# Criar diretório para ZLMediaKit
if (!(Test-Path $InstallPath)) {
    New-Item -ItemType Directory -Path $InstallPath -Force
    Write-Host "Diretorio criado: $InstallPath" -ForegroundColor Yellow
}

# Criar estrutura de diretórios
$binDir = "$InstallPath\bin"
$confDir = "$InstallPath\conf"
$wwwDir = "$InstallPath\www"

New-Item -ItemType Directory -Path $binDir -Force
New-Item -ItemType Directory -Path $confDir -Force
New-Item -ItemType Directory -Path $wwwDir -Force

Write-Host "Estrutura de diretorios criada" -ForegroundColor Yellow

# Copiar arquivo de configuração
$configSource = Join-Path $ProjectPath "docker\zlmediakit\config.ini"
$configDest = "$InstallPath\conf\config.ini"

if (Test-Path $configSource) {
    Copy-Item $configSource $configDest -Force
    Write-Host "Arquivo de configuracao copiado" -ForegroundColor Green
} else {
    Write-Host "Arquivo de configuracao nao encontrado, criando configuracao basica..." -ForegroundColor Yellow
    
    # Criar configuração básica
    $basicConfig = @"
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
on_flow_report=http://$WebhookHost:$WebhookPort/api/webhooks/on_flow_report
on_http_access=http://$WebhookHost:$WebhookPort/api/webhooks/on_http_access
on_play=http://$WebhookHost:$WebhookPort/api/webhooks/on_play
on_publish=http://$WebhookHost:$WebhookPort/api/webhooks/on_publish
on_record_mp4=http://$WebhookHost:$WebhookPort/api/webhooks/on_record_mp4
on_rtsp_auth=http://$WebhookHost:$WebhookPort/api/webhooks/on_rtsp_auth
on_rtsp_realm=http://$WebhookHost:$WebhookPort/api/webhooks/on_rtsp_realm
on_server_started=http://$WebhookHost:$WebhookPort/api/webhooks/on_server_started
on_shell_login=http://$WebhookHost:$WebhookPort/api/webhooks/on_shell_login
on_stream_changed=http://$WebhookHost:$WebhookPort/api/webhooks/on_stream_changed
on_stream_none_reader=http://$WebhookHost:$WebhookPort/api/webhooks/on_stream_none_reader
on_stream_not_found=http://$WebhookHost:$WebhookPort/api/webhooks/on_stream_not_found
timeoutSec=10

[http]
charSet=utf-8
keepAliveSecond=30
maxReqSize=40960
notFound=<html><head><title>404 Not Found</title></head><body><center><h1>Resource not found</h1></center></body></html>
port=$HttpPort
rootPath=./www
sslport=$SslPort

[multicast]
addrMax=239.255.255.255
addrMin=239.0.0.0
udpTTL=64

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
port=$RtmpPort
sslport=$RtmpSslPort

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
port=$RtspPort
sslport=$RtspSslPort

[shell]
maxReqSize=1024
port=9000
"@
    
    $basicConfig | Out-File -FilePath $configDest -Encoding UTF8
    Write-Host "Configuracao basica criada" -ForegroundColor Green
}

Write-Host ""
Write-Host "Instalacao concluida!" -ForegroundColor Green
Write-Host "Para baixar o ZLMediaKit:" -ForegroundColor Yellow
Write-Host "1. Acesse: https://github.com/ZLMediaKit/ZLMediaKit/releases" -ForegroundColor White
Write-Host "2. Baixe ZLMediaKit_win64.zip" -ForegroundColor White
Write-Host "3. Extraia para: $InstallPath" -ForegroundColor White
Write-Host "" -ForegroundColor White
Write-Host "URLs de acesso:" -ForegroundColor Yellow
Write-Host "- API: http://localhost:$HttpPort/index/api/" -ForegroundColor White
Write-Host "- HLS: http://localhost:$HttpPort/" -ForegroundColor White
Write-Host "- RTMP: rtmp://localhost:$RtmpPort/" -ForegroundColor White
Write-Host "- RTSP: rtsp://localhost:$RtspPort/" -ForegroundColor White