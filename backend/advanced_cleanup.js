import { createClient } from '@supabase/supabase-js';
import AWS from 'aws-sdk';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Carregar .env
const envPath = join(__dirname, '.env');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis de ambiente do Supabase não configuradas');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Configurar AWS S3 para Wasabi
const s3 = new AWS.S3({
  endpoint: process.env.WASABI_ENDPOINT || 'https://s3.wasabisys.com',
  accessKeyId: process.env.WASABI_ACCESS_KEY,
  secretAccessKey: process.env.WASABI_SECRET_KEY,
  region: process.env.WASABI_REGION || 'us-east-1',
  s3ForcePathStyle: true
});

const bucketName = process.env.WASABI_BUCKET_NAME;

async function checkFileInWasabi(s3Key) {
  if (!s3Key || !bucketName) return false;
  
  try {
    await s3.headObject({
      Bucket: bucketName,
      Key: s3Key
    }).promise();
    return true;
  } catch (error) {
    if (error.code === 'NotFound') {
      return false;
    }
    console.warn(`⚠️ Erro ao verificar arquivo ${s3Key}:`, error.message);
    return false;
  }
}

async function advancedCleanup() {
  try {
    console.log('🔍 Iniciando análise avançada de gravações...');
    
    // Buscar gravações com dados inválidos
    const { data: recordings, error } = await supabase
      .from('recordings')
      .select('*')
      .or('duration.is.null,file_size.is.null,resolution.is.null,filename.is.null');
    
    if (error) {
      console.error('❌ Erro ao buscar gravações:', error);
      return;
    }
    
    console.log(`📊 Encontradas ${recordings.length} gravações com dados inválidos`);
    
    if (recordings.length === 0) {
      console.log('✅ Nenhuma gravação inválida encontrada');
      return;
    }
    
    // Analisar gravações
    const analysis = {
      withS3Key: [],
      withoutS3Key: [],
      existsInWasabi: [],
      notInWasabi: [],
      statusRecording: [],
      statusCompleted: [],
      statusFailed: []
    };
    
    console.log('\n🔍 Analisando gravações...');
    
    for (let i = 0; i < recordings.length; i++) {
      const rec = recordings[i];
      
      // Categorizar por S3 key
      if (rec.s3_key) {
        analysis.withS3Key.push(rec);
        
        // Verificar se existe no Wasabi
        const existsInWasabi = await checkFileInWasabi(rec.s3_key);
        if (existsInWasabi) {
          analysis.existsInWasabi.push(rec);
        } else {
          analysis.notInWasabi.push(rec);
        }
      } else {
        analysis.withoutS3Key.push(rec);
      }
      
      // Categorizar por status
      switch (rec.status) {
        case 'recording':
          analysis.statusRecording.push(rec);
          break;
        case 'completed':
          analysis.statusCompleted.push(rec);
          break;
        case 'failed':
          analysis.statusFailed.push(rec);
          break;
      }
      
      // Mostrar progresso
      if ((i + 1) % 50 === 0) {
        console.log(`   Analisadas ${i + 1}/${recordings.length} gravações...`);
      }
    }
    
    // Relatório
    console.log('\n📋 RELATÓRIO DE ANÁLISE:');
    console.log('========================');
    console.log(`Total de gravações inválidas: ${recordings.length}`);
    console.log(`\n📁 Arquivos:`);
    console.log(`  - Com S3 key: ${analysis.withS3Key.length}`);
    console.log(`  - Sem S3 key: ${analysis.withoutS3Key.length}`);
    
    if (analysis.withS3Key.length > 0) {
      console.log(`\n☁️ Verificação no Wasabi:`);
      console.log(`  - Existem no Wasabi: ${analysis.existsInWasabi.length}`);
      console.log(`  - NÃO existem no Wasabi: ${analysis.notInWasabi.length}`);
    }
    
    console.log(`\n📊 Status das gravações:`);
    console.log(`  - Status 'recording': ${analysis.statusRecording.length}`);
    console.log(`  - Status 'completed': ${analysis.statusCompleted.length}`);
    console.log(`  - Status 'failed': ${analysis.statusFailed.length}`);
    
    // Recomendações
    console.log('\n💡 RECOMENDAÇÕES:');
    console.log('==================');
    
    if (analysis.statusRecording.length > 0) {
      console.log(`⚠️ ${analysis.statusRecording.length} gravações com status 'recording' mas sem dados - provavelmente travadas`);
    }
    
    if (analysis.withoutS3Key.length > 0) {
      console.log(`🗑️ ${analysis.withoutS3Key.length} gravações sem S3 key - podem ser deletadas com segurança`);
    }
    
    if (analysis.notInWasabi.length > 0) {
      console.log(`⚠️ ${analysis.notInWasabi.length} gravações com S3 key mas arquivo não existe no Wasabi`);
    }
    
    // Opções de limpeza
    const shouldDelete = process.argv.includes('--delete');
    const deleteType = process.argv.find(arg => arg.startsWith('--delete-'));
    
    if (shouldDelete || deleteType) {
      console.log('\n🗑️ EXECUTANDO LIMPEZA...');
      
      let toDelete = [];
      
      if (deleteType === '--delete-no-s3') {
        toDelete = analysis.withoutS3Key;
        console.log(`Deletando ${toDelete.length} gravações sem S3 key...`);
      } else if (deleteType === '--delete-recording-status') {
        toDelete = analysis.statusRecording.filter(rec => !rec.s3_key || !analysis.existsInWasabi.includes(rec));
        console.log(`Deletando ${toDelete.length} gravações com status 'recording' sem arquivo...`);
      } else if (shouldDelete) {
        toDelete = analysis.withoutS3Key.concat(analysis.notInWasabi);
        console.log(`Deletando ${toDelete.length} gravações sem arquivo válido...`);
      }
      
      if (toDelete.length > 0) {
        const recordingIds = toDelete.map(r => r.id);
        
        const { error: deleteError } = await supabase
          .from('recordings')
          .delete()
          .in('id', recordingIds);
        
        if (deleteError) {
          console.error('❌ Erro ao deletar gravações:', deleteError);
          return;
        }
        
        console.log(`✅ ${toDelete.length} gravações deletadas com sucesso`);
      }
    } else {
      console.log('\n💡 OPÇÕES DE LIMPEZA:');
      console.log('node advanced_cleanup.js --delete-no-s3          # Deletar apenas gravações sem S3 key');
      console.log('node advanced_cleanup.js --delete-recording-status # Deletar gravações travadas em "recording"');
      console.log('node advanced_cleanup.js --delete                 # Deletar todas as inválidas sem arquivo');
    }
    
  } catch (error) {
    console.error('❌ Erro durante a análise:', error);
  }
}

// Executar se chamado diretamente
if (process.argv[1] === __filename) {
  advancedCleanup()
    .then(() => {
      console.log('\n🏁 Análise concluída');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Erro fatal:', error);
      process.exit(1);
    });
}