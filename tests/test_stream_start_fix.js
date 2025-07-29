#!/usr/bin/env node

/**
 * Script de teste para validar a correção do erro 400 ao iniciar câmeras RTMP
 * 
 * Este script testa o início de streams para câmeras RTMP e RTSP
 * para garantir que a correção funciona corretamente.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuração base
const API_BASE = 'http://localhost:3002';
const API_KEY = process.env.API_KEY || 'your-api-key-here';

// Headers padrão
const headers = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type': 'application/json'
};

// Funções auxiliares
const log = (message, type = 'info') => {
  const timestamp = new Date().toISOString();
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : '📋';
  console.log(`${prefix} [${timestamp}] ${message}`);
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Função para criar câmera de teste
async function createTestCamera(cameraData) {
  try {
    const response = await axios.post(`${API_BASE}/api/cameras`, cameraData, { headers });
    return response.data;
  } catch (error) {
    log(`Erro ao criar câmera: ${error.response?.data?.message || error.message}`, 'error');
    throw error;
  }
}

// Função para iniciar stream
async function startStream(cameraId, options = {}) {
  try {
    const response = await axios.post(`${API_BASE}/api/streams/${cameraId}/start`, {
      quality: 'medium',
      format: 'hls',
      audio: true,
      ...options
    }, { headers });
    
    log(`Stream iniciado com sucesso para câmera ${cameraId}`);
    return response.data;
  } catch (error) {
    log(`Erro ao iniciar stream: ${error.response?.data?.message || error.message}`, 'error');
    throw error;
  }
}

// Função para parar stream
async function stopStream(cameraId) {
  try {
    const response = await axios.post(`${API_BASE}/api/streams/${cameraId}/stop`, {}, { headers });
    log(`Stream parado com sucesso para câmera ${cameraId}`);
    return response.data;
  } catch (error) {
    log(`Erro ao parar stream: ${error.response?.data?.message || error.message}`, 'error');
    // Não falhar o teste se não conseguir parar
  }
}

// Função para deletar câmera
async function deleteCamera(cameraId) {
  try {
    await axios.delete(`${API_BASE}/api/cameras/${cameraId}`, { headers });
    log(`Câmera ${cameraId} deletada com sucesso`);
  } catch (error) {
    log(`Erro ao deletar câmera: ${error.response?.data?.message || error.message}`, 'error');
  }
}

// Testes
async function runTests() {
  log('=== Iniciando testes de correção do erro 400 RTMP ===');
  
  const testCameras = [];
  
  try {
    // Teste 1: Câmera RTMP com URL RTMP válida
    log('Teste 1: Câmera RTMP com URL RTMP válida');
    const rtmpCamera = await createTestCamera({
      name: 'Teste RTMP - Câmera 1',
      description: 'Câmera RTMP para teste de correção',
      stream_type: 'rtmp',
      rtmp_url: 'rtmp://localhost:1935/live/test1',
      resolution: '1920x1080',
      fps: 30
    });
    testCameras.push(rtmpCamera.id);
    
    await sleep(1000);
    const rtmpResult = await startStream(rtmpCamera.id);
    log(`✅ RTMP Stream iniciado: ${JSON.stringify(rtmpResult)}`, 'success');
    await sleep(2000);
    await stopStream(rtmpCamera.id);
    
    // Teste 2: Câmera RTSP com URL RTSP válida (regressão)
    log('Teste 2: Câmera RTSP com URL RTSP válida (teste de regressão)');
    const rtspCamera = await createTestCamera({
      name: 'Teste RTSP - Câmera 2',
      description: 'Câmera RTSP para teste de regressão',
      stream_type: 'rtsp',
      rtsp_url: 'rtsp://localhost:554/stream2',
      resolution: '1920x1080',
      fps: 30
    });
    testCameras.push(rtspCamera.id);
    
    await sleep(1000);
    const rtspResult = await startStream(rtspCamera.id);
    log(`✅ RTSP Stream iniciado: ${JSON.stringify(rtspResult)}`, 'success');
    await sleep(2000);
    await stopStream(rtspCamera.id);
    
    // Teste 3: Câmera RTMP sem URL RTMP (deve falhar com mensagem apropriada)
    log('Teste 3: Câmera RTMP sem URL RTMP (validação de erro)');
    const rtmpNoUrlCamera = await createTestCamera({
      name: 'Teste RTMP - Câmera 3',
      description: 'Câmera RTMP sem URL para teste de validação',
      stream_type: 'rtmp',
      resolution: '1920x1080',
      fps: 30
    });
    testCameras.push(rtmpNoUrlCamera.id);
    
    await sleep(1000);
    try {
      await startStream(rtmpNoUrlCamera.id);
      log('❌ Teste 3 deveria ter falhado!', 'error');
    } catch (error) {
      if (error.response?.data?.message?.includes('URL RTMP da câmera não está configurada')) {
        log('✅ Validação RTMP funcionando corretamente', 'success');
      } else {
        log(`❌ Mensagem de erro inesperada: ${error.response?.data?.message}`, 'error');
      }
    }
    
    // Teste 4: Câmera RTSP sem URL RTSP (deve falhar com mensagem apropriada)
    log('Teste 4: Câmera RTSP sem URL RTSP (validação de erro)');
    const rtspNoUrlCamera = await createTestCamera({
      name: 'Teste RTSP - Câmera 4',
      description: 'Câmera RTSP sem URL para teste de validação',
      stream_type: 'rtsp',
      resolution: '1920x1080',
      fps: 30
    });
    testCameras.push(rtspNoUrlCamera.id);
    
    await sleep(1000);
    try {
      await startStream(rtspNoUrlCamera.id);
      log('❌ Teste 4 deveria ter falhado!', 'error');
    } catch (error) {
      if (error.response?.data?.message?.includes('URL RTSP da câmera não está configurada')) {
        log('✅ Validação RTSP funcionando corretamente', 'success');
      } else {
        log(`❌ Mensagem de erro inesperada: ${error.response?.data?.message}`, 'error');
      }
    }
    
    log('=== Todos os testes concluídos ===', 'success');
    
  } catch (error) {
    log(`Erro durante os testes: ${error.message}`, 'error');
  } finally {
    // Limpeza: deletar câmeras de teste
    log('Limpando câmeras de teste...');
    for (const cameraId of testCameras) {
      await deleteCamera(cameraId);
      await sleep(500);
    }
    log('Limpeza concluída');
  }
}

// Verificar se a API está disponível
async function checkApi() {
  try {
    await axios.get(`${API_BASE}/api/health`);
    return true;
  } catch (error) {
    log('API não está disponível. Certifique-se de que o backend está rodando.', 'error');
    return false;
  }
}

// Executar
if (require.main === module) {
  checkApi().then(available => {
    if (available) {
      runTests().catch(console.error);
    } else {
      process.exit(1);
    }
  });
}

module.exports = { runTests, createTestCamera, startStream, stopStream, deleteCamera };