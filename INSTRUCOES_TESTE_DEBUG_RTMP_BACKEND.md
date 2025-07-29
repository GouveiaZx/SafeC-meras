# Instruções para Teste de Debug - Cadastro RTMP (Backend)

## Situação Atual
- ✅ Frontend rodando em: http://localhost:5173/
- ✅ Backend com logs de debug detalhados adicionados
- ❌ Cadastro de câmeras RTMP ainda falhando na validação

## Logs Adicionados no Backend

Foi adicionado logging detalhado no middleware de validação (`backend/src/middleware/validation.js`) para capturar:

1. **Início da validação**: Dados completos da requisição
2. **Validação de cada campo**: Valor, tipo, regras aplicadas
3. **Validação de enum**: Valores permitidos vs valor recebido
4. **Validação customizada**: Execução de funções customizadas (URLs RTMP/RTSP)
5. **Erros detalhados**: Contexto completo de cada falha

## Como Testar

### 1. Acesse o Sistema
- Abra: http://localhost:5173/
- Faça login se necessário
- Vá para: **Câmeras** → **Adicionar Câmera**

### 2. Preencha o Formulário RTMP
```
Nome: Teste RTMP Debug
Tipo: IP
Tipo de Stream: RTMP
URL RTMP: rtmp://192.168.1.100:1935/live/stream1
```

### 3. Monitore os Logs do Backend

**Abra um novo terminal e execute:**
```bash
cd backend
npm start
```

**Ou monitore o terminal onde o backend já está rodando**

### 4. Submeta o Formulário
- Clique em "Cadastrar Câmera"
- **IMPORTANTE**: Observe os logs do backend no terminal

## Logs Esperados no Backend

Quando você submeter o formulário, deve ver logs similares a:

```
=== VALIDAÇÃO INICIADA ===
{
  endpoint: '/api/cameras',
  method: 'POST',
  body: { name: 'Teste RTMP Debug', type: 'ip', stream_type: 'rtmp', rtmp_url: 'rtmp://...' },
  schema: ['name', 'type', 'stream_type', 'rtmp_url', ...]
}

Validando campo 'name': { value: 'Teste RTMP Debug', type: 'string', rules: {...}, isEmpty: false }
Validando campo 'type': { value: 'ip', type: 'string', rules: {...}, isEmpty: false }
Validando campo 'stream_type': { value: 'rtmp', type: 'string', rules: {...}, isEmpty: false }

# Se houver erro de enum:
Falha na validação de enum: {
  field: 'stream_type',
  value: 'rtmp',
  allowedValues: ['rtsp', 'rtmp'],
  error: {...}
}

# Se houver erro de validação customizada:
Executando validação customizada para 'rtmp_url': {
  value: 'rtmp://192.168.1.100:1935/live/stream1',
  customFunction: '(value) => { ... }'
}
```

## Cenários de Teste Adicionais

### Teste 1: URL RTMP Inválida
```
URL RTMP: http://invalid-url
```

### Teste 2: Stream Type Inválido
```
Tipo de Stream: (deixar vazio ou valor inválido)
```

### Teste 3: Campos Obrigatórios
```
Nome: (deixar vazio)
```

## Informações a Coletar

1. **Logs completos do backend** durante a tentativa de cadastro
2. **Qual campo específico está falhando** na validação
3. **Valor recebido vs valor esperado** para cada campo
4. **Se a validação de enum está funcionando** para `stream_type`
5. **Se a validação customizada está sendo executada** para `rtmp_url`

## Próximos Passos

Com os logs detalhados, poderemos identificar:
- Se o problema é no frontend (dados não enviados corretamente)
- Se o problema é no backend (validação incorreta)
- Qual campo específico está causando a falha
- Se há inconsistência entre schema de validação e dados enviados

---

**Nota**: Os logs são muito verbosos propositalmente para debug. Após identificar o problema, eles serão removidos ou reduzidos.