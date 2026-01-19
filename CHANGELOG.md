# 📋 Changelog - Sistema NewCAM

Todas as mudanças importantes deste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

---

## [Unreleased]

### Adicionado
- Sistema de changelog para documentar mudanças futuras

---

## [2.1.0] - 2025-01-11

### 🚀 Migração para Novo Servidor de Produção

#### 🌐 Infraestrutura
- **Novo Servidor**: Migração completa para 186.233.4.8 (Janeiro 2025)
- **Servidor Anterior Descontinuado**: 66.94.104.241 (nuvem.safecameras.com.br)
- **Paths Atualizados**: `/var/www/newcam` → `/root/NewCAM`
- **Logs Centralizados**: PM2 logs agora em `/root/NewCAM/storage/logs/`

#### 📝 Documentação Nova
- **`docs/NEW_SERVER_DEPLOYMENT.md`**: Guia completo de deploy passo a passo (500+ linhas)
  - Especificações do servidor
  - Pré-requisitos e instalação
  - Procedimento de deploy em 8 fases
  - Migração de dados do servidor antigo
  - Verificação pós-deploy
  - Procedimentos de rollback
  - Troubleshooting detalhado
- **`docs/COMANDOS_SSH_PRODUCAO.md`**: Atualizado com novo servidor (282 linhas)
  - Comandos SSH para 186.233.4.8
  - Variáveis de ambiente para produção
  - Monitoramento e troubleshooting
- **`.env.production.template`**: Template consolidado para backend, frontend e worker
  - Todas as variáveis de ambiente documentadas
  - Configurações específicas para 186.233.4.8
  - Instruções de uso

#### ⚙️ Configurações Atualizadas
- **`backend/src/config/cors.js`**:
  - Adicionado whitelist para 186.233.4.8
  - Removidas referências ao servidor antigo
  - Mantida compatibilidade com desenvolvimento local
- **`frontend/src/config/streaming.json`**:
  - Separação de ambientes `development` e `production`
  - URLs atualizadas para novo servidor
  - ZLMediaKit configurado para 186.233.4.8:8000
- **`frontend/src/components/VideoPlayer.tsx`**:
  - Removido hardcoded `nuvem.safecameras.com.br`
  - Usa variáveis de ambiente (`VITE_ZLM_BASE_URL`)
  - Fallbacks inteligentes para streaming
- **`frontend/src/services/api.ts`**:
  - Removido hardcoded redirect URL
  - Usa `window.location.origin` dinamicamente
- **`ecosystem.config.js`**:
  - Host atualizado para 186.233.4.8
  - Paths atualizados para `/root/NewCAM`
  - Logs redirecionados para storage interno
- **`nginx.production.conf`**:
  - Configurado para HTTP em 186.233.4.8
  - HSTS desabilitado (sem HTTPS por padrão)
  - Instruções para adicionar domínio e SSL
  - Frontend servido de `/root/NewCAM/frontend/dist`
- **`docker/nginx/nginx.conf`**:
  - Server name atualizado para 186.233.4.8

#### 🧹 Organização e Limpeza
- **Arquivamento**:
  - Movido `backup/` → `archives/backup-2025-01-11/` (~1-2GB)
  - Movido `test-results/` → `archives/test-results-2025-01-11/`
- **Deletado**:
  - Arquivos temporários (nul, storagelogswrite-test.txt)
  - Documentação desatualizada do servidor antigo
  - `docs/DEPLOY_SUMMARY.md`, `docs/SERVER_COMPARISON_REPORT.md`
- **README.md**:
  - Mapeamento de portas atualizado para 186.233.4.8
  - Nota sobre descontinuação do servidor antigo

#### ✅ Sistema de Testes
- **132/132 testes passando (100%)**
- FASE 7 (Performance): 10/10 ✅
- FASE 8 (Security): 12/12 ✅
- Rate limiting configurável via `RATE_LIMIT_MAX`
- Payload limit de 1MB com erro 413
- Validação de senhas comuns implementada

#### 🔧 Melhorias de Configuração
- **Variáveis de Ambiente**:
  - Desenvolvimento: `RATE_LIMIT_MAX=10000` (permite testes)
  - Produção: `RATE_LIMIT_MAX=100` (segurança)
- **Endpoints**:
  - Adicionado `GET /api/health` público
  - Health checks sem autenticação

---

## [2.0.0] - 2025-09-09

### 🚀 MAJOR RELEASE - Sincronização Completa com Servidor de Produção

#### ✨ Adicionado
- **📚 Documentação Completa**: 10+ documentos técnicos migrados do servidor
- **🔧 Scripts de Deploy**: 17 scripts automatizados para produção e manutenção
- **👥 Sistema de Usuários Avançado**: 
  - CRUD completo com roles (admin, integrator, client, viewer)
  - Exportação CSV de usuários
  - Reset de senhas administrativo
  - Validação completa de formulários
- **🗃️ Sistema de Arquivo Melhorado**:
  - Visualização em grid e lista com thumbnails
  - Filtros avançados por câmera, data, tipo, qualidade
  - Operações em lote (batch operations)
  - Sistema de exportação assíncrona (export jobs)
  - Delete em lote com confirmação
- **🎥 Sistema de Gravações Refatorado**:
  - Serviço unificado `RecordingService.js`
  - Paths normalizados e consistentes
  - Algoritmo de busca simplificado
  - Hooks corrigidos para `on_record_mp4`
  - Player otimizado com fallbacks inteligentes
- **📊 Novas APIs**:
  - `PUT /api/users/:id/status` - Ativar/desativar usuários
  - `POST /api/users/:id/reset-password` - Reset administrativo
  - `GET /api/users/export` - Exportação CSV
  - `DELETE /api/recordings/multiple` - Delete em lote
  - `POST /api/recordings/export` - Exportação assíncrona
  - `GET /api/recordings/export/:id/status` - Status de export
- **🔒 Análise de Segurança**: Verificação completa contra malware e backdoors
- **📁 Estrutura Organizada**: Reorganização completa do projeto

#### 🔧 Corrigido
- **Sistema de Gravações**: Webhooks ZLMediaKit corrigidos
- **Upload S3**: Queue implementada com retry automático
- **Duplicatas Removidas**: Sistema de prevenção de registros duplicados
- **H264 Transcoding**: Compatibilidade com browsers garantida
- **Webhooks**: Debouncing melhorado (5s + locks de concorrência)
- **ZLMediaKit API**: Correção de `startRecord` usando `type: 1`

#### 📚 Documentação
- **Reorganizada**: Todos os docs movidos para pasta `docs/`
- **README.md**: Completamente reescrito com Quick Start e badges
- **docs/README.md**: Índice completo de documentação
- **.env.example**: Arquivo de exemplo para configurações
- **API Reference**: Documentação completa de todos os endpoints
- **Troubleshooting**: Guia detalhado de solução de problemas

#### 🏗️ Arquitetura
- **Paths Atualizados**: URLs de servidor (66.94.104.241) → localhost
- **Backup Criado**: Arquivos antigos preservados em `backup/`
- **Limpeza**: Remoção de arquivos temporários e redundantes
- **Organização**: Scripts categorizados por função

#### 🔐 Segurança
- **Verificação Completa**: Análise de todos os arquivos do servidor
- **Sem Ameaças**: Nenhum código malicioso detectado
- **Credenciais Validadas**: Todas as chaves são legítimas
- **Configurações Testadas**: Settings de produção validados

---

## [1.5.0] - 2025-08-27

### 🔧 Correções de Sistema de Gravações

#### Corrigido
- **Webhook Connectivity**: Correção de conectividade ZLMediaKit → Backend
- **Recording Paths**: Normalização de paths de gravação
- **Upload Queue**: Implementação de fila de upload com retry
- **S3 Integration**: Correções no sistema de upload Wasabi S3

#### Adicionado
- **RecordingSyncService**: Sincronização contínua arquivo ↔ database
- **Upload Metrics**: Sistema de métricas de upload
- **Path Resolver**: Manipulação centralizada de paths

---

## [1.0.0] - 2025-01-01

### 🎉 Release Inicial

#### ✨ Funcionalidades Base
- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Node.js + Express + Socket.IO
- **Worker**: Serviço de background para monitoramento
- **Streaming**: ZLMediaKit + SRS para RTSP/RTMP/HLS
- **Database**: Supabase (PostgreSQL) + Redis
- **Storage**: Local + Wasabi S3

#### 🏗️ Arquitetura
- Microserviços com Docker
- API REST + WebSocket em tempo real
- Sistema de autenticação JWT
- Upload assíncrono S3
- Monitoramento de câmeras

#### 🎥 Sistema de Streaming
- Suporte RTSP/RTMP input
- HLS output para web
- Gravação contínua MP4
- Transcodificação H264
- Player web integrado

---

## Tipos de Mudanças

- **✨ Adicionado** - para novas funcionalidades
- **🔧 Corrigido** - para correções de bugs
- **📚 Documentação** - para mudanças na documentação
- **🏗️ Arquitetura** - para mudanças na estrutura do projeto
- **🔐 Segurança** - para correções de vulnerabilidades
- **⚡ Performance** - para melhorias de performance
- **🎨 Estilo** - para mudanças de formatação/estilo
- **♻️ Refatoração** - para mudanças de código sem alterar funcionalidade
- **🗑️ Removido** - para funcionalidades removidas

---

**📝 Mantido por**: Equipe NewCAM  
**📅 Última atualização**: 2025-09-09