const puppeteer = require('puppeteer');

async function checkFrontendConsole() {
  let browser;
  try {
    console.log('🌐 [DEBUG] Abrindo navegador para verificar console...');
    
    browser = await puppeteer.launch({ 
      headless: false,
      devtools: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Capturar logs do console
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      console.log(`[BROWSER ${type.toUpperCase()}] ${text}`);
    });
    
    // Capturar erros
    page.on('pageerror', error => {
      console.error('[BROWSER ERROR]', error.message);
    });
    
    console.log('📡 [DEBUG] Navegando para http://localhost:5173...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
    
    console.log('⏳ [DEBUG] Aguardando 3 segundos para capturar logs...');
    await page.waitForTimeout(3000);
    
    // Tentar navegar para a página de gravações
    console.log('📹 [DEBUG] Navegando para /recordings...');
    await page.goto('http://localhost:5173/recordings', { waitUntil: 'networkidle0' });
    
    console.log('⏳ [DEBUG] Aguardando mais 5 segundos na página de gravações...');
    await page.waitForTimeout(5000);
    
    // Verificar se há elementos na página
    const recordingsCount = await page.evaluate(() => {
      const elements = document.querySelectorAll('[data-testid="recording-item"], .recording-item, .border.border-gray-200.rounded-lg');
      return elements.length;
    });
    
    console.log('📊 [DEBUG] Elementos de gravação encontrados na página:', recordingsCount);
    
    // Verificar se há texto "Nenhuma gravação encontrada"
    const noRecordingsText = await page.evaluate(() => {
      return document.body.innerText.includes('Nenhuma gravação encontrada');
    });
    
    console.log('❌ [DEBUG] Texto "Nenhuma gravação encontrada" presente:', noRecordingsText);
    
    // Verificar se há texto com contagem de gravações
    const recordingsCountText = await page.evaluate(() => {
      const matches = document.body.innerText.match(/Gravações \((\d+)\)/);
      return matches ? matches[1] : 'não encontrado';
    });
    
    console.log('📊 [DEBUG] Contagem de gravações na UI:', recordingsCountText);
    
  } catch (error) {
    console.error('💥 [DEBUG] Erro:', error.message);
  } finally {
    if (browser) {
      console.log('🔚 [DEBUG] Fechando navegador...');
      await browser.close();
    }
  }
}

checkFrontendConsole();