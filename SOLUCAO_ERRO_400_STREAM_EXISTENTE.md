# Solução para Erro 400 - Stream Já Ativo

## Problema Identificado
O erro 400 ao tentar iniciar um stream RTMP ocorre porque o sistema detecta que **"Stream já está ativo para esta câmera"**. Isso acontece quando:

1. Um stream foi iniciado anteriormente e não foi corretamente parado
2. O estado do stream está inconsistente no sistema
3. A câmera já tem um stream ativo registrado

## Solução Imediata

### Opção 1: Parar o Stream Manualmente
Execute o comando abaixo para parar o stream antes de iniciar um novo:

```bash
# Usando PowerShell (Windows)
$loginResponse = Invoke-RestMethod -Uri "http://localhost:3002/api/auth/login" -Method Post -ContentType "application/json" -Body '{"email":"admin@example.com","password":"admin123"}'
$token = $loginResponse.token
Invoke-RestMethod -Uri "http://localhost:3002/api/streams/3149d84d-73a6-45f3-8dc0-74a07d6111ae/stop" -Method Post -Headers @{Authorization="Bearer $token"}
```

### Opção 2: Usar o Frontend
1. Vá para a página de câmeras
2. Localize a câmera com ID: `3149d84d-73a6-45f3-8dc0-74a07d6111ae`
3. Clique no botão "Parar Stream" (se disponível)
4. Após parar, clique em "Iniciar Stream" novamente

### Opção 3: Script de Correção Automática
Crie um arquivo `fix-stream-3149d84d.js` com o conteúdo abaixo e execute:

```javascript
const axios = require('axios');

async function fixStream() {
  try {
    // Login
    const loginResponse = await axios.post('http://localhost:3002/api/auth/login', {
      email: 'admin@example.com',
      password: 'admin123'
    });
    
    const token = loginResponse.data.token;
    const headers = { Authorization: `Bearer ${token}` };
    
    // Parar stream existente
    console.log('Parando stream existente...');
    await axios.post(`http://localhost:3002/api/streams/3149d84d-73a6-45f3-8dc0-74a07d6111ae/stop`, {}, { headers });
    console.log('Stream parado com sucesso!');
    
    // Aguardar 2 segundos
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Iniciar novo stream
    console.log('Iniciando novo stream...');
    const startResponse = await axios.post(`http://localhost:3002/api/streams/3149d84d-73a6-45f3-8dc0-74a07d6111ae/start`, {}, { headers });
    console.log('Stream iniciado:', startResponse.data);
    
  } catch (error) {
    console.error('Erro:', error.response?.data || error.message);
  }
}

fixStream();
```

Execute com:
```bash
cd backend
node fix-stream-3149d84d.js
```

## Verificação
Após aplicar a solução:

1. Verifique se o stream foi parado:
   ```bash
   curl http://localhost:3002/api/streams
   ```

2. Tente iniciar o stream novamente pelo frontend

3. Verifique os logs do backend para confirmar o sucesso

## Prevenção Futura
Para evitar este problema:

1. Sempre pare o stream antes de tentar iniciar novamente
2. Implemente um botão de "Reiniciar Stream" no frontend
3. Use o endpoint `/api/streams` para verificar streams ativos antes de iniciar

## Status Atual
- ✅ Correção do problema de `stream_type` indefinido implementada
- ✅ Endpoint de parada de stream disponível
- ⚠️ Necessário parar stream existente antes de iniciar novo
- 🔄 Pronto para teste após aplicar a solução acima