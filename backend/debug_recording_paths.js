import dotenv from 'dotenv';
import { supabaseAdmin } from './src/config/database.js';
import fs from 'fs/promises';
import path from 'path';

// Carregar variáveis de ambiente
dotenv.config();

const recordingsPath = process.env.RECORDINGS_PATH || path.join(process.cwd(), 'recordings');

async function debugRecordingPaths() {
  try {
    console.log('🔍 Debug: Verificando correspondência entre banco e arquivos...');
    console.log(`📁 Diretório de gravações: ${recordingsPath}`);

    // Buscar todas as gravações
    const { data: recordings, error } = await supabaseAdmin
      .from('recordings')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    console.log(`\n📊 Total de gravações no banco: ${recordings.length}`);

    // Listar arquivos físicos
    let physicalFiles = [];
    try {
      const files = await fs.readdir(recordingsPath);
      physicalFiles = files.filter(file => 
        file.endsWith('.mp4') || file.endsWith('.mkv') || file.endsWith('.avi')
      );
      console.log(`📁 Arquivos físicos encontrados: ${physicalFiles.length}`);
      physicalFiles.forEach(file => console.log(`   - ${file}`));
    } catch (err) {
      console.log('⚠️  Diretório de gravações não encontrado ou vazio');
    }

    // Verificar cada gravação
    console.log('\n🔍 Analisando cada gravação...');
    
    for (const recording of recordings) {
      console.log(`\n📝 Gravação ${recording.id}:`);
      console.log(`   Filename: ${recording.filename}`);
      console.log(`   File path: ${recording.file_path}`);
      console.log(`   Local path: ${recording.local_path}`);
      console.log(`   Camera ID: ${recording.camera_id}`);

      // Estratégias de busca
      const strategies = [
        { name: 'local_path', path: recording.local_path },
        { name: 'file_path', path: recording.file_path },
        { name: 'filename', path: recording.filename },
        { name: 'filename_with_ext', path: `${recording.filename}.mp4` },
        { name: 'camera_dir_filename', path: `${recording.camera_id}/${recording.filename}` },
        { name: 'camera_dir_filename_ext', path: `${recording.camera_id}/${recording.filename}.mp4` }
      ];

      let found = false;
      for (const strategy of strategies) {
        if (!strategy.path) continue;
        
        const fullPath = path.isAbsolute(strategy.path) 
          ? strategy.path 
          : path.join(recordingsPath, strategy.path);

        try {
          await fs.access(fullPath);
          const stats = await fs.stat(fullPath);
          if (stats.isFile()) {
            console.log(`   ✅ Encontrado via ${strategy.name}: ${fullPath} (${stats.size} bytes)`);
            found = true;
            break;
          }
        } catch (err) {
          // Arquivo não encontrado
        }
      }

      if (!found) {
        console.log(`   ❌ Arquivo não encontrado em nenhuma estratégia`);
        
        // Sugerir correspondência por timestamp
        if (recording.filename && recording.filename.includes('recording_')) {
          const timestamp = recording.filename.match(/(\d{13})/)?.[1];
          if (timestamp) {
            const matchingFile = physicalFiles.find(f => f.includes(timestamp));
            if (matchingFile) {
              console.log(`   💡 Possível correspondência: ${matchingFile}`);
            }
          }
        }
      }
    }

    // Verificar arquivos órfãos
    console.log('\n🔍 Verificando arquivos órfãos...');
    const orphanedFiles = [];
    
    for (const physicalFile of physicalFiles) {
      let isReferenced = false;
      
      for (const recording of recordings) {
        if (
          recording.filename?.includes(physicalFile.replace('.mp4', '')) ||
          recording.file_path?.includes(physicalFile) ||
          recording.local_path?.includes(physicalFile)
        ) {
          isReferenced = true;
          break;
        }
      }
      
      if (!isReferenced) {
        orphanedFiles.push(physicalFile);
      }
    }

    if (orphanedFiles.length > 0) {
      console.log(`\n📁 Arquivos órfãos encontrados: ${orphanedFiles.length}`);
      orphanedFiles.forEach(file => console.log(`   - ${file}`));
    } else {
      console.log('\n✅ Todos os arquivos físicos estão referenciados');
    }

  } catch (error) {
    console.error('❌ Erro no debug:', error);
  }
}

debugRecordingPaths();