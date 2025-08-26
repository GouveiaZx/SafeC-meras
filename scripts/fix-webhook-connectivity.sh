#!/bin/bash

# Script para Corrigir Conectividade de Webhook ZLMediaKit em Produção
# Servidor: nuvem.safecameras.com.br (66.94.104.241)
# Data: 26 de Agosto de 2025

echo "=== CORREÇÃO WEBHOOK ZLMEDIAKIT - NEWCAM ==="
echo "Servidor: nuvem.safecameras.com.br (66.94.104.241)"
echo "Problema: Webhook failing com connection refused"
echo "Solução: Substituir host.docker.internal por 172.17.0.1"
echo ""

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configurações do servidor
SERVER_IP="66.94.104.241"
SERVER_USER="root"
SERVER_PASSWORD="98675423"
SERVER_PATH="/var/www/newcam"

# Função para executar comandos remotos
execute_remote() {
    local command="$1"
    echo -e "${BLUE}[REMOTE]${NC} $command"
    sshpass -p "$SERVER_PASSWORD" ssh -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_IP" "$command"
}

# Função para copiar arquivos
copy_to_server() {
    local local_path="$1"
    local remote_path="$2"
    echo -e "${BLUE}[COPY]${NC} $local_path → $remote_path"
    sshpass -p "$SERVER_PASSWORD" scp -o StrictHostKeyChecking=no -r "$local_path" "$SERVER_USER@$SERVER_IP:$remote_path"
}

# Verificar dependências
if ! command -v sshpass &> /dev/null; then
    echo -e "${RED}Erro: sshpass não encontrado. Instale:${NC}"
    echo "  macOS: brew install sshpass"
    echo "  Ubuntu: sudo apt-get install sshpass"
    exit 1
fi

echo -e "${YELLOW}1. Testando conexão SSH...${NC}"
if execute_remote "echo 'SSH conectado com sucesso'"; then
    echo -e "${GREEN}✓ Conexão SSH estabelecida${NC}"
else
    echo -e "${RED}✗ Falha na conexão SSH${NC}"
    exit 1
fi

echo -e "${YELLOW}2. Verificando status atual dos containers...${NC}"
execute_remote "cd $SERVER_PATH && docker ps | grep -E 'newcam-(zlmediakit|nginx)'"

echo -e "${YELLOW}3. Verificando configuração atual do ZLMediaKit...${NC}"
execute_remote "cd $SERVER_PATH && grep -A 10 'on_record_mp4' docker/zlmediakit/config.ini"

echo -e "${YELLOW}4. Aplicando correções no config.ini...${NC}"

# Criar script de correção no servidor
execute_remote "cat > /tmp/fix_config.sh << 'EOF'
#!/bin/bash
cd $SERVER_PATH

echo 'Backup da configuração atual...'
cp docker/zlmediakit/config.ini docker/zlmediakit/config.ini.backup-\$(date +%Y%m%d-%H%M%S)

echo 'Aplicando correções no config.ini...'
# Substituir todas as ocorrências de host.docker.internal por 172.17.0.1
sed -i 's/host\.docker\.internal:3002/172.17.0.1:3002/g' docker/zlmediakit/config.ini

echo 'Verificando correções aplicadas...'
grep -E '172\.17\.0\.1:3002' docker/zlmediakit/config.ini | wc -l
EOF"

execute_remote "chmod +x /tmp/fix_config.sh && /tmp/fix_config.sh"

echo -e "${YELLOW}5. Enviando docker-compose.yml corrigido...${NC}"
copy_to_server "./docker-compose.yml" "$SERVER_PATH/docker-compose.yml"

echo -e "${YELLOW}6. Parando container ZLMediaKit atual...${NC}"
execute_remote "cd $SERVER_PATH && docker stop newcam-zlmediakit"
execute_remote "cd $SERVER_PATH && docker rm newcam-zlmediakit"

echo -e "${YELLOW}7. Recriando container ZLMediaKit com nova configuração...${NC}"
execute_remote "cd $SERVER_PATH && docker-compose up -d zlmediakit"

echo -e "${YELLOW}8. Aguardando inicialização do container...${NC}"
sleep 10

echo -e "${YELLOW}9. Verificando status do novo container...${NC}"
execute_remote "cd $SERVER_PATH && docker ps | grep newcam-zlmediakit"
execute_remote "cd $SERVER_PATH && docker logs newcam-zlmediakit | tail -10"

echo -e "${YELLOW}10. Testando conectividade de webhook...${NC}"

# Testar se o container consegue alcançar o backend
echo -e "${BLUE}Testando conectividade do container para backend...${NC}"
execute_remote "cd $SERVER_PATH && docker exec newcam-zlmediakit nc -zv 172.17.0.1 3002"

# Verificar se backend está respondendo
echo -e "${BLUE}Testando endpoint de health do backend...${NC}"
execute_remote "curl -s -o /dev/null -w '%{http_code}' http://localhost:3002/health"

echo -e "${YELLOW}11. Verificando configuração final dentro do container...${NC}"
execute_remote "cd $SERVER_PATH && docker exec newcam-zlmediakit cat /opt/media/conf/config.ini | grep -A 5 'on_record_mp4'"

echo -e "${YELLOW}12. Iniciando monitoramento de logs...${NC}"
echo -e "${BLUE}Para monitorar webhooks em tempo real, execute:${NC}"
echo -e "${GREEN}ssh root@$SERVER_IP${NC}"
echo -e "${GREEN}cd $SERVER_PATH${NC}"
echo -e "${GREEN}# Terminal 1: Backend logs${NC}"
echo -e "${GREEN}pm2 logs newcam-backend${NC}"
echo -e "${GREEN}# Terminal 2: ZLMediaKit logs${NC}"
echo -e "${GREEN}docker logs newcam-zlmediakit -f${NC}"

echo ""
echo -e "${GREEN}=== CORREÇÃO APLICADA COM SUCESSO! ===${NC}"
echo ""
echo -e "${YELLOW}Próximos passos para validação:${NC}"
echo "1. Ativar uma câmera para gravar"
echo "2. Monitorar logs para verificar webhook funcionando"
echo "3. Confirmar que gravações aparecem na interface"
echo ""
echo -e "${YELLOW}Comandos de validação:${NC}"
echo "ssh root@66.94.104.241"
echo "cd /var/www/newcam"
echo "# Verificar se arquivos MP4 são criados:"
echo "ls -la storage/www/record/live/"
echo "# Verificar registros no banco:"
echo "# (Acessar interface web e verificar aba Gravações)"
echo ""
echo -e "${GREEN}Correção concluída. Sistema de gravações deve estar funcionando agora.${NC}"