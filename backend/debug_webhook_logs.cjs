#!/usr/bin/env node

/**
 * Debug dos logs do webhook em tempo real
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3002';

// Teste simples para gerar logs detalhados
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

console.log('🔍 Debug dos logs do webhook');
console.log('Enviando webhook...');

axios.post(`${API_BASE}/api/webhooks/on_record_mp4`, testData, {
    headers: { 'Content-Type': 'application/json' }
})
.then(response => {
    console.log('✅ Sucesso:', response.data);
})
.catch(error => {
    console.log('❌ Erro esperado:', error.response?.data?.msg);
    console.log('Verifique os logs do servidor para detalhes do caminho...');
});

console.log('Aguardando logs... (verifique o terminal do servidor)');