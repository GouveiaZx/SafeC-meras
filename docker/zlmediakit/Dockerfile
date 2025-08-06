# Multi-stage build para ZLMediaKit
FROM zlmediakit/zlmediakit:master as zlmbase

# Stage final com Python para o registrar
FROM python:3.9-slim

WORKDIR /app

# Instalar dependências do sistema
RUN apt-get update && apt-get install -y \
    curl \
    jq \
    supervisor \
    libssl3 \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s /lib/x86_64-linux-gnu/libssl.so.3 /lib/x86_64-linux-gnu/libssl.so.1.1 \
    && ln -s /lib/x86_64-linux-gnu/libcrypto.so.3 /lib/x86_64-linux-gnu/libcrypto.so.1.1

# Copiar o MediaServer do ZLMediaKit
COPY --from=zlmbase /opt/media/bin/MediaServer /opt/media/bin/MediaServer
COPY --from=zlmbase /opt/media/conf /opt/media/conf

# Copiar requirements e instalar dependências Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar script do registrador
COPY registrar.py .
COPY config.ini /opt/media/conf/config.ini

# Criar diretórios necessários
RUN mkdir -p /opt/media/bin/www/record/proxy \
    && mkdir -p /var/log/supervisor

# Configurar supervisor para executar ambos os serviços
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Expor portas
EXPOSE 80 554 1935 8080

# Comando para executar supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]