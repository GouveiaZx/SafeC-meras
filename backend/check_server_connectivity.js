import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkServerConnectivity() {
  console.log('=== VERIFICAÇÃO DE CONECTIVIDADE DO SERVIDOR ===\n');
  
  try {
    // 1. Verificar estrutura da tabela cameras
    console.log('1. Verificando estrutura da tabela cameras:');
    const { data: camerasStructure, error: structureError } = await supabase
      .rpc('get_table_columns', { table_name: 'cameras' })
      .single();
    
    if (structureError) {
      console.log('   - Usando método alternativo para verificar colunas...');
      const { data: cameras, error: camerasError } = await supabase
        .from('cameras')
        .select('*')
        .limit(1);
      
      if (camerasError) {
        console.error('   - Erro ao buscar cameras:', camerasError);
      } else if (cameras && cameras.length > 0) {
        console.log('   - Colunas disponíveis na tabela cameras:');
        Object.keys(cameras[0]).forEach(column => {
          console.log(`     * ${column}`);
        });
      } else {
        console.log('   - Nenhuma câmera encontrada para verificar estrutura');
      }
    } else {
      console.log('   - Estrutura da tabela:', camerasStructure);
    }
    
    // 2. Verificar gravações com status recording
    console.log('\n2. Verificando gravações com status "recording":');
    const { data: activeRecordings, error: activeError } = await supabase
      .from('recordings')
      .select('*')
      .eq('status', 'recording')
      .order('started_at', { ascending: false })
      .limit(10);
    
    if (activeError) {
      console.error('   - Erro ao buscar gravações ativas:', activeError);
    } else {
      console.log(`   - Total de gravações com status 'recording': ${activeRecordings.length}`);
      activeRecordings.forEach((recording, index) => {
        console.log(`   - ${index + 1}. ID: ${recording.id}, Camera: ${recording.camera_id}, Iniciada: ${recording.started_at}`);
      });
    }
    
    // 3. Verificar todas as gravações recentes
    console.log('\n3. Verificando todas as gravações recentes:');
    const { data: recentRecordings, error: recentError } = await supabase
      .from('recordings')
      .select('id, camera_id, status, started_at, stopped_at')
      .order('started_at', { ascending: false })
      .limit(10);
    
    if (recentError) {
      console.error('   - Erro ao buscar gravações recentes:', recentError);
    } else {
      console.log(`   - Total de gravações recentes: ${recentRecordings.length}`);
      recentRecordings.forEach((recording, index) => {
        const duration = recording.stopped_at ? 
          Math.round((new Date(recording.stopped_at) - new Date(recording.started_at)) / 1000) : 
          'Em andamento';
        console.log(`   - ${index + 1}. Status: ${recording.status}, Camera: ${recording.camera_id}, Duração: ${duration}s`);
      });
    }
    
    // 4. Testar diferentes portas do servidor
    console.log('\n4. Testando conectividade do servidor:');
    const ports = [3001, 3000, 8000, 5000];
    
    for (const port of ports) {
      try {
        console.log(`   - Testando porta ${port}...`);
        const response = await axios.get(`http://localhost:${port}/api/health`, {
          timeout: 3000
        });
        console.log(`   ✓ Servidor respondeu na porta ${port} - Status: ${response.status}`);
        
        // Testar rota de recordings
        try {
          const recordingsResponse = await axios.get(`http://localhost:${port}/api/recordings/stats`, {
            timeout: 3000
          });
          console.log(`   ✓ API de recordings respondeu na porta ${port}`);
        } catch (recordingsError) {
          console.log(`   - API de recordings falhou na porta ${port}: ${recordingsError.message}`);
        }
        
        break; // Se encontrou um servidor funcionando, para de testar
        
      } catch (error) {
        console.log(`   ✗ Porta ${port} não está respondendo`);
      }
    }
    
    // 5. Verificar variáveis de ambiente
    console.log('\n5. Verificando variáveis de ambiente:');
    console.log(`   - SUPABASE_URL: ${process.env.SUPABASE_URL ? 'Definida' : 'Não definida'}`);
    console.log(`   - SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Definida' : 'Não definida'}`);
    console.log(`   - SUPABASE_ANON_KEY: ${process.env.SUPABASE_ANON_KEY ? 'Definida' : 'Não definida'}`);
    console.log(`   - PORT: ${process.env.PORT || 'Não definida (padrão: 3001)'}`);
    
  } catch (error) {
    console.error('Erro geral na verificação:', error);
  }
}

checkServerConnectivity();