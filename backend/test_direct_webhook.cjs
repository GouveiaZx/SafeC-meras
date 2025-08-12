#!/usr/bin/env node

/**
 * Teste direto do webhook com logs detalhados
 */

const axios = require('axios');

// Configuração do servidor
const SERVER_URL = 'http://localhost:3000';

console.log('🎯 Teste direto do webhook');
console.log('===========================');

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

console.log('📡 Enviando webhook para:', `${SERVER_URL}/api/webhooks/on_record_mp4`);
console.log('Dados:', JSON.stringify(webhookData, null, 2));

axios.post(`${SERVER_URL}/api/webhooks/on_record_mp4`, webhookData, {
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json'
    }
})
    .then(response => {
        console.log('✅ Webhook enviado com sucesso!');
        console.log('Status:', response.status);
        console.log('Resposta:', response.data);
    })
    .catch(error => {
        if (error.response) {
            console.log('❌ Erro no webhook:');
            console.log('Status:', error.response.status);
            console.log('Resposta:', error.response.data);
        } else {
            console.log('❌ Erro de rede:', error.message);
        }
    });