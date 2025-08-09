import axios from 'axios';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Carregar variáveis de ambiente
dotenv.config();

const API_BASE = 'http://localhost:3002/api';
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

let authToken = null;

async function getAuthToken() {
  try {
    console.log('🔐 Obtendo token de autenticação...');
    
    const loginResponse = await axios.post(`${API_BASE}/auth/login`, {
      email: 'test@recording.com',
      password: 'test123'
    });
    
    if (loginResponse.data.tokens) {
      authToken = loginResponse.data.tokens.accessToken;
      console.log('✅ Login realizado com sucesso');
      return authToken;
    }
    
    throw new Error('Token não retornado');
    
  } catch (error) {
    console.log('❌ Erro ao obter token:', error.response?.data || error.message);
    return null;
  }
}

async function testRecordingControlFunctions() {
  try {
    console.log('🧪 Testando funções de controle de gravação...');
    
    // 1. Obter token de autenticação
    const token = await getAuthToken();
    if (!token) {
      console.log('❌ Não foi possível obter token. Abortando testes.');
      return;
    }
    
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    
    // 2. Listar gravações existentes
    console.log('\n📋 Listando gravações existentes...');
    try {
      const recordingsResponse = await axios.get(`${API_BASE}/recordings`, { headers });
      const recordings = recordingsResponse.data.data || [];
      console.log(`✅ Total de gravações: ${recordings.length}`);
      
      if (recordings.length > 0) {
        const activeRecordings = recordings.filter(r => r.status === 'recording');
        console.log(`📹 Gravações ativas: ${activeRecordings.length}`);
        
        // Mostrar algumas gravações para teste
        recordings.slice(0, 3).forEach((recording, index) => {
          console.log(`   ${index + 1}. ID: ${recording.id}, Status: ${recording.status}, Câmera: ${recording.camera_id}`);
        });
        
        // 3. Testar funções de controle com a primeira gravação
        if (recordings.length > 0) {
          const testRecording = recordings[0];
          await testControlFunctions(testRecording, headers);
        }
      } else {
        console.log('⚠️ Nenhuma gravação encontrada para testar controles.');
      }
      
    } catch (error) {
      console.log('❌ Erro ao listar gravações:', error.response?.data || error.message);
    }
    
    // 4. Testar criação de nova gravação
    await testCreateRecording(headers);
    
    // 5. Testar deleção em lote
    await testBulkDelete(headers);
    
  } catch (error) {
    console.error('❌ Erro no teste de funções de controle:', error);
  }
}

async function testControlFunctions(recording, headers) {
  console.log(`\n🎮 Testando controles para gravação ${recording.id}...`);
  
  // Testar pause (se gravação estiver ativa)
  if (recording.status === 'recording') {
    console.log('⏸️ Testando pausar gravação...');
    try {
      const pauseResponse = await axios.post(`${API_BASE}/recordings/pause`, {
        cameraId: recording.camera_id,
        recordingId: recording.id
      }, { headers });
      console.log('✅ Pause:', pauseResponse.data.message);
    } catch (error) {
      console.log('❌ Erro ao pausar:', error.response?.data?.message || error.message);
    }
    
    // Aguardar um pouco
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Testar resume
    console.log('▶️ Testando retomar gravação...');
    try {
      const resumeResponse = await axios.post(`${API_BASE}/recordings/resume`, {
        cameraId: recording.camera_id
      }, { headers });
      console.log('✅ Resume:', resumeResponse.data.message);
    } catch (error) {
      console.log('❌ Erro ao retomar:', error.response?.data?.message || error.message);
    }
  }
  
  // Testar stop
  console.log('⏹️ Testando parar gravação...');
  try {
    const stopResponse = await axios.post(`${API_BASE}/recordings/${recording.id}/stop`, {}, { headers });
    console.log('✅ Stop:', stopResponse.data.message);
  } catch (error) {
    console.log('❌ Erro ao parar:', error.response?.data?.message || error.message);
  }
  
  // Testar download (apenas verificar se a rota responde)
  console.log('📥 Testando preparação de download...');
  try {
    const downloadResponse = await axios.get(`${API_BASE}/recordings/${recording.id}/download`, {
      headers,
      maxRedirects: 0,
      validateStatus: function (status) {
        return status < 500; // Aceitar redirects e erros de cliente
      }
    });
    
    if (downloadResponse.status === 302) {
      console.log('✅ Download: Redirecionamento para S3 configurado');
    } else if (downloadResponse.status === 200) {
      console.log('✅ Download: Arquivo local disponível');
    } else {
      console.log(`⚠️ Download: Status ${downloadResponse.status}`);
    }
  } catch (error) {
    if (error.response?.status === 404) {
      console.log('⚠️ Download: Arquivo não encontrado (esperado para gravações antigas)');
    } else {
      console.log('❌ Erro no download:', error.response?.data?.message || error.message);
    }
  }
}

async function testCreateRecording(headers) {
  console.log('\n🎬 Testando criação de nova gravação...');
  
  try {
    // Buscar câmeras disponíveis
    const { data: cameras, error } = await supabase
      .from('cameras')
      .select('id, name, rtsp_url')
      .eq('active', true)
      .limit(1);
    
    if (error || !cameras || cameras.length === 0) {
      console.log('⚠️ Nenhuma câmera ativa encontrada para teste');
      return;
    }
    
    const camera = cameras[0];
    console.log(`📹 Testando com câmera: ${camera.name} (${camera.id})`);
    
    const createResponse = await axios.post(`${API_BASE}/recordings`, {
      cameraId: camera.id
    }, { headers });
    
    console.log('✅ Gravação criada:', createResponse.data.message);
    console.log('📝 ID da nova gravação:', createResponse.data.data?.id);
    
  } catch (error) {
    console.log('❌ Erro ao criar gravação:', error.response?.data?.message || error.message);
  }
}

async function testBulkDelete(headers) {
  console.log('\n🗑️ Testando deleção em lote...');
  
  try {
    // Buscar gravações para deletar (apenas as mais antigas)
    const recordingsResponse = await axios.get(`${API_BASE}/recordings?limit=2`, { headers });
    const recordings = recordingsResponse.data.data || [];
    
    if (recordings.length === 0) {
      console.log('⚠️ Nenhuma gravação disponível para teste de deleção');
      return;
    }
    
    // Filtrar apenas gravações que não estão ativas
    const inactiveRecordings = recordings.filter(r => r.status !== 'recording');
    
    if (inactiveRecordings.length === 0) {
      console.log('⚠️ Nenhuma gravação inativa disponível para teste de deleção');
      return;
    }
    
    const recordingIds = inactiveRecordings.slice(0, 1).map(r => r.id); // Deletar apenas 1 para teste
    console.log(`🎯 Tentando deletar ${recordingIds.length} gravação(ões)`);
    
    const deleteResponse = await axios.delete(`${API_BASE}/recordings`, {
      headers,
      data: {
        recording_ids: recordingIds,
        confirm: true
      }
    });
    
    console.log('✅ Deleção:', deleteResponse.data.message);
    console.log(`📊 Deletadas: ${deleteResponse.data.deleted_count}, Falhas: ${deleteResponse.data.failed_count}`);
    
  } catch (error) {
    console.log('❌ Erro na deleção em lote:', error.response?.data?.message || error.message);
  }
}

// Executar
testRecordingControlFunctions()
  .then(() => {
    console.log('\n🎉 Teste de funções de controle concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Erro fatal:', error);
    process.exit(1);
  });