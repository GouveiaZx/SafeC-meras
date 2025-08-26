/**
 * Script simplificado para limpeza de gravações
 */

import { supabaseAdmin } from '../config/database.js';

async function cleanRecordings() {
  console.log('🧹 Iniciando limpeza de gravações...');
  
  try {
    // Limpar registros do banco
    const { error: deleteError } = await supabaseAdmin
      .from('recordings')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (deleteError) {
      console.error('❌ Erro ao limpar registros:', deleteError);
      return;
    }
    
    // Verificar limpeza
    const { count } = await supabaseAdmin
      .from('recordings')
      .select('id', { count: 'exact', head: true });
    
    console.log(`✅ Limpeza concluída! Registros restantes: ${count || 0}`);
    console.log('🎯 Sistema pronto para teste do zero!');
    
  } catch (error) {
    console.error('❌ Erro na limpeza:', error);
  }
}

cleanRecordings();