#!/bin/bash
# NewCAM Cleanup Script - Executa a cada hora via cron
LOG=/root/NewCAM/storage/logs/cleanup.log
SRS_RECORD=/var/lib/docker/volumes/newcam_srs_data/_data/record
ZLM_RECORD=/root/NewCAM/storage/www/record
HLS_LIVE=/root/NewCAM/storage/www/live

echo "========== $(date) ==========" >> $LOG

# 0. NOVO: Verificar arquivos deletados abertos (causa principal do problema de disco)
DELETED_SIZE=$(lsof +L1 2>/dev/null | awk '{sum+=$7} END {print int(sum/1024/1024)}')
if [ "$DELETED_SIZE" -gt 2048 ]; then
    echo "⚠️ Arquivos deletados abertos: ${DELETED_SIZE}MB - executando pm2 reloadLogs" >> $LOG
    cd /root/NewCAM && pm2 reloadLogs >> $LOG 2>&1
fi

# 1. HLS: Limpar segmentos > 30 min
HLS_DEL=$(find $HLS_LIVE -name "*.ts" -mmin +30 -delete -print 2>/dev/null | wc -l)
find $HLS_LIVE -name "*.m3u8" -mmin +30 -delete 2>/dev/null
echo "HLS segments deleted: $HLS_DEL" >> $LOG

# 2. HLS: Limpar arquivos > 50MB (protecao corrupcao)
find $HLS_LIVE -type f -size +50M -delete 2>/dev/null

# 3. HLS: Limpar pastas de datas antigas (>1 dia)
find $HLS_LIVE -mindepth 2 -type d -mtime +1 -exec rm -rf {} \; 2>/dev/null

# 4. SRS: Limpar arquivos .mp4.tmp > 2 horas (gravacoes interrompidas)
SRS_TMP=$(find $SRS_RECORD -name "*.mp4.tmp" -mmin +120 -delete -print 2>/dev/null | wc -l)
echo "SRS .tmp files deleted: $SRS_TMP" >> $LOG

# 5. SRS: Limpar arquivos de 0 bytes (inodes vazios)
SRS_ZERO=$(find $SRS_RECORD -type f -size 0 -delete -print 2>/dev/null | wc -l)
echo "SRS zero-byte files deleted: $SRS_ZERO" >> $LOG

# 6. SRS: Limpar gravacoes finais > 2 dias
SRS_OLD=$(find $SRS_RECORD -name "*.mp4" -mtime +2 -delete -print 2>/dev/null | wc -l)
echo "SRS old mp4 deleted: $SRS_OLD" >> $LOG

# 7. ZLM: Limpar gravacoes > 3 dias (backup extra)
ZLM_OLD=$(find $ZLM_RECORD -name "*.mp4" -mtime +3 -delete -print 2>/dev/null | wc -l)
echo "ZLM old mp4 deleted: $ZLM_OLD" >> $LOG

# 8. Limpar pastas vazias
find $HLS_LIVE -type d -empty -delete 2>/dev/null
find $SRS_RECORD -type d -empty -delete 2>/dev/null
find $ZLM_RECORD -type d -empty -delete 2>/dev/null

# 9. Docker logs: truncar se muito grandes (>100MB)
for LOG_FILE in /var/lib/docker/containers/*/*.log; do
  if [ -f "$LOG_FILE" ]; then
    SIZE=$(stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)
    if [ "$SIZE" -gt 104857600 ]; then
      truncate -s 50M "$LOG_FILE" 2>/dev/null
      echo "Docker log truncado: $LOG_FILE" >> $LOG
    fi
  fi
done

# 10. NOVO: Limpar logs PM2 antigos comprimidos
find /root/NewCAM/storage/logs -name "*.log.gz" -mtime +7 -delete 2>/dev/null
find /root/.pm2/logs -name "*.log.gz" -mtime +7 -delete 2>/dev/null
PM2_LOGS_DEL=$(find /root/NewCAM/storage/logs -name "*.log-*" -mtime +3 -delete -print 2>/dev/null | wc -l)
echo "PM2 old logs deleted: $PM2_LOGS_DEL" >> $LOG

# 11. NOVO: Verificar discrepância du/df
DU_SIZE=$(du -sx / 2>/dev/null | awk '{print $1}')
DF_USED=$(df / | tail -1 | awk '{print $3}')
DIFF_GB=$(( (DF_USED - DU_SIZE) / 1024 / 1024 ))
if [ "$DIFF_GB" -gt 5 ]; then
    echo "⚠️ Discrepância du/df: ${DIFF_GB}GB" >> $LOG
fi

echo "Disk usage:" >> $LOG
df -h / >> $LOG
echo "Cleanup done" >> $LOG

# Manter log pequeno
tail -500 $LOG > ${LOG}.tmp && mv ${LOG}.tmp $LOG 2>/dev/null
