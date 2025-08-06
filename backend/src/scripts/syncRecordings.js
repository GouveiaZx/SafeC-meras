import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

console.log('🚀 Script iniciado!');
console.log('📍 Arquivo atual:', import.meta.url);
console.log('📍 Processo argv[1]:', process.argv[1]);

// Configuração do Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Caminhos dos diretórios
const REAL_RECORDINGS_PATH = path.join(__dirname, '../../../storage/www/record/live');
const RECORDINGS_BASE_PATH = path.join(__dirname, '../../../storage/recordings');

async function findAllMP4Files(dir) {
  const files = [];
  
  try {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        const subFiles = await findAllMP4Files(fullPath);
        files.push(...subFiles);
      } else if (item.endsWith('.mp4')) {
        const stats = fs.statSync(fullPath);
        files.push({
          fullPath,
          relativePath: path.relative(REAL_RECORDINGS_PATH, fullPath),
          filename: item,
          size: stats.size,
          lastModified: stats.mtime,
          cameraId: extractCameraIdFromPath(fullPath)
        });
      }
    }
  } catch (error) {
    console.error(`Erro ao ler diretório ${dir}:`, error.message);
  }
  
  return files;
}

function extractCameraIdFromPath(filePath) {
  // Extrai o camera_id do caminho: /live/{camera_id}/data/arquivo.mp4
  const parts = filePath.split(path.sep);
  const liveIndex = parts.findIndex(part => part === 'live');
  
  if (liveIndex !== -1 && liveIndex + 1 < parts.length) {
    return parts[liveIndex + 1];
  }
  
  return null;
}

async function getRecordingsFromDB() {
  try {
    const { data, error } = await supabase
      .from('recordings')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      throw error;
    }
    
    return data || [];
  } catch (error) {
    console.error('Erro ao buscar gravações do banco:', error.message);
    return [];
  }
}

async function updateRecordingPath(recordingId, newFilePath, fileSize) {
  try {
    const { error } = await supabase
      .from('recordings')
      .update({
        file_path: newFilePath,
        file_size: fileSize,
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', recordingId);
    
    if (error) {
      throw error;
    }
    
    console.log(`✅ Atualizado registro ${recordingId} com caminho: ${newFilePath}`);
    return true;
  } catch (error) {
    console.error(`❌ Erro ao atualizar registro ${recordingId}:`, error.message);
    return false;
  }
}

async function createMissingRecording(file) {
  try {
    // Busca a câmera pelo ID
    const { data: camera } = await supabase
      .from('cameras')
      .select('id')
      .eq('id', file.cameraId)
      .single();
    
    if (!camera) {
      console.log(`⚠️  Câmera ${file.cameraId} não encontrada para arquivo ${file.filename}`);
      return false;
    }
    
    const { error } = await supabase
      .from('recordings')
      .insert({
        camera_id: file.cameraId,
        filename: file.filename,
        file_path: file.relativePath,
        file_size: file.size,
        start_time: file.lastModified,
        status: 'completed',
        upload_status: 'pending'
      });
    
    if (error) {
      throw error;
    }
    
    console.log(`✅ Criado novo registro para: ${file.filename}`);
    return true;
  } catch (error) {
    console.error(`❌ Erro ao criar registro para ${file.filename}:`, error.message);
    return false;
  }
}

async function syncRecordings() {
  console.log('🔄 Iniciando sincronização de gravações...');
  console.log('📁 Caminho base:', REAL_RECORDINGS_PATH);
  console.log('🔧 Verificando se o diretório existe:', fs.existsSync(REAL_RECORDINGS_PATH));
  
  // 1. Buscar todos os arquivos MP4 reais
  console.log('📁 Buscando arquivos MP4 no sistema de arquivos...');
  const realFiles = await findAllMP4Files(REAL_RECORDINGS_PATH);
  console.log(`📊 Encontrados ${realFiles.length} arquivos MP4`);
  
  // 2. Buscar todos os registros do banco
  console.log('🗄️  Buscando registros do banco de dados...');
  const dbRecordings = await getRecordingsFromDB();
  console.log(`📊 Encontrados ${dbRecordings.length} registros no banco`);
  
  // 3. Mapear arquivos por nome
  const filesByName = new Map();
  realFiles.forEach(file => {
    filesByName.set(file.filename, file);
  });
  
  // 4. Atualizar registros existentes com caminhos incorretos
  let updatedCount = 0;
  let createdCount = 0;
  
  for (const recording of dbRecordings) {
    const realFile = filesByName.get(recording.filename);
    
    if (realFile) {
      // Arquivo existe, verificar se o caminho está correto
      const correctPath = `record/live/${realFile.relativePath}`;
      
      if (recording.file_path !== correctPath || !recording.file_size) {
        const success = await updateRecordingPath(
          recording.id,
          correctPath,
          realFile.size
        );
        
        if (success) {
          updatedCount++;
        }
      }
      
      // Remover da lista para não criar duplicata
      filesByName.delete(recording.filename);
    } else {
      console.log(`⚠️  Arquivo não encontrado para registro: ${recording.filename}`);
    }
  }
  
  // 5. Criar registros para arquivos sem registro no banco
  for (const [filename, file] of filesByName) {
    if (file.cameraId) {
      const success = await createMissingRecording(file);
      if (success) {
        createdCount++;
      }
    } else {
      console.log(`⚠️  Não foi possível extrair camera_id de: ${filename}`);
    }
  }
  
  console.log('\n📊 Resumo da sincronização:');
  console.log(`✅ Registros atualizados: ${updatedCount}`);
  console.log(`✅ Novos registros criados: ${createdCount}`);
  console.log(`📁 Total de arquivos encontrados: ${realFiles.length}`);
  console.log(`🗄️  Total de registros no banco: ${dbRecordings.length}`);
  
  console.log('\n🎉 Sincronização concluída!');
}

// Executar função principal
console.log('✅ Executando função principal...');
syncRecordings().catch(console.error);

export { syncRecordings };