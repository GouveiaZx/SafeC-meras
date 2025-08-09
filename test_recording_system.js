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

async function testRecordingSystem() {
    console.log('🧪 Testando sistema de gravações...');
    
    try {
        // 1. Verificar câmeras configuradas
        console.log('\n1️⃣ Verificando câmeras configuradas...');
        const { data: cameras, error: camerasError } = await supabase
            .from('cameras')
            .select('*');
            
        if (camerasError) {
            console.error('❌ Erro ao buscar câmeras:', camerasError);
            return;
        }
        
        console.log(`✅ Encontradas ${cameras.length} câmeras:`);
        cameras.forEach(camera => {
            console.log(`   - ${camera.name} (ID: ${camera.id}, Status: ${camera.status})`);
        });
        
        // 2. Verificar gravações existentes
        console.log('\n2️⃣ Verificando gravações existentes...');
        const { data: recordings, error: recordingsError } = await supabase
            .from('recordings')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);
            
        if (recordingsError) {
            console.error('❌ Erro ao buscar gravações:', recordingsError);
            return;
        }
        
        console.log(`✅ Encontradas ${recordings.length} gravações recentes:`);
        recordings.forEach(recording => {
            console.log(`   - ${recording.filename} (Câmera: ${recording.camera_id}, Status: ${recording.status})`);
            console.log(`     Arquivo: ${recording.file_path}`);
            console.log(`     Tamanho: ${recording.file_size} bytes`);
            
            // Verificar se o arquivo existe
            if (recording.file_path && fs.existsSync(recording.file_path)) {
                console.log(`     ✅ Arquivo físico existe`);
            } else {
                console.log(`     ❌ Arquivo físico NÃO existe`);
            }
            console.log('');
        });
        
        // 3. Testar criação de gravação simulada
        console.log('\n3️⃣ Testando criação de gravação simulada...');
        
        if (cameras.length > 0) {
            const testCamera = cameras[0];
            const testRecording = {
                camera_id: testCamera.id,
                filename: `test_recording_${Date.now()}.mp4`,
                file_path: path.join(__dirname, 'recordings', `test_recording_${Date.now()}.mp4`),
                file_size: 1024000, // 1MB simulado
                duration: 30, // 30 segundos
                status: 'completed',
                start_time: new Date().toISOString(),
                end_time: new Date(Date.now() + 30000).toISOString()
            };
            
            const { data: newRecording, error: insertError } = await supabase
                .from('recordings')
                .insert([testRecording])
                .select()
                .single();
                
            if (insertError) {
                console.error('❌ Erro ao inserir gravação de teste:', insertError);
            } else {
                console.log('✅ Gravação de teste criada com sucesso:');
                console.log(`   ID: ${newRecording.id}`);
                console.log(`   Arquivo: ${newRecording.filename}`);
                
                // Limpar gravação de teste
                await supabase
                    .from('recordings')
                    .delete()
                    .eq('id', newRecording.id);
                console.log('🧹 Gravação de teste removida');
            }
        }
        
        // 4. Verificar estrutura de diretórios
        console.log('\n4️⃣ Verificando estrutura de diretórios...');
        const recordingsDir = path.join(__dirname, 'recordings');
        
        if (fs.existsSync(recordingsDir)) {
            console.log('✅ Diretório de gravações existe');
            const files = fs.readdirSync(recordingsDir);
            console.log(`   Arquivos encontrados: ${files.length}`);
            
            files.slice(0, 5).forEach(file => {
                const filePath = path.join(recordingsDir, file);
                const stats = fs.statSync(filePath);
                console.log(`   - ${file} (${stats.size} bytes)`);
            });
        } else {
            console.log('❌ Diretório de gravações não existe');
        }
        
        console.log('\n🎉 Teste do sistema de gravações concluído!');
        
    } catch (error) {
        console.error('❌ Erro durante o teste:', error);
    }
}

// Executar teste
testRecordingSystem();