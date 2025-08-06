#!/usr/bin/env node

/**
 * Script para ativar gravação contínua em todas as câmeras do sistema
 * 
 * Este script:
 * 1. Busca todas as câmeras ativas do sistema
 * 2. Para cada câmera, faz uma requisição POST para /api/recordings/continuous/enable
 * 3. Atualiza o campo continuous_recording=true no banco de dados
 * 4. Exibe logs detalhados do progresso
 * 5. Trata erros adequadamente
 */

import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar variáveis de ambiente
console.log('📁 Carregando variáveis de ambiente...');
dotenv.config({ path: path.join(__dirname, '..', 'backend', '.env') });
console.log('✅ Variáveis de ambiente carregadas');

// Configurações
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3002';
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || 'newcam-internal-service-2025';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Verificar variáveis de ambiente obrigatórias
console.log('🔍 Verificando variáveis de ambiente...');
console.log(`   SUPABASE_URL: ${SUPABASE_URL ? 'OK' : 'FALTANDO'}`);
console.log(`   SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY ? 'OK' : 'FALTANDO'}`);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Erro: Variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
  process.exit(1);
}

console.log('✅ Variáveis de ambiente verificadas com sucesso');

// Inicializar cliente Supabase
console.log('🔌 Inicializando cliente Supabase...');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
console.log('✅ Cliente Supabase inicializado');

// Configurar axios com timeout e headers padrão
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'x-service-token': SERVICE_TOKEN
  }
});

/**
 * Buscar todas as câmeras ativas do sistema
 */
async function getAllActiveCameras() {
  try {
    console.log('🔍 Buscando todas as câmeras ativas do sistema...');
    
    const { data: cameras, error } = await supabase
      .from('cameras')
      .select('*')
      .eq('active', true)
      .order('name');
    
    if (error) {
      throw new Error(`Erro ao buscar câmeras: ${error.message}`);
    }
    
    console.log(`✅ Encontradas ${cameras.length} câmeras ativas`);
    return cameras;
    
  } catch (error) {
    console.error('❌ Erro ao buscar câmeras:', error.message);
    throw error;
  }
}

/**
 * Ativar gravação contínua para uma câmera específica
 */
async function enableContinuousRecordingForCamera(camera) {
  try {
    console.log(`🎥 Processando câmera: ${camera.name} (ID: ${camera.id})`);
    
    // Verificar se já está com gravação contínua ativada
    if (camera.continuous_recording) {
      console.log(`⚠️  Câmera ${camera.name} já possui gravação contínua ativada`);
      return { success: true, message: 'Já ativada', skipped: true };
    }
    
    // Fazer requisição para ativar gravação contínua via API
    console.log(`📡 Fazendo requisição para ativar gravação contínua...`);
    
    const response = await apiClient.post('/api/recordings/continuous/enable', {
      camera_id: camera.id,
      enabled: true
    });
    
    if (response.data.success) {
      console.log(`✅ Gravação contínua ativada com sucesso para ${camera.name}`);
      
      // Atualizar campo no banco de dados
      const { error: updateError } = await supabase
        .from('cameras')
        .update({ continuous_recording: true })
        .eq('id', camera.id);
      
      if (updateError) {
        console.warn(`⚠️  Aviso: Erro ao atualizar campo no banco para ${camera.name}: ${updateError.message}`);
      } else {
        console.log(`💾 Campo continuous_recording atualizado no banco para ${camera.name}`);
      }
      
      return { success: true, message: 'Ativada com sucesso', data: response.data };
    } else {
      throw new Error(response.data.message || 'Resposta de erro da API');
    }
    
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    console.error(`❌ Erro ao ativar gravação contínua para ${camera.name}: ${errorMessage}`);
    
    return { 
      success: false, 
      message: errorMessage,
      error: error.response?.status || 'UNKNOWN'
    };
  }
}

/**
 * Função principal
 */
async function main() {
  console.log('🚀 Iniciando script de ativação de gravação contínua');
  console.log('=' .repeat(60));
  
  const startTime = Date.now();
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  const errors = [];
  
  try {
    // Buscar todas as câmeras ativas
    const cameras = await getAllActiveCameras();
    
    if (cameras.length === 0) {
      console.log('ℹ️  Nenhuma câmera ativa encontrada no sistema');
      return;
    }
    
    console.log('\n📋 Processando câmeras...');
    console.log('-'.repeat(60));
    
    // Processar cada câmera
    for (let i = 0; i < cameras.length; i++) {
      const camera = cameras[i];
      console.log(`\n[${i + 1}/${cameras.length}] Processando: ${camera.name}`);
      
      const result = await enableContinuousRecordingForCamera(camera);
      
      if (result.success) {
        if (result.skipped) {
          skippedCount++;
        } else {
          successCount++;
        }
      } else {
        errorCount++;
        errors.push({
          camera: camera.name,
          id: camera.id,
          error: result.message
        });
      }
      
      // Pequena pausa entre requisições para evitar sobrecarga
      if (i < cameras.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
  } catch (error) {
    console.error('❌ Erro crítico durante execução:', error.message);
    process.exit(1);
  }
  
  // Relatório final
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 RELATÓRIO FINAL');
  console.log('='.repeat(60));
  console.log(`⏱️  Tempo de execução: ${duration}s`);
  console.log(`✅ Câmeras processadas com sucesso: ${successCount}`);
  console.log(`⚠️  Câmeras já com gravação ativa: ${skippedCount}`);
  console.log(`❌ Câmeras com erro: ${errorCount}`);
  console.log(`📊 Total de câmeras processadas: ${successCount + errorCount + skippedCount}`);
  
  if (errors.length > 0) {
    console.log('\n❌ ERROS ENCONTRADOS:');
    console.log('-'.repeat(40));
    errors.forEach((error, index) => {
      console.log(`${index + 1}. ${error.camera} (${error.id}): ${error.error}`);
    });
  }
  
  if (errorCount > 0) {
    console.log('\n⚠️  Script finalizado com erros. Verifique os logs acima.');
    process.exit(1);
  } else {
    console.log('\n🎉 Script finalizado com sucesso!');
    process.exit(0);
  }
}

// Tratamento de erros não capturados
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Erro não tratado:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Exceção não capturada:', error);
  process.exit(1);
});

// Executar script
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  main();
}

export { main, getAllActiveCameras, enableContinuousRecordingForCamera };