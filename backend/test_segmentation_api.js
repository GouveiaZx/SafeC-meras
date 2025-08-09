/**
 * Script para testar a API de segmentação com autenticação válida
 */

import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.JWT_SECRET;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testSegmentationAPI() {
  console.log('🔍 Testando API de Segmentação...');
  
  try {
    // 1. Buscar um usuário ativo para gerar token
    console.log('\n1. Buscando usuário ativo...');
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
      .eq('active', true)
      .limit(1);
    
    if (usersError || !users || users.length === 0) {
      console.error('❌ Erro ao buscar usuário:', usersError);
      return;
    }
    
    const user = users[0];
    console.log(`✅ Usuário encontrado: ${user.name} (${user.email})`);
    
    // 2. Gerar token JWT
    console.log('\n2. Gerando token JWT...');
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role
      },
      jwtSecret,
      { expiresIn: '1h' }
    );
    
    console.log('✅ Token gerado com sucesso');
    
    // 3. Testar status da segmentação
    console.log('\n3. Testando status da segmentação...');
    try {
      const statusResponse = await axios.get('http://localhost:3002/api/segmentation/status', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      });
      
      console.log('✅ Status da segmentação:');
      console.log('   - Status:', statusResponse.status);
      console.log('   - Dados:', JSON.stringify(statusResponse.data, null, 2));
      
    } catch (statusError) {
      console.error('❌ Erro no status da segmentação:', statusError.message);
      if (statusError.response) {
        console.error('   - Status:', statusError.response.status);
        console.error('   - Dados:', statusError.response.data);
      }
    }
    
    // 4. Testar streams ativas
    console.log('\n4. Testando streams ativas...');
    try {
      const streamsResponse = await axios.get('http://localhost:3002/api/segmentation/streams', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      });
      
      console.log('✅ Streams ativas:');
      console.log('   - Status:', streamsResponse.status);
      console.log('   - Dados:', JSON.stringify(streamsResponse.data, null, 2));
      
    } catch (streamsError) {
      console.error('❌ Erro nas streams ativas:', streamsError.message);
      if (streamsError.response) {
        console.error('   - Status:', streamsError.response.status);
        console.error('   - Dados:', streamsError.response.data);
      }
    }
    
    // 5. Testar segmentação forçada
    console.log('\n5. Testando segmentação forçada...');
    try {
      const forceResponse = await axios.post('http://localhost:3002/api/segmentation/force', {}, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      console.log('✅ Segmentação forçada executada:');
      console.log('   - Status:', forceResponse.status);
      console.log('   - Dados:', JSON.stringify(forceResponse.data, null, 2));
      
    } catch (forceError) {
      console.error('❌ Erro na segmentação forçada:', forceError.message);
      if (forceError.response) {
        console.error('   - Status:', forceError.response.status);
        console.error('   - Dados:', forceError.response.data);
      }
    }
    
    // 6. Testar health check da segmentação
    console.log('\n6. Testando health check da segmentação...');
    try {
      const healthResponse = await axios.get('http://localhost:3002/api/segmentation/health', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      });
      
      console.log('✅ Health check da segmentação:');
      console.log('   - Status:', healthResponse.status);
      console.log('   - Dados:', JSON.stringify(healthResponse.data, null, 2));
      
    } catch (healthError) {
      console.error('❌ Erro no health check da segmentação:', healthError.message);
      if (healthError.response) {
        console.error('   - Status:', healthError.response.status);
        console.error('   - Dados:', healthError.response.data);
      }
    }
    
  } catch (error) {
    console.error('❌ Erro geral no teste:', error);
  }
}

// Executar teste
testSegmentationAPI();