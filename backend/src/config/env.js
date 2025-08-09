// Carregar variáveis de ambiente PRIMEIRO
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

// Definir __filename e __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Carregar .env do diretório raiz primeiro (onde estão as credenciais reais)
const rootEnvPath = 'C:\\Users\\GouveiaRx\\Downloads\\NewCAM\\.env';
console.log('Carregando .env de:', rootEnvPath);

const result = dotenv.config({ path: rootEnvPath });

if (result.error) {
  console.error('Erro ao carregar .env:', result.error);
} else {
  console.log('✅ .env carregado com sucesso!');
  console.log('📊 Variáveis carregadas:', Object.keys(result.parsed || {}).length);
}

// Carregar .env.local depois para sobrescrever configurações locais
const localEnvPath = 'C:\\Users\\GouveiaRx\\Downloads\\NewCAM\\.env.local';
if (fs.existsSync(localEnvPath)) {
  console.log('Carregando .env.local de:', localEnvPath);
  const localResult = dotenv.config({ path: localEnvPath, override: true });
  if (localResult.error) {
    console.error('Erro ao carregar .env.local:', localResult.error);
  } else {
    console.log('✅ .env.local carregado com sucesso!');
    console.log('📊 Variáveis locais carregadas:', Object.keys(localResult.parsed || {}).length);
    console.log('🔧 Variáveis sobrescritas para desenvolvimento local');
    console.log('🔍 WS_PORT:', process.env.WS_PORT);
    console.log('🔍 REDIS_URL:', process.env.REDIS_URL);
    console.log('🔍 REDIS_HOST:', process.env.REDIS_HOST);
  }
} else {
  console.log('❌ .env.local não encontrado em:', localEnvPath);
}

// Log final das variáveis importantes
console.log('🔍 Variáveis finais:');
console.log('  WS_PORT:', process.env.WS_PORT);
console.log('  REDIS_URL:', process.env.REDIS_URL);
console.log('  REDIS_HOST:', process.env.REDIS_HOST);
console.log('  ZLM_BASE_URL:', process.env.ZLM_BASE_URL);
console.log('  ZLM_API_URL:', process.env.ZLM_API_URL);
console.log('  ZLMEDIAKIT_API_URL:', process.env.ZLMEDIAKIT_API_URL);
console.log('  ZLM_SECRET:', process.env.ZLM_SECRET);
console.log('  STREAMING_SERVER:', process.env.STREAMING_SERVER);
console.log('  BACKEND_BASE_URL:', process.env.BACKEND_BASE_URL);

export default true;