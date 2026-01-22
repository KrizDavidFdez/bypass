const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');

const app = express();
app.use(cors());
app.use(express.json());

// Función MEJORADA para obtener el token
async function getTurnstileToken(url, siteKey) {
    console.log(`🔍 Intentando bypass para: ${url}`);
    
    const browser = await chromium.launch({ 
        headless: false, // IMPORTANTE: Cambia esto según necesites
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    try {
        // Configurar un user-agent real
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Navegar a la página
        await page.goto(url, { 
            waitUntil: 'networkidle',
            timeout: 30000 
        });
        
        console.log('✅ Página cargada');
        
        // Esperar a que aparezca el widget de Turnstile
        await page.waitForSelector('[data-sitekey], .cf-turnstile, iframe[src*="cloudflare"], input[name="cf-turnstile-response"]', {
            timeout: 10000
        }).catch(() => {
            console.log('⚠️ No se encontró el widget inmediatamente, continuando...');
        });
        
        // Esperar 5 segundos para que se resuelva
        console.log('⏳ Esperando resolución del captcha...');
        await page.waitForTimeout(5000);
        
        // MÉTODO 1: Buscar el input directamente
        let token = await page.evaluate(() => {
            const input = document.querySelector('input[name="cf-turnstile-response"]');
            if (input && input.value) {
                console.log('✅ Token encontrado en input');
                return input.value;
            }
            return null;
        });
        
        // MÉTODO 2: Si no está en input, buscar en variables globales
        if (!token) {
            token = await page.evaluate(() => {
                // Verificar si Turnstile API está disponible
                if (window.turnstile) {
                    console.log('ℹ️ Turnstile API detectada');
                    
                    // Intentar obtener el token de diferentes formas
                    if (window.turnstile.getResponse) {
                        const response = window.turnstile.getResponse();
                        if (response) {
                            console.log('✅ Token obtenido de turnstile.getResponse()');
                            return response;
                        }
                    }
                    
                    // Buscar elementos con data-cf-response
                    const elements = document.querySelectorAll('[data-cf-response]');
                    for (const el of elements) {
                        const response = el.getAttribute('data-cf-response');
                        if (response) {
                            console.log('✅ Token encontrado en data-cf-response');
                            return response;
                        }
                    }
                }
                
                // MÉTODO 3: Buscar en todos los inputs hidden
                const hiddenInputs = document.querySelectorAll('input[type="hidden"]');
                for (const input of hiddenInputs) {
                    if (input.value && input.value.length > 100) {
                        console.log('✅ Token potencial encontrado en input hidden');
                        return input.value;
                    }
                }
                
                return null;
            });
        }
        
        // MÉTODO 4: Si aún no hay token, hacer scroll y esperar más
        if (!token) {
            console.log('🔄 Intentando scroll y más espera...');
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });
            
            await page.waitForTimeout(3000);
            
            token = await page.evaluate(() => {
                const input = document.querySelector('input[name="cf-turnstile-response"]');
                return input ? input.value : null;
            });
        }
        
        // MÉTODO 5: Forzar ejecución del callback de Turnstile
        if (!token) {
            console.log('🔄 Intentando forzar callback de Turnstile...');
            
            token = await page.evaluate((siteKey) => {
                return new Promise((resolve) => {
                    // Buscar el widget
                    const widget = document.querySelector('.cf-turnstile');
                    if (widget && window.turnstile) {
                        try {
                            // Intentar renderizar de nuevo
                            window.turnstile.render(widget, {
                                sitekey: siteKey,
                                callback: function(response) {
                                    console.log('✅ Callback ejecutado, token:', response.substring(0, 20) + '...');
                                    resolve(response);
                                },
                                'error-callback': function() {
                                    resolve(null);
                                }
                            });
                            
                            // Timeout
                            setTimeout(() => resolve(null), 3000);
                        } catch (e) {
                            resolve(null);
                        }
                    } else {
                        resolve(null);
                    }
                });
            }, siteKey);
        }
        
        if (token) {
            console.log(`✅ TOKEN OBTENIDO (${token.length} caracteres): ${token.substring(0, 50)}...`);
            return token;
        } else {
            console.log('❌ No se pudo obtener el token');
            
            // Tomar screenshot para debug
            await page.screenshot({ path: 'debug.png' });
            console.log('📸 Screenshot guardado como debug.png');
            
            return null;
        }
        
    } catch (error) {
        console.error('🔥 Error:', error.message);
        return null;
    } finally {
        await page.close();
        await browser.close();
        console.log('🔒 Navegador cerrado');
    }
}

// Endpoint principal
app.post('/api/bypass/cf-turnstile', async (req, res) => {
    try {
        const { url, siteKey } = req.body;
        
        if (!url || !siteKey) {
            return res.status(400).json({
                success: false,
                error: 'Se requieren url y siteKey en el body'
            });
        }
        
        console.log(`\n📨 Nueva solicitud recibida:`);
        console.log(`   URL: ${url}`);
        console.log(`   SiteKey: ${siteKey}`);
        
        const token = await getTurnstileToken(url, siteKey);
        
        if (token) {
            res.json({
                success: true,
                token: token,
                message: 'Token obtenido exitosamente',
                token_length: token.length,
                timestamp: new Date().toISOString()
            });
        } else {
            res.json({
                success: false,
                token: null,
                error: 'No se pudo obtener el token de Turnstile',
                suggestions: [
                    'Verifica que la URL tenga realmente Cloudflare Turnstile',
                    'Intenta con headless: false para ver lo que sucede',
                    'Aumenta el tiempo de espera si es necesario'
                ]
            });
        }
        
    } catch (error) {
        console.error('Error en el endpoint:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint de prueba
app.get('/test', async (req, res) => {
    res.json({
        message: 'Servidor funcionando',
        endpoints: {
            bypass: 'POST /api/bypass/cf-turnstile',
            body_example: {
                url: 'https://challenges.cloudflare.com/turnstile/v0/api/demo',
                siteKey: '1x00000000000000000000AA'
            }
        }
    });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor Express ejecutándose en http://localhost:${PORT}`);
    console.log(`📝 Test endpoint: http://localhost:${PORT}/test`);
    console.log(`🎯 Bypass endpoint: POST http://localhost:${PORT}/api/bypass/cf-turnstile`);
});

// Para probar automáticamente al inicio (opcional)
async function testSelf() {
    console.log('\n🧪 Ejecutando autoprueba...');
    
    const testData = {
        url: "https://challenges.cloudflare.com/turnstile/v0/api/demo",
        siteKey: "1x00000000000000000000AA"
    };
    
    try {
        const token = await getTurnstileToken(testData.url, testData.siteKey);
        console.log(token ? '✅ Autoprueba exitosa' : '⚠️ Autoprueba: No se obtuvo token (puede ser normal)');
    } catch (error) {
        console.log('⚠️ Error en autoprueba:', error.message);
    }
}

// Descomenta la siguiente línea para autoprueba al inicio:
// testSelf();
