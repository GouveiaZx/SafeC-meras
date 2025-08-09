# Script PowerShell para testar a API de gravações

$BACKEND_URL = "http://localhost:3002"

Write-Host "🔐 Fazendo login..." -ForegroundColor Yellow

# Login
$loginBody = @{
    email = "gouveiarx@gmail.com"
    password = "Teste123"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$BACKEND_URL/api/auth/login" -Method POST -Body $loginBody -ContentType "application/json"
    
    if ($loginResponse.success) {
        Write-Host "✅ Login realizado com sucesso" -ForegroundColor Green
        $token = $loginResponse.data.token
        
        # Testar API /api/recordings
        Write-Host "`n📋 Testando API /api/recordings..." -ForegroundColor Yellow
        
        $headers = @{
            "Authorization" = "Bearer $token"
            "Content-Type" = "application/json"
        }
        
        $recordingsResponse = Invoke-RestMethod -Uri "$BACKEND_URL/api/recordings" -Method GET -Headers $headers
        
        Write-Host "Resposta:" -ForegroundColor Cyan
        $recordingsResponse | ConvertTo-Json -Depth 10
        
        if ($recordingsResponse.success -and $recordingsResponse.data) {
            Write-Host "`n✅ Encontradas $($recordingsResponse.data.Count) gravações" -ForegroundColor Green
            
            for ($i = 0; $i -lt $recordingsResponse.data.Count; $i++) {
                $recording = $recordingsResponse.data[$i]
                Write-Host "$($i + 1). ID: $($recording.id)"
                Write-Host "   Câmera: $($recording.camera_id)"
                Write-Host "   Status: $($recording.status)"
                Write-Host "   Criado em: $($recording.created_at)"
                Write-Host "   Duração: $($recording.duration)s"
                Write-Host "   Tamanho: $($recording.file_size) bytes"
                Write-Host "---"
            }
        } else {
            Write-Host "❌ Nenhuma gravação encontrada ou erro na resposta" -ForegroundColor Red
        }
        
    } else {
        Write-Host "❌ Falha no login: $($loginResponse.message)" -ForegroundColor Red
    }
    
} catch {
    Write-Host "❌ Erro: $($_.Exception.Message)" -ForegroundColor Red
}