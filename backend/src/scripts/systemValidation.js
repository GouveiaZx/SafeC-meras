#!/usr/bin/env node

/**
 * SISTEMA DE VALIDAÇÃO COMPLETA - NewCAM
 * 
 * Este script verifica todos os componentes do sistema de gravação:
 * - ZLMediaKit configuração e conectividade
 * - Hooks funcionando corretamente
 * - RecordingMonitorService ativo
 * - Arquivos sendo gravados corretamente
 * - Database sincronizado com arquivos
 */

import { createModuleLogger } from '../config/logger.js';
import { supabaseAdmin } from '../config/database.js';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createModuleLogger('SystemValidation');

// Configurações
const ZLM_API_URL = process.env.ZLM_API_URL || 'http://localhost:8000/index/api';
const ZLM_SECRET = process.env.ZLM_SECRET || '9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';

class SystemValidator {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      tests: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        warnings: 0
      }
    };
  }

  addTest(name, status, message, details = null) {
    const test = {
      name,
      status, // 'pass', 'fail', 'warning'
      message,
      details,
      timestamp: new Date().toISOString()
    };

    this.results.tests.push(test);
    this.results.summary.total++;
    
    if (status === 'pass') {
      this.results.summary.passed++;
      logger.info(`✅ ${name}: ${message}`);
    } else if (status === 'fail') {
      this.results.summary.failed++;
      logger.error(`❌ ${name}: ${message}`);
    } else if (status === 'warning') {
      this.results.summary.warnings++;
      logger.warn(`⚠️ ${name}: ${message}`);
    }

    if (details) {
      logger.debug(`   Detalhes: ${JSON.stringify(details, null, 2)}`);
    }
  }

  async validateZLMediaKit() {
    logger.info('🔍 Validando ZLMediaKit...');
    
    try {
      const response = await axios.get(`${ZLM_API_URL}/getServerConfig`, {
        params: { secret: ZLM_SECRET },
        timeout: 5000
      });

      if (response.data.code === 0) {
        const config = response.data.data[0];
        
        // Verificar configurações críticas
        const checks = [
          { key: 'general.enable_mp4', expected: '1', actual: config['general.enable_mp4'] },
          { key: 'record.recordMp4', expected: '1', actual: config['record.recordMp4'] },
          { key: 'record.recordApp', expected: 'live', actual: config['record.recordApp'] },
          { key: 'hook.enable', expected: '1', actual: config['hook.enable'] }
        ];

        let configErrors = [];
        for (const check of checks) {
          if (check.actual !== check.expected) {
            configErrors.push(`${check.key}: esperado '${check.expected}', atual '${check.actual}'`);
          }
        }

        if (configErrors.length === 0) {
          this.addTest('ZLMediaKit Config', 'pass', 'Todas as configurações críticas estão corretas', {
            filePath: config['record.filePath'],
            fileSecond: config['record.fileSecond']
          });
        } else {
          this.addTest('ZLMediaKit Config', 'fail', 'Configurações incorretas encontradas', configErrors);
        }

        // Verificar se está gravando
        const mediaResponse = await axios.get(`${ZLM_API_URL}/getMediaList`, {
          params: { secret: ZLM_SECRET },
          timeout: 3000
        });

        if (mediaResponse.data.code === 0) {
          const streams = mediaResponse.data.data || [];
          const liveStreams = streams.filter(s => s.app === 'live');
          const recordingStreams = streams.filter(s => s.isRecordingMP4);

          this.addTest('ZLMediaKit Streams', 'pass', `${liveStreams.length} streams live, ${recordingStreams.length} gravando MP4`, {
            total_streams: streams.length,
            live_streams: liveStreams.length,
            recording_streams: recordingStreams.length
          });

          if (liveStreams.length > 0 && recordingStreams.length === 0) {
            this.addTest('MP4 Recording', 'warning', 'Streams ativas mas nenhuma gravando MP4', {
              live_streams: liveStreams.map(s => s.stream)
            });
          }
        }

      } else {
        this.addTest('ZLMediaKit API', 'fail', `Erro na API: código ${response.data.code}`, response.data);
      }

    } catch (error) {
      this.addTest('ZLMediaKit Connection', 'fail', `Não foi possível conectar: ${error.message}`, {
        url: ZLM_API_URL,
        error: error.code
      });
    }
  }

  async validateHooks() {
    logger.info('🔍 Validando Hooks...');

    try {
      const response = await axios.get(`${BACKEND_URL}/api/hook/status`, {
        timeout: 3000
      });

      if (response.status === 200) {
        const status = response.data;
        this.addTest('Hook Status Endpoint', 'pass', 'Endpoint funcionando', {
          hooks: status.hooks?.length || 0,
          cache_size: status.cache?.processed_recordings || 0
        });

        // Verificar hooks específicos
        const requiredHooks = ['on_stream_changed', 'on_record_mp4', 'on_stream_none_reader'];
        const activeHooks = status.hooks?.map(h => h.name) || [];
        
        for (const hookName of requiredHooks) {
          if (activeHooks.includes(hookName)) {
            this.addTest(`Hook ${hookName}`, 'pass', 'Hook registrado e ativo');
          } else {
            this.addTest(`Hook ${hookName}`, 'fail', 'Hook não encontrado ou inativo');
          }
        }
      }

    } catch (error) {
      this.addTest('Hooks Connection', 'fail', `Não foi possível verificar hooks: ${error.message}`, {
        url: `${BACKEND_URL}/api/hook/status`
      });
    }
  }

  async validateDatabase() {
    logger.info('🔍 Validando Database...');

    try {
      // Verificar conexão com Supabase
      const { data: cameras, error: camerasError } = await supabaseAdmin
        .from('cameras')
        .select('id, name, active, recording_enabled')
        .eq('active', true);

      if (camerasError) {
        this.addTest('Database Connection', 'fail', `Erro ao conectar: ${camerasError.message}`);
        return;
      }

      this.addTest('Database Connection', 'pass', `${cameras.length} câmeras ativas encontradas`);

      // Verificar gravações recentes
      const { data: recentRecordings } = await supabaseAdmin
        .from('recordings')
        .select('id, status, file_path, created_at')
        .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // última hora
        .order('created_at', { ascending: false });

      const orphanRecordings = recentRecordings?.filter(r => !r.file_path) || [];
      
      if (orphanRecordings.length > 0) {
        this.addTest('Orphan Recordings', 'warning', `${orphanRecordings.length} gravações órfãs na última hora`, {
          orphan_count: orphanRecordings.length,
          total_recent: recentRecordings?.length || 0
        });
      } else {
        this.addTest('Orphan Recordings', 'pass', 'Nenhuma gravação órfã encontrada na última hora');
      }

      // Verificar câmeras com gravação habilitada
      const recordingEnabledCount = cameras.filter(c => c.recording_enabled).length;
      if (recordingEnabledCount === 0) {
        this.addTest('Recording Config', 'warning', 'Nenhuma câmera com gravação habilitada');
      } else {
        this.addTest('Recording Config', 'pass', `${recordingEnabledCount} câmeras com gravação habilitada`);
      }

    } catch (error) {
      this.addTest('Database Validation', 'fail', `Erro na validação: ${error.message}`);
    }
  }

  async validateFileSystem() {
    logger.info('🔍 Validando Sistema de Arquivos...');

    const storagePaths = [
      'storage/www/record/live',
      'storage/bin/www/record/live'
    ];

    for (const storagePath of storagePaths) {
      try {
        const fullPath = path.resolve(process.cwd(), storagePath);
        await fs.access(fullPath);
        
        const items = await fs.readdir(fullPath);
        const cameraFolders = [];
        
        for (const item of items) {
          const itemPath = path.join(fullPath, item);
          const stats = await fs.stat(itemPath);
          if (stats.isDirectory()) {
            cameraFolders.push(item);
          }
        }

        this.addTest(`Storage Path ${storagePath}`, 'pass', `${cameraFolders.length} pastas de câmera encontradas`, {
          path: fullPath,
          camera_folders: cameraFolders
        });

        // Verificar arquivos recentes
        let totalFiles = 0;
        let recentFiles = 0;
        const today = new Date().toISOString().split('T')[0];
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

        for (const cameraFolder of cameraFolders.slice(0, 3)) { // Verificar apenas primeiras 3
          try {
            const cameraPath = path.join(fullPath, cameraFolder);
            const dateFolders = await fs.readdir(cameraPath);
            
            for (const dateFolder of dateFolders) {
              if (dateFolder === today || dateFolder >= '2025-08-21') { // Data relevante
                try {
                  const datePath = path.join(cameraPath, dateFolder);
                  const files = await fs.readdir(datePath);
                  const mp4Files = files.filter(f => f.endsWith('.mp4'));
                  totalFiles += mp4Files.length;

                  // Verificar arquivos modificados recentemente
                  for (const file of mp4Files) {
                    const filePath = path.join(datePath, file);
                    const stats = await fs.stat(filePath);
                    if (stats.mtime.getTime() > oneDayAgo) {
                      recentFiles++;
                    }
                  }
                } catch (err) {
                  continue;
                }
              }
            }
          } catch (err) {
            continue;
          }
        }

        if (totalFiles > 0) {
          this.addTest(`Files in ${storagePath}`, 'pass', `${totalFiles} arquivos MP4 encontrados, ${recentFiles} recentes`, {
            total_files: totalFiles,
            recent_files: recentFiles
          });
        } else {
          this.addTest(`Files in ${storagePath}`, 'warning', 'Nenhum arquivo MP4 encontrado');
        }

      } catch (error) {
        this.addTest(`Storage Access ${storagePath}`, 'fail', `Não foi possível acessar: ${error.message}`);
      }
    }
  }

  async validateRecordingMonitor() {
    logger.info('🔍 Validando RecordingMonitorService...');

    try {
      const response = await axios.get(`${BACKEND_URL}/api/recordings/debug`, {
        timeout: 10000
      });

      if (response.status === 200) {
        const debug = response.data;
        
        if (debug.recording_monitor?.isRunning) {
          this.addTest('Recording Monitor', 'pass', 'RecordingMonitorService está ativo', {
            interval: debug.recording_monitor.intervalMs,
            last_run: debug.recording_monitor.lastRun
          });
        } else {
          this.addTest('Recording Monitor', 'fail', 'RecordingMonitorService não está funcionando', debug.recording_monitor);
        }

        // Verificar status geral do debug
        const summary = {
          streams: debug.zlmediakit?.total_streams || 0,
          recording_streams: debug.zlmediakit?.recording_streams || 0,
          recent_recordings: debug.database?.recent_recordings || 0,
          orphan_recordings: debug.database?.orphan_recordings || 0
        };

        this.addTest('System Health', 'pass', 'Debug endpoint funcionando', summary);

      } else {
        this.addTest('Debug Endpoint', 'fail', `Erro HTTP ${response.status}`);
      }

    } catch (error) {
      this.addTest('Recording Monitor Check', 'fail', `Não foi possível verificar: ${error.message}`);
    }
  }

  async runAllValidations() {
    logger.info('🚀 Iniciando validação completa do sistema...');

    await this.validateZLMediaKit();
    await this.validateHooks();
    await this.validateDatabase();
    await this.validateFileSystem();
    await this.validateRecordingMonitor();

    logger.info('\n📊 RESUMO DA VALIDAÇÃO:');
    logger.info(`✅ Testes aprovados: ${this.results.summary.passed}`);
    logger.info(`⚠️ Avisos: ${this.results.summary.warnings}`);
    logger.info(`❌ Testes falharam: ${this.results.summary.failed}`);
    logger.info(`📋 Total de testes: ${this.results.summary.total}`);

    if (this.results.summary.failed === 0) {
      logger.info('\n🎉 SISTEMA VALIDADO COM SUCESSO!');
      return true;
    } else {
      logger.error('\n🚨 SISTEMA TEM PROBLEMAS CRÍTICOS!');
      logger.error('Verifique os testes que falharam acima.');
      return false;
    }
  }

  generateReport() {
    const reportPath = path.join(process.cwd(), 'system-validation-report.json');
    return fs.writeFile(reportPath, JSON.stringify(this.results, null, 2), 'utf8')
      .then(() => {
        logger.info(`📄 Relatório salvo em: ${reportPath}`);
        return reportPath;
      });
  }
}

// Executar validação
async function main() {
  const validator = new SystemValidator();
  
  try {
    const success = await validator.runAllValidations();
    await validator.generateReport();
    
    process.exit(success ? 0 : 1);
  } catch (error) {
    logger.error('💥 Erro fatal na validação:', error);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default SystemValidator;