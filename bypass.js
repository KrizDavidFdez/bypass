const { chromium } = require('playwright');
const http = require('http');

async function getTurnstileToken(url, siteKey) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    try {
        await page.goto(url);
        await page.waitForTimeout(3000);
        
        return await page.evaluate(() => {
            const input = document.querySelector('input[name="cf-turnstile-response"]');
            return input ? input.value : null;
        });
    } finally {
        await browser.close();
    }
}

// Servidor HTTP simple
const server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/api/bypass/cf-turnstile') {
        let body = '';
        req.on('data', chunk => body += chunk);
        
        req.on('end', async () => {
            try {
                const { url, siteKey } = JSON.parse(body);
                
                if (!url || !siteKey) {
                    res.writeHead(400);
                    return res.end(JSON.stringify({ error: 'Faltan url o siteKey' }));
                }
                
                const token = await getTurnstileToken(url, siteKey);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: !!token,
                    token: token
                }));
            } catch (error) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Ruta no encontrada' }));
    }
});

server.listen(3000, () => {
    console.log('Servidor escuchando en puerto 3000');
    console.log('Usa: curl -X POST "http://localhost:3000/api/bypass/cf-turnstile"');
    console.log('Body: {"url": "https://...", "siteKey": "0x4AAAAAAA..."}');
});
