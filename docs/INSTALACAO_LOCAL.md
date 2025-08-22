# 🚀 Guia de Configuração e Inicialização do NewCAM - Ambiente Local

## 📋 Índice

1. [Pré-requisitos](#pré-requisitos)
2. [Configuração Inicial](#configuração-inicial)
3. [Configuração do Backend](#configuração-do-backend)
4. [Configuração do Frontend](#configuração-do-frontend)
5. [Configuração do Docker](#configuração-do-docker)
6. [Inicialização dos Serviços](#inicialização-dos-serviços)
7. [Verificação do Sistema](#verificação-do-sistema)
8. [Credenciais de Acesso](#credenciais-de-acesso)
9. [Troubleshooting](#troubleshooting)
10. [URLs de Acesso](#urls-de-acesso)

---

## 🔧 Pré-requisitos

Antes de iniciar, certifique-se de ter os seguintes softwares instalados:

### Softwares Obrigatórios

- **Node.js** (versão 18 ou superior)
  - Download: https://nodejs.org/
  - Verificar instalação: `node --version`

- **npm** (geralmente vem com Node.js)
  - Verificar instalação: `npm --version`

- **Docker Desktop** (para Windows)
  - Download: https://www.docker.com/products/docker-desktop/
  - Verificar instalação: `docker --version`

- **Git** (para controle de versão)
  - Download: https://git-scm.com/
  - Verificar instalação: `git --version`

### Verificação dos Pré-requisitos

Abra o PowerShell e execute os comandos abaixo para verificar se tudo está instalado:

```powershell
# Verificar Node.js
node --version

# Verificar npm
npm --version

# Verificar Docker
docker --version

# Verificar Docker Compose
docker compose --version

# Verificar Git
git --version
```

---

## ⚙️ Configuração Inicial

### 1. Clone ou Baixe o Projeto

Se você ainda não tem o projeto, clone-o ou extraia o arquivo ZIP:

```powershell
# Se usando Git
git clone <URL_DO_REPOSITORIO>
cd NewCAM

# Ou navegue até a pasta onde extraiu o ZIP
cd C:\caminho\para\NewCAM
```

### 2. Estrutura do Projeto

Após a configuração, seu projeto deve ter a seguinte estrutura:

```
NewCAM/
├── backend/                 # Servidor Node.js
├── frontend/               # Aplicação React/Vue
├── docker/                 # Configurações Docker
├── docs/                   # Documentação
├── scripts/                # Scripts de automação
├── worker/                 # Worker de processamento
├── storage/                # Armazenamento local
├── docker-compose.yml      # Configuração dos serviços
├── .env.example           # Exemplo de variáveis de ambiente
└── CONFIGURACAO_LOCALHOST.md # Este arquivo
```

---

## 🔧 Configuração do Backend

### 1. Navegue até o diretório do backend

```powershell
cd backend
```

### 2. Instale as dependências

```powershell
npm install
```

### 3. Configure as variáveis de ambiente

Copie o arquivo de exemplo e configure as variáveis:

```powershell
# Copiar arquivo de exemplo
copy .env.example .env
```

Edite o arquivo `.env` com as seguintes configurações mínimas:

```env
# Configurações do Servidor
PORT=3002
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:3002

# Configurações do Banco de Dados (Supabase Local)
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role
JWT_SECRET=seu_jwt_secret_muito_seguro_aqui
JWT_ANON_KEY=sua_chave_anon

# Configurações do ZLMediaKit
ZLMEDIAKIT_API_URL=http://localhost:8080/index/api
ZLMEDIAKIT_SECRET=035c73f7-bb6b-4889-a715-d9eb2d1925cc
ZLM_API_URL=http://localhost:8080/index/api
ZLM_SECRET=035c73f7-bb6b-4889-a715-d9eb2d1925cc

# Configurações de Armazenamento
RECORDINGS_PATH=../storage/www
UPLOAD_PATH=./uploads
STREAMS_PATH=../storage/www

# Configurações de Log
LOG_LEVEL=info
LOG_FILE=./logs/app.log

# Configurações de Segurança
WORKER_TOKEN=seu_worker_token_seguro
BCRYPT_SALT_ROUNDS=12
RATE_LIMIT_REQUESTS_PER_MINUTE=100

# Configurações de Retenção
RECORDING_RETENTION_DAYS=30
AUTO_DELETE_ENABLED=true
SEGMENTATION_INTERVAL_MINUTES=30
```

### 4. Crie os diretórios necessários

```powershell
# Criar diretórios de logs e uploads
mkdir -Force logs
mkdir -Force uploads
mkdir -Force ../storage/www
```

---

## 🎨 Configuração do Frontend

### 1. Navegue até o diretório do frontend

```powershell
cd ../frontend
```

### 2. Instale as dependências

```powershell
npm install
```

### 3. Configure as variáveis de ambiente (se necessário)

Se existir um arquivo `.env.example` no frontend:

```powershell
copy .env.example .env.local
```

Edite o arquivo `.env.local` com:

```env
VITE_API_URL=http://localhost:3002
VITE_WS_URL=ws://localhost:3002
```

---

## 🐳 Configuração do Docker

### 1. Volte para o diretório raiz

```powershell
cd ..
```

### 2. Verifique o arquivo docker-compose.yml

O arquivo `docker-compose.yml` já está configurado com os seguintes serviços:

- **PostgreSQL** (porta 5432) - Banco de dados
- **Redis** (porta 6379) - Cache e sessões
- **ZLMediaKit** (porta 8080) - Servidor de mídia
- **SRS** (porta 1985) - Servidor de streaming
- **Nginx** (porta 80) - Proxy reverso
- **MinIO** (portas 9000/9001) - Armazenamento S3

### 3. Crie os diretórios de dados

```powershell
# Criar diretórios para volumes Docker
mkdir -Force docker/data/postgres
mkdir -Force docker/data/redis
mkdir -Force docker/data/minio
mkdir -Force storage/www
```

---

## 🚀 Inicialização dos Serviços

### Passo 1: Iniciar Serviços Docker

Abra um terminal PowerShell como **Administrador** e execute:

```powershell
# Navegar até o diretório do projeto
cd C:\caminho\para\NewCAM

# Iniciar todos os serviços Docker
docker compose up -d

# Verificar se os serviços estão rodando
docker compose ps
```

**Saída esperada:**
```
NAME                STATUS              PORTS
nginx               Up 2 minutes        0.0.0.0:80->80/tcp
postgres            Up 2 minutes        0.0.0.0:5432->5432/tcp
processor           Up 2 minutes        
redis               Up 2 minutes        0.0.0.0:6379->6379/tcp
srs                 Up 2 minutes        0.0.0.0:1985->1985/tcp
zlm-registrar       Up 2 minutes        
zlmediakit          Up 2 minutes        0.0.0.0:8080->80/tcp
```

### Passo 2: Iniciar o Backend

Abra um **novo terminal** PowerShell:

```powershell
# Navegar até o backend
cd C:\caminho\para\NewCAM\backend

# Iniciar o servidor de desenvolvimento
npm run dev
```

**Saída esperada:**
```
🚀 Servidor iniciado na porta 3002
✅ Supabase configurado com sucesso
✅ AuthHealthService iniciado
✅ SegmentationService iniciado
🔄 Processamento automático agendado
```

### Passo 3: Iniciar o Frontend

Abra um **terceiro terminal** PowerShell:

```powershell
# Navegar até o frontend
cd C:\caminho\para\NewCAM\frontend

# Iniciar o servidor de desenvolvimento
npm run dev
```

**Saída esperada:**
```
  VITE v4.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

---

## ✅ Verificação do Sistema

### 1. Verificar Serviços Docker

```powershell
# Verificar status dos containers
docker compose ps

# Verificar logs se houver problemas
docker compose logs postgres
docker compose logs redis
docker compose logs zlmediakit
```

### 2. Verificar Backend

Abra o navegador e acesse:
- **Health Check**: http://localhost:3002/health
- **API Status**: http://localhost:3002/api/status

### 3. Verificar Frontend

Abra o navegador e acesse:
- **Aplicação**: http://localhost:5173/

### 4. Verificar ZLMediaKit

Abra o navegador e acesse:
- **Interface Web**: http://localhost:8080/

---

## 🔐 Credenciais de Acesso

### Usuário Administrador Padrão

- **Email**: `admin@newcam.com`
- **Senha**: `admin123`

### Credenciais dos Serviços

#### PostgreSQL (Local)
- **Host**: localhost
- **Porta**: 5432
- **Database**: newcam
- **Usuário**: postgres
- **Senha**: postgres123

#### Redis
- **Host**: localhost
- **Porta**: 6379
- **Senha**: (sem senha)

#### MinIO (S3 Local)
- **Console**: http://localhost:9001/
- **API**: http://localhost:9000/
- **Access Key**: minioadmin
- **Secret Key**: minioadmin123

#### ZLMediaKit
- **Interface**: http://localhost:8080/
- **API Secret**: 035c73f7-bb6b-4889-a715-d9eb2d1925cc

---

## 🔧 Troubleshooting

### Problemas Comuns

#### 1. Porta já em uso

**Erro**: `EADDRINUSE: address already in use :::3002`

**Solução**:
```powershell
# Verificar qual processo está usando a porta
netstat -ano | findstr :3002

# Matar o processo (substitua PID pelo número encontrado)
taskkill /PID <PID> /F
```

#### 2. Docker não está rodando

**Erro**: `Cannot connect to the Docker daemon`

**Solução**:
1. Abra o Docker Desktop
2. Aguarde até que o status seja "Running"
3. Tente novamente

#### 3. Dependências não instaladas

**Erro**: `Module not found`

**Solução**:
```powershell
# No backend
cd backend
npm install

# No frontend
cd ../frontend
npm install
```

#### 4. Problemas de permissão

**Erro**: `EACCES: permission denied`

**Solução**:
1. Execute o PowerShell como Administrador
2. Ou altere as permissões da pasta do projeto

#### 5. Banco de dados não conecta

**Erro**: `Connection refused`

**Solução**:
```powershell
# Verificar se o PostgreSQL está rodando
docker compose ps postgres

# Reiniciar o serviço se necessário
docker compose restart postgres
```

### Logs para Diagnóstico

```powershell
# Logs do backend
tail -f backend/logs/app.log

# Logs dos serviços Docker
docker compose logs -f postgres
docker compose logs -f redis
docker compose logs -f zlmediakit

# Logs do sistema (Windows)
Get-EventLog -LogName Application -Source "NewCAM*" -Newest 10
```

### Comandos de Reset

Se precisar reiniciar tudo do zero:

```powershell
# Parar todos os serviços
docker compose down

# Remover volumes (CUIDADO: apaga dados)
docker compose down -v

# Limpar cache do npm
npm cache clean --force

# Reinstalar dependências
cd backend
rm -rf node_modules
npm install

cd ../frontend
rm -rf node_modules
npm install

# Reiniciar serviços
cd ..
docker compose up -d
```

---

## 🌐 URLs de Acesso

### Aplicação Principal
- **Frontend**: http://localhost:5173/
- **Backend API**: http://localhost:3002/
- **Health Check**: http://localhost:3002/health

### Serviços de Infraestrutura
- **ZLMediaKit**: http://localhost:8080/
- **MinIO Console**: http://localhost:9001/
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

### Endpoints da API
- **Autenticação**: http://localhost:3002/api/auth/login
- **Usuários**: http://localhost:3002/api/users
- **Câmeras**: http://localhost:3002/api/cameras
- **Gravações**: http://localhost:3002/api/recordings
- **Dashboard**: http://localhost:3002/api/dashboard
- **Streaming**: http://localhost:3002/api/recordings/{id}/stream

---

## 📝 Comandos Úteis

### Gerenciamento de Serviços

```powershell
# Parar todos os serviços
docker compose down

# Iniciar todos os serviços
docker compose up -d

# Reiniciar um serviço específico
docker compose restart postgres

# Ver logs em tempo real
docker compose logs -f

# Ver status dos serviços
docker compose ps
```

### Desenvolvimento

```powershell
# Backend - modo desenvolvimento
cd backend
npm run dev

# Frontend - modo desenvolvimento
cd frontend
npm run dev

# Executar testes
npm test

# Build para produção
npm run build
```

### Banco de Dados

```powershell
# Conectar ao PostgreSQL
docker exec -it postgres psql -U postgres -d newcam

# Executar migrações
cd backend
npm run migrate

# Executar seeds
npm run seed

# Reset do banco
npm run db:reset
```

---

## 🎯 Próximos Passos

Após configurar o ambiente local:

1. **Teste o Login**: Acesse http://localhost:5173/ e faça login com as credenciais padrão
2. **Configure Câmeras**: Adicione suas câmeras RTSP no sistema
3. **Teste Gravações**: Inicie uma gravação e verifique se está funcionando
4. **Explore a API**: Use ferramentas como Postman para testar os endpoints
5. **Personalize**: Ajuste as configurações conforme suas necessidades

---

## 📞 Suporte

Se encontrar problemas:

1. Verifique os logs dos serviços
2. Consulte a seção de Troubleshooting
3. Verifique se todas as dependências estão instaladas
4. Certifique-se de que as portas não estão em conflito

---

**✅ Configuração concluída com sucesso!**

Seu ambiente de desenvolvimento NewCAM está pronto para uso. Acesse http://localhost:5173/ para começar a usar o sistema.