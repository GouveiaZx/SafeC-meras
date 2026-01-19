# 📚 Documentação NewCAM

Bem-vindo ao centro de documentação do Sistema de Vigilância NewCAM. Aqui você encontra todos os guias, referências e informações técnicas necessárias.

## 🚀 Início Rápido

### Para Desenvolvedores
- **[🏠 Instalação Local](INSTALACAO_LOCAL.md)** - Configure o ambiente de desenvolvimento
- **[🪟 Windows](INSTALACAO_WINDOWS.md)** - Guia específico para Windows  
- **[🐧 Linux/macOS](INSTALLATION.md)** - Guia para sistemas Unix

### Para Produção
- **[🚀 Deploy de Produção](PRODUCTION_DEPLOYMENT_GUIDE.md)** - Guia completo de deploy
- **[📋 Resumo de Deploy](DEPLOY_SUMMARY.md)** - Resumo executivo do deploy
- **[🔧 Guia de Deploy](DEPLOY_GUIDE.md)** - Instruções detalhadas

---

## 📖 Documentação Técnica

### 🏗️ Arquitetura e Design
- **[🏗️ Arquitetura do Sistema](ARCHITECTURE.md)** - Visão geral da arquitetura
- **[⚙️ Variáveis de Ambiente](ENVIRONMENT.md)** - Configurações e variáveis
- **[🔧 API Reference](API_REFERENCE.md)** - Documentação completa da API

### 🛠️ Desenvolvimento
- **[💻 Deployment](DEPLOYMENT.md)** - Estratégias de deployment
- **[❓ Troubleshooting](TROUBLESHOOTING.md)** - Solução de problemas comuns

---

## 🐛 Correções e Melhorias

### 📋 Histórico de Correções
- **[✅ Correções Implementadas](CORREÇÕES_IMPLEMENTADAS.md)** - Log de correções aplicadas
- **[🔧 Fix Upload System](FIX_UPLOAD_SYSTEM.md)** - Correções no sistema de upload
- **[📊 Diagnóstico de Gravações](DIAGNOSTICO_GRAVACOES_SERVIDOR.md)** - Análise e correção de bugs de gravação

---

## 🔄 Operações e Manutenção

### 🖥️ Operações de Servidor
- **[💻 Comandos SSH Produção](COMANDOS_SSH_PRODUCAO.md)** - Comandos úteis para produção
- **[🔍 Comparação Servidor vs Local](SERVER_COMPARISON_REPORT.md)** - Análise comparativa
- **[🔄 Sincronização Servidor](SINCRONIZACAO_SERVIDOR_COMPLETA.md)** - Relatório de sincronização

---

## 📊 Funcionalidades

### 🎥 Sistema de Gravações
O NewCAM possui um sistema robusto de gravações com as seguintes características:

#### ✅ **Funcionalidades Ativas**
- **H264 Transcoding**: Conversão HEVC/H265 → H264 em tempo real
- **Auto-Start**: Gravações automáticas quando streams ficam online
- **Segmentação**: Intervalos de 30 minutos (1800 segundos)
- **Armazenamento**: MP4 em `storage/www/record/live/{camera_id}/{date}/`
- **Docker Integration**: ZLMediaKit integrado com host

#### 🔧 **Sistema Refatorado** (Agosto 2025)
- **Serviço Unificado**: `RecordingService.js` consolidado
- **Paths Normalizados**: Apenas paths relativos consistentes
- **Busca Simplificada**: Algoritmo direto de localização
- **Hooks Corrigidos**: `on_record_mp4` com paths normalizados
- **Player Otimizado**: Endpoints com fallbacks inteligentes

### 👥 Sistema de Usuários
- **CRUD Completo**: Criação, edição, ativação/desativação
- **Roles**: admin, integrator, client, viewer
- **Exportação**: CSV para relatórios
- **Reset de Senha**: Administrativo

### 🗃️ Sistema de Arquivo
- **Visualização**: Grid e lista com thumbnails
- **Filtros Avançados**: Por câmera, data, tipo, qualidade
- **Operações em Lote**: Seleção múltipla
- **Export Jobs**: Exportação assíncrona

---

## 🛡️ Segurança

### 🔒 Medidas Implementadas
- Autenticação JWT com Supabase
- CORS configurado adequadamente
- Rate limiting por endpoint
- Validação e sanitização de dados
- Headers de segurança HTTP
- Tokens de autenticação para workers

### 🔑 Credenciais Padrão
- **Email**: gouveiarx@gmail.com
- **Senha**: Teste123

---

## 🚨 Suporte e Troubleshooting

### Problemas Comuns
1. **Streaming não funciona**: Verificar ZLMediaKit e configurações de rede
2. **Gravações não aparecem**: Verificar webhooks e paths de arquivo
3. **Upload S3 falha**: Verificar credenciais Wasabi e conectividade
4. **Worker desconectado**: Verificar WORKER_TOKEN
5. **Database connection**: Verificar credenciais Supabase

### 🔧 Comandos de Diagnóstico
```bash
# Health checks
curl http://localhost:3002/health
curl http://localhost:3002/api/health

# Status dos containers
docker ps
docker-compose logs -f

# Logs da aplicação
pm2 logs (em produção)
npm run dev (desenvolvimento)
```

---

## 📁 Estrutura de Arquivos

```
NewCAM/
├── backend/           # API Node.js + Express
│   ├── src/
│   │   ├── controllers/   # Controladores da API
│   │   ├── services/      # Serviços de negócio
│   │   ├── routes/        # Rotas da API
│   │   ├── middleware/    # Middlewares
│   │   └── scripts/       # Scripts utilitários
│   ├── .env              # Configurações backend
│   └── package.json
│
├── frontend/          # Interface React + TypeScript
│   ├── src/
│   │   ├── components/    # Componentes reutilizáveis
│   │   ├── pages/         # Páginas da aplicação
│   │   ├── hooks/         # Custom hooks
│   │   ├── services/      # Clientes API
│   │   └── utils/         # Utilitários
│   └── package.json
│
├── worker/            # Processamento background
│   ├── src/
│   └── package.json
│
├── docker/            # Configurações Docker
│   ├── nginx/         # Configs Nginx
│   └── zlmediakit/    # Configs ZLMediaKit
│
├── scripts/           # Scripts de deploy e manutenção
├── storage/           # Armazenamento local
├── docs/              # Esta documentação
├── backup/            # Backups de arquivos antigos
└── supabase/          # Configurações do banco
```

---

## 📞 Contato e Contribuição

### 🤝 Como Contribuir
1. Leia a documentação relevante
2. Siga os padrões de código estabelecidos
3. Teste suas mudanças localmente
4. Documente novas funcionalidades
5. Submeta Pull Requests com descrição clara

### 📧 Suporte
- **Issues**: Use o sistema de issues do repositório
- **Documentação**: Consulte este guia primeiro
- **Logs**: Sempre inclua logs relevantes ao reportar problemas

---

**📚 Documentação atualizada em:** Setembro 2025  
**🔄 Última sincronização:** Sistema completamente atualizado com servidor de produção

*Esta documentação é mantida atualizada com as últimas mudanças e melhorias do sistema.*