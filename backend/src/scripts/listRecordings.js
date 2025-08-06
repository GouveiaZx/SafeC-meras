import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Definir __filename e __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Carregar .env do diretório raiz
const rootEnvPath = 'C:\\Users\\GouveiaRx\\Downloads\\NewCAM\\.env';
console.log('Carregando .env de:', rootEnvPath);

const result = dotenv.config({ path: rootEnvPath });

if (result.error) {
  console.error('Erro ao carregar .env:', result.error);
  process.exit(1);
} else {
  console.log('✅ .env carregado com sucesso!');
}

// Configurar Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis de ambiente do Supabase não encontradas');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Função para listar gravações
 */
async function listRecordings() {
  try {
    console.log('🔍 Buscando gravações no banco de dados...');
    
    const { data, error } = await supabase
      .from('recordings')
      .select(`
        id,
        filename,
        file_path,
        file_size,
        duration,
        start_time,
        end_time,
        status,
        created_at,
        cameras:camera_id (id, name)
      `)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (error) {
      throw error;
    }
    
    if (!data || data.length === 0) {
      console.log('📭 Nenhuma gravação encontrada no banco de dados');
      return;
    }
    
    console.log(`\n📹 Encontradas ${data.length} gravações:`);
    console.log('=' .repeat(80));
    
    data.forEach((recording, index) => {
      console.log(`\n${index + 1}. ID: ${recording.id}`);
      console.log(`   Arquivo: ${recording.filename}`);
      console.log(`   Caminho: ${recording.file_path}`);
      console.log(`   Tamanho: ${(recording.file_size / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   Duração: ${recording.duration} segundos`);
      console.log(`   Status: ${recording.status}`);
      console.log(`   Câmera: ${recording.cameras?.name || 'N/A'}`);
      console.log(`   Criado em: ${new Date(recording.created_at).toLocaleString('pt-BR')}`);
      console.log(`   URL de teste: http://localhost:3002/api/recordings/${recording.id}/video`);
    });
    
    console.log('\n' + '=' .repeat(80));
    
    // Testar o primeiro registro
    if (data.length > 0) {
      const firstRecording = data[0];
      console.log(`\n🧪 Testando acesso ao primeiro vídeo...`);
      console.log(`📋 ID: ${firstRecording.id}`);
      console.log(`📁 Arquivo: ${firstRecording.filename}`);
      console.log(`🔗 URL: http://localhost:3002/api/recordings/${firstRecording.id}/video`);
    }
    
  } catch (error) {
    console.error('❌ Erro ao listar gravações:', error);
  }
}

// Executar listagem
listRecordings().then(() => {
  console.log('\n🏁 Script de listagem finalizado');
  process.exit(0);
}).catch((error) => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});