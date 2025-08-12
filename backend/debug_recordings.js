import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debugRecordings() {
  console.log('🔍 DEBUG DAS GRAVAÇÕES');
  console.log('='.repeat(50));

  try {
    // Verificar status das gravações
    const { data: recordings, error } = await supabase
      .from('recordings')
      .select('id, filename, camera_id, status, upload_status, file_path, s3_url, error_message, file_size, created_at')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Erro ao buscar gravações:', error);
      return;
    }

    console.log(`📊 Total de gravações: ${recordings.length}`);

    // Contar por status
    const statusCount = {};
    const uploadCount = {};
    const errors = [];

    recordings.forEach(rec => {
      statusCount[rec.status] = (statusCount[rec.status] || 0) + 1;
      uploadCount[rec.upload_status] = (uploadCount[rec.upload_status] || 0) + 1;
      
      if (rec.error_message) {
        errors.push({ filename: rec.filename, error: rec.error_message });
      }
    });

    console.log('\n📈 STATUS DAS GRAVAÇÕES:');
    console.log('Status:', statusCount);
    console.log('Upload:', uploadCount);

    if (errors.length > 0) {
      console.log('\n❌ ERROS ENCONTRADOS:');
      errors.forEach(err => console.log(`  ${err.filename}: ${err.error}`));
    }

    // Verificar arquivos físicos
    console.log('\n📁 VERIFICAÇÃO DE ARQUIVOS FÍSICOS:');
    const recordingsPath = process.env.RECORDINGS_PATH || './recordings';
    
    for (const rec of recordings) {
      if (rec.file_path) {
        const fullPath = path.resolve(recordingsPath, rec.file_path);
        try {
          await fs.access(fullPath);
          const stats = await fs.stat(fullPath);
          console.log(`✅ ${rec.filename}: Arquivo existe (${stats.size} bytes)`);
        } catch (err) {
          console.log(`❌ ${rec.filename}: Arquivo não encontrado - ${fullPath}`);
        }
      } else {
        console.log(`⚠️  ${rec.filename}: Sem caminho de arquivo definido`);
      }
    }

    // Verificar S3
    console.log('\n☁️ STATUS S3:');
    recordings.forEach(rec => {
      if (rec.s3_url) {
        console.log(`✅ ${rec.filename}: S3 - ${rec.s3_url}`);
      } else {
        console.log(`⚠️  ${rec.filename}: Sem upload S3`);
      }
    });

    // Mostrar detalhes completos das últimas 5
    console.log('\n📋 DETALHES DAS ÚLTIMAS 5 GRAVAÇÕES:');
    recordings.slice(0, 5).forEach(rec => {
      console.log(`\n📹 ${rec.filename}`);
      console.log(`   ID: ${rec.id}`);
      console.log(`   Camera: ${rec.camera_id}`);
      console.log(`   Status: ${rec.status}`);
      console.log(`   Upload: ${rec.upload_status}`);
      console.log(`   Tamanho: ${rec.file_size || 'N/A'} bytes`);
      console.log(`   Data: ${rec.created_at}`);
      console.log(`   Caminho: ${rec.file_path || 'N/A'}`);
      console.log(`   S3: ${rec.s3_url || 'N/A'}`);
      console.log(`   Erro: ${rec.error_message || 'Nenhum'}`);
    });

  } catch (error) {
    console.error('Erro ao debugar gravações:', error);
  }
}

debugRecordings();