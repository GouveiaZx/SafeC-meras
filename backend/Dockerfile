FROM node:18-alpine

# Instalar curl para healthcheck
RUN apk add --no-cache curl

WORKDIR /app

# Copiar package.json e package-lock.json
COPY package*.json ./

# Instalar dependências
RUN npm install

# Copiar código fonte
COPY . .

# Criar diretórios necessários
RUN mkdir -p storage/recordings storage/streams storage/exports storage/files uploads

# Expor porta
EXPOSE 3002

# Comando para iniciar a aplicação
CMD ["npm", "start"]