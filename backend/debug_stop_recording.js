import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

const API_BASE = 'http://localhost:3001/api';

// Configurar Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function getAuthToken() {
  try {
    console.log('🔐 Tentando autenticar com test@recording.com...');
    const response = await axios.post(`${API_BASE}/auth/login`, {
      email: 'test@recording.com',
      password: 'test123'
    });
    console.log('✅ Autenticação bem-sucedida');
    return response.data.data.access_token;
  } catch (error) {
    console.error('❌ Erro na autenticação:', error.response?.data?.message || error.message);
    
    // Tentar com o usuário original
    try {
      console.log('🔐 Tentando autenticar com gouveiarx@gmail.com...');
      const response2 = await axios.post(`${API_BASE}/auth/login`, {
        email: 'gouveiarx@gmail.com',
        password: 'admin123'
      });
      console.log('✅ Autenticação bem-sucedida com usuário original');
      return response2.data.data.access_token;
    } catch (error2) {
      console.error('❌ Erro na autenticação com usuário original:', error2.response?.data?.message || error2.message);
      return null;
    }
  }
}

async function debugStopRecording() {
  console.log('🔍 Debug: Testando função de parar gravação...');
  
  try {
    // 1. Obter token
    const token = await getAuthToken();
    if (!token) {
      console.log('❌ Não foi possível obter token');
      return;
    }
    
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    
    // 2. Buscar uma gravação para testar
    console.log('\n📋 Buscando gravações...');
    const recordingsResponse = await axios.get(`${API_BASE}/recordings?limit=1`, { headers });
    const recordings = recordingsResponse.data.data || [];
    
    if (recordings.length === 0) {
      console.log('⚠️ Nenhuma gravação encontrada');
      return;
    }
    
    const recording = recordings[0];
    console.log(`📹 Testando com gravação: ${recording.id}`);
    console.log(`📹 Status atual: ${recording.status}`);
    console.log(`📹 Câmera: ${recording.camera_id}`);
    
    // 3. Verificar se a câmera existe
    console.log('\n🎥 Verificando dados da câmera...');
    const { data: camera, error: cameraError } = await supabase
      .from('cameras')
      .select('*')
      .eq('id', recording.camera_id)
      .single();
    
    if (cameraError || !camera) {
      console.log('❌ Câmera não encontrada:', cameraError?.message);
      return;
    }
    
    console.log(`✅ Câmera encontrada: ${camera.name}`);
    console.log(`📡 RTSP URL: ${camera.rtsp_url || 'Não configurada'}`);
    console.log(`📊 Status: ${camera.status}`);
    console.log(`🔄 Ativa: ${camera.active}`);
    
    // 4. Testar a rota de parar gravação
    console.log('\n⏹️ Testando parar gravação...');
    
    try {
      const stopResponse = await axios.post(
        `${API_BASE}/recordings/${recording.id}/stop`, 
        {}, 
        { 
          headers,
          timeout: 15000 // 15 segundos de timeout
        }
      );
      
      console.log('✅ Resposta da API:', stopResponse.data);
      
    } catch (stopError) {
      console.log('❌ Erro ao parar gravação:');
      console.log('Status:', stopError.response?.status);
      console.log('Dados:', stopError.response?.data);
      console.log('Mensagem:', stopError.message);
      
      // Se for erro de timeout, verificar se é problema do ZLMediaKit
      if (stopError.code === 'ECONNABORTED') {
        console.log('⚠️ Timeout - possível problema de comunicação com ZLMediaKit');
        
        // Testar conectividade com ZLMediaKit
        console.log('\n🔧 Testando conectividade com ZLMediaKit...');
        try {
          const zlmResponse = await axios.get(
            `${process.env.ZLMEDIAKIT_API_URL}/index/api/getServerConfig`,
            { timeout: 5000 }
          );
          console.log('✅ ZLMediaKit está respondendo');
        } catch (zlmError) {
          console.log('❌ ZLMediaKit não está respondendo:', zlmError.message);
        }
      }
    }
    
    // 5. Verificar se o status da gravação mudou
    console.log('\n🔄 Verificando status após tentativa de parar...');
    const updatedRecordingResponse = await axios.get(`${API_BASE}/recordings/${recording.id}`, { headers });
    const updatedRecording = updatedRecordingResponse.data.data;
    
    console.log(`📊 Status anterior: ${recording.status}`);
    console.log(`📊 Status atual: ${updatedRecording.status}`);
    
    if (recording.status !== updatedRecording.status) {
      console.log('✅ Status da gravação foi alterado');
    } else {
      console.log('⚠️ Status da gravação não foi alterado');
    }
    
  } catch (error) {
    console.error('💥 Erro no debug:', error);
  }
}

// Executar
debugStopRecording()
  .then(() => {
    console.log('\n🎉 Debug concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Erro fatal:', error);
    process.exit(1);
  });