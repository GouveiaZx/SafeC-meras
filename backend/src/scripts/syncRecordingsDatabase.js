import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import path from 'path';
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

// Caminho dos arquivos de gravação
const RECORDINGS_PATH = 'C:\\Users\\GouveiaRx\\Downloads\\NewCAM\\storage\\www\\record\\live';

/**
 * Função para extrair informações do nome do arquivo
 * Formato esperado: YYYY-MM-DD-HH-mm-ss-N.mp4
 */
function parseFilename(filename) {
  const match = filename.match(/(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d+)\.mp4$/);
  if (!match) {
    return null;
  }
  
  const [, year, month, day, hour, minute, second, sequence] = match;
  const startTime = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
  
  return {
    startTime,
    sequence: parseInt(sequence),
    originalName: filename
  };
}

/**
 * Função para obter informações do arquivo
 */
async function getFileInfo(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return {
      size: stats.size,
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime
    };
  } catch (error) {
    console.error(`Erro ao obter informações do arquivo ${filePath}:`, error);
    return null;
  }
}

/**
 * Função para buscar câmeras existentes
 */
async function getCameras() {
  try {
    const { data, error } = await supabase
      .from('cameras')
      .select('id, name');
    
    if (error) {
      throw error;
    }
    
    return data || [];
  } catch (error) {
    console.error('Erro ao buscar câmeras:', error);
    return [];
  }
}

/**
 * Função para verificar se uma gravação já existe
 */
async function recordingExists(filename) {
  try {
    const { data, error } = await supabase
      .from('recordings')
      .select('id')
      .eq('filename', filename)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    
    return !!data;
  } catch (error) {
    console.error(`Erro ao verificar gravação ${filename}:`, error);
    return false;
  }
}

/**
 * Função para criar registro de gravação no banco
 */
async function createRecordingRecord(cameraId, filename, filePath, fileInfo, parseInfo) {
  try {
    const recordingData = {
      camera_id: cameraId,
      filename: filename,
      file_path: filePath,
      file_size: fileInfo.size,
      duration: 1800, // 30 minutos padrão (pode ser ajustado)
      start_time: parseInfo ? parseInfo.startTime.toISOString() : fileInfo.createdAt.toISOString(),
      end_time: parseInfo 
        ? new Date(parseInfo.startTime.getTime() + 30 * 60 * 1000).toISOString() 
        : new Date(fileInfo.createdAt.getTime() + 30 * 60 * 1000).toISOString(),
      status: 'completed',
      quality: 'medium',
      created_at: fileInfo.createdAt.toISOString(),
      updated_at: fileInfo.modifiedAt.toISOString()
    };
    
    const { data, error } = await supabase
      .from('recordings')
      .insert([recordingData])
      .select()
      .single();
    
    if (error) {
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error(`Erro ao criar registro de gravação para ${filename}:`, error);
    return null;
  }
}

/**
 * Função principal para sincronizar arquivos
 */
async function syncRecordings() {
  console.log('🔄 Iniciando sincronização de gravações...');
  
  try {
    // Buscar câmeras existentes
    const cameras = await getCameras();
    console.log(`📹 Encontradas ${cameras.length} câmeras no banco de dados`);
    
    if (cameras.length === 0) {
      console.log('⚠️ Nenhuma câmera encontrada. Criando câmera padrão...');
      
      // Criar câmera padrão se não existir nenhuma
      const { data: defaultCamera, error } = await supabase
        .from('cameras')
        .insert([{
          name: 'Câmera Padrão',
          ip: '192.168.1.100',
          port: 554,
          username: 'admin',
          password: 'admin',
          stream_url: 'rtsp://192.168.1.100:554/stream',
          status: 'active',
          location: 'Localização Padrão'
        }])
        .select()
        .single();
      
      if (error) {
        console.error('Erro ao criar câmera padrão:', error);
        return;
      }
      
      cameras.push(defaultCamera);
      console.log('✅ Câmera padrão criada');
    }
    
    // Verificar se o diretório de gravações existe
    try {
      await fs.access(RECORDINGS_PATH);
    } catch (error) {
      console.error(`❌ Diretório de gravações não encontrado: ${RECORDINGS_PATH}`);
      return;
    }
    
    // Buscar todos os arquivos MP4 recursivamente
    const allFiles = [];
    
    async function scanDirectory(dirPath) {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          
          if (entry.isDirectory()) {
            await scanDirectory(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.mp4')) {
            allFiles.push({
              filename: entry.name,
              fullPath: fullPath,
              relativePath: path.relative(RECORDINGS_PATH, fullPath)
            });
          }
        }
      } catch (error) {
        console.error(`Erro ao escanear diretório ${dirPath}:`, error);
      }
    }
    
    await scanDirectory(RECORDINGS_PATH);
    console.log(`📁 Encontrados ${allFiles.length} arquivos MP4`);
    
    if (allFiles.length === 0) {
      console.log('ℹ️ Nenhum arquivo MP4 encontrado para sincronizar');
      return;
    }
    
    let syncedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    // Processar cada arquivo
    for (const file of allFiles) {
      console.log(`\n🔍 Processando: ${file.filename}`);
      
      // Verificar se já existe no banco
      const exists = await recordingExists(file.filename);
      if (exists) {
        console.log(`⏭️ Gravação já existe no banco: ${file.filename}`);
        skippedCount++;
        continue;
      }
      
      // Obter informações do arquivo
      const fileInfo = await getFileInfo(file.fullPath);
      if (!fileInfo) {
        console.log(`❌ Erro ao obter informações do arquivo: ${file.filename}`);
        errorCount++;
        continue;
      }
      
      // Tentar extrair informações do nome do arquivo
      const parseInfo = parseFilename(file.filename);
      
      // Determinar qual câmera usar (primeira câmera por padrão)
      const camera = cameras[0];
      
      // Criar registro no banco
      const recording = await createRecordingRecord(
        camera.id,
        file.filename,
        file.relativePath,
        fileInfo,
        parseInfo
      );
      
      if (recording) {
        console.log(`✅ Gravação sincronizada: ${file.filename} (ID: ${recording.id})`);
        syncedCount++;
      } else {
        console.log(`❌ Erro ao sincronizar: ${file.filename}`);
        errorCount++;
      }
    }
    
    console.log('\n📊 Resumo da sincronização:');
    console.log(`✅ Sincronizadas: ${syncedCount}`);
    console.log(`⏭️ Ignoradas (já existiam): ${skippedCount}`);
    console.log(`❌ Erros: ${errorCount}`);
    console.log(`📁 Total de arquivos: ${allFiles.length}`);
    
    if (syncedCount > 0) {
      console.log('\n🎉 Sincronização concluída com sucesso!');
    } else {
      console.log('\nℹ️ Nenhuma nova gravação foi sincronizada.');
    }
    
  } catch (error) {
    console.error('❌ Erro durante a sincronização:', error);
  }
}

// Executar sincronização
syncRecordings().then(() => {
  console.log('\n🏁 Script de sincronização finalizado');
  process.exit(0);
}).catch((error) => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});