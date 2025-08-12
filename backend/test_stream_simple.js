// Node 18+ possui fetch nativo - removido: import fetch from 'node-fetch';

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
        const recordings = Array.isArray(recordingsData?.data)
            ? recordingsData.data
            : (recordingsData?.data?.recordings ?? recordingsData?.recordings ?? []);
        
        if (!Array.isArray(recordings)) {
            console.log('❌ Resposta inesperada da API de gravações:', JSON.stringify(recordingsData, null, 2));
            return;
        }
        
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

            // --- Validações de cache e range ---
            const etag = headResponse.headers.get('etag');
            const lastModified = headResponse.headers.get('last-modified');
            const acceptRanges = headResponse.headers.get('accept-ranges');
            if (!etag || !lastModified || acceptRanges !== 'bytes') {
                console.log('⚠️ Cabeçalhos esperados ausentes ou incorretos:', { etag, lastModified, acceptRanges });
            } else {
                console.log('✅ Cabeçalhos de cache/range presentes');
            }

            // 4.1 Repetir HEAD com If-None-Match (ETag) esperando 304
            if (etag) {
                const headIfNoneMatch = await fetch(streamUrl, {
                    method: 'HEAD',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'If-None-Match': etag
                    }
                });
                console.log('📊 HEAD com If-None-Match status:', headIfNoneMatch.status);
                if (headIfNoneMatch.status === 304) {
                    console.log('✅ Cache por ETag funcionando (304 Not Modified)');
                } else {
                    console.log('⚠️ Esperado 304 com ETag, recebido:', headIfNoneMatch.status);
                }
            }

            // 4.2 Repetir HEAD com If-Modified-Since esperando 304
            if (lastModified) {
                const headIfModifiedSince = await fetch(streamUrl, {
                    method: 'HEAD',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'If-Modified-Since': lastModified
                    }
                });
                console.log('📊 HEAD com If-Modified-Since status:', headIfModifiedSince.status);
                if (headIfModifiedSince.status === 304) {
                    console.log('✅ Cache por Last-Modified funcionando (304 Not Modified)');
                } else {
                    console.log('⚠️ Esperado 304 com Last-Modified, recebido:', headIfModifiedSince.status);
                }
            }

            // 4.3 GET parcial com Range para verificar 206 e Content-Range
            const rangeResponse = await fetch(streamUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Range': 'bytes=0-39'
                }
            });
            console.log('📊 GET parcial (Range) status:', rangeResponse.status);
            const contentRange = rangeResponse.headers.get('content-range');
            const partialLength = parseInt(rangeResponse.headers.get('content-length') || '0', 10);
            console.log('📋 Content-Range:', contentRange);
            console.log('📏 Content-Length (parcial):', partialLength);
            if (rangeResponse.status === 206 && contentRange && contentRange.startsWith('bytes 0-39/')) {
                const buf = Buffer.from(await rangeResponse.arrayBuffer());
                console.log('✅ Streaming parcial funcionando!');
                console.log('📐 Bytes retornados:', buf.length);
            } else {
                console.log('⚠️ Resposta inesperada no GET parcial');
                try {
                    const errText = await rangeResponse.text();
                    console.log('📄 Corpo:', errText);
                } catch {}
            }
            // --- Fim validações ---
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