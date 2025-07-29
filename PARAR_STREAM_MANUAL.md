# Parar Stream Manualmente - Solução Alternativa

Como as credenciais padrão não funcionam, aqui estão métodos alternativos para parar o stream e resolver o erro 400.

## Método 1: Usar o Frontend

1. **Abra o frontend** em: http://localhost:5173
2. **Vá para a página de câmeras**
3. **Localize a câmera** com ID: `3149d84d-73a6-45f3-8dc0-74a07d6111ae`
4. **Clique em "Parar Stream"** (se disponível)
5. **Aguarde 5 segundos**
6. **Clique em "Iniciar Stream"**

## Método 2: Usar Ferramentas do Sistema

### Opção A: Limpar Estado do Backend

1. **Reinicie o backend** para limpar o estado dos streams:
   ```bash
   # No terminal 4 (backend)
   npm run dev
   ```

2. **Após reiniciar**, tente iniciar o stream novamente

### Opção B: Verificar Streams Ativos

1. **Verifique quais streams estão ativos** acessando:
   ```
   http://localhost:3002/api/streams
   ```

2. **Se houver autenticação necessária**, use as credenciais do seu sistema

## Método 3: Script com Credenciais do Sistema

Crie um arquivo `stop-stream-simple.js` com suas credenciais:

```javascript
// Substitua pelas suas credenciais reais
const EMAIL = "seu-email@exemplo.com";
const PASSWORD = "sua-senha";

// Resto do script será igual ao anterior
```

## Método 4: Limpar Cache do Backend

1. **Parar o backend** no terminal 4: Ctrl+C
2. **Limpar cache**:
   ```bash
   # No terminal 4
   npm run dev
   ```

3. **O estado dos streams será resetado**

## Método 5: Teste com Curl Manual

Se você conhecer as credenciais corretas:

1. **Primeiro, obtenha o token**:
   ```bash
   curl -X POST http://localhost:3002/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"SEU_EMAIL","password":"SUA_SENHA"}'
   ```

2. **Use o token retornado para parar o stream**:
   ```bash
   curl -X POST http://localhost:3002/api/streams/3149d84d-73a6-45f3-8dc0-74a07d6111ae/stop \
     -H "Authorization: Bearer SEU_TOKEN_AQUI"
   ```

## Método 6: Verificar no Banco de Dados

Se nenhum método acima funcionar, o problema pode estar no banco:

1. **Verifique se há streams ativos no banco**
2. **Limpe registros inconsistentes**
3. **Use o script de migração** criado anteriormente

## Próximos Passos

1. **Tente o Método 1 primeiro** (frontend)
2. **Se falhar, use o Método 2** (reiniciar backend)
3. **Se ainda persistir**, forneça suas credenciais reais para criar um script personalizado

## Status do Sistema
- ✅ Backend rodando na porta 3002
- ✅ Correções de stream_type aplicadas
- ⚠️ Stream já ativo detectado
- 🔄 Aguardando ação para parar o stream existente

**Qual método você prefere tentar primeiro?**