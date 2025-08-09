import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const { promises: fsPromises } = fs;

// Configuração do Supabase
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://grkvfzuadctextnbpajb.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzIyNDIzOCwiZXhwIjoyMDY4ODAwMjM4fQ.XJoPu5InA_s3pfryZfSChBqZnu7zBV3vwH7ZM4jf04M'
);

const recordingsPath = path.resolve('../recordings'); // Diretório raiz do projeto

async function restoreValidRecordings() {
  try {
    console.log('🔄 Restaurando gravações válidas...');
    
    // 1. Listar arquivos físicos
    console.log('\n📁 Verificando arquivos físicos...');
    const physicalFiles = await fsPromises.readdir(recordingsPath);
    const mp4Files = physicalFiles.filter(file => file.endsWith('.mp4'));
    
    console.log(`   Arquivos MP4 encontrados: ${mp4Files.length}`);
    mp4Files.forEach(file => console.log(`   - ${file}`));
    
    if (mp4Files.length === 0) {
      console.log('❌ Nenhum arquivo MP4 encontrado!');
      return;
    }
    
    // 2. Verificar gravações existentes no banco
    console.log('\n🗄️ Verificando gravações no banco...');
    const { data: existingRecordings, error: fetchError } = await supabase
      .from('recordings')
      .select('filename')
      .in('filename', mp4Files);
    
    if (fetchError) {
      throw new Error(`Erro ao buscar gravações: ${fetchError.message}`);
    }
    
    const existingFilenames = existingRecordings.map(r => r.filename);
    const newFiles = mp4Files.filter(file => !existingFilenames.includes(file));
    
    console.log(`   Gravações já existentes: ${existingFilenames.length}`);
    console.log(`   Novos arquivos para adicionar: ${newFiles.length}`);
    
    // 3. Criar gravações para arquivos novos
    if (newFiles.length > 0) {
      console.log('\n➕ Criando gravações para arquivos válidos...');
      
      for (const filename of newFiles) {
        const filePath = path.join(recordingsPath, filename);
        const stats = await fsPromises.stat(filePath);
        
        // Extrair timestamp do nome do arquivo
        const timestampMatch = filename.match(/recording_(\d+)\.mp4/);
        const timestamp = timestampMatch ? parseInt(timestampMatch[1]) : Date.now();
        const createdAt = new Date(timestamp).toISOString();
        
        const newRecording = {
          id: uuidv4(),
          filename: filename,
          file_path: `recordings/${filename}`,
          local_path: filePath,
          file_size: stats.size,
          duration: 0, // Será atualizado quando o vídeo for processado
          status: 'completed',
          camera_id: '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd', // ID da câmera existente
          start_time: createdAt,
          created_at: createdAt,
          updated_at: new Date().toISOString()
        };
        
        const { error: insertError } = await supabase
          .from('recordings')
          .insert([newRecording]);
        
        if (insertError) {
          console.error(`   ❌ Erro ao criar gravação para ${filename}: ${insertError.message}`);
        } else {
          console.log(`   ✅ Criado: ${newRecording.id} - ${filename} (${stats.size} bytes)`);
        }
      }
    }
    
    // 4. Verificação final
    console.log('\n🔍 Verificação final...');
    const { data: finalRecordings, error: finalError } = await supabase
      .from('recordings')
      .select('id, filename, status, file_size')
      .order('created_at', { ascending: false });
    
    if (finalError) {
      throw new Error(`Erro na verificação final: ${finalError.message}`);
    }
    
    console.log(`\n📋 Gravações no banco: ${finalRecordings.length}`);
    finalRecordings.forEach(rec => {
      console.log(`   - ${rec.id} | ${rec.filename} | ${rec.status} | ${rec.file_size} bytes`);
    });
    
    console.log('\n✅ Restauração concluída com sucesso!');
    console.log('\n🎯 Próximos passos:');
    console.log('   1. Testar o player de vídeo no frontend');
    console.log('   2. Verificar se as gravações são reproduzíveis');
    console.log('   3. Fazer uma nova gravação para testar o fluxo completo');
    
  } catch (error) {
    console.error('❌ Erro durante a restauração:', error);
    process.exit(1);
  }
}

// Executar o script
restoreValidRecordings();