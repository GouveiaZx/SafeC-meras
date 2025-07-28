# Plano de Substituição Completa do ZLMediaKit

## 1. Visão Geral da Migração

Este documento detalha o plano para substituir completamente o ZLMediaKit atual do sistema NewCAM pelo sistema ZLMediaKit funcional trazido de outro projeto.

## 2. Análise da Situação Atual

### 2.1 Sistema NewCAM Atual
**Configuração ZLMediaKit Existente:**
- Container: `newcam-zlmediakit`
- Imagem: `zlmediakit/zlmediakit:master`
- Portas:
  - `1935:1935` (RTMP)
  - `8080:80` (HTTP-FLV/HLS)
  - `8443:443` (HTTPS)
  - `9902:9902` (HTTP API)
  - `554:554` (RTSP)
  - `322:322` (RTSPS)
  - `10000-10100:10000-10100/udp` (RTP)
- Configuração: `./docker/zlmediakit/config.ini`
- Secret: `035c73f7-bb6b-4889-a715-d9eb2d1925cc`
- Hooks configurados para: `host.docker.internal:3001`
- Volume: `zlmediakit_data:/opt/media/www`
- Rede: `newcam-network`

**Serviços Dependentes:**
- Backend NewCAM (porta 3002)
- Frontend NewCAM (porta 5173)
- SRS Server (porta 1985, 8081)
- NGINX Proxy (porta 8082)
- PostgreSQL (porta 5432)
- Redis (porta 6379)
- MinIO (portas 9000, 9001)

### 2.2 Sistema ZLMediaKit Novo (zlmediakit-package)
**Localização:** `zlmediakit-package/`

**Componentes Principais:**
1. **ZLMediaKit Server**
   - Imagem: `zlmediakit/zlmediakit:master`
   - Portas: `8080`, `8088`, `1935`, `8000`, `554`
   - Configuração otimizada para gravação e streaming

2. **ZLM-Registrar**
   - Registro automático de câmeras via API externa
   - Sincronização contínua com fonte de dados
   - Gerenciamento de streams ativos

3. **Processor**
   - Processamento automático de gravações MP4
   - Upload para Wasabi S3
   - Geração de thumbnails
   - Webhook para notificações

4. **Interface Web**
   - Visualização em grade e individual
   - Suporte a HLS e HTTP-FLV
   - Modo tela cheia
   - Atualização automática

**Funcionalidades Adicionais:**
- Registro automático via API externa (formato JSON específico)
- Upload automático para Wasabi S3 com metadados
- Processamento de thumbnails automático
- Scripts de monitoramento, backup e verificação
- Interface web responsiva e otimizada
- Configuração de retenção de gravações (7 dias)
- Segmentação de gravações (60 segundos)
- Cross-domain habilitado para acesso web

## 3. Plano de Migração Detalhado

### Fase 1: Preparação e Backup
1. **Backup do sistema atual**
   ```bash
   # Parar serviços atuais
   docker-compose down
   
   # Backup de configurações
   cp docker-compose.yml docker-compose.yml.backup
   cp -r docker/ docker.backup/
   cp backend/.env backend/.env.backup
   ```

2. **Análise de conflitos de porta**
   - **Conflito identificado**: Porta 8080
     - NewCAM atual: `8080:80` (HTTP-FLV/HLS)
     - Novo sistema: `8080:8080` (ZLM API)
   - **Solução**: Ajustar mapeamento de portas no novo sistema

3. **Preparação do ambiente**
   - Verificar credenciais Wasabi S3
   - Configurar API externa de câmeras
   - Preparar variáveis de ambiente

### Fase 2: Configuração do Novo Sistema
1. **Configurar arquivo .env do zlmediakit-package**
   ```bash
   # Configurações obrigatórias
   WASABI_BUCKET=newcam-recordings
   WASABI_ENDPOINT=https://s3.wasabisys.com
   WASABI_ACCESS_KEY=sua-access-key
   WASABI_SECRET_KEY=sua-secret-key
   API_ENDPOINT=http://sua-api.com/segmentos
   ```

2. **Ajustar mapeamento de portas**
   - ZLM API: `8080:8080` → `9902:8080`
   - HTTP Server: `8088:80` → `8080:80`
   - Manter outras portas: `1935`, `8000`, `554`

3. **Configurar API de câmeras**
   - Editar `scripts/register_cameras_zlm.sh`
   - Configurar URL da API externa
   - Ajustar formato de resposta esperado

### Fase 3: Integração ao Docker Compose
1. **Remover serviços antigos**
   - Remover seção `zlmediakit` atual
   - Manter `srs` como backup (opcional)
   - Ajustar dependências do `nginx`

2. **Adicionar novos serviços**
   ```yaml
   # ZLMediaKit novo
   zlmediakit:
     image: zlmediakit/zlmediakit:master
     container_name: newcam-zlmediakit-new
     ports:
       - "1935:1935"   # RTMP
       - "8080:80"     # HTTP Server
       - "9902:8080"   # API
       - "8000:8000"   # HTTP-FLV
       - "554:554"     # RTSP
     volumes:
       - ./zlmediakit-package/config:/opt/media/conf
       - ./zlmediakit-package/www:/opt/media/bin/www
       - ./zlmediakit-package/recordings:/opt/media/bin/www/record/proxy
     networks:
       - newcam-network
   
   # ZLM Registrar
   zlm-registrar:
     build:
       context: ./zlmediakit-package
       dockerfile: Dockerfile.registrar
     container_name: newcam-zlm-registrar
     depends_on:
       - zlmediakit
     networks:
       - newcam-network
   
   # Processor
   processor:
     build:
       context: ./zlmediakit-package
       dockerfile: Dockerfile.processor
     container_name: newcam-processor
     environment:
       - WASABI_BUCKET=${WASABI_BUCKET}
       - WASABI_ENDPOINT=${WASABI_ENDPOINT}
       - WASABI_ACCESS_KEY=${WASABI_ACCESS_KEY}
       - WASABI_SECRET_KEY=${WASABI_SECRET_KEY}
       - API_ENDPOINT=${API_ENDPOINT}
     ports:
       - "8090:8080"   # Health check
     depends_on:
       - zlmediakit
     networks:
       - newcam-network
   ```

### Fase 4: Atualização do Backend NewCAM
1. **Atualizar variáveis de ambiente**
   ```bash
   # backend/.env
   ZLM_API_URL=http://localhost:9902/index/api
   ZLM_SECRET=035c73f7bb6b4889a715d9eb2d1925cc
   ```

2. **Atualizar configuração de hooks**
   - Ajustar URLs nos hooks do config.ini
   - Configurar webhook do processor

### Fase 5: Testes e Validação
1. **Testes de conectividade**
   ```bash
   # Testar API ZLMediaKit
   curl http://localhost:9902/index/api/getApiList?secret=035c73f7bb6b4889a715d9eb2d1925cc
   
   # Testar interface web
   curl http://localhost:8080
   
   # Testar processor
   curl http://localhost:8090/health
   ```

2. **Testes funcionais**
   - Verificar registro automático de câmeras
   - Testar streaming HLS e HTTP-FLV
   - Validar gravações e processamento
   - Testar upload para Wasabi S3

### Fase 6: Finalização e Limpeza
1. **Remover configurações antigas**
   - Remover `./docker/zlmediakit/` antigo
   - Limpar volumes não utilizados
   - Atualizar documentação

2. **Configurar monitoramento**
   - Logs centralizados
   - Health checks
   - Alertas de falha

## 4. Riscos e Mitigações

### 4.1 Riscos Identificados

**Alto Risco:**
- **Perda de conectividade com câmeras existentes**
  - Impacto: Interrupção total do serviço
  - Mitigação: Backup completo + teste em ambiente isolado
  - Rollback: Restauração em < 5 minutos

- **Conflitos de porta críticos**
  - Impacto: Falha na inicialização dos serviços
  - Mitigação: Mapeamento detalhado + validação prévia
  - Solução: Portas alternativas já definidas

**Médio Risco:**
- **Incompatibilidade de APIs**
  - Impacto: Falha na comunicação backend-zlmediakit
  - Mitigação: Análise prévia das APIs + testes unitários
  - Solução: Adaptadores de compatibilidade

- **Perda de dados de configuração**
  - Impacto: Necessidade de reconfiguração manual
  - Mitigação: Backup de todas as configurações
  - Solução: Scripts de migração automática

**Baixo Risco:**
- **Problemas de performance inicial**
  - Impacto: Lentidão temporária
  - Mitigação: Monitoramento ativo + otimização
  - Solução: Ajustes de configuração

### 4.2 Plano de Rollback Detalhado

**Tempo estimado de rollback: 3-5 minutos**

```bash
# 1. Parar novos serviços (30 segundos)
docker-compose down

# 2. Restaurar configuração original (1 minuto)
cp docker-compose.yml.backup docker-compose.yml
cp -r docker.backup/* docker/
cp backend/.env.backup backend/.env

# 3. Reiniciar serviços originais (2-3 minutos)
docker-compose up -d

# 4. Verificar funcionamento (1 minuto)
curl http://localhost:9902/index/api/getApiList?secret=035c73f7-bb6b-4889-a715-d9eb2d1925cc
```

### 4.3 Pontos de Verificação
- [ ] Backup completo realizado
- [ ] Ambiente de teste validado
- [ ] Plano de rollback testado
- [ ] Equipe de suporte notificada
- [ ] Janela de manutenção agendada

## 5. Checklist de Execução Detalhado

### Pré-requisitos Obrigatórios
- [ ] Sistema atual funcionando e estável
- [ ] Backup completo realizado e testado
- [ ] Credenciais Wasabi S3 válidas e testadas
- [ ] API externa de câmeras acessível
- [ ] Ambiente de teste preparado
- [ ] Plano de rollback validado
- [ ] Janela de manutenção aprovada

### Fase 1: Preparação (15 minutos)
- [ ] Parar serviços atuais: `docker-compose down`
- [ ] Criar backups de segurança
- [ ] Copiar zlmediakit-package para o projeto
- [ ] Configurar arquivo .env com credenciais reais
- [ ] Ajustar scripts de registro de câmeras

### Fase 2: Configuração (20 minutos)
- [ ] Modificar docker-compose.yml
- [ ] Ajustar mapeamento de portas
- [ ] Configurar volumes e redes
- [ ] Atualizar variáveis de ambiente do backend
- [ ] Validar configurações antes da inicialização

### Fase 3: Inicialização (10 minutos)
- [ ] Iniciar novos serviços: `docker-compose up -d`
- [ ] Verificar status dos containers: `docker-compose ps`
- [ ] Aguardar inicialização completa (2-3 minutos)
- [ ] Verificar logs iniciais: `docker-compose logs`

### Fase 4: Testes de Conectividade (15 minutos)
- [ ] Testar API ZLMediaKit: `curl http://localhost:9902/index/api/getApiList?secret=...`
- [ ] Testar interface web: `http://localhost:8080`
- [ ] Testar processor: `curl http://localhost:8090/health`
- [ ] Verificar registro automático de câmeras
- [ ] Testar streaming HLS e HTTP-FLV

### Fase 5: Validação Funcional (20 minutos)
- [ ] Verificar comunicação com backend NewCAM
- [ ] Testar frontend NewCAM: `http://localhost:5173`
- [ ] Validar gravações MP4
- [ ] Testar processamento e upload S3
- [ ] Verificar geração de thumbnails
- [ ] Testar interface web do zlmediakit

### Fase 6: Finalização (10 minutos)
- [ ] Remover configurações antigas
- [ ] Limpar volumes não utilizados: `docker volume prune`
- [ ] Atualizar documentação
- [ ] Configurar monitoramento
- [ ] Notificar equipe sobre conclusão

### Verificações Pós-Migração
- [ ] Sistema funcionando por 30 minutos sem erros
- [ ] Todas as câmeras registradas e streaming
- [ ] Gravações sendo processadas corretamente
- [ ] Upload para S3 funcionando
- [ ] Interface web responsiva
- [ ] Backend NewCAM integrado
- [ ] Logs sem erros críticos

## 6. Cronograma e Próximos Passos

### Cronograma Estimado
- **Preparação**: 15 minutos
- **Configuração**: 20 minutos  
- **Inicialização**: 10 minutos
- **Testes**: 35 minutos
- **Finalização**: 10 minutos
- **Total**: ~90 minutos

### Próximos Passos Imediatos

1. **✅ Análise completa realizada**
   - README do zlmediakit-package analisado
   - Configuração atual mapeada
   - Conflitos identificados

2. **🔄 Aguardando aprovação para execução**
   - Plano detalhado criado
   - Riscos mapeados
   - Rollback preparado

3. **📋 Próximas ações após aprovação:**
   - Configurar credenciais Wasabi S3
   - Configurar API externa de câmeras
   - Executar migração seguindo checklist
   - Validar funcionamento completo

### Informações Importantes

**Vantagens do novo sistema:**
- ✅ Registro automático de câmeras
- ✅ Upload automático para Wasabi S3
- ✅ Interface web otimizada
- ✅ Processamento de thumbnails
- ✅ Scripts de monitoramento
- ✅ Configuração de retenção
- ✅ Melhor performance de streaming

**Requisitos para execução:**
- Credenciais Wasabi S3 válidas
- URL da API externa de câmeras
- Janela de manutenção de ~90 minutos
- Acesso administrativo ao sistema

---

**Status:** 📋 Plano Completo - Aguardando Aprovação  
**Próxima Ação:** Configurar credenciais e executar migração  
**Responsável:** Engenheiro de Software Sênior  
**Tempo Estimado:** 90 minutos  
**Risco:** Baixo (com rollback em 5 minutos)