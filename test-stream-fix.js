/**
 * Script de teste para verificar se o erro Camera.findByPk foi corrigido
 * Testa diretamente o UnifiedStreamingService
 */

import { UnifiedStreamingService } from './backend/src/services/UnifiedStreamingService.js';
import Camera from './backend/src/models/Camera.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Carregar variáveis de ambiente
dotenv.config({ path: join(__dirname, 'backend/.env') });

async function testStreamFix() {
  try {
    console.log('🔍 Testando correção do erro Camera.findByPk...');
    
    // Listar câmeras disponíveis
    console.log('📋 Buscando câmeras disponíveis...');
    const cameras = await Camera.findAll();
    
    if (!cameras || cameras.length === 0) {
      console.log('⚠️ Nenhuma câmera encontrada no sistema');
      return;
    }
    
    console.log(`✅ Encontradas ${cameras.length} câmeras`);
    const testCamera = cameras[0];
    console.log(`🎯 Testando com câmera: ${testCamera.name}