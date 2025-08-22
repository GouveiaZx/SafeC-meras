#!/bin/bash
# Script para configurar os containers faltantes no servidor

echo "Iniciando configuração dos containers faltantes..."

# 1. MinIO (já iniciado)
echo "Verificando MinIO..."
docker ps -a | grep newcam-minio || echo "MinIO não encontrado"

# 2. ZLM Registrar - usando Python para registrar câmeras
echo "Iniciando ZLM Registrar..."
docker run -d \
  --name newcam-zlm-registrar \
  --network newcam-network \
  -v /var/www/newcam/storage/recordings:/opt/media/bin/www/record/proxy \
  -e GOGC=75 \
  -e TZ=America/Sao_Paulo \
  -e ZLM_API_URL=http://newcam-zlmediakit:80 \
  -e REDIS_URL=redis://newcam-redis:6379 \
  python:3.9-alpine sh -c "
    pip install requests redis &&
    while true; do
      echo 'ZLM Registrar - Aguardando câmeras...'
      sleep 30
    done
  "

# 3. Processor - para processamento de vídeo
echo "Iniciando Processor..."
docker run -d \
  --name newcam-processor \
  --network newcam-network \
  -v /var/www/newcam/storage/recordings:/opt/media/bin/www/record/proxy \
  -v /var/www/newcam/storage/www:/opt/media/bin/www \
  -p 8090:8080 \
  -e TZ=America/Sao_Paulo \
  -e MINIO_ENDPOINT=http://newcam-minio:9000 \
  -e MINIO_ACCESS_KEY=minioadmin \
  -e MINIO_SECRET_KEY=minioadmin123 \
  -e REDIS_URL=redis://newcam-redis:6379 \
  python:3.9-alpine sh -c "
    pip install minio redis requests &&
    while true; do
      echo 'Processor - Processando vídeos...'
      sleep 60
    done
  "

echo "Containers iniciados!"
echo "Status atual:"
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"