# NewCAM - Credenciais e Login

## 🔐 Credenciais de Acesso

### Login Principal (Desenvolvimento)
- **Email**: gouveiarx@gmail.com
- **Senha**: Teste123
- **Role**: admin
- **Permissões**: Acesso total ao sistema

### Login Administrativo (Backup)
- **Email**: admin@newcam.com
- **Senha**: admin123
- **Role**: admin
- **Permissões**: Acesso total ao sistema

### Login de Demonstração
- **Email**: admin
- **Senha**: admin123
- **Role**: admin
- **Nota**: Login simplificado para testes rápidos

## 🌐 URLs de Acesso

### Desenvolvimento Local
- **Frontend**: http://localhost:5173 (ou porta disponível: 5174, 5175, 5176)
- **Login**: http://localhost:5173/login
- **Dashboard**: http://localhost:5173/dashboard

### Produção
- **Frontend**: http://66.94.104.241
- **Login**: http://66.94.104.241/login
- **Dashboard**: http://66.94.104.241/dashboard

## 🔑 Tokens e Chaves

### JWT Secret
```
newcam-dev-secret-key-2024
```

### Worker Token
```
newcam-worker-token-2025
```

### Supabase
- **URL**: https://grkvfzuadctextnbpajb.supabase.co
- **Anon Key**: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyMjQyMzgsImV4cCI6MjA2ODgwMDIzOH0.Simv8hH8aE9adQiTf6t1BZIcMPniNh9ecpjxEeki4mE

### ZLMediaKit Secret
```
9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK
```

## 👥 Tipos de Usuário

### Admin
- **Permissões**: 
  - Gerenciar usuários
  - Configurar câmeras
  - Acessar todas as gravações
  - Configurações do sistema
  - Monitoramento completo

### Operator
- **Permissões**:
  - Visualizar câmeras atribuídas
  - Controlar gravações
  - Acessar gravações próprias
  - Relatórios básicos

### Viewer
- **Permissões**:
  - Visualizar câmeras atribuídas
  - Apenas leitura
  - Sem acesso a configurações

## 🔒 Segurança

### Políticas de Senha
- **Mínimo**: 6 caracteres
- **Recomendado**: 8+ caracteres com números e letras
- **Expiração**: Não configurada (desenvolvimento)

### Autenticação
- **Método**: JWT (JSON Web Tokens)
- **Duração**: 7 dias
- **Refresh**: Automático

### Rate Limiting
- **Login**: 5 tentativas por 15 minutos
- **API**: 1000 requests por 15 minutos

## 🛠️ Configuração de Novos Usuários

### Via Interface Web
1. Faça login como admin
2. Acesse "Usuários" no menu
3. Clique em "Adicionar Usuário"
4. Preencha os dados:
   - Email
   - Senha
   - Role (admin/operator/viewer)
   - Câmeras permitidas
5. Salve as alterações

### Via API
```bash
# Criar novo usuário
curl -X POST http://localhost:3002/api/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{
    "email": "novo@usuario.com",
    "password": "senha123",
    "role": "operator",
    "camera_access": ["camera-id-1", "camera-id-2"]
  }'
```

### Via Supabase Dashboard
1. Acesse: https://grkvfzuadctextnbpajb.supabase.co
2. Vá para "Table Editor" > "users"
3. Clique em "Insert" > "Insert row"
4. Preencha os campos necessários
5. Salve o registro

## 🔄 Reset de Senha

### Para Desenvolvimento
1. Acesse o Supabase Dashboard
2. Vá para "Table Editor" > "users"
3. Encontre o usuário
4. Edite o campo "password" com um novo hash bcrypt

### Hash de Senhas Comuns
```
# admin123
$2b$10$rGHQqHqHqHqHqHqHqHqHqOeKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK

# Teste123
$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ123
```

## 📝 Logs de Acesso

### Localização
- **Backend**: `backend/logs/access.log`
- **Supabase**: Dashboard > Logs > Auth

### Monitoramento
```bash
# Ver logs em tempo real
tail -f backend/logs/access.log

# Filtrar logins
grep "login" backend/logs/access.log

# Ver últimos logins
grep "login" backend/logs/access.log | tail -10
```

## ⚠️ Notas Importantes

1. **Desenvolvimento**: Use sempre `gouveiarx@gmail.com` / `Teste123`
2. **Produção**: Altere todas as senhas padrão
3. **Backup**: Mantenha backup das credenciais em local seguro
4. **Tokens**: Renove tokens periodicamente em produção
5. **Logs**: Monitore logs de acesso regularmente

## 🆘 Troubleshooting

### Login não funciona
1. Verificar se backend está rodando na porta 3002
2. Verificar credenciais no Supabase
3. Verificar logs do backend
4. Limpar cache do navegador

### Token expirado
1. Fazer logout e login novamente
2. Verificar configuração JWT_EXPIRES_IN
3. Verificar sincronização de horário do servidor

### Usuário não encontrado
1. Verificar se usuário existe no Supabase
2. Verificar se email está correto
3. Verificar se usuário está ativo