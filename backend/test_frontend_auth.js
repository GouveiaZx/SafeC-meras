import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis de ambiente do Supabase não encontradas');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testFrontendAuth() {
  console.log('🔍 Testando autenticação do frontend...');
  
  try {
    // 1. Buscar um usuário ativo para simular login
    console.log('\n1. Buscando usuário ativo...');
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
      .eq('active', true)
      .limit(1);
    
    if (usersError) {
      console.error('❌ Erro ao buscar usuários:', usersError);
      return;
    }
    
    if (!users || users.length === 0) {
      console.log('❌ Nenhum usuário ativo encontrado');
      return;
    }
    
    const user = users[0];
    console.log(`✅ Usuário encontrado: ${user.name} (${user.email})`);
    
    // 2. Simular login criando token JWT
    console.log('\n2. Criando token JWT...');
    const jwt = await import('jsonwebtoken');
    
    const token = jwt.default.sign(
      { 
        userId: user.id, 
        email: user.email,
        role: user.role || 'admin'
      }, 
      process.env.JWT_SECRET, 
      { expiresIn: '1h' }
    );
    
    console.log('✅ Token criado com sucesso');
    console.log('Token:', token.substring(0, 50) + '...');
    
    // 3. Testar chamadas autenticadas
    console.log('\n3. Testando chamadas autenticadas...');
    
    const baseUrl = 'http://localhost:3002';
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    
    // Testar /api/recordings/stats
    console.log('\n📊 Testando /api/recordings/stats...');
    try {
      const statsResponse = await fetch(`${baseUrl}/api/recordings/stats`, {
        method: 'GET',
        headers
      });
      
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        console.log('✅ Stats obtidas com sucesso:');
        console.log(`   - Total de gravações: ${statsData.data?.total || 0}`);
        console.log(`   - Gravações ativas: ${statsData.data?.active || 0}`);
        console.log(`   - Gravações completadas: ${statsData.data?.completed || 0}`);
      } else {
        const errorText = await statsResponse.text();
        console.log(`❌ Erro nas stats (${statsResponse.status}):`, errorText);
      }
    } catch (error) {
      console.error('❌ Erro na requisição de stats:', error.message);
    }
    
    // Testar /api/recordings/active
    console.log('\n🎥 Testando /api/recordings/active...');
    try {
      const activeResponse = await fetch(`${baseUrl}/api/recordings/active`, {
        method: 'GET',
        headers
      });
      
      if (activeResponse.ok) {
        const activeData = await activeResponse.json();
        console.log('✅ Gravações ativas obtidas com sucesso:');
        console.log(`   - Total: ${activeData.data?.length || 0}`);
        if (activeData.data && activeData.data.length > 0) {
          activeData.data.forEach((recording, index) => {
            console.log(`   ${index + 1}. ${recording.id} - Câmera: ${recording.camera_id} - Iniciada: ${recording.start_time}`);
          });
        }
      } else {
        const errorText = await activeResponse.text();
        console.log(`❌ Erro nas gravações ativas (${activeResponse.status}):`, errorText);
      }
    } catch (error) {
      console.error('❌ Erro na requisição de gravações ativas:', error.message);
    }
    
    // 4. Testar via proxy do frontend
    console.log('\n🌐 Testando via proxy do frontend (localhost:5173)...');
    try {
      const proxyResponse = await fetch('http://localhost:5173/api/recordings/stats', {
        method: 'GET',
        headers
      });
      
      if (proxyResponse.ok) {
        const proxyData = await proxyResponse.json();
        console.log('✅ Proxy funcionando - Stats via frontend:');
        console.log(`   - Total de gravações: ${proxyData.data?.total || 0}`);
        console.log(`   - Gravações ativas: ${proxyData.data?.active || 0}`);
      } else {
        const errorText = await proxyResponse.text();
        console.log(`❌ Erro no proxy (${proxyResponse.status}):`, errorText);
      }
    } catch (error) {
      console.error('❌ Erro na requisição via proxy:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
}

testFrontendAuth();