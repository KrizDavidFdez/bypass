const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');

const app = express();
app.use(cors());
app.use(express.json());

// Función para extraer TODO de una web
async function extractEverything(url) {
    console.log(`🌐 Analizando: ${url}`);
    
    const browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox']
    });
    
    const page = await browser.newPage();
    const results = {
        url: url,
        timestamp: new Date().toISOString(),
        success: false,
        error: null,
        data: {}
    };
    
    try {
        // Navegar a la página
        await page.goto(url, { 
            waitUntil: 'networkidle',
            timeout: 30000 
        });
        
        // 1. Extraer HTML completo
        const html = await page.content();
        
        // 2. Extraer TODOS los datos de la página
        const pageData = await page.evaluate(() => {
            const data = {};
            
            // A. Todos los formularios y sus inputs
            data.forms = Array.from(document.forms).map(form => ({
                id: form.id,
                name: form.name,
                action: form.action,
                method: form.method,
                inputs: Array.from(form.elements).map(input => ({
                    type: input.type,
                    name: input.name,
                    id: input.id,
                    className: input.className,
                    value: input.value,
                    placeholder: input.placeholder
                }))
            }));
            
            // B. Todos los elementos con datos (inputs, textareas, selects)
            data.elements = {
                inputs: Array.from(document.querySelectorAll('input')).map(input => ({
                    type: input.type,
                    name: input.name,
                    id: input.id,
                    value: input.value,
                    attributes: Array.from(input.attributes).map(attr => ({
                        name: attr.name,
                        value: attr.value
                    }))
                })),
                
                textareas: Array.from(document.querySelectorAll('textarea')).map(ta => ({
                    name: ta.name,
                    id: ta.id,
                    value: ta.value
                })),
                
                selects: Array.from(document.querySelectorAll('select')).map(select => ({
                    name: select.name,
                    id: select.id,
                    options: Array.from(select.options).map(opt => ({
                        value: opt.value,
                        text: opt.text
                    }))
                }))
            };
            
            // C. Cloudflare Turnstile específico
            data.cloudflare = {
                turnstileInputs: Array.from(document.querySelectorAll('input[name*="cf-"], input[name*="turnstile"], input[name*="cloudflare"]')).map(input => ({
                    name: input.name,
                    value: input.value,
                    type: input.type
                })),
                
                turnstileWidgets: Array.from(document.querySelectorAll('.cf-turnstile, [data-sitekey], iframe[src*="cloudflare"], iframe[src*="turnstile"]')).map(widget => ({
                    className: widget.className,
                    id: widget.id,
                    src: widget.src,
                    dataset: Object.keys(widget.dataset).reduce((obj, key) => {
                        obj[key] = widget.dataset[key];
                        return obj;
                    }, {})
                })),
                
                captchaTokens: {
                    cf_turnstile_response: document.querySelector('input[name="cf-turnstile-response"]')?.value,
                    cf_captcha_response: document.querySelector('input[name="cf-captcha-response"]')?.value,
                    g_recaptcha_response: document.querySelector('input[name="g-recaptcha-response"]')?.value,
                    h_captcha_response: document.querySelector('input[name="h-captcha-response"]')?.value
                }
            };
            
            // D. Cookies y localStorage
            data.storage = {
                cookies: document.cookie,
                localStorage: Object.keys(localStorage).reduce((obj, key) => {
                    obj[key] = localStorage.getItem(key);
                    return obj;
                }, {}),
                sessionStorage: Object.keys(sessionStorage).reduce((obj, key) => {
                    obj[key] = sessionStorage.getItem(key);
                    return obj;
                }, {})
            };
            
            // E. Variables globales (JavaScript)
            data.globalVars = {
                turnstile: typeof window.turnstile !== 'undefined',
                grecaptcha: typeof window.grecaptcha !== 'undefined',
                hcaptcha: typeof window.hcaptcha !== 'undefined',
                hasCaptcha: typeof window.turnstile !== 'undefined' || 
                           typeof window.grecaptcha !== 'undefined' || 
                           typeof window.hcaptcha !== 'undefined'
            };
            
            // F. Metadatos y scripts
            data.metadata = {
                title: document.title,
                description: document.querySelector('meta[name="description"]')?.content,
                keywords: document.querySelector('meta[name="keywords"]')?.content,
                scripts: Array.from(document.scripts).map(script => ({
                    src: script.src,
                    type: script.type,
                    async: script.async,
                    defer: script.defer
                })).slice(0, 20), // Limitar a 20 scripts
                
                iframes: Array.from(document.querySelectorAll('iframe')).map(iframe => ({
                    src: iframe.src,
                    id: iframe.id,
                    className: iframe.className
                }))
            };
            
            // G. Headers y meta tags
            data.headers = {
                contentType: document.contentType,
                charset: document.characterSet,
                language: document.documentElement.lang
            };
            
            // H. Buscar TODOS los valores que parezcan tokens
            data.allPotentialTokens = [];
            
            // Buscar en todos los inputs
            document.querySelectorAll('input, textarea, [value]').forEach(el => {
                const value = el.value || el.getAttribute('value');
                if (value && value.length > 30) { // Los tokens son largos
                    data.allPotentialTokens.push({
                        element: el.tagName,
                        name: el.name || el.id,
                        value: value.substring(0, 100) + (value.length > 100 ? '...' : ''),
                        fullLength: value.length
                    });
                }
            });
            
            // Buscar en data-attributes
            document.querySelectorAll('[data-*]').forEach(el => {
                Array.from(el.attributes).forEach(attr => {
                    if (attr.name.startsWith('data-') && attr.value && attr.value.length > 30) {
                        data.allPotentialTokens.push({
                            element: el.tagName,
                            attribute: attr.name,
                            value: attr.value.substring(0, 100) + (attr.value.length > 100 ? '...' : ''),
                            fullLength: attr.value.length
                        });
                    }
                });
            });
            
            // I. Información adicional
            data.pageInfo = {
                url: window.location.href,
                hostname: window.location.hostname,
                pathname: window.location.pathname,
                searchParams: window.location.search
            };
            
            return data;
        });
        
        // 3. Tomar screenshot (opcional)
        // const screenshot = await page.screenshot({ encoding: 'base64' });
        
        // 4. Extraer todas las cookies
        const cookies = await page.context().cookies();
        
        // 5. Extraer todas las respuestas de red (simplificado)
        const networkData = await page.evaluate(() => {
            const performanceEntries = performance.getEntriesByType('resource');
            return performanceEntries.map(entry => ({
                name: entry.name,
                type: entry.initiatorType,
                duration: entry.duration,
                size: entry.transferSize
            })).slice(0, 50); // Limitar a 50 entradas
        });
        
        // Compilar todos los resultados
        results.success = true;
        results.data = {
            pageData: pageData,
            htmlLength: html.length,
            cookies: cookies,
            networkRequests: networkData,
            // screenshot: screenshot, // Descomentar si quieres el screenshot
            summary: {
                formsCount: pageData.forms.length,
                inputsCount: pageData.elements.inputs.length,
                potentialTokens: pageData.allPotentialTokens.length,
                hasCloudflare: pageData.cloudflare.turnstileWidgets.length > 0,
                hasCaptcha: pageData.globalVars.hasCaptcha
            }
        };
        
        console.log(`✅ Extracción completada:`);
        console.log(`   - ${pageData.forms.length} formularios encontrados`);
        console.log(`   - ${pageData.elements.inputs.length} inputs encontrados`);
        console.log(`   - ${pageData.allPotentialTokens.length} posibles tokens`);
        console.log(`   - Cloudflare: ${pageData.cloudflare.turnstileWidgets.length > 0 ? 'SÍ' : 'NO'}`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        results.error = error.message;
        results.success = false;
    } finally {
        await browser.close();
        console.log('🔒 Navegador cerrado');
    }
    
    return results;
}

// Endpoint para extraer TODO
app.post('/api/scrape/all', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'Se requiere la URL en el body'
            });
        }
        
        console.log(`\n📨 Solicitud recibida para: ${url}`);
        const results = await extractEverything(url);
        
        res.json(results);
        
    } catch (error) {
        console.error('Error en el endpoint:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint específico para Turnstile
app.post('/api/bypass/cf-turnstile', async (req, res) => {
    try {
        const { url, siteKey } = req.body;
        
        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'Se requiere la URL'
            });
        }
        
        console.log(`\n🎯 Búsqueda de Turnstile en: ${url}`);
        const results = await extractEverything(url);
        
        // Filtrar solo información de Turnstile
        const turnstileData = results.success ? {
            success: true,
            tokens: results.data.pageData.cloudflare.captchaTokens,
            widgets: results.data.pageData.cloudflare.turnstileWidgets,
            allPotentialTokens: results.data.pageData.allPotentialTokens.filter(t => 
                t.value.includes('cf_') || 
                t.value.includes('turnstile') ||
                t.name?.includes('cf') ||
                t.name?.includes('turnstile')
            ),
            hasTurnstile: results.data.pageData.cloudflare.turnstileWidgets.length > 0,
            globalTurnstile: results.data.pageData.globalVars.turnstile,
            summary: results.data.summary
        } : {
            success: false,
            error: results.error
        };
        
        res.json(turnstileData);
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint de prueba rápido
app.get('/api/test', async (req, res) => {
    const testUrl = 'https://challenges.cloudflare.com/turnstile/v0/api/demo';
    
    try {
        console.log(`🧪 Ejecutando prueba en: ${testUrl}`);
        const results = await extractEverything(testUrl);
        
        // Mostrar solo información resumida
        const summary = {
            url: testUrl,
            success: results.success,
            hasTurnstile: results.success ? results.data.pageData.cloudflare.turnstileWidgets.length > 0 : false,
            tokensFound: results.success ? results.data.pageData.allPotentialTokens.length : 0,
            sampleToken: results.success && results.data.pageData.cloudflare.captchaTokens.cf_turnstile_response 
                ? results.data.pageData.cloudflare.captchaTokens.cf_turnstile_response.substring(0, 50) + '...'
                : null
        };
        
        res.json(summary);
        
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

// Página principal con información
app.get('/', (req, res) => {
    res.json({
        name: 'Web Scraper Completo',
        version: '1.0.0',
        endpoints: [
            {
                method: 'POST',
                path: '/api/scrape/all',
                description: 'Extrae TODO de una web',
                body: { url: 'https://ejemplo.com' }
            },
            {
                method: 'POST',
                path: '/api/bypass/cf-turnstile',
                description: 'Busca específicamente tokens de Turnstile',
                body: { url: 'https://ejemplo.com', siteKey: 'opcional' }
            },
            {
                method: 'GET',
                path: '/api/test',
                description: 'Prueba automática con Cloudflare Demo'
            }
        ],
        features: [
            'Extrae todos los formularios e inputs',
            'Busca tokens de Cloudflare Turnstile',
            'Extrae cookies y localStorage',
            'Detecta widgets de captcha',
            'Encuentra posibles tokens en data-attributes',
            'Analiza scripts y iframes'
        ]
    });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
    console.log(`🔍 Endpoint principal: POST /api/scrape/all`);
    console.log(`🎯 Turnstile específico: POST /api/bypass/cf-turnstile`);
    console.log(`🧪 Prueba rápida: GET /api/test`);
});

// Instalar Playwright si no está instalado
async function checkPlaywright() {
    try {
        await chromium.launch({ headless: true }).then(browser => browser.close());
        console.log('✅ Playwright está listo');
    } catch (error) {
        console.log('⚠️ Playwright no está instalado. Ejecuta:');
        console.log('   npx playwright install chromium');
    }
}

checkPlaywright();
