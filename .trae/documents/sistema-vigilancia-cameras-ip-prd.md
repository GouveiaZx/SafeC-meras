# Sistema de Vigilância por Câmeras IP - Documento de Requisitos do Produto

## 1. Visão Geral do Produto

Sistema completo de vigilância IP com front-end web e worker para processamento de vídeos via RTSP/RTMP, gravação contínua, transmissão ao vivo HLS e upload para bucket Wasabi (S3).

O sistema resolve a necessidade de monitoramento remoto de câmeras IP com diferentes níveis de acesso, permitindo que administradores, integradores e clientes gerenciem e visualizem feeds de câmeras de forma segura e escalável.

O produto visa atender o mercado de segurança empresarial e residencial, oferecendo uma solução robusta para vigilância remota com armazenamento em nuvem.

## 2. Funcionalidades Principais

### 2.1 Papéis de Usuário

| Papel         | Método de Registro            | Permissões Principais                                                                              |
| ------------- | ----------------------------- | -------------------------------------------------------------------------------------------------- |
| Administrador | Acesso direto do sistema      | Visualiza e gerencia tudo, painel de estatísticas, logs e cotas, cadastro de integradores          |
| Integrador    | Cadastrado pelo administrador | Gerencia seus próprios clientes e câmeras, define períodos de retenção, acompanha acessos e status |
| Cliente       | Cadastrado pelo integrador    | Acesso limitado às suas câmeras, visualização ao vivo, download de trechos gravados                |

### 2.2 Módulo de Funcionalidades

Nossos requisitos do sistema de vigilância consistem nas seguintes páginas principais:

1. **Página de Login**: autenticação com três níveis de acesso, recuperação de senha.
2. **Dashboard Principal**: painel em tempo real com logs de acesso, consumo, espaço ocupado no bucket, histórico de status das câmeras.
3. **Gerenciamento de Câmeras**: cadastro de câmeras RTSP/RTMP, teste de conexão, acompanhamento de status online/offline.
4. **Visualização ao Vivo**: transmissão HLS das câmeras, interface de player de vídeo.
5. **Gravações**: listagem e download de gravações por período, filtros por câmera e data.
6. **Gerenciamento de Usuários**: cadastro de integradores e clientes, definição de cotas e permissões.
7. **Configurações do Sistema**: alertas por email, políticas de retenção, configurações de armazenamento.

### 2.3 Detalhes das Páginas

| Nome da Página            | Nome do Módulo           | Descrição da Funcionalidade                                                                      |
| ------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------ |
| Página de Login           | Sistema de Autenticação  | Autenticar usuários com JWT, validar credenciais, redirecionar baseado no nível de acesso        |
| Dashboard Principal       | Painel de Controle       | Exibir estatísticas em tempo real, logs de acesso, consumo de armazenamento, status das câmeras  |
| Gerenciamento de Câmeras  | Cadastro de Dispositivos | Adicionar câmeras RTSP/RTMP, testar conexão, monitorar status online/offline, gerar links RTMP   |
| Visualização ao Vivo      | Player HLS               | Reproduzir streams ao vivo via HLS, controles de player, seleção de câmeras                      |
| Gravações                 | Arquivo de Vídeos        | Listar gravações por período, filtrar por câmera e data, download de arquivos, preview de vídeos |
| Gerenciamento de Usuários | Administração de Acesso  | Cadastrar integradores e clientes, definir cotas de armazenamento, gerenciar permissões          |
| Configurações do Sistema  | Configurações Globais    | Configurar alertas por email, políticas de retenção, configurações do Wasabi S3                  |

## 3. Processo Principal

**Fluxo do Administrador:**
O administrador acessa o sistema, visualiza o dashboard com estatísticas globais, cadastra integradores, define cotas e monitora o uso geral do sistema.

**Fluxo do Integrador:**
O integrador faz login, acessa suas câmeras e clientes, cadastra novas câmeras RTSP/RTMP, define períodos de retenção e monitora o status dos dispositivos.

**Fluxo do Cliente:**
O cliente acessa o sistema, visualiza suas câmeras ao vivo via HLS, navega pelo histórico de gravações e faz download de trechos específicos.

```mermaid
graph TD
    A[Página de Login] --> B{Tipo de Usuário}
    B -->|Administrador| C[Dashboard Admin]
    B -->|Integrador| D[Dashboard Integrador]
    B -->|Cliente| E[Dashboard Cliente]
    C --> F[Gerenciamento de Usuários]
    C --> G[Configurações do Sistema]
    D --> H[Gerenciamento de Câmeras]
    D --> I[Visualização ao Vivo]
    E --> I
    E --> J[Gravações]
    H --> I
    I --> J
```

## 4. Design da Interface do Usuário

### 4.1 Estilo de Design

* **Cores primárias e secundárias**: Azul escuro (#1e3a8a) como primária, cinza claro (#f8fafc) como secundária

* **Estilo de botões**: Botões arredondados com sombra sutil, estilo moderno

* **Fonte e tamanhos preferenciais**: Inter ou Roboto, tamanhos 14px para texto, 16px para botões, 24px para títulos

* **Estilo de layout**: Layout baseado em cards, navegação superior fixa, sidebar retrátil

* **Sugestões de emoji ou ícones**: Ícones Heroicons ou Feather Icons, emojis para status (🟢 online, 🔴 offline)

### 4.2 Visão Geral do Design das Páginas

| Nome da Página            | Nome do Módulo           | Elementos da UI                                                                                            |
| ------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Página de Login           | Sistema de Autenticação  | Formulário centralizado, fundo gradiente azul, campos com bordas arredondadas, botão de login destacado    |
| Dashboard Principal       | Painel de Controle       | Grid de cards com estatísticas, gráficos em tempo real, tabela de logs, cores de status verde/vermelho     |
| Gerenciamento de Câmeras  | Cadastro de Dispositivos | Lista de câmeras em cards, botões de ação flutuantes, modal para cadastro, indicadores de status coloridos |
| Visualização ao Vivo      | Player HLS               | Player de vídeo responsivo, controles customizados, grid de câmeras, fullscreen disponível                 |
| Gravações                 | Arquivo de Vídeos        | Filtros em sidebar, lista de vídeos com thumbnails, botões de download, calendário para seleção de datas   |
| Gerenciamento de Usuários | Administração de Acesso  | Tabela responsiva, modais para edição, badges para níveis de acesso, formulários estruturados              |
| Configurações do Sistema  | Configurações Globais    | Abas organizadas, formulários com validação, toggles para ativação de recursos, campos de configuração     |

### 4.3 Responsividade

O produto é desktop-first com adaptação mobile completa. Inclui otimização para interação touch em dispositivos móveis, com menus colapsáveis e controles adaptados para telas menores.

## 5. Requisitos Técnicos e Integrações

### 5.1 Arquitetura do Sistema

**Frontend:**

* Next.js com TypeScript

* Tailwind CSS para estilização

* Zustand para gerenciamento de estado

* React Query para cache de dados

**Backend:**

* Node.js com Express ou Fastify

* PostgreSQL para banco de dados

* Redis para cache e sessões

* Docker e Docker Compose

**Serviços de Mídia:**

* ZLMediaKit para captura RTSP

* SRS Server para gerenciamento RTMP

* FFmpeg para processamento de vídeo

### 5.2 Integrações Externas Necessárias

**Armazenamento:**

* Wasabi S3 (credenciais necessárias)

* Configuração de buckets e políticas

**Email:**

* SendGrid ou AWS SES (API keys necessárias)

* Templates de email para alertas

**Segurança:**

* Certificados SSL/TLS

* Chaves JWT para autenticação

### 5.3 Informações Necessárias do Cliente

**Credenciais de Serviços:**

1. **Wasabi S3:**

   * Access Key ID

   * Secret Access Key

   * Endpoint URL

   * Nome do bucket

2. **Serviço de Email:**

   * API Key do SendGrid ou AWS SES

   * Domínio verificado para envio

   * Templates de email (opcional)

3. **Certificados SSL:**

   * Certificado SSL para HTTPS

   * Chave privada

   * Certificados intermediários (se aplicável)

**Configurações de Infraestrutura:**

1. **Servidor/VPS:**

   * Especificações mínimas: 4 CPU cores, 8GB RAM, 100GB SSD

   * Sistema operacional: Ubuntu 20.04+ ou CentOS 8+

   * Acesso SSH com privilégios sudo

2. **Rede:**

   * Portas abertas: 80, 443, 1935 (RTMP), 8080 (HLS)

   * Domínio configurado com DNS

   * Firewall configurado

3. **Docker:**

   * Docker Engine instalado

   * Docker Compose instalado

   * Permissões para executar containers

**Configurações Opcionais:**

1. **Monitoramento:**

   * Chaves de API para serviços de monitoramento (Datadog, New Relic)

   * Configuração de alertas

2. **Backup:**

   * Configuração de backup automático

   * Retenção de dados

### 5.4 Variáveis de Ambiente Necessárias

```env
# Banco de Dados
DATABASE_URL=postgresql://user:password@localhost:5432/surveillance_db
REDIS_URL=redis://localhost:6379

# Wasabi S3
WASABI_ACCESS_KEY=your_access_key
WASABI_SECRET_KEY=your_secret_key
WASABI_ENDPOINT=https://s3.wasabisys.com
WASABI_BUCKET=your_bucket_name

# Email
SENDGRID_API_KEY=your_sendgrid_key
FROM_EMAIL=noreply@yourdomain.com

# JWT
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=24h

# Aplicação
NODE_ENV=production
PORT=3000
DOMAIN=https://yourdomain.com

# Media Servers
ZLMEDIAKIT_PORT=8080
SRS_PORT=1935
HLS_PATH=/hls
```

