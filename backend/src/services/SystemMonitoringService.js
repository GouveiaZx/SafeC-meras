/**
 * Serviço de Monitoramento de Sistema do NewCAM
 * Monitora recursos do sistema e saúde geral
 */

import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../utils/logger.js';
import alertService from './AlertService.js';

const execAsync = promisify(exec);

class SystemMonitoringService {
  constructor() {
    this.isRunning = false;
    this.monitoringInterval = null;
    this.checkInterval = 30 * 1000; // 30 segundos
    this.metrics = {
      cpu: [],
      memory: [],
      disk: [],
      network: [],
      processes: [],
    };
    this.maxMetricsHistory = 100; // Manter últimas 100 medições
  }

  async start() {
    if (this.isRunning) {
      logger.warn('SystemMonitoringService já está em execução');
      return;
    }

    this.isRunning = true;
    logger.info('Iniciando SystemMonitoringService...');

    // Primeira verificação imediata
    await this.performSystemCheck();

    // Configurar verificações periódicas
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performSystemCheck();
      } catch (error) {
        logger.error('Erro durante verificação do sistema:', error);
      }
    }, this.checkInterval);

    logger.info('SystemMonitoringService iniciado com sucesso');
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    logger.info('SystemMonitoringService parado');
  }

  async performSystemCheck() {
    try {
      const timestamp = new Date();
      
      // Coletar métricas do sistema
      const [cpuMetrics, memoryMetrics, diskMetrics, networkMetrics, processMetrics] = await Promise.all([
        this.getCPUMetrics(),
        this.getMemoryMetrics(),
        this.getDiskMetrics(),
        this.getNetworkMetrics(),
        this.getProcessMetrics(),
      ]);

      // Adicionar timestamp às métricas
      const metrics = {
        timestamp,
        cpu: cpuMetrics,
        memory: memoryMetrics,
        disk: diskMetrics,
        network: networkMetrics,
        processes: processMetrics,
      };

      // Armazenar métricas no histórico
      this.addMetricsToHistory(metrics);

      // Verificar alertas
      await this.checkAlerts(metrics);

      // Log das métricas principais
      logger.debug('Métricas do sistema coletadas:', {
        cpu: `${cpuMetrics.usage.toFixed(1)}%`,
        memory: `${memoryMetrics.usage.toFixed(1)}%`,
        disk: `${diskMetrics.usage.toFixed(1)}%`,
        processes: processMetrics.total,
      });

    } catch (error) {
      logger.error('Erro ao realizar verificação do sistema:', error);
    }
  }

  async getCPUMetrics() {
    const cpus = os.cpus();
    const loadAvg = os.loadavg();
    
    // Calcular uso de CPU
    let totalIdle = 0;
    let totalTick = 0;
    
    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });
    
    const usage = 100 - (totalIdle / totalTick * 100);
    
    return {
      cores: cpus.length,
      model: cpus[0]?.model || 'Unknown',
      speed: cpus[0]?.speed || 0,
      usage: Math.max(0, Math.min(100, usage)),
      loadAverage: {
        '1min': loadAvg[0],
        '5min': loadAvg[1],
        '15min': loadAvg[2],
      },
    };
  }

  async getMemoryMetrics() {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const usage = (usedMemory / totalMemory) * 100;

    return {
      total: totalMemory,
      used: usedMemory,
      free: freeMemory,
      usage: Math.max(0, Math.min(100, usage)),
      totalGB: (totalMemory / (1024 ** 3)).toFixed(2),
      usedGB: (usedMemory / (1024 ** 3)).toFixed(2),
      freeGB: (freeMemory / (1024 ** 3)).toFixed(2),
    };
  }

  async getDiskMetrics() {
    try {
      const recordingsPath = path.resolve('./storage/recordings');
      
      // Verificar se o diretório existe
      try {
        await fs.access(recordingsPath);
      } catch {
        // Criar diretório se não existir
        await fs.mkdir(recordingsPath, { recursive: true });
      }

      const stats = await fs.stat(recordingsPath);
      
      // Para Windows, usar comando dir para obter informações de disco
      let diskInfo = { total: 0, free: 0, used: 0, usage: 0 };
      
      try {
        if (process.platform === 'win32') {
          const { stdout } = await execAsync(`dir /-c "${recordingsPath}"`);
          const lines = stdout.split('\n');
          const lastLine = lines[lines.length - 2] || '';
          const match = lastLine.match(/([\d,]+)\s+bytes\s+free/);
          if (match) {
            const freeBytes = parseInt(match[1].replace(/,/g, ''));
            // Estimar total baseado em uso típico (assumir que temos pelo menos 10GB livres)
            const estimatedTotal = freeBytes * 2; // Estimativa conservadora
            diskInfo = {
              total: estimatedTotal,
              free: freeBytes,
              used: estimatedTotal - freeBytes,
              usage: ((estimatedTotal - freeBytes) / estimatedTotal) * 100,
            };
          }
        } else {
          // Para Linux/Mac, usar df
          const { stdout } = await execAsync(`df -B1 "${recordingsPath}"`);
          const lines = stdout.split('\n');
          const dataLine = lines[1];
          if (dataLine) {
            const parts = dataLine.split(/\s+/);
            const total = parseInt(parts[1]);
            const used = parseInt(parts[2]);
            const free = parseInt(parts[3]);
            diskInfo = {
              total,
              used,
              free,
              usage: (used / total) * 100,
            };
          }
        }
      } catch (error) {
        logger.warn('Não foi possível obter informações de disco:', error.message);
      }

      return {
        path: recordingsPath,
        ...diskInfo,
        totalGB: (diskInfo.total / (1024 ** 3)).toFixed(2),
        usedGB: (diskInfo.used / (1024 ** 3)).toFixed(2),
        freeGB: (diskInfo.free / (1024 ** 3)).toFixed(2),
      };
    } catch (error) {
      logger.error('Erro ao obter métricas de disco:', error);
      return {
        path: './storage/recordings',
        total: 0,
        used: 0,
        free: 0,
        usage: 0,
        totalGB: '0.00',
        usedGB: '0.00',
        freeGB: '0.00',
      };
    }
  }

  async getNetworkMetrics() {
    const networkInterfaces = os.networkInterfaces();
    const interfaces = [];
    
    for (const [name, nets] of Object.entries(networkInterfaces)) {
      if (nets) {
        for (const net of nets) {
          if (!net.internal) {
            interfaces.push({
              name,
              family: net.family,
              address: net.address,
              netmask: net.netmask,
              mac: net.mac,
            });
          }
        }
      }
    }
    
    return {
      interfaces,
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
    };
  }

  async getProcessMetrics() {
    try {
      const processes = [];
      
      // Informações do processo atual
      const currentProcess = {
        pid: process.pid,
        name: 'newcam-backend',
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        cpu: process.cpuUsage(),
      };
      
      processes.push(currentProcess);
      
      // Tentar obter informações de outros processos relacionados
      try {
        if (process.platform === 'win32') {
          const { stdout } = await execAsync('tasklist /fo csv | findstr "node\|zlmedia"');
          const lines = stdout.split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            const parts = line.split(',').map(p => p.replace(/"/g, ''));
            if (parts.length >= 5) {
              processes.push({
                name: parts[0],
                pid: parseInt(parts[1]),
                memory: { external: parseInt(parts[4].replace(/[^\d]/g, '')) * 1024 },
              });
            }
          }
        } else {
          const { stdout } = await execAsync('ps aux | grep -E "node|zlmedia" | grep -v grep');
          const lines = stdout.split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            const parts = line.split(/\s+/);
            if (parts.length >= 11) {
              processes.push({
                name: parts[10],
                pid: parseInt(parts[1]),
                cpu: parseFloat(parts[2]),
                memory: { external: parseInt(parts[5]) * 1024 },
              });
            }
          }
        }
      } catch (error) {
        logger.debug('Não foi possível obter lista de processos:', error.message);
      }
      
      return {
        total: processes.length,
        processes,
        mainProcess: currentProcess,
      };
    } catch (error) {
      logger.error('Erro ao obter métricas de processos:', error);
      return {
        total: 1,
        processes: [],
        mainProcess: {
          pid: process.pid,
          name: 'newcam-backend',
          memory: process.memoryUsage(),
          uptime: process.uptime(),
        },
      };
    }
  }

  addMetricsToHistory(metrics) {
    // Adicionar às métricas de CPU
    this.metrics.cpu.push({
      timestamp: metrics.timestamp,
      usage: metrics.cpu.usage,
      loadAverage: metrics.cpu.loadAverage,
    });
    
    // Adicionar às métricas de memória
    this.metrics.memory.push({
      timestamp: metrics.timestamp,
      usage: metrics.memory.usage,
      used: metrics.memory.used,
      free: metrics.memory.free,
    });
    
    // Adicionar às métricas de disco
    this.metrics.disk.push({
      timestamp: metrics.timestamp,
      usage: metrics.disk.usage,
      used: metrics.disk.used,
      free: metrics.disk.free,
    });
    
    // Limitar histórico
    Object.keys(this.metrics).forEach(key => {
      if (this.metrics[key].length > this.maxMetricsHistory) {
        this.metrics[key] = this.metrics[key].slice(-this.maxMetricsHistory);
      }
    });
  }

  async checkAlerts(metrics) {
    // Verificar alertas de recursos do sistema
    alertService.triggerSystemResource({
      diskUsage: metrics.disk.usage,
      memoryUsage: metrics.memory.usage,
      cpuUsage: metrics.cpu.usage,
      timestamp: metrics.timestamp,
    });
  }

  getMetrics() {
    return {
      current: this.getCurrentMetrics(),
      history: this.metrics,
      isRunning: this.isRunning,
      checkInterval: this.checkInterval,
    };
  }

  getCurrentMetrics() {
    const latest = {
      cpu: this.metrics.cpu[this.metrics.cpu.length - 1],
      memory: this.metrics.memory[this.metrics.memory.length - 1],
      disk: this.metrics.disk[this.metrics.disk.length - 1],
    };
    
    return latest;
  }

  async getSystemMetrics() {
    try {
      const cpu = await this.getCPUMetrics();
      const memory = await this.getMemoryMetrics();
      const disk = await this.getDiskMetrics();
      const network = await this.getNetworkMetrics();
      const processes = await this.getProcessMetrics();
      
      return {
        cpu,
        memory,
        disk,
        network,
        processes,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Erro ao obter métricas do sistema:', error);
      throw error;
    }
  }

  getSystemHealth() {
    const current = this.getCurrentMetrics();
    if (!current.cpu || !current.memory || !current.disk) {
      return { status: 'unknown', score: 0 };
    }
    
    let score = 100;
    let issues = [];
    
    // Penalizar por alto uso de CPU
    if (current.cpu.usage > 80) {
      score -= 20;
      issues.push('Alto uso de CPU');
    } else if (current.cpu.usage > 60) {
      score -= 10;
      issues.push('Uso moderado de CPU');
    }
    
    // Penalizar por alto uso de memória
    if (current.memory.usage > 90) {
      score -= 25;
      issues.push('Alto uso de memória');
    } else if (current.memory.usage > 75) {
      score -= 15;
      issues.push('Uso moderado de memória');
    }
    
    // Penalizar por alto uso de disco
    if (current.disk.usage > 85) {
      score -= 20;
      issues.push('Pouco espaço em disco');
    } else if (current.disk.usage > 70) {
      score -= 10;
      issues.push('Uso moderado de disco');
    }
    
    let status = 'excellent';
    if (score < 50) status = 'critical';
    else if (score < 70) status = 'warning';
    else if (score < 85) status = 'good';
    
    return {
      status,
      score: Math.max(0, score),
      issues,
      timestamp: new Date(),
    };
  }
}

// Singleton instance
const systemMonitoringService = new SystemMonitoringService();

export default systemMonitoringService;