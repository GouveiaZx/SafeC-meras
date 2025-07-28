# Script para instalar e configurar SRS no Windows
# NewCAM - Sistema de Monitoramento

Write-Host "Instalando SRS (Simple Realtime Server) para NewCAM..." -ForegroundColor Green

# Criar diretório para SRS
$srsDir = "C:\srs"
if (!(Test-Path $srsDir)) {
    New-Item -ItemType Directory -Path $srsDir -Force
    Write-Host "Diretorio criado: $srsDir" -ForegroundColor Yellow
}

# Criar estrutura de diretórios
$confDir = "$srsDir\conf"
$logsDir = "$srsDir\logs"
$objsDir = "$srsDir\objs"
$htmlDir = "$srsDir\objs\nginx\html"

New-Item -ItemType Directory -Path $confDir -Force
New-Item -ItemType Directory -Path $logsDir -Force
New-Item -ItemType Directory -Path $objsDir -Force
New-Item -ItemType Directory -Path $htmlDir -Force

Write-Host "Estrutura de diretorios criada" -ForegroundColor Yellow

# Copiar arquivo de configuração
$configSource = "C:\Users\GouveiaRx\Downloads\NewCAM\docker\srs\srs.conf"
$configDest = "$srsDir\conf\srs.conf"

if (Test-Path $configSource) {
    Copy-Item $configSource $configDest -Force
    Write-Host "Arquivo de configuracao copiado" -ForegroundColor Green
} else {
    Write-Host "Arquivo de configuracao nao encontrado, criando configuracao basica..." -ForegroundColor Yellow
    
    # Criar configuração básica do SRS
    $basicConfig = @'
listen              1935;
max_connections      1000;
srs_log_tank         file;
srs_log_level        trace;
srs_log_file         ./logs/srs.log;
daemon               off;
utc_time             false;
work_dir             ./;
pid                  ./objs/srs.pid;

# HTTP API configuration
http_api {
    enabled         on;
    listen          1985;
    crossdomain     on;
}

# HTTP Server configuration
http_server {
    enabled         on;
    listen          8080;
    dir             ./objs/nginx/html;
    crossdomain     on;
}

# RTMP configuration
vhost __defaultVhost__ {
    # Enable HLS
    hls {
        enabled         on;
        hls_path        ./objs/nginx/html;
        hls_fragment    2;
        hls_window      10;
        hls_on_error    ignore;
        hls_storage     disk;
        hls_wait_keyframe on;
        hls_acodec      aac;
        hls_vcodec      h264;
        hls_cleanup     on;
        hls_dispose     30;
        hls_nb_notify   10;
        hls_m3u8_file   [app]/[stream].m3u8;
        hls_ts_file     [app]/[stream]-[seq].ts;
    }
    
    # Enable HTTP-FLV
    http_remux {
        enabled     on;
        mount       [vhost]/[app]/[stream].flv;
    }
    
    # Play settings
    play {
        gop_cache       on;
        queue_length    10;
        time_jitter     full;
        mix_correct     off;
        atc             off;
        atc_auto        off;
        mw_latency      100;
        mw_msgs         0;
        realtime        off;
        send_min_interval 10.0;
        reduce_sequence_header on;
    }
    
    # Publish settings
    publish {
        parse_sps       on;
        mr              off;
        mr_latency      350;
        firstpkt_timeout 20000;
        normal_timeout  5000;
        kickoff_for_optimize on;
    }
    
    # Chunk size
    chunk_size      60000;
    
    # TCP nodelay
    tcp_nodelay     on;
    
    # Min latency
    min_latency     on;
    
    # Publish 1st packet timeout
    publish_1stpkt_timeout 20000;
    
    # Publish normal packet timeout
    publish_normal_timeout 5000;
}
'@
    
    $basicConfig | Out-File -FilePath $configDest -Encoding UTF8
    Write-Host "Configuracao basica criada" -ForegroundColor Green
}

# Criar script de inicialização
$startScript = @'
@echo off
echo Iniciando SRS...
cd /d C:\srs
if exist srs.exe (
    srs.exe -c conf\srs.conf
) else (
    echo Erro: srs.exe nao encontrado!
    echo Baixe o SRS de: https://github.com/ossrs/srs/releases
    echo Procure por srs-windows-x64-*.zip
    echo Extraia para: C:\srs
    pause
)
'@

$startScript | Out-File -FilePath "$srsDir\start-srs.bat" -Encoding ASCII

Write-Host "Script de inicializacao criado: $srsDir\start-srs.bat" -ForegroundColor Green

# Criar script PowerShell para inicialização
$psStartScript = @'
# Script PowerShell para iniciar SRS
Write-Host "Iniciando SRS..." -ForegroundColor Green

$srsPath = "C:\srs"
$srsExe = "$srsPath\srs.exe"
$configFile = "$srsPath\conf\srs.conf"

Set-Location $srsPath

if (Test-Path $srsExe) {
    Write-Host "SRS iniciando..." -ForegroundColor Yellow
    Write-Host "- RTMP: rtmp://localhost:1935/" -ForegroundColor Cyan
    Write-Host "- HTTP-FLV: http://localhost:8080/" -ForegroundColor Cyan
    Write-Host "- API: http://localhost:1985/api/v1/" -ForegroundColor Cyan
    & $srsExe -c $configFile
} else {
    Write-Host "srs.exe nao encontrado!" -ForegroundColor Red
    Write-Host "Baixe o SRS de: https://github.com/ossrs/srs/releases" -ForegroundColor Yellow
    Write-Host "Procure por srs-windows-x64-*.zip" -ForegroundColor Yellow
    Write-Host "Extraia para: C:\srs" -ForegroundColor Yellow
}
'@

$psStartScript | Out-File -FilePath "$srsDir\start-srs.ps1" -Encoding UTF8

Write-Host "Script PowerShell criado: $srsDir\start-srs.ps1" -ForegroundColor Green

Write-Host ""
Write-Host "Instalacao concluida!" -ForegroundColor Green
Write-Host "Para baixar o SRS:" -ForegroundColor Yellow
Write-Host "1. Acesse: https://github.com/ossrs/srs/releases" -ForegroundColor White
Write-Host "2. Baixe srs-windows-x64-*.zip" -ForegroundColor White
Write-Host "3. Extraia para: C:\srs" -ForegroundColor White
Write-Host ""
Write-Host "URLs de acesso:" -ForegroundColor Yellow
Write-Host "- RTMP: rtmp://localhost:1935/" -ForegroundColor White
Write-Host "- HTTP-FLV: http://localhost:8080/" -ForegroundColor White
Write-Host "- API: http://localhost:1985/api/v1/" -ForegroundColor White
Write-Host "- HLS: http://localhost:8080/live/stream.m3u8" -ForegroundColor White