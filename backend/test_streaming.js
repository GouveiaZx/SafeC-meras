import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
// Node 18+ possui fetch nativo - removido: import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Carregar .env
const envPath = join(__dirname, '.env');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.JWT_SECRET;

if (!supabaseUrl || !supabaseServiceKey || !jwtSecret) {
  console.error('❌ Variáveis de ambiente não configuradas');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testStreamingEndpoint() {
  try {
    console.log('🔍 Testando endpoint de streaming...');
    
    // 1. Buscar uma gravação válida
    const { data: recordings, error } = await supabase
      .from('recordings')
      .select('id, filename, file_path, status, duration, file_size')
      .not('duration', 'is', null)
      .not('file_size', 'is', null)
      .eq('status', 'completed')
      .limit(1);
    
    if (error || !recordings || recordings.length === 0) {
      console.error('❌ Nenhuma gravação válida encontrada:', error);
      return;
    }
    
    const recording = recordings[0];
    console.log('📹 Gravação de teste:', {
      id: recording.id,
      filename: recording.filename,
      duration: recording.duration,
      file_size: recording.file_size
    });
    
    // 2. Buscar um usuário válido
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id, email, role')
      .eq('active', true)
      .limit(1);
    
    if (userError || !users || users.length === 0) {
      console.error('❌ Nenhum usuário válido encontrado:', userError);
      return;
    }
    
    const user = users[0];
    console.log('👤 Usuário de teste:', {
      id: user.id,
      email: user.email,
      role: user.role
    });
    
    // 3. Gerar token JWT
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role
      },
      jwtSecret,
      { expiresIn: '1h' }
    );
    
    console.log('🔑 Token gerado com sucesso');
    
    // 4. Testar endpoint de streaming
    const streamUrl = `http://localhost:3002/api/recordings/${recording.id}/stream?token=${token}`;
    console.log('🌐 URL de teste:', streamUrl);
    
    const response = await fetch(streamUrl, {
      method: 'HEAD', // Usar HEAD para não baixar o arquivo completo
      headers: {
        'Range': 'bytes=0-1023' // Solicitar apenas os primeiros 1KB
      }
    });
    
    console.log('📊 Resposta do servidor:');
    console.log('  Status:', response.status, response.statusText);
    console.log('  Headers:');
    response.headers.forEach((value, key) => {
      console.log(`    ${key}: ${value}`);
    });
    
    if (response.status === 200 || response.status === 206) {
      console.log('✅ Endpoint de streaming funcionando corretamente!');
    } else {
      console.log('❌ Endpoint de streaming com problema');
      
      // Tentar obter o corpo da resposta para mais detalhes
      try {
        const text = await response.text();
        console.log('📄 Corpo da resposta:', text);
      } catch (e) {
        console.log('⚠️ Não foi possível ler o corpo da resposta');
      }
    }
    
  } catch (error) {
    console.error('❌ Erro durante o teste:', error);
  }
}

// Executar teste
if (process.argv[1] === __filename) {
  testStreamingEndpoint()
    .then(() => {
      console.log('\n🏁 Teste concluído');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Erro fatal:', error);
      process.exit(1);
    });
}