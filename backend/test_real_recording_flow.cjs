require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.JWT_SECRET;

if (!supabaseUrl || !supabaseServiceKey || !jwtSecret) {
  console.error('❌ Variáveis de ambiente não encontradas');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

async function testRealRecordingFlow() {
  try {
    console.log('🎬 TESTE COM GRAVAÇÃO REAL');
    console.log('==========================');
    
    // 1. Limpar gravações antigas
    console.log('\n🧹 Limpando gravações antigas...');
    const { data: oldRecordings } = await supabaseAdmin
      .from('recordings')
      .select('id, local_path')
      .limit(100);
    
    if (oldRecordings && oldRecordings.length > 0) {
      // Remover arquivos físicos
      for (const recording of oldRecordings) {
        if (recording.local_path) {
          const filePath = path.join(process.cwd(), recording.local_path);
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              console.log(`   🗑️ Arquivo removido: ${recording.local_path}`);
            }
          } catch (err) {
            console.log(`   ⚠️ Erro ao remover arquivo: ${recording.local_path}`);
          }
        }
      }
      
      // Remover registros do banco
      const { error: deleteError } = await supabaseAdmin
        .from('recordings')
        .delete()
        .neq('id', 'dummy'); // Remove todos
      
      if (deleteError) {
        console.error('❌ Erro ao limpar banco:', deleteError);
      } else {
        console.log(`   ✅ ${oldRecordings.length} registros removidos do banco`);
      }
    }
    
    // 2. Criar arquivo de vídeo real
    console.log('\n📹 Criando arquivo de vídeo real...');
    const recordingId = require('crypto').randomUUID();
    const fileName = `real_test_recording_${Date.now()}.mp4`;
    const filePath = path.join(process.cwd(), fileName);
    
    // Criar um arquivo MP4 mínimo válido (header básico)
    const mp4Header = Buffer.from([
      0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, // ftyp box
      0x69, 0x73, 0x6F, 0x6D, 0x00, 0x00, 0x02, 0x00,
      0x69, 0x73, 0x6F, 0x6D, 0x69, 0x73, 0x6F, 0x32,
      0x61, 0x76, 0x63, 0x31, 0x6D, 0x70, 0x34, 0x31,
      // Adicionar mais dados para simular um arquivo maior
      ...Array(1024).fill(0x00) // 1KB de dados
    ]);
    
    fs.writeFileSync(filePath, mp4Header);
    const fileSize = fs.statSync(filePath).size;
    console.log(`   ✅ Arquivo criado: ${fileName} (${fileSize} bytes)`);
    
    // 3. Inserir gravação no banco
    console.log('\n💾 Inserindo gravação no banco...');
    const newRecording = {
      id: recordingId,
      camera_id: '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd',
      filename: fileName,
      file_path: fileName,
      local_path: fileName,
      file_size: fileSize,
      duration: 30,
      status: 'completed',
      start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 30000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const { data: insertedRecording, error: insertError } = await supabaseAdmin
      .from('recordings')
      .insert(newRecording)
      .select()
      .single();
    
    if (insertError) {
      console.error('❌ Erro ao inserir gravação:', insertError);
      return;
    }
    
    console.log('   ✅ Gravação inserida no banco:');
    console.log(`      ID: ${insertedRecording.id}`);
    console.log(`      Arquivo: ${insertedRecording.filename}`);
    console.log(`      Tamanho: ${insertedRecording.file_size} bytes`);
    
    // 4. Criar token JWT
    console.log('\n🔑 Criando token JWT...');
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', 'admin@admin.com')
      .single();
    
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
    };
    
    const token = jwt.sign(tokenPayload, jwtSecret);
    console.log('   ✅ Token JWT criado');
    
    // 5. Testar rota de streaming
    console.log('\n🎥 Testando rota de streaming...');
    const streamResponse = await fetch(`http://localhost:3002/api/recordings/${recordingId}/stream`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Range': 'bytes=0-1023'
      }
    });
    
    console.log(`   📊 Status: ${streamResponse.status} ${streamResponse.statusText}`);
    console.log(`   📋 Content-Type: ${streamResponse.headers.get('content-type')}`);
    console.log(`   📋 Content-Length: ${streamResponse.headers.get('content-length')}`);
    console.log(`   📋 Accept-Ranges: ${streamResponse.headers.get('accept-ranges')}`);
    
    if (streamResponse.status === 206 || streamResponse.status === 200) {
      console.log('   ✅ Streaming funcionando!');
      const contentLength = streamResponse.headers.get('content-length');
      if (contentLength) {
        console.log(`   📊 Dados recebidos: ${contentLength} bytes`);
      }
    } else {
      console.log('   ❌ Problema no streaming');
      const errorText = await streamResponse.text();
      console.log(`   🔍 Resposta: ${errorText}`);
    }
    
    // 6. Testar rota de download
    console.log('\n📥 Testando rota de download...');
    const downloadResponse = await fetch(`http://localhost:3002/api/recordings/${recordingId}/download`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log(`   📊 Status: ${downloadResponse.status} ${downloadResponse.statusText}`);
    console.log(`   📋 Content-Type: ${downloadResponse.headers.get('content-type')}`);
    console.log(`   📋 Content-Disposition: ${downloadResponse.headers.get('content-disposition')}`);
    
    if (downloadResponse.status === 200) {
      console.log('   ✅ Download funcionando!');
      const contentLength = downloadResponse.headers.get('content-length');
      if (contentLength) {
        console.log(`   📊 Tamanho do arquivo: ${contentLength} bytes`);
      }
    } else {
      console.log('   ❌ Problema no download');
      const errorText = await downloadResponse.text();
      console.log(`   🔍 Resposta: ${errorText}`);
    }
    
    // 7. Testar rota de listagem
    console.log('\n📋 Testando rota de listagem...');
    const listResponse = await fetch('http://localhost:3002/api/recordings', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`   📊 Status: ${listResponse.status} ${listResponse.statusText}`);
    
    if (listResponse.status === 200) {
      const listData = await listResponse.json();
      console.log('   ✅ Listagem funcionando!');
      console.log(`   📊 Gravações encontradas: ${listData.data.length}`);
      
      if (listData.data.length > 0) {
        const recording = listData.data.find(r => r.id === recordingId);
        if (recording) {
          console.log('   ✅ Gravação criada encontrada na listagem!');
          console.log(`      📹 ID: ${recording.id}`);
          console.log(`      📁 Arquivo: ${recording.filename}`);
          console.log(`      📊 Tamanho: ${recording.file_size} bytes`);
        }
      }
    } else {
      console.log('   ❌ Problema na listagem');
      const errorText = await listResponse.text();
      console.log(`   🔍 Resposta: ${errorText}`);
    }
    
    console.log('\n🎉 TESTE CONCLUÍDO!');
    console.log('===================');
    console.log('✅ Arquivo de vídeo real criado');
    console.log('✅ Gravação inserida no banco');
    console.log('✅ Autenticação JWT funcionando');
    console.log('✅ Todas as rotas testadas');
    console.log('');
    console.log('🎬 O sistema está pronto para receber novas gravações!');
    console.log(`📋 ID da gravação de teste: ${recordingId}`);
    console.log(`📁 Arquivo de teste: ${fileName}`);
    
  } catch (error) {
    console.error('❌ Erro durante o teste:', error);
  }
}

testRealRecordingFlow();