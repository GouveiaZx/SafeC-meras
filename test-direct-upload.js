import S3Service from './backend/src/services/S3Service.js';
import { promises as fs } from 'fs';
import path from 'path';

async function testDirectUpload() {
    console.log('🔄 Testando upload direto...');
    
    const filePath = 'storage/www/record/live/1dcb7a66-ffdc-4379-82fc-ba6d9c2764e0/2025-08-27/2025-08-27-04-30-01-0.mp4';
    const absolutePath = path.resolve(filePath);
    
    try {
        // Verificar se arquivo existe
        const stats = await fs.stat(absolutePath);
        console.log(`📁 Arquivo encontrado: ${absolutePath} (${stats.size} bytes)`);
        
        // Testar S3
        const s3Service = S3Service;
        const s3Key = `recordings/1dcb7a66-ffdc-4379-82fc-ba6d9c2764e0/2025-08-27/2025-08-27-04-30-01-0.mp4`;
        
        console.log(`☁️ Fazendo upload para S3: ${s3Key}`);
        
        const result = await s3Service.uploadFile(absolutePath, s3Key);
        console.log('✅ Upload realizado com sucesso:', result);
        
    } catch (error) {
        console.error('❌ Erro:', error.message);
    }
}

testDirectUpload();