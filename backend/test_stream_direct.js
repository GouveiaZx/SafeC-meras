import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3002/api';

async function testStreamDirect() {
    try {
        console.log('🔍 Testando endpoint de streaming diretamente...');
        
        // 1. Login
        const loginResponse = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: 'admin@example.com',
                password: 'admin123'
            })
        });
        
        const loginData = await loginResponse.json();
        const token = loginData.tokens?.accessToken;
        
        if (!token) {
            console.error('❌ Falha no login');
            return;
        }
        
        console.log('✅ Login realizado com sucesso');
        
        // 2. Buscar gravações
        const recordingsResponse = await fetch(`${API_BASE}/recordings`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const recordingsData = await recordingsResponse.json();
        console.log('📋 Resposta das gravações:', JSON.stringify(recordingsData, null, 2));
        
        const recordings = recordingsData.data || recordingsData;
        console.log(`✅ Encontradas ${recordings?.length || 0} gravações`);
        
        if (!recordings || recordings.length === 0) {
            console.log('❌ Nenhuma gravação encontrada');
            return;
        }
        
        // 3. Procurar gravação com arquivo de teste ou usar a primeira
        let testRecording = recordings.find(r => 
            r.file_path && r.file_path.includes('e4c3adb3-bc1a-4ed6-a92d-cb5f23a27e36')
        );
        
        if (!testRecording) {
            testRecording = recordings[0];
        }
        console.log('📹 Testando com gravação:', testRecording.id);
        console.log('📁 Caminho:', testRecording.file_path);
        console.log('📊 Status:', testRecording.status);
        
        // 4. Testar endpoint de streaming
        console.log('\n🎬 Testando endpoint de streaming...');
        
        const streamResponse = await fetch(`${API_BASE}/recordings/${testRecording.id}/stream?token=${token}`, {
            method: 'GET',
            headers: {
                'Range': 'bytes=0-1023' // Solicitar apenas os primeiros 1024 bytes
            }
        });
        
        console.log('📊 Status da resposta:', streamResponse.status, streamResponse.statusText);
        console.log('📋 Headers da resposta:');
        for (const [key, value] of streamResponse.headers.entries()) {
            console.log(`   ${key}: ${value}`);
        }
        
        if (streamResponse.ok) {
            const buffer = await streamResponse.buffer();
            console.log('✅ Streaming funcionando!');
            console.log('📏 Tamanho da resposta:', buffer.length, 'bytes');
            console.log('🔍 Primeiros bytes:', buffer.slice(0, 20).toString('hex'));
        } else {
            const errorText = await streamResponse.text();
            console.log('❌ Erro no streaming:');
            console.log('📄 Resposta:', errorText);
        }
        
    } catch (error) {
        console.error('❌ Erro durante o teste:', error.message);
        console.error('📋 Stack:', error.stack);
    }
}

testStreamDirect();