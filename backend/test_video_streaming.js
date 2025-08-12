/**
 * Script para testar o streaming de vídeo diretamente
 * Verifica se o problema está na autenticação ou no player
 */

import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
// Node 18+ possui fetch nativo - removido: import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testVideoStreaming() {
  console.log('🎬 === TESTE DE STREAMING DE VÍDEO ===\n');
  
  try {
    // 1. Buscar a gravação de teste criada
    console.log('1. 📋 Buscando gravação de teste...');
    const { data: recordings, error: recordingsError } = await supabase
      .from('recordings')
      .select('*')
      .eq('status', 'completed')
      .not('local_path', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (recordingsError || !recordings || recordings.length === 0) {
      console.error('❌ Erro ao buscar gravações:', recordingsError);
      return;
    }
    
    const recording = recordings[0];
    console.log('✅ Gravação encontrada:', {
      id: recording.id,
      filename: recording.filename,
      size: recording.file_size,
      duration: recording.duration
    });
    
    // 2. Buscar usuário ativo
    console.log('\n2. 👤 Buscando usuário ativo...');
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
      .eq('active', true)
      .limit(1);
    
    if (usersError || !users || users.length === 0) {
      console.error('❌ Erro ao buscar usuários:', usersError);
      return;
    }
    
    const user = users[0];
    console.log('✅ Usuário encontrado:', {
      id: user.id,
      email: user.email,
      role: user.role
    });
    
    // 3. Gerar token JWT
    console.log('\n3. 🔑 Gerando token JWT...');
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    console.log('✅ Token gerado:', token.substring(0, 50) + '...');
    
    // 4. Testar endpoint de streaming com HEAD
    console.log('\n4. 🎥 Testando endpoint de streaming (HEAD)...');
    const streamUrl = `http://localhost:3002/api/recordings/${recording.id}/stream?token=${encodeURIComponent(token)}`;
    
    console.log('🔍 URL de teste:', streamUrl);
    
    try {
      const headResponse = await fetch(streamUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      console.log('📊 Resposta HEAD:', {
        status: headResponse.status,
        statusText: headResponse.statusText,
        headers: {
          'content-type': headResponse.headers.get('content-type'),
          'content-length': headResponse.headers.get('content-length'),
          'accept-ranges': headResponse.headers.get('accept-ranges'),
          'access-control-allow-origin': headResponse.headers.get('access-control-allow-origin')
        }
      });
      
      if (headResponse.status === 200) {
        console.log('✅ HEAD request bem-sucedido!');
      } else {
        console.log('❌ HEAD request falhou');
        const errorText = await headResponse.text();
        console.log('Erro:', errorText);
      }
    } catch (error) {
      console.error('❌ Erro no HEAD request:', error.message);
    }
    
    // 5. Testar com Range Request (como o player faria)
    console.log('\n5. 📺 Testando com Range Request...');
    try {
      const rangeResponse = await fetch(streamUrl, {
        method: 'GET',
        headers: {
          'Range': 'bytes=0-1023',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      console.log('📊 Resposta Range:', {
        status: rangeResponse.status,
        statusText: rangeResponse.statusText,
        headers: {
          'content-type': rangeResponse.headers.get('content-type'),
          'content-length': rangeResponse.headers.get('content-length'),
          'content-range': rangeResponse.headers.get('content-range'),
          'accept-ranges': rangeResponse.headers.get('accept-ranges')
        }
      });
      
      if (rangeResponse.status === 206) {
        console.log('✅ Range request bem-sucedido!');
        const buffer = Buffer.from(await rangeResponse.arrayBuffer());
        console.log('📦 Dados recebidos:', buffer.length, 'bytes');
        
        // Verificar se é um arquivo MP4 válido (deve começar com bytes específicos)
        const mp4Header = buffer.slice(0, 8);
        console.log('🔍 Header do arquivo:', mp4Header.toString('hex'));
        
        // MP4 files typically start with 'ftyp' at offset 4
        if (buffer.length >= 8) {
          const ftypCheck = buffer.slice(4, 8).toString('ascii');
          console.log('🎬 Tipo de arquivo:', ftypCheck);
          if (ftypCheck === 'ftyp') {
            console.log('✅ Arquivo MP4 válido detectado!');
          } else {
            console.log('⚠️ Arquivo pode não ser MP4 válido');
          }
        }
      } else {
        console.log('❌ Range request falhou');
        const errorText = await rangeResponse.text();
        console.log('Erro:', errorText);
      }
    } catch (error) {
      console.error('❌ Erro no Range request:', error.message);
    }
    
    // 6. Testar URL direta no navegador
    console.log('\n6. 🌐 URL para teste no navegador:');
    console.log(streamUrl);
    console.log('\n💡 Copie a URL acima e cole no navegador para testar diretamente.');
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
}

testVideoStreaming();