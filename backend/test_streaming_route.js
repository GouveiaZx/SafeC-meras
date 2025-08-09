import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const API_BASE = 'http://localhost:3002/api';

async function testStreamingRoute() {
  console.log('🎬 === TESTE DA ROTA DE STREAMING ===\n');
  
  try {
    // 1. Buscar usuário ativo
    console.log('1. 🔐 Buscando usuário ativo...');
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('active', true)
      .limit(1)
      .single();

    if (error || !user) {
      throw new Error('Usuário não encontrado');
    }

    console.log(`   ✅ Usuário encontrado: ${user.email}`);

    // 2. Gerar token JWT válido
    console.log('\n2. 🔑 Gerando token JWT...');
    const token = jwt.sign(
      { 
        userId: user.id,
        email: user.email,
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    console.log(`   ✅ Token gerado: ${token.substring(0, 50)}...`);

    // 3. Testar rota de streaming
    console.log('\n3. 🎥 Testando rota de streaming...');
    const recordingId = '808b1087-209e-42f5-b54e-2816a186aca2';
    const streamUrl = `${API_BASE}/recordings/${recordingId}/stream`;
    
    console.log(`   📡 URL: ${streamUrl}`);
    console.log(`   🔑 Token: Bearer ${token.substring(0, 30)}...`);
    
    try {
      const response = await axios.get(streamUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        timeout: 10000,
        validateStatus: function (status) {
          return status < 500; // Aceitar qualquer status < 500
        }
      });
      
      console.log(`   📊 Status: ${response.status}`);
      console.log(`   📋 Headers:`, response.headers);
      
      if (response.status === 200) {
        console.log('   ✅ SUCESSO: Rota de streaming funcionando!');
        console.log(`   📦 Content-Type: ${response.headers['content-type']}`);
        console.log(`   📏 Content-Length: ${response.headers['content-length']}`);
      } else {
        console.log(`   ❌ ERRO ${response.status}:`, response.data);
      }
      
    } catch (axiosError) {
      console.log(`   ❌ ERRO na requisição:`);
      console.log(`   📊 Status: ${axiosError.response?.status}`);
      console.log(`   📋 Data:`, axiosError.response?.data);
      console.log(`   🔍 Message:`, axiosError.message);
    }

  } catch (error) {
    console.error('❌ Erro geral:', error.message);
  }
}

// Executar teste
testStreamingRoute().catch(console.error);