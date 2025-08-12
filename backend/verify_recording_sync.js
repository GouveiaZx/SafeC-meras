import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyRecordingSync() {
  console.log('🔍 Verificando sincronização entre arquivos físicos e banco de dados...\n');

  // 1. Listar arquivos físicos - verificar múltiplos caminhos possíveis
  const possiblePaths = [
    path.join(process.cwd(), 'storage', 'www', 'record', 'live'),
    path.join(process.cwd(), 'storage', 'bin', 'www', 'record', 'live'),
    path.join(process.cwd(), '..', 'storage', 'www', 'record', 'live'),
    path.join(process.cwd(), '..', 'storage', 'bin', 'www', 'record', 'live')
  ];

  let recordingsPath = null;
  let physicalFiles = [];

  console.log('📁 Procurando arquivos físicos...');
  
  for (const testPath of possiblePaths) {
    console.log(`   Tentando: ${testPath}`);
    if (fs.existsSync(testPath)) {
      recordingsPath = testPath;
      console.log(`   ✅ Encontrado: ${testPath}`);
      break;
    }
  }

  if (recordingsPath) {
    const cameras = fs.readdirSync(recordingsPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    console.log(`\n📹 Câmeras encontradas: ${cameras.length}`);
    
    for (const cameraId of cameras) {
      const cameraPath = path.join(recordingsPath, cameraId);
      const dates = fs.readdirSync(cameraPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      for (const dateDir of dates) {
        const datePath = path.join(cameraPath, dateDir);
        const files = fs.readdirSync(datePath)
          .filter(file => file.endsWith('.mp4'))
          .map(file => {
            const filePath = path.join(datePath, file);
            const stats = fs.statSync(filePath);
            const match = file.match(/(\d{4}-\d{2}-\d{2})-(\d{2}-\d{2}-\d{2})-(\d+)\.mp4/);
            
            return {
              cameraId,
              fileName: file,
              filePath,
              size: stats.size,
              createdAt: stats.birthtime,
              modifiedAt: stats.mtime,
              date: match ? match[1] : null,
              time: match ? match[2] : null,
              segment: match ? parseInt(match[3]) : null
            };
          });

        physicalFiles.push(...files);
      }
    }
  } else {
    console.log('❌ Diretório de gravações não encontrado em nenhum dos caminhos possíveis');
  }

  console.log(`📊 Arquivos físicos encontrados: ${physicalFiles.length}`);

  // 2. Buscar registros no banco de dados
  console.log('\n🗄️ Verificando registros no banco de dados...');
  
  const { data: dbRecordings, error } = await supabase
    .from('recordings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('❌ Erro ao buscar registros:', error.message);
    return;
  }

  console.log(`📊 Registros no banco: ${dbRecordings.length}`);

  // 3. Verificar sincronização
  console.log('\n🔗 Verificando sincronização...');
  
  const unmatchedFiles = [];
  const matchedFiles = [];

  for (const file of physicalFiles) {
    // Procurar registro correspondente no banco (com margem de 1 minuto)
    const matchingRecord = dbRecordings.find(record => {
      const recordTime = new Date(record.created_at);
      const fileTime = new Date(file.createdAt);
      const timeDiff = Math.abs(recordTime.getTime() - fileTime.getTime());
      
      // Verificar se o nome da câmera corresponde
      const cameraMatch = record.camera_id === file.cameraId;
      
      return timeDiff < 60000 && cameraMatch; // 1 minuto de margem
    });

    if (matchingRecord) {
      matchedFiles.push({ file, record: matchingRecord });
    } else {
      unmatchedFiles.push(file);
    }
  }

  console.log(`✅ Arquivos sincronizados: ${matchedFiles.length}`);
  console.log(`❌ Arquivos não sincronizados: ${unmatchedFiles.length}`);

  // 4. Mostrar detalhes dos arquivos não sincronizados
  if (unmatchedFiles.length > 0) {
    console.log('\n📋 Arquivos não sincronizados (necessitam webhook):');
    unmatchedFiles
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10)
      .forEach(file => {
        console.log(`   📹 ${file.cameraId}/${file.fileName}`);
        console.log(`      📅 ${file.createdAt.toLocaleString()}`);
        console.log(`      📏 ${Math.round(file.size/1024/1024)}MB`);
      });
  }

  // 5. Verificar se há registros no banco sem arquivos físicos
  const orphanedRecords = dbRecordings.filter(record => {
    const recordTime = new Date(record.created_at);
    const matchingFile = physicalFiles.find(file => {
      const fileTime = new Date(file.createdAt);
      const timeDiff = Math.abs(recordTime.getTime() - fileTime.getTime());
      return timeDiff < 60000 && record.camera_id === file.cameraId;
    });
    return !matchingFile;
  });

  console.log(`\n🗑️ Registros órfãos (sem arquivo físico): ${orphanedRecords.length}`);

  // 6. Resumo
  console.log('\n📊 RESUMO:');
  console.log(`   📁 Arquivos físicos: ${physicalFiles.length}`);
  console.log(`   🗄️ Registros no banco: ${dbRecordings.length}`);
  console.log(`   ✅ Sincronizados: ${matchedFiles.length}`);
  console.log(`   ❌ Não sincronizados: ${unmatchedFiles.length}`);
  console.log(`   🗑️ Órfãos: ${orphanedRecords.length}`);

  // 7. Verificar últimas gravações recentes
  if (physicalFiles.length > 0) {
    console.log('\n📅 Últimas gravações físicas:');
    physicalFiles
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5)
      .forEach(file => {
        console.log(`   📹 ${file.cameraId} - ${file.fileName}`);
        console.log(`      📅 ${file.createdAt.toLocaleString()}`);
      });
  }

  // 8. Verificar webhook endpoints
  console.log('\n🔗 Verificando webhook endpoints:');
  console.log(`   on_record_mp4: http://localhost:3002/api/webhooks/on_record_mp4`);
  
  // 9. Verificar se há gravações recentes (últimas 24h)
  const last24h = physicalFiles.filter(file => {
    const now = new Date();
    const fileTime = new Date(file.createdAt);
    return (now - fileTime) < (24 * 60 * 60 * 1000);
  });
  
  console.log(`\n📅 Gravações nas últimas 24h: ${last24h.length}`);

  console.log('\n✅ Verificação concluída!');
}

verifyRecordingSync().catch(console.error);