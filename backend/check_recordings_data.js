import { supabaseAdmin } from './src/config/database.js';
// Node 18+ possui fetch nativo - removido: import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';

const API_BASE_URL = 'http://localhost:3002';

// Função para fazer login e obter token
async function login() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'admin@newcam.com',
        password: 'admin123'
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`Login falhou: ${data.message}`);
    }

    return data.tokens.accessToken;
  } catch (error) {
    console.error('❌ Erro no login:', error.message);
    throw error;
  }
}

// Função para verificar gravações no banco de dados
async function checkRecordingsInDatabase() {
  console.log('\n🔍 Verificando gravações no banco de dados...');
  
  try {
    // Verificar total de gravações
    const { data: recordings, error, count } = await supabaseAdmin
      .from('recordings')
      .select('*', { count: 'exact' })
      .limit(5);

    if (error) {
      console.error('❌ Erro ao consultar gravações:', error);
      return;
    }

    console.log(`📊 Total de gravações no banco: ${count}`);
    
    if (recordings && recordings.length > 0) {
      console.log('\n📋 Primeiras 5 gravações:');
      recordings.forEach((recording, index) => {
        console.log(`${index + 1}. ID: ${recording.id}`);
        console.log(`   Câmera: ${recording.camera_id}`);
        console.log(`   Status: ${recording.status}`);
        console.log(`   Criado em: ${recording.created_at}`);
        console.log(`   Duração: ${recording.duration || 'N/A'}s`);
        console.log(`   Tamanho: ${recording.file_size || 'N/A'} bytes`);
        console.log('---');
      });
    } else {
      console.log('📭 Nenhuma gravação encontrada no banco de dados');
    }

    return { count, recordings };
  } catch (error) {
    console.error('❌ Erro ao verificar gravações:', error);
    throw error;
  }
}

// Função para testar API de estatísticas
async function testStatsAPI(token) {
  console.log('\n📊 Testando API /api/recordings/stats...');
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/recordings/stats`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    console.log(`Status: ${response.status}`);
    console.log('Resposta:', JSON.stringify(data, null, 2));
    
    return { status: response.status, data };
  } catch (error) {
    console.error('❌ Erro ao testar API stats:', error);
    throw error;
  }
}

// Função para testar API de gravações ativas
async function testActiveRecordingsAPI(token) {
  console.log('\n🔴 Testando API /api/recordings/active...');
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/recordings/active`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    console.log(`Status: ${response.status}`);
    console.log('Resposta:', JSON.stringify(data, null, 2));
    
    return { status: response.status, data };
  } catch (error) {
    console.error('❌ Erro ao testar API active:', error);
    throw error;
  }
}

// Função para criar gravações de teste
async function createTestRecordings() {
  console.log('\n🧪 Criando gravações de teste...');
  
  try {
    // Primeiro, verificar se existem câmeras
    const { data: cameras, error: cameraError } = await supabaseAdmin
      .from('cameras')
      .select('id, name')
      .limit(3);

    if (cameraError) {
      console.error('❌ Erro ao buscar câmeras:', cameraError);
      return;
    }

    if (!cameras || cameras.length === 0) {
      console.log('📭 Nenhuma câmera encontrada. Criando câmera de teste...');
      
      // Criar uma câmera de teste
      const { data: newCamera, error: createCameraError } = await supabaseAdmin
        .from('cameras')
        .insert({
          name: 'Câmera Teste',
          rtsp_url: 'rtsp://test.example.com/stream',
          status: 'offline',
          user_id: '3e2ea6be-660c-4add-b89b-ce493df265b4' // ID do admin
        })
        .select()
        .single();

      if (createCameraError) {
        console.error('❌ Erro ao criar câmera de teste:', createCameraError);
        return;
      }

      cameras.push(newCamera);
      console.log(`✅ Câmera de teste criada: ${newCamera.name} (${newCamera.id})`);
    }

    console.log(`📹 Encontradas ${cameras.length} câmeras disponíveis`);

    // Criar algumas gravações de teste
    const testRecordings = [];
    const now = new Date();
    
    for (let i = 0; i < 3; i++) {
      const startTime = new Date(now.getTime() - (i + 1) * 24 * 60 * 60 * 1000); // i+1 dias atrás
      const endTime = new Date(startTime.getTime() + 30 * 60 * 1000); // 30 minutos de duração
      
      testRecordings.push({
        camera_id: cameras[i % cameras.length].id,
        status: i === 0 ? 'recording' : 'completed',
        file_path: `/recordings/test_recording_${i + 1}.mp4`,
        file_size: Math.floor(Math.random() * 1000000) + 500000, // 500KB - 1.5MB
        duration: 1800, // 30 minutos
        start_time: startTime.toISOString(),
        end_time: i === 0 ? null : endTime.toISOString(),
        created_at: startTime.toISOString(),
        updated_at: (i === 0 ? now : endTime).toISOString()
      });
    }

    const { data: createdRecordings, error: recordingError } = await supabaseAdmin
      .from('recordings')
      .insert(testRecordings)
      .select();

    if (recordingError) {
      console.error('❌ Erro ao criar gravações de teste:', recordingError);
      return;
    }

    console.log(`✅ ${createdRecordings.length} gravações de teste criadas com sucesso!`);
    
    createdRecordings.forEach((recording, index) => {
      console.log(`${index + 1}. ${recording.id} - Status: ${recording.status}`);
    });

    return createdRecordings;
  } catch (error) {
    console.error('❌ Erro ao criar gravações de teste:', error);
    throw error;
  }
}

// Função principal
async function main() {
  console.log('🚀 Verificando dados de gravações...');
  console.log('=' .repeat(50));

  try {
    // 1. Verificar gravações no banco
    const dbResult = await checkRecordingsInDatabase();
    
    // 2. Se não há gravações, criar algumas de teste
    if (dbResult.count === 0) {
      console.log('\n🔧 Nenhuma gravação encontrada. Criando dados de teste...');
      await createTestRecordings();
      
      // Verificar novamente após criar
      await checkRecordingsInDatabase();
    }
    
    // 3. Fazer login para obter token
    console.log('\n🔐 Fazendo login...');
    const token = await login();
    console.log('✅ Login realizado com sucesso');
    
    // 4. Testar APIs
    await testStatsAPI(token);
    await testActiveRecordingsAPI(token);
    
    console.log('\n✅ Verificação concluída!');
    
  } catch (error) {
    console.error('\n❌ Erro durante a verificação:', error);
    process.exit(1);
  }
}

// Executar script
main();