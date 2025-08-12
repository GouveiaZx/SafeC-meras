import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Carregar variáveis de ambiente
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function fixRecordingPath() {
  try {
    const recordingId = '37e13ad5-bbee-4368-b90b-b53c142a97bd';
    
    console.log('🔧 Corrigindo local_path da gravação...');
    
    // O arquivo está em: C:\Users\GouveiaRx\Downloads\NewCAM\backend\storage\recordings\test_real_video.mp4
    // O local_path deve ser relativo ao diretório de gravações: test_real_video.mp4
    // Mas vamos usar o caminho absoluto para garantir que funcione
    const absolutePath = 'C:\\Users\\GouveiaRx\\Downloads\\NewCAM\\backend\\storage\\recordings\\test_real_video.mp4';
    
    const { data, error } = await supabase
      .from('recordings')
      .update({ 
        local_path: absolutePath,
        file_path: absolutePath
      })
      .eq('id', recordingId)
      .select();
    
    if (error) {
      console.error('❌ Erro ao atualizar gravação:', error);
      return;
    }
    
    console.log('✅ local_path atualizado com sucesso!');
    console.log('Novo local_path:', absolutePath);
    
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

fixRecordingPath();