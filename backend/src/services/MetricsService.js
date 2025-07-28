/**
 * Serviço de Métricas do Sistema NewCAM
 * Coleta e fornece métricas em tempo real do sistema
 */

import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabaseAdmin } from '../config/database.js';
import { logger } from '../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MetricsService {
  constructor() {
    this.metrics = {
      system: {
        cpu: 0,
        memory: {
          used: 0,
          total: 0,
          percentage: 0
        },
        disk: {
          used: 0,
          total: 0,
          percentage: 0
        },
        uptime: 0
      },
      cameras: {
        total: 0,
        online: 0,
        offline: 0,
        streaming: 0,
        recording: 0
      },
      recordings: {
        total: 0,
        today: 0,
        totalSize: 0,
        avgDuration: 0
      },
      storage: {
        local: {
          used: 0,
          total: 0,
          percentage: 0
        },
        s3: {
          used: 0,
          files: 0
        }
      },
      network: {
        bandwidth: {
          upload: 0,
          download: 0
        },
        connections: 0
      }
    };
    
    this.lastNetworkStats = null;
    this.updateInterval = null;
    this.isCollecting = false;
  }

  /**
   * Inicia a coleta de métricas
   */
  async startCollection(intervalMs = 5000) {
    if (this.isCollecting) {
      logger.warn('Coleta de métricas já está ativa');
      return;
    }

    this.isCollecting = true;
    logger.info('Iniciando coleta de métricas do sistema');

    // Coleta inicial
    await this.collectMetrics();

    // Configura coleta periódica
    this.updateInterval = setInterval(async () => {
      try {
        await this.collectMetrics();
      } catch (error) {
        logger.error('Erro na coleta de métricas:', error);
      }
    }, intervalMs);
  }

  /**
   * Para a coleta de métricas
   */
  stopCollection() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.isCollecting = false;
    logger.info('Coleta de métricas parada');
  }

  /**
   * Coleta todas as métricas do sistema
   */
  async collectMetrics() {
    try {
      await Promise.all([
        this.collectSystemMetrics(),
        this.collectCameraMetrics(),
        this.collectRecordingMetrics(),
        this.collectStorageMetrics(),
        this.collectNetworkMetrics()
      ]);

      // Salvar métricas no histórico a cada coleta
      await this.saveMetricsToHistory();

      logger.debug('Métricas coletadas e salvas com sucesso');
    } catch (error) {
      logger.error('Erro ao coletar métricas:', error);
      throw error;
    }
  }

  /**
   * Coleta métricas do sistema (CPU, RAM, etc.)
   */
  async collectSystemMetrics() {
    try {
      // CPU Usage
      const cpus = os.cpus();
      let totalIdle = 0;
      let totalTick = 0;

      cpus.forEach(cpu => {
        for (const type in cpu.times) {
          totalTick += cpu.times[type];
        }
        totalIdle += cpu.times.idle;
      });

      const idle = totalIdle / cpus.length;
      const total = totalTick / cpus.length;
      const usage = 100 - ~~(100 * idle / total);

      this.metrics.system.cpu = usage;

      // Memory Usage
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;

      this.metrics.system.memory = {
        used: usedMem,
        total: totalMem,
        percentage: Math.round((usedMem / totalMem) * 100)
      };

      // System Uptime
      this.metrics.system.uptime = os.uptime();

      // Disk Usage (aproximado)
      try {
        const stats = await fs.stat(process.cwd());
        // Nota: Para disk usage real, seria necessário usar uma biblioteca específica
        // Por enquanto, vamos usar valores estimados
        this.metrics.system.disk = {
          used: 0,
          total: 0,
          percentage: 0
        };
      } catch (error) {
        logger.warn('Não foi possível obter estatísticas de disco:', error.message);
      }

    } catch (error) {
      logger.error('Erro ao coletar métricas do sistema:', error);
    }
  }

  /**
   * Coleta métricas das câmeras
   */
  async collectCameraMetrics() {
    try {
      // Verificar se Supabase está configurado
      if (!process.env.SUPABASE_URL || process.env.SUPABASE_URL === 'https://your-project.supabase.co') {
        logger.info('Supabase não configurado');
        this.metrics.cameras = {
          total: 0,
          online: 0,
          offline: 0,
          streaming: 0,
          recording: 0
        };
        return;
      }
      
      const { data: cameras, error } = await supabaseAdmin
        .from('cameras')
        .select('id, status, recording_enabled, active');

      if (error) {
        // Se a tabela não existir, usar valores padrão
        if (error.code === 'PGRST106' || error.message.includes('relation "cameras" does not exist')) {
          logger.warn('Tabela cameras não encontrada');
          this.metrics.cameras = {
            total: 0,
            online: 0,
            offline: 0,
            streaming: 0,
            recording: 0
          };
          return;
        }
        throw error;
      }

      const activeCameras = cameras?.filter(c => c.active === true) || [];
      const total = activeCameras.length;
      const online = activeCameras.filter(c => c.status === 'online').length;
      const offline = activeCameras.filter(c => c.status === 'offline').length;
      const error_count = activeCameras.filter(c => c.status === 'error').length;
      const maintenance = activeCameras.filter(c => c.status === 'maintenance').length;
      const streaming = online; // Assumir que câmeras online estão fazendo streaming
      const recording = activeCameras.filter(c => c.recording_enabled && c.status === 'online').length;

      this.metrics.cameras = {
        total,
        online,
        offline: offline + error_count + maintenance,
        streaming,
        recording
      };

    } catch (error) {
      logger.error('Erro ao coletar métricas das câmeras:', error.message);
      this.metrics.cameras = {
        total: 0,
        online: 0,
        offline: 0,
        streaming: 0,
        recording: 0
      };
    }
  }

  // Método removido - usar dados reais das câmeras

  /**
   * Coleta métricas das gravações
   */
  async collectRecordingMetrics() {
    try {
      // Verificar se Supabase está configurado
      if (!process.env.SUPABASE_URL || process.env.SUPABASE_URL === 'https://your-project.supabase.co') {
        logger.info('Supabase não configurado');
        this.metrics.recordings = {
          total: 0,
          today: 0,
          totalSize: 0,
          avgDuration: 0
        };
        return;
      }
      
      // Total de gravações
      const { count: totalRecordings, error: totalError } = await supabaseAdmin
        .from('recordings')
        .select('*', { count: 'exact', head: true });

      if (totalError) {
        // Se a tabela não existir, usar valores padrão
        if (totalError.code === 'PGRST106' || totalError.message.includes('relation "recordings" does not exist')) {
          logger.warn('Tabela recordings não encontrada');
          this.metrics.recordings = {
            total: 0,
            today: 0,
            totalSize: 0,
            avgDuration: 0
          };
          return;
        }
        throw totalError;
      }

      // Gravações de hoje
      const today = new Date().toISOString().split('T')[0];
      const { count: todayRecordings, error: todayError } = await supabaseAdmin
        .from('recordings')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', `${today}T00:00:00.000Z`)
        .lt('created_at', `${today}T23:59:59.999Z`);

      if (todayError) {
        throw todayError;
      }

      // Tamanho total e duração média
      const { data: recordingStats, error: statsError } = await supabaseAdmin
        .from('recordings')
        .select('file_size, duration')
        .not('file_size', 'is', null)
        .not('duration', 'is', null);

      if (statsError) {
        throw statsError;
      }

      const totalSize = recordingStats?.reduce((sum, r) => sum + (r.file_size || 0), 0) || 0;
      const avgDuration = recordingStats?.length > 0 
        ? recordingStats.reduce((sum, r) => sum + (r.duration || 0), 0) / recordingStats.length 
        : 0;

      this.metrics.recordings = {
        total: totalRecordings || 0,
        today: todayRecordings || 0,
        totalSize,
        avgDuration: Math.round(avgDuration)
      };

    } catch (error) {
      logger.error('Erro ao coletar métricas das gravações:', error);
      this.metrics.recordings = {
        total: 0,
        today: 0,
        totalSize: 0,
        avgDuration: 0
      };
    }
  }

  // Método removido - usar dados reais das gravações

  /**
   * Coleta métricas de armazenamento
   */
  async collectStorageMetrics() {
    try {
      // Storage local (aproximado)
      const recordingsPath = path.join(process.cwd(), '..', 'storage', 'recordings');
      
      try {
        const files = await fs.readdir(recordingsPath, { recursive: true });
        let totalSize = 0;
        
        for (const file of files) {
          try {
            const filePath = path.join(recordingsPath, file);
            const stats = await fs.stat(filePath);
            if (stats.isFile()) {
              totalSize += stats.size;
            }
          } catch (error) {
            // Ignora erros de arquivos individuais
          }
        }

        this.metrics.storage.local = {
          used: totalSize,
          total: 0, // Seria necessário uma biblioteca específica para obter o total
          percentage: 0
        };
      } catch (error) {
        logger.warn('Não foi possível acessar diretório de gravações:', error.message);
      }

      // Storage S3 (seria necessário fazer chamadas para a API do Wasabi)
      // Por enquanto, mantemos valores zerados
      this.metrics.storage.s3 = {
        used: 0,
        files: 0
      };

    } catch (error) {
      logger.error('Erro ao coletar métricas de armazenamento:', error);
    }
  }

  /**
   * Coleta métricas de rede
   */
  async collectNetworkMetrics() {
    try {
      const networkInterfaces = os.networkInterfaces();
      let totalConnections = 0;

      // Conta interfaces de rede ativas
      Object.values(networkInterfaces).forEach(interfaces => {
        if (interfaces) {
          totalConnections += interfaces.filter(iface => !iface.internal).length;
        }
      });

      this.metrics.network = {
        bandwidth: {
          upload: 0, // Seria necessário monitoramento específico
          download: 0
        },
        connections: totalConnections
      };

    } catch (error) {
      logger.error('Erro ao coletar métricas de rede:', error);
    }
  }

  /**
   * Retorna as métricas atuais
   */
  getMetrics() {
    return {
      ...this.metrics,
      timestamp: new Date().toISOString(),
      isCollecting: this.isCollecting
    };
  }

  /**
   * Retorna métricas específicas por categoria
   */
  getMetricsByCategory(category) {
    if (!this.metrics[category]) {
      throw new Error(`Categoria de métrica '${category}' não encontrada`);
    }
    
    return {
      [category]: this.metrics[category],
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Retorna histórico de métricas
   */
  async getMetricsHistory(timeRange = '1h') {
    try {
      const { supabaseAdmin } = await import('../config/database.js');
      
      // Calcular período baseado no timeRange
      const now = new Date();
      let startTime;
      
      switch (timeRange) {
        case '1h':
          startTime = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case '6h':
          startTime = new Date(now.getTime() - 6 * 60 * 60 * 1000);
          break;
        case '24h':
          startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        default:
          startTime = new Date(now.getTime() - 60 * 60 * 1000);
      }
      
      // Buscar histórico de métricas
      const { data: metricsHistory, error } = await supabaseAdmin
        .from('system_metrics')
        .select('*')
        .gte('timestamp', startTime.toISOString())
        .order('timestamp', { ascending: true });
      
      if (error) {
        logger.warn(`Erro ao buscar histórico de métricas:`, error);
        return {
          current: this.getMetrics(),
          history: [],
          timeRange,
          error: error.message
        };
      }
      
      return {
        current: this.getMetrics(),
        history: metricsHistory || [],
        timeRange,
        count: metricsHistory?.length || 0
      };
      
    } catch (error) {
      logger.error(`Erro ao obter histórico de métricas:`, error);
      return {
        current: this.getMetrics(),
        history: [],
        timeRange,
        error: error.message
      };
    }
  }
  
  /**
   * Salva métricas atuais no histórico
   */
  async saveMetricsToHistory() {
    try {
      const { supabaseAdmin } = await import('../config/database.js');
      
      // Preparar dados das métricas do sistema para salvar
      const systemMetrics = this.metrics.system || {};
      const networkMetrics = this.metrics.network || {};
      
      const metricsData = {
        timestamp: new Date().toISOString(),
        cpu_usage: parseFloat((systemMetrics.cpu || 0).toFixed(2)),
        memory_usage: parseFloat((systemMetrics.memory?.percentage || 0).toFixed(2)),
        memory_total: parseInt(systemMetrics.memory?.total || 0),
        memory_used: parseInt(systemMetrics.memory?.used || 0),
        disk_usage: parseFloat((systemMetrics.disk?.percentage || 0).toFixed(2)),
        disk_total: parseInt(systemMetrics.disk?.total || 0),
        disk_used: parseInt(systemMetrics.disk?.used || 0),
        network_rx: parseInt(networkMetrics.bandwidth?.download || 0),
        network_tx: parseInt(networkMetrics.bandwidth?.upload || 0),
        load_average: parseFloat((systemMetrics.loadAverage || 0).toFixed(2)),
        uptime: parseInt(systemMetrics.uptime || 0),
        processes: parseInt(systemMetrics.processes || 0),
        connections: parseInt(networkMetrics.connections || 0),
        metadata: {
          cameras: this.metrics.cameras || {},
          storage: this.metrics.storage || {},
          database: this.metrics.database || {}
        }
      };
      
      // Salvar no banco
      const { error } = await supabaseAdmin
        .from('system_metrics')
        .insert([metricsData]);
      
      if (error) {
        logger.warn('Erro ao salvar métricas no histórico:', error);
      } else {
        logger.debug('Métricas salvas no histórico com sucesso');
      }
      
    } catch (error) {
      logger.error('Erro ao salvar métricas no histórico:', error);
    }
  }

  /**
   * Verifica se alguma métrica está em estado crítico
   */
  getAlerts() {
    const alerts = [];

    // CPU alto
    if (this.metrics.system.cpu > 80) {
      alerts.push({
        type: 'warning',
        category: 'system',
        metric: 'cpu',
        value: this.metrics.system.cpu,
        threshold: 80,
        message: `Uso de CPU alto: ${this.metrics.system.cpu}%`
      });
    }

    // Memória alta
    if (this.metrics.system.memory.percentage > 85) {
      alerts.push({
        type: 'warning',
        category: 'system',
        metric: 'memory',
        value: this.metrics.system.memory.percentage,
        threshold: 85,
        message: `Uso de memória alto: ${this.metrics.system.memory.percentage}%`
      });
    }

    // Câmeras offline
    if (this.metrics.cameras.offline > 0) {
      alerts.push({
        type: 'info',
        category: 'cameras',
        metric: 'offline',
        value: this.metrics.cameras.offline,
        threshold: 0,
        message: `${this.metrics.cameras.offline} câmera(s) offline`
      });
    }

    return alerts;
  }
}

export default new MetricsService();