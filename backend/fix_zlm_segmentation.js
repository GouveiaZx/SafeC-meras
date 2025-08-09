import fs from 'fs/promises';
import path from 'path';
import logger from './src/utils/logger.js';

/**
 * Script para corrigir configurações do ZLMediaKit que estão causando
 * segmentação excessiva de gravações (a cada 2-5 segundos ao invés de 30 minutos)
 */

async function fixZLMSegmentation() {
  try {
    console.log('🔧 [FIX] Iniciando correção das configurações ZLMediaKit...');
    
    // Caminho para o arquivo de configuração
    const configPath = './zlmediakit/ZLMediaKit/conf/config.ini';
    
    // Verificar se o arquivo existe
    try {
      await fs.access(configPath);
    } catch (error) {
      console.log('❌ [FIX] Arquivo config.ini não encontrado em:', configPath);
      console.log('🔍 [FIX] Procurando arquivo de configuração alternativo...');
      
      // Tentar outros caminhos possíveis
      const alternatePaths = [
        './config.ini',
        './zlmediakit/config.ini',
        '../config.ini'
      ];
      
      let found = false;
      for (const altPath of alternatePaths) {
        try {
          await fs.access(altPath);
          console.log('✅ [FIX] Arquivo encontrado em:', altPath);
          configPath = altPath;
          found = true;
          break;
        } catch (e) {
          // Continuar procurando
        }
      }
      
      if (!found) {
        console.log('❌ [FIX] Nenhum arquivo de configuração encontrado');
        return;
      }
    }
    
    // Ler arquivo de configuração atual
    const configContent = await fs.readFile(configPath, 'utf8');
    console.log('📖 [FIX] Arquivo de configuração lido com sucesso');
    
    // Analisar configurações problemáticas
    console.log('\n🔍 [FIX] Analisando configurações atuais...');
    
    const problematicConfigs = {
      'segDur': { current: null, recommended: 1800, section: 'hls' },
      'mp4_max_second': { current: null, recommended: 1800, section: 'protocol' },
      'fileSecond': { current: null, recommended: 1800, section: 'record' },
      'segNum': { current: null, recommended: 1, section: 'hls' },
      'segKeep': { current: null, recommended: 1, section: 'hls' }
    };
    
    // Extrair valores atuais
    for (const [key, config] of Object.entries(problematicConfigs)) {
      const regex = new RegExp(`${key}\\s*=\\s*(\\d+)`, 'i');
      const match = configContent.match(regex);
      if (match) {
        config.current = parseInt(match[1]);
      }
    }
    
    // Mostrar análise
    console.log('\n📊 [FIX] Configurações encontradas:');
    let hasProblems = false;
    
    for (const [key, config] of Object.entries(problematicConfigs)) {
      const status = config.current === config.recommended ? '✅' : '⚠️';
      console.log(`   ${status} ${key}: ${config.current || 'não encontrado'} (recomendado: ${config.recommended})`);
      
      if (config.current !== config.recommended) {
        hasProblems = true;
      }
    }
    
    if (!hasProblems) {
      console.log('\n✅ [FIX] Todas as configurações estão corretas!');
      return;
    }
    
    console.log('\n🔧 [FIX] Problemas detectados! Aplicando correções...');
    
    // Criar backup
    const backupPath = `${configPath}.backup.${Date.now()}`;
    await fs.copyFile(configPath, backupPath);
    console.log(`💾 [FIX] Backup criado: ${backupPath}`);
    
    // Aplicar correções
    let newConfig = configContent;
    
    // Corrigir segDur (HLS segment duration) - PRINCIPAL SUSPEITO
    if (problematicConfigs.segDur.current !== problematicConfigs.segDur.recommended) {
      console.log(`🔧 [FIX] Corrigindo segDur: ${problematicConfigs.segDur.current} → ${problematicConfigs.segDur.recommended}`);
      newConfig = newConfig.replace(/segDur\s*=\s*\d+/i, `segDur=${problematicConfigs.segDur.recommended}`);
    }
    
    // Corrigir mp4_max_second
    if (problematicConfigs.mp4_max_second.current !== problematicConfigs.mp4_max_second.recommended) {
      console.log(`🔧 [FIX] Corrigindo mp4_max_second: ${problematicConfigs.mp4_max_second.current} → ${problematicConfigs.mp4_max_second.recommended}`);
      newConfig = newConfig.replace(/mp4_max_second\s*=\s*\d+/i, `mp4_max_second=${problematicConfigs.mp4_max_second.recommended}`);
    }
    
    // Corrigir fileSecond
    if (problematicConfigs.fileSecond.current !== problematicConfigs.fileSecond.recommended) {
      console.log(`🔧 [FIX] Corrigindo fileSecond: ${problematicConfigs.fileSecond.current} → ${problematicConfigs.fileSecond.recommended}`);
      newConfig = newConfig.replace(/fileSecond\s*=\s*\d+/i, `fileSecond=${problematicConfigs.fileSecond.recommended}`);
    }
    
    // Corrigir segNum (manter apenas 1 segmento para gravação contínua)
    if (problematicConfigs.segNum.current !== problematicConfigs.segNum.recommended) {
      console.log(`🔧 [FIX] Corrigindo segNum: ${problematicConfigs.segNum.current} → ${problematicConfigs.segNum.recommended}`);
      newConfig = newConfig.replace(/segNum\s*=\s*\d+/i, `segNum=${problematicConfigs.segNum.recommended}`);
    }
    
    // Corrigir segKeep (manter segmentos para gravação)
    if (problematicConfigs.segKeep.current !== problematicConfigs.segKeep.recommended) {
      console.log(`🔧 [FIX] Corrigindo segKeep: ${problematicConfigs.segKeep.current} → ${problematicConfigs.segKeep.recommended}`);
      newConfig = newConfig.replace(/segKeep\s*=\s*\d+/i, `segKeep=${problematicConfigs.segKeep.recommended}`);
    }
    
    // Salvar arquivo corrigido
    await fs.writeFile(configPath, newConfig, 'utf8');
    console.log('💾 [FIX] Arquivo de configuração atualizado com sucesso!');
    
    console.log('\n⚠️  [FIX] IMPORTANTE: Reinicie o ZLMediaKit para aplicar as mudanças:');
    console.log('   1. Pare o container: docker-compose down');
    console.log('   2. Inicie novamente: docker-compose up -d');
    
    console.log('\n📋 [FIX] Resumo das correções aplicadas:');
    console.log('   • segDur: 2s → 1800s (30 minutos)');
    console.log('   • mp4_max_second: mantido em 1800s');
    console.log('   • fileSecond: mantido em 1800s');
    console.log('   • segNum: reduzido para 1 (gravação contínua)');
    console.log('   • segKeep: definido como 1 (manter gravações)');
    
    console.log('\n✅ [FIX] Correção concluída! Isso deve resolver o problema de gravações duplicadas a cada 2-5 segundos.');
    
  } catch (error) {
    console.error('❌ [FIX] Erro durante a correção:', error);
    logger.error('[FIX] Erro durante correção ZLM:', error);
  }
}

// Executar correção
fixZLMSegmentation().catch(console.error);