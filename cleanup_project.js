#!/usr/bin/env node

/**
 * Script de Limpeza do Projeto NewCAM
 * Remove arquivos irrelevantes, duplicados e temporários
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = __dirname;

// Lista de arquivos e diretórios para remoção
const itemsToRemove = [
  // Diretório duplicado completo
  'newcam-deploy',
  
  // Arquivos de backup
  'backend/zlmediakit/ZLMediaKit/conf/config.ini.backup.1754727453311',
  'newcam-deploy/backend/zlmediakit/ZLMediaKit/conf/config.ini.backup.1754727453311',
  
  // Arquivos de teste e debug no root do backend (mantendo apenas os essenciais)
  'backend/advanced_cleanup.js',
  'backend/check_active_recordings.js',
  'backend/check_admin_user.cjs',
  'backend/check_camera_recording_config.js',
  'backend/check_cameras.cjs',
  'backend/check_cameras.js',
  'backend/check_constraints.js',
  'backend/check_current_recordings.cjs',
  'backend/check_duplicate_recordings.js',
  'backend/check_recent_recordings.js',
  'backend/check_recording.js',
  'backend/check_recording_1d062cbb.cjs',
  'backend/check_recording_c9971b5f.cjs',
  'backend/check_recording_data.js',
  'backend/check_recording_status.js',
  'backend/check_recordings.cjs',
  'backend/check_recordings.js',
  'backend/check_recordings_data.js',
  'backend/check_recordings_db.js',
  'backend/check_recordings_debug.js',
  'backend/check_recordings_table.js',
  'backend/check_server_connectivity.js',
  'backend/check_specific_recording.cjs',
  'backend/check_specific_recording_53722dff.cjs',
  'backend/check_streams.js',
  'backend/check_supabase_recordings.js',
  'backend/check_system_status.js',
  'backend/check_table_structure.js',
  'backend/check_upload_status_constraint.js',
  'backend/check_users.js',
  'backend/check_zlm_config.js',
  'backend/clean_all_problematic_recordings.js',
  'backend/clean_all_recordings.cjs',
  'backend/clean_all_recordings.js',
  'backend/clean_recording_files.js',
  'backend/cleanup_duplicate_recordings.js',
  'backend/cleanup_invalid_recordings.js',
  'backend/confirm_user.js',
  'backend/create_missing_user.cjs',
  'backend/create_real_recording.js',
  'backend/create_recordings_for_files.js',
  'backend/create_specific_recording.cjs',
  'backend/create_test_recording.cjs',
  'backend/create_test_recording.js',
  'backend/create_test_user.js',
  'backend/create_test_user_for_recording.js',
  'backend/debug_auth.js',
  'backend/debug_auth_middleware.js',
  'backend/debug_auth_streaming.cjs',
  'backend/debug_path_check.cjs',
  'backend/debug_path_corrected.cjs',
  'backend/debug_path_mapping.js',
  'backend/debug_path_server.cjs',
  'backend/debug_path_test.cjs',
  'backend/debug_path_test.js',
  'backend/debug_recording_flow.js',
  'backend/debug_recording_paths.js',
  'backend/debug_recording_segmentation.js',
  'backend/debug_recordings.js',
  'backend/debug_recordings_structure.js',
  'backend/debug_stop_recording.js',
  'backend/debug_streaming.js',
  'backend/debug_user_cameras.js',
  'backend/debug_webhook_detailed.js',
  'backend/debug_webhook_flow.cjs',
  'backend/debug_webhook_logs.cjs',
  'backend/deep_debug_recording.js',
  'backend/ensure_recording_flow.js',
  'backend/final_test_recordings.js',
  'backend/fix-database-urls.js',
  'backend/fix_failed_recordings.js',
  'backend/fix_file_path_windows.cjs',
  'backend/fix_local_path.cjs',
  'backend/fix_orphan_recordings.js',
  'backend/fix_recording_file_paths.js',
  'backend/fix_recording_path.cjs',
  'backend/fix_recording_path.js',
  'backend/fix_recording_paths.js',
  'backend/fix_recording_status.js',
  'backend/fix_user_table.cjs',
  'backend/fix_zlm_segmentation.js',
  'backend/generate-test-token.js',
  'backend/get_auth_token.cjs',
  'backend/list_cameras.cjs',
  'backend/monitor_30min_recordings.js',
  'backend/recording_cleanup.js',
  'backend/recording_cleanup_report_1754694643649.json',
  'backend/recording_cleanup_report_1754694643660.json',
  'backend/reset_and_setup_recording.js',
  'backend/restore_valid_recordings.js',
  'backend/setup_auto_recording.js',
  'backend/simple_cleanup.js',
  'backend/simple_table_check.js',
  'backend/simulate_webhook.js',
  'backend/start_camera1_stream.cjs',
  'backend/start_camera1_stream.js',
  'backend/sync_all_recordings.js',
  'backend/sync_existing_cameras.js',
  'backend/sync_existing_recordings.js',
  'backend/sync_recordings.js',
  'backend/sync_recordings_with_files.cjs',
  
  // Arquivos de teste no root do backend (começando com test_)
  'backend/test_all_recordings.js',
  'backend/test_api_auth.js',
  'backend/test_assistir_gravacao.js',
  'backend/test_auth_api.js',
  'backend/test_auth_direct.js',
  'backend/test_camera_insert.js',
  'backend/test_complete_flow.js',
  'backend/test_complete_recording_flow.cjs',
  'backend/test_complete_recording_flow.js',
  'backend/test_correct_auth_flow.cjs',
  'backend/test_direct_webhook.cjs',
  'backend/test_download_debug.js',
  'backend/test_final_corrected.cjs',
  'backend/test_final_path.cjs',
  'backend/test_final_stream.cjs',
  'backend/test_final_success.cjs',
  'backend/test_final_webhook.cjs',
  'backend/test_frontend_auth.js',
  'backend/test_get_user.js',
  'backend/test_improved_system.js',
  'backend/test_manual_segmentation.js',
  'backend/test_new_recording_flow.cjs',
  'backend/test_new_recording_stream.cjs',
  'backend/test_new_recording_webhook.cjs',
  'backend/test_path_mapping.cjs',
  'backend/test_path_normalization.js',
  'backend/test_path_real.cjs',
  'backend/test_prepare_download.js',
  'backend/test_real_recording_flow.cjs',
  'backend/test_real_webhook.js',
  'backend/test_recording.js',
  'backend/test_recording_control_functions.js',
  'backend/test_recording_controls.js',
  'backend/test_recording_fixed.js',
  'backend/test_recording_player.js',
  'backend/test_recording_retrieval.js',
  'backend/test_recording_stream.js',
  'backend/test_recordings_api.js',
  'backend/test_recordings_curl.ps1',
  'backend/test_recordings_list.js',
  'backend/test_recordings_with_auth.js',
  'backend/test_segmentation_api.js',
  'backend/test_specific_streaming.cjs',
  'backend/test_stats_api.js',
  'backend/test_stream.js',
  'backend/test_stream_auth.js',
  'backend/test_stream_direct.cjs',
  'backend/test_stream_direct.js',
  'backend/test_stream_simple.js',
  'backend/test_streaming.js',
  'backend/test_streaming_route.js',
  'backend/test_streaming_route_1d062cbb.cjs',
  'backend/test_success_final.cjs',
  'backend/test_supabase_connection.js',
  'backend/test_user_cameras.js',
  'backend/test_valid_recording.js',
  'backend/test_valid_recordings.js',
  'backend/test_video_streaming.js',
  'backend/test_webhook.js',
  'backend/test_webhook_debug.js',
  'backend/test_webhook_detailed.cjs',
  'backend/test_webhook_es6.js',
  'backend/test_webhook_final.cjs',
  'backend/test_webhook_monitor.js',
  'backend/test_webhook_simple.js',
  'backend/test_webhook_success.cjs',
  'backend/test_with_auth.js',
  'backend/test_with_real_path.cjs',
  'backend/test_zlm_api.js',
  'backend/teste_final_integracao.js',
  'backend/update_recording_metadata.js',
  'backend/validacao_simples.js',
  'backend/validate_complete_flow.js',
  'backend/verify_path_fix.cjs',
  'backend/verify_recording_sync.js',
  
  // Arquivos de teste no root do projeto
  'test_complete_flow.js',
  'check_camera_config.js',
  'check_cameras.js',
  'check_frontend_console.js',
  'check_recording_enabled.js',
  'check_recordings.js',
  'cleanup_orphaned_recordings.js',
  'count_cameras.js',
  'create-test-camera.js',
  'debug_frontend_api.js',
  'debug_frontend_auth.js',
  'debug_hls_regex.js',
  'debug_simple_frontend.html',
  'delete_all_cameras.js',
  'fix-supabase-urls.js',
  'fix_camera_rtsp_url.js',
  'force_reconnect_cameras.js',
  'prevent-url-issues.js',
  'simulate_frontend_behavior.js',
  'simulate_recording_flow.js',
  'start_auto_recordings.js',
  'start_camera1_stream.js',
  'start_camera_streams.js',
  'test-stream-direct.js',
  'test_browser_console.js',
  'test_cameras_api.js',
  'test_complete_flow.js',
  'test_complete_recording_flow.js',
  'test_jwt_decode.js',
  'test_new_rtsp_url.js',
  'test_recording_endpoints.js',
  'test_recording_system.js',
  'test_recordings_api.js',
  'test_rtsp_connectivity.js',
  'test_rtsp_paths.js',
  'test_rtsp_port_554.js',
  'test_stream_direct.js',
  'test_stream_flow.js',
  'test_stream_with_auth.js',
  'test_streaming_init.js',
  'test_video_player.html',
  'validate-urls.js',
  
  // Arquivo ZIP de deploy
  'newcam-deploy.zip'
];

// Função para remover arquivo ou diretório
function removeItem(itemPath) {
  const fullPath = path.join(projectRoot, itemPath);
  
  try {
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      
      if (stats.isDirectory()) {
        console.log(`🗂️  Removendo diretório: ${itemPath}`);
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        console.log(`📄 Removendo arquivo: ${itemPath}`);
        fs.unlinkSync(fullPath);
      }
      
      return true;
    } else {
      console.log(`⚠️  Item não encontrado: ${itemPath}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Erro ao remover ${itemPath}:`, error.message);
    return false;
  }
}

// Função principal
function cleanupProject() {
  console.log('🧹 Iniciando limpeza do projeto NewCAM...');
  console.log('==========================================\n');
  
  let removedCount = 0;
  let totalCount = itemsToRemove.length;
  
  for (const item of itemsToRemove) {
    if (removeItem(item)) {
      removedCount++;
    }
  }
  
  console.log('\n📊 Resumo da limpeza:');
  console.log(`✅ Itens removidos: ${removedCount}`);
  console.log(`⚠️  Itens não encontrados: ${totalCount - removedCount}`);
  console.log(`📁 Total processado: ${totalCount}`);
  
  console.log('\n🎉 Limpeza concluída!');
  console.log('\n📋 Itens mantidos importantes:');
  console.log('   - backend/src/ (código fonte principal)');
  console.log('   - backend/tests/ (testes organizados)');
  console.log('   - frontend/ (aplicação frontend)');
  console.log('   - docker/ (configurações Docker)');
  console.log('   - docs/ (documentação)');
  console.log('   - scripts/ (scripts de produção)');
  console.log('   - worker/ (worker de processamento)');
}

// Executar limpeza
if (require.main === module) {
  cleanupProject();
}

module.exports = { cleanupProject, removeItem };