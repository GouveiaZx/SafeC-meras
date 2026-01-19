#!/bin/bash
# NewCAM Preventive Maintenance Script
# Executa diariamente às 4h via cron

LOG=/root/NewCAM/storage/logs/maintenance.log
ALERT_THRESHOLD=80
CRITICAL_THRESHOLD=90

echo "========== $(date) ==========" >> $LOG

# 1. Verificar arquivos deletados abertos (causa do problema de disco)
DELETED_FILES=$(lsof +L1 2>/dev/null | wc -l)
DELETED_SIZE=$(lsof +L1 2>/dev/null | awk '{sum+=$7} END {print int(sum/1024/1024)}')

echo "Arquivos deletados abertos: $DELETED_FILES (aprox ${DELETED_SIZE}MB)" >> $LOG

# Se há mais de 1GB em arquivos deletados abertos, fazer reloadLogs
if [ "$DELETED_SIZE" -gt 1024 ]; then
    echo "⚠️ Detectado ${DELETED_SIZE}MB em arquivos deletados abertos!" >> $LOG
    echo "Executando pm2 reloadLogs..." >> $LOG
    cd /root/NewCAM && pm2 reloadLogs >> $LOG 2>&1

    # Verificar novamente
    sleep 5
    NEW_SIZE=$(lsof +L1 2>/dev/null | awk '{sum+=$7} END {print int(sum/1024/1024)}')
    echo "Após reloadLogs: ${NEW_SIZE}MB" >> $LOG

    # Se ainda persistir, fazer restart
    if [ "$NEW_SIZE" -gt 5120 ]; then
        echo "⚠️ Ainda há ${NEW_SIZE}MB - fazendo restart do PM2..." >> $LOG
        pm2 restart all >> $LOG 2>&1
        sleep 10
        # Reativar câmeras após restart
        cd /root/NewCAM/backend && node src/scripts/startCameraStreaming.js >> $LOG 2>&1
    fi
fi

# 2. Verificar uso de disco
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
echo "Uso de disco: ${DISK_USAGE}%" >> $LOG

if [ "$DISK_USAGE" -gt $CRITICAL_THRESHOLD ]; then
    echo "🔴 CRÍTICO: Disco acima de ${CRITICAL_THRESHOLD}%!" >> $LOG
    # Executar cleanup de emergência
    /root/NewCAM/scripts/cleanup.sh
    # Limpar logs antigos
    find /root/NewCAM/storage/logs -name "*.log.*" -mtime +3 -delete
    find /root/.pm2/logs -name "*.log.*" -mtime +3 -delete
    # Docker prune
    docker system prune -f >> $LOG 2>&1
elif [ "$DISK_USAGE" -gt $ALERT_THRESHOLD ]; then
    echo "⚠️ ALERTA: Disco acima de ${ALERT_THRESHOLD}%" >> $LOG
fi

# 3. Verificar discrepância du vs df (indicador de arquivos deletados abertos)
DU_SIZE=$(du -sx / 2>/dev/null | awk '{print $1}')
DF_USED=$(df / | tail -1 | awk '{print $3}')
DIFF=$((DF_USED - DU_SIZE))
DIFF_GB=$((DIFF / 1024 / 1024))

if [ "$DIFF_GB" -gt 5 ]; then
    echo "⚠️ Discrepância du/df: ${DIFF_GB}GB - possíveis arquivos deletados abertos" >> $LOG
fi

# 4. Verificar saúde dos containers Docker
for container in newcam-zlmediakit newcam-srs newcam-redis; do
    STATUS=$(docker inspect -f '{{.State.Status}}' $container 2>/dev/null)
    if [ "$STATUS" != "running" ]; then
        echo "⚠️ Container $container não está running: $STATUS" >> $LOG
        docker start $container >> $LOG 2>&1
    fi
done

# 5. Verificar se PM2 está rodando corretamente
PM2_STATUS=$(pm2 jlist 2>/dev/null | python3 -c 'import json,sys; data=json.load(sys.stdin); online=[p for p in data if p.get("pm2_env",{}).get("status")=="online"]; print(len(online))')
if [ "$PM2_STATUS" -lt 2 ]; then
    echo "⚠️ Menos de 2 processos PM2 online: $PM2_STATUS" >> $LOG
    pm2 restart all >> $LOG 2>&1
fi

# 6. Salvar PM2 para persistência
pm2 save >> $LOG 2>&1

echo "Manutenção preventiva concluída" >> $LOG
echo "" >> $LOG
