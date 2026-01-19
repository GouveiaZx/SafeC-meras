# ⚠️ ARQUIVOS PERIGOSOS - CUIDADO EXTREMO ⚠️

## 🚨 AVISO CRÍTICO

**NUNCA execute estes scripts em produção sem revisar cuidadosamente!**

Os arquivos nesta pasta contêm operações que podem:
- Excluir TODOS os dados do banco
- Remover configurações críticas
- Causar perda irreversível de informações

## 📁 Arquivos Perigosos

### `cleanup_database.sql`
- **RISCO**: EXTREMO 🔴
- **AÇÃO**: Remove TODAS as câmeras e mantém apenas 2 gravações
- **USO**: Apenas para reset completo em ambiente de desenvolvimento
- **PRODUÇÃO**: ❌ NUNCA EXECUTAR

## 🛡️ Medidas de Segurança

1. **Backup Obrigatório**: Sempre faça backup completo antes de considerar usar qualquer script desta pasta
2. **Ambiente Isolado**: Execute apenas em ambientes de desenvolvimento isolados
3. **Revisão Dupla**: Sempre tenha outro desenvolvedor revisando o script
4. **Teste Primeiro**: Execute em ambiente de teste antes de qualquer outro ambiente

## 🔧 Como Usar (Se Necessário)

1. **Confirme o ambiente**: Certifique-se de que NÃO é produção
2. **Faça backup**: Execute backup completo do banco
3. **Revise o código**: Leia linha por linha do script
4. **Execute com cuidado**: Use transações para poder fazer rollback
5. **Verifique resultados**: Confirme que o resultado é o esperado

## 📞 Em Caso de Emergência

Se um script desta pasta foi executado acidentalmente em produção:
1. **PARE IMEDIATAMENTE** qualquer operação
2. **NÃO FAÇA COMMIT** se estiver em transação
3. **EXECUTE ROLLBACK** se possível
4. **RESTAURE DO BACKUP** mais recente
5. **NOTIFIQUE A EQUIPE** imediatamente

---

**Lembre-se: É melhor ser paranóico com segurança do que perder dados importantes!**