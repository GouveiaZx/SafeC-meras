#!/bin/bash
################################################################################
# Script de Monitoramento de Segurança - NewCAM Sistema
# Detecta tentativas de exploit e comportamentos suspeitos
# Data: 2025-11-15
################################################################################

# Configurações
LOG_DIR="/root/NewCAM/storage/logs"
ERROR_LOG="$LOG_DIR/error.log"
ALERT_LOG="$LOG_DIR/security-alerts.log"
REPORT_DIR="/root/NewCAM/storage/reports"
REPORT_FILE="$REPORT_DIR/security-report-$(date +%Y-%m-%d).log"

# Criar diretórios se não existirem
mkdir -p "$REPORT_DIR"
touch "$ALERT_LOG"

# Cores para output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo "=================================="
echo "NewCAM Security Monitor"
echo "$(date)"
echo "=================================="
echo ""

################################################################################
# 1. Detectar Tentativas de Exploit de Vulnerabilidades Conhecidas
################################################################################

echo -e "${YELLOW}[1] Verificando tentativas de exploit...${NC}"

# Padrões suspeitos comuns
EXPLOIT_PATTERNS=(
  "phpunit"
  "eval-stdin"
  "shell.php"
  "cmd.php"
  "\.\./"      # Path traversal
  "/etc/passwd"
  "/proc/self"
  "base64_decode"
  "system("
  "exec("
  "/bin/sh"
  "/bin/bash"
)

exploit_count=0
for pattern in "${EXPLOIT_PATTERNS[@]}"; do
  count=$(grep -i "$pattern" "$ERROR_LOG" 2>/dev/null | grep "$(date +%Y-%m-%d)" | wc -l)
  if [ $count -gt 0 ]; then
    echo -e "  ${RED}⚠️  Detectado: $pattern ($count tentativas hoje)${NC}"
    exploit_count=$((exploit_count + count))

    # Log para arquivo de alertas
    echo "$(date '+%Y-%m-%d %H:%M:%S') - EXPLOIT_ATTEMPT: $pattern ($count vezes)" >> "$ALERT_LOG"
  fi
done

if [ $exploit_count -eq 0 ]; then
  echo -e "  ${GREEN}✅ Nenhuma tentativa de exploit detectada hoje${NC}"
else
  echo -e "  ${RED}🚨 Total: $exploit_count tentativas de exploit hoje${NC}"
fi

echo ""

################################################################################
# 2. Analisar User Agents Suspeitos
################################################################################

echo -e "${YELLOW}[2] Verificando user agents suspeitos...${NC}"

# User agents comuns de bots maliciosos
SUSPICIOUS_UAS=(
  "libredtail"
  "sqlmap"
  "nikto"
  "nmap"
  "masscan"
  "zgrab"
  "python-requests/2.6"
  "curl/7.1"
)

suspicious_ua_count=0
for ua in "${SUSPICIOUS_UAS[@]}"; do
  count=$(grep -i "userAgent.*$ua" "$ERROR_LOG" 2>/dev/null | grep "$(date +%Y-%m-%d)" | wc -l)
  if [ $count -gt 0 ]; then
    echo -e "  ${RED}⚠️  User Agent suspeito: $ua ($count requisições)${NC}"
    suspicious_ua_count=$((suspicious_ua_count + count))

    # Log para arquivo de alertas
    echo "$(date '+%Y-%m-%d %H:%M:%S') - SUSPICIOUS_UA: $ua ($count vezes)" >> "$ALERT_LOG"
  fi
done

if [ $suspicious_ua_count -eq 0 ]; then
  echo -e "  ${GREEN}✅ Nenhum user agent suspeito detectado${NC}"
else
  echo -e "  ${RED}🚨 Total: $suspicious_ua_count requisições suspeitas${NC}"
fi

echo ""

################################################################################
# 3. Verificar Tentativas de Brute Force (Rate Limiting)
################################################################################

echo -e "${YELLOW}[3] Verificando tentativas de brute force...${NC}"

# Contar quantos rate limits foram acionados hoje
rate_limit_count=$(grep -i "rate limit\|429\|too many requests" "$ERROR_LOG" 2>/dev/null | grep "$(date +%Y-%m-%d)" | wc -l)

if [ $rate_limit_count -gt 10 ]; then
  echo -e "  ${RED}⚠️  Rate limiting acionado $rate_limit_count vezes hoje${NC}"
  echo "$(date '+%Y-%m-%d %H:%M:%S') - RATE_LIMIT_TRIGGERED: $rate_limit_count vezes" >> "$ALERT_LOG"
elif [ $rate_limit_count -gt 0 ]; then
  echo -e "  ${YELLOW}ℹ️  Rate limiting acionado $rate_limit_count vezes (normal)${NC}"
else
  echo -e "  ${GREEN}✅ Nenhuma tentativa de brute force detectada${NC}"
fi

echo ""

################################################################################
# 4. Verificar Acessos a Rotas Não Existentes (404)
################################################################################

echo -e "${YELLOW}[4] Verificando varredura de diretórios (404s)...${NC}"

# Contar 404s suspeitos (múltiplos 404s podem indicar scanning)
not_found_count=$(grep -i "não encontrada\|not found" "$ERROR_LOG" 2>/dev/null | grep "$(date +%Y-%m-%d)" | wc -l)

if [ $not_found_count -gt 50 ]; then
  echo -e "  ${RED}⚠️  $not_found_count rotas não encontradas (possível directory scanning)${NC}"
  echo "$(date '+%Y-%m-%d %H:%M:%S') - DIRECTORY_SCANNING: $not_found_count 404s" >> "$ALERT_LOG"

  # Listar top 5 rotas mais requisitadas
  echo -e "  ${YELLOW}Top 5 rotas não encontradas:${NC}"
  grep -i "Rota.*não encontrada" "$ERROR_LOG" | grep "$(date +%Y-%m-%d)" | grep -oP 'Rota \K[^ ]+' | sort | uniq -c | sort -rn | head -5 | sed 's/^/    /'
elif [ $not_found_count -gt 0 ]; then
  echo -e "  ${GREEN}✅ $not_found_count rotas não encontradas (normal)${NC}"
else
  echo -e "  ${GREEN}✅ Nenhuma tentativa de scanning detectada${NC}"
fi

echo ""

################################################################################
# 5. Verificar IPs com Alto Volume de Erros
################################################################################

echo -e "${YELLOW}[5] Verificando IPs com alto volume de erros...${NC}"

# Extrair IPs únicos dos logs de erro de hoje
ips_with_errors=$(grep "$(date +%Y-%m-%d)" "$ERROR_LOG" 2>/dev/null | grep -oP '"ip":"[^"]+' | cut -d'"' -f4 | sort | uniq -c | sort -rn | head -10)

if [ -n "$ips_with_errors" ]; then
  echo -e "  ${YELLOW}Top 10 IPs com mais erros hoje:${NC}"
  echo "$ips_with_errors" | while read count ip; do
    if [ $count -gt 20 ]; then
      echo -e "    ${RED}$ip: $count erros (SUSPEITO)${NC}"
      echo "$(date '+%Y-%m-%d %H:%M:%S') - HIGH_ERROR_IP: $ip ($count erros)" >> "$ALERT_LOG"
    else
      echo -e "    $ip: $count erros"
    fi
  done
else
  echo -e "  ${GREEN}✅ Nenhum IP com volume alto de erros${NC}"
fi

echo ""

################################################################################
# 6. Gerar Relatório Resumido
################################################################################

echo -e "${YELLOW}[6] Gerando relatório de segurança...${NC}"

cat > "$REPORT_FILE" << EOF
========================================
RELATÓRIO DE SEGURANÇA - NewCAM
$(date)
========================================

1. TENTATIVAS DE EXPLOIT
   - Total de tentativas: $exploit_count
   - Status: $([ $exploit_count -eq 0 ] && echo "✅ NORMAL" || echo "⚠️  ALERTA")

2. USER AGENTS SUSPEITOS
   - Total de requisições: $suspicious_ua_count
   - Status: $([ $suspicious_ua_count -eq 0 ] && echo "✅ NORMAL" || echo "⚠️  ALERTA")

3. TENTATIVAS DE BRUTE FORCE
   - Rate limit acionado: $rate_limit_count vezes
   - Status: $([ $rate_limit_count -le 10 ] && echo "✅ NORMAL" || echo "⚠️  ALTO")

4. DIRECTORY SCANNING
   - Rotas não encontradas: $not_found_count
   - Status: $([ $not_found_count -le 50 ] && echo "✅ NORMAL" || echo "⚠️  POSSÍVEL SCANNING")

5. IPS COM ALTO VOLUME DE ERROS
$ips_with_errors

========================================
RECOMENDAÇÕES
========================================

$(if [ $exploit_count -gt 0 ] || [ $suspicious_ua_count -gt 5 ] || [ $not_found_count -gt 100 ]; then
  echo "⚠️  AÇÃO REQUERIDA:"
  echo "  - Revisar logs manualmente: $ERROR_LOG"
  echo "  - Considerar implementar fail2ban"
  echo "  - Verificar firewall rules"
  echo "  - Bloquear IPs suspeitos se necessário"
else
  echo "✅ Sistema seguro - nenhuma ação imediata requerida"
  echo "   Continue monitorando regularmente."
fi)

========================================
LOGS DETALHADOS
========================================

Alertas salvos em: $ALERT_LOG
Relatório completo: $REPORT_FILE

Para revisar logs de segurança:
  tail -f $ALERT_LOG

Para ver tentativas de exploit em tempo real:
  tail -f $ERROR_LOG | grep -i 'phpunit\|exploit\|attack'

EOF

echo -e "  ${GREEN}✅ Relatório salvo em: $REPORT_FILE${NC}"
echo -e "  ${GREEN}✅ Alertas em: $ALERT_LOG${NC}"

echo ""

################################################################################
# 7. Resumo e Status Final
################################################################################

echo "=================================="
echo -e "${GREEN}RESUMO DO MONITORAMENTO${NC}"
echo "=================================="
echo -e "Tentativas de exploit:     ${RED}$exploit_count${NC}"
echo -e "User agents suspeitos:     ${RED}$suspicious_ua_count${NC}"
echo -e "Rate limiting:             ${YELLOW}$rate_limit_count${NC}"
echo -e "Rotas não encontradas:     ${YELLOW}$not_found_count${NC}"
echo ""

# Status geral
TOTAL_THREATS=$((exploit_count + suspicious_ua_count))
if [ $TOTAL_THREATS -eq 0 ]; then
  echo -e "${GREEN}✅ STATUS: SEGURO${NC}"
  echo "Nenhuma ameaça detectada hoje."
elif [ $TOTAL_THREATS -le 10 ]; then
  echo -e "${YELLOW}⚠️  STATUS: ATENÇÃO${NC}"
  echo "Algumas ameaças detectadas - monitorar."
else
  echo -e "${RED}🚨 STATUS: ALERTA${NC}"
  echo "Múltiplas ameaças detectadas - ação requerida!"
fi

echo ""
echo "Para mais detalhes: cat $REPORT_FILE"
echo "=================================="
