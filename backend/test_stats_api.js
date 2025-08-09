import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testStatsAPI() {
  console.log('=== TESTE DA API DE ESTATÍSTICAS ===\n');
  
  try {
    // 1. Verificar gravações ativas diretamente no banco
    console.log('1. Verificando gravações ativas no banco de dados:');
    const { data: activeRecordings, error: activeError } = await supabase
      .from('recordings')
      .select('*')
      .eq('status', 'recording');
    
    if (activeError) {
      console.error('Erro ao buscar gravações ativas:', activeError);
    } else {
      console.log(`   - Gravações com status 'recording': ${activeRecordings.length}`);
      if (activeRecordings.length > 0) {
        console.log('   - IDs das gravações ativas:', activeRecordings.map(r => r.id));
        console.log('   - Câmeras das gravações ativas:', activeRecordings.map(r => r.camera_id));
      }
    }
    
    // 2. Testar a API de estatísticas
    console.log('\n2. Testando API de estatísticas:');
    try {
      const response = await axios.get('http://localhost:3001/api/recordings/stats', {
        headers: {
          'Authorization': 'Bearer test-token' // Pode precisar de um token válido
        }
      });
      
      console.log('   - Status da resposta:', response.status);
      console.log('   - Dados retornados:', JSON.stringify(response.data, null, 2));
      
      if (response.data.data) {
        console.log(`   - Gravações ativas na API: ${response.data.data.activeRecordings || 0}`);
        console.log(`   - Total de gravações na API: ${response.data.data.totalRecordings || 0}`);
      }
      
    } catch (apiError) {
      console.error('   - Erro na API:', apiError.message);
      if (apiError.response) {
        console.error('   - Status:', apiError.response.status);
        console.error('   - Dados:', apiError.response.data);
      }
    }
    
    // 3. Verificar todas as gravações por status
    console.log('\n3. Contagem de gravações por status:');
    const { data: allRecordings, error: allError } = await supabase
      .from('recordings')
      .select('status');
    
    if (allError) {
      console.error('Erro ao buscar todas as gravações:', allError);
    } else {
      const statusCount = allRecordings.reduce((acc, recording) => {
        acc[recording.status] = (acc[recording.status] || 0) + 1;
        return acc;
      }, {});
      
      Object.entries(statusCount).forEach(([status, count]) => {
        console.log(`   - ${status}: ${count}`);
      });
    }
    
    // 4. Verificar se há problemas com user_id
    console.log('\n4. Verificando filtros por user_id:');
    const { data: usersData, error: usersError } = await supabase
      .from('recordings')
      .select('user_id')
      .not('user_id', 'is', null);
    
    if (usersError) {
      console.error('Erro ao buscar user_ids:', usersError);
    } else {
      const uniqueUsers = [...new Set(usersData.map(r => r.user_id))];
      console.log(`   - Usuários únicos nas gravações: ${uniqueUsers.length}`);
      console.log(`   - IDs dos usuários: ${uniqueUsers.join(', ')}`);
    }
    
  } catch (error) {
    console.error('Erro geral no teste:', error);
  }
}

testStatsAPI();