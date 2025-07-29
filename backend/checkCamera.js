import axios from 'axios';

async function checkCamera() {
  try {
    // Login
    const loginResponse = await axios.post('http://localhost:3002/api/auth/login', {
      email: 'admin@newcam.com',
      password: 'admin123'
    });
    
    const token = loginResponse.data.tokens.accessToken;
    console.log('✅ Login realizado com sucesso');
    
    // Buscar câmera
    const cameraResponse = await axios.get('http://localhost:3002/api/cameras/6dbc956c-c965-4342-b591-4285cc7ab401', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    
    const camera = cameraResponse.data.data;
    
    console.log('📷 Dados da câmera:');
    console.log('ID:', camera.id);
    console.log('Nome:', camera.name);
    console.log('RTSP URL:', camera.rtsp_url);
    console.log('RTMP URL:', camera.rtmp_url);
    console.log('IP:', camera.ip_address);
    console.log('Porta:', camera.port);
    console.log('Status:', camera.status);
    
    if (camera.rtsp_url === null) {
      console.log('\n🔍 CONFIRMADO: A câmera NÃO tem URL RTSP configurada!');
      console.log('✅ Isso deveria gerar um erro 400, não 500');
    } else {
      console.log('\n📡 A câmera tem URL RTSP configurada:', camera.rtsp_url);
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.response?.data || error.message);
  }
}

checkCamera();