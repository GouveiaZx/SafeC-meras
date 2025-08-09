import { supabaseAdmin } from './src/config/database.js';
import RecordingService from './src/services/RecordingService.js';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

async function debugStreaming() {
  try {
    console.log('🔍 Iniciando debug do endpoint de streaming...');
    
    // 1. Buscar uma gravação válida
    console.log('\n1. Buscando gravação válida...');
    const { data: recordings, error: recordingsError } = await supabaseAdmin
      .from('recordings')
      .select('*')
      .not('duration', 'is', null)
      .not('file_size', 'is', null)
      .limit(1);
    
    if (recordingsError) {
      console.error('❌ Erro ao buscar gravações:', recordingsError);
      return;
    }
    
    if (!recordings || recordings.length === 0) {
      console.log('❌ Nenhuma gravação válida encontrada');
      return;
    }
    
    const recording = recordings[0];
    console.log('✅ Gravação encontrada:', {
      id: recording.id,
      filename: recording.filename,
      duration: recording.duration,
      file_size: recording.file_size,
      status: recording.status
    });
    
    // 2. Buscar usuário válido
    console.log('\n2. Buscando usuário válido...');
    const { data: users, error: usersError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('active', true)
      .limit(1);
    
    if (usersError) {
      console.error('❌ Erro ao buscar usuários:', usersError);
      return;
    }
    
    if (!users || users.length === 0) {
      console.log('❌ Nenhum usuário válido encontrado');
      return;
    }
    
    const user = users[0];
    console.log('✅ Usuário encontrado:', {
      id: user.id,
      email: user.email,
      role: user.role
    });
    
    // 3. Testar RecordingService.getRecordingById
    console.log('\n3. Testando RecordingService.getRecordingById...');
    try {
      const recordingFromService = await RecordingService.getRecordingById(recording.id, user.id);
      if (recordingFromService) {
        console.log('✅ RecordingService.getRecordingById funcionou:', {
          id: recordingFromService.id,
          filename: recordingFromService.filename
        });
      } else {
        console.log('❌ RecordingService.getRecordingById retornou null');
        return;
      }
    } catch (error) {
      console.error('❌ Erro em RecordingService.getRecordingById:', error.message);
      return;
    }
    
    // 4. Testar RecordingService.prepareDownload
    console.log('\n4. Testando RecordingService.prepareDownload...');
    try {
      const downloadInfo = await RecordingService.prepareDownload(recording.id, user.id);
      console.log('✅ RecordingService.prepareDownload funcionou:', {
        exists: downloadInfo.exists,
        isS3: downloadInfo.isS3,
        filePath: downloadInfo.filePath,
        fileSize: downloadInfo.fileSize
      });
      
      if (!downloadInfo.exists) {
        console.log('❌ Arquivo não existe no armazenamento');
        return;
      }
    } catch (error) {
      console.error('❌ Erro em RecordingService.prepareDownload:', error.message);
      return;
    }
    
    // 5. Gerar token JWT
    console.log('\n5. Gerando token JWT...');
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    console.log('✅ Token gerado com sucesso');
    
    // 6. Testar endpoint com fetch
    console.log('\n6. Testando endpoint de streaming...');
    const url = `http://localhost:3002/api/recordings/${recording.id}/stream?token=${token}`;
    console.log('🌐 URL de teste:', url);
    
    const response = await fetch(url, {
      method: 'HEAD'
    });
    
    console.log('📊 Resposta do servidor:');
    console.log('  Status:', response.status, response.statusText);
    console.log('  Headers:');
    for (const [key, value] of response.headers.entries()) {
      console.log(`    ${key}: ${value}`);
    }
    
    if (response.ok) {
      console.log('✅ Endpoint de streaming funcionando!');
    } else {
      console.log('❌ Endpoint de streaming com problema');
      const body = await response.text();
      console.log('📄 Corpo da resposta:', body);
    }
    
  } catch (error) {
    console.error('❌ Erro geral no debug:', error);
  }
  
  console.log('\n🏁 Debug concluído');
}

debugStreaming();