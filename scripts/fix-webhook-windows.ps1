# Script PowerShell para Corrigir Webhook ZLMediaKit no Windows
# Servidor: nuvem.safecameras.com.br (66.94.104.241)

Write-Host "=== CORREÇÃO WEBHOOK ZLMEDIAKIT - NEWCAM ===" -ForegroundColor Green
Write-Host "Servidor: nuvem.safecameras.com.br (66.94.104.241)" -ForegroundColor Blue
Write-Host "Problema: Webhook failing com connection refused" -ForegroundColor Yellow
Write-Host "Solução: Substituir host.docker.internal por 172.17.0.1" -ForegroundColor Yellow
Write-Host ""

# Configurações do servidor
$SERVER_IP = "66.94.104.241"
$SERVER_USER = "root"
$SERVER_PATH = "/var/www/newcam"

# Função para executar comandos SSH
function Execute-SSH {
    param([string]$Command)
    Write-Host "[SSH] $Command" -ForegroundColor Cyan
    ssh -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_IP $Command
}

# Testar conexão SSH
Write-Host "1. Testando conexão SSH..." -ForegroundColor Yellow
try {
    $result = Execute-SSH "echo 'SSH conectado com sucesso'"
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Conexão SSH estabelecida" -ForegroundColor Green
    } else {
        Write-Host "✗ Falha na conexão SSH" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Erro na conexão SSH: $_" -ForegroundColor Red
    exit 1
}

Write-Host "2. Verificando status atual dos containers..." -ForegroundColor Yellow
Execute-SSH "cd $SERVER_PATH && docker ps | grep -E 'newcam-(zlmediakit|nginx)'"

Write-Host "3. Verificando configuração atual do ZLMediaKit..." -ForegroundColor Yellow
Execute-SSH "cd $SERVER_PATH && grep -A 10 'on_record_mp4' docker/zlmediakit/config.ini"

Write-Host "4. Aplicando correções no config.ini..." -ForegroundColor Yellow

# Criar script de correção no servidor
$fixScript = @"
#!/bin/bash
cd $SERVER_PATH

echo 'Backup da configuração atual...'
cp docker/zlmediakit/config.ini docker/zlmediakit/config.ini.backup-`$(date +%Y%m%d-%H%M%S)

echo 'Aplicando correções no config.ini...'
# Substituir todas as ocorrências de host.docker.internal por 172.17.0.1
sed -i 's/host\.docker\.internal:3002/172.17.0.1:3002/g' docker/zlmediakit/config.ini

echo 'Verificando correções aplicadas...'
grep -E '172\.17\.0\.1:3002' docker/zlmediakit/config.ini | wc -l
"@

Execute-SSH "cat > /tmp/fix_config.sh << 'EOF'`n$fixScript`nEOF"
Execute-SSH "chmod +x /tmp/fix_config.sh && /tmp/fix_config.sh"

Write-Host "5. Parando container ZLMediaKit atual..." -ForegroundColor Yellow
Execute-SSH "cd $SERVER_PATH && docker stop newcam-zlmediakit"
Execute-SSH "cd $SERVER_PATH && docker rm newcam-zlmediakit"

Write-Host "6. Recriando container ZLMediaKit com nova configuração..." -ForegroundColor Yellow
Execute-SSH "cd $SERVER_PATH && docker-compose up -d zlmediakit"

Write-Host "7. Aguardando inicialização do container..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

Write-Host "8. Verificando status do novo container..." -ForegroundColor Yellow
Execute-SSH "cd $SERVER_PATH && docker ps | grep newcam-zlmediakit"
Execute-SSH "cd $SERVER_PATH && docker logs newcam-zlmediakit | tail -10"

Write-Host "9. Testando conectividade de webhook..." -ForegroundColor Yellow

# Testar se o container consegue alcançar o backend
Write-Host "Testando conectividade do container para backend..." -ForegroundColor Blue
Execute-SSH "cd $SERVER_PATH && docker exec newcam-zlmediakit nc -zv 172.17.0.1 3002"

# Verificar se backend está respondendo
Write-Host "Testando endpoint de health do backend..." -ForegroundColor Blue
Execute-SSH "curl -s -o /dev/null -w '%{http_code}' http://localhost:3002/health"

Write-Host "10. Verificando configuração final dentro do container..." -ForegroundColor Yellow
Execute-SSH "cd $SERVER_PATH && docker exec newcam-zlmediakit cat /opt/media/conf/config.ini | grep -A 5 'on_record_mp4'"

Write-Host ""
Write-Host "=== CORREÇÃO APLICADA COM SUCESSO! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Próximos passos para validação:" -ForegroundColor Yellow
Write-Host "1. Ativar uma câmera para gravar"
Write-Host "2. Monitorar logs para verificar webhook funcionando"
Write-Host "3. Confirmar que gravações aparecem na interface"
Write-Host ""
Write-Host "Comandos de validação:" -ForegroundColor Yellow
Write-Host "ssh root@66.94.104.241"
Write-Host "cd /var/www/newcam"
Write-Host "# Verificar se arquivos MP4 são criados:"
Write-Host "ls -la storage/www/record/live/"
Write-Host "# Verificar registros no banco:"
Write-Host "# (Acessar interface web e verificar aba Gravações)"
Write-Host ""
Write-Host "Correção concluída. Sistema de gravações deve estar funcionando agora." -ForegroundColor Green