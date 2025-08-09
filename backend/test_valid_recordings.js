import { supabaseAdmin } from './src/config/database.js';
import { existsSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

async function findValidRecordings() {
  try {
    console.log('🔍 Buscando gravações no banco de dados...');
    
    const { data: recordings, error } = await supabaseAdmin
      .from('recordings')
      .select('id, filename, file_path, s3_url, camera_id, status')
      .eq('status', 'completed')
      .not('file_path', 'is', null)
      .limit(10);
    
    if (error) {
      console.error('❌ Erro ao buscar gravações:', error);
      return;
    }
    
    if (!recordings || recordings.length === 0) {
      console.log('⚠️ Nenhuma gravação encontrada no banco');
      return;
    }
    
    console.log(`📹 ${recordings.length} gravações encontradas:`);
    
    const validRecordings = [];
    
    for (const recording of recordings) {
      console.log(`\n📁 ${recording.filename} (${recording.id})`);
      console.log(`   Status: ${recording.status}`);
      console.log(`   Câmera: ${recording.camera_id}`);
      
      if (recording.s3_url) {
        console.log(`   ☁️ S3 URL: ${recording.s3_url}`);
        validRecordings.push(recording);
      } else if (recording.file_path) {
        console.log(`   💾 File Path: ${recording.file_path}`);
        
        // Verificar se o arquivo existe
        const fullPath = join(process.cwd(), recording.file_path);
        if (existsSync(fullPath)) {
          console.log(`   ✅ Arquivo existe`);
          validRecordings.push(recording);
        } else {
          console.log(`   ❌ Arquivo não encontrado`);
        }
      } else {
        console.log(`   ⚠️ Sem caminho definido`);
      }
    }
    
    console.log(`\n✅ ${validRecordings.length} gravações válidas encontradas:`);
    validRecordings.forEach(rec => {
      console.log(`   - ${rec.filename} (${rec.id})`);
    });
    
    if (validRecordings.length > 0) {
      console.log(`\n🎯 Use este ID para teste: ${validRecordings[0].id}`);
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

// Executar
findValidRecordings();