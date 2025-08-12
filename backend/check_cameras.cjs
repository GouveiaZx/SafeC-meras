#!/usr/bin/env node

const axios = require('axios');

const API_BASE = 'http://localhost:3002';

async function checkAvailableCameras() {
    console.log('🔍 Verificando câmeras disponíveis...\n');
    
    try {
        const response = await axios.get(`${API_BASE}/api/cameras`);
        const cameras = response.data;
        
        console.log(`📊 Total de câmeras encontradas: ${cameras.length}\n`);
        
        cameras.forEach((camera, index) => {
            console.log(`${index + 1}. ${camera.name}`);
            console.log(`   ID: ${camera.id}`);
            console.log(`   RTSP URL: ${camera.rtsp_url}`);
            console.log(`   Status: ${camera.status}`);
            console.log(`   Recording: ${camera.recording_enabled ? 'Ativado' : 'Desativado'}`);
            console.log(`   Criado em: ${camera.created_at}`);
            console.log('');
        });
        
        if (cameras.length > 0) {
            console.log('✅ Câmeras disponíveis para teste:');
            cameras.forEach(c => console.log(`   - ${c.id} (${c.name})`));
        } else {
            console.log('⚠️ Nenhuma câmera encontrada. Crie uma câmera antes de testar.');
        }
        
        return cameras;
    } catch (error) {
        console.error('❌ Erro ao buscar câmeras:', error.message);
        return [];
    }
}

checkAvailableCameras();