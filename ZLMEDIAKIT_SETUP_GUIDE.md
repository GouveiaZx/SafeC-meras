# Guia de Instalação e Configuração do ZLMediaKit no Windows

## Visão Geral

O ZLMediaKit é um servidor de streaming de mídia de alta performance que suporta múltiplos protocolos (RTSP/RTMP/HLS/HTTP-FLV/WebRTC). Este guia mostra como baixar, instalar e configurar o ZLMediaKit no Windows para integração com o sistema de câmeras.

## Pré-requisitos

- Windows 10 ou superior (64-bit)
- Acesso à internet para download
- Permissões de administrador (para configuração de firewall)

## Passo 1: Download do ZLMediaKit

### Opção A: Download da Issue #483 (Recomendado)

1. Acesse a issue oficial com binários pré-compilados:
   ```
   https://github.com/ZLMediaKit/ZLMediaKit/issues/483
   ```

2. Procure pelo comentário mais recente do `github-actions` com:
   - **Plataforma**: Windows
   - **Branch**: master
   - **Data**: mais recente disponível

3. Clique no link de download (formato: `Windows_master_YYYY-MM-DD`)

### Opção B: Compilação Manual (Avançado)

Se não houver binários Windows recentes na issue #483:

1. Clone o repositório:
   ```powershell
   git clone https://github.com/ZLMediaKit/ZLMediaKit.git
   cd ZLMediaKit
   git submodule update --init
   ```

2. Compile usando Visual Studio 2017+ (consulte a documentação oficial)

## Passo 2: Extração e Configuração

1. **Extrair o arquivo baixado**:
   - Extraia o arquivo ZIP para uma pasta dedicada, ex: `C:\ZLMediaKit`
   - A estrutura deve conter pelo menos:
     ```
     C:\ZLMediaKit\
     ├── MediaServer.exe
     ├── config.ini (arquivo de configuração)
     └── outras DLLs necessárias
     ```

2. **Verificar arquivos essenciais**:
   ```powershell
   cd C:\ZLMediaKit
   dir MediaServer.exe
   ```

## Passo 3: Configuração do MediaServer

### 3.1 Configuração Básica

Crie ou edite o arquivo `config.ini` na pasta do ZLMediaKit:

```ini
[api]
# API HTTP para controle
apiDebug=1
secret=035c73f7-bb6b-4889-a715-d9eb2d1925cc

[general]
# Configurações gerais
mediaServerId=your_server_id

[hook]
# Webhooks para integração com o sistema
enable=1
on_flow_report=http://localhost:3002/api/webhooks/zlmediakit/flow_report
on_http_access=http://localhost:3002/api/webhooks/zlmediakit/http_access
on_play=http://localhost:3002/api/webhooks/zlmediakit/play
on_publish=http://localhost:3002/api/webhooks/zlmediakit/publish
on_record_mp4=http://localhost:3002/api/webhooks/zlmediakit/record_mp4
on_rtsp_auth=http://localhost:3002/api/webhooks/zlmediakit/rtsp_auth
on_rtsp_realm=http://localhost:3002/api/webhooks/zlmediakit/rtsp_realm
on_shell_login=http://localhost:3002/api/webhooks/zlmediakit/shell_login
on_stream_changed=http://localhost:3002/api/webhooks/zlmediakit/stream_changed
on_stream_none_reader=http://localhost:3002/api/webhooks/zlmediakit/stream_none_reader
on_stream_not_found=http://localhost:3002/api/webhooks/zlmediakit/stream_not_found
timeoutSec=10

[http]
# Servidor HTTP
charSet=utf-8
notFound=<html><head><title>404 Not Found</title></head><body bgcolor="white"><center><h1>您访问的资源不存在！</h1></center><hr><center>ZLMediaKit-4.0</center></body></html>
port=80
rootPath=./www
sslport=443

[multicast]
# Configurações multicast
udpTTL=64

[record]
# Configurações de gravação
appName=live
fileBufSize=65536
filePath=./www/record/
sampleMS=500

[rtmp]
# Servidor RTMP
handshakeSecond=15
keepAliveSecond=15
modifyStamp=1
port=1935
sslport=19350

[rtp]
# Configurações RTP
audioMtuSize=600
clearCount=10
cycleMS=46080000
maxRtpCount=50
videoMtuSize=1400

[rtsp]
# Servidor RTSP
authBasic=0
handshakeSecond=15
keepAliveSecond=15
port=554
sslport=322

[shell]
# Shell para controle
maxReqSize=4096
port=9000
```

### 3.2 Configuração de Portas

O ZLMediaKit usa as seguintes portas por padrão:
- **HTTP**: 80 (API e interface web)
- **HTTPS**: 443
- **RTSP**: 554
- **RTMP**: 1935
- **Shell**: 9000
- **RTP**: Portas dinâmicas

### 3.3 Configuração do Firewall

Abra as portas necessárias no Windows Firewall:

```powershell
# Executar como Administrador
New-NetFirewallRule -DisplayName "ZLMediaKit HTTP" -Direction Inbound -Protocol TCP -LocalPort 80
New-NetFirewallRule -DisplayName "ZLMediaKit HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443
New-NetFirewallRule -DisplayName "ZLMediaKit RTSP" -Direction Inbound -Protocol TCP -LocalPort 554
New-NetFirewallRule -DisplayName "ZLMediaKit RTMP" -Direction Inbound -Protocol TCP -LocalPort 1935
New-NetFirewallRule -DisplayName "ZLMediaKit Shell" -Direction Inbound -Protocol TCP -LocalPort 9000
```

## Passo 4: Inicialização e Teste

### 4.1 Iniciar o MediaServer

```powershell
# Navegar para a pasta do ZLMediaKit
cd C:\ZLMediaKit

# Iniciar o MediaServer
.\MediaServer.exe
```

### 4.2 Iniciar como Serviço (Opcional)

Para executar como serviço do Windows:

```powershell
# Instalar como serviço (executar como Administrador)
sc create ZLMediaKit binPath= "C:\ZLMediaKit\MediaServer.exe" start= auto
sc description ZLMediaKit "ZLMediaKit Media Server"

# Iniciar o serviço
sc start ZLMediaKit

# Verificar status
sc query ZLMediaKit
```

### 4.3 Verificar se está Funcionando

1. **Verificar processo**:
   ```powershell
   Get-Process MediaServer
   ```

2. **Testar API HTTP**:
   ```powershell
   # Testar endpoint de API
   Invoke-WebRequest -Uri "http://localhost/index/api/getApiList" -Method GET
   ```

3. **Verificar logs**:
   - Os logs aparecem no console onde o MediaServer foi iniciado
   - Procure por mensagens como "HTTP服务器启动成功" (Servidor HTTP iniciado com sucesso)

4. **Testar interface web**:
   - Abra o navegador e acesse: `http://localhost`
   - Deve aparecer a interface web do ZLMediaKit

## Passo 5: Integração com o Sistema de Câmeras

### 5.1 Verificar Webhooks

Certifique-se de que o backend do sistema de câmeras está rodando na porta 3002:

```powershell
# Verificar se o backend está rodando
netstat -an | findstr :3002
```

### 5.2 Testar Webhook

Teste se os webhooks estão funcionando:

```powershell
# Simular um webhook (substitua pela URL real)
Invoke-WebRequest -Uri "http://localhost:3002/api/webhooks/zlmediakit/stream_changed" -Method POST -ContentType "application/json" -Body '{"test": true}'
```

## Comandos Úteis

### Gerenciamento do Serviço

```powershell
# Iniciar MediaServer
cd C:\ZLMediaKit
.\MediaServer.exe

# Parar MediaServer (Ctrl+C no console ou)
Stop-Process -Name "MediaServer" -Force

# Verificar se está rodando
Get-Process MediaServer -ErrorAction SilentlyContinue

# Verificar portas em uso
netstat -an | findstr ":80\|:554\|:1935\|:9000"
```

### Gerenciamento como Serviço

```powershell
# Iniciar serviço
Start-Service ZLMediaKit

# Parar serviço
Stop-Service ZLMediaKit

# Verificar status
Get-Service ZLMediaKit

# Remover serviço (se necessário)
sc delete ZLMediaKit
```

### Logs e Depuração

```powershell
# Iniciar com logs detalhados
.\MediaServer.exe -d

# Verificar parâmetros disponíveis
.\MediaServer.exe -h
```

## Solução de Problemas

### Problema: MediaServer não inicia

1. **Verificar dependências**:
   - Certifique-se de que todas as DLLs estão presentes
   - Instale Visual C++ Redistributable se necessário

2. **Verificar portas**:
   ```powershell
   # Verificar se as portas estão em uso
   netstat -an | findstr ":80\|:554\|:1935"
   ```

3. **Executar como Administrador**:
   - Algumas portas (como 80 e 554) podem precisar de privilégios elevados

### Problema: Webhooks não funcionam

1. **Verificar conectividade**:
   ```powershell
   Test-NetConnection -ComputerName localhost -Port 3002
   ```

2. **Verificar configuração**:
   - Confirme que as URLs dos webhooks no `config.ini` estão corretas
   - Verifique se o backend está rodando e respondendo

### Problema: Streams não aparecem

1. **Verificar configuração de câmeras**:
   - Confirme que as câmeras estão configuradas para enviar stream para o ZLMediaKit
   - Verifique URLs RTSP/RTMP das câmeras

2. **Testar stream manual**:
   ```powershell
   # Usar ffmpeg para testar (se disponível)
   ffmpeg -re -i "rtsp://camera_ip:554/stream" -c copy -f rtmp rtmp://localhost:1935/live/test
   ```

## Próximos Passos

Após a instalação bem-sucedida:

1. **Configure as câmeras** para enviar streams para o ZLMediaKit
2. **Teste a gravação** de streams
3. **Configure backup** e monitoramento
4. **Otimize a performance** conforme necessário

## Recursos Adicionais

- **Documentação oficial**: https://docs.zlmediakit.com/
- **GitHub**: https://github.com/ZLMediaKit/ZLMediaKit
- **Issue com binários**: https://github.com/ZLMediaKit/ZLMediaKit/issues/483
- **API Reference**: Acesse `http://localhost/` após iniciar o MediaServer

---

**Nota**: Este guia assume integração com um sistema de câmeras rodando na porta 3002. Ajuste as configurações conforme sua arquitetura específica.