/**
 * Teste para verificar se a gravação pode ser recuperada via API
 */

async function testRecordingRetrieval() {
  try {
    const recordingId = 'd8ba71e8-5aaf-4090-9119-948fdda865d4';
    
    console.log('🔍 Testando recuperação da gravação:', recordingId);
    
    const response = await fetch(`http://localhost:3002/api/recordings/${recordingId}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Gravação recuperada com sucesso:');
      console.log('ID:', data.id);
      console.log('Filename:', data.filename);
      console.log('File Path:', data.file_path);
      console.log('File Size:', data.file_size);
      console.log('Duration:', data.duration);
      console.log('Status:', data.status);
      console.log('Camera ID:', data.camera_id);
      console.log('Start Time:', data.start_time);
      
      // Testar acesso ao arquivo
      const fs = await import('fs');
      const path = await import('path');
      
      const filePath = path.join(process.cwd(), 'recordings', data.file_path);
      console.log('\n📁 Verificando arquivo físico:', filePath);
      
      try {
        await fs.promises.access(filePath);
        console.log('✅ Arquivo físico acessível!');
        
        const stats = await fs.promises.stat(filePath);
        console.log('📊 Tamanho do arquivo:', stats.size, 'bytes');
        
      } catch (error) {
        console.log('❌ Erro ao acessar arquivo:', error.message);
      }
      
    } else {
      console.log('❌ Erro ao recuperar gravação:', response.status, response.statusText);
    }
    
  } catch (error) {
    console.log('❌ Erro na requisição:', error.message);
  }
}

testRecordingRetrieval();