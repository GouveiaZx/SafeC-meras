// Script para testar se os logs estão aparecendo no console do navegador
const puppeteer = require('puppeteer');

async function testBrowserConsole() {
  let browser;
  try {
    console.log('🌐 Abrindo navegador para capturar logs do console...');
    
    browser = await puppeteer.launch({ 
      headless: false,
      devtools: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Array para armazenar logs
    const consoleLogs = [];
    
    // Capturar todos os logs do console
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      const logEntry = `[${type.toUpperCase()}] ${text}`;
      consoleLogs.push(logEntry);
      console.log(`[BROWSER] ${logEntry}`);
    });
    
    // Capturar erros
    page.on('pageerror', error => {
      const errorEntry = `[ERROR] ${error.message}`;
      consoleLogs.push(errorEntry);
      console.error('[BROWSER ERROR]', error.message);
    });
    
    console.log('📡 Navegando para http://localhost:5173...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
    
    console.log('⏳ Aguardando 3 segundos para capturar logs iniciais...');
    await page.waitForTimeout(3000);
    
    console.log('📹 Navegando para /recordings...');
    await page.goto('http://localhost:5173/recordings', { waitUntil: 'networkidle0' });
    
    console.log('⏳ Aguardando 5 segundos na página de gravações...');
    await page.waitForTimeout(5000);
    
    // Verificar se há elementos de debug na página
    const debugPanelExists = await page.evaluate(() => {
      return document.querySelector('.bg-yellow-100') !== null;
    });
    
    console.log('🐛 Debug panel encontrado:', debugPanelExists);
    
    // Verificar se há logs de debug específicos
    const debugLogsFound = consoleLogs.filter(log => 
      log.includes('[DEBUG]') || log.includes('RecordingsPage')
    );
    
    console.log('📊 Total de logs capturados:', consoleLogs.length);
    console.log('🔍 Logs de debug encontrados:', debugLogsFound.length);
    
    if (debugLogsFound.length > 0) {
      console.log('\n📝 Logs de debug capturados:');
      debugLogsFound.forEach(log => console.log('  ', log));
    } else {
      console.log('❌ Nenhum log de debug encontrado!');
      console.log('\n📝 Todos os logs capturados:');
      consoleLogs.slice(-10).forEach(log => console.log('  ', log));
    }
    
    // Verificar URL atual
    const currentUrl = await page.url();
    console.log('🌐 URL atual:', currentUrl);
    
    // Verificar se há texto na página
    const pageText = await page.evaluate(() => {
      return document.body.innerText.substring(0, 500);
    });
    
    console.log('📄 Texto da página (primeiros 500 chars):');
    console.log(pageText);
    
  } catch (error) {
    console.error('💥 Erro:', error.message);
  } finally {
    if (browser) {
      console.log('🔚 Fechando navegador em 10 segundos...');
      setTimeout(async () => {
        await browser.close();
      }, 10000);
    }
  }
}

testBrowserConsole();