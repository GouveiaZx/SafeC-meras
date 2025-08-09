import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Função para criar arquivo de vídeo simulado
function createMockVideoFile(filePath, sizeInBytes = 1024000) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    
    // Criar arquivo com dados simulados
    const buffer = Buffer.alloc(sizeInBytes, 0);
    fs.writeFileSync(filePath, buffer);
    
    return fs.statSync(filePath);
}

// Função para simular webhook do ZLMediaKit
async function simulateZLMediaKitWebhook(cameraId, recordingData) {
    console.log('📡 Simulando webhook do ZLMediaKit...');
    
    try {
        const response = await fetch('http://localhost:3002/api/webhook/zlmediakit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                hook: 'on_record_mp4',
                mediaServerId: 'test-server',
                app: 'live',
                stream: cameraId,
                file_path: recordingData.file_path,
                file_size: recordingData.file_size,
                folder: path.dirname(recordingData.file_path),
                start_time: Math.floor(Date.now() / 1000) - recordingData.duration,
                time_len: recordingData.duration,
                url: `rtmp://localhost/live/${cameraId}`,
                vhost: '__defaultVhost__'
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ Webhook processado com sucesso:', result);
            return result;
        } else {
            const error = await response.text();
            console.error('❌ Erro no webhook:', response.status, error);
            return null;
        }
    } catch (error) {
        console.error('❌ Erro ao chamar webhook:', error.message);
        return null;
    }
}

async function simulateCompleteRecordingFlow() {
    console.log('🎬 Simulando fluxo completo de gravação...');
    
    try {
        // 1. Verificar câmeras disponíveis
        console.log('\n1️⃣ Buscando câmeras disponíveis...');
        const { data: cameras, error: camerasError } = await supabase
            .from('cameras')
            .select('*')
            .eq('active', true);
            
        if (camerasError || !cameras || cameras.length === 0) {
            console.error('❌ Nenhuma câmera ativa encontrada:', camerasError);
            return;
        }
        
        const testCamera = cameras[0];
        console.log(`✅ Usando câmera: ${testCamera.name} (ID: ${testCamera.id})`);
        
        // 2. Criar arquivo de gravação simulado
        console.log('\n2️⃣ Criando arquivo de gravação simulado...');
        const timestamp = Date.now();
        const filename = `recording_${timestamp}.mp4`;
        const recordingsDir = path.join(__dirname, 'recordings');
        const filePath = path.join(recordingsDir, filename);
        
        const fileStats = createMockVideoFile(filePath, 2048000); // 2MB
        console.log(`✅ Arquivo criado: ${filePath} (${fileStats.size} bytes)`);
        
        // 3. Simular dados de gravação
        const recordingData = {
            camera_id: testCamera.id,
            filename: filename,
            file_path: filePath,
            file_size: fileStats.size,
            duration: 60, // 60 segundos
            start_time: new Date(timestamp - 60000).toISOString(),
            end_time: new Date(timestamp).toISOString()
        };
        
        // 4. Simular webhook do ZLMediaKit
        console.log('\n3️⃣ Simulando webhook do ZLMediaKit...');
        const webhookResult = await simulateZLMediaKitWebhook(testCamera.id, recordingData);
        
        if (!webhookResult) {
            console.error('❌ Webhook falhou, continuando com inserção manual...');
            
            // Inserção manual no banco
            const { data: newRecording, error: insertError } = await supabase
                .from('recordings')
                .insert([{
                    ...recordingData,
                    status: 'completed'
                }])
                .select()
                .single();
                
            if (insertError) {
                console.error('❌ Erro ao inserir gravação:', insertError);
                return;
            }
            
            console.log('✅ Gravação inserida manualmente no banco');
        }
        
        // 5. Verificar se a gravação foi salva corretamente
        console.log('\n4️⃣ Verificando gravação no banco...');
        const { data: savedRecordings, error: fetchError } = await supabase
            .from('recordings')
            .select('*')
            .eq('filename', filename);
            
        if (fetchError || !savedRecordings || savedRecordings.length === 0) {
            console.error('❌ Gravação não encontrada no banco:', fetchError);
            return;
        }
        
        const savedRecording = savedRecordings[0];
        console.log('✅ Gravação encontrada no banco:');
        console.log(`   ID: ${savedRecording.id}`);
        console.log(`   Arquivo: ${savedRecording.filename}`);
        console.log(`   Tamanho: ${savedRecording.file_size} bytes`);
        console.log(`   Status: ${savedRecording.status}`);
        
        // 6. Verificar se o arquivo físico ainda existe
        console.log('\n5️⃣ Verificando arquivo físico...');
        if (fs.existsSync(savedRecording.file_path)) {
            const currentStats = fs.statSync(savedRecording.file_path);
            console.log(`✅ Arquivo físico existe: ${currentStats.size} bytes`);
            
            if (currentStats.size === savedRecording.file_size) {
                console.log('✅ Tamanho do arquivo confere com o banco');
            } else {
                console.log('⚠️ Tamanho do arquivo difere do banco');
            }
        } else {
            console.error('❌ Arquivo físico não encontrado!');
        }
        
        // 7. Testar endpoint de download
        console.log('\n6️⃣ Testando endpoint de download...');
        try {
            const downloadResponse = await fetch(`http://localhost:3002/api/recordings/${savedRecording.id}/download`);
            
            if (downloadResponse.ok) {
                console.log('✅ Endpoint de download respondeu corretamente');
                console.log(`   Content-Type: ${downloadResponse.headers.get('content-type')}`);
                console.log(`   Content-Length: ${downloadResponse.headers.get('content-length')}`);
            } else {
                console.error(`❌ Erro no endpoint de download: ${downloadResponse.status}`);
            }
        } catch (error) {
            console.error('❌ Erro ao testar download:', error.message);
        }
        
        // 8. Testar endpoint de streaming
        console.log('\n7️⃣ Testando endpoint de streaming...');
        try {
            const streamResponse = await fetch(`http://localhost:3002/api/recordings/${savedRecording.id}/stream`);
            
            if (streamResponse.ok) {
                console.log('✅ Endpoint de streaming respondeu corretamente');
                console.log(`   Content-Type: ${streamResponse.headers.get('content-type')}`);
            } else {
                console.error(`❌ Erro no endpoint de streaming: ${streamResponse.status}`);
            }
        } catch (error) {
            console.error('❌ Erro ao testar streaming:', error.message);
        }
        
        console.log('\n🎉 Simulação do fluxo de gravação concluída!');
        console.log(`\n📋 Resumo:`);
        console.log(`   Gravação ID: ${savedRecording.id}`);
        console.log(`   Arquivo: ${savedRecording.filename}`);
        console.log(`   Caminho: ${savedRecording.file_path}`);
        console.log(`   Tamanho: ${savedRecording.file_size} bytes`);
        console.log(`   Status: ${savedRecording.status}`);
        
        return savedRecording;
        
    } catch (error) {
        console.error('❌ Erro durante a simulação:', error);
    }
}

// Executar simulação
simulateCompleteRecordingFlow();