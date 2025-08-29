/**
 * GlobalKeepAliveService - Serviço para manter conexões de streams ativas
 * Implementa keep-alive automático para streams registradas
 */

interface StreamInfo {
  url: string;
  token: string;
  lastPing: number;
  isHealthy: boolean;
  consecutiveFailures: number;
}

class GlobalKeepAliveService {
  private activeStreams = new Map<string, StreamInfo>();
  private keepAliveInterval = 30000; // 30 segundos
  private intervalId?: NodeJS.Timeout;
  private maxConsecutiveFailures = 3;

  /**
   * Registra uma stream para monitoramento keep-alive
   */
  registerStream(streamId: string, url: string, token: string): void {
    console.log(`✅ [GlobalKeepAlive] Registrando stream: ${streamId}`);
    
    this.activeStreams.set(streamId, {
      url,
      token,
      lastPing: Date.now(),
      isHealthy: true,
      consecutiveFailures: 0
    });

    // Iniciar keep-alive se for a primeira stream
    if (!this.intervalId) {
      this.startKeepAlive();
    }
  }

  /**
   * Remove uma stream do monitoramento
   */
  unregisterStream(streamId: string): void {
    console.log(`🗑️ [GlobalKeepAlive] Desregistrando stream: ${streamId}`);
    this.activeStreams.delete(streamId);

    // Parar keep-alive se não há mais streams
    if (this.activeStreams.size === 0 && this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      console.log('🛑 [GlobalKeepAlive] Keep-alive parado - nenhuma stream ativa');
    }
  }

  /**
   * Obtém informações de uma stream específica
   */
  getStreamInfo(streamId: string): StreamInfo | undefined {
    return this.activeStreams.get(streamId);
  }

  /**
   * Obtém lista de todas as streams ativas
   */
  getActiveStreams(): string[] {
    return Array.from(this.activeStreams.keys());
  }

  /**
   * Verifica se uma stream está saudável
   */
  isStreamHealthy(streamId: string): boolean {
    const info = this.activeStreams.get(streamId);
    return info?.isHealthy ?? false;
  }

  /**
   * Inicia o processo de keep-alive
   */
  private startKeepAlive(): void {
    console.log('🚀 [GlobalKeepAlive] Iniciando keep-alive automático');
    
    this.intervalId = setInterval(async () => {
      const streamIds = Array.from(this.activeStreams.keys());
      
      if (streamIds.length === 0) {
        return;
      }

      console.log(`💓 [GlobalKeepAlive] Executando keep-alive para ${streamIds.length} streams`);

      // Processar streams em paralelo com limite
      const promises = streamIds.map(streamId => this.pingStream(streamId));
      await Promise.allSettled(promises);
    }, this.keepAliveInterval);
  }

  /**
   * Executa ping em uma stream específica
   */
  private async pingStream(streamId: string): Promise<void> {
    const info = this.activeStreams.get(streamId);
    if (!info) return;

    try {
      // Usar a base da API respeitando VITE_API_URL
      const { getAPIBaseURL } = await import('@/lib/api');
      const apiBase = getAPIBaseURL().replace(/\/$/, '');

      const response = await fetch(`${apiBase}/streams/${streamId}/health`, {
        method: 'HEAD',
        headers: {
          'Authorization': `Bearer ${info.token}`,
          'Cache-Control': 'no-cache'
        },
        signal: AbortSignal.timeout(5000) // 5 segundos timeout
      });

      if (response.ok) {
        // Stream está saudável
        this.markStreamHealthy(streamId);
      } else {
        console.warn(`⚠️ [GlobalKeepAlive] Stream ${streamId} retornou status ${response.status}`);
        this.markStreamUnhealthy(streamId);
      }
    } catch (error) {
      console.warn(`❌ [GlobalKeepAlive] Keep-alive falhou para stream ${streamId}:`, error);
      this.markStreamUnhealthy(streamId);
    }
  }

  /**
   * Marca uma stream como saudável
   */
  private markStreamHealthy(streamId: string): void {
    const info = this.activeStreams.get(streamId);
    if (!info) return;

    this.activeStreams.set(streamId, {
      ...info,
      lastPing: Date.now(),
      isHealthy: true,
      consecutiveFailures: 0
    });

    console.log(`✅ [GlobalKeepAlive] Stream ${streamId} está saudável`);
  }

  /**
   * Marca uma stream como não saudável
   */
  private markStreamUnhealthy(streamId: string): void {
    const info = this.activeStreams.get(streamId);
    if (!info) return;

    const consecutiveFailures = info.consecutiveFailures + 1;
    const isHealthy = consecutiveFailures < this.maxConsecutiveFailures;

    this.activeStreams.set(streamId, {
      ...info,
      lastPing: Date.now(),
      isHealthy,
      consecutiveFailures
    });

    if (!isHealthy) {
      console.error(`💀 [GlobalKeepAlive] Stream ${streamId} marcada como não saudável após ${consecutiveFailures} falhas`);
      
      // Emitir evento para notificar componentes
      window.dispatchEvent(new CustomEvent('stream-unhealthy', {
        detail: { streamId, consecutiveFailures }
      }));
    } else {
      console.warn(`⚠️ [GlobalKeepAlive] Stream ${streamId} com ${consecutiveFailures} falhas consecutivas`);
    }
  }

  /**
   * Força uma verificação imediata de todas as streams
   */
  async forceHealthCheck(): Promise<void> {
    console.log('🔄 [GlobalKeepAlive] Executando verificação forçada de saúde');
    
    const streamIds = Array.from(this.activeStreams.keys());
    const promises = streamIds.map(streamId => this.pingStream(streamId));
    await Promise.allSettled(promises);
  }

  /**
   * Limpa todos os recursos e para o keep-alive
   */
  destroy(): void {
    console.log('🗑️ [GlobalKeepAlive] Destruindo serviço');
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    
    this.activeStreams.clear();
  }

  /**
   * Obtém estatísticas do serviço
   */
  getStats(): {
    totalStreams: number;
    healthyStreams: number;
    unhealthyStreams: number;
    isRunning: boolean;
  } {
    const streams = Array.from(this.activeStreams.values());
    
    return {
      totalStreams: streams.length,
      healthyStreams: streams.filter(s => s.isHealthy).length,
      unhealthyStreams: streams.filter(s => !s.isHealthy).length,
      isRunning: !!this.intervalId
    };
  }
}

// Instância singleton
export const globalKeepAlive = new GlobalKeepAliveService();

// Cleanup automático quando a página é fechada
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    globalKeepAlive.destroy();
  });
}

export default globalKeepAlive;