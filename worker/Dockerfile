FROM node:18-alpine

WORKDIR /app

# Copiar package.json e package-lock.json
COPY package*.json ./

# Instalar dependências
RUN npm install

# Copiar código fonte
COPY . .

# Criar diretórios necessários
RUN mkdir -p storage

# Comando para iniciar o worker
CMD ["npm", "start"]