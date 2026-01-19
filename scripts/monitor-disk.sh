#!/bin/bash
# NewCAM Disk Monitor - Executa a cada 10 minutos via cron
LOG=/root/NewCAM/storage/logs/disk-monitor.log

# Obter uso do disco
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | tr -d '%')

# Verificar discrepância du vs df (indicador de arquivos deletados abertos)
DU_SIZE=$(du -sx / 2>/dev/null | awk '{print $1}')
DF_USED=$(df / | tail -1 | awk '{print $3}')
DIFF_MB=$(( (DF_USED - DU_SIZE) / 1024 ))

# Se discrepância > 5GB ou disco > 85%, logar alerta
if [ "$DIFF_MB" -gt 5120 ] || [ "$DISK_USAGE" -gt 85 ]; then
    echo "$(date): ALERTA - Disco: ${DISK_USAGE}%, Discrepância du/df: ${DIFF_MB}MB" >> $LOG

    # Se discrepância > 10GB, fazer reloadLogs automaticamente
    if [ "$DIFF_MB" -gt 10240 ]; then
        echo "$(date): Discrepância > 10GB, executando pm2 reloadLogs..." >> $LOG
        cd /root/NewCAM && pm2 reloadLogs >> $LOG 2>&1
    fi

    # Se disco > 90%, ação de emergência
    if [ "$DISK_USAGE" -gt 90 ]; then
        echo "$(date): EMERGÊNCIA - Disco > 90%, executando cleanup de emergência..." >> $LOG
        /root/NewCAM/scripts/cleanup.sh >> $LOG 2>&1

        # Se ainda > 95%, fazer restart do PM2
        NEW_USAGE=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
        if [ "$NEW_USAGE" -gt 95 ]; then
            echo "$(date): Disco ainda > 95%, reiniciando PM2..." >> $LOG
            pm2 restart all >> $LOG 2>&1
            sleep 10
            cd /root/NewCAM/backend && node src/scripts/startCameraStreaming.js >> $LOG 2>&1
        fi
    fi
fi

# Manter log pequeno (últimas 500 linhas)
tail -500 $LOG > ${LOG}.tmp && mv ${LOG}.tmp $LOG 2>/dev/null
