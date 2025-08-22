/**
 * Script para encontrar e sincronizar arquivos MP4 órfãos
 * Busca em todos os diretórios possíveis onde o ZLMediaKit pode salvar
 */

import { createModuleLogger } from '../config/logger.js';
import { supabaseAdmin } from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logger = createModuleLogger('FindOrphanMP4');

// Caminhos possíveis onde os arquivos MP4 podem estar
const SEARCH_PATHS = [
  '../../../storage/www/record/record/live',  // Path duplicado do ZLMediaKit
  '../../../storage/www/record/live',         // Path esperado
  '../../../storage/www/live',                 // Path alternativo
  '../../../storage/www',                     // Raiz do www
  '../../../storage/recordings',              // Path antigo
];

async function findAllMP4Files() {
  const allFiles = [];
  
  for (const searchPath of SEARCH_PATHS) {
    const fullPath = path.join(__dirname, searchPath);
    
    try {
      if (fs.existsSync(fullPath)) {
        console.log(`\n🔍 Buscando em: ${fullPath}`);
        const files = findMP4Recursive(fullPath);
        allFiles.push(...files);
        console.log(`   Encontrados: ${files.length} arquivos`);
      } else {
        console.log(`⚠️ Path não existe: ${fullPath}`);
      }
    } catch (error) {
      console.log(`❌ Erro ao acessar: ${fullPath} - ${error.message}`);
    }
  }
  
  return allFiles;
}

function findMP4Recursive(dir, fileList = []) {
  try {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        findMP4Recursive(filePath, fileList);
      } else if (file.endsWith('.mp4')) {
        fileList.push({
          path: filePath,
          filename: file,
          size: stat.size,
          modified: stat.mtime,
          created: stat.birthtime
        });
      }
    }
  } catch (error) {
    // Ignorar erros de acesso
  }
  
  return fileList;
}

function extractCameraIdFromPath(filePath) {
  // Tentar extrair camera_id do path
  // Padrão: .../live/{camera_id}/...
  const pathParts = filePath.split(path.sep);
  const liveIndex = pathParts.lastIndexOf('live');
  
  if (liveIndex >= 0 && liveIndex < pathParts.length - 1) {
    const possibleCameraId = pathParts[liveIndex + 1];
    // Validar se é um UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(possibleCameraId)) {
      return possibleCameraId;
    }
  }
  
  return null;
}

function normalizeFilePath(absolutePath) {
  // Normalizar path para formato relativo consistente
  const normalizedPath = absolutePath.replace(/\\/g, '/');
  
  // Remover parte absoluta e manter apenas a partir de storage/
  const storageIndex = normalizedPath.indexOf('storage/');
  if (storageIndex >= 0) {
    return normalizedPath.substring(storageIndex);
  }
  
  // Se não encontrar storage/, tentar www/
  const wwwIndex = normalizedPath.indexOf('www/');
  if (wwwIndex >= 0) {
    return 'storage/' + normalizedPath.substring(wwwIndex);
  }
  
  return normalizedPath;
}

async function syncOrphanFiles() {
  try {
    console.log('🔄 Iniciando busca por arquivos MP4 órfãos...\n');
    
    // Encontrar todos os arquivos MP4
    const allFiles = await findAllMP4Files();
    console.log(`\n📊 Total de arquivos MP4 encontrados: ${allFiles.length}`);
    
    if (allFiles.length === 0) {
      console.log('⚠️ Nenhum arquivo MP4 encontrado');
      return;
    }
    
    // Buscar gravações no banco
    const { data: recordings, error } = await supabaseAdmin
      .from('recordings')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    console.log(`📚 Gravações no banco: ${recordings.length}\n`);
    
    // Criar mapa de arquivos já registrados
    const registeredFiles = new Set();
    recordings.forEach(rec => {
      if (rec.filename) registeredFiles.add(rec.filename);
    });
    
    // Processar arquivos órfãos
    let orphanCount = 0;
    let updatedCount = 0;
    
    for (const file of allFiles) {
      const cameraId = extractCameraIdFromPath(file.path);
      const normalizedPath = normalizeFilePath(file.path);
      
      if (!registeredFiles.has(file.filename)) {
        orphanCount++;
        console.log(`\n🆕 Arquivo órfão encontrado: ${file.filename}`);
        console.log(`   Path: ${normalizedPath}`);
        console.log(`   Camera ID: ${cameraId || 'Desconhecido'}`);
        console.log(`   Tamanho: ${Math.round(file.size / 1024 / 1024 * 100) / 100} MB`);
        
        if (cameraId) {
          // Tentar encontrar gravação sem arquivo
          const recording = recordings.find(r => 
            r.camera_id === cameraId && 
            !r.filename &&
            r.status === 'recording'
          );
          
          if (recording) {
            // Atualizar gravação existente
            const { error: updateError } = await supabaseAdmin
              .from('recordings')
              .update({
                filename: file.filename,
                file_path: normalizedPath,
                local_path: normalizedPath,
                file_size: file.size,
                status: 'completed',
                end_time: file.modified.toISOString(),
                metadata: {
                  ...recording.metadata,
                  synced_by: 'findOrphanMP4Files',
                  synced_at: new Date().toISOString()
                }
              })
              .eq('id', recording.id);
            
            if (!updateError) {
              updatedCount++;
              console.log(`   ✅ Gravação atualizada: ${recording.id}`);
            } else {
              console.log(`   ❌ Erro ao atualizar: ${updateError.message}`);
            }
          } else {
            // Criar nova gravação para arquivo órfão
            const { error: insertError } = await supabaseAdmin
              .from('recordings')
              .insert({
                camera_id: cameraId,
                filename: file.filename,
                file_path: normalizedPath,
                local_path: normalizedPath,
                file_size: file.size,
                status: 'completed',
                start_time: file.created.toISOString(),
                end_time: file.modified.toISOString(),
                metadata: {
                  orphan_file: true,
                  found_by: 'findOrphanMP4Files',
                  found_at: new Date().toISOString()
                }
              });
            
            if (!insertError) {
              updatedCount++;
              console.log(`   ✅ Nova gravação criada`);
            } else {
              console.log(`   ❌ Erro ao criar: ${insertError.message}`);
            }
          }
        }
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMO DA SINCRONIZAÇÃO');
    console.log('='.repeat(60));
    console.log(`Total de arquivos MP4: ${allFiles.length}`);
    console.log(`Arquivos órfãos: ${orphanCount}`);
    console.log(`Registros atualizados/criados: ${updatedCount}`);
    
    // Listar caminhos únicos encontrados
    const uniquePaths = new Set();
    allFiles.forEach(f => {
      const dir = path.dirname(normalizeFilePath(f.path));
      uniquePaths.add(dir);
    });
    
    console.log('\n📁 Diretórios com arquivos MP4:');
    Array.from(uniquePaths).sort().forEach(p => {
      console.log(`   - ${p}`);
    });
    
  } catch (error) {
    console.error('❌ Erro na sincronização:', error);
    logger.error('Erro no findOrphanMP4Files:', error);
  }
}

// Executar script
syncOrphanFiles()
  .then(() => {
    console.log('\n✅ Sincronização concluída');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Erro fatal:', error);
    process.exit(1);
  });