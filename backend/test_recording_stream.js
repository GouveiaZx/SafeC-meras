import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuração
const API_BASE = 'http://localhost:3002';
const TEST_USER = {
  email: 'admin@example.com',
  password: 'admin123'
};

async function testRecordingStream() {
  console.log('🎬 Testando reprodução de gravações...');
  
  try {
    // 1. Fazer login para obter token
    console.log('\n1. Fazendo login...');
    const loginResponse = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(TEST_USER)
    });
    
    if (!loginResponse.ok) {
      throw new Error(`Erro no login: ${loginResponse.status} ${loginResponse.statusText}`);
    }
    
    const loginData = await loginResponse.json();
    const token = loginData.tokens?.accessToken || loginData.data?.token || loginData.token;
    console.log('✅ Login realizado com sucesso');
    console.log(`   Token: ${token ? token.substring(0, 20) + '...' : 'Token não encontrado'}`);
    
    if (!token) {
      console.log('Resposta do login:', JSON.stringify(loginData, null, 2));
      throw new Error('Token não encontrado na resposta do login');
    }
    
    // 2. Buscar gravações disponíveis
    console.log('\n2. Buscando gravações...');
    const recordingsResponse = await fetch(`${API_BASE}/api/recordings`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!recordingsResponse.ok) {
      throw new Error(`Erro ao buscar gravações: ${recordingsResponse.status}`);
    }
    
    const recordingsData = await recordingsResponse.json();
    const recordings = recordingsData.data || [];
    
    console.log(`✅ Encontradas ${recordings.length} gravações`);
    
    // Debug: mostrar status de todas as gravações
    console.log('\n📊 Status das gravações:');
    recordings.forEach((rec, index) => {
      console.log(`   ${index + 1}. ${rec.filename} - Status: ${rec.status} - Local: ${rec.local_path ? 'Sim' : 'Não'} - Tamanho: ${rec.file_size}`);
    });
    
    if (recordings.length === 0) {
      console.log('❌ Nenhuma gravação encontrada para testar');
      return;
    }
    
    // 3. Testar streaming da primeira gravação
    // Usar uma gravação específica que sabemos que existe e está completa
    const testRecording = recordings.find(r => r.status === 'completed' && r.local_path) || 
                         recordings.find(r => r.id === 'e4bf5d06-131e-40e5-aff4-9c7efaeb2c82') || 
                         recordings.find(r => r.file_path && r.file_path.includes('test_recording')) || 
                         recordings.find(r => r.status === 'completed') || 
                         recordings[0];
    console.log('📹 Testando com gravação:', testRecording.id, '-', testRecording.filename);
    console.log('📁 Caminho do arquivo:', testRecording.file_path);
    console.log('📊 Status:', testRecording.status);
    console.log('📏 Tamanho:', testRecording.file_size);
    console.log(`\n3. Testando streaming da gravação: ${testRecording.filename}`);
    console.log(`   ID: ${testRecording.id}`);
    console.log(`   Status: ${testRecording.status}`);
    console.log(`   Tamanho: ${testRecording.file_size} bytes`);
    
    // 3a. Testar endpoint sem token (deve falhar)
    console.log('\n3a. Testando acesso sem token (deve falhar)...');
    const noTokenResponse = await fetch(`${API_BASE}/api/recordings/${testRecording.id}/stream`);
    console.log(`   Status sem token: ${noTokenResponse.status} ${noTokenResponse.statusText}`);
    
    // 3b. Testar endpoint com token via query parameter
    console.log('\n3b. Testando acesso com token via query parameter...');
    const streamUrl = `${API_BASE}/api/recordings/${testRecording.id}/stream?token=${encodeURIComponent(token)}`;
    const streamResponse = await fetch(streamUrl, {
      method: 'HEAD' // Usar HEAD para não baixar o arquivo completo
    });
    
    console.log(`   Status com token: ${streamResponse.status} ${streamResponse.statusText}`);
    console.log(`   Content-Type: ${streamResponse.headers.get('content-type')}`);
    console.log(`   Content-Length: ${streamResponse.headers.get('content-length')}`);
    console.log(`   Accept-Ranges: ${streamResponse.headers.get('accept-ranges')}`);
    
    if (streamResponse.ok) {
      console.log('✅ Endpoint de streaming funcionando corretamente');
      
      // 3c. Testar Range Request (importante para vídeo)
      console.log('\n3c. Testando Range Request...');
      const rangeResponse = await fetch(streamUrl, {
        headers: {
          'Range': 'bytes=0-1023' // Primeiros 1KB
        }
      });
      
      console.log(`   Status Range Request: ${rangeResponse.status} ${rangeResponse.statusText}`);
      console.log(`   Content-Range: ${rangeResponse.headers.get('content-range')}`);
      
      if (rangeResponse.status === 206) {
        console.log('✅ Range Requests funcionando (importante para vídeo)');
      } else {
        console.log('⚠️  Range Requests não funcionando adequadamente');
      }
      
    } else {
      console.log('❌ Erro no endpoint de streaming');
      const errorText = await streamResponse.text();
      console.log(`   Erro: ${errorText}`);
    }
    
    // 4. Testar endpoint de download
    console.log('\n4. Testando endpoint de download...');
    const downloadResponse = await fetch(`${API_BASE}/api/recordings/${testRecording.id}/download`, {
      method: 'HEAD',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log(`   Status download: ${downloadResponse.status} ${downloadResponse.statusText}`);
    
    if (downloadResponse.ok) {
      console.log('✅ Endpoint de download funcionando');
    } else {
      console.log('❌ Erro no endpoint de download');
    }
    
    // 5. Verificar se arquivo existe no sistema de arquivos
    console.log('\n5. Verificando arquivo no sistema...');
    if (testRecording.local_path) {
      const filePath = testRecording.local_path;
      console.log(`   Caminho: ${filePath}`);
      
      try {
        const stats = fs.statSync(filePath);
        console.log(`✅ Arquivo existe no sistema`);
        console.log(`   Tamanho real: ${stats.size} bytes`);
        console.log(`   Tamanho no DB: ${testRecording.file_size} bytes`);
        
        if (stats.size !== testRecording.file_size) {
          console.log('⚠️  Divergência entre tamanho real e registrado no DB');
        }
      } catch (err) {
        console.log(`❌ Arquivo não encontrado no sistema: ${err.message}`);
      }
    } else {
      console.log('⚠️  Caminho local não definido na gravação');
    }
    
  } catch (error) {
    console.error('❌ Erro durante o teste:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
  }
}

// Executar teste
testRecordingStream();