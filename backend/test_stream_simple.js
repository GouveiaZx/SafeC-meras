import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3002/api';

async function testStreamSimple() {
    try {
        console.log('🔍 Testando endpoint de streaming simples...');
        
        // 1. Login
        const loginResponse = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'admin@example.com',
                password: 'admin123'
            })
        });
        
        const loginData = await loginResponse.json();
        console.log('📋 Resposta do login:', loginData);
        
        if (!loginData.tokens || !loginData.tokens.accessToken) {
            console.log('❌ Falha no login:', loginData.message);
            return;
        }
        
        const token = loginData.tokens.accessToken;
        console.log('✅ Login realizado com sucesso');
        
        // 2. Buscar gravações
        const recordingsResponse = await fetch(`${API_BASE}/recordings`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const recordingsData = await recordingsResponse.json();
        const recordings = recordingsData.data.recordings;
        console.log(`✅ Encontradas ${recordings.length} gravações`);
        
        if (recordings.length === 0) {
            console.log('❌ Nenhuma gravação encontrada para testar');
            return;
        }
        
        // 3. Procurar gravação com arquivo de teste
        let testRecording = recordings.find(r => 
            r.file_path && r.file_path.includes('e4c3adb3-bc1a-4ed6-a92d-cb5f23a27e36')
        );
        
        if (!testRecording) {
            testRecording = recordings[0];
        }
        console.log('📹 Testando com gravação:', testRecording.id);
        console.log('📁 Caminho:', testRecording.file_path);
        console.log('📊 Status:', testRecording.status);
        
        // 4. Testar endpoint de streaming com HEAD request
        const streamUrl = `${API_BASE}/recordings/${testRecording.id}/stream?token=${token}`;
        console.log('🎬 URL de streaming:', streamUrl);
        
        const headResponse = await fetch(streamUrl, {
            method: 'HEAD',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        console.log('📊 Status da resposta HEAD:', headResponse.status);
        console.log('📋 Headers da resposta:');
        for (const [key, value] of headResponse.headers.entries()) {
            console.log(`   ${key}: ${value}`);
        }
        
        if (headResponse.status === 200) {
            console.log('✅ Endpoint de streaming está funcionando!');
            console.log('📏 Tamanho do arquivo:', headResponse.headers.get('content-length'));
            console.log('🎥 Tipo de conteúdo:', headResponse.headers.get('content-type'));
        } else {
            console.log('❌ Erro no endpoint de streaming:', headResponse.status);
            const errorText = await headResponse.text();
            console.log('📋 Resposta de erro:', errorText);
        }
        
    } catch (error) {
        console.error('❌ Erro durante o teste:', error.message);
        console.error('📋 Stack:', error.stack);
    }
}

testStreamSimple();