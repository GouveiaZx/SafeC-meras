const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const recordingId = '53722dff-ee50-4760-bdf6-000ef3b08602';

async function checkSpecificRecording() {
  console.log(`🔍 Verificando gravação ${recordingId}...`);
  
  try {
    // Buscar gravação no Supabase
    const { data, error } = await supabase
      .from('recordings')
      .select('*')
      .eq('id', recordingId)
      .single();
    
    if (error) {
      console.error('❌ Erro ao buscar gravação:', error.message);
      return;
    }
    
    if (!data) {
      console.log('❌ Gravação não encontrada no banco de dados');
      return;
    }
    
    console.log('✅ Gravação encontrada no banco:');
    console.log(`   ID: ${data.id}`);
    console.log(`   Camera ID: ${data.camera_id}`);
    console.log(`   Filename: ${data.filename}`);
    console.log(`   File Path: ${data.file_path}`);
    console.log(`   Local Path: ${data.local_path}`);
    console.log(`   File Size: ${data.file_size}`);
    console.log(`   Status: ${data.status}`);
    console.log(`   Created At: ${data.created_at}`);
    
    // Verificar se o arquivo físico existe
    if (data.local_path) {
      console.log(`\n🔍 Verificando arquivo físico: ${data.local_path}`);
      
      if (fs.existsSync(data.local_path)) {
        const stats = fs.statSync(data.local_path);
        console.log(`✅ Arquivo existe:`);
        console.log(`   Tamanho: ${stats.size} bytes`);
        console.log(`   Modificado: ${stats.mtime}`);
        
        // Verificar se o tamanho bate com o banco
        if (data.file_size && stats.size !== data.file_size) {
          console.log(`⚠️  AVISO: Tamanho no banco (${data.file_size}) difere do arquivo físico (${stats.size})`);
        }
      } else {
        console.log(`❌ Arquivo não encontrado no caminho especificado`);
        
        // Tentar encontrar o arquivo em outros locais
        console.log(`\n🔍 Procurando arquivo em outros locais...`);
        const storageDir = path.join(__dirname, 'storage', 'www', 'record', 'live');
        
        function findFile(dir, filename) {
          if (!fs.existsSync(dir)) return null;
          
          const items = fs.readdirSync(dir);
          for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
              const found = findFile(fullPath, filename);
              if (found) return found;
            } else if (item.includes(filename) || item.endsWith('.mp4')) {
              return fullPath;
            }
          }
          return null;
        }
        
        const foundFile = findFile(storageDir, data.filename || recordingId);
        if (foundFile) {
          console.log(`✅ Arquivo encontrado em: ${foundFile}`);
          const stats = fs.statSync(foundFile);
          console.log(`   Tamanho: ${stats.size} bytes`);
        } else {
          console.log(`❌ Arquivo não encontrado em nenhum local`);
        }
      }
    } else {
      console.log(`❌ Local path é null - gravação não foi processada corretamente`);
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

checkSpecificRecording();