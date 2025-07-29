# ✅ Checklist de Migração - NewCAM Servidor Cliente

## 📋 Status do Sistema
- **Data**: __/__/____
- **Responsável**: _________________________
- **Versão**: v1.0.0 (com todas as correções aplicadas)

---

## 🎯 Fase 1: Preparação

### ✅ Servidor
- [ ] Ubuntu 20.04+ instalado e atualizado
- [ ] Node.js 18+ instalado (`node --version`)
- [ ] PM2 instalado globalmente (`npm install -g pm2`)
- [ ] Docker instalado (opcional)
- [ ] Portas liberadas no firewall: 80, 443, 3002, 8080, 1935, 554

### ✅ Acesso ao Banco de Dados
- [ ] Acesso ao dashboard do Supabase do cliente
- [ ] Project ID anotado: `_____________________`
- [ ] Anon Key copiada: `_____________________`
- [ ] Service Role Key copiada: `_____________________`

### ✅ Configuração ZLMediaKit
- [ ] ZLMediaKit instalado no servidor
- [ ] Configuração `config.ini` copiada
- [ ] Portas configuradas: 8080, 1935, 554, 8443

---

## 🚀 Fase 2: Deploy

### ✅ Instalação do Projeto
- [ ] Código copiado para servidor
- [ ] Dependências instaladas (`npm install`)
- [ ] Build executado (`npm run build`)

### ✅ Configuração de Ambiente
- [ ] Arquivo `.env` do backend configurado
- [ ] Arquivo `.env` do frontend configurado
- [ ] Variáveis de ambiente testadas

### ✅ Banco de Dados
- [ ] Migration executada (coluna `stream_type`)
- [ ] Dados das câmeras verificados
- [ ] Teste de conectividade realizado

### ✅ Inicialização dos Serviços
- [ ] Backend iniciado com PM2
- [ ] Frontend iniciado com PM2
- [ ] ZLMediaKit iniciado com PM2

---

## 🧪 Fase 3: Testes

### ✅ Testes de API
- [ ] Health check: `curl http://localhost:3002/api/health`
- [ ] Listar câmeras: `curl http://localhost:3002/api/cameras`
- [ ] WebSocket funcionando

### ✅ Testes de Streaming
- [ ] Cadastrar câmera RTMP de teste
- [ ] Iniciar stream sem erro 400
- [ ] Parar stream corretamente
- [ ] Verificar gravações

### ✅ Testes de Interface
- [ ] Acessar frontend no navegador
- [ ] Login funcionando
- [ ] Dashboard carregando
- [ ] Câmeras aparecendo online

---

## 📊 Fase 4: Validação Final

### ✅ Monitoramento
- [ ] PM2 status: `pm2 status`
- [ ] Logs sem erros: `pm2 logs --lines 20`
- [ ] Portas em uso: `netstat -tlnp`

### ✅ Performance
- [ ] Tempo de resposta < 2s
- [ ] CPU usage < 70%
- [ ] Memória RAM < 80%
- [ ] Espaço em disco > 20% livre

### ✅ Segurança
- [ ] HTTPS configurado (se aplicável)
- [ ] Firewall ativado
- [ ] Logs de acesso configurados
- [ ] Backup automático configurado

---

## 📝 Informações do Cliente

### 🔧 Configurações Específicas
- **URL do Servidor**: `http://____________________`
- **IP do Servidor**: `____________________`
- **Dominio**: `____________________`
- **Porta Backend**: `3002`
- **Porta Frontend**: `80`

### 📞 Contatos de Suporte
- **Responsável Técnico**: `____________________`
- **Telefone**: `____________________`
- **Email**: `____________________`
- **Horário de Suporte**: `____________________`

---

## 🚨 Problemas Conhecidos e Soluções

### Erro 400 ao iniciar stream
**Causa**: Coluna `stream_type` ausente no banco
**Solução**: Executar migration
```bash
cd backend
npm run migrate
```

### Porta 3002 em uso
**Causa**: Processo anterior travado
**Solução**: 
```bash
sudo lsof -i :3002
sudo kill -9 [PID]
pm2 restart all
```

### Câmera aparece offline
**Causa**: Configuração RTMP incorreta
**Solução**: Verificar URL no banco de dados

---

## 📋 Arquivos de Referência

### Documentação Completa
- [MIGRACAO_SERVIDOR_CLIENTE.md](./MIGRACAO_SERVIDOR_CLIENTE.md)
- [README_SERVIDOR_CLIENTE.md](./README_SERVIDOR_CLIENTE.md)
- [CONFIG_SERVIDOR_CLIENTE.env](./CONFIG_SERVIDOR_CLIENTE.env)

### Scripts de Auxílio
- [verificar-migracao.js](./verificar-migracao.js)
- [diagnostico_simples.js](./diagnostico_simples.js)

---

## ✅ Assinatura de Conclusão

**Data da Conclusão**: __/__/____

**Responsável Técnico**: _________________________

**Assinatura**: _________________________

**Observações**: 
_________________________________________________
_________________________________________________

---

**Status Final**: ☐ Em Progresso ☐ Concluído ☐ Em Testes ☐ Em Produção