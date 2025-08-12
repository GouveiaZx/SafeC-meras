#!/usr/bin/env node

/**
 * Teste final corrigido com a porta correta (3002)
 */

const axios = require('axios');
const path = require('path');
const fs = require('fs');

// Configuração do servidor
const SERVER_URL = 'http://localhost:3002';

console.log('🎯 Teste Final do Fluxo de Gravação (Porta 3002)');
console.log('=============================================');

// Verificar arquivo físico
const filePath = 'C:\\Users\\GouveiaRx\\Downloads\\NewCAM\\storage\\www\\record\\live\\4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd\\record\\live\\4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd\\2025-08-10\\2025-08-10-11-11-33-0.mp4';
const fileExists = fs.existsSync(filePath);

console.log('Arquivo físico:', filePath);
console.log('Status do arquivo:', fileExists ? '✅ Encontrado' : '❌ Não encontrado');

// Dados do webhook
const webhookData = {
    start_time: '2025-08-10 11:11:33',
    file_size: 1048576,
    time_len: 30,
    file_path: '/opt/media/bin/www/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/2025-08-10/2025-08-10-11-11-33-0.mp4',
    file_name: '2025-08-10-11-11-33-0.mp4',
    folder: '/opt/media/bin/www/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/2025-08-10',
    url: '/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/2025-08-10/2025-08-10-11-11-33-0.mp4',
    app: 'record',
    stream: '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd_live_720p'
};

console.log('\n📡 Enviando webhook para:', `${SERVER_URL}/api/webhooks/on_record_mp4`);
console.log('Câmera ID:', '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd');
console.log('Stream:', '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd_live_720p');

axios.post(`${SERVER_URL}/api/webhooks/on_record_mp4`, webhookData, {
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json'
    }
})
    .then(response => {
        console.log('\n✅ Webhook enviado com sucesso!');
        console.log('Status:', response.status);
        console.log('Resposta:', response.data);
        
        // Verificar se a gravação foi criada
        setTimeout(() => {
            console.log('\n🔍 Verificando gravação no banco...');
            axios.get(`${SERVER_URL}/api/recordings/camera/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd`)
                .then(res => {
                    console.log('✅ Gravações encontradas:', res.data.length);
                    if (res.data.length > 0) {
                        console.log('Última gravação:', res.data[0]);
                    }
                })
                .catch(err => {
                    console.log('❌ Erro ao verificar gravações:', err.message);
                });
        }, 2000);
    })
    .catch(error => {
        console.log('\n❌ Erro no webhook:');
        if (error.response) {
            console.log('Status:', error.response.status);
            console.log('Resposta:', error.response.data);
        } else {
            console.log('Erro:', error.message);
        }
    });