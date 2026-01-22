const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

let browserType;
let playwright;

// Intentar cargar Playwright, si falla usar Puppeteer
async function initBrowser() {
    try {
        playwright = require('playwright');
        browserType = playwright.chromium;
        console.log('✅ Playwright cargado correctamente');
        return 'playwright';
    } catch (error) {
        console.log('⚠️ Playwright no disponible, intentando con Puppeteer...');
        try {
            browserType = require('puppeteer');
            console.log('✅ Puppeteer cargado correctamente');
            return 'puppeteer';
        } catch (e) {
            console.log('❌ Ningún navegador disponible');
            return null;
        }
    }
}

// Función para obtener token
async function getTurnstileToken(url, siteKey) {
    const browserLib = await initBrowser();
    if (!browserLib) return null;
    
    let browser;
    try {
        // Configuración según la librería
        if (browserLib === 'playwright') {
            browser = await browserType.launch({ 
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            const page = await browser.newPage();
            await page.goto(url);
            await page.waitForTimeout(5000);
            
            return await page.evaluate(() => {
                const input = document.querySelector('input[name="cf-turnstile-response"]');
                return input ? input.value : null;
            });
            
        } else { // puppeteer
            browser = await browserType.launch({ 
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            const page = await browser.newPage();
            await page.goto(url);
            await page.waitForTimeout(5000);
            
            return await page.evaluate(() => {
                const input = document.querySelector('input[name="cf-turnstile-response"]');
                return input ? input.value : null;
            });
        }
    } catch (error) {
        console.error('Error:', error.message);
        return null;
    } finally {
        if (browser) await browser.close();
    }
}

// Endpoint
app.post('/api/bypass/cf-turnstile', async (req, res) => {
    try {
        const { url, siteKey } = req.body;
        
        if (!url || !siteKey) {
            return res.json({ 
                success: false, 
                error: 'Se requieren url y siteKey' 
            });
        }
        
        const token = await getTurnstileToken(url, siteKey);
        
        res.json({
            success: !!token,
            token: token,
            message: token ? 'Token obtenido' : 'No se pudo obtener token'
        });
        
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Endpoint simple de prueba
app.get('/', (req, res) => {
    res.json({ 
        status: 'online',
        endpoint: 'POST /api/bypass/cf-turnstile'
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor en puerto ${PORT}`);
});
