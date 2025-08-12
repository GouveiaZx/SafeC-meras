const axios = require('axios');

// Simular exatamente o comportamento do frontend
async function simulateFrontendBehavior() {
  try {
    console.log('🔄 [SIMULATE] Iniciando simulação do comportamento do frontend...');
    
    // 1. Fazer login
    console.log('🔐 [SIMULATE] Fazendo login...');
    const loginResponse = await axios.post('http://localhost:3002/api/auth/login', {
      email: 'admin@newcam.com',
      password: 'admin123'
    });
    
    const token = loginResponse.data.tokens?.accessToken;
    console.log('✅ [SIMULATE] Login realizado, token obtido');
    
    // 2. Buscar gravações (como o frontend faz)
    console.log('📡 [SIMULATE] Buscando gravações...');
    const recordingsResponse = await axios.get('http://localhost:3002/api/recordings', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('📊 [SIMULATE] Resposta da API:', {
      status: recordingsResponse.status,
      success: recordingsResponse.data?.success,
      dataLength: recordingsResponse.data?.data?.length
    });
    
    if (recordingsResponse.data?.success && recordingsResponse.data?.data) {
      const recordings = recordingsResponse.data.data;
      console.log('📹 [SIMULATE] Dados brutos da API:', recordings[0]);
      
      // 3. Mapear dados (como o frontend faz)
      console.log('🔄 [SIMULATE] Mapeando dados...');
      const mappedRecordings = recordings.map((recording) => {
        const mapped = {
          id: recording.id,
          cameraId: recording.camera_id,
          cameraName: recording.cameras?.name || 'Câmera Desconhecida',
          filename: recording.filename || 'Arquivo não especificado',
          startTime: recording.start_time ? new Date(recording.start_time) : null,
          endTime: recording.end_time ? new Date(recording.end_time) : null,
          duration: recording.time_len || 0,
          size: recording.file_size || 0,
          status: recording.status || 'unknown',
          localPath: recording.local_path,
          s3Url: recording.url,
          segments: recording.segments || [],
          metadata: recording.metadata || {}
        };
        
        console.log('🔄 [SIMULATE] Gravação mapeada:', {
          id: mapped.id,
          cameraId: mapped.cameraId,
          cameraName: mapped.cameraName,
          filename: mapped.filename,
          status: mapped.status
        });
        
        return mapped;
      });
      
      console.log('✅ [SIMULATE] Total de gravações mapeadas:', mappedRecordings.length);
      
      // 4. Aplicar filtros (como o frontend faz)
      console.log('🔍 [SIMULATE] Aplicando filtros...');
      const selectedCamera = 'all';
      const selectedStatus = 'all';
      const searchTerm = '';
      
      const filteredRecordings = mappedRecordings.filter((recording) => {
        // Camera filter
        if (selectedCamera !== 'all' && recording.cameraId !== selectedCamera) {
          console.log('❌ [SIMULATE] Filtrado por câmera');
          return false;
        }
        
        // Status filter
        if (selectedStatus !== 'all' && recording.status !== selectedStatus) {
          console.log('❌ [SIMULATE] Filtrado por status');
          return false;
        }
        
        // Search term filter
        if (searchTerm && !recording.filename.toLowerCase().includes(searchTerm.toLowerCase()) &&
            !recording.cameraName.toLowerCase().includes(searchTerm.toLowerCase())) {
          console.log('❌ [SIMULATE] Filtrado por busca');
          return false;
        }
        
        console.log('✅ [SIMULATE] Gravação passou no filtro:', recording.id);
        return true;
      });
      
      console.log('🎯 [SIMULATE] Resultado final:');
      console.log('📊 [SIMULATE] Total após filtro:', filteredRecordings.length);
      console.log('📋 [SIMULATE] Gravações finais:', filteredRecordings);
      
      if (filteredRecordings.length === 0) {
        console.log('❌ [SIMULATE] PROBLEMA: Nenhuma gravação após filtros!');
      } else {
        console.log('✅ [SIMULATE] Gravações devem aparecer na tela!');
      }
      
    } else {
      console.log('❌ [SIMULATE] API não retornou dados válidos');
    }
    
  } catch (error) {
    console.error('💥 [SIMULATE] Erro:', error.message);
    if (error.response) {
      console.error('💥 [SIMULATE] Response:', error.response.status, error.response.data);
    }
  }
}

simulateFrontendBehavior();