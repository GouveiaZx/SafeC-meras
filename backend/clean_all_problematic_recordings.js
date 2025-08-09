import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Carregar variáveis de ambiente
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Iniciando limpeza completa de gravações problemáticas...');
console.log('⚠️ ATENÇÃO: Esta operação irá remover TODAS as gravações existentes!');

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
  console.log('SUPABASE_URL:', supabaseUrl ? 'Definida' : 'Não definida');
  console.log('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? 'Definida' : 'Não definida');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Caminhos de diretórios de gravação
const RECORDING_PATHS = [
  path.join(__dirname, 'storage', 'recordings'),
  path.join(__dirname, 'storage', 'www', 'record'),
  path.join(__dirname, 'storage', 'files', 'recordings'),
  path.join(__dirname, 'recordings')
];

/**
 * Função para remover diretório recursivamente
 */
async function removeDirectory(dirPath) {
  try {
    const stats = await fs.stat(dirPath);
    if (stats.isDirectory()) {
      const files = await fs.readdir(dirPath);
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const fileStats = await fs.stat(filePath);
        
        if (fileStats.isDirectory()) {
          await removeDirectory(filePath);
        } else {
          await fs.unlink(filePath);
          console.log(`   🗑️ Arquivo removido: ${filePath}`);
        }
      }
      
      await fs.rmdir(dirPath);
      console.log(`   📁 Diretório removido: ${dirPath}`);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`   ❌ Erro ao remover ${dirPath}:`, error.message);
    }
  }
}

/**
 * Função para limpar arquivos físicos de gravação
 */
async function cleanPhysicalFiles() {
  console.log('\n🧹 Limpando arquivos físicos de gravação...');
  
  for (const recordingPath of RECORDING_PATHS) {
    try {
      const stats = await fs.stat(recordingPath);
      if (stats.isDirectory()) {
        console.log(`\n📂 Limpando diretório: ${recordingPath}`);
        
        const files = await fs.readdir(recordingPath);
        for (const file of files) {
          const filePath = path.join(recordingPath, file);
          await removeDirectory(filePath);
        }
        
        console.log(`✅ Diretório ${recordingPath} limpo`);
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`⚠️ Diretório não existe: ${recordingPath}`);
      } else {
        console.error(`❌ Erro ao acessar ${recordingPath}:`, error.message);
      }
    }
  }
}

/**
 * Função para limpar gravações do banco de dados
 */
async function cleanDatabaseRecordings() {
  console.log('\n🗄️ Limpando gravações do banco de dados...');
  
  try {
    // Buscar todas as gravações
    const { data: recordings, error: fetchError } = await supabase
      .from('recordings')
      .select('*');
    
    if (fetchError) {
      throw fetchError;
    }
    
    console.log(`📊 Encontradas ${recordings?.length || 0} gravações no banco`);
    
    if (recordings && recordings.length > 0) {
      // Deletar todas as gravações
      const { error: deleteError } = await supabase
        .from('recordings')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Deletar todas (condição sempre verdadeira)
      
      if (deleteError) {
        throw deleteError;
      }
      
      console.log(`✅ ${recordings.length} gravações removidas do banco de dados`);
    } else {
      console.log('ℹ️ Nenhuma gravação encontrada no banco de dados');
    }
    
  } catch (error) {
    console.error('❌ Erro ao limpar banco de dados:', error);
    throw error;
  }
}

/**
 * Função para resetar contadores
 */
async function resetCounters() {
  console.log('\n🔄 Resetando contadores...');
  
  try {
    // Verificar se há câmeras e resetar contadores de gravação
    const { data: cameras, error: cameraError } = await supabase
      .from('cameras')
      .select('id');
    
    if (!cameraError && cameras && cameras.length > 0) {
      for (const camera of cameras) {
        await supabase
          .from('cameras')
          .update({
            recording_enabled: false,
            is_recording: false,
            updated_at: new Date().toISOString()
          })
          .eq('id', camera.id);
      }
      
      console.log(`✅ ${cameras.length} câmeras resetadas`);
    }
    
  } catch (error) {
    console.error('⚠️ Erro ao resetar contadores:', error.message);
  }
}

/**
 * Função principal
 */
async function main() {
  try {
    // 1. Limpar banco de dados
    await cleanDatabaseRecordings();
    
    // 2. Limpar arquivos físicos
    await cleanPhysicalFiles();
    
    // 3. Resetar contadores
    await resetCounters();
    
    console.log('\n🎉 Limpeza completa concluída com sucesso!');
    console.log('✅ Sistema pronto para novas gravações sem problemas');
    
  } catch (error) {
    console.error('\n❌ Erro durante a limpeza:', error);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default main;