import dotenv from 'dotenv';
import { supabaseAdmin } from './src/config/database.js';
import jwt from 'jsonwebtoken';
import axios from 'axios';

// Carregar variáveis de ambiente
dotenv.config();

async function testRecordingPlayer() {
  try {
    console.log('🧪 Testando player de gravação...');

    // Buscar a última gravação válida
    const { data: recordings, error } = await supabaseAdmin
      .from('recordings')
      .select('*')
      .eq('status', 'completed')
      .order('created_at', { descending: true })
      .limit(1);

    if (error) {
      throw error;
    }

    if (recordings.length === 0) {
      console.log('❌ Nenhuma gravação encontrada');
      return;
    }

    const recording = recordings[0];
    console.log('📹 Gravação encontrada:', {
      id: recording.id,
      filename: recording.filename,
      file_size: recording.file_size,
      file_path: recording.file_path
    });

    // Gerar token válido
    const payload = {
      userId: '929cc586-3e21-45ff-bdaf-cb5e1119664e',
      email: 'rodrigo@safecameras.com.br',
      role: 'admin',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hora
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET || 'your-secret-key');

    // Testar streaming
    const streamingUrl = `http://localhost:3002/api/recordings/${recording.id}/stream?token=${token}`;
    console.log('🔗 URL de streaming:', streamingUrl);

    // Testar HEAD request
    try {
      console.log('🔍 Testando HEAD request...');
      const headResponse = await axios.head(streamingUrl);
      console.log('✅ HEAD Response:', {
        status: headResponse.status,
        contentType: headResponse.headers['content-type'],
        contentLength: headResponse.headers['content-length'],
        acceptRanges: headResponse.headers['accept-ranges']
      });
    } catch (error) {
      console.log('❌ HEAD Error:', error.response?.status, error.response?.data);
    }

    // Testar Range request
    try {
      console.log('🔍 Testando Range request...');
      const rangeResponse = await axios.get(streamingUrl, {
        headers: {
          Range: 'bytes=0-1000'
        }
      });
      console.log('✅ Range Response:', {
        status: rangeResponse.status,
        contentType: rangeResponse.headers['content-type'],
        contentRange: rangeResponse.headers['content-range'],
        acceptRanges: rangeResponse.headers['accept-ranges']
      });
    } catch (error) {
      console.log('❌ Range Error:', error.response?.status, error.response?.data);
    }

    // Testar download
    const downloadUrl = `http://localhost:3002/api/recordings/${recording.id}/download?token=${token}`;
    console.log('🔗 URL de download:', downloadUrl);

    // Testar download request
    try {
      console.log('🔍 Testando download...');
      const downloadResponse = await axios.get(downloadUrl);
      console.log('✅ Download Response:', {
        status: downloadResponse.status,
        contentType: downloadResponse.headers['content-type'],
        contentLength: downloadResponse.headers['content-length']
      });
    } catch (error) {
      console.log('❌ Download Error:', error.response?.status, error.response?.data);
    }

    console.log('\n🎯 URLs para teste no navegador:');
    console.log('Streaming:', streamingUrl);
    console.log('Download:', downloadUrl);

  } catch (error) {
    console.error('❌ Erro no teste:', error);
  }
}

testRecordingPlayer();