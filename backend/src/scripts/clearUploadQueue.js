/**
 * Script para limpar filas de upload
 */

import { supabaseAdmin } from '../config/database.js';

async function clearQueues() {
  console.log('🧹 Limpando filas de upload...');
  
  try {
    // Limpar tabela upload_queue se existir
    try {
      const { error: queueError } = await supabaseAdmin
        .from('upload_queue')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      
      if (!queueError) {
        console.log('✅ Fila de upload limpa');
      } else {
        console.log('ℹ️ Tabela upload_queue não encontrada ou já vazia');
      }
    } catch (error) {
      console.log('ℹ️ Tabela upload_queue não existe');
    }

    // Verificar se há alguma tabela relacionada a estatísticas
    try {
      const { error: statsError } = await supabaseAdmin
        .from('upload_statistics')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      
      if (!statsError) {
        console.log('✅ Estatísticas de upload limpas');
      }
    } catch (error) {
      console.log('ℹ️ Tabela upload_statistics não existe');
    }

    console.log('✅ Limpeza de filas concluída!');
    
  } catch (error) {
    console.error('❌ Erro na limpeza de filas:', error);
  }
}

clearQueues();