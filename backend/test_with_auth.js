import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testWithAuth() {
  console.log('=== TESTE COM AUTENTICAÇÃO ===\n');
  
  try {
    // 1. Criar um token JWT válido usando Supabase
    console.log('1. Criando token de autenticação...');
    
    // Buscar um usuário existente
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email')
      .limit(1);
    
    if (usersError || !users || users.length === 0) {
      console.error('Erro ao buscar usuários:', usersError);
      return;
    }
    
    const user = users[0];
    console.log(`   - Usando usuário: ${user.email} (ID: ${user.id})`);
    
    // Criar um token JWT simples (para teste)
    const jwt = await import('jsonwebtoken');
    const token = jwt.default.sign(
      { 
        userId: user.id, 
        email: user.email,
        role: 'admin'
      }, 
      process.env.JWT_SECRET, 
      { expiresIn: '1h' }
    );
    
    console.log('   - Token criado com sucesso');
    
    // 2. Testar API com token
    console.log('\n2. Testando API de estatísticas com token:');
    try {
      const response = await axios.get('http://localhost:3002/api/recordings/stats', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      console.log('   ✓ API respondeu com sucesso!');
      console.log('   - Status:', response.status);
      console.log('   - Dados:', JSON.stringify(response.data, null, 2));
      
    } catch (apiError) {
      console.error('   ✗ Erro na API:', apiError.message);
      if (apiError.response) {
        console.error('   - Status:', apiError.response.status);
        console.error('   - Dados:', apiError.response.data);
      }
    }
    
    // 3. Testar API de gravações ativas
    console.log('\n3. Testando API de gravações ativas:');
    try {
      const response = await axios.get('http://localhost:3002/api/recordings/active', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      console.log('   ✓ API de gravações ativas respondeu!');
      console.log('   - Status:', response.status);
      console.log('   - Dados:', JSON.stringify(response.data, null, 2));
      
    } catch (apiError) {
      console.error('   ✗ Erro na API de gravações ativas:', apiError.message);
      if (apiError.response) {
        console.error('   - Status:', apiError.response.status);
        console.error('   - Dados:', apiError.response.data);
      }
    }
    
    // 4. Verificar câmeras do usuário
    console.log('\n4. Verificando câmeras do usuário:');
    const { data: cameras, error: camerasError } = await supabase
      .from('cameras')
      .select('id, name, status')
      .limit(10);
    
    if (camerasError) {
      console.error('   - Erro ao buscar câmeras:', camerasError);
    } else {
      console.log(`   - Total de câmeras: ${cameras.length}`);
      cameras.forEach((camera, index) => {
        console.log(`   - ${index + 1}. ${camera.name} (${camera.id}) - Status: ${camera.status}`);
      });
    }
    
    // 5. Verificar gravações por câmera
    console.log('\n5. Verificando gravações por câmera:');
    if (cameras && cameras.length > 0) {
      for (const camera of cameras.slice(0, 3)) { // Verificar apenas as 3 primeiras
        const { data: recordings, error: recordingsError } = await supabase
          .from('recordings')
          .select('id, status, started_at')
          .eq('camera_id', camera.id)
          .eq('status', 'recording')
          .order('started_at', { ascending: false })
          .limit(5);
        
        if (recordingsError) {
          console.error(`   - Erro ao buscar gravações da câmera ${camera.name}:`, recordingsError);
        } else {
          console.log(`   - Câmera ${camera.name}: ${recordings.length} gravações ativas`);
          recordings.forEach((rec, index) => {
            console.log(`     ${index + 1}. ID: ${rec.id}, Iniciada: ${rec.started_at}`);
          });
        }
      }
    }
    
  } catch (error) {
    console.error('Erro geral no teste:', error);
  }
}

testWithAuth();