/**
 * StreamHealthMonitorService - Serviço para monitorar a saúde de streams em tempo real
 * Detecta problemas como travamentos, buffer issues e perda de conexão
 */

interface HealthCheckInfo {
  videoElement: HTMLVideoElement;
  lastCheck: number;
  lastCurrentTime: number;
  consecutiveFailures: number;
  isStalled: boolean;
  hasBufferIssues: boolean;
  checkInterval?: NodeJS.Timeout;
  lastRecoveryAttempt?: number;
  recoveryAttempts: number;
  bufferRetryCount: number;
  lastBufferRetry?: number;
}

interface StreamHealthMetrics {
  streamId: string;
  isStalled: boolean;
  hasBufferIssues: boolean;
  bufferHealth: number; // 0-100%
  consecutiveFailures: number;
  lastUpdate: number;
}

type HealthEventType = 'stream-stalled' | 'buffer-issues' | 'stream-recovered' | 'stream-recovery-needed';

interface HealthEventDetail {
  streamId: string;
  metrics: StreamHealthMetrics;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

class StreamHealthMonitorService {
  private healthChecks = new Map<string, HealthCheckInfo>();
  private checkInterval = 8000; // 8 segundos (mais frequente)
  private stallThreshold = 4000; // 4 segundos sem progresso = travado
  private bufferThreshold = 3; // Menos de 3 segundos de buffer = problema
  private criticalBufferThreshold = 1; // Menos de 1 segundo = crítico
  private maxConsecutiveFailures = 5; // Mais tolerante
  private maxRecoveryAttempts = 3;
  private bufferRetryDelay = 2000; // 2 segundos entre tentativas de buffer
  private recoveryBackoffMultiplier = 1.5;

  /**
   * Inicia o monitoramento de uma stream
   */
  startMonitoring(streamId: string, videoElement: HTMLVideoElement): void {
    console.log(`🔍 [StreamHealthMonitor] Iniciando monitoramento: ${streamId}`);
    
    // Parar monitoramento anterior se existir
    this.stopMonitoring(streamId);
    
    const healthCheck: HealthCheckInfo = {
      videoElement,
      lastCheck: Date.now(),
      lastCurrentTime: videoElement.currentTime,
      consecutiveFailures: 0,
      isStalled: false,
      hasBufferIssues: false,
      recoveryAttempts: 0,
      bufferRetryCount: 0
    };
    
    this.healthChecks.set(streamId, healthCheck);
    this.scheduleHealthCheck(streamId);
  }

  /**
   * Para o monitoramento de uma stream
   */
  stopMonitoring(streamId: string): void {
    console.log(`🛑 [StreamHealthMonitor] Parando monitoramento: ${streamId}`);
    
    const healthCheck = this.healthChecks.get(streamId);
    if (healthCheck?.checkInterval) {
      clearTimeout(healthCheck.checkInterval);
    }
    
    this.healthChecks.delete(streamId);
  }

  /**
   * Obtém métricas de saúde de uma stream
   */
  getStreamMetrics(streamId: string): StreamHealthMetrics | null {
    const healthCheck = this.healthChecks.get(streamId);
    if (!healthCheck) return null;

    const bufferHealth = this.calculateBufferHealth(healthCheck.videoElement);
    
    return {
      streamId,
      isStalled: healthCheck.isStalled,
      hasBufferIssues: healthCheck.hasBufferIssues,
      bufferHealth,
      consecutiveFailures: healthCheck.consecutiveFailures,
      lastUpdate: healthCheck.lastCheck
    };
  }

  /**
   * Obtém lista de todas as streams sendo monitoradas
   */
  getMonitoredStreams(): string[] {
    return Array.from(this.healthChecks.keys());
  }

  /**
   * Verifica se uma stream está saudável
   */
  isStreamHealthy(streamId: string): boolean {
    const healthCheck = this.healthChecks.get(streamId);
    if (!healthCheck) return false;
    
    return !healthCheck.isStalled && 
           !healthCheck.hasBufferIssues && 
           healthCheck.consecutiveFailures < this.maxConsecutiveFailures;
  }

  /**
   * Agenda a próxima verificação de saúde
   */
  private scheduleHealthCheck(streamId: string): void {
    const healthCheck = this.healthChecks.get(streamId);
    if (!healthCheck) return;

    healthCheck.checkInterval = setTimeout(() => {
      if (this.healthChecks.has(streamId)) {
        this.performHealthCheck(streamId);
        this.scheduleHealthCheck(streamId); // Reagendar
      }
    }, this.checkInterval);
  }

  /**
   * Executa verificação de saúde em uma stream
   */
  private performHealthCheck(streamId: string): void {
    const healthCheck = this.healthChecks.get(streamId);
    if (!healthCheck) return;

    const { videoElement } = healthCheck;
    const now = Date.now();
    
    // Verificar se o elemento ainda está válido
    if (!videoElement.isConnected) {
      console.warn(`⚠️ [StreamHealthMonitor] Elemento de vídeo desconectado: ${streamId}`);
      this.stopMonitoring(streamId);
      return;
    }

    // Verificar se o vídeo está travado
    const isStalled = this.checkIfStalled(videoElement, healthCheck, now);
    
    // Verificar problemas de buffer
    const hasBufferIssues = this.checkBufferIssues(videoElement);
    
    // Calcular severidade do problema
    const severity = this.calculateSeverity(isStalled, hasBufferIssues, healthCheck.consecutiveFailures);
    
    // Atualizar estado
    const hadProblems = healthCheck.isStalled || healthCheck.hasBufferIssues;
    healthCheck.isStalled = isStalled;
    healthCheck.hasBufferIssues = hasBufferIssues;
    healthCheck.lastCheck = now;
    healthCheck.lastCurrentTime = videoElement.currentTime;
    
    const hasProblems = isStalled || hasBufferIssues;
    
    if (hasProblems) {
      healthCheck.consecutiveFailures++;
      
      console.warn(`🚨 [StreamHealthMonitor] Problema detectado em ${streamId}:`, {
        isStalled,
        hasBufferIssues,
        consecutiveFailures: healthCheck.consecutiveFailures,
        severity
      });
      
      // Emitir eventos específicos
      if (isStalled) {
        this.emitHealthEvent('stream-stalled', streamId, severity);
      }
      if (hasBufferIssues) {
        this.emitHealthEvent('buffer-issues', streamId, severity);
      }
      
      // Trigger recovery se necessário
      if (healthCheck.consecutiveFailures >= this.maxConsecutiveFailures) {
        this.triggerRecovery(streamId, severity);
      }
    } else {
      // Stream está saudável
      if (hadProblems) {
        console.log(`✅ [StreamHealthMonitor] Stream ${streamId} recuperada`);
        this.emitHealthEvent('stream-recovered', streamId, 'low');
      }
      
      healthCheck.consecutiveFailures = 0;
    }
  }

  /**
   * Verifica se o vídeo está travado
   */
  private checkIfStalled(video: HTMLVideoElement, healthCheck: HealthCheckInfo, now: number): boolean {
    // Não considerar travado se pausado, finalizado ou carregando
    if (video.paused || video.ended || video.readyState < 2) {
      return false;
    }
    
    const currentTime = video.currentTime;
    const timeSinceLastCheck = now - healthCheck.lastCheck;
    const timeProgress = Math.abs(currentTime - healthCheck.lastCurrentTime);
    
    // Se passou tempo suficiente e o currentTime não mudou significativamente, está travado
    const isStalled = timeSinceLastCheck > this.stallThreshold && timeProgress < 0.1;
    
    if (isStalled) {
      console.warn(`⏸️ [StreamHealthMonitor] Stream travada detectada:`, {
        timeSinceLastCheck,
        timeProgress,
        currentTime,
        lastCurrentTime: healthCheck.lastCurrentTime,
        readyState: video.readyState
      });
    }
    
    return isStalled;
  }

  /**
   * Verifica problemas de buffer
   */
  private checkBufferIssues(video: HTMLVideoElement): boolean {
    if (video.buffered.length === 0) {
      return true; // Sem buffer = problema
    }
    
    const currentTime = video.currentTime;
    const bufferedEnd = video.buffered.end(video.buffered.length - 1);
    const bufferAhead = bufferedEnd - currentTime;
    
    // Verificar se há buffer suficiente à frente
    const hasBufferIssues = bufferAhead < this.bufferThreshold;
    
    if (hasBufferIssues) {
      console.warn(`📊 [StreamHealthMonitor] Buffer insuficiente:`, {
        currentTime,
        bufferedEnd,
        bufferAhead,
        threshold: this.bufferThreshold
      });
    }
    
    return hasBufferIssues;
  }

  /**
   * Calcula a saúde do buffer (0-100%)
   */
  private calculateBufferHealth(video: HTMLVideoElement): number {
    if (video.buffered.length === 0) return 0;
    
    const currentTime = video.currentTime;
    const bufferedEnd = video.buffered.end(video.buffered.length - 1);
    const bufferAhead = Math.max(0, bufferedEnd - currentTime);
    
    // Normalizar para 0-100% baseado em 10 segundos como ideal
    const idealBuffer = 10;
    return Math.min(100, (bufferAhead / idealBuffer) * 100);
  }

  /**
   * Calcula a severidade do problema
   */
  private calculateSeverity(
    isStalled: boolean, 
    hasBufferIssues: boolean, 
    consecutiveFailures: number
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (consecutiveFailures >= this.maxConsecutiveFailures) {
      return 'critical';
    }
    
    if (isStalled && hasBufferIssues) {
      return 'high';
    }
    
    if (isStalled || (hasBufferIssues && consecutiveFailures > 1)) {
      return 'medium';
    }
    
    return 'low';
  }

  /**
   * Emite evento de saúde
   */
  private emitHealthEvent(type: HealthEventType, streamId: string, severity: 'low' | 'medium' | 'high' | 'critical'): void {
    const metrics = this.getStreamMetrics(streamId);
    if (!metrics) return;
    
    const detail: HealthEventDetail = {
      streamId,
      metrics,
      severity
    };
    
    window.dispatchEvent(new CustomEvent(type, { detail }));
  }

  /**
   * Trigger recovery para uma stream com problemas
   */
  private triggerRecovery(streamId: string, severity: 'low' | 'medium' | 'high' | 'critical'): void {
    console.log(`🔄 [StreamHealthMonitor] Iniciando recuperação para stream ${streamId} (severidade: ${severity})`);
    
    const healthCheck = this.healthChecks.get(streamId);
    if (!healthCheck) return;
    
    // Implementar estratégias de recuperação baseadas na severidade
    switch (severity) {
      case 'low':
        // Para problemas leves, apenas emitir evento
        this.emitHealthEvent('stream-recovery-needed', streamId, severity);
        break;
        
      case 'medium':
        // Para problemas médios, tentar recuperação suave
        this.attemptSoftRecovery(streamId);
        break;
        
      case 'high':
      case 'critical':
        // Para problemas graves, forçar reinicialização
        this.attemptHardRecovery(streamId);
        break;
    }
  }
  
  /**
   * Tentativa de recuperação suave (sem reinicializar o player)
   */
  private attemptSoftRecovery(streamId: string): void {
    console.log(`🔧 [StreamHealthMonitor] Tentando recuperação suave para ${streamId}`);
    
    const healthCheck = this.healthChecks.get(streamId);
    if (!healthCheck?.videoElement) return;
    
    const video = healthCheck.videoElement;
    
    try {
      // Tentar seek para posição atual + 0.1s para forçar buffer refresh
      if (video.currentTime > 0) {
        const newTime = Math.min(video.currentTime + 0.1, video.duration || video.currentTime + 0.1);
        video.currentTime = newTime;
        console.log(`🎯 [StreamHealthMonitor] Seek para ${newTime}s para refresh do buffer`);
      }
      
      // Se ainda estiver pausado, tentar play
      if (video.paused && !video.ended) {
        video.play().catch(error => {
          console.warn(`⚠️ [StreamHealthMonitor] Falha no play durante recuperação suave:`, error);
        });
      }
      
    } catch (error) {
      console.warn(`⚠️ [StreamHealthMonitor] Erro na recuperação suave:`, error);
      // Se recuperação suave falhar, escalar para recuperação hard
      this.attemptHardRecovery(streamId);
    }
  }
  
  /**
   * Tentativa de recuperação hard (reinicializar o player)
   */
  private attemptHardRecovery(streamId: string): void {
    console.log(`🔨 [StreamHealthMonitor] Tentando recuperação hard para ${streamId}`);
    
    // Emitir evento para o VideoPlayer reinicializar completamente
    this.emitHealthEvent('stream-recovery-needed', streamId, 'critical');
    
    // Resetar contadores para evitar loops infinitos
    const healthCheck = this.healthChecks.get(streamId);
    if (healthCheck) {
      healthCheck.consecutiveFailures = 0;
      healthCheck.lastRecoveryAttempt = Date.now();
    }
  }

  /**
   * Força uma verificação imediata de todas as streams
   */
  forceHealthCheck(): void {
    console.log('🔄 [StreamHealthMonitor] Executando verificação forçada de saúde');
    
    const streamIds = Array.from(this.healthChecks.keys());
    streamIds.forEach(streamId => this.performHealthCheck(streamId));
  }

  /**
   * Obtém estatísticas gerais do monitoramento
   */
  getStats(): {
    totalStreams: number;
    healthyStreams: number;
    stalledStreams: number;
    bufferIssueStreams: number;
    criticalStreams: number;
  } {
    const streamIds = Array.from(this.healthChecks.keys());
    
    let healthyStreams = 0;
    let stalledStreams = 0;
    let bufferIssueStreams = 0;
    let criticalStreams = 0;
    
    streamIds.forEach(streamId => {
      const healthCheck = this.healthChecks.get(streamId);
      if (!healthCheck) return;
      
      if (healthCheck.consecutiveFailures >= this.maxConsecutiveFailures) {
        criticalStreams++;
      } else if (healthCheck.isStalled) {
        stalledStreams++;
      } else if (healthCheck.hasBufferIssues) {
        bufferIssueStreams++;
      } else {
        healthyStreams++;
      }
    });
    
    return {
      totalStreams: streamIds.length,
      healthyStreams,
      stalledStreams,
      bufferIssueStreams,
      criticalStreams
    };
  }

  /**
   * Limpa todos os recursos
   */
  destroy(): void {
    console.log('🗑️ [StreamHealthMonitor] Destruindo serviço');
    
    // Parar todos os monitoramentos
    const streamIds = Array.from(this.healthChecks.keys());
    streamIds.forEach(streamId => this.stopMonitoring(streamId));
  }
}

// Instância singleton
export const streamHealthMonitor = new StreamHealthMonitorService();

// Cleanup automático quando a página é fechada
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    streamHealthMonitor.destroy();
  });
}

export default streamHealthMonitor;

// Exportar tipos para uso em outros módulos
export type { StreamHealthMetrics, HealthEventDetail, HealthEventType };