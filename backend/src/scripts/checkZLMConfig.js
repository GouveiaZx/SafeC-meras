/**
 * Script para verificar e corrigir a configuração do ZLMediaKit
 * Verifica se a gravação automática está habilitada
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { createModuleLogger } from '../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const logger = createModuleLogger('ZLMConfigChecker');

const ZLM_API_URL = process.env.ZLM_API_URL || 'http://localhost:8000/index/api';
const ZLM_SECRET = process.env.ZLM_SECRET || '9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK';

async function checkZLMConfiguration() {
  try {
    logger.info('🔍 VERIFICANDO CONFIGURAÇÃO DO ZLMEDIAKIT...');

    // 1. Verificar configuração atual
    const configResponse = await axios.post(`${ZLM_API_URL}/getServerConfig`, {
      secret: ZLM_SECRET
    }, {
      timeout: 10000
    });

    if (configResponse.data.code === 0) {
      const config = configResponse.data.data[0];
      
      logger.info('📋 CONFIGURAÇÃO ATUAL:', {
        'record.recordMp4': config['record.recordMp4'],
        'record.enableFmp4': config['record.enableFmp4'],
        'record.mp4MaxSecond': config['record.mp4MaxSecond'],
        'hook.enable': config['hook.enable'],
        'hook.on_record_mp4': config['hook.on_record_mp4'],
        'hook.timeoutSec': config['hook.timeoutSec']
      });

      // Verificar se gravação automática está habilitada
      const recordMp4Enabled = config['record.recordMp4'] === 1 || config['record.recordMp4'] === '1';
      const hookEnabled = config['hook.enable'] === 1 || config['hook.enable'] === '1';
      const recordHookEnabled = config['hook.on_record_mp4'];

      logger.info('🎯 STATUS DOS RECURSOS:', {
        'Gravação MP4 automática': recordMp4Enabled ? '✅ HABILITADA' : '❌ DESABILITADA',
        'Hooks habilitados': hookEnabled ? '✅ HABILITADO' : '❌ DESABILITADO', 
        'Hook on_record_mp4': recordHookEnabled ? `✅ CONFIGURADO (${recordHookEnabled})` : '❌ NÃO CONFIGURADO',
        'Intervalo de gravação': config['record.mp4MaxSecond'] ? `${config['record.mp4MaxSecond']}s` : 'NÃO DEFINIDO'
      });

      // 2. Corrigir configuração se necessário
      if (!recordMp4Enabled) {
        logger.warn('⚠️ GRAVAÇÃO AUTOMÁTICA DESABILITADA - Habilitando...');
        
        const updateResponse = await axios.post(`${ZLM_API_URL}/setServerConfig`, {
          secret: ZLM_SECRET,
          'record.recordMp4': 1,
          'record.mp4MaxSecond': 1800, // 30 minutos
          'record.enableFmp4': 0,
          'hook.enable': 1,
          'hook.on_record_mp4': 'http://localhost:3002/api/hook/on_record_mp4',
          'hook.timeoutSec': 10
        }, {
          timeout: 10000
        });

        if (updateResponse.data.code === 0) {
          logger.info('✅ CONFIGURAÇÃO CORRIGIDA COM SUCESSO!');
        } else {
          logger.error('❌ ERRO AO CORRIGIR CONFIGURAÇÃO:', updateResponse.data);
        }
      }

      // 3. Verificar status de streams ativos
      const streamsResponse = await axios.post(`${ZLM_API_URL}/getMediaList`, {
        secret: ZLM_SECRET
      });

      if (streamsResponse.data.code === 0) {
        const streams = streamsResponse.data.data || [];
        logger.info(`📺 STREAMS ATIVOS: ${streams.length}`);
        
        streams.forEach(stream => {
          logger.info(`  - ${stream.app}/${stream.stream}: ${stream.readerCount} espectadores, gravando: ${stream.aliveSecond}s`);
        });
      }

      // 4. Testar conectividade do webhook
      logger.info('🔗 TESTANDO CONECTIVIDADE DO WEBHOOK...');
      try {
        const webhookTest = await axios.post('http://localhost:3002/api/hook/on_record_mp4', {
          test: true,
          message: 'Teste de conectividade do webhook'
        }, {
          timeout: 5000
        });
        
        logger.info('✅ WEBHOOK RESPONDEU:', webhookTest.status);
      } catch (webhookError) {
        logger.error('❌ WEBHOOK NÃO RESPONDEU:', webhookError.message);
      }

    } else {
      logger.error('❌ ERRO AO OBTER CONFIGURAÇÃO:', configResponse.data);
    }

  } catch (error) {
    logger.error('❌ ERRO GERAL:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      logger.error('🚫 ZLMediaKit não está acessível. Verifique se Docker está rodando.');
    }
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  checkZLMConfiguration()
    .then(() => {
      logger.info('✅ Verificação concluída');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ Verificação falhou:', error);
      process.exit(1);
    });
}

export default { checkZLMConfiguration };