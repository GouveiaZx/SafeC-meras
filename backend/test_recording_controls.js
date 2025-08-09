import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const API_BASE = 'http://localhost:3002/api';

// Token de teste (você precisa obter um token válido)
let authToken = null;

async function getAuthToken() {
  try {
    console.log('🔐 Obtendo token de autenticação...');
    
    // Fazer login com usuário de teste
    const loginResponse = await axios.post(`${API_BASE}/auth/login`, {
      email: 'test@recording.com',
      password: 'test123'
    });
    
    if (loginResponse.data.tokens) {
      console.log('✅ Login realizado com sucesso');
      return loginResponse.data.tokens.accessToken;
    }
    
    throw new Error('Token não retornado');
    
  } catch (error) {
    console.log('❌ Erro ao obter token:', error.response?.data || error.message);
    console.log('❌ Não foi possível obter token de autenticação');
    return null;
  }
}

async function createTestUser() {
  try {
    console.log('👤 Criando usuário de teste...');
    
    const { data, error } = await supabase
      .from('users')
      .insert({
        email: 'test@example.com',
        password_hash: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.PmvAu.', // test123
        name: 'Test User',
        role: 'admin',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) {
      console.error('❌ Erro ao criar usuário:', error);
      return null;
    }
    
    console.log('✅ Usuário de teste criado:', data.email);
    return data;
    
  } catch (error) {
    console.error('❌ Erro ao criar usuário de teste:', error);
    return null;
  }
}

async function testRecordingControls() {
  console.log('🧪 Testando controles de gravação...');
  
  try {
    // Obter token de autenticação
    const token = await getAuthToken();
    if (!token) {
      console.error('❌ Não foi possível obter token de autenticação');
      return;
    }
    
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    
    // 1. Verificar gravações ativas
    console.log('\n1. Verificando gravações ativas...');
    const recordingsResponse = await axios.get(`${API_BASE}/recordings`, { headers });
    
    console.log(`✅ Total de gravações: ${recordingsResponse.data.recordings?.length || 0}`);
    
    const activeRecordings = recordingsResponse.data.recordings?.filter(r => r.status === 'recording') || [];
    console.log(`📹 Gravações ativas: ${activeRecordings.length}`);
    
    if (activeRecordings.length === 0) {
      console.log('⚠️ Nenhuma gravação ativa encontrada. Iniciando gravação de teste...');
      await startTestRecording(headers);
      return;
    }
    
    // 2. Testar pausar gravação
    const testRecording = activeRecordings[0];
    console.log(`\n2. Testando pausar gravação: ${testRecording.id}`);
    
    try {
      const pauseResponse = await axios.post(
        `${API_BASE}/recordings/${testRecording.id}/pause`,
        {},
        { headers }
      );
      console.log('✅ Gravação pausada:', pauseResponse.data);
    } catch (error) {
      console.error('❌ Erro ao pausar gravação:', error.response?.data || error.message);
    }
    
    // 3. Testar retomar gravação
    console.log(`\n3. Testando retomar gravação: ${testRecording.id}`);
    
    try {
      const resumeResponse = await axios.post(
        `${API_BASE}/recordings/${testRecording.id}/resume`,
        {},
        { headers }
      );
      console.log('✅ Gravação retomada:', resumeResponse.data);
    } catch (error) {
      console.error('❌ Erro ao retomar gravação:', error.response?.data || error.message);
    }
    
    // 4. Testar preparar download
    console.log(`\n4. Testando preparar download: ${testRecording.id}`);
    
    try {
      const downloadResponse = await axios.post(
        `${API_BASE}/recordings/${testRecording.id}/prepare-download`,
        {},
        { headers }
      );
      console.log('✅ Download preparado:', downloadResponse.data);
    } catch (error) {
      console.error('❌ Erro ao preparar download:', error.response?.data || error.message);
    }
    
    // 5. Testar estatísticas de segmentação
    console.log('\n5. Testando estatísticas de segmentação...');
    
    try {
      const statsResponse = await axios.get(`${API_BASE}/segmentation/stats`, { headers });
      console.log('✅ Estatísticas obtidas:', JSON.stringify(statsResponse.data, null, 2));
    } catch (error) {
      console.error('❌ Erro ao obter estatísticas:', error.response?.data || error.message);
    }
    
    // 6. Testar segmentação manual forçada
    console.log('\n6. Testando segmentação manual forçada...');
    
    try {
      const forceSegmentResponse = await axios.post(
        `${API_BASE}/segmentation/force`,
        {},
        { headers }
      );
      console.log('✅ Segmentação forçada:', forceSegmentResponse.data);
    } catch (error) {
      console.error('❌ Erro na segmentação forçada:', error.response?.data || error.message);
    }
    
  } catch (error) {
    console.error('❌ Erro durante teste de controles:', error.response?.data || error.message);
  }
}

async function startTestRecording(headers) {
  try {
    console.log('🎬 Iniciando gravação de teste...');
    
    // Buscar câmeras disponíveis
    const camerasResponse = await axios.get(`${API_BASE}/cameras`, { headers });
    const cameras = camerasResponse.data.cameras || [];
    
    if (cameras.length === 0) {
      console.log('⚠️ Nenhuma câmera encontrada');
      return;
    }
    
    const camera = cameras[0];
    console.log(`📹 Iniciando gravação para câmera: ${camera.name} (${camera.id})`);
    
    const startResponse = await axios.post(
      `${API_BASE}/recordings/start`,
      { camera_id: camera.id },
      { headers }
    );
    
    console.log('✅ Gravação iniciada:', startResponse.data);
    
  } catch (error) {
    console.error('❌ Erro ao iniciar gravação de teste:', error.response?.data || error.message);
  }
}

// Executar teste
testRecordingControls()
  .then(() => {
    console.log('\n🎉 Teste de controles de gravação concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Erro fatal:', error);
    process.exit(1);
  });