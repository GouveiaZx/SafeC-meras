const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

// Configuração
const BACKEND_URL = 'http://localhost:3002';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://grkvfzuadctextnbpajb.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY não encontrada');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkCurrentRecordings() {
  console.log('🔍 Verificando gravações atuais no banco...');
  
  try {
    // Buscar todas as gravações
    const { data: recordings, error } = await supabase
      .from('recordings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (error) {
      console.error('❌ Erro ao buscar gravações:', error);
      return;
    }
    
    console.log(`📊 Total de gravações encontradas: ${recordings.length}`);
    
    if (recordings.length === 0) {
      console.log('⚠️ Nenhuma gravação encontrada no banco.');
      return;
    }
    
    console.log('\n📋 Gravações encontradas:');
    recordings.forEach((rec, index) => {
      console.log(`${index + 1}. ${rec.filename} (${rec.id})`);
      console.log(`   Status: ${rec.status} | Tamanho: ${rec.file_size} bytes | Duração: ${rec.duration}s`);
      console.log(`   Criada: ${rec.created_at}`);
      console.log(`   Caminho: ${rec.file_path}`);
      console.log('');
    });
    
    // Testar a primeira gravação
    if (recordings.length > 0) {
      const testRecording = recordings[0];
      console.log(`🧪 Testando gravação: ${testRecording.filename} (${testRecording.id})`);
      
      // Fazer login primeiro
      console.log('\n🔐 Fazendo login...');
      
      const users = [
        { email: 'admin@newcam.com', password: 'admin123' },
        { email: 'rodrigo@safecameras.com.br', password: 'rodrigo123' }
      ];
      
      let token = null;
      
      for (const user of users) {
        try {
          const loginResponse = await axios.post(`${BACKEND_URL}/api/auth/login`, user);
          
          if (loginResponse.data && (loginResponse.data.accessToken || loginResponse.data.tokens?.accessToken)) {
            token = loginResponse.data.accessToken || loginResponse.data.tokens.accessToken;
            console.log(`✅ Login bem-sucedido com ${user.email}`);
            break;
          }
        } catch (loginError) {
          console.log(`❌ Falha no login com ${user.email}: ${loginError.response?.status}`);
        }
      }
      
      if (!token) {
        console.error('❌ Não foi possível fazer login com nenhum usuário');
        return;
      }
      
      // Testar rota de streaming
      console.log('\n🎥 Testando rota de streaming...');
      
      try {
        const streamResponse = await axios.get(
          `${BACKEND_URL}/api/recordings/${testRecording.id}/stream`,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            },
            timeout: 10000,
            maxRedirects: 0,
            validateStatus: function (status) {
              return status < 500; // Aceitar todos os códigos < 500
            }
          }
        );
        
        console.log('✅ Resposta da rota de streaming:', {
          status: streamResponse.status,
          statusText: streamResponse.statusText,
          headers: {
            'content-type': streamResponse.headers['content-type'],
            'content-length': streamResponse.headers['content-length']
          }
        });
        
        if (streamResponse.status === 200 && streamResponse.headers['content-type']?.includes('video')) {
          console.log('🎉 SUCESSO: Rota de streaming funcionando!');
        } else {
          console.log('⚠️ Rota respondeu mas pode ter problemas:', streamResponse.status);
        }
        
      } catch (streamError) {
        console.error('❌ Erro na rota de streaming:', {
          status: streamError.response?.status,
          statusText: streamError.response?.statusText,
          data: streamError.response?.data
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
}

// Executar verificação
checkCurrentRecordings().catch(console.error);