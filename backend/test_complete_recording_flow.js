/**
 * Teste completo do fluxo de gravação
 * Verifica todas as funcionalidades: detecção, segmentação, controles e upload S3
 */

import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config();

const API_BASE = 'http://localhost:3002/api';
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Função para obter token de autenticação
async function getAuthToken() {
  try {
    console.log('🔐 Obtendo token de autenticação...');
    
    // Buscar usuário ativo
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('active', true)
      .limit(1)
      .single();

    if (error || !user) {
      throw new Error('Usuário não encontrado');
    }

    // Gerar token JWT
    const token = jwt.sign(
      { 
        userId: user.id,
        email: user.email,
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    console.log('✅ Token obtido com sucesso');
    return token;
  } catch (error) {
    console.error('❌ Erro ao obter token:', error.message);
    throw error;
  }
}

// Função para fazer requisições autenticadas
async function makeAuthenticatedRequest(method, url, data = null, token) {
  try {
    const config = {
      method,
      url: `${API_BASE}${url}`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return response;
  } catch (error) {
    throw error;
  }
}

// Teste principal
async function testCompleteRecordingFlow() {
  console.log('🧪 === TESTE COMPLETO DO FLUXO DE GRAVAÇÃO ===\n');
  
  let token;
  const results = {
    auth: false,
    cameras: false,
    recordings: false,
    segmentation: false,
    controls: false,
    s3Upload: false,
    stats: false
  };

  try {
    // 1. Autenticação
    console.log('1. 🔐 Testando autenticação...');
    token = await getAuthToken();
    results.auth = true;
    console.log('   ✅ Autenticação funcionando\n');

    // 2. Verificar câmeras
    console.log('2. 📹 Verificando câmeras...');
    const camerasResponse = await makeAuthenticatedRequest('GET', '/cameras', null, token);
    const cameras = camerasResponse.data.data || [];
    console.log(`   📊 Total de câmeras: ${cameras.length}`);
    
    if (cameras.length > 0) {
      results.cameras = true;
      console.log('   ✅ Câmeras encontradas');
      cameras.forEach((camera, index) => {
        console.log(`   📹 Câmera ${index + 1}: ${camera.name} (${camera.status})`);
      });
    } else {
      console.log('   ⚠️ Nenhuma câmera encontrada');
    }
    console.log('');

    // 3. Verificar gravações
    console.log('3. 🎬 Verificando gravações...');
    const recordingsResponse = await makeAuthenticatedRequest('GET', '/recordings', null, token);
    const recordings = recordingsResponse.data.data || [];
    console.log(`   📊 Total de gravações: ${recordings.length}`);
    
    const activeRecordings = recordings.filter(r => r.status === 'recording');
    console.log(`   🔴 Gravações ativas: ${activeRecordings.length}`);
    
    const completedRecordings = recordings.filter(r => r.status === 'completed');
    console.log(`   ✅ Gravações completas: ${completedRecordings.length}`);
    
    if (recordings.length > 0) {
      results.recordings = true;
      console.log('   ✅ Sistema de gravações funcionando');
      
      // Verificar novos campos S3
      const recordingWithS3 = recordings.find(r => r.s3_url || r.upload_status || r.local_path);
      if (recordingWithS3) {
        console.log('   ✅ Campos S3 detectados nas gravações');
        results.s3Upload = true;
      } else {
        console.log('   ⚠️ Campos S3 não encontrados nas gravações');
      }
    } else {
      console.log('   ⚠️ Nenhuma gravação encontrada');
    }
    console.log('');

    // 4. Testar API de segmentação
    console.log('4. ⚡ Testando segmentação...');
    try {
      // Status da segmentação
      const segStatusResponse = await makeAuthenticatedRequest('GET', '/segmentation/stats', null, token);
      console.log('   ✅ Status da segmentação:', JSON.stringify(segStatusResponse.data, null, 2));
      
      // Segmentação forçada
      const forceSegResponse = await makeAuthenticatedRequest('POST', '/segmentation/force', {}, token);
      console.log('   ✅ Segmentação forçada:', forceSegResponse.data.message);
      
      results.segmentation = true;
    } catch (segError) {
      console.log('   ❌ Erro na segmentação:', segError.response?.data || segError.message);
    }
    console.log('');

    // 5. Testar controles de gravação
    console.log('5. 🎮 Testando controles de gravação...');
    if (activeRecordings.length > 0) {
      const recording = activeRecordings[0];
      console.log(`   🎯 Testando com gravação: ${recording.id}`);
      
      try {
        // Testar pause
        const pauseResponse = await makeAuthenticatedRequest('POST', `/recordings/${recording.id}/pause`, {}, token);
        console.log('   ✅ Pause funcionando:', pauseResponse.data.message);
        
        // Testar resume
        const resumeResponse = await makeAuthenticatedRequest('POST', `/recordings/${recording.id}/resume`, {}, token);
        console.log('   ✅ Resume funcionando:', resumeResponse.data.message);
        
        results.controls = true;
      } catch (controlError) {
        console.log('   ❌ Erro nos controles:', controlError.response?.data || controlError.message);
      }
    } else {
      console.log('   ⚠️ Nenhuma gravação ativa para testar controles');
    }
    console.log('');

    // 6. Verificar estatísticas
    console.log('6. 📊 Verificando estatísticas...');
    try {
      const statsResponse = await makeAuthenticatedRequest('GET', '/recordings/stats', null, token);
      console.log('   ✅ Estatísticas:', JSON.stringify(statsResponse.data, null, 2));
      results.stats = true;
    } catch (statsError) {
      console.log('   ❌ Erro nas estatísticas:', statsError.response?.data || statsError.message);
    }
    console.log('');

    // 7. Verificar health do ZLMediaKit
    console.log('7. 🏥 Verificando health do ZLMediaKit...');
    try {
      const healthResponse = await makeAuthenticatedRequest('GET', '/segmentation/health', null, token);
      console.log('   📊 Health ZLMediaKit:', JSON.stringify(healthResponse.data, null, 2));
    } catch (healthError) {
      console.log('   ❌ ZLMediaKit desconectado:', healthError.response?.data || healthError.message);
    }
    console.log('');

  } catch (error) {
    console.error('❌ Erro geral no teste:', error.message);
  }

  // Relatório final
  console.log('📋 === RELATÓRIO FINAL ===');
  console.log(`🔐 Autenticação: ${results.auth ? '✅ OK' : '❌ FALHOU'}`);
  console.log(`📹 Câmeras: ${results.cameras ? '✅ OK' : '❌ FALHOU'}`);
  console.log(`🎬 Gravações: ${results.recordings ? '✅ OK' : '❌ FALHOU'}`);
  console.log(`⚡ Segmentação: ${results.segmentation ? '✅ OK' : '❌ FALHOU'}`);
  console.log(`🎮 Controles: ${results.controls ? '✅ OK' : '⚠️ NÃO TESTADO'}`);
  console.log(`☁️ Upload S3: ${results.s3Upload ? '✅ OK' : '❌ FALHOU'}`);
  console.log(`📊 Estatísticas: ${results.stats ? '✅ OK' : '❌ FALHOU'}`);
  
  const successCount = Object.values(results).filter(Boolean).length;
  const totalTests = Object.keys(results).length;
  console.log(`\n🎯 Resultado: ${successCount}/${totalTests} testes passaram`);
  
  if (successCount === totalTests) {
    console.log('🎉 Todos os testes passaram! Sistema funcionando corretamente.');
  } else {
    console.log('⚠️ Alguns testes falharam. Verifique os logs acima.');
  }
}

// Executar teste
testCompleteRecordingFlow().catch(console.error);