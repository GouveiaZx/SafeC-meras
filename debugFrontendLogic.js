// Simulação da lógica do frontend para debug

function simulateFrontendValidation() {
  console.log('🔍 Simulando lógica do frontend...');
  
  // Simular formData como no frontend
  const formData = {
    name: 'Teste RTMP Debug',
    ip_address: '',
    rtsp_url: '',
    rtmp_url: 'rtmp://test.example.com/live/stream123',
    location: '',
    stream_type: 'rtmp',
    type: 'ip'
  };
  
  console.log('FormData inicial:', JSON.stringify(formData, null, 2));
  
  // Validação 1: Nome obrigatório
  if (!formData.name.trim()) {
    console.log('❌ Erro: Nome é obrigatório');
    return false;
  }
  console.log('✅ Nome válido');
  
  // Validação 2: Stream type válido
  if (!formData.stream_type || !['rtsp', 'rtmp'].includes(formData.stream_type)) {
    console.log('❌ Erro: Tipo de stream deve ser RTSP ou RTMP');
    return false;
  }
  console.log('✅ Stream type válido:', formData.stream_type);
  
  // Validação 3: URL específica por tipo
  if (formData.stream_type === 'rtmp') {
    if (!formData.rtmp_url.trim()) {
      console.log('❌ Erro: URL RTMP é obrigatória');
      return false;
    }
    if (!formData.rtmp_url.startsWith('rtmp://')) {
      console.log('❌ Erro: URL RTMP deve começar com rtmp://');
      return false;
    }
    console.log('✅ URL RTMP válida:', formData.rtmp_url);
  } else if (formData.stream_type === 'rtsp') {
    if (!formData.rtsp_url.trim()) {
      console.log('❌ Erro: URL RTSP é obrigatória');
      return false;
    }
    if (!formData.rtsp_url.startsWith('rtsp://')) {
      console.log('❌ Erro: URL RTSP deve começar com rtsp://');
      return false;
    }
    console.log('✅ URL RTSP válida:', formData.rtsp_url);
  }
  
  // Validação 4: Pelo menos uma URL ou IP
  const hasUrl = (formData.stream_type === 'rtmp' && formData.rtmp_url.trim()) || 
                 (formData.stream_type === 'rtsp' && formData.rtsp_url.trim());
  const hasIp = formData.ip_address.trim();
  
  console.log('hasUrl:', hasUrl);
  console.log('hasIp:', hasIp);
  
  if (!hasUrl && !hasIp) {
    console.log('❌ Erro: É necessário fornecer pelo menos uma URL de stream ou endereço IP');
    return false;
  }
  console.log('✅ Pelo menos uma URL ou IP fornecido');
  
  // Construção do payload
  const payload = {
    name: formData.name.trim(),
    type: 'ip',
    stream_type: formData.stream_type || 'rtsp'
  };
  
  // Validação adicional duplicada (como no código original)
  const hasRtmpUrl = formData.stream_type === 'rtmp' && formData.rtmp_url.trim();
  const hasRtspUrl = formData.stream_type === 'rtsp' && formData.rtsp_url.trim();
  const hasIpAddress = formData.ip_address.trim();
  
  console.log('hasRtmpUrl:', hasRtmpUrl);
  console.log('hasRtspUrl:', hasRtspUrl);
  console.log('hasIpAddress:', hasIpAddress);
  
  if (!hasRtmpUrl && !hasRtspUrl && !hasIpAddress) {
    console.log('❌ Erro: Validação adicional falhou - É necessário fornecer pelo menos uma URL de stream ou endereço IP');
    return false;
  }
  console.log('✅ Validação adicional passou');
  
  // Adicionar campos opcionais
  if (formData.ip_address.trim()) {
    payload.ip_address = formData.ip_address.trim();
    console.log('➕ Adicionado ip_address:', payload.ip_address);
  }
  
  if (formData.location.trim()) {
    payload.location = formData.location.trim();
    console.log('➕ Adicionado location:', payload.location);
  }
  
  // Adicionar URL baseado no tipo de stream
  if (formData.stream_type === 'rtmp') {
    payload.rtmp_url = formData.rtmp_url.trim();
    console.log('➕ Adicionado rtmp_url:', payload.rtmp_url);
  } else {
    payload.rtsp_url = formData.rtsp_url.trim();
    console.log('➕ Adicionado rtsp_url:', payload.rtsp_url);
  }
  
  console.log('\n📦 Payload final:', JSON.stringify(payload, null, 2));
  
  return payload;
}

// Testar diferentes cenários
console.log('='.repeat(50));
console.log('TESTE 1: RTMP com URL válida');
console.log('='.repeat(50));
simulateFrontendValidation();

console.log('\n' + '='.repeat(50));
console.log('TESTE 2: RTMP sem URL');
console.log('='.repeat(50));

// Simular formData sem URL RTMP
function simulateEmptyRtmpUrl() {
  const formData = {
    name: 'Teste RTMP Vazio',
    ip_address: '',
    rtsp_url: '',
    rtmp_url: '', // URL vazia
    location: '',
    stream_type: 'rtmp',
    type: 'ip'
  };
  
  console.log('FormData com RTMP vazio:', JSON.stringify(formData, null, 2));
  
  if (formData.stream_type === 'rtmp') {
    if (!formData.rtmp_url.trim()) {
      console.log('❌ Erro: URL RTMP é obrigatória (como esperado)');
      return false;
    }
  }
  
  return true;
}

simulateEmptyRtmpUrl();

console.log('\n' + '='.repeat(50));
console.log('TESTE 3: RTMP com IP mas sem URL');
console.log('='.repeat(50));

// Simular formData com IP mas sem URL RTMP
function simulateRtmpWithIp() {
  const formData = {
    name: 'Teste RTMP com IP',
    ip_address: '192.168.1.100',
    rtsp_url: '',
    rtmp_url: '', // URL vazia mas tem IP
    location: '',
    stream_type: 'rtmp',
    type: 'ip'
  };
  
  console.log('FormData com IP mas sem RTMP URL:', JSON.stringify(formData, null, 2));
  
  // Validação específica por tipo de stream
  if (formData.stream_type === 'rtmp') {
    if (!formData.rtmp_url.trim()) {
      console.log('❌ Erro: URL RTMP é obrigatória (mesmo com IP)');
      return false;
    }
  }
  
  return true;
}

simulateRtmpWithIp();