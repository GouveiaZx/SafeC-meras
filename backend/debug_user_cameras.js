import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis de ambiente do Supabase não encontradas');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debugUserCameras() {
  console.log('🔍 Debugando acesso do usuário às câmeras...');
  
  try {
    // 1. Buscar usuário admin
    console.log('\n1. Buscando usuário admin...');
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
      .eq('email', 'admin@newcam.com')
      .single();
    
    if (usersError) {
      console.error('❌ Erro ao buscar usuário:', usersError);
      return;
    }
    
    if (!users) {
      console.log('❌ Usuário admin não encontrado');
      return;
    }
    
    console.log('✅ Usuário encontrado:');
    console.log(`   - ID: ${users.id}`);
    console.log(`   - Nome: ${users.name}`);
    console.log(`   - Email: ${users.email}`);
    console.log(`   - Role: ${users.role}`);
    console.log(`   - Active: ${users.active}`);
    console.log(`   - Camera Access: ${JSON.stringify(users.camera_access)}`);
    
    // 2. Buscar todas as câmeras
    console.log('\n2. Buscando todas as câmeras...');
    const { data: allCameras, error: camerasError } = await supabase
      .from('cameras')
      .select('*')
      .eq('active', true);
    
    if (camerasError) {
      console.error('❌ Erro ao buscar câmeras:', camerasError);
      return;
    }
    
    console.log(`✅ Total de câmeras ativas: ${allCameras.length}`);
    allCameras.forEach((camera, index) => {
      console.log(`   ${index + 1}. ${camera.name} (${camera.id}) - Status: ${camera.status} - Created by: ${camera.created_by}`);
    });
    
    // 3. Verificar lógica de acesso
    console.log('\n3. Verificando lógica de acesso...');
    
    if (users.role === 'admin') {
      console.log('✅ Usuário é ADMIN - deve ter acesso a todas as câmeras');
    } else {
      console.log(`⚠️ Usuário não é admin (role: ${users.role})`);
      if (!users.camera_access || users.camera_access.length === 0) {
        console.log('❌ Usuário não tem camera_access definido - não terá acesso a nenhuma câmera');
      } else {
        console.log(`✅ Usuário tem acesso a ${users.camera_access.length} câmeras:`);
        users.camera_access.forEach(cameraId => {
          const camera = allCameras.find(c => c.id === cameraId);
          if (camera) {
            console.log(`   - ${camera.name} (${camera.id})`);
          } else {
            console.log(`   - Câmera não encontrada: ${cameraId}`);
          }
        });
      }
    }
    
    // 4. Simular a lógica do Camera.findByUserId
    console.log('\n4. Simulando Camera.findByUserId...');
    
    let accessibleCameras = [];
    
    if (users.role === 'admin') {
      accessibleCameras = allCameras;
    } else {
      if (users.camera_access && users.camera_access.length > 0) {
        accessibleCameras = allCameras.filter(camera => 
          users.camera_access.includes(camera.id)
        );
      }
    }
    
    console.log(`✅ Câmeras acessíveis para o usuário: ${accessibleCameras.length}`);
    accessibleCameras.forEach((camera, index) => {
      console.log(`   ${index + 1}. ${camera.name} (${camera.id})`);
    });
    
    // 5. Buscar gravações para essas câmeras
    console.log('\n5. Buscando gravações para câmeras acessíveis...');
    
    if (accessibleCameras.length > 0) {
      const cameraIds = accessibleCameras.map(c => c.id);
      
      const { data: recordings, error: recordingsError } = await supabase
        .from('recordings')
        .select('*')
        .in('camera_id', cameraIds)
        .eq('status', 'recording');
      
      if (recordingsError) {
        console.error('❌ Erro ao buscar gravações:', recordingsError);
        return;
      }
      
      console.log(`✅ Gravações ativas encontradas: ${recordings.length}`);
      recordings.forEach((recording, index) => {
        const camera = accessibleCameras.find(c => c.id === recording.camera_id);
        console.log(`   ${index + 1}. ${recording.id} - Câmera: ${camera?.name || recording.camera_id} - Iniciada: ${recording.start_time}`);
      });
    } else {
      console.log('❌ Nenhuma câmera acessível - não há gravações para mostrar');
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
}

debugUserCameras();