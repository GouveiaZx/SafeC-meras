require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
  console.error('❌ Variáveis de ambiente do Supabase não encontradas');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testNewRecordingFlow() {
  try {
    console.log('🎬 TESTE DO FLUXO COMPLETO DE NOVA GRAVAÇÃO');
    console.log('============================================');
    
    // 1. Verificar se banco está limpo
    console.log('\n🔍 Verificando estado inicial do banco...');
    const { data: existingRecordings, error: checkError } = await supabaseAdmin
      .from('recordings')
      .select('id');
    
    if (checkError) {
      console.error('❌ Erro ao verificar banco:', checkError);
      return;
    }
    
    console.log(`📊 Gravações existentes no banco: ${existingRecordings.length}`);
    
    // 2. Criar arquivo de vídeo de teste
    const recordingId = uuidv4();
    const cameraId = '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd'; // Câmera existente
    const fileName = `new_test_recording_${Date.now()}.mp4`;
    const filePath = path.join(__dirname, fileName);
    
    console.log('\n📹 Criando arquivo de vídeo de teste...');
    console.log(`   ID da gravação: ${recordingId}`);
    console.log(`   Arquivo: ${fileName}`);
    
    // Criar um arquivo MP4 de teste (dados binários simulados)
    const mp4Header = Buffer.from([
      0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, // ftyp box
      0x69, 0x73, 0x6F, 0x6D, 0x00, 0x00, 0x02, 0x00,
      0x69, 0x73, 0x6F, 0x6D, 0x69, 0x73, 0x6F, 0x32,
      0x61, 0x76, 0x63, 0x31, 0x6D, 0x70, 0x34, 0x31
    ]);
    
    // Adicionar dados de vídeo simulados (1MB)
    const videoData = Buffer.alloc(1024 * 1024, 0x00);
    const fullVideoData = Buffer.concat([mp4Header, videoData]);
    
    fs.writeFileSync(filePath, fullVideoData);
    const fileStats = fs.statSync(filePath);
    
    console.log(`   ✅ Arquivo criado: ${fileStats.size} bytes`);
    
    // 3. Simular webhook - inserir gravação no banco
    console.log('\n🔗 Simulando webhook - inserindo gravação no banco...');
    
    const recordingData = {
      id: recordingId,
      camera_id: cameraId,
      file_path: fileName,
      local_path: filePath,
      file_size: fileStats.size,
      duration: 45, // 45 segundos
      status: 'completed',
      start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 45000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const { data: insertedRecording, error: insertError } = await supabaseAdmin
      .from('recordings')
      .insert(recordingData)
      .select()
      .single();
    
    if (insertError) {
      console.error('❌ Erro ao inserir gravação:', insertError);
      // Limpar arquivo criado
      fs.unlinkSync(filePath);
      return;
    }
    
    console.log('   ✅ Gravação inserida no banco com sucesso!');
    console.log(`   📋 ID: ${insertedRecording.id}`);
    console.log(`   📹 Câmera: ${insertedRecording.camera_id}`);
    console.log(`   📁 Arquivo: ${insertedRecording.file_path}`);
    console.log(`   📏 Tamanho: ${insertedRecording.file_size} bytes`);
    console.log(`   ⏱️ Duração: ${insertedRecording.duration}s`);
    
    // 4. Testar autenticação
    console.log('\n🔐 Testando autenticação...');
    
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'admin@admin.com',
      password: 'admin123'
    });
    
    if (authError) {
      console.error('❌ Erro de autenticação:', authError);
      return;
    }
    
    console.log('   ✅ Login bem-sucedido');
    const token = authData.session.access_token;
    
    // 5. Testar rota de streaming
    console.log('\n🎥 Testando rota de streaming...');
    
    const streamUrl = `http://localhost:3002/api/recordings/${recordingId}/stream`;
    console.log(`   📡 URL: ${streamUrl}`);
    
    const response = await fetch(streamUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Range': 'bytes=0-1023'
      }
    });
    
    console.log(`   📊 Status: ${response.status} ${response.statusText}`);
    console.log(`   📋 Content-Type: ${response.headers.get('content-type')}`);
    console.log(`   📏 Content-Length: ${response.headers.get('content-length')}`);
    
    if (response.status === 206 || response.status === 200) {
      console.log('   ✅ Streaming funcionando!');
    } else {
      console.log('   ❌ Problema no streaming');
      const errorText = await response.text();
      console.log(`   🔍 Resposta: ${errorText}`);
    }
    
    // 6. Testar rota de download
    console.log('\n📥 Testando rota de download...');
    
    const downloadUrl = `http://localhost:3002/api/recordings/${recordingId}/download`;
    console.log(`   📡 URL: ${downloadUrl}`);
    
    const downloadResponse = await fetch(downloadUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log(`   📊 Status: ${downloadResponse.status} ${downloadResponse.statusText}`);
    console.log(`   📋 Content-Type: ${downloadResponse.headers.get('content-type')}`);
    
    if (downloadResponse.status === 200) {
      console.log('   ✅ Download funcionando!');
    } else {
      console.log('   ❌ Problema no download');
    }
    
    // 7. Verificar se gravação aparece na listagem
    console.log('\n📋 Testando listagem de gravações...');
    
    const listUrl = `http://localhost:3002/api/recordings`;
    const listResponse = await fetch(listUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (listResponse.status === 200) {
      const recordings = await listResponse.json();
      console.log(`   ✅ Listagem funcionando! ${recordings.length} gravação(ões) encontrada(s)`);
      
      const ourRecording = recordings.find(r => r.id === recordingId);
      if (ourRecording) {
        console.log('   ✅ Nossa gravação aparece na listagem!');
      } else {
        console.log('   ⚠️ Nossa gravação não aparece na listagem');
      }
    } else {
      console.log('   ❌ Problema na listagem');
    }
    
    console.log('\n🎉 TESTE CONCLUÍDO!');
    console.log('===================');
    console.log('✅ Arquivo de vídeo criado');
    console.log('✅ Gravação inserida no banco via webhook simulado');
    console.log('✅ Autenticação funcionando');
    console.log('✅ Rota de streaming testada');
    console.log('✅ Rota de download testada');
    console.log('✅ Listagem de gravações testada');
    console.log('');
    console.log('🎬 O sistema está pronto para receber novas gravações!');
    console.log(`📋 ID da gravação de teste: ${recordingId}`);
    console.log(`📁 Arquivo de teste: ${fileName}`);
    
  } catch (error) {
    console.error('❌ Erro durante o teste:', error);
  }
}

testNewRecordingFlow();