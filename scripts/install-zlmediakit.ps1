# Script para instalar e configurar ZLMediaKit no Windows
# NewCAM - Sistema de Monitoramento

Write-Host "Instalando ZLMediaKit para NewCAM..." -ForegroundColor Green

# Criar diretório para ZLMediaKit
$zlmDir = "C:\zlmediakit"
if (!(Test-Path $zlmDir)) {
    New-Item -ItemType Directory -Path $zlmDir -Force
    Write-Host "Diretorio criado: $zlmDir" -ForegroundColor Yellow
}

# Criar estrutura de diretórios
$binDir = "$zlmDir\bin"
$confDir = "$zlmDir\conf"
$wwwDir = "$zlmDir\www"

New-Item -ItemType Directory -Path $binDir -Force
New-Item -ItemType Directory -Path $confDir -Force
New-Item -ItemType Directory -Path $wwwDir -Force

Write-Host "Estrutura de diretorios criada" -ForegroundColor Yellow

# Copiar arquivo de configuração
$configSource = "C:\Users\GouveiaRx\Downloads\NewCAM\docker\zlmediakit\config.ini"
$configDest = "$zlmDir\conf\config.ini"

if (Test-Path $configSource) {
    Copy-Item $configSource $configDest -Force
    Write-Host "Arquivo de configuracao copiado" -ForegroundColor Green
} else {
    Write-Host "Arquivo de configuracao nao encontrado, criando configuracao basica..." -ForegroundColor Yellow
    
    # Criar configuração básica
    $basicConfig = @'
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
on_flow_report=http://localhost:3001/api/hook/on_flow_report
on_http_access=http://localhost:3001/api/hook/on_http_access
on_play=http://localhost:3001/api/hook/on_play
on_publish=http://localhost:3001/api/hook/on_publish
on_record_mp4=http://localhost:3001/api/hook/on_record_mp4
on_rtsp_auth=http://localhost:3001/api/hook/on_rtsp_auth
on_rtsp_realm=http://localhost:3001/api/hook/on_rtsp_realm
on_server_started=http://localhost:3001/api/hook/on_server_started
on_shell_login=http://localhost:3001/api/hook/on_shell_login
on_stream_changed=http://localhost:3001/api/hook/on_stream_changed
on_stream_none_reader=http://localhost:3001/api/hook/on_stream_none_reader
on_stream_not_found=http://localhost:3001/api/hook/on_stream_not_found
timeoutSec=10

[http]
charSet=utf-8
keepAliveSecond=30
maxReqSize=40960
notFound=<html><head><title>404 Not Found</title></head><body><center><h1>Resource not found</h1></center></body></html>
port=8080
rootPath=./www
sslport=443

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
    
    $basicConfig | Out-File -FilePath $configDest -Encoding UTF8
    Write-Host "Configuracao basica criada" -ForegroundColor Green
}

Write-Host ""
Write-Host "Instalacao concluida!" -ForegroundColor Green
Write-Host "Para baixar o ZLMediaKit:" -ForegroundColor Yellow
Write-Host "1. Acesse: https://github.com/ZLMediaKit/ZLMediaKit/releases" -ForegroundColor White
Write-Host "2. Baixe ZLMediaKit_win64.zip" -ForegroundColor White
Write-Host "3. Extraia para: C:\zlmediakit" -ForegroundColor White
Write-Host ""
Write-Host "URLs de acesso:" -ForegroundColor Yellow
Write-Host "- API: http://localhost:8080/index/api/" -ForegroundColor White
Write-Host "- HLS: http://localhost:8080/" -ForegroundColor White
Write-Host "- RTMP: rtmp://localhost:1935/" -ForegroundColor White
Write-Host "- RTSP: rtsp://localhost:554/" -ForegroundColor White