const http = require('http');
const https = require('https');

const CONFIG = {
    backend: { url: 'http://localhost:3002' },
    frontend: { url: 'http://localhost:5174' },
    zlmediakit: { url: 'http://localhost:8000' },
    supabase: { url: 'https://grkvfzuadctextnbpajb.supabase.co' }
};

function checkConnection(name, url, path = '') {
    return new Promise((resolve) => {
        const fullUrl = url + path;
        const urlObj = new URL(fullUrl);
        
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            timeout: 5000
        };

        const protocol = urlObj.protocol === 'https:' ? https : http;
        
        const req = protocol.request(options, (res) => {
            console.log(`✅ ${name}: ${res.statusCode} - ${fullUrl}`);
            resolve(true);
        });

        req.on('error', (err) => {
            console.log(`❌ ${name}: ${err.message} - ${fullUrl}`);
            resolve(false);
        });

        req.on('timeout', () => {
            console.log(`⏱️  ${name}: Timeout - ${fullUrl}`);
            resolve(false);
        });

        req.setTimeout(5000);
        req.end();
    });
}

async function runDiagnostics() {
    console.log('🔍 Diagnóstico NewCAM - Verificando conexões...\n');
    
    const checks = [
        checkConnection('Backend', CONFIG.backend.url, '/api/health'),
        checkConnection('Frontend', CONFIG.frontend.url),
        checkConnection('ZLMediaKit', CONFIG.zlmediakit.url, '/index/api/getServerConfig'),
        checkConnection('Supabase', CONFIG.supabase.url, '/rest/v1/cameras?select=id&limit=1'),
        checkConnection('Backend API - Cameras', CONFIG.backend.url, '/api/cameras'),
        checkConnection('Backend API - Streams', CONFIG.backend.url, '/api/streams')
    ];
    
    await Promise.all(checks);
    console.log('\n✅ Diagnóstico concluído!');
}

if (require.main === module) {
    runDiagnostics().catch(console.error);
}