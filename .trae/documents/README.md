# 📹 NewCAM - Sistema de Monitoramento de Câmeras

## 🎯 Visão Geral

NewCAM é um sistema completo de monitoramento e streaming de câmeras IP em tempo real, desenvolvido com tecnologias modernas para oferecer alta performance, escalabilidade e facilidade de uso.

### ✨ Características Principais

- **Streaming em Tempo Real**: Suporte para RTSP e RTMP com baixa latência
- **Interface Moderna**: Frontend React com design responsivo e intuitivo
- **Arquitetura Escalável**: Backend Node.js com microserviços
- **Gravação Automática**: Sistema de gravação com retenção configurável
- **Monitoramento Inteligente**: Detecção automática de status das câmeras
- **Autenticação Segura**: Sistema completo de login e permissões
- **Auto-configuração**: Detecção automática de configurações de câmeras
- **Interface Simplificada**: Cadastro de câmeras otimizado e intuitivo

## 🚀 Início Rápido

### Pré-requisitos
- Node.js 18+
- npm ou yarn
- PostgreSQL (via Supabase)
- ZLMediaKit
- Redis (opcional)

### Instalação

1. **Clone o repositório**
```bash
git clone <repository-url>
cd NewCAM
```

2. **Configure o backend**
```bash
cd backend
npm install
cp .env.example .env
# Edite o arquivo .env com suas configurações
```

3. **Configure o frontend**
```bash
cd ../frontend
npm install
```

4. **Configure o worker**
```bash
cd ../worker
npm install
```

5. **Execute as migrações**
```bash
cd ../backend
node run_migrations.js
```

6. **Inicie os serviços**
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev

# Terminal 3 - Worker
cd worker
npm run dev
```

### ⚡ Acesso Rápido
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **ZLMediaKit**: http://localhost:8000

## 📁 Estrutura do Projeto

```
NewCAM/
├── 📂 frontend/                 # Aplicação React
│   ├── 📂 src/
│   │   ├── 📂 components/       # Componentes reutilizáveis
│   │   ├── 📂 pages/           # Páginas da aplicação
│   │   ├── 📂 services/        # Serviços e APIs
│   │   └── 📂 types/           # Definições TypeScript
│   └── 📄 package.json
├── 📂 backend/                  # API Node.js
│   ├── 📂 src/
│   │   ├── 📂 controllers/     # Controladores
│   │   ├── 📂 services/        # Lógica de negócio
│   │   ├── 📂 routes/          # Rotas da API
│   │   └── 📂 middleware/      # Middlewares
│   ├── 📂 storage/             # Armazenamento local
│   └── 📄 package.json
├── 📂 worker/                   # Worker process
├── 📂 .trae/documents/          # Documentação completa
├── 📂 docker/                   # Configurações Docker
└── 📄 README.md
```

## 🔧 Configuração

### Variáveis de Ambiente

Configure as seguintes variáveis no arquivo `.env`:

```env
# Servidor
PORT=3000
NODE_ENV=development

# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# JWT
JWT_SECRET=your_jwt_secret

# ZLMediaKit (IMPORTANTE: Use apenas ZLM_SECRET)
ZLM_SECRET=your_zlm_secret
ZLMEDIAKIT_API_URL=http://localhost:8000
ZLMEDIAKIT_RTSP_PORT=8554
ZLMEDIAKIT_RTMP_PORT=1935

# SRS (opcional)
SRS_API_URL=http://localhost:1985
SRS_RTMP_PORT=1935

# Redis (opcional)
REDIS_URL=redis://localhost:6379

# Storage
WASABI_ACCESS_KEY=your_wasabi_access_key
WASABI_SECRET_KEY=your_wasabi_secret_key
WASABI_BUCKET=your_bucket_name
WASABI_REGION=us-east-1
```

### ⚠️ Configurações Importantes

- **ZLM_SECRET**: Use apenas esta variável (não ZLMEDIAKIT_SECRET)
- **URLs de Câmeras**: O sistema detecta automaticamente o tipo (RTSP/RTMP)
- **IP das Câmeras**: Extraído automaticamente da URL fornecida

## 🛠️ Troubleshooting

### ✅ Problemas Resolvidos Recentemente

#### ✅ Erro HTTP 400 ao Iniciar Streams RTMP
**Status**: **CORRIGIDO** ✅
- **Problema**: Erro HTTP 400 ao tentar iniciar streams de câmeras RTMP
- **Solução**: Corrigida detecção automática do `stream_type` baseada na URL
- **Resultado**: Streams RTMP agora iniciam corretamente após cadastro

#### ✅ Conflito ZLM_SECRET vs ZLMEDIAKIT_SECRET
**Status**: **CORRIGIDO** ✅
- **Problema**: Conflito entre variáveis de ambiente causando erro HTTP 500
- **Solução**: Padronizado para usar apenas `ZLM_SECRET`
- **Resultado**: Comunicação estável com ZLMediaKit

#### ✅ Interface de Cadastro Simplificada
**Status**: **ATUALIZADO** ✅
- **Mudança**: Removido campo "Endereço IP" dos formulários
- **Mudança**: Removidos seletores de qualidade de gravação e player
- **Resultado**: Interface mais limpa e processo de cadastro simplificado

### 🔧 Problemas Comuns

#### ZLMediaKit não responde
```bash
# Verificar se está rodando
curl http://localhost:8000/index/api/getServerConfig

# Verificar logs
tail -f /var/log/zlmediakit.log

# Reiniciar serviço
sudo systemctl restart zlmediakit
```

#### Câmeras não conectam
```bash
# Testar URL RTSP
ffprobe -v quiet -print_format json -show_format "rtsp://user:pass@ip:port/stream"

# Testar com VLC
vlc "rtsp://user:pass@ip:port/stream"
```

#### Streams não iniciam
- Verifique os logs do backend: `tail -f backend/logs/app.log`
- Confirme conectividade com ZLMediaKit
- Verifique se a URL da câmera está correta
- Teste a câmera individualmente

## 📚 Documentação Completa

### 📖 Documentos Principais
- **[📋 Documentação Master](.trae/documents/DOCUMENTACAO_MASTER_NEWCAM.md)** - Documentação completa do projeto
- **[🚀 Guia de Inicialização](.trae/documents/GUIA_INICIALIZACAO_NEWCAM.md)** - Como começar rapidamente
- **[🔧 Correções Realizadas](.trae/documents/CORRECOES_REALIZADAS_NEWCAM.md)** - Histórico de correções
- **[🛠️ Troubleshooting](.trae/documents/TROUBLESHOOTING_NEWCAM.md)** - Solução de problemas

### 📋 Documentos Técnicos
- **[🏗️ Arquitetura Técnica](.trae/documents/ARQUITETURA_TECNICA_NEWCAM.md)** - Detalhes da arquitetura
- **[⚙️ Configuração Técnica](.trae/documents/CONFIGURACAO_TECNICA_NEWCAM.md)** - Configurações avançadas
- **[📊 Resumo Executivo](.trae/documents/RESUMO_EXECUTIVO_NEWCAM.md)** - Visão geral para gestores

### 🎯 Acesso Rápido
- **Instalação**: Consulte o [Guia de Inicialização](.trae/documents/GUIA_INICIALIZACAO_NEWCAM.md)
- **Problemas**: Consulte o [Troubleshooting](.trae/documents/TROUBLESHOOTING_NEWCAM.md)
- **Arquitetura**: Consulte a [Documentação Master](.trae/documents/DOCUMENTACAO_MASTER_NEWCAM.md)

## 📈 Status do Projeto

### ✅ Funcionalidades Implementadas
- ✅ Sistema de streaming RTSP/RTMP
- ✅ Interface de cadastro simplificada
- ✅ Auto-detecção de configurações
- ✅ Monitoramento em tempo real
- ✅ Gravação automática
- ✅ Dashboard de métricas
- ✅ Sistema de autenticação

### 🔄 Melhorias Recentes (v2.1.0)
- ✅ **Corrigido**: Erro HTTP 400 em streams RTMP
- ✅ **Removido**: Campo endereço IP (auto-extraído da URL)
- ✅ **Removido**: Seletores de qualidade (configuração automática)
- ✅ **Melhorado**: Interface mais limpa e intuitiva
- ✅ **Corrigido**: Conflito de variáveis ZLM_SECRET

## 🤝 Contribuição

Contribuições são bem-vindas! Por favor:

1. Fork o projeto
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Abra um Pull Request

Consulte a [Documentação Master](.trae/documents/DOCUMENTACAO_MASTER_NEWCAM.md) para guidelines detalhadas.

## 📄 Licença

Este projeto está licenciado sob a [MIT License](LICENSE).

---

**📹 NewCAM v2.1.0** - Sistema Completo de Mon