import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import VideoMetadataExtractor from './src/utils/videoMetadata.js';
import logger from './src/utils/logger.js';

// Carregar variáveis de ambiente
dotenv.config();

// Configurar Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔧 Supabase URL:', process.env.SUPABASE_URL ? 'Configurado' : 'Não encontrado');
console.log('🔧 Service Role Key:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Configurado' : 'Não encontrado');

const recordingsPath = './storage/www/record/recordings';

async function fixRecordingPaths() {
  console.log('=== CORREÇÃO DE CAMINHOS E METADADOS DE GRAVAÇÕES ===\n');
  
  try {
    // 1. Buscar todas as gravações
    const { data: recordings, error } = await supabase
      .from('recordings')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      throw error;
    }
    
    console.log(`📁 Encontradas ${recordings.length} gravações no banco`);
    
    // 2. Buscar arquivos físicos
    const physicalFiles = [];
    
    async function scanDirectory(dir) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            await scanDirectory(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.mp4')) {
            const stats = await fs.stat(fullPath);
            physicalFiles.push({
              fullPath,
              relativePath: path.relative(recordingsPath, fullPath),
              filename: entry.name,
              size: stats.size,
              mtime: stats.mtime
            });
          }
        }
      } catch (err) {
        console.warn(`⚠️ Erro ao escanear diretório ${dir}:`, err.message);
      }
    }
    
    await scanDirectory(recordingsPath);
    console.log(`📄 Encontrados ${physicalFiles.length} arquivos MP4 físicos`);
    
    // 3. Agrupar gravações por câmera
    const recordingsByCamera = {};
    recordings.forEach(rec => {
      if (!recordingsByCamera[rec.camera_id]) {
        recordingsByCamera[rec.camera_id] = [];
      }
      recordingsByCamera[rec.camera_id].push(rec);
    });
    
    console.log(`📹 Gravações agrupadas por ${Object.keys(recordingsByCamera).length} câmeras`);
    
    // 4. Processar cada câmera
    let fixed = 0;
    let deleted = 0;
    let updated = 0;
    
    for (const [cameraId, cameraRecordings] of Object.entries(recordingsByCamera)) {
      console.log(`\n🎥 Processando câmera ${cameraId} (${cameraRecordings.length} gravações)`);
      
      // Encontrar arquivos desta câmera
      const cameraFiles = physicalFiles.filter(file => 
        file.relativePath.includes(cameraId)
      );
      
      console.log(`   📁 Arquivos encontrados: ${cameraFiles.length}`);
      
      if (cameraFiles.length === 0) {
        // Remover gravações órfãs (sem arquivo físico)
        console.log(`   🗑️ Removendo ${cameraRecordings.length} gravações órfãs`);
        
        for (const recording of cameraRecordings) {
          const { error: deleteError } = await supabase
            .from('recordings')
            .delete()
            .eq('id', recording.id);
          
          if (deleteError) {
            console.error(`   ❌ Erro ao deletar gravação ${recording.id}:`, deleteError);
          } else {
            deleted++;
          }
        }
        continue;
      }
      
      // Se há mais gravações no banco do que arquivos, manter apenas as mais recentes
      if (cameraRecordings.length > cameraFiles.length) {
        const toKeep = cameraRecordings
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .slice(0, cameraFiles.length);
        
        const toDelete = cameraRecordings.filter(rec => !toKeep.includes(rec));
        
        console.log(`   🗑️ Removendo ${toDelete.length} gravações duplicadas`);
        
        for (const recording of toDelete) {
          const { error: deleteError } = await supabase
            .from('recordings')
            .delete()
            .eq('id', recording.id);
          
          if (deleteError) {
            console.error(`   ❌ Erro ao deletar gravação duplicada ${recording.id}:`, deleteError);
          } else {
            deleted++;
          }
        }
        
        // Atualizar lista para processar apenas as mantidas
        cameraRecordings.splice(0, cameraRecordings.length, ...toKeep);
      }
      
      // Associar arquivos às gravações restantes
      for (let i = 0; i < Math.min(cameraRecordings.length, cameraFiles.length); i++) {
        const recording = cameraRecordings[i];
        const file = cameraFiles[i];
        
        console.log(`   🔧 Corrigindo gravação ${recording.id}`);
        
        try {
          // Extrair metadados do arquivo
          const metadata = await VideoMetadataExtractor.extractBasicInfo(file.fullPath);
          
          // Atualizar gravação
          const { error: updateError } = await supabase
            .from('recordings')
            .update({
              filename: file.filename,
              file_path: file.relativePath,
              local_path: file.fullPath,
              file_size: file.size,
              duration: metadata.duration || 0,
              resolution: metadata.resolution || 'N/A',
              updated_at: new Date().toISOString(),
              metadata: {
                ...recording.metadata,
                corrected_path: true,
                file_exists: true,
                corrected_at: new Date().toISOString()
              }
            })
            .eq('id', recording.id);
          
          if (updateError) {
            console.error(`   ❌ Erro ao atualizar gravação ${recording.id}:`, updateError);
          } else {
            console.log(`   ✅ Gravação ${recording.id} corrigida`);
            updated++;
          }
          
        } catch (metadataError) {
          console.error(`   ⚠️ Erro ao extrair metadados de ${file.fullPath}:`, metadataError.message);
          
          // Atualizar apenas o caminho
          const { error: updateError } = await supabase
            .from('recordings')
            .update({
              filename: file.filename,
              file_path: file.relativePath,
              local_path: file.fullPath,
              file_size: file.size,
              updated_at: new Date().toISOString(),
              metadata: {
                ...recording.metadata,
                corrected_path: true,
                file_exists: true,
                metadata_error: metadataError.message,
                corrected_at: new Date().toISOString()
              }
            })
            .eq('id', recording.id);
          
          if (!updateError) {
            fixed++;
          }
        }
      }
    }
    
    console.log('\n📊 Resultado da correção:');
    console.log(`  ✅ Gravações atualizadas: ${updated}`);
    console.log(`  🔧 Caminhos corrigidos: ${fixed}`);
    console.log(`  🗑️ Gravações removidas: ${deleted}`);
    console.log(`  📁 Total de arquivos físicos: ${physicalFiles.length}`);
    
  } catch (error) {
    console.error('❌ Erro durante a correção:', error);
    process.exit(1);
  }
}

// Executar correção
fixRecordingPaths()
  .then(() => {
    console.log('\n🎉 Correção concluída com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Erro fatal:', error);
    process.exit(1);
  });