import RecordingService from './src/services/RecordingService.js';
import { createModuleLogger } from './src/config/logger.js';

const logger = createModuleLogger('UpdateMetadata');

async function updateRecordingMetadata() {
  console.log('=== ATUALIZAÇÃO DE METADADOS DE GRAVAÇÕES ===\n');
  
  try {
    // Executar atualização de estatísticas
    console.log('🔄 Iniciando atualização de metadados...');
    
    const result = await RecordingService.updateRecordingStatistics();
    
    console.log('\n📊 Resultado da atualização:');
    console.log(`  ✅ Gravações atualizadas: ${result.updated}`);
    console.log(`  ❌ Erros encontrados: ${result.errors}`);
    console.log(`  📁 Total processado: ${result.total}`);
    
    if (result.updated > 0) {
      console.log('\n🎉 Metadados atualizados com sucesso!');
    } else if (result.total === 0) {
      console.log('\n📝 Nenhuma gravação encontrada para atualização.');
    } else {
      console.log('\n⚠️ Nenhuma gravação foi atualizada. Verifique os logs para mais detalhes.');
    }
    
  } catch (error) {
    console.error('❌ Erro durante atualização de metadados:', error);
  }
}

updateRecordingMetadata();