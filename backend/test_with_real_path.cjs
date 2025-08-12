#!/usr/bin/env node

/**
 * Teste usando a lógica real do servidor com o caminho corrigido
 */

const axios = require('axios');
const path = require('path');

// Configuração do servidor
const SERVER_URL = 'http://localhost:3000';

console.log('🎯 Teste com caminho corrigido');
console.log('================================');

// Dados do webhook com caminho correto
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

console.log('📡 Enviando webhook...');

axios.post(`${SERVER_URL}/api/webhooks/on_record_mp4`, webhookData)
    .then(response => {
        console.log('✅ Webhook enviado com sucesso!');
        console.log('Resposta:', response.data);
    })
    .catch(error => {
        console.log('❌ Erro no webhook:', error.response?.data || error.message);
    });