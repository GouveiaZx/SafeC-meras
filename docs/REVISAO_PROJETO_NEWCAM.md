# ✅ Revisão Técnica — Projeto NewCAM (Fevereiro/2025)

Este documento consolida os principais problemas identificados na análise completa do repositório e recomenda ações priorizadas para correção. Foquei em bugs que quebram funcionalidades, riscos de segurança e pontos estruturais que impedem evolução/manutenção. Os exemplos abaixo usam caminhos relativos ao repositório para facilitar a navegação.

---

## 1. Segurança e exposição de segredos

- **Credenciais reais versionadas**
  `backend/.env.example`, `docs/ENVIRONMENT.md` e diversos scripts (`scripts/system-health-check.js`, `docs/README.md`) armazenam chaves ativas do Supabase (inclusive service role), secrets do ZLMediaKit e credenciais Wasabi. Esses arquivos já estão no histórico público.  
  🔧 *Ação imediata*: revogar todas as chaves expostas, migrar segredos para um cofre (ex.: 1Password, Vault, Supabase secrets) e substituir os arquivos por placeholders/documentação segura.

- **Scripts de manutenção sem salvaguardas**  
  `supabase/migrations/dangerous/cleanup_database.sql` remove praticamente todas as tabelas sem confirmação ou validação de ambiente.  
  🔧 *Ação*: mover scripts destrutivos para repositório privado ou exigir flag/variável de confirmação explícita antes da execução.

- **Docker em produção aponta para recursos do host**  
  `docker/nginx/nginx.conf` e `docker-compose.yml` dependem de `host.docker.internal`, que não funciona em Linux puro (produção atual). Isso expõe necessidade de trafegar via rede bridge interna.  
  🔧 *Ação*: criar rede dedicada e referenciar serviços pelo nome do container; documentar override local (Docker Desktop) separado do compose de produção.

---

## 2. Backend — falhas críticas e dívidas técnicas

- **Uso de `require` em módulos ES**  
  O backend está em modo ESM (`"type": "module"`), mas vários arquivos ainda chamam `require(...)`. O caso mais crítico ocorre na inicialização:  
  - `backend/src/utils/PathResolver.js:35` usa `require('fs').existsSync`, disparando `ReferenceError: require is not defined` assim que o módulo é importado (o serviço cai antes de subir).  
  - `backend/src/controllers/fileController.js:155` e `backend/src/services/RealStreamingService.js` repetem o padrão.  
  🔧 *Ação*: migrar para `import { existsSync, createReadStream } from 'fs';` ou usar `createRequire`. Sem isso, qualquer deploy limpo falha.

- **Rotas de gravações chamavam métodos inexistentes**  
  O serviço simplificado em `backend/src/services/RecordingService.js` havia perdido vários utilitários (retry da fila, deleção em lote, stream por ID etc.), gerando `TypeError` assim que endpoints eram acessados. Ajustamos a service para expor versões básicas dessas operações e, quando o recurso não existe mais (ex.: pause/resume), as rotas agora respondem `501 Not Implemented` em vez de quebrar silenciosamente.  
  🔧 *Seguinte passo*: reintroduzir a funcionalidade completa (upload queue/exports) quando necessário, mas a API já não derruba o backend.

- **Validação de usuários presa a roles antigas**  
  `backend/src/middleware/validation.js:80` aceita só `admin`, `operator` e `viewer`, porém o modelo `User` usa `integrator`, `client`, `viewer`, `operator`. Com isso o endpoint `/api/auth/register` recusa qualquer novo tipo de usuário necessário ao sistema.  
  🔧 *Ação*: atualizar o validador para refletir as roles reais e/ou consultar a enum da tabela Supabase.

- **Processo aborta quando variáveis estão ausentes**  
  `backend/src/config/database.js` chama `process.exit(1)` se `SUPABASE_*` não estiver configurado, mesmo em ambiente de desenvolvimento/testes. Isso impede subir o backend com mocks locais ou testes automatizados.  
  🔧 *Ação*: lançar erro claro e permitir fallback em dev (ex.: modo stub), mantendo falha dura apenas em produção.

- **JWT e seguranças não validadas na inicialização**  
  `backend/src/middleware/auth.js` usa `jwt.verify` com `process.env.JWT_SECRET`, mas não há validação no boot para garantir que o secret está configurado. Resultado: pedidos 500 silenciosos quando a variável falta.  
  🔧 *Ação*: validar secrets obrigatórios em `server.js` e falhar com mensagem explícita antes de subir servidor.

- **Monitores agendados sem limpeza**  
  `backend/src/server.js` cria vários `setInterval` (fila de upload, estatísticas, limpeza) sem armazenar referências para `clearInterval` (apenas timers embutidos nos serviços). Em reinícios frequentes (PM2, testes) isso causa timers duplicados.  
  🔧 *Ação*: centralizar agendamentos num scheduler e cancelar no shutdown, ou mover lógica para filas/cron real.

- **URLs HLS geradas com sufixo incorreto**  
  Quando a câmera não possui URL manual, `backend/src/models/Camera.js:122` monta `hls_url = .../playlist.m3u8`, porém o proxy HLS em `routes/streams.js` espera arquivos `hls.m3u8`. O player recebe 404 na primeira carga automática.  
  🔧 *Ação*: padronizar para `hls.m3u8` (ou ajustar o proxy para aceitar ambos).

---

## 3. Frontend — bugs que quebram fluxo

- **Loop infinito ao carregar stream**  
  `frontend/src/pages/StreamViewPage.tsx:64` define `const fetchStreamInfo = async () => { ... }` e adiciona essa função na dependência de `useEffect`. Como a função é recriada a cada render, o efeito roda sem parar (requisições em loop, travamento da UI).  
  🔧 *Ação*: encapsular a função em `useCallback` ou chamar dentro de um efeito sem dependências mutáveis.

- **`useSocket` nunca atualiza `isConnected`**  
  `frontend/src/hooks/useSocket.ts` expõe `isConnected` direto de `socketRef.current?.connected`. O valor é lido apenas uma vez; mudanças de estado do socket não disparam re-render → componentes acreditam que a conexão caiu (ou nunca subiu), desativando funcionalidades como o refresh automático da página de gravações.  
  🔧 *Ação*: mover o status para `useState` e atualizar em listeners `connect`/`disconnect`.

- **Ações de gravação chamam endpoints errados**  
  `frontend/src/pages/RecordingsPage.tsx`:
  - `handleStopRecording` usa `endpoints.recordings.stop(recordingId)`, mas o helper retorna a rota global `/recordings/stop` (sem ID); resultado: sempre 404.  
  - `handleRetryUpload` constrói URLs manuais com `/api/...` enquanto o client já prefixa `/api`, gerando `/api/api/...` + ainda assume formato axios (`response.data.success`) embora o client retorne JSON puro.  
  🔧 *Ação*: reusar os helpers corretos (`stopById`, `retryUpload`, etc.) e alinhar o retorno para o wrapper `lib/api.ts`.

- **Sobrecarga de requests em listagem**  
  `fetchRecordings` chama `fetchRecordingSegments` para cada item da lista — N+1 requisições por render. Isso torna a página inutilizável em ambientes com muitas gravações.  
  🔧 *Ação*: alterar o backend para retornar segmentos junto da listagem ou implementar endpoint em lote; no frontend, só buscar detalhes sob demanda (ex.: abrir modal).

- **Fluxos dependem de APIs quebradas no backend**  
  O dashboard de gravações chama endpoints de retry, fila de upload e pausa/retomada que hoje retornam 500 (vide problemas acima). Até corrigir o backend, as ações exibem erro genérico no toast e passam impressão de sucesso falso.  
  🔧 *Ação*: após corrigir o backend, tratar estados de erro explícitos e desabilitar botões quando a feature estiver indisponível.

- **Dois clientes HTTP concorrentes**  
  O projeto mantém `src/lib/api.ts` (fetch custom) e `src/services/api.ts` (axios + interceptors) simultaneamente, mas apenas um é usado nas telas principais. Essa duplicação confunde manutenção e gera comportamento incoerente (ex.: interceptores diferentes).  
  🔧 *Ação*: padronizar em um único client.

---

## 4. Infraestrutura & Operação

- **Docker Compose sem backend/frontend containers**  
  O `docker-compose.yml` atual só sobe Redis, MinIO, ZLMediaKit, SRS e Nginx. Backend/Frontend dependem de rodar na máquina anfitriã (ver proxy para `host.docker.internal`). Isso inviabiliza execução “one command” em servidores Linux.  
  🔧 *Ação*: adicionar serviços `backend` e `frontend` no compose de dev/prod ou fornecer stack alternativo com documentação clara.

- **Tags `latest` e `master` em imagens críticas**  
  Serviços `minio/minio:latest` e `zlmediakit/zlmediakit:master` podem quebrar com update upstream não testado.  
  🔧 *Ação*: versionar imagens, manter processo de atualização controlado.

---

## 5. Próximos passos sugeridos

1. **Resposta rápida**  
   - Revogar e rotacionar todas as chaves expostas.  
   - Corrigir `require`/ESM no backend (sem isso, ambiente limpo não roda).  
   - Ajustar bugs de fluxo crítico no frontend (`StreamViewPage`, ações da página de gravações, `useSocket`).

2. **Higiene de código & estrutura**  
   - Consolidar cliente HTTP do frontend.  
   - Remover logs ruidosos (`console.log` sensível em produção).  
   - Padronizar carregamento de `.env` e validações no startup.

3. **Planejamento médio prazo**  
   - Isolar scripts destrutivos / automatizar migrações com versionamento Supabase oficial.  
   - Revisar arquitetura Docker para compatibilidade Linux e pipelines CI/CD (builds reproduzíveis).  
   - Documentar claramente fluxos de streaming (quando usar ZLM, SRS, fallback).

---

### Observações finais

- O projeto é extenso e bem documentado, mas há traços de “merge” de várias iterações (arquivos redundantes, serviços desativados). Recomenda-se uma rodada de limpeza controlada depois das correções urgentes.
- Se precisar de ajuda para aplicar as correções prioritárias ou criar pipelines de validação (lint/test/build unificados), posso auxiliar em etapas curtas focadas.

---

*Gerado por Codex — revisão manual completa do repositório em 2025-02-14. Consulte os caminhos indicados para aplicar as correções com segurança.*
