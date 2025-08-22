#!/usr/bin/env node
/**
 * Monitor contínuo do sistema NewCAM
 * Executa verificações periódicas e alerta sobre problemas
 */

import axios from 'axios';
import { performance } from 'perf_hooks';

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m', 
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

class ContinuousMonitor {
  constructor() {
    this.checkInterval = 30000; // 30 segundos
    this.alerts = [];
    this.lastStatus = {};
    
    this.endpoints = {
      backend: 'http://localhost:3001/health',
      worker: 'http://localhost:3003/health',
      zlmediakit: 'http://localhost:8000'
    };
  }

  log(message, color = 'reset') {
    const timestamp = new Date().toISOString().substring(11, 19);
    console.log(`${COLORS[color]}[${timestamp}] ${message}${COLORS.reset}`);
  }

  async quickHealthCheck() {
    const results = {};
    
    // Backend
    try {
      const response = await axios.get(this.endpoints.backend, { timeout: 5000 });
      results.backend = {
        status: 'online',
        uptime: response.data.uptime,
        responseTime: performance.now()
      };
    } catch (error) {
      results.backend = { status: 'offline', error: error.code };
    }

    // Worker
    try {
      const response = await axios.get(this.endpoints.worker, { timeout: 5000 });
      results.worker = {
        status: 'online',
        uptime: response.data.uptime,
        connected: response.data.connected_to_backend,
        cameras: response.data.cameras_monitored
      };
    } catch (error) {
      results.worker = { status: 'offline', error: error.code };
    }

    // ZLMediaKit
    try {
      const response = await axios.get(this.endpoints.zlmediakit, { timeout: 5000 });
      results.zlmediakit = { status: 'online' };
    } catch (error) {
      results.zlmediakit = { status: 'offline', error: error.code };
    }

    return results;
  }

  detectChanges(current, previous) {
    const changes = [];
    
    Object.keys(current).forEach(service => {
      const currentStatus = current[service]?.status;
      const previousStatus = previous[service]?.status;
      
      if (currentStatus !== previousStatus) {
        changes.push({
          service,
          from: previousStatus || 'unknown',
          to: currentStatus,
          timestamp: new Date().toISOString()
        });
      }
    });

    return changes;
  }

  logStatus(results) {
    const symbols = {
      online: '🟢',
      offline: '🔴',
      unknown: '⚪'
    };

    let summary = '';
    Object.keys(results).forEach(service => {
      const status = results[service]?.status || 'unknown';
      summary += `${symbols[status]} ${service.toUpperCase()} `;
    });

    this.log(`Status: ${summary}`, 'cyan');

    // Log additional details if available
    if (results.worker?.status === 'online') {
      this.log(`  📹 Worker: ${results.worker.cameras} cameras, connected: ${results.worker.connected}`, 'blue');
    }
    
    if (results.backend?.status === 'online') {
      this.log(`  ⏱️  Backend uptime: ${Math.round(results.backend.uptime)}s`, 'blue');
    }
  }

  logChanges(changes) {
    changes.forEach(change => {
      const color = change.to === 'online' ? 'green' : 'red';
      const emoji = change.to === 'online' ? '✅' : '❌';
      this.log(`${emoji} ${change.service.toUpperCase()}: ${change.from} → ${change.to}`, color);
    });
  }

  async runCheck() {
    try {
      const results = await this.quickHealthCheck();
      
      // Detect changes
      const changes = this.detectChanges(results, this.lastStatus);
      
      if (changes.length > 0) {
        this.log('🔄 Mudanças detectadas:', 'yellow');
        this.logChanges(changes);
      }
      
      this.logStatus(results);
      this.lastStatus = results;
      
      // Check for critical issues
      const criticalIssues = Object.keys(results).filter(service => 
        results[service]?.status === 'offline'
      );
      
      if (criticalIssues.length > 0) {
        this.log(`⚠️  Serviços críticos offline: ${criticalIssues.join(', ')}`, 'red');
      }
      
    } catch (error) {
      this.log(`❌ Erro durante verificação: ${error.message}`, 'red');
    }
  }

  start() {
    this.log('🚀 Iniciando monitor contínuo do NewCAM...', 'bright');
    this.log(`📊 Verificações a cada ${this.checkInterval / 1000} segundos`, 'blue');
    
    // Initial check
    this.runCheck();
    
    // Set up interval
    setInterval(() => {
      this.runCheck();
    }, this.checkInterval);

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      this.log('🛑 Monitor interrompido pelo usuário', 'yellow');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      this.log('🛑 Monitor terminado', 'yellow');
      process.exit(0);
    });
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const intervalArg = args.find(arg => arg.startsWith('--interval='));

const monitor = new ContinuousMonitor();

if (intervalArg) {
  const interval = parseInt(intervalArg.split('=')[1]) * 1000;
  if (interval > 0) {
    monitor.checkInterval = interval;
  }
}

monitor.start();