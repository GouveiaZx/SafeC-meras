# Instruções para Teste de Debug - Cadastro de Câmera RTMP

## Objetivo
Testar o formulário de cadastro de câmeras RTMP no frontend e verificar os logs de depuração para identificar onde está ocorrendo o problema.

## Pré-requisitos
✅ Frontend rodando em: http://localhost:5173/
✅ Backend rodando em: http://localhost:3002/

## Passos para o Teste

### 1. Acessar o Sistema
1. Abra o navegador e acesse: http://localhost:5173/
2. Faça login no sistema com suas credenciais
3. Navegue até a página de Câmeras

### 2. Abrir Console do Navegador
1. Pressione F12 para abrir as ferramentas de desenvolvedor
2. Vá para a aba "Console"
3. Limpe o console (Ctrl+L ou botão de limpar)

### 3. Testar Cadastro de Câmera RTMP
1. Clique no botão "Adicionar Câmera" (+)
2. Preencha o formulário com os seguintes dados:
   - **Nome**: `Teste RTMP Debug`
   - **Tipo de Stream**: Selecione `RTMP`
   - **URL RTMP**: `rtmp://localhost:1935/live/test`
   - **Localização**: `Teste Debug` (opcional)

### 4. Verificar Logs de Debug
Antes de clicar em "Salvar", observe que os seguintes logs devem aparecer no console:

#### Logs Esperados:
```
🔍 DEBUG: Estado completo do formData: {
  formData: {...},
  stream_type: "rtmp",
  rtmp_url: "rtmp://localhost:1935/live/test",
  rtmp_url_length: 29,
  rtmp_url_trimmed: "rtmp://localhost:1935/live/test",
  rtmp_url_trimmed_length: 29
}

🔍 DEBUG: Validando RTMP: {
  rtmp_url: "rtmp://localhost:1935/live/test",
  rtmp_url_trimmed: "rtmp://localhost:1935/live/test",
  is_empty: false,
  starts_with_rtmp: true
}

🔍 DEBUG: Validação final URL/IP: {
  stream_type: "rtmp",
  hasUrl: true,
  hasIp: false,
  rtmp_condition: true,
  rtsp_condition: false,
  will_fail: false
}
```

### 5. Submeter o Formulário
1. Clique no botão "Salvar"
2. Observe os logs no console
3. Verifique se a câmera é criada com sucesso ou se há algum erro

### 6. Cenários de Teste Adicionais

#### Teste 1: Campo RTMP Vazio
- Deixe o campo "URL RTMP" vazio
- Clique em "Salvar"
- **Esperado**: Log `❌ DEBUG: URL RTMP vazia`

#### Teste 2: URL RTMP Inválida
- Preencha "URL RTMP" com: `http://localhost:1935/live/test`
- Clique em "Salvar"
- **Esperado**: Log `❌ DEBUG: URL RTMP não começa com rtmp://`

#### Teste 3: Sem URL e sem IP
- Deixe "URL RTMP" vazio
- Deixe "Endereço IP" vazio
- Clique em "Salvar"
- **Esperado**: Log `❌ DEBUG: Falha na validação - nem URL nem IP fornecidos`

## Informações a Coletar

Por favor, copie e cole os seguintes logs do console:

1. **Logs do estado inicial do formData**
2. **Logs de validação RTMP**
3. **Logs de validação final URL/IP**
4. **Qualquer mensagem de erro que apareça**
5. **Resposta da API (se houver)**

## Logs Adicionados no Código

Os seguintes logs de debug foram adicionados no arquivo `frontend/src/pages/Cameras.tsx`:

- **Linha ~556**: Log do estado completo do formData
- **Linha ~580**: Log da validação específica para RTMP
- **Linha ~613**: Log da validação final URL/IP
- **Linha ~630**: Log do payload enviado para a API
- **Linha ~634**: Log da resposta da API

## Próximos Passos

Com base nos logs coletados, poderemos identificar:
1. Se o problema está na validação do frontend
2. Se o payload está sendo construído corretamente
3. Se o problema está na comunicação com a API
4. Se há algum problema de estado no formulário

---

**Nota**: Após identificar e corrigir o problema, estes logs de debug serão removidos do código para manter a limpeza do console em produção.