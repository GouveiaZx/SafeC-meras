import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Carregar variáveis de ambiente
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = 'http://localhost:3002';

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Variáveis de ambiente do Supabase não encontradas');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testRecordingEndpoints() {
    console.log('🧪 Testando endpoints de gravação com autenticação...');
    
    try {
        // 1. Buscar uma gravação existente
        console.log('\n1️⃣ Buscando gravação mais recente...');
        const { data: recordings, error } = await supabase
            .from('recordings')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1);
            
        if (error) {
            console.error('❌ Erro ao buscar gravações:', error);
            return;
        }
        
        if (!recordings || recordings.length === 0) {
            console.log('❌ Nenhuma gravação encontrada no banco');
            return;
        }
        
        const recording = recordings[0];
        console.log('✅ Gravação encontrada:', {
            id: recording.id,
            filename: recording.filename,
            status: recording.status,
            file_size: recording.file_size
        });
        
        // 2. Testar endpoint de download sem autenticação
        console.log('\n2️⃣ Testando endpoint de download (sem auth)...');
        try {
            const downloadResponse = await fetch(`${baseUrl}/api/recordings/${recording.id}/download`);
            console.log(`Status: ${downloadResponse.status}`);
            
            if (downloadResponse.status === 401) {
                console.log('🔒 Endpoint requer autenticação (esperado)');
            } else if (downloadResponse.ok) {
                console.log('✅ Download funcionando');
            } else {
                console.log(`❌ Erro inesperado: ${downloadResponse.status}`);
            }
        } catch (error) {
            console.log('❌ Erro na requisição de download:', error.message);
        }
        
        // 3. Testar endpoint de streaming sem autenticação
        console.log('\n3️⃣ Testando endpoint de streaming (sem auth)...');
        try {
            const streamResponse = await fetch(`${baseUrl}/api/recordings/${recording.id}/stream`);
            console.log(`Status: ${streamResponse.status}`);
            
            if (streamResponse.status === 401) {
                console.log('🔒 Endpoint requer autenticação (esperado)');
            } else if (streamResponse.ok) {
                console.log('✅ Streaming funcionando');
            } else {
                console.log(`❌ Erro inesperado: ${streamResponse.status}`);
            }
        } catch (error) {
            console.log('❌ Erro na requisição de streaming:', error.message);
        }
        
        // 4. Testar acesso direto ao arquivo estático
        console.log('\n4️⃣ Testando acesso direto ao arquivo estático...');
        try {
            const staticResponse = await fetch(`${baseUrl}/recordings/${recording.filename}`);
            console.log(`Status: ${staticResponse.status}`);
            
            if (staticResponse.ok) {
                console.log('✅ Acesso direto ao arquivo funcionando');
                console.log(`Content-Type: ${staticResponse.headers.get('content-type')}`);
                console.log(`Content-Length: ${staticResponse.headers.get('content-length')}`);
            } else {
                console.log(`❌ Erro no acesso direto: ${staticResponse.status}`);
            }
        } catch (error) {
            console.log('❌ Erro no acesso direto:', error.message);
        }
        
        // 5. Verificar se o arquivo físico existe
        console.log('\n5️⃣ Verificando arquivo físico...');
        const fs = await import('fs');
        const path = await import('path');
        
        const recordingPath = path.join(process.cwd(), 'recordings', recording.filename);
        
        try {
            const stats = fs.statSync(recordingPath);
            console.log('✅ Arquivo físico existe:', {
                path: recordingPath,
                size: stats.size,
                created: stats.birthtime
            });
        } catch (error) {
            console.log('❌ Arquivo físico não encontrado:', recordingPath);
        }
        
        console.log('\n🎯 Teste concluído!');
        console.log('\n📋 Próximos passos:');
        console.log('   1. Verificar configuração de autenticação nos endpoints');
        console.log('   2. Testar com token válido se necessário');
        console.log('   3. Verificar se o acesso direto aos arquivos está funcionando');
        
    } catch (error) {
        console.error('❌ Erro durante o teste:', error);
    }
}

testRecordingEndpoints();