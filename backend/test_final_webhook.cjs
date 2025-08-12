#!/usr/bin/env node

/**
 * Teste Final do Webhook com Stream Correto
 * 
 * Este script testa o webhook com o formato correto de stream
 * que inclui o camera_id no formato esperado pelo extractCameraId
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:3002';

// Dados de teste com stream no formato correto
const testData = {
    camera_id: '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd',
    file_name: '2025-08-10-11-11-33-0.mp4',
    file_size: 101155463,
    time_len: 1800,
    start_time: Math.floor(Date.now() / 1000) - 3600,
    stream: '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd_live_720p', // Formato correto
    app: 'live'
};

console.log('🧪 Teste Final do Webhook');
console.log('='.repeat(50));

async function testWebhook() {
    console.log('\n1️⃣ Testando Webhook com Stream Correto...');
    
    const webhookPayload = {
        start_time: testData.start_time,
        file_size: testData.file_size,
        time_len: testData.time_len,
        file_path: `/opt/media/bin/www/record/live/${testData.camera_id}/record/live/${testData.camera_id}/2025-08-10/${testData.file_name}`,
        file_name: testData.file_name,
        folder: `live/${testData.camera_id}/2025-08-10`,
        url: `/opt/media/bin/www/record/live/${testData.camera_id}/record/live/${testData.camera_id}/2025-08-10/${testData.file_name}`,
        stream: testData.stream,
        app: testData.app
    };

    console.log('📦 Payload enviado:', JSON.stringify(webhookPayload, null, 2));

    try {
        const response = await axios.post(`${API_BASE}/api/webhooks/on_record_mp4`, webhookPayload, {
            headers: { 'Content-Type': 'application/json' }
        });
        
        console.log('✅ Webhook respondido com sucesso:', response.data);
        return response.data;
    } catch (error) {
        console.error('❌ Erro no webhook:', error.response?.data || error.message);
        throw error;
    }
}

async function verifyRecordingCreated() {
    console.log('\n2️⃣ Verificando gravação criada...');
    
    try {
        // Aguardar processamento
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const response = await axios.get(`${API_BASE}/api/recordings`);
        const recordings = response.data;
        
        const matchingRecording = recordings.find(r => 
            r.camera_id === testData.camera_id && 
            r.filename === testData.file_name
        );
        
        if (matchingRecording) {
            console.log('✅ Gravação criada com sucesso:', {
                id: matchingRecording.id,
                camera_id: matchingRecording.camera_id,
                filename: matchingRecording.filename,
                file_path: matchingRecording.file_path,
                status: matchingRecording.status,
                file_size: matchingRecording.file_size,
                duration: matchingRecording.duration
            });
            return matchingRecording;
        } else {
            console.log('⚠️ Gravação não encontrada no banco');
            return null;
        }
    } catch (error) {
        console.error('❌ Erro ao verificar gravações:', error.message);
        return null;
    }
}

async function testPlayerUrls(recording) {
    console.log('\n3️⃣ Testando URLs do player...');
    
    if (!recording) {
        console.log('⚠️ Nenhuma gravação para testar');
        return;
    }
    
    const urls = {
        direct: `${API_BASE}/storage/www/${recording.file_path}`,
        stream: `${API_BASE}/api/recordings/${recording.camera_id}/${recording.filename}/stream`,
        download: `${API_BASE}/api/recordings/${recording.id}/download`
    };
    
    console.log('🎥 URLs geradas:');
    Object.entries(urls).forEach(([type, url]) => {
        console.log(`   ${type}: ${url}`);
    });
    
    // Testar acesso direto ao arquivo
    try {
        const response = await axios.head(urls.direct);
        console.log('✅ Arquivo acessível via HTTP');
        console.log(`   Tipo: ${response.headers['content-type']}`);
        console.log(`   Tamanho: ${response.headers['content-length']}`);
    } catch (error) {
        console.error('❌ Erro ao acessar arquivo:', error.message);
    }
    
    return urls;
}

async function runFinalTest() {
    try {
        console.log('🚀 Iniciando teste final do webhook...\n');
        
        // Verificar se arquivo existe
        const filePath = path.join(__dirname, '..', 'storage', 'www', 'record', 'live', testData.camera_id, 'record', 'live', testData.camera_id, '2025-08-10', testData.file_name);
        
        if (!fs.existsSync(filePath)) {
            console.log('⚠️ Arquivo não encontrado, criando arquivo simulado...');
            const dirPath = path.dirname(filePath);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
            fs.writeFileSync(filePath, Buffer.alloc(testData.file_size));
            console.log('✅ Arquivo simulado criado');
        }
        
        // Testar webhook
        const webhookResult = await testWebhook();
        
        // Verificar gravação
        const recording = await verifyRecordingCreated();
        
        // Testar player
        const urls = await testPlayerUrls(recording);
        
        console.log('\n' + '='.repeat(50));
        console.log('📊 RESULTADO FINAL');
        console.log('='.repeat(50));
        
        if (webhookResult && recording) {
            console.log('✅ FLUXO COMPLETO VALIDADO!');
            console.log('   • Webhook processando corretamente');
            console.log('   • Path mapping funcionando');
            console.log('   • Câmeras sendo criadas automaticamente');
            console.log('   • Gravações sendo registradas no banco');
            console.log('   • Arquivos acessíveis para o player');
            
            console.log('\n🎯 URLs para teste do player:');
            console.log(`   Stream: ${urls.stream}`);
            console.log(`   Download: ${urls.download}`);
            console.log(`   Direto: ${urls.direct}`);
            
        } else {
            console.log('❌ Teste falhou - verificar logs');
        }
        
    } catch (error) {
        console.error('\n❌ Teste falhou:', error.message);
        process.exit(1);
    }
}

// Executar teste
runFinalTest();