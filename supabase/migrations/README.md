# Estrutura de Migrations - NewCAM

Esta pasta contém todos os scripts SQL organizados por categoria para facilitar a manutenção e compreensão do sistema.

## 📁 Estrutura de Diretórios

### `/schema/` - Definições de Esquema
Scripts para criação e modificação de estruturas de banco de dados:
- `20241231_create_alert_tables.sql` - Criação de tabelas de alertas
- `20250801_add_missing_camera_columns.sql` - Adição de colunas faltantes em câmeras
- `add_recording_fields.sql` - Campos adicionais para gravações
- `add_streaming_recording_columns.sql` - Colunas para streaming e gravação
- `create_dashboard_metrics.sql` - Métricas do dashboard
- `create_recording_integrity_tables.sql` - Tabelas de integridade de gravações
- `create_streams_table.sql` - Criação da tabela de streams
- `setup_rls_policies.sql` - Configuração de políticas RLS

### `/data/` - Dados de Teste e Configuração
Scripts para inserção de dados de teste e configuração inicial:
- `confirm_test_user.sql` - Confirmação de usuário de teste
- `create_admin_users.sql` - Criação consolidada de usuários administradores
- `create_test_user.sql` - Criação de usuário de teste
- `insert_new_camera.sql` - Inserção de câmera específica com configurações completas
- `insert_simple_cameras.sql` - Inserção de câmeras simples para teste
- `insert_test_cameras.sql` - Inserção de câmeras de teste com gravação contínua

### `/debug/` - Scripts de Depuração
Scripts para diagnóstico e verificação do sistema:
- `check_camera_status.sql` - Verificação de status das câmeras
- `check_cameras_data.sql` - Verificação de dados das câmeras
- `check_constraints.sql` - Verificação de constraints
- `check_permissions.sql` - Verificação de permissões
- `check_rls_policies.sql` - Verificação de políticas RLS
- `disable_rls_for_testing.sql` - Desabilitar RLS para testes

### `/fixes/` - Correções e Patches
Scripts para correção de problemas específicos:
- `fix_camera_rtsp_url.sql` - Correção de URLs RTSP
- `fix_cameras_access.sql` - Correção de acesso às câmeras
- `fix_live_urls.sql` - Correção de URLs de live streaming
- `fix_recordings_schema.sql` - Correção do esquema de gravações
- `fix_rls_policies.sql` - Correção de políticas RLS
- `fix_streams_permissions.sql` - Correção de permissões de streams
- `remove_user_id_from_streams.sql` - Remoção de user_id de streams

### `/maintenance/` - Manutenção e Limpeza
Scripts para manutenção do sistema:
- `clean_cameras_data.sql` - Limpeza de dados de câmeras
- `cleanup_recordings.sql` - Limpeza de gravações antigas
- `optimize_streaming_indexes.sql` - Otimização de índices de streaming

### `/dangerous/` - ⚠️ Scripts Perigosos
Scripts que podem causar perda de dados - **USO EXTREMAMENTE CUIDADOSO**:
- `cleanup_database.sql` - 🔴 **EXTREMAMENTE PERIGOSO** - Remove TODAS as câmeras
- `README.md` - Instruções de segurança para esta pasta

## ⚠️ Avisos Importantes

### Scripts Perigosos
- `maintenance/cleanup_database.sql` - **NUNCA execute em produção!** Remove TODAS as câmeras e dados relacionados.

### Scripts de Teste
- Todos os arquivos em `/data/` são para ambiente de desenvolvimento/teste
- Não execute scripts de teste em produção sem revisar cuidadosamente

## 🔧 Como Usar

### Para Desenvolvimento
1. Execute scripts de `/schema/` para criar estruturas
2. Use scripts de `/data/` para popular dados de teste
3. Execute scripts de `/debug/` para verificar o sistema

### Para Produção
1. **NUNCA** execute scripts de `/data/` ou `/maintenance/cleanup_database.sql`
2. Revise cuidadosamente todos os scripts antes da execução
3. Faça backup antes de executar qualquer script de `/fixes/`

### Para Depuração
1. Use scripts de `/debug/` para diagnosticar problemas
2. Execute scripts de `/fixes/` conforme necessário
3. Use scripts de `/maintenance/` (exceto cleanup_database.sql) para otimização

## 📝 Convenções

- Scripts com prefixo de data (YYYYMMDD_) são migrações versionadas
- Scripts sem prefixo são utilitários que podem ser executados conforme necessário
- Sempre revisar e testar scripts antes da execução em produção