/**
 * Script para verificar todas as gravações no banco de dados
 * Investigar por que apenas 3 gravações aparecem no frontend
 */

import { config } from 'dotenv';
import { supabaseAdmin } from './src/config/database.js';
import { createModuleLogger } from './src/config/logger.js';

config();

const logger = createModuleLogger('TestAllRecordings');

async function testAllRecordings() {
  try {
    console.log('🔍 Verificando todas as gravações no banco de dados...');

    // Buscar todas as gravações
    const { data: allRecordings, error: allError } = await supabaseAdmin
      .from('recordings')
      .select(`
        *,
        cameras:camera_id (id, name, status)
      `)
      .order('created_at', { ascending: false });

    if (allError) {
      throw allError;
    }

    console.log(`\n📊 Total de gravações no banco: ${allRecordings.length}`);

    // Agrupar por status
    const byStatus = {};
    allRecordings.forEach(rec => {
      byStatus[rec.status] = (byStatus[rec.status] || 0) + 1;
    });

    console.log('\n📈 Gravações por status:');
    Object.entries(byStatus).forEach(([status, count]) => {
      console.log(`   ${status}: ${count}`);
    });

    // Agrupar por câmera
    const byCameraId = {};
    allRecordings.forEach(rec => {
      const cameraName = rec.cameras?.name || 'Câmera não encontrada';
      const key = `${cameraName} (${rec.camera_id})`;
      byCameraId[key] = (byCameraId[key] || 0) + 1;
    });

    console.log('\n📹 Gravações por câmera:');
    Object.entries(byCameraId).forEach(([camera, count]) => {
      console.log(`   ${camera}: ${count}`);
    });

    // Verificar gravações com status 'completed'
    const completedRecordings = allRecordings.filter(rec => rec.status === 'completed');
    console.log(`\n✅ Gravações com status 'completed': ${completedRecordings.length}`);

    if (completedRecordings.length > 0) {
      console.log('\nDetalhes das gravações completed:');
      completedRecordings.forEach((rec, index) => {
        console.log(`   ${index + 1}. ${rec.filename || 'Sem nome'} (${rec.id})`);
        console.log(`      Câmera: ${rec.cameras?.name || 'N/A'} (${rec.camera_id})`);
        console.log(`      Criada em: ${rec.created_at}`);
        console.log(`      File Path: ${rec.file_path || 'N/A'}`);
        console.log(`      S3 URL: ${rec.s3_url || 'N/A'}`);
        console.log(`      Duração: ${rec.duration || 0}s`);
        console.log(`      Tamanho: ${rec.file_size || 0} bytes`);
        console.log('');
      });
    }

    // Verificar gravações recentes (últimas 24h)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const recentRecordings = allRecordings.filter(rec => 
      new Date(rec.created_at) > yesterday
    );
    
    console.log(`\n🕐 Gravações das últimas 24h: ${recentRecordings.length}`);
    
    if (recentRecordings.length > 0) {
      console.log('\nGravações recentes:');
      recentRecordings.forEach((rec, index) => {
        console.log(`   ${index + 1}. ${rec.filename || 'Sem nome'} - Status: ${rec.status}`);
        console.log(`      Câmera: ${rec.cameras?.name || 'N/A'}`);
        console.log(`      Criada em: ${rec.created_at}`);
      });
    }

    // Testar o método searchRecordings com diferentes filtros
    console.log('\n🔍 Testando método searchRecordings...');
    const RecordingServiceModule = await import('./src/services/RecordingService.js');
    const RecordingService = RecordingServiceModule.default;
    
    // Buscar usuário admin
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('role', 'admin')
      .limit(1);
    
    if (users && users.length > 0) {
      const adminUser = users[0];
      
      // Teste 1: Sem filtros
      const result1 = await RecordingService.searchRecordings(adminUser.id, { limit: 50 });
      console.log(`\n📋 searchRecordings sem filtros: ${result1.total} total, ${result1.data.length} retornados`);
      
      // Teste 2: Apenas status completed
      const result2 = await RecordingService.searchRecordings(adminUser.id, { 
        status: 'completed',
        limit: 50 
      });
      console.log(`📋 searchRecordings status=completed: ${result2.total} total, ${result2.data.length} retornados`);
      
      // Teste 3: Todas as câmeras
      const { data: cameras } = await supabaseAdmin
        .from('cameras')
        .select('id, name')
        .eq('active', true);
      
      if (cameras && cameras.length > 0) {
        for (const camera of cameras) {
          const result = await RecordingService.searchRecordings(adminUser.id, { 
            camera_id: camera.id,
            limit: 50 
          });
          console.log(`📋 searchRecordings camera=${camera.name}: ${result.total} total, ${result.data.length} retornados`);
        }
      }
    }

  } catch (error) {
    console.error('❌ Erro ao verificar gravações:', error);
  }
}

testAllRecordings();