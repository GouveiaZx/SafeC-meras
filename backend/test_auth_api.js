import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testAuthAPI() {
  console.log('=== TESTE DA API COM AUTENTICAÇÃO ===\n');
  
  try {
    // 1. Verificar se há usuários no sistema
    console.log('1. Verificando usuários no sistema:');
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, role')
      .limit(5);
    
    if (usersError) {
      console.error('Erro ao buscar usuários:', usersError);
    } else {
      console.log(`   - Total de usuários encontrados: ${users.length}`);
      users.forEach((user, index) => {
        console.log(`   - ${index + 1}. ID: ${user.id}, Email: ${user.email}, Role: ${user.role}`);
      });
    }
    
    // 2. Verificar se há câmeras no sistema
    console.log('\n2. Verificando câmeras no sistema:');
    const { data: cameras, error: camerasError } = await supabase
      .from('cameras')
      .select('id, name, created_by')
      .limit(5);
    
    if (camerasError) {
      console.error('Erro ao buscar câmeras:', camerasError);
    } else {
      console.log(`   - Total de câmeras encontradas: ${cameras.length}`);
      cameras.forEach((camera, index) => {
        console.log(`   - ${index + 1}. ID: ${camera.id}, Nome: ${camera.name}, Criada por: ${camera.created_by}`);
      });
    }
    
    // 3. Testar API sem autenticação
    console.log('\n3. Testando API de estatísticas sem autenticação:');
    try {
      const response = await axios.get('http://localhost:3001/api/recordings/stats', {
        timeout: 5000
      });
      
      console.log('   - Status da resposta:', response.status);
      console.log('   - Dados retornados:', JSON.stringify(response.data, null, 2));
      
    } catch (apiError) {
      console.error('   - Erro na API:', apiError.message);
      if (apiError.response) {
        console.error('   - Status:', apiError.response.status);
        console.error('   - Dados:', apiError.response.data);
      }
    }
    
    // 4. Testar API com token fake
    console.log('\n4. Testando API de estatísticas com token fake:');
    try {
      const response = await axios.get('http://localhost:3001/api/recordings/stats', {
        headers: {
          'Authorization': 'Bearer fake-token'
        },
        timeout: 5000
      });
      
      console.log('   - Status da resposta:', response.status);
      console.log('   - Dados retornados:', JSON.stringify(response.data, null, 2));
      
    } catch (apiError) {
      console.error('   - Erro na API:', apiError.message);
      if (apiError.response) {
        console.error('   - Status:', apiError.response.status);
        console.error('   - Dados:', apiError.response.data);
      }
    }
    
    // 5. Verificar se o servidor está rodando
    console.log('\n5. Verificando se o servidor está rodando:');
    try {
      const response = await axios.get('http://localhost:3001/api/health', {
        timeout: 5000
      });
      
      console.log('   - Servidor está rodando!');
      console.log('   - Status:', response.status);
      
    } catch (healthError) {
      console.error('   - Erro ao verificar saúde do servidor:', healthError.message);
      
      // Tentar uma rota mais básica
      try {
        const basicResponse = await axios.get('http://localhost:3001/', {
          timeout: 5000
        });
        console.log('   - Servidor responde na rota raiz');
      } catch (basicError) {
        console.error('   - Servidor não está respondendo:', basicError.message);
      }
    }
    
  } catch (error) {
    console.error('Erro geral no teste:', error);
  }
}

testAuthAPI();