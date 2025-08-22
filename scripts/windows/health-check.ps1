Write-Host "=== NewCAM Health Check ==="

$total = 0
$passed = 0

Write-Host "`nVerificando dependencias..."
$total = 3
if (Get-Command node -ErrorAction SilentlyContinue) { Write-Host "OK node instalado"; $passed++ } else { Write-Host "ERRO node nao instalado" }
if (Get-Command npm -ErrorAction SilentlyContinue) { Write-Host "OK npm instalado"; $passed++ } else { Write-Host "ERRO npm nao instalado" }
if (Get-Command git -ErrorAction SilentlyContinue) { Write-Host "OK git instalado"; $passed++ } else { Write-Host "ERRO git nao instalado" }

Write-Host "`nVerificando arquivos..."
$total = $total + 4
if (Test-Path ".env.example") { Write-Host "OK .env.example existe"; $passed++ } else { Write-Host "ERRO .env.example nao encontrado" }
if (Test-Path "backend/package.json") { Write-Host "OK backend/package.json existe"; $passed++ } else { Write-Host "ERRO backend/package.json nao encontrado" }
if (Test-Path "frontend/package.json") { Write-Host "OK frontend/package.json existe"; $passed++ } else { Write-Host "ERRO frontend/package.json nao encontrado" }
if (Test-Path "docker-compose.yml") { Write-Host "OK docker-compose.yml existe"; $passed++ } else { Write-Host "ERRO docker-compose.yml nao encontrado" }

Write-Host "`nVerificando diretorios..."
$total = $total + 4
if (Test-Path "backend") { Write-Host "OK backend existe"; $passed++ } else { Write-Host "ERRO backend nao encontrado" }
if (Test-Path "frontend") { Write-Host "OK frontend existe"; $passed++ } else { Write-Host "ERRO frontend nao encontrado" }
if (Test-Path "storage") { Write-Host "OK storage existe"; $passed++ } else { Write-Host "ERRO storage nao encontrado" }
if (Test-Path "docs") { Write-Host "OK docs existe"; $passed++ } else { Write-Host "ERRO docs nao encontrado" }

Write-Host "`nVerificando permissoes..."
$total = $total + 1
try {
    if (-not (Test-Path "storage")) { New-Item -ItemType Directory -Path "storage" -Force }
    "test" | Out-File "storage/test.txt" -Force
    Remove-Item "storage/test.txt" -Force
    Write-Host "OK permissoes de escrita OK"
    $passed++
} catch {
    Write-Host "ERRO problemas de permissao"
}

Write-Host "`nVerificando configuracoes..."
$total = $total + 2
if (Test-Path "backend/jest.config.mjs") { Write-Host "OK Jest configurado"; $passed++ } else { Write-Host "ERRO Jest nao configurado" }
if (Test-Path "backend/prisma/schema.prisma") { Write-Host "OK Prisma configurado"; $passed++ } else { Write-Host "ERRO Prisma nao configurado" }

Write-Host "`n=== Resumo ==="
Write-Host "Verificacoes: $passed/$total"

if ($passed -eq $total) {
    Write-Host "OK Sistema configurado corretamente!"
    exit 0
} else {
    Write-Host "ERRO Sistema tem problemas"
    exit 1
}