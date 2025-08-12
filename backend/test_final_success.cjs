#!/usr/bin/env node

/**
 * Teste final do fluxo completo de gravação
 * Usa o caminho real do arquivo encontrado
 */

const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;

const API_BASE = 'http://localhost:3002';

// Caminho real do arquivo encontrado
const REAL_FILE_PATH = 'C:\\Users\\GouveiaRx\\Downloads\\NewCAM\\storage\\www\\record\\live\\4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd\\record\\live\\4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd\\2025-08-10\\2025-08-10-11-11-33-0.mp4';

// Teste com caminho correto baseado no que o ZLMediaKit enviaria
const testData = {
    start_time: Math.floor(Date.now() / 1000) - 3600,
    file_size: 101155463,
    time_len: 1800,
    file_path: '/opt/media/bin/www/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/2025-08-10/2025-08-10-11-11-33-0.mp4',
    file_name: '2025-08-10-11-11-33-0.mp4',
    folder: 'live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/2025-08-10',
    url: '/opt/media/bin/www/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/2025-08-10/2025-08-10-11-11-33-0.mp4',
    stream: '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd_live_720p',
    app: 'live'
};

console.log('🎯 Teste Final do Fluxo de Gravação');
console.log('=====================================');
console.log('Arquivo físico:', REAL_FILE_PATH);
console.log('Câmera ID:', '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd');
console.log('Stream:', testData.stream);
console.log('=====================================');

async function testWebhook() {
    try {
        console.log('📡 Enviando webhook para /api/webhooks/on_record_mp4...');
        
        const response = await axios.post(`${API_BASE}/api/webhooks/on_record_mp4`, testData, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });

        console.log('✅ Webhook executado com sucesso!');
        console.log('Resposta:', response.data);

        // Aguardar um momento para o banco ser atualizado
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verificar se a gravação foi criada no banco
        console.log('🔍 Verificando registro no banco de dados...');
        
        try {
            const checkResponse = await axios.get(`${API_BASE}/api/recordings`, {
                params: { camera_id: '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd' },
                timeout: 5000
            });
            
            if (checkResponse.data && checkResponse.data.length > 0) {
                const recording = checkResponse.data[0];
                console.log('✅ Gravação encontrada no banco!');
                console.log('ID:', recording.id);
                console.log('Filename:', recording.filename);
                console.log('File path:', recording.file_path);
                console.log('Status:', recording.status);
                
                // Testar URL do player
                const playerUrl = `${API_BASE}/api/recordings/${recording.id}/stream`;
                console.log('🎮 URL do player:', playerUrl);
                
                // Verificar se o arquivo está acessível
                try {
                    const fileExists = await fs.access(REAL_FILE_PATH);
                    console.log('✅ Arquivo físico acessível');
                } catch (error) {
                    console.log('❌ Arquivo físico não acessível:', error.message);
                }
                
            } else {
                console.log('⚠️ Nenhuma gravação encontrada para esta câmera');
            }
            
        } catch (dbError) {
            console.log('⚠️ Erro ao verificar banco:', dbError.message);
        }

    } catch (error) {
        console.log('❌ Erro no webhook:', error.response?.data || error.message);
        
        if (error.response?.data?.msg === 'Arquivo não encontrado') {
            console.log('\n🔍 Análise do problema:');
            console.log('Caminho esperado pelo servidor:');
            console.log('  Base:', path.join(process.cwd(), 'storage', 'www'));
            console.log('  Relativo: record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/2025-08-10/2025-08-10-11-11-33-0.mp4');
            console.log('  Absoluto:', path.join(process.cwd(), 'storage', 'www', 'record', 'live', '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd', 'record', 'live', '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd', '2025-08-10', '2025-08-10-11-11-33-0.mp4'));
            console.log('\nCaminho real do arquivo:');
            console.log('  ', REAL_FILE_PATH);
        }
    }
}

testWebhook();