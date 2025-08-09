import { supabaseAdmin } from './src/config/database.js';
import RecordingService from './src/services/RecordingService.js';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

async function testValidRecording() {
  try {
    console.log('🔍 Testando com gravação que tem arquivo válido...');
    
    // Buscar gravação que sabemos que tem arquivo (da câmera e4c3adb3-bc1a-4ed6-a92d-cb5f23a27e36)
    const { data: recordings, error: recordingsError } = await supabaseAdmin
      .from('recordings')
      .select('*')
      .eq('camera_id', 'e4c3adb3-bc1a-4ed6-a92d-cb5f23a27e36')
      .not('duration', 'is', null)
      .limit(1);
    
    if (recordingsError || !recordings || recordings.length === 0) {
      console.log('❌ Nenhuma gravação válida encontrada para esta câmera');
      return;
    }
    
    const recording = recordings[0];
    console.log('✅ Gravação encontrada:', {
      id: recording.id,
      filename: recording.filename,
      file_path: recording.file_path,
      duration: recording.duration,
      file_size: recording.file_size,
      status: recording.status
    });
    
    // Buscar usuário válido
    const { data: users, error: usersError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('active', true)
      .limit(1);
    
    if (usersError || !users || users.length === 0) {
      console.log('❌ Nenhum usuário válido encontrado');
      return;
    }
    
    const user = users[0];
    console.log('✅ Usuário encontrado:', {
      id: user.id,
      email: user.email,
      role: user.role
    });
    
    // Testar RecordingService.prepareDownload
    console.log('\n🔧 Testando RecordingService.prepareDownload...');
    try {
      const downloadInfo = await RecordingService.prepareDownload(recording.id, user.id);
      console.log('✅ Resultado do prepareDownload:', downloadInfo);
      
      if (downloadInfo.exists) {
        console.log('✅ Arquivo existe! Testando endpoint...');
        
        // Gerar token JWT
        const token = jwt.sign(
          {
            userId: user.id,
            email: user.email,
            role: user.role
          },
          process.env.JWT_SECRET,
          { expiresIn: '1h' }
        );
        
        // Testar endpoint
        const url = `http://localhost:3002/api/recordings/${recording.id}/stream?token=${token}`;
        console.log('🌐 URL de teste:', url);
        
        const response = await fetch(url, {
          method: 'HEAD'
        });
        
        console.log('📊 Resposta do servidor:');
        console.log('  Status:', response.status, response.statusText);
        
        if (response.ok) {
          console.log('✅ Endpoint de streaming funcionando!');
        } else {
          console.log('❌ Endpoint de streaming com problema');
          const body = await response.text();
          console.log('📄 Corpo da resposta:', body);
        }
      } else {
        console.log('❌ Arquivo não existe no armazenamento');
      }
    } catch (error) {
      console.error('❌ Erro em prepareDownload:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Erro geral no teste:', error);
  }
  
  console.log('\n🏁 Teste concluído');
}

testValidRecording();