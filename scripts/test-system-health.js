#!/usr/bin/env node
/**
 * Script de teste e monitoramento do sistema NewCAM
 * Verifica integridade de todos os componentes críticos
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
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

class SystemHealthChecker {
  constructor() {
    this.results = {
      backend: null,
      worker: null,
      zlmediakit: null,
      database: null,
      containers: [],
      streaming: null,
      overall: 'unknown'
    };
    
    this.endpoints = {
      backend: 'http://localhost:3001',
      worker: 'http://localhost:3003', 
      zlmediakit: 'http://localhost:8000'
    };
  }

  log(message, color = 'reset') {
    console.log(`${COLORS[color]}${message}${COLORS.reset}`);
  }

  async measureResponseTime(fn) {
    const start = performance.now();
    const result = await fn();
    const end = performance.now();
    return {
      result,
      responseTime: Math.round(end - start)
    };
  }

  async testEndpoint(name, url, timeout = 5000) {
    try {
      const { result, responseTime } = await this.measureResponseTime(async () => {
        return await axios.get(url, { 
          timeout,
          validateStatus: status => status < 500 // Accept 4xx as valid responses
        });
      });

      return {
        status: 'online',
        statusCode: result.status,
        responseTime,
        data: result.data
      };
    } catch (error) {
      return {
        status: 'offline',
        error: error.code || error.message,
        responseTime: null
      };
    }
  }

  async testBackend() {
    this.log('\n🔧 Testando Backend (porta 3001)...', 'cyan');
    
    const healthTest = await this.testEndpoint('backend-health', `${this.endpoints.backend}/health`);
    
    if (healthTest.status === 'online') {
      this.log(`  ✅ Health endpoint: ${healthTest.responseTime}ms`, 'green');
      this.log(`  📊 Uptime: ${Math.round(healthTest.data.uptime)}s`, 'blue');
      this.log(`  🏷️  Environment: ${healthTest.data.environment}`, 'blue');
      
      // Test API routes
      const apiTests = await Promise.allSettled([
        this.testEndpoint('auth', `${this.endpoints.backend}/api/auth/health`),
        this.testEndpoint('cameras', `${this.endpoints.backend}/api/cameras`),
        this.testEndpoint('streams', `${this.endpoints.backend}/api/streams`)
      ]);

      let apiHealthy = 0;
      apiTests.forEach((test, index) => {
        const endpoints = ['auth', 'cameras', 'streams'];
        if (test.status === 'fulfilled' && test.value.status === 'online') {
          this.log(`  ✅ API ${endpoints[index]}: ${test.value.responseTime}ms`, 'green');
          apiHealthy++;
        } else if (test.status === 'fulfilled' && test.value.statusCode === 401) {
          this.log(`  🔐 API ${endpoints[index]}: Auth required (${test.value.responseTime}ms)`, 'yellow');
          apiHealthy++;
        } else {
          this.log(`  ❌ API ${endpoints[index]}: ${test.value?.error || 'Failed'}`, 'red');
        }
      });

      this.results.backend = {
        status: 'online',
        health: healthTest,
        apis: apiHealthy,
        totalApis: 3
      };
    } else {
      this.log(`  ❌ Backend offline: ${healthTest.error}`, 'red');
      this.results.backend = { status: 'offline', error: healthTest.error };
    }
  }

  async testWorker() {
    this.log('\n🔨 Testando Worker (porta 3003)...', 'cyan');
    
    const healthTest = await this.testEndpoint('worker-health', `${this.endpoints.worker}/health`);
    
    if (healthTest.status === 'online') {
      this.log(`  ✅ Health endpoint: ${healthTest.responseTime}ms`, 'green');
      this.log(`  📊 Uptime: ${Math.round(healthTest.data.uptime)}s`, 'blue');
      this.log(`  🔗 Backend connected: ${healthTest.data.connected_to_backend ? 'Yes' : 'No'}`, 
        healthTest.data.connected_to_backend ? 'green' : 'yellow');
      this.log(`  📹 Cameras monitored: ${healthTest.data.cameras_monitored}`, 'blue');

      // Test cameras status
      const camerasTest = await this.testEndpoint('worker-cameras', `${this.endpoints.worker}/cameras/status`);
      if (camerasTest.status === 'online') {
        this.log(`  ✅ Cameras status: ${camerasTest.responseTime}ms`, 'green');
        const onlineCameras = camerasTest.data.cameras?.filter(c => c.status === 'online').length || 0;
        this.log(`  📷 Online cameras: ${onlineCameras}/${camerasTest.data.total}`, 'blue');
      }

      this.results.worker = {
        status: 'online', 
        health: healthTest,
        cameras: camerasTest.data
      };
    } else {
      this.log(`  ❌ Worker offline: ${healthTest.error}`, 'red');
      this.results.worker = { status: 'offline', error: healthTest.error };
    }
  }

  async testZLMediaKit() {
    this.log('\n🎥 Testando ZLMediaKit (porta 8000)...', 'cyan');
    
    const healthTest = await this.testEndpoint('zlm-health', `${this.endpoints.zlmediakit}/index/api/getServerConfig`);
    
    if (healthTest.status === 'online') {
      this.log(`  ✅ ZLMediaKit online: ${healthTest.responseTime}ms`, 'green');
      
      // Test API with secret
      try {
        const { result, responseTime } = await this.measureResponseTime(async () => {
          return await axios.post(`${this.endpoints.zlmediakit}/index/api/getMediaList`, {
            secret: '9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK'
          }, { timeout: 5000 });
        });

        if (result.data.code === 0) {
          this.log(`  ✅ ZLM API authenticated: ${responseTime}ms`, 'green');
          const mediaCount = result.data.data?.length || 0;
          this.log(`  📺 Active streams: ${mediaCount}`, 'blue');
        }

        this.results.zlmediakit = {
          status: 'online',
          health: healthTest,
          authenticated: true,
          activeStreams: result.data.data?.length || 0
        };
      } catch (error) {
        this.log(`  ⚠️  ZLM API auth failed: ${error.message}`, 'yellow');
        this.results.zlmediakit = {
          status: 'online',
          health: healthTest,
          authenticated: false
        };
      }
    } else {
      this.log(`  ❌ ZLMediaKit offline: ${healthTest.error}`, 'red');
      this.results.zlmediakit = { status: 'offline', error: healthTest.error };
    }
  }

  async testContainers() {
    this.log('\n🐳 Testando Containers Docker...', 'cyan');
    
    try {
      const { spawn } = await import('child_process');
      const { promisify } = await import('util');
      const exec = promisify(spawn);

      // Test if docker is available
      try {
        const dockerCmd = spawn('docker', ['ps', '--format', 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';
        dockerCmd.stdout.on('data', (data) => {
          output += data.toString();
        });

        await new Promise((resolve, reject) => {
          dockerCmd.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Docker command failed with code ${code}`));
          });
        });

        const lines = output.split('\n').filter(line => line.trim());
        const containers = lines.slice(1).map(line => {
          const parts = line.split('\t');
          return {
            name: parts[0]?.trim(),
            status: parts[1]?.trim(),
            ports: parts[2]?.trim()
          };
        }).filter(c => c.name);

        const requiredContainers = [
          'newcam-zlmediakit',
          'newcam-postgres', 
          'newcam-redis',
          'newcam-nginx'
        ];

        requiredContainers.forEach(required => {
          const container = containers.find(c => c.name === required);
          if (container) {
            const isUp = container.status.includes('Up');
            this.log(`  ${isUp ? '✅' : '❌'} ${required}: ${container.status}`, isUp ? 'green' : 'red');
          } else {
            this.log(`  ❌ ${required}: Not found`, 'red');
          }
        });

        this.results.containers = containers;
      } catch (dockerError) {
        this.log(`  ⚠️  Docker não disponível: ${dockerError.message}`, 'yellow');
      }
    } catch (error) {
      this.log(`  ❌ Erro ao verificar containers: ${error.message}`, 'red');
    }
  }

  async testStreaming() {
    this.log('\n📡 Testando Sistema de Streaming...', 'cyan');
    
    // Test if we have any active cameras from worker
    if (this.results.worker?.cameras?.cameras) {
      const streamingCameras = this.results.worker.cameras.cameras.filter(c => c.is_streaming);
      
      if (streamingCameras.length > 0) {
        this.log(`  📹 Câmeras transmitindo: ${streamingCameras.length}`, 'green');
        
        for (const camera of streamingCameras) {
          this.log(`    🎥 ${camera.name}: ${camera.status}`, 'blue');
          
          // Test HLS proxy endpoint (expect 401 without auth)
          const hlsTest = await this.testEndpoint(
            'hls-proxy',
            `${this.endpoints.backend}/api/streams/${camera.id}/hls`
          );
          
          if (hlsTest.statusCode === 401) {
            this.log(`    ✅ HLS proxy responding (auth required)`, 'green');
          } else if (hlsTest.statusCode === 200) {
            this.log(`    ✅ HLS proxy accessible`, 'green');
          } else {
            this.log(`    ⚠️  HLS proxy: ${hlsTest.error || hlsTest.statusCode}`, 'yellow');
          }
        }
        
        this.results.streaming = {
          status: 'active',
          cameras: streamingCameras.length,
          total: this.results.worker.cameras.total
        };
      } else {
        this.log(`  ⚠️  Nenhuma câmera transmitindo`, 'yellow');
        this.results.streaming = {
          status: 'idle',
          cameras: 0,
          total: this.results.worker?.cameras?.total || 0
        };
      }
    } else {
      this.log(`  ❌ Não foi possível verificar status das câmeras`, 'red');
      this.results.streaming = { status: 'unknown' };
    }
  }

  calculateOverallHealth() {
    const criticalServices = [
      this.results.backend?.status,
      this.results.worker?.status,
      this.results.zlmediakit?.status
    ];

    const onlineServices = criticalServices.filter(status => status === 'online').length;
    const totalServices = criticalServices.length;

    if (onlineServices === totalServices) {
      this.results.overall = 'healthy';
    } else if (onlineServices >= Math.ceil(totalServices * 0.6)) {
      this.results.overall = 'degraded';
    } else {
      this.results.overall = 'critical';
    }
  }

  printSummary() {
    this.log('\n' + '='.repeat(60), 'bright');
    this.log('📊 RESUMO DO SISTEMA NEWCAM', 'bright');
    this.log('='.repeat(60), 'bright');

    const statusColor = {
      'healthy': 'green',
      'degraded': 'yellow', 
      'critical': 'red',
      'unknown': 'magenta'
    };

    this.log(`\n🏥 Status Geral: ${this.results.overall.toUpperCase()}`, statusColor[this.results.overall]);

    this.log('\n📋 Componentes:', 'bright');
    this.log(`  🔧 Backend: ${this.results.backend?.status || 'unknown'}`, 
      this.results.backend?.status === 'online' ? 'green' : 'red');
    this.log(`  🔨 Worker: ${this.results.worker?.status || 'unknown'}`,
      this.results.worker?.status === 'online' ? 'green' : 'red');
    this.log(`  🎥 ZLMediaKit: ${this.results.zlmediakit?.status || 'unknown'}`,
      this.results.zlmediakit?.status === 'online' ? 'green' : 'red');

    if (this.results.streaming) {
      this.log(`\n📡 Streaming: ${this.results.streaming.cameras}/${this.results.streaming.total} câmeras ativas`,
        this.results.streaming.cameras > 0 ? 'green' : 'yellow');
    }

    const timestamp = new Date().toISOString();
    this.log(`\n⏰ Verificação realizada em: ${timestamp}`, 'blue');
  }

  async runFullHealthCheck() {
    this.log('🚀 Iniciando verificação completa do sistema NewCAM...', 'bright');
    
    await this.testBackend();
    await this.testWorker(); 
    await this.testZLMediaKit();
    await this.testContainers();
    await this.testStreaming();
    
    this.calculateOverallHealth();
    this.printSummary();

    // Exit with appropriate code
    const exitCode = this.results.overall === 'critical' ? 1 : 0;
    process.exit(exitCode);
  }
}

// Run health check
const checker = new SystemHealthChecker();
checker.runFullHealthCheck().catch(error => {
  console.error('❌ Erro durante verificação:', error);
  process.exit(1);
});