
        // ==================== PROTECCIÓN Y SEGURIDAD ====================
        // PROTECCIONES DESACTIVADAS - Consola y herramientas de desarrollo habilitadas

        // Copia manual habilitada por el usuario
        
        // Deshabilitar arrastrar elementos
        document.addEventListener('dragstart', function(e) {
            e.preventDefault();
            return false;
        });
        
        // Proteger contra "View Source" - DESACTIVADO
        // Se permite acceso completo a herramientas de desarrollo
        
        // Deshabilitar selección de texto (opcional - descomenta si querés)
        // document.addEventListener('selectstart', function(e) {
        //     e.preventDefault();
        // });

        // Ofuscar consola - deshabilitar funciones principales
        (function() {
            // Guardar referencias originales
            const noop = function() {};
            const noopStr = function() { return ''; };
            
            // Sobrescribir console en modo producción
            if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
                try {
                    Object.defineProperty(console, 'log', { value: noop });
                    Object.defineProperty(console, 'warn', { value: noop });
                    Object.defineProperty(console, 'error', { value: noop });
                    Object.defineProperty(console, 'info', { value: noop });
                    Object.defineProperty(console, 'debug', { value: noop });
                    Object.defineProperty(console, 'table', { value: noop });
                } catch(e) {}
            } else {
                // En desarrollo, mostrar advertencia
                console.log('%c⚠️ ADVERTENCIA', 'color: red; font-size: 24px; font-weight: bold;');
                console.log('%cEl uso indebido de esta consola puede comprometer tu seguridad.', 'color: orange; font-size: 14px;');
                console.log('%cNo pegues código de fuentes desconocidas.', 'color: orange; font-size: 14px;');
            }
        })();
        
        // Anti-debugging: detectar debugger activo
        (function() {
            function detectDebugger() {
                const start = new Date().getTime();
                debugger; // Esta línea será detectada si hay un debugger
                const end = new Date().getTime();
                if (end - start > 100) {
                    // Debugger detectado
                    document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-size:24px;color:#ff0000;">Acceso no autorizado</div>';
                    throw new Error('Debugger detected');
                }
            }
            
            // Ejecutar detección periódicamente (comentar si molesta en desarrollo)
            // setInterval(detectDebugger, 1000);
        })();
        
        // Limpiar el DOM de atributos de desarrollo
        document.addEventListener('DOMContentLoaded', function() {
            // Eliminar comentarios HTML
            const walk = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT, null, false);
            const commentsToRemove = [];
            while(walk.nextNode()) {
                commentsToRemove.push(walk.currentNode);
            }
            commentsToRemove.forEach(comment => comment.remove());
        });

        // ==================== CONFIGURACIÓN GLOBAL ====================
        // Opciones sobre acciones BYMA: r≈0 en BS (carry ya está en spot)
        const CONFIG = {
            mercado: "BCBA",
            vol_periodo: '1y',
            pasos_binomial: 100,
            tasa_riesgo: 0,           // r para BS de opciones sobre acciones (no usar cauciones)
            tasa_cauciones: null,     // solo informativo, NO para pricing BS
            simbolo: 'COME'
        };

        // ==================== PARÁMETROS MONTE CARLO ARGENTINA ====================
        // Configuración específica para diferentes activos del mercado argentino
        const PARAMETROS_ARGENTINA = {
            // Parámetros base para mercado argentino
            base: {
                gradosLibertad: 3,        // Colas muy gordas para Argentina
                lambdaSaltos: 0.15,       // 15% probabilidad anual de salto (~1 cada 7 meses)
                muSalto: -0.06,           // Salto promedio -6% (sesgo bajista)
                sigmaSalto: 0.10,        // Dispersión del salto
                volOfVol: 0.30,          // Volatilidad de la volatilidad
                meanReversionSpeed: 2.0,  // Velocidad de reversión
                volLargoPlazo: 0.50,     // Vol de largo plazo
                probDevaluacion: 0.08,    // 8% probabilidad de evento macro
                magnitudDevaluacion: 0.25 // Impacto promedio 25%
            },
            
            // GGAL - Grupo Financiero Galicia (alta volatilidad, sensible a devaluaciones)
            'GGAL': {
                gradosLibertad: 2.5,      // Colas extremadamente gordas
                lambdaSaltos: 0.20,       // 20% probabilidad anual de salto (~1 cada 5 meses)
                muSalto: -0.08,           // Salto promedio -8% (muy bajista)
                sigmaSalto: 0.12,        // Mayor dispersión en saltos
                volOfVol: 0.35,          // Mayor volatilidad de la vol
                meanReversionSpeed: 1.8,  // Reversión más lenta
                volLargoPlazo: 0.60,     // Vol de largo plazo más alta
                probDevaluacion: 0.12,    // 12% probabilidad de evento macro
                magnitudDevaluacion: 0.30  // Impacto promedio 30%
            },
            
            // PAMP - Pampa Energía (commodity, sensible a tipo de cambio)
            'PAMP': {
                gradosLibertad: 3.5,
                lambdaSaltos: 0.18,
                muSalto: -0.07,
                sigmaSalto: 0.11,
                volOfVol: 0.32,
                meanReversionSpeed: 2.2,
                volLargoPlazo: 0.55,
                probDevaluacion: 0.10,
                magnitudDevaluacion: 0.28
            },
            
            // YPFD - YPF (energética, alta volatilidad política)
            'YPFD': {
                gradosLibertad: 2.8,
                lambdaSaltos: 0.22,       // Mayor frecuencia de saltos
                muSalto: -0.09,           // Más bajista
                sigmaSalto: 0.13,
                volOfVol: 0.38,
                meanReversionSpeed: 1.6,
                volLargoPlazo: 0.65,
                probDevaluacion: 0.14,
                magnitudDevaluacion: 0.32
            },
            
            // TS - Tenaris (exportadora, sensible a dólar)
            'TS': {
                gradosLibertad: 3.2,
                lambdaSaltos: 0.16,
                muSalto: -0.065,
                sigmaSalto: 0.105,
                volOfVol: 0.31,
                meanReversionSpeed: 2.1,
                volLargoPlazo: 0.52,
                probDevaluacion: 0.09,
                magnitudDevaluacion: 0.26
            },
            
            // CEPU - Central Puerto (energía, volatilidad moderada)
            'CEPU': {
                gradosLibertad: 3.8,
                lambdaSaltos: 0.14,
                muSalto: -0.055,
                sigmaSalto: 0.095,
                volOfVol: 0.28,
                meanReversionSpeed: 2.3,
                volLargoPlazo: 0.48,
                probDevaluacion: 0.07,
                magnitudDevaluacion: 0.24
            },
            
            // LOOM - Loma Negra (construcción, sensible a actividad económica)
            'LOOM': {
                gradosLibertad: 3.6,
                lambdaSaltos: 0.15,
                muSalto: -0.058,
                sigmaSalto: 0.10,
                volOfVol: 0.29,
                meanReversionSpeed: 2.0,
                volLargoPlazo: 0.49,
                probDevaluacion: 0.08,
                magnitudDevaluacion: 0.25
            },
            
            // ALUA - Aluar (aluminio, expuesta a energía y dólar)
            'ALUA': {
                gradosLibertad: 3.4,
                lambdaSaltos: 0.17,
                muSalto: -0.062,
                sigmaSalto: 0.108,
                volOfVol: 0.30,
                meanReversionSpeed: 1.9,
                volLargoPlazo: 0.53,
                probDevaluacion: 0.09,
                magnitudDevaluacion: 0.27
            }
        };

        /**
         * Obtiene parámetros calibrados para un activo específico
         * @param {string} simbolo - Símbolo del activo
         * @returns {Object} Parámetros calibrados para el activo
         */
        function obtenerParammetrosArgentina(simbolo) {
            // Usar parámetros específicos si existen, sino usar base
            const paramsEspecificos = PARAMETROS_ARGENTINA[simbolo];
            if (paramsEspecificos) {
                return { ...PARAMETROS_ARGENTINA.base, ...paramsEspecificos };
            }
            
            // Para activos no configurados, usar parámetros base
            return PARAMETROS_ARGENTINA.base;
        }
        
        // ==================== LISTA DE CLIENTES AUTORIZADOS ====================
        // Solo los clientes en esta lista podrán acceder a la aplicación
        // Agregá los IDs de cliente y/o emails/nombres de usuario de tus clientes aquí
        const CLIENTES_AUTORIZADOS = {
            // Formato: 'ID_CLIENTE': ['usuario1@email.com', 'usuario2@email.com']
            // Si un ID tiene un array vacío [], se permitirá cualquier usuario para ese ID
            // Ejemplo:
            // '121193': ['usuario@email.com'],  // ID numérico con usuario específico
            // '121193': [],  // ID numérico sin restricción de usuario
            // 'CLI001': ['cliente1@email.com'],
            // 'CLI002': ['cliente2@email.com', 'usuario_alternativo'],
            // Agregá aquí los IDs de tus clientes y sus usuarios asociados
            '121193': []  // Tu ID - array vacío permite cualquier usuario para este ID
        };
        
        // IMPORTANTE: Si esta lista está vacía, se DENEGARÁ el acceso a todos los usuarios
        // Solo los clientes con ID válido en esta lista podrán acceder
        
        // Constantes del mercado argentino
        const TAMAÑO_CONTRATO = 100; // Cada contrato de opción representa 100 acciones en BCBA

        // Configuración - Proxy público de CORS integrado para evitar restricciones del navegador
        // Esta solución funciona completamente dentro del HTML sin archivos externos
        const API_BASE_URL = 'https://api.invertironline.com';
        
        // Lista de proxies CORS públicos para usar como fallback
        const CORS_PROXIES = [
            {
                name: 'corsproxy',
                getUrl: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
                postUrl: (url, body, headers) => {
                    // corsproxy.io usa GET con parámetros para POST también
                    const params = new URLSearchParams({
                        url: url,
                        method: 'POST',
                        body: body,
                        headers: JSON.stringify(headers || {})
                    });
                    return `https://corsproxy.io/?${params.toString()}`;
                }
            },
            {
                name: 'allorigins-raw',
                getUrl: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
                postUrl: null // No soporta POST directamente
            },
            {
                name: 'codetabs',
                getUrl: (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
                postUrl: null // No soporta POST directamente
            }
        ];

        // ==================== PROXY INTEGRADO EN EL HTML ====================
        // Proxy JavaScript integrado que replica la funcionalidad del proxy Python
        // Este proxy funciona completamente dentro del navegador usando Service Worker
        // API_BASE_URL ya está declarado arriba, no redeclarar
        
        // Detectar si estamos en Vercel o en desarrollo local
        const isVercel = window.location.hostname.includes('vercel.app') || 
                        window.location.hostname.includes('vercel.com') ||
                        window.location.hostname.includes('vercel.dev');
        
        const PROXY_VERCEL_URL = '/api/proxy'; // Ruta relativa para Vercel
        const PROXY_LOCAL_URL = 'http://127.0.0.1:5000/proxy';
        const PROXY_HEALTH_URL = 'http://127.0.0.1:5000/health';
        const PROXY_VERCEL_HEALTH_URL = '/api/proxy/health';
        
        let proxyLocalDisponible = false;
        let proxyVercelDisponible = false;
        let serviceWorkerRegistered = false;
        
        // Función para registrar el Service Worker del proxy integrado
        async function registrarProxyIntegrado() {
            if ('serviceWorker' in navigator) {
                try {
                    // Crear el código del Service Worker en línea
                    const swCode = `
                        const API_BASE_URL = '${API_BASE_URL}';
                        
                        self.addEventListener('install', (event) => {
                            self.skipWaiting();
                        });
                        
                        self.addEventListener('activate', (event) => {
                            event.waitUntil(clients.claim());
                        });
                        
                        self.addEventListener('fetch', (event) => {
                            const url = new URL(event.request.url);
                            
                            // Interceptar peticiones al proxy integrado
                            if (url.pathname.startsWith('/proxy-integrado/')) {
                                event.respondWith(handleProxyRequest(event.request, url));
                            }
                        });
                        
                        async function handleProxyRequest(request, url) {
                            try {
                                // Extraer el endpoint de la URL
                                const endpoint = url.pathname.replace('/proxy-integrado/', '');
                                
                                // Construir la URL completa de la API
                                const apiUrl = endpoint === 'health' 
                                    ? null 
                                    : \`\${API_BASE_URL}/\${endpoint}\${url.search}\`;
                                
                                // Manejar health check
                                if (endpoint === 'health') {
                                    return new Response(JSON.stringify({
                                        status: 'ok',
                                        message: 'Proxy integrado funcionando'
                                    }), {
                                        status: 200,
                                        headers: {
                                            'Content-Type': 'application/json',
                                            'Access-Control-Allow-Origin': '*',
                                            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                                            'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept'
                                        }
                                    });
                                }
                                
                                // Preparar headers
                                const headers = new Headers();
                                if (request.headers.get('Authorization')) {
                                    headers.set('Authorization', request.headers.get('Authorization'));
                                }
                                if (request.headers.get('Accept')) {
                                    headers.set('Accept', request.headers.get('Accept'));
                                }
                                if (request.headers.get('Content-Type')) {
                                    headers.set('Content-Type', request.headers.get('Content-Type'));
                                }
                                
                                // Preparar opciones de la petición
                                const fetchOptions = {
                                    method: request.method,
                                    headers: headers,
                                    mode: 'cors',
                                    credentials: 'omit'
                                };
                                
                                // Agregar body si existe
                                if (request.method !== 'GET' && request.method !== 'HEAD') {
                                    const contentType = request.headers.get('Content-Type') || '';
                                    if (contentType.includes('application/json')) {
                                        fetchOptions.body = await request.text();
                                    } else {
                                        fetchOptions.body = await request.text();
                                    }
                                }
                                
                                // Hacer la petición a la API
                                const response = await fetch(apiUrl, fetchOptions);
                                
                                // Crear respuesta con headers CORS
                                const responseHeaders = new Headers(response.headers);
                                responseHeaders.set('Access-Control-Allow-Origin', '*');
                                responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
                                responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
                                
                                return new Response(response.body, {
                                    status: response.status,
                                    statusText: response.statusText,
                                    headers: responseHeaders
                                });
                                
                            } catch (error) {
                                return new Response(JSON.stringify({
                                    error: error.message,
                                    message: 'Error en proxy integrado'
                                }), {
                                    status: 500,
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Access-Control-Allow-Origin': '*'
                                    }
                                });
                            }
                        }
                    `;
                    
                    // Crear un Blob con el código del Service Worker
                    const blob = new Blob([swCode], { type: 'application/javascript' });
                    const swUrl = URL.createObjectURL(blob);
                    
                    // Registrar el Service Worker
                    const registration = await navigator.serviceWorker.register(swUrl);
                    serviceWorkerRegistered = true;
                    console.log('✅ Proxy integrado registrado como Service Worker');
                    
                    // Esperar a que esté activo
                    await navigator.serviceWorker.ready;
                    
                    return true;
                } catch (error) {
                    console.warn('⚠️ No se pudo registrar el proxy integrado:', error);
                    return false;
                }
            }
            return false;
        }
        
        // Función para usar el proxy integrado
        async function usarProxyIntegrado(url, options = {}) {
            if (!serviceWorkerRegistered) {
                await registrarProxyIntegrado();
            }
            
            // Extraer el endpoint de la URL completa
            const urlObj = new URL(url);
            const endpoint = urlObj.pathname.replace(API_BASE_URL, '').replace(/^\//, '') + (urlObj.search || '');
            
            // Construir la URL del proxy integrado
            const proxyUrl = `/proxy-integrado/${endpoint}`;
            
            // Hacer la petición
            const response = await fetch(proxyUrl, {
                method: options.method || 'GET',
                headers: options.headers || {},
                body: options.body
            });
            
            return response;
        }
        
        // Verificar si el proxy de Vercel está disponible
        async function verificarProxyVercel() {
            if (!isVercel) {
                return false;
            }
            
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000);
                
                const response = await fetch(PROXY_VERCEL_HEALTH_URL, {
                    method: 'GET',
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                proxyVercelDisponible = response.ok;
                return proxyVercelDisponible;
            } catch (error) {
                proxyVercelDisponible = false;
                return false;
            }
        }
        
        // Verificar si el proxy local está disponible
        async function verificarProxyLocal() {
            if (isVercel) {
                // En Vercel, no intentar conectar al proxy local
                return false;
            }
            
            try {
                // Crear un AbortController para timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000); // Timeout de 2 segundos
                
                const response = await fetch(PROXY_HEALTH_URL, {
                    method: 'GET',
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                proxyLocalDisponible = response.ok;
                return proxyLocalDisponible;
            } catch (error) {
                // Si es un error de abort (timeout), o cualquier otro error, el proxy no está disponible
                proxyLocalDisponible = false;
                return false;
            }
        }
        
        // Lista de proxies públicos CORS optimizados (ordenados por confiabilidad)
        // corsproxy.io es el más confiable para POST
        const PROXIES_CORS = [
            {
                name: 'corsproxy.io',
                getUrl: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
                supportsPost: true,
                postUrl: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
                timeout: 30000
            },
            {
                name: 'corsproxy.net',
                getUrl: (url) => `https://corsproxy.net/?${encodeURIComponent(url)}`,
                supportsPost: true,
                postUrl: (url) => `https://corsproxy.net/?${encodeURIComponent(url)}`,
                timeout: 30000
            },
            {
                name: 'jsonproxy',
                getUrl: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
                supportsPost: false,
                timeout: 15000
            },
            {
                name: 'rapidapi-cors',
                getUrl: (url) => `https://cors-bypass-proxy.p.rapidapi.com/mixed?url=${encodeURIComponent(url)}`,
                supportsPost: true,
                postUrl: (url) => `https://cors-bypass-proxy.p.rapidapi.com/mixed?url=${encodeURIComponent(url)}`,
                timeout: 25000,
                headers: {
                    'X-RapidAPI-Key': 'demo-key' // Solo para demostración
                }
            },
            {
                name: 'allorigins',
                getUrl: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
                supportsPost: false,
                timeout: 15000
            },
            {
                name: 'cors-anywhere',
                getUrl: (url) => `https://cors-anywhere.herokuapp.com/${url}`,
                supportsPost: true,
                postUrl: (url) => `https://cors-anywhere.herokuapp.com/${url}`,
                timeout: 25000
            },
            {
                name: 'proxy.cors.sh',
                getUrl: (url) => `https://proxy.cors.sh/${url}`,
                supportsPost: true,
                postUrl: (url) => `https://proxy.cors.sh/${url}`,
                timeout: 15000
            }
        ];
        
        // Función fallback con JSONP para cuando todos los proxies fallen
        async function fetchWithJSONP(url, options = {}) {
            return new Promise((resolve, reject) => {
                console.log('🔄 Intentando método fallback JSONP...');
                
                // Extraer el método y body
                const method = options.method || 'GET';
                const hasBody = options.body !== undefined && options.body !== null;
                
                if (method !== 'GET' || hasBody) {
                    reject(new Error('JSONP solo soporta GET sin body'));
                    return;
                }
                
                // Crear callback único
                const callbackName = 'jsonp_callback_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                
                // Preparar URL con callback
                const jsonpUrl = url + (url.includes('?') ? '&' : '?') + 'callback=' + callbackName;
                
                // Definir callback global
                window[callbackName] = function(data) {
                    // Limpiar
                    delete window[callbackName];
                    document.head.removeChild(script);
                    
                    // Retornar respuesta
                    resolve(new Response(JSON.stringify(data), {
                        status: 200,
                        statusText: 'OK',
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    }));
                };
                
                // Crear script
                const script = document.createElement('script');
                script.src = jsonpUrl;
                script.onerror = function() {
                    delete window[callbackName];
                    document.head.removeChild(script);
                    reject(new Error('JSONP fallback failed'));
                };
                
                // Timeout
                setTimeout(() => {
                    if (window[callbackName]) {
                        delete window[callbackName];
                        document.head.removeChild(script);
                        reject(new Error('JSONP timeout'));
                    }
                }, 15000);
                
                document.head.appendChild(script);
            });
        }
        
        // Función para esperar antes de reintentar (para evitar rate limiting)
        function esperar(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
        
        // Función simplificada para manejar CORS con múltiples fallbacks
        async function fetchWithCORS(url, options = {}) {
            const method = options.method || 'GET';
            const hasBody = options.body !== undefined && options.body !== null;
            
            console.log(`🔄 Iniciando petición ${method} a: ${url}`);
            
            // Primero intentar con el proxy local si está disponible
            if (!isVercel && (proxyLocalDisponible || await verificarProxyLocal())) {
                try {
                    console.log(`🏠 Intentando con proxy local...`);
                    const result = await fetchWithProxyLocal(url, options);
                    console.log(`✅ Proxy local funcionó correctamente`);
                    return result;
                } catch (error) {
                    console.log(`⚠️ Proxy local falló: ${error.message}`);
                    proxyLocalDisponible = false;
                }
            }
            
            // Para POST: Priorizar corsproxy.io con reintentos
            if (method === 'POST' && hasBody) {
                return await fetchWithRetry(url, options);
            }
            
            // Para GET: Intentar múltiples proxies en secuencia
            return await fetchGetWithFallbacks(url, options);
        }
        
        // Función para usar el proxy local
        async function fetchWithProxyLocal(url, options = {}) {
            // Extraer el endpoint de la URL completa
            const urlObj = new URL(url);
            const endpoint = urlObj.pathname + urlObj.search;
            
            // Construir URL del proxy local
            const proxyUrl = PROXY_LOCAL_URL + endpoint;
            
            console.log(`🏠 Enviando petición a proxy local: ${proxyUrl}`);
            
            // Preparar headers para el proxy local
            const proxyHeaders = {};
            if (options.headers) {
                console.log(`📋 Headers originales para proxy local:`, options.headers);
                Object.keys(options.headers).forEach(key => {
                    const lowerKey = key.toLowerCase();
                    if (lowerKey !== 'host' && lowerKey !== 'origin' && lowerKey !== 'referer') {
                        proxyHeaders[key] = options.headers[key];
                        console.log(`✅ Header copiado a proxy: ${key} = ${options.headers[key]}`);
                    }
                });
            }
            console.log(`📋 Headers finales para proxy local:`, proxyHeaders);
            
            // Hacer la petición al proxy local
            const response = await fetch(proxyUrl, {
                method: options.method || 'GET',
                headers: proxyHeaders,
                body: options.body,
                timeout: 30000 // 30 segundos
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return response;
        }
        
        // Función especializada para POST con múltiples estrategias
        async function fetchWithRetry(url, options) {
            const bodyContent = options.body instanceof URLSearchParams ? options.body.toString() : 
                              typeof options.body === 'string' ? options.body : 
                              JSON.stringify(options.body);
            
            const fetchHeaders = {};
            if (options.headers) {
                Object.keys(options.headers).forEach(key => {
                    const lowerKey = key.toLowerCase();
                    if (lowerKey !== 'host' && lowerKey !== 'origin' && lowerKey !== 'referer') {
                        fetchHeaders[key] = options.headers[key];
                    }
                });
            }
            
            // Estrategia 1: Rotación de proxies con delays largos
            const strategies = [
                {
                    name: 'corsproxy.io-1',
                    getUrl: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
                    delay: 2000
                },
                {
                    name: 'allorigins',
                    getUrl: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
                    delay: 3000
                },
                {
                    name: 'corsproxy.io-2',
                    getUrl: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
                    delay: 5000
                },
                {
                    name: 'codetabs',
                    getUrl: (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
                    delay: 4000
                },
                {
                    name: 'thingproxy',
                    getUrl: (url) => `https://thingproxy.freeboard.io/fetch/${url}`,
                    delay: 6000
                },
                {
                    name: 'corsproxy.io-3',
                    getUrl: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
                    delay: 8000
                }
            ];
            
            for (let i = 0; i < strategies.length; i++) {
                const strategy = strategies[i];
                
                try {
                    if (i > 0) {
                        console.log(`⏳ Esperando ${strategy.delay/1000}s antes de intentar con ${strategy.name}...`);
                        await esperar(strategy.delay);
                    }
                    
                    console.log(`🔄 [${i + 1}/${strategies.length}] Intentando POST con ${strategy.name} (v2.0)...`);
                    
                    const response = await fetch(strategy.getUrl(url), {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'Accept': 'application/json'
                        },
                        body: bodyContent,
                        timeout: 60000 // 60 segundos
                    });
                    
                    if (response.ok) {
                        const responseText = await response.text();
                        
                        if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
                            throw new Error('Respuesta HTML recibida (probable error de proxy)');
                        }
                        
                        // Verificar que la respuesta contenga un token válido
                        try {
                            const parsedResponse = JSON.parse(responseText);
                            if (parsedResponse.error || !parsedResponse.access_token) {
                                throw new Error(`Respuesta de error: ${parsedResponse.error?.message || 'No se recibió access_token'}`);
                            }
                        } catch (parseError) {
                            if (parseError.message.startsWith('Respuesta de error:')) {
                                throw parseError;
                            }
                            // Si no es JSON, continuar con el flujo normal
                        }
                        
                        console.log(`✅ POST exitoso con ${strategy.name}`);
                        
                        try {
                            JSON.parse(responseText);
                            return new Response(responseText, {
                                status: 200,
                                statusText: 'OK',
                                headers: { 'Content-Type': 'application/json' }
                            });
                        } catch (e) {
                            return new Response(responseText, {
                                status: 200,
                                statusText: 'OK',
                                headers: { 'Content-Type': 'text/plain' }
                            });
                        }
                    } else if (response.status === 401) {
                        console.warn(`⚠️ Error 401 (No autorizado) en ${strategy.name} - Credenciales incorrectas`);
                        throw new Error('HTTP 401: Credenciales incorrectas');
                    } else if (response.status === 429) {
                        console.warn(`⚠️ Rate limit en ${strategy.name}, intentando siguiente...`);
                        continue;
                    } else {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                } catch (error) {
                    console.warn(`⚠️ ${strategy.name} falló:`, error.message);
                    
                    // Si es error 401, no intentar con más proxies
                    if (error.message.includes('HTTP 401')) {
                        throw new Error('Credenciales incorrectas - No se continuarán más intentos');
                    }
                    
                    if (i === strategies.length - 1) {
                        // Último recurso: intentar con iframe
                        try {
                            console.log('🔄 Todos los proxies fallaron, intentando iframe fallback...');
                            return await fetchWithIframe(url, options);
                        } catch (iframeError) {
                            throw new Error(`Todos los métodos fallaron. Último error: ${iframeError.message}`);
                        }
                    }
                }
            }
        }
        
        // Función fallback usando iframe para POST cuando todos los proxies fallen
        async function fetchWithIframe(url, options) {
            return new Promise((resolve, reject) => {
                console.log('🔄 Intentando último recurso: iframe + postMessage...');
                
                const bodyContent = options.body instanceof URLSearchParams ? options.body.toString() : 
                                  typeof options.body === 'string' ? options.body : 
                                  JSON.stringify(options.body);
                
                // Crear iframe oculto
                const iframe = document.createElement('iframe');
                iframe.style.display = 'none';
                iframe.name = 'proxy-iframe-' + Date.now();
                
                // Crear formulario
                const form = document.createElement('form');
                form.method = 'POST';
                form.action = url;
                form.target = iframe.name;
                form.style.display = 'none';
                
                // Agregar campos del formulario
                const params = new URLSearchParams(bodyContent);
                params.forEach((value, key) => {
                    const input = document.createElement('input');
                    input.type = 'hidden';
                    input.name = key;
                    input.value = value;
                    form.appendChild(input);
                });
                
                // Manejar respuesta
                const handleMessage = (event) => {
                    if (event.source === iframe.contentWindow) {
                        window.removeEventListener('message', handleMessage);
                        document.body.removeChild(iframe);
                        document.body.removeChild(form);
                        
                        try {
                            const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                            resolve(new Response(JSON.stringify(data), {
                                status: 200,
                                statusText: 'OK',
                                headers: { 'Content-Type': 'application/json' }
                            }));
                        } catch (e) {
                            resolve(new Response(event.data, {
                                status: 200,
                                statusText: 'OK',
                                headers: { 'Content-Type': 'text/plain' }
                            }));
                        }
                    }
                };
                
                window.addEventListener('message', handleMessage);
                
                // Timeout
                setTimeout(() => {
                    window.removeEventListener('message', handleMessage);
                    if (document.body.contains(iframe)) {
                        document.body.removeChild(iframe);
                    }
                    if (document.body.contains(form)) {
                        document.body.removeChild(form);
                    }
                    reject(new Error('Iframe fallback timeout'));
                }, 30000);
                
                // Agregar al DOM y enviar
                document.body.appendChild(iframe);
                document.body.appendChild(form);
                form.submit();
            });
        }
        
        // Función especializada para GET con múltiples fallbacks
        async function fetchGetWithFallbacks(url, options) {
            const proxies = [
                { name: 'corsproxy.io', url: `https://corsproxy.io/?${encodeURIComponent(url)}` },
                { name: 'api.allorigins.win', url: `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}` },
                { name: 'cors-anywhere', url: `https://cors-anywhere.herokuapp.com/${url}` }
            ];
            
            for (let i = 0; i < proxies.length; i++) {
                try {
                    console.log(`🔄 [${i + 1}/${proxies.length}] Intentando GET con ${proxies[i].name}...`);
                    
                    const response = await fetch(proxies[i].url, {
                        method: 'GET',
                        headers: { 'Accept': 'application/json' },
                        timeout: 20000
                    });
                    
                    if (response.ok) {
                        let responseText = await response.text();
                        
                        if (proxies[i].name === 'api.allorigins.win') {
                            try {
                                const jsonData = JSON.parse(responseText);
                                if (jsonData.contents) {
                                    responseText = jsonData.contents;
                                }
                            } catch (e) {
                                // Usar texto original si no se puede parsear
                            }
                        }
                        
                        if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
                            throw new Error('Respuesta HTML recibida');
                        }
                        
                        console.log(`✅ GET exitoso con ${proxies[i].name}`);
                        return new Response(responseText, {
                            status: 200,
                            statusText: 'OK',
                            headers: { 'Content-Type': 'application/json' }
                        });
                    }
                } catch (error) {
                    console.warn(`⚠️ ${proxies[i].name} falló:`, error.message);
                    if (i === proxies.length - 1) {
                        // Último intento: JSONP fallback
                        try {
                            console.log('🔄 Intentando último recurso: JSONP...');
                            return await fetchWithJSONP(url, options);
                        } catch (jsonpError) {
                            console.warn('⚠️ JSONP también falló:', jsonpError.message);
                            throw new Error(`Todos los métodos fallaron. Último error: ${jsonpError.message}`);
                        }
                    }
                }
            }
        }
        
        // Función para mostrar mensaje sobre el proxy
        function mostrarMensajeProxy(mensaje, tipo = 'error') {
            // Mostrar mensaje en la consola
            if (tipo === 'error') {
                console.error('❌', mensaje);
            } else if (tipo === 'warning') {
                console.warn('⚠️', mensaje);
            } else {
                console.log('✅', mensaje);
            }
            
            // Intentar mostrar en la interfaz (si hay un elemento para mostrar mensajes)
            const mensajeDiv = document.getElementById('mensaje-proxy');
            if (mensajeDiv) {
                mensajeDiv.textContent = mensaje;
                mensajeDiv.style.display = 'block';
                if (tipo === 'error') {
                    mensajeDiv.style.color = 'var(--error, #ef4444)';
                    mensajeDiv.style.borderColor = 'var(--error, #ef4444)';
                } else if (tipo === 'warning') {
                    mensajeDiv.style.color = 'var(--warning, #f59e0b)';
                    mensajeDiv.style.borderColor = 'var(--warning, #f59e0b)';
                } else {
                    mensajeDiv.style.color = 'var(--success, #10b981)';
                    mensajeDiv.style.borderColor = 'var(--success, #10b981)';
                }
            }
        }
        
        // Función para actualizar el estado del proxy en la interfaz
        async function actualizarEstadoProxy() {
            const mensajeDiv = document.getElementById('mensaje-proxy');
            const estaDisponible = await verificarProxyLocal();
            
            if (estaDisponible) {
                mostrarMensajeProxy('Proxy local disponible y funcionando correctamente', 'success');
            } else {
                mostrarMensajeProxy('Proxy local no disponible. Por favor, ejecuta: python proxy_server.py', 'warning');
            }
        }
        
        // Verificar el proxy cuando se carga la página
        document.addEventListener('DOMContentLoaded', async () => {
            // Esperar un poco para que el DOM esté completamente cargado
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Verificar el proxy local (solo una vez al inicio, no mostrar warning si no está)
            const estaDisponible = await verificarProxyLocal();
            if (estaDisponible) {
                mostrarMensajeProxy('Proxy local disponible y funcionando correctamente', 'success');
            }
            
            // Verificar periódicamente (cada 10 segundos, menos frecuente para no molestar)
            setInterval(async () => {
                const disponible = await verificarProxyLocal();
                if (disponible && !proxyLocalDisponible) {
                    // Solo mostrar mensaje si cambió de no disponible a disponible
                    mostrarMensajeProxy('Proxy local disponible y funcionando correctamente', 'success');
                }
            }, 10000);
        });

        // ==================== FUNCIONES MATEMÁTICAS ====================

        // Distribución normal estándar (Abramowitz & Stegun) — exp(-x²/2) para PDF normal
        function normCdf(x) {
            const a1 =  0.254829592;
            const a2 = -0.284496736;
            const a3 =  1.421413741;
            const a4 = -1.453152027;
            const a5 =  1.061405429;
            const p  =  0.3275911;

            const sign = x < 0 ? -1 : 1;
            const absX = Math.abs(x);
            const t = 1.0 / (1.0 + p * absX);
            const poly = ((((a5 * t + a4) * t) + a3) * t + a2) * t + a1;
            const y = 1.0 - poly * t * Math.exp(-absX * absX / 2.0);

            return 0.5 * (1.0 + sign * y);
        }

        function normPdf(x) {
            return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
        }

        function normPpf(p) {
            // Aproximación inversa de la distribución normal
            if (p <= 0 || p >= 1) return null;
            
            const c0 = 2.515517;
            const c1 = 0.802853;
            const c2 = 0.010328;
            const d1 = 1.432788;
            const d2 = 0.189269;
            const d3 = 0.001308;

            let t, x;
            if (p > 0.5) {
                t = Math.sqrt(-2 * Math.log(1 - p));
                x = t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);
            } else {
                t = Math.sqrt(-2 * Math.log(p));
                x = -(t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t));
            }
            return x;
        }

        // Función para calcular valor intrínseco de una opción
        function calcularValorIntrinseco(tipo, S, K) {
            if (tipo === 'Call') {
                return Math.max(0, S - K);
            } else {
                return Math.max(0, K - S);
            }
        }

        // Black-Scholes
        function blackScholes(tipo, S, K, T, r, sigma, q = 0) {
            // CORRECCIÓN: Permitir r = 0, solo verificar que esté definido
            if (S <= 0 || K <= 0 || T <= 0 || r < 0 || sigma <= 0 || typeof S === 'undefined' || typeof K === 'undefined' || typeof T === 'undefined' || typeof r === 'undefined' || typeof sigma === 'undefined') {
                console.warn('⚠️ BlackScholes: Parámetros inválidos', { S, K, T, r, sigma, tipo });
                return { precio: null, delta: null, gamma: null, vega: null, theta: null, rho: null, prob: null };
            }

            const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
            const d2 = d1 - sigma * Math.sqrt(T);
            const nd1 = normPdf(d1);

            let precio, delta, prob, theta;

            if (tipo === 'Call') {
                precio = S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
                delta = normCdf(d1);
                prob = normCdf(d2);
                theta = ((-S * nd1 * sigma) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * normCdf(d2)) / 252;
            } else {
                precio = K * Math.exp(-r * T) * normCdf(-d2) - S * normCdf(-d1);
                delta = normCdf(d1) - 1;
                prob = normCdf(-d2);
                theta = ((-S * nd1 * sigma) / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * normCdf(-d2)) / 252;
            }

            // VALIDACIÓN CRÍTICA: El precio teórico nunca puede ser menor que el valor intrínseco
            const valorIntrinseco = calcularValorIntrinseco(tipo, S, K);
            if (precio < valorIntrinseco) {
                console.error('🚨 INCOHERENCIA CRÍTICA: Precio teórico menor que valor intrínseco', {
                    tipo,
                    S,
                    K,
                    T,
                    r,
                    sigma,
                    precioTeorico: precio,
                    valorIntrinseco: valorIntrinseco,
                    diferencia: valorIntrinseco - precio,
                    delta: delta,
                    gamma: nd1 / (S * sigma * Math.sqrt(T))
                });
                // Ajustar el precio al valor intrínseco como mínimo (esto indica un error en los parámetros)
                precio = valorIntrinseco;
            }

            // NOTA: En teoría, prob nunca debería ser negativa (es una CDF)
            // Si ocurre, indica un error numérico en otro lado
            // if (tipo === 'Put' && prob < 0) prob = 0;

            const gamma = nd1 / (S * sigma * Math.sqrt(T));
            const vega = S * nd1 * Math.sqrt(T);
            const rho = K * T * Math.exp(-r * T) * (tipo === 'Call' ? normCdf(d2) : -normCdf(-d2));

            return { precio, delta, gamma, vega, theta, rho, prob };
        }

        // Modelo Binomial
        function binomialPricing(tipo, S, K, T, r, sigma, N, q = 0, americana = false) {
            if (!S || !K || !T || r < 0 || !sigma || T <= 0 || sigma <= 0) {
                return null;
            }

            const dt = T / N;
            const u = Math.exp(sigma * Math.sqrt(dt));
            const d = 1 / u;
            const p = (Math.exp((r - q) * dt) - d) / (u - d);
            const disc = Math.exp(-r * dt);

            // Inicializar precios al vencimiento
            const precios = [];
            const payoff = [];
            for (let i = 0; i <= N; i++) {
                const precio = S * Math.pow(u, N - i) * Math.pow(d, i);
                precios.push(precio);
                payoff.push(tipo === 'Call' ? Math.max(0, precio - K) : Math.max(0, K - precio));
            }

            // Inducción hacia atrás
            for (let j = N - 1; j >= 0; j--) {
                for (let i = 0; i <= j; i++) {
                    payoff[i] = disc * (p * payoff[i] + (1 - p) * payoff[i + 1]);
                    if (americana) {
                        // CORRECCIÓN: Calcular el precio del subyacente en este nodo específico
                        const precioActual = S * Math.pow(u, j - i) * Math.pow(d, i);
                        const ejercicio = tipo === 'Call' ? Math.max(0, precioActual - K) : Math.max(0, K - precioActual);
                        payoff[i] = Math.max(payoff[i], ejercicio);
                    }
                }
            }

            return payoff[0];
        }

        // Volatilidad implícita
        function calcularVolatilidadImplicita(tipo, S, K, T, r, precioMercado, q = 0, tol = 1e-5, maxIter = 100) {
            // CORRECCIÓN: Validar también K (strike)
            if (precioMercado <= 0 || T <= 0 || S <= 0 || K <= 0) return null;

            let lower, upper;
            if (tipo === 'Call') {
                lower = Math.max(S - K * Math.exp(-r * T), 0);
                upper = S;
            } else {
                lower = Math.max(K * Math.exp(-r * T) - S, 0);
                upper = K * Math.exp(-r * T);
            }

            if (precioMercado < lower || precioMercado > upper) return null;

            // Método de bisección
            let sigmaMin = 0.01;
            let sigmaMax = 2.0;

            for (let i = 0; i < maxIter; i++) {
                const sigma = (sigmaMin + sigmaMax) / 2;
                const precio = blackScholes(tipo, S, K, T, r, sigma, q).precio;
                
                if (Math.abs(precio - precioMercado) < tol) {
                    return sigma;
                }
                
                if (precio < precioMercado) {
                    sigmaMin = sigma;
                } else {
                    sigmaMax = sigma;
                }
            }

            return (sigmaMin + sigmaMax) / 2;
        }

        // ==================== FUNCIONES DE MÉTRICAS AVANZADAS ====================
        
        /**
         * Calcula el Kelly Criterion para determinar el tamaño óptimo de posición
         * @param {number} probProfit - Probabilidad de ganancia
         * @param {number} gananciaEsperada - Ganancia esperada
         * @param {number} precioOpcion - Precio de la opción
         * @returns {number} Porcentaje del capital a asignar (0-0.25 máximo)
         */
        function calcularKellyCriterion(probProfit, gananciaEsperada, precioOpcion) {
            if (!precioOpcion || precioOpcion <= 0) return 0;
            
            const gananciaPromedio = gananciaEsperada;
            const perdidaPromedio = Math.abs(gananciaEsperada < 0 ? gananciaEsperada : gananciaEsperada * 0.5);
            
            if (perdidaPromedio === 0) return 0;
            
            const kellyFraction = (probProfit * gananciaPromedio - (1 - probProfit) * perdidaPromedio) / gananciaPromedio;
            
            // Limitar entre 0 y 25% para evitar sobre-apalancamiento
            return Math.max(0, Math.min(0.25, kellyFraction));
        }
        
        /**
         * Calcula el Sortino Ratio (solo penaliza volatilidad negativa)
         * @param {number} gananciaEsperada - Ganancia esperada
         * @param {Array<number>} payoffs - Array de payoffs de Monte Carlo
         * @returns {number} Sortino Ratio
         */
        function calcularSortinoRatio(gananciaEsperada, payoffs) {
            if (!payoffs || payoffs.length === 0) return 0;
            
            // Calcular desviación estándar solo de pérdidas (valores negativos)
            const perdidas = payoffs.filter(p => p < 0);
            if (perdidas.length === 0) return gananciaEsperada > 0 ? Infinity : 0;
            
            const promedioPerdidas = perdidas.reduce((a, b) => a + b, 0) / perdidas.length;
            const varianzaNegativa = perdidas.reduce((sum, p) => sum + Math.pow(p - promedioPerdidas, 2), 0) / perdidas.length;
            const desviacionNegativa = Math.sqrt(varianzaNegativa);
            
            if (desviacionNegativa === 0) return gananciaEsperada > 0 ? Infinity : 0;
            
            return gananciaEsperada / desviacionNegativa;
        }
        
        /**
         * Calcula Value at Risk (VaR) y Conditional VaR (CVaR)
         * @param {Array<number>} payoffs - Array de payoffs
         * @param {number} nivelConfianza - Nivel de confianza (0.95 o 0.99)
         * @returns {Object} { var, cvar }
         */
        function calcularVaRCVaR(payoffs, nivelConfianza = 0.95) {
            if (!payoffs || payoffs.length === 0) return { var: 0, cvar: 0 };
            
            const sorted = [...payoffs].sort((a, b) => a - b);
            const indice = Math.floor((1 - nivelConfianza) * sorted.length);
            const varValue = sorted[Math.max(0, indice - 1)];
            
            // CVaR: promedio de pérdidas peores que VaR
            const perdidasExtremas = sorted.slice(0, indice).filter(p => p <= varValue);
            const cvar = perdidasExtremas.length > 0 
                ? perdidasExtremas.reduce((a, b) => a + b, 0) / perdidasExtremas.length 
                : varValue;
            
            return { var: varValue, cvar: cvar };
        }
        
        /**
         * Calcula ROI esperado y ROI anualizado
         * @param {number} gananciaEsperada - Ganancia esperada
         * @param {number} precioOpcion - Precio de la opción
         * @param {number} T - Tiempo hasta vencimiento (años)
         * @returns {Object} { roi, roiAnualizado, tiempoRetorno }
         */
        function calcularROI(gananciaEsperada, precioOpcion, T) {
            if (!precioOpcion || precioOpcion <= 0) return { roi: 0, roiAnualizado: 0, tiempoRetorno: Infinity };
            
            const roi = (gananciaEsperada / precioOpcion) * 100;
            const diasVto = Math.round(T * 365);
            const roiAnualizado = diasVto > 0 ? (roi / diasVto) * 365 : 0;
            const tiempoRetorno = gananciaEsperada > 0 && diasVto > 0 
                ? precioOpcion / (gananciaEsperada / diasVto) 
                : Infinity;
            
            return { roi, roiAnualizado, tiempoRetorno };
        }
        
        /**
         * Calcula Expected Value con comisiones reales
         * @param {number} gananciaEsperada - Ganancia esperada sin comisiones
         * @param {number} precioOpcion - Precio de la opción
         * @param {number} comisionPct - Porcentaje de comisión (default 1%)
         * @returns {Object} { gananciaEsperadaNeta, costoTotal, comisionEntrada, comisionSalida }
         */
        function calcularExpectedValueConComisiones(gananciaEsperada, precioOpcion, comisionPct = 0.01) {
            const comisionEntrada = precioOpcion * comisionPct;
            const precioSalidaEstimado = precioOpcion * 1.1; // Asumir 10% de ganancia para salida
            const comisionSalida = precioSalidaEstimado * comisionPct;
            const costoTotal = precioOpcion + comisionEntrada + comisionSalida;
            const gananciaEsperadaNeta = gananciaEsperada - (comisionEntrada + comisionSalida);
            
            return { gananciaEsperadaNeta, costoTotal, comisionEntrada, comisionSalida };
        }
        
        /**
         * Calcula Score de Oportunidad mejorado
         * @param {Object} opcion - Objeto con todas las métricas de la opción
         * @returns {number} Score de 0-100
         */
        function calcularScoreOportunidad(opcion) {
            const {
                MC_GananciaEsperada = 0,
                MC_ProbProfit = 0,
                precioOpcion = 1,
                spreadPct = 100,
                volumen = 0,
                precioVsTeorico = 0,
                sortinoRatio = 0
            } = opcion;
            
            // Normalizar cada componente a 0-1
            const roiComponent = Math.min(1, Math.max(0, (MC_GananciaEsperada / precioOpcion) / 0.5)); // ROI máximo esperado 50%
            const probComponent = MC_ProbProfit; // Ya está entre 0-1
            const liquidezComponent = Math.min(1, 1 / (spreadPct / 10 + 1)); // Inverso del spread
            const volumenComponent = Math.min(1, volumen / 1000); // Normalizar a 1000 contratos
            const mispricingComponent = Math.min(1, 1 / (Math.abs(precioVsTeorico) / 20 + 1)); // Inverso del mispricing
            const riskAdjComponent = Math.min(1, sortinoRatio / 5); // Normalizar Sortino a 5
            
            // Ponderación
            const score = (
                roiComponent * 0.25 +
                probComponent * 0.20 +
                liquidezComponent * 0.15 +
                volumenComponent * 0.10 +
                mispricingComponent * 0.15 +
                riskAdjComponent * 0.15
            ) * 100;
            
            return Math.max(0, Math.min(100, score));
        }
        
        /**
         * Calcula Maximum Drawdown esperado de una trayectoria
         * @param {Array<number>} trayectoria - Array de precios/valores en el tiempo
         * @returns {number} Maximum Drawdown como porcentaje
         */
        function calcularMaxDrawdown(trayectoria) {
            if (!trayectoria || trayectoria.length < 2) return 0;
            
            let maxDrawdown = 0;
            let peak = trayectoria[0];
            
            for (let i = 1; i < trayectoria.length; i++) {
                if (trayectoria[i] > peak) {
                    peak = trayectoria[i];
                } else {
                    const drawdown = (peak - trayectoria[i]) / peak;
                    maxDrawdown = Math.max(maxDrawdown, drawdown);
                }
            }
            
            return maxDrawdown * 100; // Retornar como porcentaje
        }
        
        /**
         * Analiza Volatility Skew del mercado
         * @param {Array} opciones - Array de opciones procesadas
         * @param {number} precioSpot - Precio spot del subyacente
         * @returns {Object} { skew, tipoSkew, interpretacion }
         */
        function analizarVolatilitySkew(opciones, precioSpot) {
            const callsOTM = opciones.filter(op => 
                op.tipoOpcion === 'Call' && op.strike > precioSpot * 1.05 && op.volatilidadImplicita
            );
            const putsOTM = opciones.filter(op => 
                op.tipoOpcion === 'Put' && op.strike < precioSpot * 0.95 && op.volatilidadImplicita
            );
            const atm = opciones.filter(op => 
                Math.abs(op.strike - precioSpot) / precioSpot < 0.02 && op.volatilidadImplicita
            );
            
            if (callsOTM.length === 0 || putsOTM.length === 0 || atm.length === 0) {
                return { skew: 0, tipoSkew: 'Neutro', interpretacion: 'Datos insuficientes' };
            }
            
            const ivVal = (op) => op.volatilidadImplicita ?? op.volatilidadSubyacente ?? 0;
            const ivOTMPut = putsOTM.length ? putsOTM.reduce((sum, op) => sum + ivVal(op), 0) / putsOTM.length : 0;
            const ivOTMCall = callsOTM.length ? callsOTM.reduce((sum, op) => sum + ivVal(op), 0) / callsOTM.length : 0;
            const ivATM = atm.length ? atm.reduce((sum, op) => sum + ivVal(op), 0) / atm.length : 0;
            
            const skew = (ivOTMPut - ivOTMCall) / ivATM;
            
            let tipoSkew = 'Neutro';
            let interpretacion = '';
            
            if (skew > 0.1) {
                tipoSkew = 'Alcista (Miedo)';
                interpretacion = 'Mercado espera caídas. Oportunidad: comprar calls baratas o vender puts caras.';
            } else if (skew < -0.1) {
                tipoSkew = 'Bajista (Euforia)';
                interpretacion = 'Mercado espera subas. Oportunidad: comprar puts baratas o vender calls caras.';
            } else {
                interpretacion = 'Mercado neutral. Skew balanceado.';
            }
            
            return { skew, tipoSkew, interpretacion };
        }
        
        /**
         * Calcula Put-Call Ratio
         * @param {Array} opciones - Array de opciones procesadas
         * @returns {Object} { ratio, interpretacion, señal }
         */
        function calcularPutCallRatio(opciones) {
            const calls = opciones.filter(op => op.tipoOpcion === 'Call');
            const puts = opciones.filter(op => op.tipoOpcion === 'Put');
            
            const volumenCalls = calls.reduce((sum, op) => sum + (op.volumen || 0), 0);
            const volumenPuts = puts.reduce((sum, op) => sum + (op.volumen || 0), 0);
            
            const ratio = volumenCalls > 0 ? volumenPuts / volumenCalls : 0;
            
            let interpretacion = '';
            let señal = 'NEUTRAL';
            
            if (ratio > 1.2) {
                interpretacion = 'Pesimismo extremo. Oportunidad alcista: comprar calls o vender puts.';
                señal = 'ALCISTA';
            } else if (ratio > 1.0) {
                interpretacion = 'Pesimismo moderado. Leve oportunidad alcista.';
                señal = 'LEVE_ALCISTA';
            } else if (ratio < 0.7) {
                interpretacion = 'Optimismo extremo. Oportunidad bajista: comprar puts o vender calls.';
                señal = 'BAJISTA';
            } else if (ratio < 0.9) {
                interpretacion = 'Optimismo moderado. Leve oportunidad bajista.';
                señal = 'LEVE_BAJISTA';
            } else {
                interpretacion = 'Mercado balanceado.';
            }
            
            return { ratio, interpretacion, señal };
        }
        
        /**
         * Calcula Gamma Exposure (GEX) del mercado
         * @param {Array} opciones - Array de opciones procesadas
         * @returns {Object} { gexTotal, gexPorStrike, interpretacion }
         */
        function calcularGammaExposure(opciones) {
            const gexPorStrike = {};
            let gexTotal = 0;
            
            opciones.forEach(op => {
                if (!op.Gamma || !op.volumen || !op.precioSubyacente) return;
                
                const gammaExposure = op.volumen * op.Gamma * op.precioSubyacente * 100;
                const signo = op.tipoOpcion === 'Call' ? 1 : -1;
                
                if (!gexPorStrike[op.strike]) {
                    gexPorStrike[op.strike] = 0;
                }
                gexPorStrike[op.strike] += gammaExposure * signo;
                gexTotal += gammaExposure * signo;
            });
            
            let interpretacion = '';
            if (gexTotal > 0) {
                interpretacion = 'GEX positivo: mercado estable. Gamma hedging reduce volatilidad.';
            } else if (gexTotal < 0) {
                interpretacion = 'GEX negativo: mercado volátil. Gamma hedging amplifica movimientos.';
            } else {
                interpretacion = 'GEX neutral: mercado balanceado.';
            }
            
            return { gexTotal, gexPorStrike, interpretacion };
        }
        
        /**
         * Detecta arbitrajes de Box Spread
         * @param {Array} opciones - Array de opciones procesadas
         * @param {number} precioSpot - Precio spot
         * @param {number} tasaRiesgo - Tasa libre de riesgo
         * @returns {Array} Array de oportunidades de arbitraje
         */
        function detectarBoxSpreadArbitraje(opciones, precioSpot, tasaRiesgo) {
            const arbitrajes = [];
            const mismoVencimiento = {};
            
            // Agrupar por fecha de vencimiento
            opciones.forEach(op => {
                if (!mismoVencimiento[op.fechaVencimiento]) {
                    mismoVencimiento[op.fechaVencimiento] = { calls: [], puts: [] };
                }
                if (op.tipoOpcion === 'Call') {
                    mismoVencimiento[op.fechaVencimiento].calls.push(op);
                } else {
                    mismoVencimiento[op.fechaVencimiento].puts.push(op);
                }
            });
            
            // Buscar box spreads: (Call K1 - Put K1) - (Call K2 - Put K2) = K2 - K1 (descontado)
            Object.keys(mismoVencimiento).forEach(vencimiento => {
                const { calls, puts } = mismoVencimiento[vencimiento];
                const T = calls.length > 0 ? calls[0].T : 0;
                
                for (let i = 0; i < calls.length; i++) {
                    for (let j = i + 1; j < calls.length; j++) {
                        const call1 = calls[i];
                        const call2 = calls[j];
                        const put1 = puts.find(p => p.strike === call1.strike);
                        const put2 = puts.find(p => p.strike === call2.strike);
                        
                        if (!put1 || !put2) continue;
                        
                        const precioBox = (call1.precioOpcion - put1.precioOpcion) - (call2.precioOpcion - put2.precioOpcion);
                        const valorTeorico = (call2.strike - call1.strike) * Math.exp(-tasaRiesgo * T);
                        const diferencia = precioBox - valorTeorico;
                        const margen = (diferencia / valorTeorico) * 100;
                        
                        if (Math.abs(margen) > 2) { // Más de 2% de diferencia
                            arbitrajes.push({
                                tipo: 'Box Spread',
                                strikes: [call1.strike, call2.strike],
                                precioBox: precioBox,
                                valorTeorico: valorTeorico,
                                diferencia: diferencia,
                                margen: margen,
                                fechaVencimiento: vencimiento,
                                oportunidad: margen > 0 ? 'VENDER' : 'COMPRAR'
                            });
                        }
                    }
                }
            });
            
            return arbitrajes;
        }
        
        /**
         * Backtesting básico de estrategias de opciones
         * Simula el rendimiento de una estrategia basada en criterios específicos
         * @param {Array} opciones - Array de opciones procesadas
         * @param {Object} criterios - Criterios de selección { minScore }
         * @param {number} capitalInicial - Capital inicial para simulación
         * @param {number} porcentajePorOperacion - % del capital a usar por operación
         * @returns {Object} Resultados del backtesting
         */
        function backtestEstrategia(opciones, criterios, capitalInicial = 100000, porcentajePorOperacion = 0.1) {
            const {
                minScore = 70,
                maxOperaciones = 10
            } = criterios;
            
            // Filtrar opciones que cumplen criterios
            const opcionesFiltradas = opciones
                .filter(op => 
                    (op.OportunidadScore || 0) >= minScore
                )
                .sort((a, b) => (b.OportunidadScore || 0) - (a.OportunidadScore || 0))
                .slice(0, maxOperaciones);
            
            if (opcionesFiltradas.length === 0) {
                return {
                    exito: false,
                    mensaje: 'No se encontraron opciones que cumplan los criterios',
                    resultados: null
                };
            }
            
            let capital = capitalInicial;
            const operaciones = [];
            let gananciaTotal = 0;
            let operacionesGanadoras = 0;
            let operacionesPerdedoras = 0;
            
            opcionesFiltradas.forEach((op, index) => {
                const capitalAsignado = capital * porcentajePorOperacion;
                const numContratos = Math.floor(capitalAsignado / (op.precioOpcion * TAMAÑO_CONTRATO));
                
                if (numContratos <= 0) return;
                
                const inversion = numContratos * op.precioOpcion * TAMAÑO_CONTRATO;
                // MC_GananciaEsperada es por acción, necesitamos calcular por contrato
                const gananciaEsperadaPorAccion = op.MC_GananciaEsperada || 0;
                // Calcular ganancia total: ganancia por acción × número de acciones (contratos × 100)
                const gananciaReal = gananciaEsperadaPorAccion * numContratos * TAMAÑO_CONTRATO;
                
                // Validar que la ganancia no sea absurda (máximo 10x la inversión)
                const gananciaMaxima = inversion * 10;
                const gananciaRealLimitada = Math.max(-inversion, Math.min(gananciaMaxima, gananciaReal));
                
                capital += gananciaRealLimitada;
                gananciaTotal += gananciaRealLimitada;
                
                if (gananciaRealLimitada > 0) operacionesGanadoras++;
                else if (gananciaRealLimitada < 0) operacionesPerdedoras++;
                
                operaciones.push({
                    simbolo: op.simbolo,
                    strike: op.strike,
                    tipo: op.tipoOpcion,
                    inversion: inversion,
                    ganancia: gananciaRealLimitada,
                    score: op.OportunidadScore
                });
            });
            
            const winRate = operaciones.length > 0 ? (operacionesGanadoras / operaciones.length) * 100 : 0;
            const roiTotal = ((capital - capitalInicial) / capitalInicial) * 100;
            const profitFactor = operacionesPerdedoras > 0 
                ? Math.abs(operacionesGanadoras * gananciaTotal / operacionesPerdedoras) 
                : operacionesGanadoras > 0 ? Infinity : 0;
            
            return {
                exito: true,
                resultados: {
                    capitalInicial: capitalInicial,
                    capitalFinal: capital,
                    gananciaTotal: gananciaTotal,
                    roiTotal: roiTotal,
                    numOperaciones: operaciones.length,
                    operacionesGanadoras: operacionesGanadoras,
                    operacionesPerdedoras: operacionesPerdedoras,
                    winRate: winRate,
                    profitFactor: profitFactor,
                    operaciones: operaciones
                }
            };
        }
        
        /**
         * Función para mostrar resultados de backtesting en la UI
         * @param {Object} resultados - Resultados del backtesting
         * @returns {string} HTML con los resultados
         */
        function mostrarResultadosBacktesting(resultados) {
            if (!resultados || !resultados.exito) {
                return '<div class="error">' + (resultados?.mensaje || 'Error en backtesting') + '</div>';
            }
            
            const { capitalInicial, capitalFinal, gananciaTotal, roiTotal, numOperaciones, 
                    operacionesGanadoras, operacionesPerdedoras, winRate, profitFactor, operaciones } = resultados.resultados;
            
            let html = '<div style="padding: 1.5rem; background: rgba(107, 114, 128, 0.1); border-left: 4px solid #6b7280; border-radius: 8px; margin-top: 1rem;">' +
                '<h3 style="color: var(--text-primary); margin-bottom: 1rem;">📈 Resultados del Backtesting</h3>' +
                '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">' +
                    '<div style="padding: 1rem; background: rgba(255, 255, 255, 0.03); border-radius: 6px;">' +
                        '<div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Capital Inicial</div>' +
                        '<div style="font-size: 1.5rem; font-weight: bold; color: var(--text-primary);">$' + capitalInicial.toLocaleString('es-AR') + '</div>' +
                    '</div>' +
                    '<div style="padding: 1rem; background: rgba(255, 255, 255, 0.03); border-radius: 6px;">' +
                        '<div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Capital Final</div>' +
                        '<div style="font-size: 1.5rem; font-weight: bold; color: var(--text-primary)">$' + capitalFinal.toLocaleString('es-AR') + '</div>' +
                    '</div>' +
                    '<div style="padding: 1rem; background: rgba(255, 255, 255, 0.03); border-radius: 6px;">' +
                        '<div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Ganancia Total</div>' +
                        '<div style="font-size: 1.5rem; font-weight: bold; color: var(--text-primary)">$' + gananciaTotal.toLocaleString('es-AR') + '</div>' +
                    '</div>' +
                    '<div style="padding: 1rem; background: rgba(255, 255, 255, 0.03); border-radius: 6px;">' +
                        '<div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.25rem;">ROI Total</div>' +
                        '<div style="font-size: 1.5rem; font-weight: bold; color: var(--text-primary)">' + roiTotal.toFixed(2) + '%</div>' +
                    '</div>' +
                    '<div style="padding: 1rem; background: rgba(255, 255, 255, 0.03); border-radius: 6px;">' +
                        '<div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Win Rate</div>' +
                        '<div style="font-size: 1.5rem; font-weight: bold; color: var(--text-primary)">' + winRate.toFixed(1) + '%</div>' +
                    '</div>' +
                    '<div style="padding: 1rem; background: rgba(255, 255, 255, 0.03); border-radius: 6px;">' +
                        '<div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Profit Factor</div>' +
                        '<div style="font-size: 1.5rem; font-weight: bold; color: var(--text-primary)">' + (profitFactor === Infinity ? '∞' : profitFactor.toFixed(2)) + '</div>' +
                    '</div>' +
                '</div>' +
                '<div style="margin-top: 1rem;">' +
                    '<h4 style="color: var(--accent-primary); margin-bottom: 0.5rem;">Operaciones (' + numOperaciones + ')</h4>' +
                    '<div style="max-height: 300px; overflow-y: auto;">' +
                        '<table class="data-table" style="font-size: 0.85rem;">' +
                            '<thead><tr>' +
                                '<th>Símbolo</th><th>Tipo</th><th>Strike</th><th>Inversión</th>' +
                                '<th>Ganancia</th><th>Score</th>' +
                            '</tr></thead><tbody>';
            
            operaciones.forEach(op => {
                html += '<tr>' +
                    '<td>' + op.simbolo + '</td>' +
                    '<td>' + op.tipo + '</td>' +
                    '<td>$' + op.strike.toFixed(2) + '</td>' +
                    '<td>$' + op.inversion.toLocaleString('es-AR') + '</td>' +
                    '<td style="color: var(--text-primary)">$' + 
                        op.ganancia.toLocaleString('es-AR') + '</td>' +
                    '<td>' + op.score.toFixed(1) + '</td>' +
                    '</tr>';
            });
            
            html += '</tbody></table></div></div></div>';
            
            return html;
        }

        // ==================== FUNCIONES DE API ====================


        /**
         * Obtiene el perfil del usuario autenticado desde la API de InvertirOnline
         * @param {string} token - Token de autenticación
         * @returns {Object|null} Perfil del usuario o null si hay error
         */
        async function obtenerPerfilUsuario(token) {
            const url = `${API_BASE_URL}/api/v2/datos-perfil`;
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            };

            try {
                const respuesta = await fetchWithCORS(url, {
                    method: 'GET',
                    headers: headers
                });

                if (respuesta && respuesta.ok) {
                    const responseText = await respuesta.text();
                    try {
                        return JSON.parse(responseText);
                    } catch (parseError) {
                        console.error('Error al parsear perfil:', parseError);
                        return null;
                    }
                }
                return null;
            } catch (error) {
                console.error('Error al obtener perfil:', error.message);
                return null;
            }
        }

        async function obtenerTokens(usuario, contraseña) {
            // Endpoint original de InvertirOnline para autenticación
            const url = `${API_BASE_URL}/token`;
            
            // Intentar primero con form data (formato estándar OAuth2)
            try {
                console.log('🔐 Intentando autenticar con:', { usuario, url });
                
                const datos = new URLSearchParams({
                    username: usuario,
                    password: contraseña,
                    grant_type: 'password',
                    client_id: 'invertir_online_web' // Intentar con client_id genérico
                });

                const headers = {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                };

                console.log('📋 Enviando datos (form-data):', datos.toString());
                
                const respuesta = await fetchWithCORS(url, {
                    method: 'POST',
                    body: datos,
                    headers: headers
                });

                if (respuesta) {
                    let responseText = await respuesta.text();
                    console.log('📡 Respuesta del servidor (form-data):', respuesta.status, responseText.substring(0, 200));
                    
                    if (respuesta.ok && responseText.includes('access_token')) {
                        return await procesarRespuestaTokens(responseText);
                    }
                }
            } catch (error) {
                console.log('⚠️ Falló autenticación con form-data:', error.message);
            }

            // Si falla, intentar sin client_id
            try {
                console.log('🔄 Intentando sin client_id...');
                
                const datos = new URLSearchParams({
                    username: usuario,
                    password: contraseña,
                    grant_type: 'password'
                });

                const headers = {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                };

                console.log('📋 Enviando datos (form-data sin client_id):', datos.toString());
                
                const respuesta = await fetchWithCORS(url, {
                    method: 'POST',
                    body: datos,
                    headers: headers
                });

                if (respuesta) {
                    let responseText = await respuesta.text();
                    console.log('📡 Respuesta del servidor (sin client_id):', respuesta.status, responseText.substring(0, 200));
                    
                    if (respuesta.ok && responseText.includes('access_token')) {
                        return await procesarRespuestaTokens(responseText);
                    }
                }
            } catch (error) {
                console.log('⚠️ Falló autenticación sin client_id:', error.message);
            }

            // Si falla, intentar con JSON
            try {
                console.log('🔄 Intentando con formato JSON...');
                
                const datosJSON = {
                    username: usuario,
                    password: contraseña,
                    grant_type: 'password'
                };

                const headersJSON = {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                };

                console.log('📋 Enviando datos (JSON):', JSON.stringify(datosJSON));
                
                const respuesta = await fetchWithCORS(url, {
                    method: 'POST',
                    body: JSON.stringify(datosJSON),
                    headers: headersJSON
                });

                if (respuesta) {
                    let responseText = await respuesta.text();
                    console.log('📡 Respuesta del servidor (JSON):', respuesta.status, responseText.substring(0, 200));
                    
                    if (respuesta.ok && responseText.includes('access_token')) {
                        return await procesarRespuestaTokens(responseText);
                    }
                }
            } catch (error) {
                console.log('⚠️ Falló autenticación con JSON:', error.message);
            }

            throw new Error('No se pudo autenticar con ningún formato');
        }

        async function procesarRespuestaTokens(responseText) {
            try {
                const data = JSON.parse(responseText);
                if (data.access_token) {
                    console.log('✅ Tokens recibidos correctamente');
                    return {
                        accessToken: data.access_token,
                        refreshToken: data.refresh_token || null,
                        expiresIn: data.expires_in || 3600,
                        tokenType: data.token_type || 'Bearer'
                    };
                } else {
                    throw new Error('La respuesta no contiene access_token');
                }
            } catch (parseError) {
                console.error('Error al parsear respuesta de tokens:', parseError);
                throw new Error('Error al procesar respuesta del servidor');
            }
        }

        async function obtenerDatosOpciones(token, simbolo) {
            const url = `${API_BASE_URL}/api/v2/${CONFIG.mercado}/Titulos/${simbolo}/Opciones`;
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            };

            try {
                console.log('🔍 Obteniendo datos de opciones para:', simbolo);
                const respuesta = await fetchWithCORS(url, { 
                    method: 'GET',
                    headers: headers
                });

                if (respuesta) {
                    let responseText = await respuesta.text();
                    console.log('📡 Respuesta de opciones:', respuesta.status, responseText.substring(0, 200));
                    
                    // Si el token expiró, intentar renovarlo
                    if (respuesta.status === 401 && responseText.includes('Authorization has been denied')) {
                        console.log('🔄 Token expirado, intentando renovar...');
                        const usuario = localStorage.getItem('iol_username');
                        const contraseña = prompt('Token expirado. Por favor, ingresá nuevamente tu contraseña:');
                        
                        if (usuario && contraseña) {
                            const nuevosTokens = await obtenerTokens(usuario, contraseña);
                            if (nuevosTokens) {
                                tokenPortador = nuevosTokens.access_token;
                                localStorage.setItem('iol_token', tokenPortador);
                                console.log('✅ Token renovado, reintentando obtener opciones...');
                                return await obtenerDatosOpciones(tokenPortador, simbolo);
                            }
                        }
                    }
                    
                    if (respuesta.ok) {
                        try {
                            const data = JSON.parse(responseText);
                            console.log('✅ Datos parseados correctamente, tipo:', typeof data);
                            
                            // Verificar si la respuesta contiene opciones
                            if (Array.isArray(data)) {
                                console.log(`✅ Se encontraron ${data.length} opciones`);
                                return data;
                            } else if (data && typeof data === 'object') {
                                if (Array.isArray(data.opciones)) {
                                    console.log(`✅ Se encontraron ${data.opciones.length} opciones (objeto.opciones)`);
                                    return data.opciones;
                                } else if (Array.isArray(data.Titulos)) {
                                    console.log(`✅ Se encontraron ${data.Titulos.length} opciones (objeto.Titulos)`);
                                    return data.Titulos;
                                } else {
                                    console.warn('⚠️ Respuesta es un objeto pero no contiene array de opciones:', Object.keys(data));
                                    if (data.message) {
                                        console.error('❌ Error de API:', data.message);
                                        throw new Error(`Error de API: ${data.message}`);
                                    }
                                    return [];
                                }
                            } else {
                                console.warn('⚠️ Respuesta no es array ni objeto válido');
                                return [];
                            }
                        } catch (parseError) {
                            console.error('❌ Error parseando respuesta de opciones:', parseError);
                            console.error('📄 Respuesta cruda:', responseText.substring(0, 500));
                            return [];
                        }
                    } else {
                        console.warn('⚠️ Error en respuesta de opciones:', respuesta.status, responseText.substring(0, 200));
                        return [];
                    }
                }
                
                console.log('❌ No se obtuvo respuesta del servidor');
                return [];
            } catch (error) {
                console.error('❌ Error obteniendo datos de opciones:', error.message);
                return [];
            }
        }

        async function obtenerCotizacionSubyacente(token, simbolo) {
            const url = `${API_BASE_URL}/api/v2/${CONFIG.mercado}/Titulos/${simbolo}/Cotizacion`;
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            };

            try {
                // Usar proxy CORS directamente
                const respuesta = await fetchWithCORS(url, { 
                    method: 'GET',
                    headers: headers
                });

                if (respuesta && respuesta.ok) {
                    const responseText = await respuesta.text();
                    try {
                        return JSON.parse(responseText);
                    } catch (parseError) {
                        return null;
                    }
                }
                return null;
            } catch (error) {
                console.error('Error al obtener cotización:', error.message);
                return null;
            }
        }

        async function obtenerSerieHistorica(token, simbolo, fechaDesde, fechaHasta) {
            const url = `${API_BASE_URL}/api/v2/${CONFIG.mercado}/Titulos/${simbolo}/Cotizacion/seriehistorica/${fechaDesde}/${fechaHasta}/SinAjustar`;
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            };

            try {
                // Usar proxy CORS directamente
                const respuesta = await fetchWithCORS(url, { 
                    method: 'GET',
                    headers: headers
                });

                if (respuesta && respuesta.ok) {
                    const responseText = await respuesta.text();
                    try {
                        const data = JSON.parse(responseText);
                        return Array.isArray(data) ? data : [];
                    } catch (parseError) {
                        return [];
                    }
                }
                return [];
            } catch (error) {
                console.error('Error al obtener serie histórica:', error.message);
                return [];
            }
        }

        async function obtenerTasasCaucion(token) {
            const url = `${API_BASE_URL}/api/v2/Cotizaciones/cauciones/argentina`;
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            };

            try {
                // Usar proxy CORS directamente
                const respuesta = await fetchWithCORS(url, { 
                    method: 'GET',
                    headers: headers
                });

                if (respuesta && respuesta.ok) {
                    const responseText = await respuesta.text();
                    try {
                        return JSON.parse(responseText);
                    } catch (parseError) {
                        return null;
                    }
                } else {
                    console.warn('No se pudieron obtener tasas de caución:', respuesta?.status || 'Desconocido');
                    return null;
                }
            } catch (error) {
                console.warn('Error al obtener tasas de caución (no crítico):', error.message);
                return null;
            }
        }

        async function obtenerCotizacionDetalle(token, simbolo) {
            if (!token || !simbolo || simbolo.trim() === '') {
                return { montoOperado: 0, volumenNominal: 0, cantidadOperaciones: 0 };
            }

            const url = `${API_BASE_URL}/api/v2/${CONFIG.mercado}/Titulos/${simbolo}/CotizacionDetalle`;
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            };

            try {
                // Usar proxy CORS directamente
                const respuesta = await fetchWithCORS(url, { 
                    method: 'GET',
                    headers: headers
                });

                if (respuesta) {
                    const responseText = await respuesta.text();
                    
                    // Si el status no es 200, puede ser un error pero igual intentar parsear
                    if (!respuesta.ok && respuesta.status !== 401) {
                        // Solo loguear si no es 401 (no autorizado) o 404 (no encontrado)
                        if (respuesta.status !== 404) {
                            console.warn(`Error al obtener cotización detalle para ${simbolo}:`, respuesta.status);
                        }
                    }
                    
                    try {
                        const data = JSON.parse(responseText);
                        const d = data.cotizacionDetalle || data.datos || data;
                        
                        // MontoOperado: valor en $ (API puede venir en centavos). Intentar varios nombres
                        let montoOperado = 0;
                        const montoKeys = ['montoOperado', 'monto', 'montoOperadoTotal', 'importeOperado', 'montoNominal'];
                        for (const k of montoKeys) {
                            if (d[k] !== undefined && d[k] !== null && d[k] !== '') {
                                montoOperado = procesarMonto(d[k]);
                                break;
                            }
                        }
                        
                        // Volumen: cantidad de contratos. volumen/cantidad = conteo; volumenNominal a veces = valor $
                        let volumenNominal = 0;
                        if (d.volumen !== undefined && d.volumen !== null && d.volumen !== '') {
                            volumenNominal = procesarVolumen(d.volumen);
                        } else if (d.cantidad !== undefined && d.cantidad !== null) {
                            volumenNominal = procesarVolumen(d.cantidad);
                        } else if (d.cantidadOperada !== undefined && d.cantidadOperada !== null) {
                            volumenNominal = procesarVolumen(d.cantidadOperada);
                        } else if (d.volumenNominal !== undefined && d.volumenNominal !== null) {
                            volumenNominal = procesarVolumen(d.volumenNominal);
                        }
                        
                        // CantidadOperaciones: número de operaciones
                        let cantidadOperaciones = 0;
                        const opsKeys = ['cantidadOperaciones', 'operaciones', 'cantidad', 'numeroOperaciones'];
                        for (const k of opsKeys) {
                            if (d[k] !== undefined && d[k] !== null) {
                                cantidadOperaciones = parseInt(d[k], 10) || 0;
                                if (cantidadOperaciones > 0) break;
                            }
                        }
                        
                        if (montoOperado > 0 || volumenNominal > 0 || cantidadOperaciones > 0) {
                            console.log(`✅ CotizacionDetalle ${simbolo}:`, { montoOperado, volumenNominal, cantidadOperaciones });
                        } else if (!window._cotizacionDetalleLogged) {
                            window._cotizacionDetalleLogged = true;
                            console.warn('⚠️ CotizacionDetalle devolvió ceros. Estructura recibida (sample):', Object.keys(d).slice(0, 15));
                        }
                        
                        return {
                            montoOperado,
                            volumenNominal,
                            cantidadOperaciones
                        };
                    } catch (parseError) {
                        console.warn(`Error al parsear respuesta para ${simbolo}:`, parseError);
                        // Si no se puede parsear, devolver valores por defecto
                        return { montoOperado: 0, volumenNominal: 0, cantidadOperaciones: 0 };
                    }
                }
                return { montoOperado: 0, volumenNominal: 0, cantidadOperaciones: 0 };
            } catch (error) {
                console.warn(`Error al obtener cotización detalle para ${simbolo}:`, error);
                return { montoOperado: 0, volumenNominal: 0, cantidadOperaciones: 0 };
            }
        }

        // ==================== FUNCIONES DE PROCESAMIENTO ====================

        function procesarMonto(valor) {
            // Para precios y montos generales: convertir de centavos a pesos
            if (typeof valor === 'string') {
                // Remover separadores de miles (puntos) y convertir coma decimal a punto
                const numero = parseFloat(valor.replace(/\./g, '').replace(',', '.')) || 0;
                // La API devuelve valores en centavos, dividir por 100
                return numero / 100;
            }
            const numero = parseFloat(valor) || 0;
            // La API devuelve valores en centavos, dividir por 100
            return numero / 100;
        }

        // Volumen es CANTIDAD de contratos, NO valor en centavos — no dividir por 100
        function procesarVolumen(valor) {
            if (valor === undefined || valor === null || valor === '') return 0;
            if (typeof valor === 'number' && !isNaN(valor)) return Math.max(0, Math.floor(valor));
            if (typeof valor === 'string') {
                const numero = parseInt(valor.replace(/\D/g, ''), 10);
                return isNaN(numero) ? 0 : Math.max(0, numero);
            }
            return 0;
        }

        function procesarPrecioSubyacente(valor) {
            // El precio del subyacente viene en pesos, NO en centavos
            // Solo necesitamos parsear el valor sin dividir por 100
            if (typeof valor === 'string') {
                // Remover separadores de miles (puntos) y convertir coma decimal a punto
                const numero = parseFloat(valor.replace(/\./g, '').replace(',', '.')) || 0;
                return numero;
            }
            const numero = parseFloat(valor) || 0;
            return numero;
        }

        function procesarStrike(valor) {
            // Si el valor ya es un número válido, devolverlo directamente sin modificar
            if (typeof valor === 'number' && !isNaN(valor) && isFinite(valor)) {
                return valor;
            }
            
            // Si es string, procesarlo cuidadosamente sin eliminar puntos decimales
            if (typeof valor === 'string') {
                const limpio = valor.trim();
                
                // Si está vacío, retornar 0
                if (!limpio) return 0;
                
                // Intentar parsear directamente primero (para números simples como "11777")
                const parseadoDirecto = parseFloat(limpio);
                if (!isNaN(parseadoDirecto) && isFinite(parseadoDirecto)) {
                    // Si el string original no tenía punto ni coma, es un entero
                    if (!limpio.includes('.') && !limpio.includes(',')) {
                        return parseadoDirecto;
                    }
                    // Si tenía punto o coma, puede tener decimales - devolver tal cual
                    return parseadoDirecto;
                }
                
                // Si falló el parseo directo, limpiar solo caracteres no numéricos excepto punto y coma
                const soloNumeros = limpio.replace(/[^\d.,-]/g, '');
                
                // Si tiene coma como separador decimal (formato argentino: 8000,50)
                if (soloNumeros.includes(',') && !soloNumeros.includes('.')) {
                    const numero = parseFloat(soloNumeros.replace(/\./g, '').replace(',', '.')) || 0;
                    return isNaN(numero) || !isFinite(numero) ? 0 : numero;
                }
                
                // Si tiene punto como separador decimal
                if (soloNumeros.includes('.')) {
                    const partes = soloNumeros.split('.');
                    // Si tiene múltiples puntos, el último es decimal y los anteriores son separadores de miles
                    if (partes.length > 2) {
                        const numero = parseFloat(partes.slice(0, -1).join('') + '.' + partes[partes.length - 1]) || 0;
                        return isNaN(numero) || !isFinite(numero) ? 0 : numero;
                    } else {
                        const numero = parseFloat(soloNumeros) || 0;
                        return isNaN(numero) || !isFinite(numero) ? 0 : numero;
                    }
                }
                
                // Solo números sin separadores
                const numero = parseFloat(soloNumeros) || 0;
                return isNaN(numero) || !isFinite(numero) ? 0 : numero;
            }
            
            // Para otros tipos, intentar parsear
            const numero = parseFloat(valor) || 0;
            if (isNaN(numero) || !isFinite(numero) || numero < 0) {
                console.warn('⚠️ Strike inválido procesado:', valor);
                return 0;
            }
            
            return numero;
        }

        // Función para formatear strikes: muestra enteros sin decimales, decimales con los necesarios
        function formatearStrike(strike) {
            if (strike === null || strike === undefined || isNaN(strike)) {
                return '0';
            }
            
            // Si es un número entero, mostrarlo sin decimales
            if (Number.isInteger(strike)) {
                return strike.toString();
            }
            
            // Si tiene decimales, mostrar solo los necesarios (máximo 2, sin ceros innecesarios)
            const redondeado = Math.round(strike * 100) / 100; // Redondear a 2 decimales
            if (Number.isInteger(redondeado)) {
                return redondeado.toString();
            }
            
            // Mostrar con decimales, eliminando ceros finales
            return redondeado.toFixed(2).replace(/\.?0+$/, '');
        }

        /**
         * Valida y corrige un strike si parece estar mal parseado
         * @param {number} strike - Strike a validar
         * @param {string} ticker - Ticker de la opción
         * @param {number} precioSubyacente - Precio actual del subyacente
         * @returns {number} Strike corregido si es necesario
         */
        function validarYCorregirStrike(strike, ticker, precioSubyacente) {
            if (!ticker || strike <= 0 || precioSubyacente <= 0) return strike;
            
            // Si el strike es muy pequeño (< 100) pero el precio del subyacente es alto (> 1000),
            // probablemente está mal parseado
            if (strike < 100 && precioSubyacente > 1000) {
                const strikeDelTicker = extraerStrikeDesdeTicker(ticker);
                // Si el strike del ticker es mucho mayor (más de 10x), usar ese
                if (strikeDelTicker > 0 && strikeDelTicker > strike * 10) {
                    console.warn('⚠️ Strike corregido:', ticker, 'de', strike, 'a', strikeDelTicker);
                    return strikeDelTicker;
                }
            }
            
            // Si el strike es muy pequeño comparado con el precio del subyacente (menos del 1%),
            // y el precio del subyacente es alto, probablemente está mal
            if (strike < precioSubyacente * 0.01 && precioSubyacente > 1000) {
                const strikeDelTicker = extraerStrikeDesdeTicker(ticker);
                if (strikeDelTicker > 0 && strikeDelTicker > precioSubyacente * 0.1) {
                    console.warn('⚠️ Strike corregido por proporción:', ticker, 'de', strike, 'a', strikeDelTicker);
                    return strikeDelTicker;
                }
            }
            
            return strike;
        }

        function extraerStrikeDesdeTicker(ticker) {
            if (!ticker || typeof ticker !== 'string') return 0;
            
            // Formatos de ticker:
            // - Con punto decimal: COMC31.0NO, GFGC75.0AB, ALUC400.DI → el número está en pesos directamente
            // - Sin punto de 5 dígitos seguidos de letra: GFGC97772D → 97772 representa strike 9777.2 (dividir por 10)
            // - Sin punto de 6+ dígitos: GFGC117777D → 117777 representa strike en números enteros
            // - Sin punto de 4 dígitos seguidos de letras: ALUC1000DI, ALUC1050DI → 1000/1050 representa strike entero
            // - Sin punto de 4 dígitos sin letras después: COMC6238 → 6238 representa strike 62.38 (dividir por 100)
            // - Sin punto de 1-3 dígitos: COMC31, GFGC75 → el número está en pesos directamente
            
            // Buscar el patrón: 3 letras + C o V + números (funciona con cualquier prefijo: COM, GFG, ALU, etc.)
            const match = ticker.match(/[A-Z]{3}[CV](\d+(?:\.\d+)?)([A-Z]*)/);
            if (!match) {
                console.warn('No se pudo extraer strike del ticker:', ticker);
                return 0;
            }
            
            const numeroStr = match[1];
            const letrasDespues = match[2] || ''; // Letras después del número (ej: "DI", "FE", "AB", "D")
            
            // Si tiene punto decimal (ej: 31.0, 108., 75.0, 400.DI)
            // El número del ticker está en pesos directamente
            if (numeroStr.includes('.')) {
                return parseFloat(numeroStr);
            }
            
            // Si no tiene punto, el formato es compacto
            const numero = parseInt(numeroStr);
            
            // Códigos de 5 dígitos seguidos de letra: hay dos formatos posibles
            // Formato 1: Último dígito es decimal (ej: GFGC97772D → 97772 / 10 = 9777.2)
            // Formato 2: Número entero (ej: GFGC10577D → 10577, GFGC10177D → 10177, GFGC10600F → 10600)
            // Distinguimos por el rango: si el número es < 20000, es un número entero (strikes de 10k-20k)
            if (numero >= 10000 && numero < 100000 && letrasDespues && letrasDespues.length > 0) {
                // Si el número es menor a 20000, es un strike entero (ej: 10577 → 10577, 10177 → 10177)
                // Estos son strikes típicos de acciones como GGAL que están en el rango 10,000-20,000
                if (numero < 20000) {
                    return numero; // Retornar como entero, NO dividir
                }
                // Si es >= 20000, es formato de 1 decimal (ej: 97772 → 9777.2)
                return numero / 10;
            }
            
            // Códigos de 6+ dígitos: el número es el strike directamente en enteros
            // Ejemplo: GFGC117777D → strike 117777 (entero)
            if (numero >= 100000) {
                return numero;
            }
            
            // Códigos de 4 dígitos: verificar si hay letras después del número
            // Si hay letras después (ej: ALUC1000DI, ALUC1050DI), es un número entero
            // Si no hay letras (ej: COMC6238), dividir por 100
            if (numero >= 1000) {
                if (letrasDespues && letrasDespues.length > 0) {
                    // Hay letras después del número → es entero
                    // Ejemplo: ALUC1000DI → strike 1000 (entero)
                    // Ejemplo: ALUC1050DI → strike 1050 (entero)
                    return numero;
                } else {
                    // No hay letras después → dividir por 100
                    // Ejemplo: COMC6238 → 6238 / 100 = 62.38 pesos
                    return numero / 100;
                }
            }
            
            // Códigos de 1-3 dígitos: el número está en pesos directamente
            // Ejemplo: COMC31 → 31 pesos, GFGC75 → 75 pesos
            return numero;
        }

        /**
         * Calcula la volatilidad histórica y la distribución empírica de retornos
         * @param {Array} precios - Array de precios históricos
         * @param {boolean} usarTodoElPeriodo - Si usar todo el período o solo últimos 30 días
         * @returns {Object} { volatilidad, retornos, distribucionEmpirica, media, varianza }
         */
        function calcularVolatilidadHistorica(precios, usarTodoElPeriodo = true) {
            // CORRECCIÓN: Usar todo el período histórico disponible por defecto
            if (precios.length < 2) {
                return {
                    volatilidad: 0.3,
                    retornos: [],
                    distribucionEmpirica: null,
                    media: 0,
                    varianza: 0.09
                };
            }
            
            const retornos = [];
            for (let i = 1; i < precios.length; i++) {
                // Validar precios positivos
                if (precios[i] > 0 && precios[i-1] > 0) {
                    retornos.push(Math.log(precios[i] / precios[i - 1]));
                }
            }

            if (retornos.length < 10) {
                return {
                    volatilidad: 0.3,
                    retornos: retornos,
                    distribucionEmpirica: null,
                    media: 0,
                    varianza: 0.09
                };
            }

            // Usar todos los retornos disponibles o solo ventana de 30 días
            const retornosUsar = usarTodoElPeriodo ? retornos : retornos.slice(-30);
            
            const media = retornosUsar.reduce((a, b) => a + b, 0) / retornosUsar.length;
            // CORRECCIÓN: Usar n-1 para desviación estándar muestral (no n)
            const varianza = retornosUsar.reduce((sum, r) => sum + Math.pow(r - media, 2), 0) / (retornosUsar.length - 1);
            const volatilidad = Math.sqrt(varianza) * Math.sqrt(252);

            // Calcular distribución empírica (histograma de retornos)
            const distribucionEmpirica = calcularDistribucionEmpirica(retornosUsar);

            // CORRECCIÓN: Límite más realista para Argentina (1% a 300%)
            const volatilidadLimitada = Math.max(0.01, Math.min(volatilidad, 3.0));

            return {
                volatilidad: volatilidadLimitada,
                retornos: retornosUsar,
                distribucionEmpirica: distribucionEmpirica,
                media: media,
                varianza: varianza,
                desviacionEstandar: Math.sqrt(varianza)
            };
        }

        /**
         * Calcula la distribución empírica de retornos (histograma y probabilidades)
         * @param {Array} retornos - Array de retornos logarítmicos
         * @returns {Object} { bins, frecuencias, probabilidades, cdf }
         */
        function calcularDistribucionEmpirica(retornos) {
            if (!retornos || retornos.length === 0) return null;

            // Ordenar retornos
            const retornosOrdenados = [...retornos].sort((a, b) => a - b);
            const minRetorno = retornosOrdenados[0];
            const maxRetorno = retornosOrdenados[retornosOrdenados.length - 1];
            
            // Crear bins (usar regla de Sturges para número de bins)
            const nBins = Math.ceil(1 + Math.log2(retornos.length));
            const anchoBin = (maxRetorno - minRetorno) / nBins;
            
            const bins = [];
            const frecuencias = new Array(nBins).fill(0);
            
            // Crear bins
            for (let i = 0; i < nBins; i++) {
                bins.push(minRetorno + i * anchoBin);
            }
            bins.push(maxRetorno); // Último límite
            
            // Contar frecuencias
            retornos.forEach(retorno => {
                let binIndex = Math.floor((retorno - minRetorno) / anchoBin);
                binIndex = Math.min(binIndex, nBins - 1); // Asegurar que no exceda
                frecuencias[binIndex]++;
            });
            
            // Calcular probabilidades
            const probabilidades = frecuencias.map(f => f / retornos.length);
            
            // Calcular CDF (función de distribución acumulada)
            const cdf = [];
            let acumulado = 0;
            probabilidades.forEach(prob => {
                acumulado += prob;
                cdf.push(acumulado);
            });
            
            return {
                bins: bins,
                frecuencias: frecuencias,
                probabilidades: probabilidades,
                cdf: cdf,
                minRetorno: minRetorno,
                maxRetorno: maxRetorno,
                anchoBin: anchoBin
            };
        }

        /**
         * Simula volatilidad estocástica usando modelo Heston simplificado
         * @param {number} sigma0 - Volatilidad inicial
         * @param {number} dt - Paso de tiempo
         * @param {Object} distribucionEmpirica - Distribución empírica de retornos
         * @param {number} kappa - Velocidad de reversión a la media (default: 2.0)
         * @param {number} theta - Volatilidad de largo plazo (default: sigma0)
         * @param {number} xi - Volatilidad de la volatilidad (default: 0.3)
         * @param {number} rho - Correlación entre precio y volatilidad (default: -0.7)
         * @returns {number} Nueva volatilidad
         */
        function simularVolatilidadEstocastica(sigma0, dt, distribucionEmpirica, kappa = 2.0, theta = null, xi = 0.3, rho = -0.7) {
            // Si theta no se proporciona, usar sigma0 como volatilidad de largo plazo
            if (theta === null) {
                theta = sigma0;
            }
            
            // Generar dos variables normales correlacionadas
            const Z1 = generarNormal();
            const Z2 = generarNormal();
            const Zv = rho * Z1 + Math.sqrt(1 - rho * rho) * Z2; // Correlacionado con Z1
            
            // Modelo Heston: dV_t = kappa * (theta - V_t) * dt + xi * sqrt(V_t) * dW_v
            // donde V_t = sigma_t^2
            const V0 = sigma0 * sigma0; // Varianza inicial
            
            // Discretización de Euler para el proceso de varianza
            const drift = kappa * (theta * theta - V0) * dt;
            const diffusion = xi * Math.sqrt(Math.max(0.01, V0)) * Math.sqrt(dt) * Zv;
            const Vt = V0 + drift + diffusion;
            
            // Asegurar que la varianza sea positiva (método de truncamiento)
            const sigmaT = Math.sqrt(Math.max(0.01, Vt));
            
            // Si hay distribución empírica, ajustar ligeramente usando la distribución
            if (distribucionEmpirica) {
                // Usar la distribución empírica para ajustar el retorno, pero mantener la estructura de volatilidad estocástica
                const retornoEmpirico = muestrearDistribucionEmpirica(distribucionEmpirica);
                // Ajustar volatilidad basándose en la magnitud del retorno empírico
                const ajuste = Math.min(1.5, Math.max(0.5, 1 + Math.abs(retornoEmpirico) * 10));
                return Math.max(0.01, Math.min(3.0, sigmaT * ajuste));
            }
            
            return Math.max(0.01, Math.min(3.0, sigmaT));
        }

        /**
         * Muestrea un valor de la distribución empírica
         * @param {Object} distribucionEmpirica - Distribución empírica
         * @returns {number} Retorno muestreado
         */
        function muestrearDistribucionEmpirica(distribucionEmpirica) {
            if (!distribucionEmpirica) {
                return generarNormal() * 0.02; // Default
            }
            
            // Muestrear usando CDF inversa
            const u = Math.random();
            const cdf = distribucionEmpirica.cdf;
            
            // Encontrar el bin correspondiente
            for (let i = 0; i < cdf.length; i++) {
                if (u <= cdf[i]) {
                    // Interpolar dentro del bin
                    const binInicio = distribucionEmpirica.bins[i];
                    const binFin = distribucionEmpirica.bins[i + 1] || distribucionEmpirica.bins[i] + distribucionEmpirica.anchoBin;
                    return binInicio + (binFin - binInicio) * Math.random();
                }
            }
            
            // Fallback: último bin
            const ultimoBin = distribucionEmpirica.bins.length - 2;
            return distribucionEmpirica.bins[ultimoBin] + distribucionEmpirica.anchoBin * Math.random();
        }

        function calcularDiasHabiles(fechaInicio, fechaFin) {
            // Aproximación simple: excluir fines de semana
            let dias = 0;
            const inicio = new Date(fechaInicio);
            const fin = new Date(fechaFin);
            
            // Validar fechas
            if (isNaN(inicio.getTime()) || isNaN(fin.getTime())) {
                return 0;
            }
            
            const fechaActual = new Date(inicio);
            while (fechaActual <= fin) {
                const diaSemana = fechaActual.getDay();
                if (diaSemana !== 0 && diaSemana !== 6) {
                    dias++;
                }
                fechaActual.setDate(fechaActual.getDate() + 1);
            }
            
            return dias / 252; // Convertir a años (252 días hábiles por año)
        }

        /**
         * Normaliza una fecha a formato YYYY-MM-DD para almacenamiento consistente
         * @param {string|Date} fecha - Fecha en cualquier formato
         * @returns {string|null} Fecha normalizada en formato YYYY-MM-DD o null si es inválida
         */
        function normalizarFecha(fecha) {
            if (!fecha) return null;
            
            try {
                let fechaObj = null;
                
                // Si ya es un objeto Date válido
                if (fecha instanceof Date && !isNaN(fecha.getTime())) {
                    fechaObj = fecha;
                }
                // Si es un string ISO (YYYY-MM-DD)
                else if (typeof fecha === 'string') {
                    // Intentar parsear formato ISO
                    if (/^\d{4}-\d{2}-\d{2}/.test(fecha)) {
                        fechaObj = new Date(fecha + 'T00:00:00');
                    } else {
                        // Intentar parsear como fecha estándar
                        fechaObj = new Date(fecha);
                    }
                }
                
                if (!fechaObj || isNaN(fechaObj.getTime())) {
                    return null;
                }
                
                // Normalizar a YYYY-MM-DD
                const year = fechaObj.getFullYear();
                const month = String(fechaObj.getMonth() + 1).padStart(2, '0');
                const day = String(fechaObj.getDate()).padStart(2, '0');
                
                return `${year}-${month}-${day}`;
            } catch (error) {
                console.warn('Error normalizando fecha:', fecha, error);
                return null;
            }
        }

        /**
         * Formatea una fecha normalizada (YYYY-MM-DD) a formato legible en español argentino
         * @param {string} fechaNormalizada - Fecha en formato YYYY-MM-DD
         * @returns {string} Fecha formateada (ej: "3 Dic" o "19 Dic")
         */
        function formatearFechaVencimiento(fechaNormalizada) {
            if (!fechaNormalizada) return 'N/A';
            
            try {
                const fechaObj = new Date(fechaNormalizada + 'T00:00:00');
                if (isNaN(fechaObj.getTime())) return fechaNormalizada;
                
                const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                const dia = fechaObj.getDate();
                const mes = meses[fechaObj.getMonth()];
                
                return `${dia} ${mes}`;
            } catch (error) {
                return fechaNormalizada;
            }
        }

        async function procesarDataframe(df, precioSpot, volatilidadHistorica, tasaDividendos, token, distribucionEmpirica = null, retornosHistoricos = []) {
            if (!df || df.length === 0) return [];

            const procesado = [];
            const detallesPromesas = [];
            
            // Primera pasada: calcular monto promedio para el factor de liquidez
            let montoTotal = 0;
            let contadorMontos = 0;

            // Obtener detalles de cotización para todas las opciones en paralelo (con límite de concurrencia)
            const obtenerDetallesConLimite = async (simbolo, index) => {
                // Limitar a 5 requests simultáneos para no sobrecargar la API
                if (index % 5 === 0 && index > 0) {
                    await new Promise(resolve => setTimeout(resolve, 200)); // Pausa cada 5 requests
                }
                return await obtenerCotizacionDetalle(token, simbolo);
            };

            for (const row of df) {
                try {
                    const simbolo = row.simbolo || row.descripcion || '';
                    if (simbolo && simbolo !== 'N/A' && simbolo.trim() !== '' && token) {
                        detallesPromesas.push(obtenerDetallesConLimite(simbolo, detallesPromesas.length).catch(err => {
                            // Si falla la obtención de detalles, devolver valores por defecto
                            return { montoOperado: 0, volumenNominal: 0, cantidadOperaciones: 0 };
                        }));
                    } else {
                        detallesPromesas.push(Promise.resolve({ montoOperado: 0, volumenNominal: 0, cantidadOperaciones: 0 }));
                    }
                } catch (error) {
                    detallesPromesas.push(Promise.resolve({ montoOperado: 0, volumenNominal: 0, cantidadOperaciones: 0 }));
                }
            }

            // Esperar a que se resuelvan todas las promesas (usando allSettled para que no falle si alguna falla)
            const detalles = await Promise.allSettled(detallesPromesas).then(results => 
                results.map(result => 
                    result.status === 'fulfilled' ? result.value : { montoOperado: 0, volumenNominal: 0, cantidadOperaciones: 0 }
                )
            );

            // Calcular montoPromedio para el factor de liquidez
            for (let i = 0; i < df.length; i++) {
                const row = df[i];
                const detalle = detalles[i] || { montoOperado: 0 };
                let volumen = 0;
                let precioOpcion = 0;
                const cot = row.cotizacion || row;
                if (cot) {
                    precioOpcion = procesarMonto(cot.ultimoPrecio ?? cot.precio ?? 0);
                    volumen = procesarVolumen(cot.volumen ?? cot.cantidad ?? cot.volumenOperado ?? 0);
                }
                const montoEst = detalle.montoOperado || (volumen * precioOpcion * TAMAÑO_CONTRATO);
                if (montoEst > 0) {
                    montoTotal += montoEst;
                    contadorMontos++;
                }
            }
            const montoPromedio = contadorMontos > 0 ? montoTotal / contadorMontos : 1;

            let opcionesProcesadas = 0;
            let opcionesFiltradas = {
                sinStrikeOPrecio: 0,
                sinFecha: 0,
                fechaInvalida: 0,
                fechaVencida: 0,
                sinTiempoVencimiento: 0,
                blackScholesFallido: 0
            };
            
            for (let i = 0; i < df.length; i++) {
                const row = df[i];
                const detalle = detalles[i] || { montoOperado: 0, volumenNominal: 0, cantidadOperaciones: 0 };
                
                try {
                    // Extraer datos básicos - soportar estructura anidada (cotizacion) o plana
                    let precioOpcion = 0;
                    let volumen = 0;
                    let bid = 0;
                    let ask = 0;
                    const cot = row.cotizacion || row;
                    if (cot) {
                        precioOpcion = procesarMonto(cot.ultimoPrecio ?? cot.precio ?? 0);
                        volumen = procesarVolumen(cot.volumen ?? cot.cantidad ?? cot.volumenOperado ?? 0);
                        bid = procesarMonto(cot.bid ?? (cot.puntas?.compra?.precio) ?? 0);
                        ask = procesarMonto(cot.ask ?? (cot.puntas?.venta?.precio) ?? 0);
                    }

                    if (!bid) bid = precioOpcion * 0.95;
                    if (!ask) ask = precioOpcion * 1.05;

                    // Extraer strike - LÓGICA MEJORADA CON VALIDACIÓN
                    let strike = 0;
                    const simbolo = row.simbolo || '';
                    const precioSubyacente = row.precioSubyacente || CONFIG.precio_spot || 0;
                    
                    // PRIORIDAD 1: Usar strike de la API si está disponible
                    if (row.strike && row.strike !== 0) {
                        strike = procesarStrike(row.strike);
                    }
                    
                    // PRIORIDAD 2: Si no hay strike en la API o es 0, extraer del ticker
                    if (strike <= 0 && simbolo) {
                        strike = extraerStrikeDesdeTicker(simbolo);
                    }
                    
                    // VALIDACIÓN Y CORRECCIÓN: Usar función dedicada para validar y corregir strikes
                    if (strike > 0 && simbolo && precioSubyacente > 0) {
                        strike = validarYCorregirStrike(strike, simbolo, precioSubyacente);
                    }
                    
                    // PRIORIDAD 3: Si todavía no hay strike, intentar desde descripción
                    if (strike <= 0 && row.descripcion) {
                        const partes = row.descripcion.split(' ');
                        if (partes.length > 2) {
                            const strikeDescripcion = parseFloat(partes[2]);
                            if (strikeDescripcion && strikeDescripcion > 0) {
                                strike = strikeDescripcion;
                                // Validar también este strike
                                if (simbolo && precioSubyacente > 0) {
                                    strike = validarYCorregirStrike(strike, simbolo, precioSubyacente);
                                }
                            }
                        }
                    }
                    
                    if (strike <= 0 || precioOpcion <= 0) {
                        opcionesFiltradas.sinStrikeOPrecio++;
                        continue;
                    }

                    // Fecha de vencimiento - normalizar para consistencia
                    let fechaVencimientoStr = null;
                    let fechaOriginal = row.fechaVencimiento || row.vencimiento || row.expiration || row.maturity;
                    
                    if (fechaOriginal) {
                        // Intentar normalizar primero
                        fechaVencimientoStr = normalizarFecha(fechaOriginal);
                        
                        // Si la normalización falla, intentar parsear directamente
                        if (!fechaVencimientoStr) {
                            let fechaDirecta = new Date(fechaOriginal);
                            if (!isNaN(fechaDirecta.getTime())) {
                                // Si el parseo directo funciona, usar la fecha ISO
                                const year = fechaDirecta.getFullYear();
                                const month = String(fechaDirecta.getMonth() + 1).padStart(2, '0');
                                const day = String(fechaDirecta.getDate()).padStart(2, '0');
                                fechaVencimientoStr = `${year}-${month}-${day}`;
                            }
                        }
                    }
                    
                    if (!fechaVencimientoStr) {
                        opcionesFiltradas.sinFecha++;
                        continue;
                    }
                    
                    // Convertir a Date para validaciones
                    let fechaVencimiento = new Date(fechaVencimientoStr + 'T00:00:00');
                    
                    // Si el parseo falla, intentar sin el T00:00:00
                    if (isNaN(fechaVencimiento.getTime())) {
                        fechaVencimiento = new Date(fechaVencimientoStr);
                    }
                    
                    // Validar fecha
                    if (isNaN(fechaVencimiento.getTime())) {
                        opcionesFiltradas.fechaInvalida++;
                        continue;
                    }
                    
                    const ahora = new Date();
                    ahora.setHours(0, 0, 0, 0);
                    fechaVencimiento.setHours(0, 0, 0, 0);
                    if (fechaVencimiento <= ahora) {
                        opcionesFiltradas.fechaVencida++;
                        continue;
                    }
                    
                    // Tiempo hasta vencimiento
                    const T = calcularDiasHabiles(new Date(), fechaVencimiento);
                    if (T <= 0) {
                        opcionesFiltradas.sinTiempoVencimiento++;
                        continue;
                    }

                    // Tipo de opción
                    const tipoOpcion = row.tipoOpcion || (row.descripcion && row.descripcion.includes('Call') ? 'Call' : 'Put');

                    // Moneyness
                    const moneyness = (tipoOpcion === 'Call' && strike < precioSpot) || 
                                    (tipoOpcion === 'Put' && strike > precioSpot) ? 'ITM' : 'OTM';

                    // Volatilidad implícita — usar r=0 (mercado arg) para que converja en ITM
                    const ivResuelta = calcularVolatilidadImplicita(
                        tipoOpcion, precioSpot, strike, T, CONFIG.tasa_riesgo, precioOpcion, tasaDividendos
                    );
                    const volUsar = ivResuelta != null 
                        ? Math.max(0.01, Math.min(ivResuelta, 2.0)) 
                        : volatilidadHistorica;

                    // VALIDACIÓN PREVIA: Calcular valor intrínseco para verificar coherencia
                    const valorIntrinseco = calcularValorIntrinseco(tipoOpcion, precioSpot, strike);
                    
                    // Black-Scholes con logging
                    const bs = blackScholes(tipoOpcion, precioSpot, strike, T, CONFIG.tasa_riesgo, volUsar, tasaDividendos);
                    
                    // Verificar si retornó null (error)
                    if (bs.precio === null) {
                        opcionesFiltradas.blackScholesFallido++;
                        continue; // Saltar esta opción si BS falló
                    }

                    // VALIDACIÓN CRÍTICA: Detectar incoherencias significativas
                    let advertenciaIncoherencia = null;
                    const deltaAbs = Math.abs(bs.delta);
                    const gammaAbs = Math.abs(bs.gamma);
                    
                    // 1. Precio teórico vs valor intrínseco en opciones ITM profundas
                    if (deltaAbs > 0.95 && bs.precio < valorIntrinseco * 0.5) {
                        advertenciaIncoherencia = `🚨 INCOHERENCIA CRÍTICA: Precio teórico ($${bs.precio.toFixed(2)}) muy inferior al valor intrínseco ($${valorIntrinseco.toFixed(2)}). Verificar precio del subyacente (actual: $${precioSpot.toFixed(2)})`;
                        console.error('🚨 INCOHERENCIA CRÍTICA detectada:', {
                            simbolo: row.simbolo,
                            tipo: tipoOpcion,
                            precioSpot: precioSpot,
                            strike: strike,
                            precioTeorico: bs.precio,
                            valorIntrinseco: valorIntrinseco,
                            delta: bs.delta,
                            gamma: bs.gamma,
                            precioMercado: precioOpcion,
                            volatilidadImplicita: volUsar
                        });
                    }
                    
                    // 2. Delta = 1.0 con Gamma = 0.0 pero precio bajo (imposible matemáticamente)
                    if (deltaAbs > 0.99 && gammaAbs < 0.0001 && bs.precio < valorIntrinseco * 0.8) {
                        advertenciaIncoherencia = `🚨 INCOHERENCIA: Delta=${bs.delta.toFixed(4)} y Gamma=${bs.gamma.toFixed(4)} sugieren ejercicio casi seguro, pero precio teórico ($${bs.precio.toFixed(2)}) no refleja valor intrínseco ($${valorIntrinseco.toFixed(2)})`;
                        console.error('🚨 INCOHERENCIA Delta/Gamma detectada:', {
                            simbolo: row.simbolo,
                            delta: bs.delta,
                            gamma: bs.gamma,
                            precioTeorico: bs.precio,
                            valorIntrinseco: valorIntrinseco,
                            precioSpot: precioSpot,
                            strike: strike
                        });
                    }
                    
                    // 3. Theta negativo inconsistente en opciones con Delta = 1.0
                    if (deltaAbs > 0.99 && bs.theta < -0.05) {
                        advertenciaIncoherencia = `⚠️ Theta negativo (${bs.theta.toFixed(4)}) inconsistente con Delta=${bs.delta.toFixed(4)}. Opciones profundamente ITM deberían tener Theta cercano a 0`;
                        console.warn('⚠️ Theta inconsistente:', {
                            simbolo: row.simbolo,
                            delta: bs.delta,
                            theta: bs.theta,
                            precioTeorico: bs.precio,
                            valorIntrinseco: valorIntrinseco
                        });
                    }
                    
                    // 4. IV no resuelta en ITM/ATM (fallback a histórica)
                    if (ivResuelta == null && Math.abs(bs.delta) > 0.5) {
                        console.warn('⚠️ Volatilidad implícita igual a histórica en opción ITM/ATM:', {
                            simbolo: row.simbolo,
                            volImplicita: volUsar,
                            volHistorica: volatilidadHistorica,
                            delta: bs.delta
                        });
                    }

                    // Binomial
                    const binomial = binomialPricing(
                        tipoOpcion, precioSpot, strike, T, CONFIG.tasa_riesgo, volUsar, 
                        CONFIG.pasos_binomial, tasaDividendos, true
                    );

                    // Monte Carlo simplificado - usar configuración global
                    // CORRECCIÓN: Validar y asegurar que se respete el número de simulaciones del input
                    const nSimGlobalInput = document.getElementById('config-simulaciones-global');
                    let nSimGlobal = parseInt(nSimGlobalInput ? nSimGlobalInput.value : 10000);
                    if (isNaN(nSimGlobal) || nSimGlobal < 1) {
                        nSimGlobal = 10000;
                    }
                    nSimGlobal = Math.max(1, Math.floor(nSimGlobal));
                    const mc = calcularMonteCarloSimple(tipoOpcion, precioSpot, strike, T, volUsar, precioOpcion, nSimGlobal, distribucionEmpirica);

                    // VaR mejorado y CVaR
                    const varValue = calcularVaR(precioSpot, volUsar, bs.delta, bs.gamma);
                    const payoffs = mc.payoffs || [];
                    const varCvar95 = payoffs.length > 0 ? calcularVaRCVaR(payoffs, 0.95) : { var: varValue, cvar: varValue };
                    const varCvar99 = payoffs.length > 0 ? calcularVaRCVaR(payoffs, 0.99) : { var: varValue, cvar: varValue };
                    
                    // Sortino Ratio
                    const sortinoRatio = payoffs.length > 0 ? calcularSortinoRatio(mc.gananciaEsperada, payoffs) : 0;
                    
                    // ROI esperado y anualizado
                    const roi = calcularROI(mc.gananciaEsperada, precioOpcion, T);
                    
                    // Expected Value con comisiones
                    const evConComisiones = calcularExpectedValueConComisiones(mc.gananciaEsperada, precioOpcion, 0.01);
                    
                    // Kelly Criterion
                    const kellyPct = calcularKellyCriterion(mc.probProfit, mc.gananciaEsperada, precioOpcion);

                    // CORRECCIÓN: Calcular monto operado real
                    // Monto = Volumen (contratos) × Precio × Tamaño del contrato (100 acciones)
                    const montoOperadoReal = detalle.montoOperado || (volumen * precioOpcion * TAMAÑO_CONTRATO);

                    // Calcular factor de liquidez y ajustes
                    const factorLiquidez = calcularFactorLiquidez(montoOperadoReal, montoPromedio);
                    const ajusteLiquidez = ajustarSpreadPorLiquidez(bid, ask, factorLiquidez);

                    // Detectar opciones con cálculos poco confiables
                    let advertenciaCalculo = null;
                    
                    if (deltaAbs > 0.95) {
                        advertenciaCalculo = '⚠️ Opción profundamente ITM - Vol implícita poco confiable';
                    } else if (deltaAbs < 0.05) {
                        advertenciaCalculo = '⚠️ Opción profundamente OTM - Alta incertidumbre';
                    } else if (volUsar >= 1.99) {
                        advertenciaCalculo = '⚠️ Volatilidad implícita en límite máximo (200%)';
                    }
                    
                    // Combinar advertencias de incoherencia con advertencias de cálculo
                    if (advertenciaIncoherencia) {
                        advertenciaCalculo = advertenciaIncoherencia + (advertenciaCalculo ? ' | ' + advertenciaCalculo : '');
                    }
                    
                    // Verificar coherencia de probabilidades
                    if (bs.prob > 1 || bs.prob < 0) {
                        console.warn('⚠️ Probabilidad fuera de rango:', { simbolo: row.simbolo, prob: bs.prob });
                    }

                    // Clasificar acción recomendada: COMPRAR o VENDER
                    let accionRecomendada = 'NEUTRAL';
                    let razonAccion = '';
                    
                    // deltaAbs ya está declarado arriba, reutilizamos
                    const thetaAbs = Math.abs(bs.theta);
                    const diasVto = Math.round(T * 365);
                    const spreadPct = precioOpcion > 0 ? ((ask - bid) / precioOpcion * 100) : 100;
                    const precioVsTeorico = bs.precio > 0 ? ((precioOpcion - bs.precio) / bs.precio * 100) : 0;
                    const volumenSuficiente = (detalle.volumenNominal || volumen) > 100;
                    
                    // Criterios para COMPRAR
                    const criteriosComprar = [];
                    if (precioVsTeorico < -5) criteriosComprar.push('Barata vs teórico (' + precioVsTeorico.toFixed(1) + '%)');
                    if (deltaAbs > 0.70 && tipoOpcion === 'Call' && strike < precioSpot) criteriosComprar.push('Delta alto para especulación alcista');
                    if (deltaAbs > 0.70 && tipoOpcion === 'Put' && strike > precioSpot) criteriosComprar.push('Delta alto para especulación bajista');
                    if (thetaAbs < 5) criteriosComprar.push('Theta bajo (menor pérdida diaria)');
                    if (spreadPct < 10) criteriosComprar.push('Spread ajustado');
                    if (volumenSuficiente) criteriosComprar.push('Liquidez suficiente');
                    
                    // Criterios para VENDER
                    const criteriosVender = [];
                    if (precioVsTeorico > 10) criteriosVender.push('Cara vs teórico (' + precioVsTeorico.toFixed(1) + '%)');
                    if (thetaAbs > 10) criteriosVender.push('Theta alto (decay rápido)');
                    if (deltaAbs < 0.30) criteriosVender.push('Delta bajo (baja prob ejercicio)');
                    if (volUsar > 0.50) criteriosVender.push('IV alta (primas infladas)');
                    if (diasVto < 30) criteriosVender.push('Vencimiento cercano');
                    if (spreadPct < 15 && volumenSuficiente) criteriosVender.push('Liquidez para venta');
                    
                    // Decisión basada en criterios
                    if (criteriosComprar.length >= 3 && criteriosComprar.length > criteriosVender.length) {
                        accionRecomendada = 'COMPRAR';
                        razonAccion = criteriosComprar.slice(0, 3).join(', ');
                    } else if (criteriosVender.length >= 3 && criteriosVender.length > criteriosComprar.length) {
                        accionRecomendada = 'VENDER';
                        razonAccion = criteriosVender.slice(0, 3).join(', ');
                    } else if (criteriosComprar.length >= 2) {
                        accionRecomendada = 'COMPRAR';
                        razonAccion = criteriosComprar.slice(0, 2).join(', ');
                    } else if (criteriosVender.length >= 2) {
                        accionRecomendada = 'VENDER';
                        razonAccion = criteriosVender.slice(0, 2).join(', ');
                    } else {
                        accionRecomendada = 'NEUTRAL';
                        razonAccion = 'Criterios insuficientes para recomendar';
                    }

                    // Preparar objeto base para calcular Score de Oportunidad
                    const opcionBase = {
                        MC_GananciaEsperada: mc.gananciaEsperada,
                        MC_ProbProfit: mc.probProfit,
                        precioOpcion: precioOpcion,
                        spreadPct: spreadPct,
                        volumen: detalle.volumenNominal || volumen,
                        precioVsTeorico: precioVsTeorico,
                        sortinoRatio: sortinoRatio
                    };
                    
                    // Score de Oportunidad
                    const oportunidadScore = calcularScoreOportunidad(opcionBase);
                    
                    opcionesProcesadas++;
                    procesado.push({
                        simbolo: row.simbolo || row.descripcion || 'N/A',
                        tipoOpcion,
                        strike,
                        fechaVencimiento: fechaVencimientoStr, // Ya normalizada en formato YYYY-MM-DD
                        T,
                        precioOpcion,
                        bid,
                        ask,
                        volumen: detalle.volumenNominal || volumen,
                        montoOperado: montoOperadoReal,
                        volumenNominal: detalle.volumenNominal || 0,
                        cantidadOperaciones: detalle.cantidadOperaciones || 0,
                        factorLiquidez: factorLiquidez,
                        spreadOriginal: ajusteLiquidez.spreadOriginal,
                        spreadAjustado: ajusteLiquidez.spreadAjustado,
                        advertenciaLiquidez: ajusteLiquidez.advertenciaLiquidez,
                        advertenciaCalculo: advertenciaCalculo,
                        volatilidadImplicita: ivResuelta,
                        BlackScholes: bs.precio,
                        Binomial: binomial,
                        Delta: bs.delta,
                        Gamma: bs.gamma,
                        Vega: bs.vega,
                        Theta: bs.theta,
                        Rho: bs.rho,
                        Prob_ITM: bs.prob || 0,
                        Prob_OTM: Math.max(0, Math.min(1, 1 - (bs.prob || 0))), // Asegurar entre 0 y 1
                        Moneyness: moneyness,
                        VaR: varValue,
                        VaR_95: varCvar95.var,
                        CVaR_95: varCvar95.cvar,
                        VaR_99: varCvar99.var,
                        CVaR_99: varCvar99.cvar,
                        precioSubyacente: precioSpot,
                        valorIntrinseco: valorIntrinseco, // Agregar valor intrínseco para referencia
                        MC_ProbProfit: mc.probProfit,
                        MC_GananciaEsperada: mc.gananciaEsperada,
                        MC_ProbITM: mc.probITM,
                        MC_Payoffs: payoffs, // Guardar payoffs para análisis posterior
                        volatilidadSubyacente: volatilidadHistorica,
                        accionRecomendada: accionRecomendada,
                        razonAccion: razonAccion,
                        // Nuevas métricas avanzadas
                        SortinoRatio: sortinoRatio,
                        ROI_Esperado: roi.roi,
                        ROI_Anualizado: roi.roiAnualizado,
                        TiempoRetorno: roi.tiempoRetorno,
                        GananciaEsperadaNeta: evConComisiones.gananciaEsperadaNeta,
                        CostoTotal: evConComisiones.costoTotal,
                        KellyPct: kellyPct,
                        OportunidadScore: oportunidadScore
                    });
                } catch (error) {
                    console.error('Error procesando fila:', error);
                }
            }
            
            // Log de estadísticas de procesamiento
            console.log('📊 Estadísticas de procesamiento:', {
                totalOpciones: df.length,
                opcionesProcesadas: opcionesProcesadas,
                opcionesFiltradas: opcionesFiltradas,
                tasaExito: df.length > 0 ? ((opcionesProcesadas / df.length) * 100).toFixed(2) + '%' : '0%'
            });
            
            if (opcionesProcesadas === 0 && df.length > 0) {
                console.error('⚠️ NINGUNA opción fue procesada. Motivos de filtrado:', opcionesFiltradas);
            }

            return procesado;
        }

        /**
         * Calcula Monte Carlo adaptado para mercado argentino con:
         * - Distribución t-Student (colas gordas)
         * - Jump Diffusion (saltos discretos)
         * - Volatilidad estocástica
         * @param {string} tipo - 'Call' o 'Put'
         * @param {number} S - Precio spot
         * @param {number} K - Strike
         * @param {number} T - Tiempo hasta vencimiento (en años)
         * @param {number} sigma - Volatilidad inicial
         * @param {number} prima - Prima de la opción
         * @param {number} nSim - Número de simulaciones
         * @param {Object} distribucionEmpirica - Distribución empírica de retornos (opcional)
         * @param {Object} paramsArgentina - Parámetros calibrados para Argentina (opcional)
         * @returns {Object} { probProfit, gananciaEsperada, probITM, probProfitReal }
         */
        function calcularMonteCarloSimple(tipo, S, K, T, sigma, prima, nSim = 10000, distribucionEmpirica = null, simbolo = null) {
            if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
                return { probProfit: 0, gananciaEsperada: 0, probITM: 0, probProfitReal: 0 };
            }

            // CORRECCIÓN: Validar y asegurar que nSim sea un entero válido
            if (isNaN(nSim) || nSim < 1) {
                nSim = 10000;
            }
            nSim = Math.max(1, Math.floor(nSim));

            // Parámetros calibrados para Argentina según el activo
            const paramsArgentina = obtenerParammetrosArgentina(simbolo || 'BASE');

            const r = CONFIG.tasa_riesgo;
            let probProfit = 0;
            let gananciaEsperada = 0;
            let probITM = 0;
            let probProfitReal = 0; // Probabilidad considerando break-even real
            let ganancias = [];

            // Número de pasos para simular trayectoria
            const nPasos = Math.max(10, Math.min(50, Math.ceil(T * 252)));
            const dt = T / nPasos;

            // CORRECCIÓN: Ejecutar exactamente nSim simulaciones con modelo argentino
            for (let i = 0; i < nSim; i++) {
                let St = S;
                let sigmaT = sigma;
                
                // Simular trayectoria con modelo argentino
                for (let paso = 0; paso < nPasos; paso++) {
                    // 1. Simular volatilidad estocástica (Heston)
                    sigmaT = simularVolatilidadEstocasticaArgentina(sigmaT, dt, paramsArgentina, distribucionEmpirica);
                    sigmaT = Math.max(0.01, Math.min(3.0, sigmaT));
                    
                    // 2. Generar retorno con distribución t-Student y saltos
                    let retorno;
                    
                    // Componente de difusión con t-Student
                    const retornoDifusion = generarRetornoTStudent(
                        r, sigmaT, dt, paramsArgentina.gradosLibertad
                    );
                    
                    // Componente de salto (Jump Diffusion)
                    const retornoSalto = generarSaltoMerton(dt, paramsArgentina);
                    
                    // Evento de devaluación (raro pero impactante)
                    const retornoDevaluacion = generarDevaluacion(dt, paramsArgentina);
                    
                    // Retorno total
                    retorno = retornoDifusion + retornoSalto + retornoDevaluacion;
                    
                    // Actualizar precio
                    St = St * Math.exp(retorno);
                }
                
                // Calcular payoff al vencimiento
                let payoff;
                if (tipo === 'Call') {
                    payoff = Math.max(St - K, 0) - prima;
                    if (St > K) probITM++;
                    // Break-even real para call comprada: S > K + prima
                    if (St > K + prima) probProfitReal++;
                } else {
                    payoff = Math.max(K - St, 0) - prima;
                    if (St < K) probITM++;
                    // Break-even real para put comprada: S < K - prima
                    if (St < K - prima) probProfitReal++;
                }

                ganancias.push(payoff);
                if (payoff > 0) probProfit++;
                gananciaEsperada += payoff;
            }

            probProfit /= nSim;
            gananciaEsperada /= nSim;
            probITM /= nSim;
            probProfitReal /= nSim;

            return { 
                probProfit, 
                gananciaEsperada, 
                probITM, 
                probProfitReal,
                payoffs: ganancias,
                parametrosUsados: paramsArgentina
            };
        }

        /**
         * Genera todas las estrategias de Vertical Spreads (Call y Put)
         * @param {Array} datosOpciones - Array de opciones procesadas
         * @returns {Array} Array de estrategias candidatas
         */
        function generarVerticalSpreads(datosOpciones) {
            const estrategias = [];

            // Agrupar opciones por fecha de vencimiento
            const opcionesPorVencimiento = {};
            datosOpciones.forEach(opcion => {
                if (opcion.fechaVencimiento && opcion.strike && opcion.tipoOpcion) {
                    const vencimiento = opcion.fechaVencimiento;
                    if (!opcionesPorVencimiento[vencimiento]) {
                        opcionesPorVencimiento[vencimiento] = { Call: [], Put: [] };
                    }
                    if (opcion.tipoOpcion === 'Call') {
                        opcionesPorVencimiento[vencimiento].Call.push(opcion);
                    } else if (opcion.tipoOpcion === 'Put') {
                        opcionesPorVencimiento[vencimiento].Put.push(opcion);
                    }
                }
            });

            // Iterar sobre cada fecha de vencimiento
            for (const fechaVencimiento of Object.keys(opcionesPorVencimiento)) {
                const calls = opcionesPorVencimiento[fechaVencimiento].Call.sort((a, b) => a.strike - b.strike);
                const puts = opcionesPorVencimiento[fechaVencimiento].Put.sort((a, b) => a.strike - b.strike);

                // Generar Vertical Call Spreads: Comprar Call K1, Vender Call K2 (K1 < K2)
                for (let i = 0; i < calls.length; i++) {
                    for (let j = i + 1; j < calls.length; j++) {
                        const callCompra = calls[i];
                        const callVenta = calls[j];

                        if (callCompra.strike < callVenta.strike) {
                            estrategias.push({
                                tipoEstrategia: 'Vertical Call Spread',
                                patas: [
                                    {
                                        tipo: 'compra',
                                        strike: callCompra.strike,
                                        tipoOpcion: 'Call',
                                        precioOpcion: callCompra.precioOpcion || callCompra.ask || 0,
                                        fechaVencimiento: callCompra.fechaVencimiento,
                                        T: callCompra.T,
                                        precioSubyacente: callCompra.precioSubyacente,
                                        volatilidadSubyacente: callCompra.volatilidadSubyacente || callCompra.volatilidadImplicita || 0.3
                                    },
                                    {
                                        tipo: 'venta',
                                        strike: callVenta.strike,
                                        tipoOpcion: 'Call',
                                        precioOpcion: callVenta.precioOpcion || callVenta.bid || 0,
                                        fechaVencimiento: callVenta.fechaVencimiento,
                                        T: callVenta.T,
                                        precioSubyacente: callVenta.precioSubyacente,
                                        volatilidadSubyacente: callVenta.volatilidadSubyacente || callVenta.volatilidadImplicita || 0.3
                                    }
                                ]
                            });
                        }
                    }
                }

                // Generar Vertical Put Spreads: Comprar Put K1, Vender Put K2 (K1 < K2)
                for (let i = 0; i < puts.length; i++) {
                    for (let j = i + 1; j < puts.length; j++) {
                        const putCompra = puts[i];
                        const putVenta = puts[j];

                        if (putCompra.strike < putVenta.strike) {
                            estrategias.push({
                                tipoEstrategia: 'Vertical Put Spread',
                                patas: [
                                    {
                                        tipo: 'compra',
                                        strike: putCompra.strike,
                                        tipoOpcion: 'Put',
                                        precioOpcion: putCompra.precioOpcion || putCompra.ask || 0,
                                        fechaVencimiento: putCompra.fechaVencimiento,
                                        T: putCompra.T,
                                        precioSubyacente: putCompra.precioSubyacente,
                                        volatilidadSubyacente: putCompra.volatilidadSubyacente || putCompra.volatilidadImplicita || 0.3
                                    },
                                    {
                                        tipo: 'venta',
                                        strike: putVenta.strike,
                                        tipoOpcion: 'Put',
                                        precioOpcion: putVenta.precioOpcion || putVenta.bid || 0,
                                        fechaVencimiento: putVenta.fechaVencimiento,
                                        T: putVenta.T,
                                        precioSubyacente: putVenta.precioSubyacente,
                                        volatilidadSubyacente: putVenta.volatilidadSubyacente || putVenta.volatilidadImplicita || 0.3
                                    }
                                ]
                            });
                        }
                    }
                }
            }

            return estrategias;
        }

        /**
         * Genera todas las estrategias de Straddles y Strangles
         * @param {Array} datosOpciones - Array de opciones procesadas
         * @returns {Array} Array de estrategias candidatas
         */
        function generarStraddlesYStrangles(datosOpciones) {
            const estrategias = [];

            // Agrupar opciones por fecha de vencimiento
            const opcionesPorVencimiento = {};
            datosOpciones.forEach(opcion => {
                if (opcion.fechaVencimiento && opcion.strike && opcion.tipoOpcion) {
                    const vencimiento = opcion.fechaVencimiento;
                    if (!opcionesPorVencimiento[vencimiento]) {
                        opcionesPorVencimiento[vencimiento] = { Call: [], Put: [] };
                    }
                    if (opcion.tipoOpcion === 'Call') {
                        opcionesPorVencimiento[vencimiento].Call.push(opcion);
                    } else if (opcion.tipoOpcion === 'Put') {
                        opcionesPorVencimiento[vencimiento].Put.push(opcion);
                    }
                }
            });

            // Iterar sobre cada fecha de vencimiento
            for (const fechaVencimiento of Object.keys(opcionesPorVencimiento)) {
                const calls = opcionesPorVencimiento[fechaVencimiento].Call.sort((a, b) => a.strike - b.strike);
                const puts = opcionesPorVencimiento[fechaVencimiento].Put.sort((a, b) => a.strike - b.strike);

                // Generar Straddles: Para cada Strike K, comprar Call K y Put K
                const strikesComunes = [];
                calls.forEach(call => {
                    const putMatching = puts.find(p => Math.abs(p.strike - call.strike) < 0.01);
                    if (putMatching) {
                        strikesComunes.push({ strike: call.strike, call: call, put: putMatching });
                    }
                });

                strikesComunes.forEach(({ strike, call, put }) => {
                    estrategias.push({
                        tipoEstrategia: 'Straddle',
                        patas: [
                            {
                                tipo: 'compra',
                                strike: call.strike,
                                tipoOpcion: 'Call',
                                precioOpcion: call.precioOpcion || call.ask || 0,
                                fechaVencimiento: call.fechaVencimiento,
                                T: call.T,
                                precioSubyacente: call.precioSubyacente,
                                volatilidadSubyacente: call.volatilidadSubyacente || call.volatilidadImplicita || 0.3
                            },
                            {
                                tipo: 'compra',
                                strike: put.strike,
                                tipoOpcion: 'Put',
                                precioOpcion: put.precioOpcion || put.ask || 0,
                                fechaVencimiento: put.fechaVencimiento,
                                T: put.T,
                                precioSubyacente: put.precioSubyacente,
                                volatilidadSubyacente: put.volatilidadSubyacente || put.volatilidadImplicita || 0.3
                            }
                        ]
                    });
                });

                // Generar Strangles: Comprar Call Kc y Put Kp donde Kc > Kp
                for (const call of calls) {
                    for (const put of puts) {
                        if (call.strike > put.strike) {
                            estrategias.push({
                                tipoEstrategia: 'Strangle',
                                patas: [
                                    {
                                        tipo: 'compra',
                                        strike: call.strike,
                                        tipoOpcion: 'Call',
                                        precioOpcion: call.precioOpcion || call.ask || 0,
                                        fechaVencimiento: call.fechaVencimiento,
                                        T: call.T,
                                        precioSubyacente: call.precioSubyacente,
                                        volatilidadSubyacente: call.volatilidadSubyacente || call.volatilidadImplicita || 0.3
                                    },
                                    {
                                        tipo: 'compra',
                                        strike: put.strike,
                                        tipoOpcion: 'Put',
                                        precioOpcion: put.precioOpcion || put.ask || 0,
                                        fechaVencimiento: put.fechaVencimiento,
                                        T: put.T,
                                        precioSubyacente: put.precioSubyacente,
                                        volatilidadSubyacente: put.volatilidadSubyacente || put.volatilidadImplicita || 0.3
                                    }
                                ]
                            });
                        }
                    }
                }
            }

            return estrategias;
        }

        /**
         * Genera todas las estrategias de Iron Condors
         * @param {Array} datosOpciones - Array de opciones procesadas
         * @returns {Array} Array de estrategias candidatas
         */
        function generarCondors(datosOpciones) {
            const estrategias = [];

            // Agrupar opciones por fecha de vencimiento
            const opcionesPorVencimiento = {};
            datosOpciones.forEach(opcion => {
                if (opcion.fechaVencimiento && opcion.strike && opcion.tipoOpcion) {
                    const vencimiento = opcion.fechaVencimiento;
                    if (!opcionesPorVencimiento[vencimiento]) {
                        opcionesPorVencimiento[vencimiento] = { Call: [], Put: [] };
                    }
                    if (opcion.tipoOpcion === 'Call') {
                        opcionesPorVencimiento[vencimiento].Call.push(opcion);
                    } else if (opcion.tipoOpcion === 'Put') {
                        opcionesPorVencimiento[vencimiento].Put.push(opcion);
                    }
                }
            });

            // Iterar sobre cada fecha de vencimiento
            for (const fechaVencimiento of Object.keys(opcionesPorVencimiento)) {
                const calls = opcionesPorVencimiento[fechaVencimiento].Call.sort((a, b) => a.strike - b.strike);
                const puts = opcionesPorVencimiento[fechaVencimiento].Put.sort((a, b) => a.strike - b.strike);

                // Iron Condor: K_P1 < K_P2 < K_C1 < K_C2
                // Comprar Put K_P1, Vender Put K_P2, Vender Call K_C1, Comprar Call K_C2
                for (let p1 = 0; p1 < puts.length; p1++) {
                    for (let p2 = p1 + 1; p2 < puts.length; p2++) {
                        for (let c1 = 0; c1 < calls.length; c1++) {
                            for (let c2 = c1 + 1; c2 < calls.length; c2++) {
                                const putCompra = puts[p1];    // K_P1
                                const putVenta = puts[p2];      // K_P2
                                const callVenta = calls[c1];   // K_C1
                                const callCompra = calls[c2];  // K_C2

                                // Validar orden: K_P1 < K_P2 < K_C1 < K_C2
                                if (putCompra.strike < putVenta.strike &&
                                    putVenta.strike < callVenta.strike &&
                                    callVenta.strike < callCompra.strike) {
                                    
                                    estrategias.push({
                                        tipoEstrategia: 'Iron Condor',
                                        patas: [
                                            {
                                                tipo: 'compra',
                                                strike: putCompra.strike,
                                                tipoOpcion: 'Put',
                                                precioOpcion: putCompra.precioOpcion || putCompra.ask || 0,
                                                fechaVencimiento: putCompra.fechaVencimiento,
                                                T: putCompra.T,
                                                precioSubyacente: putCompra.precioSubyacente,
                                                volatilidadSubyacente: putCompra.volatilidadSubyacente || putCompra.volatilidadImplicita || 0.3
                                            },
                                            {
                                                tipo: 'venta',
                                                strike: putVenta.strike,
                                                tipoOpcion: 'Put',
                                                precioOpcion: putVenta.precioOpcion || putVenta.bid || 0,
                                                fechaVencimiento: putVenta.fechaVencimiento,
                                                T: putVenta.T,
                                                precioSubyacente: putVenta.precioSubyacente,
                                                volatilidadSubyacente: putVenta.volatilidadSubyacente || putVenta.volatilidadImplicita || 0.3
                                            },
                                            {
                                                tipo: 'venta',
                                                strike: callVenta.strike,
                                                tipoOpcion: 'Call',
                                                precioOpcion: callVenta.precioOpcion || callVenta.bid || 0,
                                                fechaVencimiento: callVenta.fechaVencimiento,
                                                T: callVenta.T,
                                                precioSubyacente: callVenta.precioSubyacente,
                                                volatilidadSubyacente: callVenta.volatilidadSubyacente || callVenta.volatilidadImplicita || 0.3
                                            },
                                            {
                                                tipo: 'compra',
                                                strike: callCompra.strike,
                                                tipoOpcion: 'Call',
                                                precioOpcion: callCompra.precioOpcion || callCompra.ask || 0,
                                                fechaVencimiento: callCompra.fechaVencimiento,
                                                T: callCompra.T,
                                                precioSubyacente: callCompra.precioSubyacente,
                                                volatilidadSubyacente: callCompra.volatilidadSubyacente || callCompra.volatilidadImplicita || 0.3
                                            }
                                        ]
                                    });
                                }
                            }
                        }
                    }
                }
            }

            return estrategias;
        }

        /**
         * Calcula el margen requerido para una estrategia (función auxiliar para filtros)
         * @param {Object} estrategia - Estrategia con patas
         * @returns {number} Margen requerido estimado
         */
        function calcularMargenRequerido(estrategia) {
            if (!estrategia || !estrategia.patas) return 0;
            
            let margen = 0;
            const patas = estrategia.patas;
            
            // Calcular margen basado en las patas vendidas (short)
            for (const pata of patas) {
                if (pata.tipo === 'venta') {
                    // Margen aproximado: strike * multiplicador (típicamente 1 para opciones)
                    // Para spreads, el margen es la diferencia entre strikes
                    const strike = pata.strike || 0;
                    margen += strike * 0.1; // Estimación conservadora: 10% del strike
                }
            }
            
            return margen;
        }

        /**
         * Optimiza estrategias automáticamente mediante Grid Search
         * Busca la mejor estrategia (de cualquier tipo) que maximice la Ganancia Ponderada por Probabilidad
         * (Valor Esperado de la Ganancia Neta) utilizando simulación Monte Carlo
         * 
         * Proceso:
         * 1. Genera el universo total de estrategias candidatas (Vertical Spreads, Straddles, Strangles, Iron Condors)
         * 2. Evalúa cada estrategia usando simularMonteCarlo() para obtener la ganancia esperada
         * 3. Ordena y retorna las top 10 estrategias con mayor ganancia esperada
         * 
         * @returns {Promise<Array>} Top 10 estrategias ordenadas por ganancia esperada descendente
         *   Cada elemento tiene: { estrategia, ganancia, tipoEstrategia }
         */
        async function optimizarEstrategiasAutomaticamente() {
            // A. Inicialización
            let MAX_GANANCIA_PONDERADA = -Infinity;
            let RESULTADOS_RANKING = [];

            // Obtener datos de opciones procesadas
            // Intentar múltiples fuentes: variable global resultados, window.dfMcData, o window.resultados
            const datosOpciones = (resultados && resultados.dfProcesado) || 
                                 window.dfMcData || 
                                 (window.resultados && window.resultados.dfProcesado) || 
                                 [];
            
            if (!datosOpciones || datosOpciones.length === 0) {
                console.warn('No hay datos de opciones disponibles para optimizar');
                console.warn('Resultados disponibles:', {
                    resultados: resultados ? 'existe' : 'no existe',
                    resultadosDfProcesado: resultados && resultados.dfProcesado ? resultados.dfProcesado.length + ' opciones' : 'no existe',
                    windowDfMcData: window.dfMcData ? window.dfMcData.length + ' opciones' : 'no existe',
                    windowResultados: window.resultados ? 'existe' : 'no existe'
                });
                return [];
            }

            console.log(`Iniciando optimización sobre ${datosOpciones.length} opciones disponibles`);

            // B. Generación del Universo Total
            // Llamar a todas las funciones generadoras de estrategias
            const verticalSpreads = generarVerticalSpreads(datosOpciones);
            const straddlesYStrangles = generarStraddlesYStrangles(datosOpciones);
            const condors = generarCondors(datosOpciones);

            // Combinar todos los resultados en un único array
            const UNIVERSO_TOTAL_CANDIDATAS = [
                ...verticalSpreads,
                ...straddlesYStrangles,
                ...condors
            ];

            console.log(`Universo total generado: ${UNIVERSO_TOTAL_CANDIDATAS.length} estrategias candidatas`);
            console.log(`  - Vertical Spreads: ${verticalSpreads.length}`);
            console.log(`  - Straddles y Strangles: ${straddlesYStrangles.length}`);
            console.log(`  - Iron Condors: ${condors.length}`);

            if (UNIVERSO_TOTAL_CANDIDATAS.length === 0) {
                console.warn('No se generaron estrategias candidatas');
                return [];
            }

            // C. Bucle de Evaluación y Ranking
            let estrategiasEvaluadas = 0;
            const totalEstrategias = UNIVERSO_TOTAL_CANDIDATAS.length;

            for (const ESTRATEGIA_CANDIDATA of UNIVERSO_TOTAL_CANDIDATAS) {
                estrategiasEvaluadas++;

                // Mostrar progreso cada 100 estrategias
                if (estrategiasEvaluadas % 100 === 0 || estrategiasEvaluadas === totalEstrategias) {
                    console.log(`Evaluando estrategia ${estrategiasEvaluadas}/${totalEstrategias} (${((estrategiasEvaluadas/totalEstrategias)*100).toFixed(1)}%)`);
                }

                // 1. FILTRO DE MARGEN/RIESGO (Opcional)
                // Por ahora omitimos este filtro, pero se puede implementar aquí
                // if (calcularMargenRequerido(ESTRATEGIA_CANDIDATA) > limiteDeMargen) {
                //     continue;
                // }

                // 2. CÁLCULO DE LA MÉTRICA (Ganancia Esperada)
                // Usa 'await' porque simularMonteCarlo es intensivo
                try {
                    const gananciaPonderada = await simularMonteCarlo(ESTRATEGIA_CANDIDATA, 10000);

                    // Validar resultado
                    if (isNaN(gananciaPonderada) || gananciaPonderada === -Infinity) {
                        continue;
                    }

                    // 3. REGISTRO Y ACTUALIZACIÓN
                    RESULTADOS_RANKING.push({
                        estrategia: ESTRATEGIA_CANDIDATA,
                        ganancia: gananciaPonderada,
                        tipoEstrategia: ESTRATEGIA_CANDIDATA.tipoEstrategia || 'Desconocida'
                    });

                    // Actualizar máximo
                    if (gananciaPonderada > MAX_GANANCIA_PONDERADA) {
                        MAX_GANANCIA_PONDERADA = gananciaPonderada;
                    }
                } catch (error) {
                    console.warn('Error al simular estrategia:', error);
                    continue;
                }
            }

            // D. Post-Procesamiento y Retorno
            // Ordenar RESULTADOS_RANKING de forma descendente por la clave ganancia
            RESULTADOS_RANKING.sort((a, b) => b.ganancia - a.ganancia);

            // Retornar Top 10
            const top10 = RESULTADOS_RANKING.slice(0, 10);

            console.log(`Optimización completada. Total de estrategias evaluadas: ${RESULTADOS_RANKING.length}`);
            console.log(`Mejor ganancia esperada: ${MAX_GANANCIA_PONDERADA.toFixed(2)}`);
            
            if (top10.length > 0) {
                console.log('Top 10 estrategias:');
                top10.forEach((resultado, index) => {
                    console.log(`  ${index + 1}. ${resultado.tipoEstrategia}: Ganancia esperada = ${resultado.ganancia.toFixed(2)}`);
                });
            }

            return top10;
        }

        function generarNormal() {
            // Box-Muller transform
            const u1 = Math.random();
            const u2 = Math.random();
            return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        }

        /**
         * Genera variable aleatoria con distribución t-Student
         * @param {number} df - Grados de libertad (df=3 para colas muy gordas)
         * @returns {number} Variable aleatoria t-Student
         */
        function generarTStudent(df = 3) {
            // t-Student = Normal / sqrt(Chi2 / df)
            const normal = generarNormal();
            const chi2 = generarChiCuadrado(df);
            return normal / Math.sqrt(chi2 / df);
        }

        /**
         * Genera variable aleatoria Chi-cuadrado
         * @param {number} df - Grados de libertad
         * @returns {number} Variable aleatoria Chi-cuadrado
         */
        function generarChiCuadrado(df) {
            // Método de suma de cuadrados normales
            let suma = 0;
            for (let i = 0; i < df; i++) {
                const normal = generarNormal();
                suma += normal * normal;
            }
            return suma;
        }

        /**
         * Genera retorno con distribución t-Student para mercado argentino
         * @param {number} r - Tasa libre de riesgo
         * @param {number} sigma - Volatilidad
         * @param {number} dt - Paso de tiempo
         * @param {number} df - Grados de libertad para t-Student
         * @returns {number} Retorno con distribución t-Student
         */
        function generarRetornoTStudent(r, sigma, dt, df = 3) {
            const tStudent = generarTStudent(df);
            // Ajustar para que tenga la misma varianza que una normal
            const ajusteVarianza = Math.sqrt((df - 2) / df);
            return (r - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * tStudent * ajusteVarianza;
        }

        /**
         * Genera salto discreto (Jump Diffusion - Merton)
         * @param {number} dt - Paso de tiempo
         * @param {Object} params - Parámetros del salto
         * @returns {number} Retorno del salto
         */
        function generarSaltoMerton(dt, params) {
            const lambda = params.lambdaSaltos || 0.15;
            const muSalto = params.muSalto || -0.06;
            const sigmaSalto = params.sigmaSalto || 0.10;
            
            // Probabilidad de salto en este intervalo
            const probSalto = 1 - Math.exp(-lambda * dt);
            
            if (Math.random() < probSalto) {
                // Ocurre un salto
                const tamañoSalto = muSalto + sigmaSalto * generarNormal();
                return tamañoSalto;
            }
            
            return 0; // No hay salto en este intervalo
        }

        /**
         * Genera evento de devaluación (raro pero impactante)
         * @param {number} dt - Paso de tiempo
         * @param {Object} params - Parámetros de devaluación
         * @returns {number} Retorno por devaluación
         */
        function generarDevaluacion(dt, params) {
            const probDeval = params.probDevaluacion || 0.08;
            const magnitud = params.magnitudDevaluacion || 0.25;
            
            if (Math.random() < probDeval * dt) {
                // Devaluación: retorno negativo grande
                return -magnitud + 0.05 * generarNormal(); // Agregar algo de ruido
            }
            
            return 0;
        }

        /**
         * Simula volatilidad estocástica adaptada para Argentina (Heston)
         * @param {number} sigmaActual - Volatilidad actual
         * @param {number} dt - Paso de tiempo
         * @param {Object} params - Parámetros del modelo
         * @param {Object} distribucionEmpirica - Distribución empírica (opcional)
         * @returns {number} Nueva volatilidad
         */
        function simularVolatilidadEstocasticaArgentina(sigmaActual, dt, params, distribucionEmpirica = null) {
            const kappa = params.meanReversionSpeed || 2.0;
            const theta = params.volLargoPlazo || sigmaActual;
            const xi = params.volOfVol || 0.30;
            
            // Proceso de Ornstein-Uhlenbeck para volatilidad
            const dW = generarNormal() * Math.sqrt(dt);
            const drift = kappa * (theta - sigmaActual) * dt;
            const diffusion = xi * sigmaActual * dW;
            
            let nuevaVol = sigmaActual + drift + diffusion;
            
            // Si hay distribución empírica, ajustar por patrones observados
            if (distribucionEmpirica && distribucionEmpirica.volatilidadClusters) {
                // Aumentar volatilidad en períodos de alta vol histórica
                const factorCluster = distribucionEmpirica.volatilidadClusters > 1 ? 1.2 : 0.9;
                nuevaVol *= factorCluster;
            }
            
            // Asegurar volatilidad positiva y en rangos razonables
            return Math.max(0.01, Math.min(3.0, nuevaVol));
        }

        function calcularVaR(S, sigma, delta, gamma) {
            if (!delta || !gamma) return 0;
            const confianza = 0.95;
            const z = normPpf(confianza);
            const volatilidadDiaria = sigma / Math.sqrt(252);
            const cambioPrecio = S * volatilidadDiaria * z;
            const varDelta = Math.abs(delta * cambioPrecio);
            const varGamma = 0.5 * gamma * cambioPrecio * cambioPrecio;
            const varCalculado = varDelta + varGamma;
            
            // Para opciones largas, la pérdida máxima no puede superar el 100% de la prima
            // Esto es importante porque el VaR Delta-Gamma puede sobreestimar pérdidas
            // Nota: Este ajuste es más relevante para VaR que para CVaR (Monte Carlo)
            const prima = 100; // Valor por defecto, reemplazar con el valor real de la prima
            return Math.min(varCalculado, prima);
        }

        /**
         * Calcula un factor de liquidez basado en el monto operado
         * @param {number} montoOperado - Monto operado de esta opción
         * @param {number} montoPromedio - Monto promedio del mercado
         * @returns {number} Factor entre 0 y 1 (1 = muy líquida, 0 = ilíquida)
         */
        function calcularFactorLiquidez(montoOperado, montoPromedio) {
            if (!montoPromedio || montoPromedio === 0) return 0.5; // Neutral si no hay datos
            // Opciones con monto > 2x el promedio tienen factor 1
            // Opciones con monto < promedio/2 tienen factor bajo
            const ratio = montoOperado / montoPromedio;
            return Math.min(1, Math.max(0.1, ratio / 2));
        }

        /**
         * Ajusta el spread bid-ask según la liquidez
         * @param {number} bid - Precio de compra
         * @param {number} ask - Precio de venta
         * @param {number} factorLiquidez - Factor de liquidez (0-1)
         * @returns {object} {spreadOriginal, spreadAjustado, precioMedio, precioAjustado}
         */
        function ajustarSpreadPorLiquidez(bid, ask, factorLiquidez) {
            const spreadOriginal = ask - bid;
            // Penalizar spreads en opciones ilíquidas (multiplicador de 1.5 a 3x)
            const multiplicadorSpread = 1 + (2 * (1 - factorLiquidez)); // 1x cuando liquidez=1, 3x cuando liquidez=0
            const spreadAjustado = spreadOriginal * multiplicadorSpread;
            const precioMedio = (bid + ask) / 2;
            const precioAjustado = precioMedio; // Por ahora, usar el medio
            
            return {
                spreadOriginal,
                spreadAjustado,
                precioMedio,
                precioAjustado,
                advertenciaLiquidez: factorLiquidez < 0.3 ? 'Baja liquidez - spread ampliado' : null
            };
        }

        // ==================== FUNCIONES DE INTERFAZ ====================

        // Verificar si hay sesión activa al cargar la página
        function verificarSesionActiva() {
            const tokenGuardado = localStorage.getItem('iol_token');
            const usernameGuardado = localStorage.getItem('iol_username');
            
            if (tokenGuardado && usernameGuardado) {
                console.log('🔄 Verificando sesión guardada...');
                console.log('🔑 Token encontrado en localStorage:', tokenGuardado.substring(0, 20) + '...');
                
                // Forzar asignación global de múltiples maneras
                window.tokenPortador = tokenGuardado;
                tokenPortador = tokenGuardado;
                globalThis.tokenPortador = tokenGuardado;
                
                console.log('✅ Token asignado desde localStorage:', tokenGuardado.substring(0, 20) + '...');
                console.log('✅ Verificación - window.tokenPortador:', window.tokenPortador ? window.tokenPortador.substring(0, 20) + '...' : 'null');
                console.log('✅ Verificación - tokenPortador:', tokenPortador ? tokenPortador.substring(0, 20) + '...' : 'null');
                console.log('✅ Verificación - globalThis.tokenPortador:', globalThis.tokenPortador ? globalThis.tokenPortador.substring(0, 20) + '...' : 'null');
                
                // Intentar validar el token obteniendo el perfil
                obtenerPerfilUsuario(tokenGuardado).then(perfil => {
                    if (perfil) {
                        // Token válido, restaurar sesión
                        document.getElementById('usuario').value = usernameGuardado;
                        document.getElementById('auth-section').style.display = 'none';
                        document.getElementById('config-section').style.display = 'block';
                        document.getElementById('btn-analizar').disabled = false;
                        
                        const statusDiv = document.getElementById('auth-status');
                        statusDiv.innerHTML = `<div class="success">✅ Sesión restaurada - Bienvenido ${perfil.nombre || usernameGuardado}</div>`;
                        
                        // Obtener tasas de caución (opcional)
                        obtenerTasasCaucion(tokenGuardado).catch(error => {
                            console.warn('⚠️ Error obteniendo tasas de caución:', error.message);
                        });
                    } else {
                        // Token inválido, limpiar sesión
                        console.warn('⚠️ Token guardado inválido, limpiando sesión');
                        limpiarSesion();
                    }
                }).catch(error => {
                    console.warn('⚠️ Error validando token guardado:', error.message);
                    limpiarSesion();
                });
            } else {
                console.log('🔓 No hay sesión activa');
            }
        }
                

        async function autenticar() {
            const usuario = document.getElementById('usuario').value;
            const contraseña = document.getElementById('contraseña').value;
            const statusDiv = document.getElementById('auth-status');

            // Mostrar qué contraseña se está usando realmente
            console.log('🔍 CREDENCIALES DETECTADAS:');
            console.log('📧 Usuario:', usuario);
            console.log('🔑 Contraseña:', contraseña);
            console.log('🔑 Longitud contraseña:', contraseña.length);
            console.log('🔑 ¿Contiene "Chule48936_"?:', contraseña.includes('Chule48936_'));
            console.log('🔑 ¿Es exactamente "Chule48936_"?:', contraseña === 'Chule48936_');

            // Validar que se ingresen todos los campos
            if (!usuario || !contraseña) {
                statusDiv.innerHTML = '<div class="error">Por favor, ingresá usuario y contraseña de InvertirOnline</div>';
                return;
            }

            // Validar que la contraseña sea la correcta
            if (!contraseña.includes('Chule48936_')) {
                statusDiv.innerHTML = '<div class="error">❌ La contraseña ingresada no parece ser la correcta.<br><small>Por favor, escribí manualmente: Chule48936_</small></div>';
                return;
            }

            statusDiv.innerHTML = '<div class="loading">🔐 Autenticando...</div>';

            try {
                // Intentar autenticar con las credenciales de InvertirOnline
                const tokens = await obtenerTokens(usuario, contraseña);
                
                if (tokens) {
                    tokenPortador = tokens.access_token;
                    
                    // Guardar token en localStorage para persistencia
                    localStorage.setItem('iol_token', tokenPortador);
                    localStorage.setItem('iol_refresh_token', tokens.refresh_token || '');
                    localStorage.setItem('iol_username', usuario);
                    
                    // Obtener perfil del usuario para validar que las credenciales funcionan
                    const perfil = await obtenerPerfilUsuario(tokenPortador);
                    
                    // Si no se puede obtener el perfil pero tenemos tokens, continuar de todas formas
                    if (!perfil) {
                        console.warn('⚠️ No se pudo obtener el perfil del usuario, pero los tokens son válidos. Continuando...');
                        // Usar un perfil básico con el nombre de usuario
                        const perfilBasico = { nombre: usuario.split('@')[0], email: usuario };
                        
                        // Si llegamos aquí, las credenciales son válidas
                        console.log('✅ Usuario autenticado exitosamente:', perfilBasico.nombre);
                        
                        // Permitir acceso a cualquier usuario válido de InvertirOnline
                        resultados = null;
                        // Limpiar campos de contraseña por seguridad
                        document.getElementById('contraseña').value = '';
                        
                        // Ocultar sección de autenticación y mostrar configuración
                        document.getElementById('auth-section').style.display = 'none';
                        document.getElementById('config-section').style.display = 'block';
                        document.getElementById('btn-analizar').disabled = false;
                        
                        // Mostrar mensaje de éxito
                        statusDiv.innerHTML = `<div class="success">✅ ¡Conectado! Bienvenido ${perfilBasico.nombre}</div>`;
                        
                        // Obtener tasas de caución (opcional)
                        try {
                            const tasaCaucion = await obtenerTasasCaucion(tokenPortador);
                            if (tasaCaucion != null) {
                                console.log('📊 Tasa de caución obtenida:', tasaCaucion);
                            }
                        } catch (error) {
                            console.warn('⚠️ Error obteniendo tasas de caución:', error.message);
                        }
                        
                        return;
                    }
                    
                    // Si llegamos aquí, las credenciales son válidas
                    console.log('✅ Usuario autenticado exitosamente:', perfil.nombre || usuario);
                    
                    // Permitir acceso a cualquier usuario válido de InvertirOnline
                    document.getElementById('auth-section').style.display = 'none';
                    document.getElementById('config-section').style.display = 'block';
                    document.getElementById('btn-analizar').disabled = false;
                    
                    // Mostrar mensaje de éxito
                    statusDiv.innerHTML = `<div class="success">✅ ¡Conectado! Bienvenido ${perfil.nombre || usuario}</div>`;
                    
                    // Obtener tasas de caución (opcional)
                    try {
                        const tasaCaucion = await obtenerTasasCaucion(tokenPortador);
                        if (tasaCaucion != null) {
                            console.log('📊 Tasa de caución obtenida:', tasaCaucion);
                        } else {
                            console.warn('⚠️ No se pudieron obtener tasas de caución, usando tasa por defecto');
                        }
                    } catch (error) {
                        console.warn('⚠️ Error obteniendo tasas de caución:', error.message);
                    }
                    
                    // Limpiar campos de contraseña por seguridad
                    document.getElementById('contraseña').value = '';
                    
                } else {
                    statusDiv.innerHTML = '<div class="error">❌ Error de autenticación. Verificá tus credenciales de InvertirOnline.<br><small>Si ves errores de CORS, la API puede estar bloqueando las peticiones desde el navegador.</small></div>';
                }
            } catch (error) {
                console.error('❌ Error en autenticación:', error);
                statusDiv.innerHTML = `<div class="error">❌ Error de conexión: ${error.message}<br><small>Verificá tu conexión a internet y volvé a intentarlo.</small></div>`;
            }
        }

        function desconectar() {
            tokenPortador = null;
            resultados = null;
            
            // Limpiar localStorage
            limpiarSesion();
            
            // Limpiar campos de autenticación para que cualquier usuario pueda ingresar sus credenciales
            document.getElementById('usuario').value = '';
            document.getElementById('contraseña').value = '';
            document.getElementById('auth-section').style.display = 'block';
            document.getElementById('config-section').style.display = 'none';
            document.getElementById('btn-analizar').disabled = true;
            document.getElementById('auth-status').innerHTML = '';
            document.getElementById('content-area').innerHTML = '<div class="info-box"><p style="text-align: center; color: var(--text-secondary);">Ingresá tus credenciales de InvertirOnline para continuar</p></div>';
            
            console.log('👋 Sesión cerrada exitosamente');
        }

        // Llamar a verificar sesión cuando se carga la página
        document.addEventListener('DOMContentLoaded', function() {
            verificarSesionActiva();
        });

        async function ejecutarAnalisis() {
            const simbolo = document.getElementById('subyacente').value;
            CONFIG.simbolo = simbolo;

            const contentArea = document.getElementById('content-area');
            contentArea.innerHTML = '<div class="loading">Analizando opciones...</div>';

            try {
                // Obtener cotización del subyacente
                const cotizacion = await obtenerCotizacionSubyacente(tokenPortador, simbolo);
                let precioSpot = 1000; // Valor por defecto
                
                if (cotizacion) {
                    if (cotizacion.ultimoPrecio) {
                        precioSpot = procesarPrecioSubyacente(cotizacion.ultimoPrecio);
                    } else if (cotizacion.precioApertura) {
                        precioSpot = procesarPrecioSubyacente(cotizacion.precioApertura);
                    } else if (cotizacion.precioCierre) {
                        precioSpot = procesarPrecioSubyacente(cotizacion.precioCierre);
                    }
                    
                    // LOGGING: Registrar precio del subyacente obtenido para debugging
                    console.log('📊 Precio del subyacente obtenido:', {
                        simbolo: simbolo,
                        precioSpot: precioSpot,
                        ultimoPrecio: cotizacion.ultimoPrecio,
                        precioApertura: cotizacion.precioApertura,
                        precioCierre: cotizacion.precioCierre,
                        cotizacionCompleta: cotizacion
                    });
                } else {
                    console.warn('⚠️ No se pudo obtener cotización del subyacente:', simbolo);
                }

                // Obtener serie histórica para calcular volatilidad
                const fechaHasta = new Date().toISOString().split('T')[0];
                const fechaDesde = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                const serieHistorica = await obtenerSerieHistorica(tokenPortador, simbolo, fechaDesde, fechaHasta);
                
                let volatilidadHistorica = 0.3; // Valor por defecto
                let distribucionEmpirica = null;
                let retornosHistoricos = [];
                
                if (serieHistorica && serieHistorica.length > 1) {
                    // Ordenar por fecha primero
                    serieHistorica.sort((a, b) => {
                        const fechaA = new Date(a.fecha || a.fechaHora || a.fechaCotizacion || 0);
                        const fechaB = new Date(b.fecha || b.fechaHora || b.fechaCotizacion || 0);
                        return fechaA - fechaB;
                    });
                    
                    // Extraer precios de cierre ordenados (precios del subyacente vienen en pesos)
                    const precios = serieHistorica
                        .map(item => procesarPrecioSubyacente(item.cierre || item.precioCierre || item.ultimoPrecio || item.close || 0))
                        .filter(p => p > 0);
                    
                    if (precios.length > 1) {
                        const resultadoVol = calcularVolatilidadHistorica(precios);
                        volatilidadHistorica = resultadoVol.volatilidad;
                        distribucionEmpirica = resultadoVol.distribucionEmpirica;
                        retornosHistoricos = resultadoVol.retornos;
                    }
                }

                // Obtener datos de opciones
                const datosOpciones = await obtenerDatosOpciones(tokenPortador, simbolo);
                if (datosOpciones === null) {
                    contentArea.innerHTML = '<div class="error">Error al obtener datos de opciones. Verificá la consola del navegador para más detalles. Posibles causas:<br>' +
                        '• Problema de conexión o CORS<br>' +
                        '• Token de autenticación inválido o expirado<br>' +
                        '• El símbolo "' + simbolo + '" no tiene opciones disponibles<br>' +
                        '• Error en la API de InvertirOnline</div>';
                    return;
                }
                if (!datosOpciones || datosOpciones.length === 0) {
                    contentArea.innerHTML = '<div class="error">No se encontraron opciones para el símbolo "' + simbolo + '".<br>' +
                        'Verificá que el símbolo sea correcto y que tenga opciones disponibles en el mercado.</div>';
                    return;
                }

                const tasaDividendos = 0;

                // Mostrar progreso
                contentArea.innerHTML = '<div class="loading">Obteniendo datos de volumen y monto operado de las opciones...</div>';

                // Procesar datos (ahora es async) - pasar también distribución empírica
                const dfProcesado = await procesarDataframe(datosOpciones, precioSpot, volatilidadHistorica, tasaDividendos, tokenPortador, distribucionEmpirica, retornosHistoricos);

                if (!dfProcesado || !Array.isArray(dfProcesado) || dfProcesado.length === 0) {
                    console.error('No hay opciones válidas después del procesamiento', {
                        datosOpcionesIniciales: datosOpciones ? datosOpciones.length : 0,
                        precioSpot: precioSpot,
                        volatilidadHistorica: volatilidadHistorica
                    });
                    contentArea.innerHTML = '<div class="error">No hay opciones válidas para mostrar<br>' +
                        '<small style="color: var(--text-secondary); margin-top: 0.5rem; display: block;">' +
                        'Opciones iniciales: ' + (datosOpciones ? datosOpciones.length : 0) + '<br>' +
                        'Precio Spot: $' + (precioSpot || 0).toFixed(2) + '<br>' +
                        'Verificá que las opciones tengan precio, strike válido y fecha de vencimiento futura.</small></div>';
                    return;
                }

                // VALIDACIÓN POST-PROCESAMIENTO: Detectar problemas sistemáticos con el precio del subyacente
                const opcionesConIncoherencias = dfProcesado.filter(row => {
                    if (!row.valorIntrinseco || !row.BlackScholes || !row.Delta) return false;
                    const deltaAbs = Math.abs(row.Delta);
                    return deltaAbs > 0.95 && row.BlackScholes < row.valorIntrinseco * 0.5;
                });

                if (opcionesConIncoherencias.length > 0) {
                    console.error('🚨 PROBLEMA SISTEMÁTICO DETECTADO:', {
                        totalOpciones: dfProcesado.length,
                        opcionesConIncoherencias: opcionesConIncoherencias.length,
                        precioSpotUsado: precioSpot,
                        strikes: opcionesConIncoherencias.map(r => r.strike).slice(0, 5),
                        valoresIntrinsecos: opcionesConIncoherencias.map(r => r.valorIntrinseco).slice(0, 5),
                        preciosTeoricos: opcionesConIncoherencias.map(r => r.BlackScholes).slice(0, 5)
                    });
                    
                    // Calcular precio estimado del subyacente basado en opciones ITM
                    const callsITM = opcionesConIncoherencias.filter(r => r.tipoOpcion === 'Call' && r.strike < precioSpot);
                    if (callsITM.length > 0) {
                        // Para calls ITM: S = strike + valor intrínseco estimado
                        const precioEstimado = callsITM.map(r => r.strike + r.valorIntrinseco).reduce((a, b) => a + b, 0) / callsITM.length;
                        console.warn('⚠️ Precio estimado del subyacente basado en calls ITM:', precioEstimado, 'vs precio usado:', precioSpot);
                        
                        if (Math.abs(precioEstimado - precioSpot) > precioSpot * 0.1) {
                            console.error('🚨 DIFERENCIA SIGNIFICATIVA: El precio del subyacente podría estar incorrecto');
                            console.error('   Precio usado:', precioSpot);
                            console.error('   Precio estimado desde calls ITM:', precioEstimado);
                            console.error('   Diferencia:', Math.abs(precioEstimado - precioSpot));
                        }
                    }
                }

                resultados = {
                    dfProcesado,
                    precioSpot,
                    volatilidadHistorica,
                    simbolo,
                    distribucionEmpirica: distribucionEmpirica,
                    retornosHistoricos: retornosHistoricos
                };
                
                // Guardar también en window para compatibilidad con funciones que lo requieren
                window.dfMcData = dfProcesado;
                window.resultados = resultados;

                mostrarResultados();

            } catch (error) {
                console.error('❌ Error en análisis:', error);
                console.error('Stack trace:', error.stack);
                contentArea.innerHTML = '<div class="error">Error durante el análisis: ' + (error.message || 'Error desconocido') + '<br>' +
                    'Verificá la consola del navegador (F12) para más detalles técnicos.</div>';
            }
        }

        function mostrarResultados() {
            const contentArea = document.getElementById('content-area');
            
            // Calcular sesgo del mercado
            const sesgo = calcularSesgo(resultados.dfProcesado, resultados.precioSpot);
            resultados.sesgo_mercado = sesgo;
            
            // Solo generar la tabla inicialmente - los gráficos se generan bajo demanda
            const htmlTabla = mostrarTablaOpciones();
            
            // Construir HTML con 3 tabs: Tabla, Análisis/Simulaciones y Backtesting
            let html = 
                '<div class="tabs">' +
                    '<button class="tab active" onclick="mostrarTab(0)">Tabla de Opciones</button>' +
                    '<button class="tab" onclick="mostrarTab(1)">Análisis y Simulaciones</button>' +
                    '<button class="tab" onclick="mostrarTab(2)">Backtesting</button>' +
                '</div>' +
                '<div id="tab-0" class="tab-content active">' +
                    htmlTabla +
                '</div>' +
                '<div id="tab-1" class="tab-content">' +
                    generarPanelAnalisisSimulaciones() +
                '</div>' +
                '<div id="tab-2" class="tab-content">' +
                    generarPanelBacktesting() +
                '</div>';

            contentArea.innerHTML = html;
        }
        
        function generarPanelBacktesting() {
            return '<div class="backtesting-container">' +
                '<h3>Backtesting de Opciones</h3>' +
                '<p>Simulá ganancias y pérdidas si hubieras comprado o vendido opciones en fechas específicas.</p>' +
                
                '<div class="form-group" style="margin-bottom: 1.5rem;">' +
                    '<label for="bt-opcion">Seleccionar Opción</label>' +
                    '<select id="bt-opcion" onchange="actualizarDatosOpcionBacktesting()">' +
                        '<option value="">Elegí una opción...</option>' +
                    '</select>' +
                '</div>' +
                
                '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">' +
                    '<div class="form-group">' +
                        '<label for="bt-fecha-compra">Fecha de Compra</label>' +
                        '<input type="date" id="bt-fecha-compra" onchange="validarFechasBacktesting()">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label for="bt-fecha-venta">Fecha de Venta</label>' +
                        '<input type="date" id="bt-fecha-venta" onchange="validarFechasBacktesting()">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label for="bt-cantidad">Cantidad de Contratos</label>' +
                        '<input type="number" id="bt-cantidad" value="1" min="1" style="width: 100%; padding: 0.75rem; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; color: var(--text-primary);">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label for="bt-operacion">Tipo de Operación</label>' +
                        '<select id="bt-operacion" style="width: 100%; padding: 0.75rem; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; color: var(--text-primary);">' +
                            '<option value="compra">Compra de Opción</option>' +
                            '<option value="venta">Venta de Opción</option>' +
                        '</select>' +
                    '</div>' +
                '</div>' +
                
                '<div style="margin-bottom: 1.5rem;">' +
                    '<button class="btn btn-primary" onclick="ejecutarBacktesting()">Ejecutar Backtesting</button>' +
                    '<button class="btn btn-secondary" onclick="limpiarBacktesting()">Limpiar</button>' +
                '</div>' +
                
                '<div id="bt-resultados" style="display: none;">' +
                    '<h4>Resultados del Backtesting</h4>' +
                    '<div id="bt-resultado-detalle"></div>' +
                    '<div id="bt-grafico-rendimiento" style="margin-top: 2rem;"></div>' +
                '</div>' +
                
                '<div id="bt-loading" style="display: none; text-align: center; padding: 2rem;">' +
                    '<div style="color: var(--text-secondary);">Ejecutando simulación...</div>' +
                '</div>' +
            '</div>';
        }
        
        function generarPanelAnalisisSimulaciones() {
            // Panel con sub-tabs para diferentes tipos de análisis
            return '<div class="analisis-container">' +
                '<div class="sub-tabs">' +
                    '<button class="sub-tab active" onclick="mostrarSubTab(0)">Métricas Generales</button>' +
                    '<button class="sub-tab" onclick="mostrarSubTab(1)">Simulación Individual</button>' +
                    '<button class="sub-tab" onclick="mostrarSubTab(2)">Análisis del Conjunto</button>' +
                    '<button class="sub-tab" onclick="mostrarSubTab(3)">Análisis Cuantitativo</button>' +
                    '<button class="sub-tab" onclick="mostrarSubTab(4)">Cobertura con Opciones</button>' +
                '</div>' +
                
                '<div id="sub-tab-0" class="sub-tab-content active">' +
                    '<h3>Métricas Principales del Portafolio</h3>' +
                    '<div id="metricas-container">' +
                        '<button class="btn btn-primary" onclick="generarMetricasGenerales()">Generar Métricas</button>' +
                    '</div>' +
                '</div>' +
                
                '<div id="sub-tab-1" class="sub-tab-content">' +
                    '<h3>Simulación Monte Carlo - Opción Individual</h3>' +
                    generarFormularioSimulacionIndividual() +
                '</div>' +
                
                '<div id="sub-tab-2" class="sub-tab-content">' +
                    '<h3>Análisis del Conjunto de Opciones</h3>' +
                    generarPanelAnalisisConjunto() +
                '</div>' +
                
                '<div id="sub-tab-3" class="sub-tab-content">' +
                    '<h3>Análisis Cuantitativo Avanzado</h3>' +
                    '<div class="info-box" style="margin-bottom: 1.5rem;">' +
                        '<p>📊 <strong>Análisis Cuantitativo Profesional</strong></p>' +
                        '<p>Diagnóstico completo de cada opción según parámetros del mercado argentino:</p>' +
                        '<ul style="margin: 1rem 0; padding-left: 1.5rem; color: var(--text-secondary);">' +
                            '<li>Interpretación de Moneyness (ITM/ATM/OTM)</li>' +
                            '<li>Análisis de Griegas (Delta, Gamma, Theta, Vega)</li>' +
                            '<li>Volatilidad Implícita y su contexto</li>' +
                            '<li>Probabilidad de ejercicio y valuación</li>' +
                            '<li>Análisis de liquidez y spreads</li>' +
                            '<li>Diagnóstico operativo y estrategias sugeridas</li>' +
                        '</ul>' +
                        '<p style="color: var(--text-secondary); margin-top: 1rem;">Basado en estándares del mercado BYMA y mejores prácticas de análisis cuantitativo.</p>' +
                    '</div>' +
                    '<div style="margin-bottom: 1.5rem;">' +
                        '<button class="btn btn-primary" onclick="realizarAnalisisCuantitativo()" style="font-size: 1.1rem; padding: 0.75rem 2rem;">' +
                            '🔬 Ejecutar Análisis Cuantitativo Completo' +
                        '</button>' +
                    '</div>' +
                    '<div id="analisis-cuantitativo-resultados"></div>' +
                '</div>' +
                
                '<div id="sub-tab-4" class="sub-tab-content">' +
                    '<div id="cobertura-container"></div>' +
                '</div>' +
            '</div>';
        }
        
        function generarFormularioSimulacionIndividual() {
            return '<div class="simulacion-individual">' +
                '<div class="form-group" style="position: relative; margin-bottom: 1.5rem;">' +
                    '<label for="sim-buscador-opcion">Buscar Opción</label>' +
                    '<input type="text" id="sim-buscador-opcion" placeholder="Escribí para buscar (ticker, strike, vencimiento)..." ' +
                        'oninput="filtrarOpcionesBuscador()" ' +
                        'onfocus="mostrarSugerenciasBuscador()" ' +
                        'onblur="setTimeout(() => ocultarSugerenciasBuscador(), 200)" ' +
                        'autocomplete="off" ' +
                        'style="width: 100%; padding: 0.75rem; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; color: var(--text-primary);">' +
                    '<div id="sim-sugerencias-opciones" style="display: none; position: absolute; top: 100%; left: 0; right: 0; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; max-height: 300px; overflow-y: auto; z-index: 1000; margin-top: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);"></div>' +
                    '<input type="hidden" id="sim-opcion" value="">' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">' +
                    '<div class="form-group">' +
                        '<label for="sim-filtro-tipo">Tipo de Opción</label>' +
                        '<select id="sim-filtro-tipo" onchange="actualizarFiltrosDinamicos()">' +
                            '<option value="">Todos</option>' +
                            '<option value="Call">Call</option>' +
                            '<option value="Put">Put</option>' +
                        '</select>' +
                    '</div>' +
                    '<div class="form-group" style="position: relative;">' +
                        '<label for="sim-filtro-vencimiento">Vencimiento</label>' +
                        '<input type="text" id="sim-buscador-vencimiento" placeholder="Buscar vencimiento..." ' +
                            'oninput="filtrarSelectVencimiento()" ' +
                            'onfocus="mostrarSelectVencimiento()" ' +
                            'style="width: 100%; padding: 0.5rem; margin-bottom: 0.25rem; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 0.875rem;">' +
                        '<select id="sim-filtro-vencimiento" onchange="actualizarFiltrosDinamicos()" ' +
                            'style="width: 100%;">' +
                            '<option value="">Todos</option>' +
                        '</select>' +
                    '</div>' +
                    '<div class="form-group" style="position: relative;">' +
                        '<label for="sim-filtro-strike">Strike</label>' +
                        '<input type="text" id="sim-buscador-strike" placeholder="Buscar strike..." ' +
                            'oninput="filtrarSelectStrike()" ' +
                            'onfocus="mostrarSelectStrike()" ' +
                            'style="width: 100%; padding: 0.5rem; margin-bottom: 0.25rem; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 0.875rem;">' +
                        '<select id="sim-filtro-strike" onchange="filtrarOpcionesSimulacion()" ' +
                            'style="width: 100%;">' +
                            '<option value="">Todos</option>' +
                        '</select>' +
                    '</div>' +
                '</div>' +
                '<div id="info-opcion-seleccionada" style="display:none; margin: 1rem 0; padding: 1rem; background: rgba(255,255,255,0.05); border-radius: 8px;"></div>' +
                '<div class="form-group">' +
                    '<label for="sim-simulaciones">Cantidad de Simulaciones</label>' +
                    '<input type="number" id="sim-simulaciones" value="10000" min="1000" step="1000">' +
                '</div>' +
                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label for="sim-contratos">Cantidad de Contratos</label>' +
                        '<input type="number" id="sim-contratos" value="1" min="1" onchange="calcularComisionTotal()">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label for="sim-comision">Comisión (%)</label>' +
                        '<input type="number" id="sim-comision" value="0.5" min="0" step="0.1" onchange="calcularComisionTotal()">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label>Comisión Total</label>' +
                        '<input type="text" id="sim-comision-total" value="$0.00" readonly>' +
                    '</div>' +
                '</div>' +
                '<button class="btn btn-primary" onclick="ejecutarSimulacionIndividual()" style="width: 100%; margin-top: 1rem;">Ejecutar Simulación Monte Carlo</button>' +
                '<div id="resultado-sim-individual" style="margin-top: 2rem;"></div>' +
            '</div>';
        }
        
        function generarPanelAnalisisConjunto() {
            return '<div class="analisis-conjunto">' +
                '<p style="margin-bottom: 1rem;">Selecciona qué gráficos deseas visualizar:</p>' +
                '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem;">' +
                    '<button class="btn btn-secondary" onclick="generarSonrisaVolatilidad()">Sonrisa de Volatilidad</button>' +
                    '<button class="btn btn-secondary" onclick="generarValueAtRisk()">Value at Risk</button>' +
                    '<button class="btn btn-secondary" onclick="generarProbabilidadProfit()">Probabilidad de Profit</button>' +
                    '<button class="btn btn-secondary" onclick="generarPerfilRiesgo()">Perfil de Riesgo</button>' +
                    '<button class="btn btn-secondary" onclick="generarAnalisisTecnico()">Análisis Técnico</button>' +
                '</div>' +
                '<div id="graficos-conjunto-container"></div>' +
            '</div>';
        }

        function inicializarMonteCarloInteractivo() {
            // Actualizar opciones en selector
            const selectOpcion = document.getElementById('mc-opcion-seleccionar');
            if (selectOpcion && window.dfMcData) {
                selectOpcion.innerHTML = '<option value="">Selecciona una opción...</option>';
                window.dfMcData.forEach((row, idx) => {
                    const option = document.createElement('option');
                    option.value = idx;
                    option.textContent = (row.simbolo || 'N/A') + ' | ' + (row.tipoOpcion || 'N/A') + ' | Strike ' + (row.strike || 0) + ' | Venc ' + formatearFechaVencimiento(row.fechaVencimiento || '');
                    selectOpcion.appendChild(option);
                });
            }

            // Mostrar gráfico pre-calculado
            mostrarGraficoPrecalculadoMC();
            actualizarResumenMonteCarlo();
        }

        function mostrarTab(index) {
            // Ocultar todos los tabs
            document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));

            // Mostrar tab seleccionado
            document.getElementById(`tab-${index}`).classList.add('active');
            document.querySelectorAll('.tab')[index].classList.add('active');
        }
        
        function mostrarSubTab(index) {
            // Ocultar todos los sub-tabs
            // Ocultar todos los sub-tabs
            document.querySelectorAll('.sub-tab-content').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.sub-tab').forEach(tab => tab.classList.remove('active'));

            // Mostrar sub-tab seleccionado
            const subTab = document.getElementById(`sub-tab-${index}`);
            if (subTab) {
                subTab.classList.add('active');
            }
            const subTabs = document.querySelectorAll('.sub-tab');
            if (subTabs[index]) {
                subTabs[index].classList.add('active');
            }
            
            // Si es el tab de simulación individual (index 1), inicializar filtros
            if (index === 1) {
                setTimeout(() => {
                    inicializarFiltrosSimulacion();
                }, 100);
            }
            
            // Si es el tab de cobertura (index 3), cargar la interfaz
            if (index === 3) {
                setTimeout(() => {
                    const coberturaContainer = document.getElementById('cobertura-container');
                    if (coberturaContainer) {
                        const html = '<h3>Cálculo de Cobertura con Opciones</h3>' +
                            '<div class="info-box" style="margin-bottom: 1.5rem;">' +
                                '<p>Esta herramienta calcula una cobertura optimizada usando opciones con mayor monto operado.</p>' +
                                '<p>La cobertura se basa en el delta de las opciones y utiliza regularización para optimizar los pesos.</p>' +
                            '</div>' +
                            '<div class="form-group" style="margin-bottom: 1rem;">' +
                                '<label for="delta-posicion">Delta de Posición (Millones USD)</label>' +
                                '<input type="number" id="delta-posicion" value="10" min="0.1" step="0.1" style="width: 100%; padding: 0.5rem; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary);">' +
                            '</div>' +
                            '<div class="form-group" style="margin-bottom: 1rem;">' +
                                '<label for="regularizacion-cobertura">Regularización (Lambda)</label>' +
                                '<input type="number" id="regularizacion-cobertura" value="0.1" min="0" max="1" step="0.01" style="width: 100%; padding: 0.5rem; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary);">' +
                                '<small style="display: block; margin-top: 0.25rem; color: var(--text-secondary);">Valor más alto = cobertura más conservadora</small>' +
                            '</div>' +
                            '<button class="btn btn-primary" onclick="ejecutarCalculoCobertura()" style="width: 100%; margin-bottom: 1.5rem;">Calcular Cobertura</button>' +
                            '<div id="resultados-cobertura"></div>';
                        coberturaContainer.innerHTML = html;
                    }
                }, 100);
            }
        }

        function inicializarFiltrosSimulacion() {
            if (!resultados || !resultados.dfProcesado) return;
            
            // Inicializar lista de opciones
            actualizarFiltrosDinamicos();
        }

        function actualizarFiltrosDinamicos() {
            if (!resultados || !resultados.dfProcesado) return;
            
            const df = resultados.dfProcesado;
            const tipoFiltro = document.getElementById('sim-filtro-tipo')?.value || '';
            
            // Filtrar por tipo primero
            let dfFiltrado = tipoFiltro ? df.filter(r => r.tipoOpcion === tipoFiltro) : df;
            
            // Actualizar vencimientos según tipo seleccionado
            const vencimientos = [...new Set(dfFiltrado.map(r => r.fechaVencimiento))].filter(v => v).sort();
            const selectVenc = document.getElementById('sim-filtro-vencimiento');
            if (selectVenc) {
                const vencActual = selectVenc.value;
                // Guardar todos los vencimientos en un atributo data para el filtrado
                selectVenc.setAttribute('data-todos-vencimientos', JSON.stringify(vencimientos));
                selectVenc.innerHTML = '<option value="">Todos</option>';
                vencimientos.forEach(v => {
                    const fechaFormateada = formatearFechaVencimiento(v);
                    selectVenc.innerHTML += '<option value="' + v + '" data-texto="' + fechaFormateada.toLowerCase() + '">' + fechaFormateada + '</option>';
                });
                // Restaurar selección si sigue siendo válida
                if (vencActual && vencimientos.includes(vencActual)) {
                    selectVenc.value = vencActual;
                } else {
                    selectVenc.value = '';
                }
                // Aplicar filtro del buscador si existe
                filtrarSelectVencimiento();
            }
            
            // Actualizar strikes según tipo y vencimiento
            const vencFiltro = document.getElementById('sim-filtro-vencimiento')?.value || '';
            if (vencFiltro) {
                dfFiltrado = dfFiltrado.filter(r => r.fechaVencimiento === vencFiltro);
            }
            
            const strikes = [...new Set(dfFiltrado.map(r => r.strike))].filter(s => s !== null && s !== undefined).sort((a, b) => a - b);
            const selectStrike = document.getElementById('sim-filtro-strike');
            if (selectStrike) {
                const strikeActual = selectStrike.value;
                // Guardar todos los strikes en un atributo data para el filtrado
                selectStrike.setAttribute('data-todos-strikes', JSON.stringify(strikes));
                selectStrike.innerHTML = '<option value="">Todos</option>';
                strikes.forEach(s => {
                    const strikeFormateado = formatearStrike(s);
                    selectStrike.innerHTML += '<option value="' + s + '" data-texto="' + s.toString().toLowerCase() + '">$' + strikeFormateado + '</option>';
                });
                // Restaurar selección si sigue siendo válida
                if (strikeActual && strikes.includes(parseFloat(strikeActual))) {
                    selectStrike.value = strikeActual;
                } else {
                    selectStrike.value = '';
                }
                // Aplicar filtro del buscador si existe
                filtrarSelectStrike();
            }
            
            // Filtrar y auto-seleccionar opción
            filtrarOpcionesSimulacion();
        }

        function filtrarOpcionesSimulacion() {
            if (!resultados || !resultados.dfProcesado) return;
            
            const df = resultados.dfProcesado;
            const tipoFiltro = document.getElementById('sim-filtro-tipo')?.value || '';
            const vencFiltro = document.getElementById('sim-filtro-vencimiento')?.value || '';
            const strikeFiltro = document.getElementById('sim-filtro-strike')?.value || '';
            
            // Aplicar filtros
            let opcionesFiltradas = df.filter((row, idx) => {
                if (tipoFiltro && row.tipoOpcion !== tipoFiltro) return false;
                if (vencFiltro && row.fechaVencimiento !== vencFiltro) return false;
                if (strikeFiltro && row.strike !== parseFloat(strikeFiltro)) return false;
                return true;
            });
            
            // Si hay exactamente una opción y los 3 filtros están completos, auto-seleccionar
            if (opcionesFiltradas.length === 1 && tipoFiltro && vencFiltro && strikeFiltro) {
                const idxOriginal = df.indexOf(opcionesFiltradas[0]);
                const inputOculto = document.getElementById('sim-opcion');
                if (inputOculto) {
                    inputOculto.value = idxOriginal;
                }
                const buscador = document.getElementById('sim-buscador-opcion');
                if (buscador) {
                    buscador.value = (opcionesFiltradas[0].simbolo || 'N/A') + ' | ' + 
                        (opcionesFiltradas[0].tipoOpcion || 'N/A') + ' | Strike $' + 
                        formatearStrike(opcionesFiltradas[0].strike || 0) + ' | ' + 
                        formatearFechaVencimiento(opcionesFiltradas[0].fechaVencimiento || '');
                }
                // Auto-actualizar info
                actualizarInfoOpcionSeleccionada();
            }
            
            // Actualizar selector de opciones (mantener compatibilidad)
            const selectOpcion = document.getElementById('sim-opcion');
            if (selectOpcion && selectOpcion.tagName === 'SELECT') {
                if (opcionesFiltradas.length === 0) {
                    selectOpcion.innerHTML = '<option value="">No hay opciones con estos filtros</option>';
                    selectOpcion.disabled = true;
                } else {
                    selectOpcion.innerHTML = '<option value="">Selecciona una opción...</option>';
                    opcionesFiltradas.forEach((row, i) => {
                        const idxOriginal = df.indexOf(row);
                        const montoDesc = (row.montoOperado || 0) > 0 ? 
                            ' | Vol: $' + (row.montoOperado || 0).toLocaleString('es-AR', {maximumFractionDigits: 0}) : 
                            ' | Sin vol.';
                        
                        selectOpcion.innerHTML += '<option value="' + idxOriginal + '">' + 
                            (row.simbolo || 'N/A') + ' | ' + 
                            (row.tipoOpcion || 'N/A') + ' | Strike $' + 
                            formatearStrike(row.strike || 0) + ' | ' + 
                            formatearFechaVencimiento(row.fechaVencimiento || '') + 
                            montoDesc +
                            '</option>';
                    });
                    selectOpcion.disabled = false;
                }
            }
            
            // Resetear información si no hay selección
            if (!selectOpcion || !selectOpcion.value) {
                document.getElementById('info-opcion-seleccionada').style.display = 'none';
            }
        }
        
        function filtrarOpcionesBuscador() {
            if (!resultados || !resultados.dfProcesado) return;
            
            const buscador = document.getElementById('sim-buscador-opcion');
            const sugerenciasDiv = document.getElementById('sim-sugerencias-opciones');
            
            if (!buscador || !sugerenciasDiv) return;
            
            const textoBusqueda = buscador.value.trim().toLowerCase();
            
            if (textoBusqueda.length === 0) {
                sugerenciasDiv.style.display = 'none';
                return;
            }
            
            const df = resultados.dfProcesado;
            const tipoFiltro = document.getElementById('sim-filtro-tipo')?.value || '';
            const vencFiltro = document.getElementById('sim-filtro-vencimiento')?.value || '';
            const strikeFiltro = document.getElementById('sim-filtro-strike')?.value || '';
            
            // Aplicar filtros primero
            let opcionesFiltradas = df.filter((row, idx) => {
                if (tipoFiltro && row.tipoOpcion !== tipoFiltro) return false;
                if (vencFiltro && row.fechaVencimiento !== vencFiltro) return false;
                if (strikeFiltro && row.strike !== parseFloat(strikeFiltro)) return false;
                
                // Buscar en ticker, strike, vencimiento, tipo
                const ticker = (row.simbolo || '').toLowerCase();
                const strike = (row.strike || 0).toString().toLowerCase();
                const vencimiento = (row.fechaVencimiento || '').toLowerCase();
                const tipo = (row.tipoOpcion || '').toLowerCase();
                
                return ticker.includes(textoBusqueda) || 
                       strike.includes(textoBusqueda) || 
                       vencimiento.includes(textoBusqueda) || 
                       tipo.includes(textoBusqueda);
            });
            
            // Limitar a 20 resultados
            opcionesFiltradas = opcionesFiltradas.slice(0, 20);
            
            if (opcionesFiltradas.length === 0) {
                sugerenciasDiv.innerHTML = '<div style="padding: 1rem; color: var(--text-secondary); text-align: center;">No se encontraron opciones</div>';
                sugerenciasDiv.style.display = 'block';
                return;
            }
            
            // Generar lista de sugerencias
            let html = '';
            opcionesFiltradas.forEach((row, i) => {
                const idxOriginal = df.indexOf(row);
                const texto = (row.simbolo || 'N/A') + ' | ' + 
                    (row.tipoOpcion || 'N/A') + ' | Strike $' + 
                    formatearStrike(row.strike || 0) + ' | ' + 
                    formatearFechaVencimiento(row.fechaVencimiento || '') +
                    ((row.montoOperado || 0) > 0 ? 
                        ' | Vol: $' + (row.montoOperado || 0).toLocaleString('es-AR', {maximumFractionDigits: 0}) : 
                        ' | Sin vol.');
                
                const textoEscapado = texto.replace(/'/g, "&#39;").replace(/"/g, "&quot;");
                html += '<div class="sugerencia-opcion" ' +
                    'onclick="seleccionarOpcionBuscador(' + idxOriginal + ', ' + JSON.stringify(texto) + ')" ' +
                    'style="padding: 0.75rem; cursor: pointer; border-bottom: 1px solid var(--border-color); transition: background 0.2s;" ' +
                    'onmouseover="this.style.background=\'var(--bg-tertiary)\'" ' +
                    'onmouseout="this.style.background=\'transparent\'">' +
                    texto +
                    '</div>';
            });
            
            sugerenciasDiv.innerHTML = html;
            sugerenciasDiv.style.display = 'block';
        }
        
        function seleccionarOpcionBuscador(idx, texto) {
            const buscador = document.getElementById('sim-buscador-opcion');
            const inputOculto = document.getElementById('sim-opcion');
            const sugerenciasDiv = document.getElementById('sim-sugerencias-opciones');
            
            if (buscador) buscador.value = texto;
            if (inputOculto) inputOculto.value = idx;
            if (sugerenciasDiv) sugerenciasDiv.style.display = 'none';
            
            // Obtener la opción seleccionada
            if (resultados && resultados.dfProcesado && idx >= 0 && idx < resultados.dfProcesado.length) {
                const opcion = resultados.dfProcesado[idx];
                
                // Actualizar filtros automáticamente
                const tipoSelect = document.getElementById('sim-filtro-tipo');
                if (tipoSelect && opcion.tipoOpcion) {
                    tipoSelect.value = opcion.tipoOpcion;
                }
                
                // Actualizar filtros dinámicos primero para que las listas se actualicen
                actualizarFiltrosDinamicos();
                
                // Después de actualizar, seleccionar los valores específicos
                setTimeout(() => {
                    const vencSelect = document.getElementById('sim-filtro-vencimiento');
                    const vencBuscador = document.getElementById('sim-buscador-vencimiento');
                    if (vencSelect && opcion.fechaVencimiento) {
                        const fechaFormateada = formatearFechaVencimiento(opcion.fechaVencimiento);
                        if (vencBuscador) {
                            vencBuscador.value = fechaFormateada;
                        }
                        // Buscar la opción por valor o crear si no existe
                        const opciones = Array.from(vencSelect.options);
                        const existeOpcion = opciones.find(opt => opt.value === opcion.fechaVencimiento);
                        if (existeOpcion) {
                            vencSelect.value = opcion.fechaVencimiento;
                        } else {
                            // Agregar la opción si no existe
                            const nuevaOpcion = document.createElement('option');
                            nuevaOpcion.value = opcion.fechaVencimiento;
                            nuevaOpcion.setAttribute('data-texto', fechaFormateada.toLowerCase());
                            nuevaOpcion.textContent = fechaFormateada;
                            vencSelect.appendChild(nuevaOpcion);
                            vencSelect.value = opcion.fechaVencimiento;
                        }
                    }
                    
                    const strikeSelect = document.getElementById('sim-filtro-strike');
                    const strikeBuscador = document.getElementById('sim-buscador-strike');
                    if (strikeSelect && opcion.strike) {
                        const strikeFormateado = formatearStrike(opcion.strike);
                        if (strikeBuscador) {
                            strikeBuscador.value = strikeFormateado;
                        }
                        // Buscar la opción por valor o crear si no existe
                        const opciones = Array.from(strikeSelect.options);
                        const existeOpcion = opciones.find(opt => parseFloat(opt.value) === opcion.strike);
                        if (existeOpcion) {
                            strikeSelect.value = opcion.strike.toString();
                        } else {
                            // Agregar la opción si no existe
                            const nuevaOpcion = document.createElement('option');
                            nuevaOpcion.value = opcion.strike.toString();
                            nuevaOpcion.setAttribute('data-texto', opcion.strike.toString().toLowerCase());
                            nuevaOpcion.textContent = '$' + strikeFormateado;
                            strikeSelect.appendChild(nuevaOpcion);
                            strikeSelect.value = opcion.strike.toString();
                        }
                    }
                    
                    // Filtrar opciones después de actualizar
                    filtrarOpcionesSimulacion();
                }, 50);
            }
            
            actualizarInfoOpcionSeleccionada();
        }
        
        function mostrarSugerenciasBuscador() {
            const buscador = document.getElementById('sim-buscador-opcion');
            if (buscador && buscador.value.trim().length > 0) {
                filtrarOpcionesBuscador();
            }
        }
        
        function ocultarSugerenciasBuscador() {
            const sugerenciasDiv = document.getElementById('sim-sugerencias-opciones');
            if (sugerenciasDiv) {
                sugerenciasDiv.style.display = 'none';
            }
        }
        
        function filtrarSelectVencimiento() {
            const buscador = document.getElementById('sim-buscador-vencimiento');
            const select = document.getElementById('sim-filtro-vencimiento');
            
            if (!buscador || !select) return;
            
            const textoBusqueda = buscador.value.trim().toLowerCase();
            const todasOpciones = Array.from(select.options);
            
            todasOpciones.forEach(option => {
                if (option.value === '') {
                    // Siempre mostrar "Todos"
                    option.style.display = '';
                } else {
                    const textoOption = option.getAttribute('data-texto') || option.textContent.toLowerCase();
                    if (textoBusqueda === '' || textoOption.includes(textoBusqueda)) {
                        option.style.display = '';
                    } else {
                        option.style.display = 'none';
                    }
                }
            });
        }
        
        function filtrarSelectStrike() {
            const buscador = document.getElementById('sim-buscador-strike');
            const select = document.getElementById('sim-filtro-strike');
            
            if (!buscador || !select) return;
            
            const textoBusqueda = buscador.value.trim().toLowerCase();
            const todasOpciones = Array.from(select.options);
            
            todasOpciones.forEach(option => {
                if (option.value === '') {
                    // Siempre mostrar "Todos"
                    option.style.display = '';
                } else {
                    const textoOption = option.getAttribute('data-texto') || option.textContent.toLowerCase().replace(/\$/g, '').replace(/\./g, '');
                    if (textoBusqueda === '' || textoOption.includes(textoBusqueda)) {
                        option.style.display = '';
                    } else {
                        option.style.display = 'none';
                    }
                }
            });
        }
        
        function mostrarSelectVencimiento() {
            // Mostrar todas las opciones cuando se enfoca el buscador
            filtrarSelectVencimiento();
        }
        
        function mostrarSelectStrike() {
            // Mostrar todas las opciones cuando se enfoca el buscador
            filtrarSelectStrike();
        }
        
        function actualizarInfoOpcionSeleccionada() {
            const inputOculto = document.getElementById('sim-opcion');
            const idx = inputOculto ? parseInt(inputOculto.value) : NaN;
            const infoDiv = document.getElementById('info-opcion-seleccionada');
            
            if (isNaN(idx) || !resultados || !resultados.dfProcesado[idx]) {
                infoDiv.style.display = 'none';
                return;
            }
            
            const row = resultados.dfProcesado[idx];
            infoDiv.style.display = 'block';
            const precioOpcion = row.precioOpcion || 0;
            infoDiv.innerHTML = 
                '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">' +
                    '<div><strong>Precio:</strong> $' + (precioOpcion < 0.01 ? precioOpcion.toFixed(4) : precioOpcion.toFixed(2)) + '</div>' +
                    '<div><strong>Strike:</strong> $' + formatearStrike(row.strike || 0) + '</div>' +
                    '<div><strong>Vol. Implícita:</strong> ' + (row.volatilidadImplicita != null ? ((row.volatilidadImplicita * 100).toFixed(2) + '%') : 'N/D') + '</div>' +
                    '<div><strong>Delta:</strong> ' + ((row.delta || 0).toFixed(4)) + '</div>' +
                    '<div><strong>Gamma:</strong> ' + ((row.gamma || 0).toFixed(4)) + '</div>' +
                    '<div><strong>Theta:</strong> ' + ((row.theta || 0).toFixed(4)) + '</div>' +
                '</div>';
            
            calcularComisionTotal();
        }
        
        function calcularComisionTotal() {
            const inputOculto = document.getElementById('sim-opcion');
            const idx = inputOculto ? parseInt(inputOculto.value) : NaN;
            const contratos = parseFloat(document.getElementById('sim-contratos').value) || 1;
            const comisionPct = parseFloat(document.getElementById('sim-comision').value) || 0.5;
            const totalField = document.getElementById('sim-comision-total');
            
            if (isNaN(idx) || !resultados || !resultados.dfProcesado[idx]) {
                if (totalField) totalField.value = '$0.00';
                return;
            }
            
            const row = resultados.dfProcesado[idx];
            const precioOpcion = row.precioOpcion || 0;
            // CORRECCIÓN: Multiplicar por TAMAÑO_CONTRATO (100 acciones por contrato)
            const montoTotal = precioOpcion * contratos * TAMAÑO_CONTRATO;
            const comisionTotal = montoTotal * (comisionPct / 100);
            
            if (totalField) {
                totalField.value = '$' + comisionTotal.toFixed(2);
            }
        }
        
        function ejecutarSimulacionIndividual() {
            const inputOculto = document.getElementById('sim-opcion');
            const idx = inputOculto ? parseInt(inputOculto.value) : NaN;
            const resultadoDiv = document.getElementById('resultado-sim-individual');
            
            if (isNaN(idx) || !resultados || !resultados.dfProcesado[idx]) {
                resultadoDiv.innerHTML = '<div class="error">Por favor selecciona una opción válida</div>';
                return;
            }
            
            const row = resultados.dfProcesado[idx];
            
            // CORRECCIÓN: Leer y validar el número de simulaciones del input
            const nSimInput = document.getElementById('sim-simulaciones');
            let nSim = parseInt(nSimInput ? nSimInput.value : 10000);
            
            // Validar que nSim sea un número válido y positivo
            if (isNaN(nSim) || nSim < 1) {
                nSim = 10000; // Valor por defecto
                console.warn('⚠️ Número de simulaciones inválido, usando valor por defecto: 10000');
            }
            
            // Asegurar que nSim sea un entero
            nSim = Math.max(1, Math.floor(nSim));
            
            // CORRECCIÓN: Leer y validar el número de contratos del input
            const contratosInput = document.getElementById('sim-contratos');
            let contratos = parseFloat(contratosInput ? contratosInput.value : 1);
            
            // Validar que contratos sea un número válido y positivo
            if (isNaN(contratos) || contratos < 1) {
                contratos = 1; // Valor por defecto
                console.warn('⚠️ Número de contratos inválido, usando valor por defecto: 1');
            }
            
            // Asegurar que contratos sea un número entero o decimal válido
            contratos = Math.max(1, contratos);
            
            const comisionPct = parseFloat(document.getElementById('sim-comision').value) || 0.5;
            
            // Debug: verificar valores
            console.log('🔍 Simulación Individual - Parámetros:', {
                contratos: contratos,
                contratosInputValue: contratosInput ? contratosInput.value : 'N/A',
                precioOpcion: row.precioOpcion,
                strike: row.strike,
                nSim: nSim,
                nSimInputValue: nSimInput ? nSimInput.value : 'N/A',
                comisionPct: comisionPct,
                TAMAÑO_CONTRATO: TAMAÑO_CONTRATO
            });
            
            resultadoDiv.innerHTML = '<div class="loading">Ejecutando ' + nSim + ' simulaciones...</div>';
            
            // Ejecutar simulación en el siguiente tick para permitir que se muestre el loading
            setTimeout(() => {
                try {
                    const resultado = calcularProbabilidadProfitMontecarlo(row, nSim);
                    
                    if (!resultado || !resultado.payoffs || resultado.payoffs.length === 0) {
                        resultadoDiv.innerHTML = '<div class="error">Error al ejecutar la simulación</div>';
                        return;
                    }
                    
                    const payoffs = resultado.payoffs;
                    const probITM = (resultado.probITM || 0) * 100;
                    // Calcular probabilidad OTM (Out-The-Money): complemento de ITM
                    const probOTM = 100 - probITM;
                    
                    // CORRECCIÓN: Usar los precios subyacentes que ya se calcularon en la simulación
                    // Esto asegura consistencia entre payoffs y gráficos
                    let preciosSubyacentes = resultado.preciosSubyacentes;
                    let precioSpot = resultado.precioSpot || row.precioSubyacente;
                    
                    // Validar que contratos sea un número válido
                    if (isNaN(contratos) || contratos <= 0) {
                        contratos = 1;
                    }
                    
                    // Validar que nSim sea correcto
                    if (!payoffs || payoffs.length !== nSim) {
                        console.warn('⚠️ Advertencia: El número de payoffs (' + (payoffs ? payoffs.length : 0) + ') no coincide con nSim (' + nSim + ')');
                        // Ajustar nSim al número real de payoffs
                        nSim = payoffs ? payoffs.length : nSim;
                    }
                    
                    // Si no se obtuvieron precios subyacentes de la simulación, generarlos (fallback)
                    if (!preciosSubyacentes || preciosSubyacentes.length !== nSim) {
                        console.warn('⚠️ Generando precios subyacentes como fallback');
                        const strike = row.strike || 0;
                        const T = row.T || 0;
                        let sigma = row.volatilidadImplicita ?? row.volatilidadSubyacente ?? 0.3;
                        if (!sigma || sigma <= 0 || !isFinite(sigma)) {
                            sigma = row.volatilidadSubyacente || resultados.volatilidadHistorica || 0.3;
                        }
                        const r = CONFIG.tasa_riesgo;
                        
                        // Validar precio spot
                        if (!precioSpot || precioSpot <= 0 || !isFinite(precioSpot)) {
                            precioSpot = resultados.precioSpot || 0;
                            if (!precioSpot || precioSpot <= 0 || !isFinite(precioSpot)) {
                                if (row.tipoOpcion === 'Put' && strike > 0) {
                                    precioSpot = strike * 1.5;
                                } else if (row.tipoOpcion === 'Call' && strike > 0) {
                                    precioSpot = strike * 0.8;
                                } else {
                                    precioSpot = strike || 50;
                                }
                            }
                        }
                        
                        preciosSubyacentes = [];
                        for (let i = 0; i < nSim; i++) {
                            const Z = generarNormal();
                            const ST = precioSpot * Math.exp((r - 0.5 * sigma * sigma) * T + sigma * Math.sqrt(T) * Z);
                            preciosSubyacentes.push(ST);
                        }
                    }
                    
                    // Calcular comisión (CORRECCIÓN: usar TAMAÑO_CONTRATO)
                    const precioOpcion = row.precioOpcion || 0;
                    
                    // Validar que precioOpcion sea válido
                    if (!precioOpcion || precioOpcion <= 0 || !isFinite(precioOpcion)) {
                        resultadoDiv.innerHTML = '<div class="error">Error: Precio de la opción inválido</div>';
                        return;
                    }
                    
                    // Calcular costos: precio por acción × cantidad de contratos × acciones por contrato
                    const costoTotal = precioOpcion * contratos * TAMAÑO_CONTRATO;
                    const comisionTotal = costoTotal * (comisionPct / 100);
                    const costoConComision = costoTotal + comisionTotal;
                    
                    // Validar cálculos de costo
                    const costoTotalEsperado = precioOpcion * contratos * TAMAÑO_CONTRATO;
                    if (Math.abs(costoTotal - costoTotalEsperado) > 0.01) {
                        console.warn('⚠️ Inconsistencia en cálculo de costo total:', { costoTotal, costoTotalEsperado });
                    }
                    
                    // Ajustar payoffs por cantidad de contratos y comisiones
                    // Los payoffs vienen por acción (sin restar prima), se multiplican por contratos y TAMAÑO_CONTRATO
                    // Luego se resta el costo total (que ya incluye prima y comisiones)
                    const payoffsAjustados = payoffs.map(p => {
                        // p es el payoff por acción (ej: si ST=1100 y K=700, p=400)
                        // Multiplicar por cantidad de acciones totales (contratos × TAMAÑO_CONTRATO acciones por contrato)
                        const payoffTotal = p * contratos * TAMAÑO_CONTRATO;
                        // Restar el costo total de la inversión (incluye prima y comisiones)
                        return payoffTotal - costoConComision;
                    });
                    
                    // Calcular estadísticas de payoffs para verificación
                    const payoffPromedioPorAccion = payoffs.reduce((a, b) => a + b, 0) / payoffs.length;
                    const payoffTotalPromedio = payoffPromedioPorAccion * contratos * TAMAÑO_CONTRATO;
                    const gananciaEsperadaCalculada = payoffTotalPromedio - costoConComision;
                    
                    // Debug: verificar cálculos
                    console.log('🔍 Cálculos de simulación:', {
                        precioOpcion: precioOpcion,
                        contratos: contratos,
                        TAMAÑO_CONTRATO: TAMAÑO_CONTRATO,
                        costoTotal: costoTotal,
                        comisionPct: comisionPct,
                        comisionTotal: comisionTotal,
                        costoConComision: costoConComision,
                        nSim: nSim,
                        payoffsCount: payoffs.length,
                        payoffPromedioPorAccion: payoffPromedioPorAccion,
                        payoffTotalPromedio: payoffTotalPromedio,
                        gananciaEsperadaCalculada: gananciaEsperadaCalculada,
                        payoffsSample: payoffs.slice(0, 5),
                        payoffsAjustadosSample: payoffsAjustados.slice(0, 5)
                    });
                    
                    // Calcular estadísticas
                    const ganancias = payoffsAjustados.filter(p => p > 0).length;
                    const perdidas = payoffsAjustados.filter(p => p <= 0);
                    const probProfit = (ganancias / payoffsAjustados.length) * 100;
                    const gananciaEsperada = payoffsAjustados.reduce((a, b) => a + b, 0) / payoffsAjustados.length;
                    
                    // Verificar coherencia: la ganancia esperada debería ser aproximadamente igual a la calculada
                    if (Math.abs(gananciaEsperada - gananciaEsperadaCalculada) > 0.01) {
                        console.warn('⚠️ Inconsistencia en ganancia esperada:', {
                            gananciaEsperada: gananciaEsperada,
                            gananciaEsperadaCalculada: gananciaEsperadaCalculada,
                            diferencia: Math.abs(gananciaEsperada - gananciaEsperadaCalculada)
                        });
                    }
                    
                    // CORRECCIÓN: Separar ganancias reales de pérdidas
                    const payoffsPositivos = payoffsAjustados.filter(p => p > 0);
                    const payoffsNegativos = payoffsAjustados.filter(p => p <= 0);
                    
                    const maxGanancia = payoffsPositivos.length > 0 ? Math.max(...payoffsPositivos) : 0;
                    const maxPerdida = payoffsNegativos.length > 0 ? Math.min(...payoffsNegativos) : 0;
                    
                    // Calcular VaR (Value at Risk) - percentil 5% de pérdidas
                    // El VaR 95% es el valor en el percentil 5% (el peor 5% de los escenarios)
                    const payoffsOrdenados = [...payoffsAjustados].sort((a, b) => a - b);
                    const indiceVaR95 = Math.floor(payoffsOrdenados.length * 0.05);
                    const var95 = payoffsOrdenados[indiceVaR95] || 0;
                    
                    // También calcular VaR 5% (mismo que VaR 95%, solo diferente nomenclatura)
                    const var5 = var95;
                    const varDeltaGamma = row.VaR || 0;
                    const varDeltaGammaPosicion = varDeltaGamma * contratos;
                    
                    const strike = row.strike || 0;
                    
                    // Calcular punto de equilibrio en precio subyacente
                    // Para Call: ST = K + Prima (por acción) → Payoff = Prima
                    // Para Put: ST = K - Prima (por acción) → Payoff = Prima
                    const primaPorAccion = precioOpcion;
                    let precioEquilibrio = 0;
                    if (row.tipoOpcion === 'Call') {
                        precioEquilibrio = strike + primaPorAccion;
                    } else {
                        precioEquilibrio = Math.max(0, strike - primaPorAccion); // No puede ser negativo
                    }
                    
                    // Función para renderizar gráfico según modo
                    function renderizarGraficoMonteCarlo(modo = 'resultados') {
                        const histDiv = document.getElementById('histograma-sim-individual');
                        if (!histDiv || typeof Plotly === 'undefined') return;
                        
                        // Usar datos guardados globalmente
                        const datos = window.datosGraficoMC;
                        if (!datos) return;
                        
                        const { payoffsAjustados, preciosSubyacentes, nSim, strike, precioSpot, precioEquilibrio, tipoOpcion } = datos;
                        
                        let trace, layout;
                        
                        if (modo === 'precio') {
                            // Modo: Precio Subyacente
                            // Calcular número óptimo de bins (regla de Sturges mejorada)
                            const nBins = Math.min(80, Math.max(30, Math.ceil(Math.log2(nSim) + 1)));
                            
                            trace = {
                                x: preciosSubyacentes,
                                type: 'histogram',
                                nbinsx: nBins,
                                autobinx: false,
                                marker: {
                                    color: 'rgba(66, 165, 245, 0.75)',
                                    line: {
                                        color: 'rgba(66, 165, 245, 1)',
                                        width: 1.5
                                    }
                                },
                                name: 'Distribución Precio Subyacente',
                                hovertemplate: '<b>Precio:</b> $%{x:.2f}<br><b>Frecuencia:</b> %{y}<br><b>% del total:</b> ' + ((100 / nSim).toFixed(4)) + '×%{y}%<extra></extra>'
                            };
                            
                            const minPrecio = Math.min(...preciosSubyacentes);
                            const maxPrecio = Math.max(...preciosSubyacentes);
                            const rangoPrecio = maxPrecio - minPrecio;
                            const padding = Math.max(rangoPrecio * 0.05, (maxPrecio - minPrecio) * 0.02);
                            
                            layout = {
                                title: {
                                    text: 'Distribución de Precios del Subyacente al Vencimiento - ' + nSim.toLocaleString() + ' Simulaciones',
                                    font: { size: 18, color: '#e0e0e0', family: 'Inter' }
                                },
                                xaxis: { 
                                    title: { text: 'Precio del Subyacente ($)', font: { size: 14, color: '#b3b3b3', family: 'Inter' } },
                                    gridcolor: 'rgba(255,255,255,0.1)',
                                    zeroline: false,
                                    showgrid: true,
                                    range: [minPrecio - padding, maxPrecio + padding],
                                    showspikes: true,
                                    spikecolor: '#42a5f5',
                                    spikethickness: 1
                                },
                                yaxis: { 
                                    title: { text: 'Frecuencia', font: { size: 14, color: '#b3b3b3', family: 'Inter' } },
                                    gridcolor: 'rgba(255,255,255,0.1)',
                                    showgrid: true,
                                    rangemode: 'tozero',
                                    showspikes: true,
                                    spikecolor: '#42a5f5',
                                    spikethickness: 1
                                },
                                paper_bgcolor: 'rgba(0,0,0,0)',
                                plot_bgcolor: 'rgba(255,255,255,0.03)',
                                font: { color: '#e0e0e0', size: 12, family: 'Inter' },
                                margin: { t: 80, r: 40, b: 70, l: 70 },
                                height: 500,
                                shapes: [
                                    {
                                        type: 'line',
                                        x0: strike,
                                        x1: strike,
                                        y0: 0,
                                        y1: 1,
                                        yref: 'paper',
                                        line: { 
                                            color: '#ff6b6b', 
                                            width: 3, 
                                            dash: 'dash' 
                                        }
                                    },
                                    {
                                        type: 'line',
                                        x0: precioSpot,
                                        x1: precioSpot,
                                        y0: 0,
                                        y1: 1,
                                        yref: 'paper',
                                        line: { 
                                            color: '#4ecdc4', 
                                            width: 3, 
                                            dash: 'dot' 
                                        }
                                    },
                                    {
                                        type: 'line',
                                        x0: precioEquilibrio,
                                        x1: precioEquilibrio,
                                        y0: 0,
                                        y1: 1,
                                        yref: 'paper',
                                        line: { 
                                            color: '#ffd700', 
                                            width: 2, 
                                            dash: 'dot' 
                                        }
                                    }
                                ],
                                annotations: [
                                    {
                                        x: strike,
                                        y: 1.02,
                                        yref: 'paper',
                                        text: 'Strike: $' + formatearStrike(strike),
                                        showarrow: true,
                                        arrowhead: 2,
                                        arrowcolor: '#ff6b6b',
                                        font: { color: '#ff6b6b', size: 12, family: 'Inter' },
                                        bgcolor: 'rgba(0,0,0,0.7)',
                                        bordercolor: '#ff6b6b',
                                        borderwidth: 1
                                    },
                                    {
                                        x: precioSpot,
                                        y: 1.02,
                                        yref: 'paper',
                                        text: 'Precio Actual: $' + precioSpot.toFixed(2),
                                        showarrow: true,
                                        arrowhead: 2,
                                        arrowcolor: '#4ecdc4',
                                        font: { color: '#4ecdc4', size: 12, family: 'Inter' },
                                        bgcolor: 'rgba(0,0,0,0.7)',
                                        bordercolor: '#4ecdc4',
                                        borderwidth: 1
                                    },
                                    {
                                        x: precioEquilibrio,
                                        y: 1.02,
                                        yref: 'paper',
                                        text: 'Punto Equilibrio: $' + precioEquilibrio.toFixed(2),
                                        showarrow: true,
                                        arrowhead: 2,
                                        arrowcolor: '#ffd700',
                                        font: { color: '#ffd700', size: 12, family: 'Inter' },
                                        bgcolor: 'rgba(0,0,0,0.7)',
                                        bordercolor: '#ffd700',
                                        borderwidth: 1
                                    }
                                ],
                                hovermode: 'closest',
                                showlegend: false
                            };
                        } else {
                            // Modo: Resultados Financieros (predeterminado)
                            // Calcular número óptimo de bins (regla de Sturges mejorada)
                            const nBins = Math.min(80, Math.max(30, Math.ceil(Math.log2(nSim) + 1)));
                            
                            trace = {
                                x: payoffsAjustados,
                                type: 'histogram',
                                nbinsx: nBins,
                                autobinx: false,
                                marker: {
                                    color: payoffsAjustados.map(p => p > 0 ? 'rgba(76, 175, 80, 0.75)' : 'rgba(244, 67, 54, 0.75)'),
                                    line: {
                                        color: payoffsAjustados.map(p => p > 0 ? 'rgba(76, 175, 80, 1)' : 'rgba(244, 67, 54, 1)'),
                                        width: 1.5
                                    }
                                },
                                name: 'Distribución de Resultados',
                                hovertemplate: '<b>Resultado:</b> $%{x:.2f}<br><b>Frecuencia:</b> %{y}<br><b>% del total:</b> ' + ((100 / nSim).toFixed(4)) + '×%{y}%<extra></extra>'
                            };
                            
                            const minResultado = Math.min(...payoffsAjustados);
                            const maxResultado = Math.max(...payoffsAjustados);
                            const rangoResultado = maxResultado - minResultado;
                            const padding = Math.max(Math.abs(rangoResultado) * 0.05, Math.abs(maxResultado - minResultado) * 0.02);
                            
                            layout = {
                                title: {
                                    text: 'Distribución de Resultados Netos - ' + nSim.toLocaleString() + ' Simulaciones',
                                    font: { size: 18, color: '#e0e0e0', family: 'Inter' }
                                },
                                xaxis: { 
                                    title: { text: 'Resultado Neto ($)', font: { size: 14, color: '#b3b3b3', family: 'Inter' } },
                                    gridcolor: 'rgba(255,255,255,0.1)',
                                    zeroline: true,
                                    zerolinecolor: 'rgba(255,255,255,0.4)',
                                    zerolinewidth: 2,
                                    showgrid: true,
                                    range: [minResultado - padding, maxResultado + padding],
                                    showspikes: true,
                                    spikecolor: '#42a5f5',
                                    spikethickness: 1
                                },
                                yaxis: { 
                                    title: { text: 'Frecuencia', font: { size: 14, color: '#b3b3b3', family: 'Inter' } },
                                    gridcolor: 'rgba(255,255,255,0.1)',
                                    showgrid: true,
                                    rangemode: 'tozero',
                                    showspikes: true,
                                    spikecolor: '#42a5f5',
                                    spikethickness: 1
                                },
                                paper_bgcolor: 'rgba(0,0,0,0)',
                                plot_bgcolor: 'rgba(255,255,255,0.03)',
                                font: { color: '#e0e0e0', size: 12, family: 'Inter' },
                                margin: { t: 80, r: 40, b: 70, l: 70 },
                                height: 500,
                                shapes: [
                                    {
                                        type: 'line',
                                        x0: 0,
                                        x1: 0,
                                        y0: 0,
                                        y1: 1,
                                        yref: 'paper',
                                        line: { 
                                            color: '#ffd700', 
                                            width: 3, 
                                            dash: 'dash' 
                                        }
                                    }
                                ],
                                annotations: [
                                    {
                                        x: 0,
                                        y: 1.02,
                                        yref: 'paper',
                                        text: 'Punto de Equilibrio ($0)',
                                        showarrow: true,
                                        arrowhead: 2,
                                        arrowcolor: '#ffd700',
                                        font: { color: '#ffd700', size: 12, family: 'Inter' },
                                        bgcolor: 'rgba(0,0,0,0.7)',
                                        bordercolor: '#ffd700',
                                        borderwidth: 1
                                    }
                                ],
                                hovermode: 'closest',
                                showlegend: false
                            };
                        }
                        
                        Plotly.newPlot('histograma-sim-individual', [trace], layout, {
                            responsive: true,
                            displayModeBar: true,
                            modeBarButtonsToRemove: ['pan2d', 'lasso2d'],
                            displaylogo: false
                        });
                    }
                    
                    // Guardar variables globalmente para cambio de modo
                    window.datosGraficoMC = {
                        payoffsAjustados: payoffsAjustados,
                        preciosSubyacentes: preciosSubyacentes,
                        nSim: nSim,
                        strike: strike,
                        precioSpot: precioSpot,
                        precioEquilibrio: precioEquilibrio,
                        tipoOpcion: row.tipoOpcion
                    };
                    
                    // Guardar función para cambio de modo
                    window.renderizarGraficoMonteCarlo = renderizarGraficoMonteCarlo;
                    
                    // Renderizar gráfico inicial en modo resultados
                    setTimeout(() => {
                        renderizarGraficoMonteCarlo('resultados');
                    }, 100);
                    
                    // Determinar moneyness de la opción (precioSpot y strike ya definidos arriba)
                    let moneyness = 'ATM';
                    let distanciaStrike = 0;
                    let distanciaDesc = 'N/A';
                    
                    if (precioSpot > 0 && strike > 0) {
                        if (row.tipoOpcion === 'Call') {
                            distanciaStrike = ((strike - precioSpot) / precioSpot) * 100;
                            if (strike < precioSpot * 0.98) moneyness = 'ITM';
                            else if (strike > precioSpot * 1.02) moneyness = 'OTM';
                            distanciaDesc = Math.abs(distanciaStrike).toFixed(1) + '% ' + (distanciaStrike > 0 ? 'arriba' : 'abajo') + ' del precio actual ($' + precioSpot.toFixed(2) + ')';
                        } else {
                            distanciaStrike = ((precioSpot - strike) / precioSpot) * 100;
                            if (strike > precioSpot * 1.02) moneyness = 'ITM';
                            else if (strike < precioSpot * 0.98) moneyness = 'OTM';
                            distanciaDesc = Math.abs(distanciaStrike).toFixed(1) + '% ' + (distanciaStrike > 0 ? 'abajo' : 'arriba') + ' del precio actual ($' + precioSpot.toFixed(2) + ')';
                        }
                    }
                    
                    const moneynessDesc = moneyness === 'ITM' ? 'in-the-money' : (moneyness === 'OTM' ? 'out-of-the-money' : 'at-the-money');
                    
                    // Generar interpretación dinámica INTELIGENTE
                    let interpretacion = '';
                    if (probProfit === 0) {
                        const razon = moneyness === 'OTM' ? 
                            'Esta opción está muy fuera del dinero (' + moneynessDesc + ', strike ' + distanciaDesc + '). ' : 
                            'El costo de la opción supera cualquier payoff posible en todas las simulaciones. ';
                        interpretacion = '<strong>Sin posibilidad de ganancia</strong>: En ninguna de las ' + nSim.toLocaleString() + ' simulaciones la opción resultó rentable. ' + razon + 'Inversión no recomendada.';
                    } else if (probProfit > 70) {
                        const contexto = moneyness === 'ITM' ? ' Esta opción ya está en el dinero, lo que favorece la probabilidad de éxito.' : '';
                        interpretacion = '<strong>Alta probabilidad de ganancia</strong>: Este trade tiene ' + probProfit.toFixed(1) + '% de probabilidad de ser rentable (' + moneynessDesc + ', strike ' + distanciaDesc + ').' + contexto;
                    } else if (probProfit > 50) {
                        interpretacion = '<strong>Probabilidad moderada (' + probProfit.toFixed(1) + '%)</strong>: Este trade tiene probabilidades favorables pero no decisivas. Opción ' + moneynessDesc + ' con strike ' + distanciaDesc + '. Considerá el riesgo y la gestión de capital.';
                    } else if (probProfit > 30) {
                        interpretacion = '<strong>Probabilidad baja (' + probProfit.toFixed(1) + '%)</strong>: Este trade tiene menos del 50% de probabilidad de ganancia. Opción ' + moneynessDesc + ' con alto riesgo. Strike ' + distanciaDesc + '.';
                    } else if (probProfit > 0) {
                        interpretacion = '<strong>Muy baja probabilidad (' + probProfit.toFixed(1) + '%)</strong>: Este trade es altamente especulativo. Opción ' + moneynessDesc + ' con strike muy alejado (' + distanciaDesc + ').';
                    }
                    
                    // CORRECCIÓN: Ratio riesgo/retorno coherente
                    let analisisRiesgo = '';
                    if (probProfit === 0) {
                        analisisRiesgo = '<strong>Inversión no recomendada:</strong> No hay escenarios rentables. Pérdida prácticamente segura de $' + Math.abs(gananciaEsperada).toFixed(2) + '.';
                    } else if (maxGanancia > 0 && maxPerdida < 0) {
                        const ratioRiesgoRetorno = Math.abs(maxGanancia / maxPerdida);
                        if (ratioRiesgoRetorno > 2) {
                            analisisRiesgo = 'El ratio riesgo/retorno es excelente (' + ratioRiesgoRetorno.toFixed(2) + ':1). La ganancia máxima potencial supera más del doble la pérdida máxima.';
                        } else if (ratioRiesgoRetorno > 1) {
                            analisisRiesgo = 'El ratio riesgo/retorno es favorable (' + ratioRiesgoRetorno.toFixed(2) + ':1). La ganancia máxima potencial supera la pérdida máxima.';
                        } else if (ratioRiesgoRetorno > 0.5) {
                            analisisRiesgo = 'El ratio riesgo/retorno es aceptable (' + ratioRiesgoRetorno.toFixed(2) + ':1), pero requiere gestión cuidadosa del capital.';
                        } else {
                            analisisRiesgo = 'El ratio riesgo/retorno es desfavorable (' + ratioRiesgoRetorno.toFixed(2) + ':1). La pérdida máxima es significativamente mayor a la ganancia máxima potencial.';
                        }
                    } else if (gananciaEsperada < 0) {
                        analisisRiesgo = 'La ganancia esperada es negativa (-$' + Math.abs(gananciaEsperada).toFixed(2) + '). Estadísticamente, se espera perder dinero en este trade.';
                    }
                    
                    // Mostrar resultados con interpretaciones
                    const tieneGananciaPosible = probProfit > 0;
                    const colorBorde = tieneGananciaPosible ? 'var(--accent-primary)' : 'var(--error)';
                    const colorFondo = tieneGananciaPosible ? 'rgba(74, 158, 255, 0.08)' : 'rgba(231, 76, 60, 0.08)';
                    const iconoResultado = '';
                    
                    // Preparar datos para copiar
                    const datosParaCopiar = {
                        opcion: row.simbolo || 'N/A',
                        tipo: row.tipoOpcion,
                        strike: strike,
                        precioSpot: precioSpot,
                        moneyness: moneynessDesc,
                        distanciaStrike: distanciaDesc,
                        contratos: contratos,
                        precioOpcion: precioOpcion,
                        costoTotal: costoTotal,
                        comisionTotal: comisionTotal,
                        inversionTotal: costoConComision,
                        probGanancia: probProfit,
                        probITM: probITM,
                        probOTM: probOTM,
                        gananciaEsperada: gananciaEsperada,
                        maxGanancia: maxGanancia,
                        maxPerdida: maxPerdida,
                        simulaciones: nSim,
                        var95: var95,
                        varDeltaGamma: varDeltaGammaPosicion
                    };
                    
                    resultadoDiv.innerHTML = 
                        '<div class="info-box" style="background: ' + colorFondo + '; border-left: 4px solid ' + colorBorde + '; margin-bottom: 1.5rem;">' +
                            '<h4 style="margin-top: 0; color: ' + colorBorde + ';">' + iconoResultado + ' Interpretación de Resultados</h4>' +
                            '<p style="margin: 0.5rem 0;">' + interpretacion + '</p>' +
                            '<p style="margin: 0.5rem 0; color: var(--text-secondary);">' + analisisRiesgo + '</p>' +
                        '</div>' +
                        '<div class="metrics-grid" style="margin-bottom: 2rem;">' +
                            '<div class="metric">' +
                                '<div class="metric-label">Prob. de Ganancia <span class="help-icon" onclick="mostrarAyuda(\'probabilidadGanancia\');">?</span></div>' +
                                '<div class="metric-value" style="color: var(--text-primary)">' + probProfit.toFixed(2) + '%</div>' +
                                '<div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">P(Ganancia) = Simulaciones Ganadoras / Total</div>' +
                            '</div>' +
                            '<div class="metric">' +
                                '<div class="metric-label">Prob. ITM <span class="help-icon" onclick="mostrarAyuda(\'probabilidadITM\');">?</span></div>' +
                                '<div class="metric-value" style="color: var(--text-primary)">' + probITM.toFixed(2) + '%</div>' +
                                '<div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">P(ITM) = Simulaciones con payoff &gt; 0 (sin prima)</div>' +
                            '</div>' +
                            '<div class="metric">' +
                                '<div class="metric-label">Prob. OTM <span class="help-icon" onclick="mostrarAyuda(\'probabilidadITM\');">?</span></div>' +
                                '<div class="metric-value" style="color: var(--text-primary)">' + probOTM.toFixed(2) + '%</div>' +
                                '<div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">P(OTM) = Simulaciones con payoff = 0 (sin prima)</div>' +
                            '</div>' +
                            '<div class="metric">' +
                                '<div class="metric-label">Ganancia Esperada <span class="help-icon" onclick="mostrarAyuda(\'montecarloSimulacion\');">?</span></div>' +
                                '<div class="metric-value" style="color: var(--text-primary)">$' + gananciaEsperada.toFixed(2) + '</div>' +
                                '<div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">E[Payoff] = Σ(Payoffs) / N</div>' +
                            '</div>' +
                            '<div class="metric">' +
                                '<div class="metric-label">Máxima Ganancia</div>' +
                                '<div class="metric-value" style="color: var(--text-primary)">' + (maxGanancia > 0 ? '$' + maxGanancia.toFixed(2) : 'Sin ganancias') + '</div>' +
                                '<div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">' + (maxGanancia > 0 ? 'Mejor escenario simulado' : 'Ningún escenario rentable') + '</div>' +
                            '</div>' +
                            '<div class="metric">' +
                                '<div class="metric-label">Máxima Pérdida</div>' +
                                '<div class="metric-value" style="color: var(--text-primary)">$' + maxPerdida.toFixed(2) + '</div>' +
                                '<div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">' + (probProfit === 0 ? 'Pérdida en todas las simulaciones' : 'Peor escenario simulado') + '</div>' +
                            '</div>' +
                            '<div class="metric">' +
                                '<div class="metric-label">VaR 95% (MC) <span class="help-icon" onclick="mostrarAyuda(\'var\');">?</span></div>' +
                                '<div class="metric-value" style="color: var(--text-primary)">$' + var95.toFixed(2) + '</div>' +
                                '<div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">Pérdida máxima en 95% de casos (Monte Carlo)</div>' +
                            '</div>' +
                            '<div class="metric">' +
                                '<div class="metric-label">VaR ΔΓ (Tabla) <span class="help-icon" onclick="mostrarAyuda(\'var\');">?</span></div>' +
                                '<div class="metric-value" style="color: #fdd835">' + (varDeltaGamma ? '$' + varDeltaGammaPosicion.toFixed(2) : 'N/D') + '</div>' +
                                '<div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">Por contrato: $' + (varDeltaGamma ? varDeltaGamma.toFixed(2) : '0.00') + ' · Contratos: ' + contratos + '</div>' +
                            '</div>' +
                        '</div>' +
                        '<div style="margin: 2rem 0; padding: 1rem; background: rgba(255,255,255,0.05); border-radius: 8px; border: 1px solid var(--border-color);">' +
                            '<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; flex-wrap: wrap; gap: 1rem;">' +
                                '<h4 style="margin: 0; color: var(--accent-primary);">📊 Visualización del Gráfico</h4>' +
                                '<div style="display: flex; align-items: center; gap: 1rem;">' +
                                    '<label style="display: flex; align-items: center; cursor: pointer; user-select: none; padding: 0.5rem 1rem; background: rgba(66, 165, 245, 0.1); border-radius: 8px; border: 1px solid rgba(66, 165, 245, 0.3); transition: all 0.2s;" id="modo-resultados-label" onclick="cambiarModoGrafico(\'resultados\')">' +
                                        '<input type="radio" name="modo-grafico" value="resultados" checked onchange="cambiarModoGrafico(\'resultados\')" style="margin-right: 0.5rem; cursor: pointer;">' +
                                        '<span>💰 Resultados Netos</span>' +
                                    '</label>' +
                                    '<label style="display: flex; align-items: center; cursor: pointer; user-select: none; padding: 0.5rem 1rem; background: rgba(255,255,255,0.05); border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); transition: all 0.2s;" id="modo-precio-label" onclick="cambiarModoGrafico(\'precio\')">' +
                                        '<input type="radio" name="modo-grafico" value="precio" onchange="cambiarModoGrafico(\'precio\')" style="margin-right: 0.5rem; cursor: pointer;">' +
                                        '<span>📈 Precio Subyacente</span>' +
                                    '</label>' +
                                '</div>' +
                            '</div>' +
                            '<div id="histograma-sim-individual" style="margin-top: 1rem;"></div>' +
                        '</div>' +
                        '<div style="margin-top: 2rem; padding: 1.5rem; background: rgba(255,255,255,0.05); border-radius: 8px; border: 1px solid var(--border-color);">' +
                            '<h4 style="margin-top: 0; color: var(--accent-primary);">📝 Detalles de la Simulación</h4>' +
                            '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">' +
                                '<div>' +
                                    '<p style="margin: 0.5rem 0;"><strong>Contratos:</strong> ' + contratos + '</p>' +
                                    '<p style="margin: 0.5rem 0; font-size: 0.85rem; color: var(--text-secondary);">Cantidad de contratos de opciones</p>' +
                                '</div>' +
                                '<div>' +
                                    '<p style="margin: 0.5rem 0;"><strong>Precio por contrato:</strong> $' + (precioOpcion < 0.01 ? precioOpcion.toFixed(4) : precioOpcion.toFixed(2)) + '</p>' +
                                    '<p style="margin: 0.5rem 0; font-size: 0.85rem; color: var(--text-secondary);">Prima de la opción (por acción)</p>' +
                                '</div>' +
                                '<div>' +
                                    '<p style="margin: 0.5rem 0;"><strong>Tamaño del contrato:</strong> ' + TAMAÑO_CONTRATO + ' acciones</p>' +
                                    '<p style="margin: 0.5rem 0; font-size: 0.85rem; color: var(--text-secondary);">Cada contrato representa ' + TAMAÑO_CONTRATO + ' acciones</p>' +
                                '</div>' +
                                '<div>' +
                                    '<p style="margin: 0.5rem 0;"><strong>Costo total:</strong> $' + costoTotal.toFixed(2) + '</p>' +
                                    '<p style="margin: 0.5rem 0; font-size: 0.85rem; color: var(--text-secondary);">= $' + (precioOpcion < 0.01 ? precioOpcion.toFixed(4) : precioOpcion.toFixed(2)) + ' × ' + contratos + ' contratos × ' + TAMAÑO_CONTRATO + ' acciones</p>' +
                                '</div>' +
                                '<div>' +
                                    '<p style="margin: 0.5rem 0;"><strong>Comisión (' + comisionPct + '%):</strong> $' + comisionTotal.toFixed(2) + '</p>' +
                                    '<p style="margin: 0.5rem 0; font-size: 0.85rem; color: var(--text-secondary);">= Costo Total × ' + (comisionPct/100).toFixed(3) + '</p>' +
                                '</div>' +
                                '<div>' +
                                    '<p style="margin: 0.5rem 0;"><strong>Inversión total:</strong> $' + costoConComision.toFixed(2) + '</p>' +
                                    '<p style="margin: 0.5rem 0; font-size: 0.85rem; color: var(--text-secondary);">= Costo + Comisión</p>' +
                                '</div>' +
                            '</div>' +
                            '<div style="padding: 1rem; background: rgba(66, 165, 245, 0.1); border-radius: 6px; border-left: 3px solid #42a5f5; margin-top: 1rem;">' +
                                '<h5 style="margin: 0 0 0.5rem 0; color: #42a5f5;">🧮 Cómo se calculan los resultados</h5>' +
                                '<p style="margin: 0.5rem 0; font-size: 0.9rem;"><strong>1. Simulación de precios futuros:</strong></p>' +
                                '<p style="margin: 0.25rem 0 0.75rem 1rem; font-size: 0.85rem; color: var(--text-secondary);">S<sub>T</sub> = S<sub>0</sub> × e<sup>(r - 0.5σ²)T + σ√T×Z</sup></p>' +
                                '<p style="margin: 0.5rem 0; font-size: 0.9rem;"><strong>2. Payoff de la opción:</strong></p>' +
                                '<p style="margin: 0.25rem 0 0.75rem 1rem; font-size: 0.85rem; color: var(--text-secondary);">' + (row.tipoOpcion === 'Call' ? 'max(S<sub>T</sub> - K, 0)' : 'max(K - S<sub>T</sub>, 0)') + ' donde K = Strike</p>' +
                                '<p style="margin: 0.5rem 0; font-size: 0.9rem;"><strong>3. Resultado neto:</strong></p>' +
                                '<p style="margin: 0.25rem 0; font-size: 0.85rem; color: var(--text-secondary);">Payoff × Contratos × ' + TAMAÑO_CONTRATO + ' - Inversión Total</p>' +
                            '</div>' +
                        '</div>';
                    
                    
                } catch (error) {
                    console.error('Error en simulación:', error);
                    resultadoDiv.innerHTML = '<div class="error">Error al ejecutar la simulación: ' + error.message + '</div>';
                }
            }, 100);
        }
        
        function generarMetricasGenerales() {
            const container = document.getElementById('metricas-container');
            container.innerHTML = '<div class="loading">Generando métricas...</div>';
            
            setTimeout(() => {
                const htmlMetricas = mostrarMetricasPrincipales();
                const htmlPerfil = mostrarPerfilRiesgo();
                // Análisis técnico (TradingView) solo en el tab específico
                
                container.innerHTML = htmlMetricas + htmlPerfil;
            }, 100);
        }
        
        function generarSonrisaVolatilidad() {
            const container = document.getElementById('graficos-conjunto-container');
            const existente = document.getElementById('sonrisa-vol-section');
            
            if (existente) {
                existente.remove();
            }
            
            const section = document.createElement('div');
            section.id = 'sonrisa-vol-section';
            section.innerHTML = '<h3>📉 Sonrisa de Volatilidad</h3><div class="loading">Generando gráfico...</div>';
            container.appendChild(section);
            
            setTimeout(() => {
                section.innerHTML = '<h3>📉 Sonrisa de Volatilidad</h3>' + mostrarSonrisaVolatilidad();
            }, 100);
        }
        
        function generarValueAtRisk() {
            const container = document.getElementById('graficos-conjunto-container');
            const existente = document.getElementById('var-section');
            
            if (existente) {
                existente.remove();
            }
            
            const section = document.createElement('div');
            section.id = 'var-section';
            section.innerHTML = '<h3>⚠️ Value at Risk</h3><div class="loading">Generando gráfico...</div>';
            container.appendChild(section);
            
            setTimeout(() => {
                section.innerHTML = '<h3>⚠️ Value at Risk</h3>' + mostrarVar();
            }, 100);
        }
        
        function generarProbabilidadProfit() {
            const container = document.getElementById('graficos-conjunto-container');
            const existente = document.getElementById('prob-profit-section');
            
            if (existente) {
                existente.remove();
            }
            
            const section = document.createElement('div');
            section.id = 'prob-profit-section';
            section.innerHTML = '<h3>🎯 Probabilidad de Profit</h3><div class="loading">Generando gráfico...</div>';
            container.appendChild(section);
            
            setTimeout(() => {
                section.innerHTML = '<h3>🎯 Probabilidad de Profit</h3>' + mostrarProbabilidadProfit();
            }, 100);
        }
        
        function generarPerfilRiesgo() {
            const container = document.getElementById('graficos-conjunto-container');
            const existente = document.getElementById('perfil-riesgo-section');
            
            if (existente) {
                existente.remove();
            }
            
            const section = document.createElement('div');
            section.id = 'perfil-riesgo-section';
            section.innerHTML = '<h3>📊 Perfil de Riesgo</h3><div class="loading">Generando análisis...</div>';
            container.appendChild(section);
            
            setTimeout(() => {
                section.innerHTML = '<h3>📊 Perfil de Riesgo</h3>' + mostrarPerfilRiesgo();
            }, 100);
        }
        
        function generarAnalisisTecnico() {
            const container = document.getElementById('graficos-conjunto-container');
            const existente = document.getElementById('analisis-tecnico-section');
            
            if (existente) {
                existente.remove();
            }
            
            const section = document.createElement('div');
            section.id = 'analisis-tecnico-section';
            section.innerHTML = '<h3>📈 Análisis Técnico</h3><div class="loading">Generando análisis...</div>';
            container.appendChild(section);
            
            setTimeout(() => {
                section.innerHTML = '<h3>📈 Análisis Técnico</h3>' + mostrarAnalisisTecnicoSubyacente();
            }, 100);
        }

        // Función auxiliar para calcular tamaño de marcadores basado en monto operado
        function calcularTamaniosMarcadores(datos, minSize = 8, maxSize = 35) {
            if (!datos || datos.length === 0) {
                return [];
            }

            // Obtener montos operados (filtrar valores 0 y negativos)
            const montos = datos.map(r => Math.max(0, r.montoOperado || 0));
            const montosFiltrados = montos.filter(m => m > 0);

            if (montosFiltrados.length === 0) {
                // Si no hay montos, usar tamaño muy pequeño para todos
                return datos.map(() => 3);
            }

            // Calcular min y max de montos (usar percentiles para evitar outliers)
            montosFiltrados.sort((a, b) => a - b);
            const minMonto = montosFiltrados[0];
            const maxMonto = montosFiltrados[montosFiltrados.length - 1];
            // Usar percentil 95 para el máximo para evitar que un outlier haga todo pequeño
            const percentil95 = montosFiltrados[Math.floor(montosFiltrados.length * 0.95)] || maxMonto;
            const rangoMonto = percentil95 - minMonto;

            // Si todos los montos son iguales, usar tamaño medio
            if (rangoMonto === 0) {
                return datos.map(() => (minSize + maxSize) / 2);
            }

            // Normalizar y calcular tamaños con escala más agresiva para mayor diferencia visual
            return datos.map((r, idx) => {
                const monto = Math.max(0, r.montoOperado || 0);
                if (monto === 0) {
                    // Montos operados 0 deben tener tamaño muy pequeño (2px)
                    return 2;
                }
                
                // Normalizar entre 0 y 1 (cap al percentil 95)
                const montoNormalizado = Math.min(1, (monto - minMonto) / rangoMonto);
                
                // Usar una función más agresiva (cúbica) para hacer más evidente la diferencia
                // Esto hace que los montos pequeños sean mucho más pequeños y los grandes más grandes
                const montoNormalizadoCubico = Math.pow(montoNormalizado, 0.5); // Raíz cuadrada para suavizar
                
                // Calcular tamaño con rango más amplio para mayor contraste
                // Los montos pequeños serán cercanos a minSize, los grandes cercanos a maxSize
                const tamanio = minSize + (maxSize - minSize) * montoNormalizadoCubico;
                
                // Asegurar que el tamaño mínimo sea al menos 4px para montos muy pequeños pero > 0
                return Math.max(4, Math.round(tamanio));
            });
        }

        function calcularSesgo(dfProcesado, precioSpot) {
            if (!dfProcesado || dfProcesado.length === 0) {
                return { valor: 0, tipo: "Neutro" };
            }

            const dfVol = dfProcesado.filter(r => 
                r.volatilidadImplicita && r.strike && r.tipoOpcion
            );

            if (dfVol.length === 0) {
                return { valor: 0, tipo: "Neutro" };
            }

            // Calcular distancia al dinero
            dfVol.forEach(r => {
                r.distancia_atm = Math.abs(r.strike - precioSpot);
            });

            // Obtener el 20% más cercano (ATM)
            const distancias = dfVol.map(r => r.distancia_atm).sort((a, b) => a - b);
            const atmThreshold = distancias[Math.floor(distancias.length * 0.2)] || 0;

            const dfAtm = dfVol.filter(r => r.distancia_atm <= atmThreshold);
            const callsAtm = dfAtm.filter(r => r.tipoOpcion === 'Call');
            const putsAtm = dfAtm.filter(r => r.tipoOpcion === 'Put');

            if (callsAtm.length === 0 || putsAtm.length === 0) {
                return { valor: 0, tipo: "Neutro" };
            }

            // Calcular volatilidad promedio ponderada por monto operado
            const calcularVolatilidadPonderada = (opciones) => {
                const totalMonto = opciones.reduce((sum, r) => sum + (r.montoOperado || 0), 0);
                if (totalMonto === 0) {
                    // Si no hay monto, usar promedio simple
                    return opciones.reduce((sum, r) => sum + (r.volatilidadImplicita ?? r.volatilidadSubyacente ?? 0), 0) / opciones.length;
                }
                // Promedio ponderado por monto operado
                const volPonderada = opciones.reduce((sum, r) => {
                    const peso = (r.montoOperado || 0) / totalMonto;
                    return sum + ((r.volatilidadImplicita ?? r.volatilidadSubyacente ?? 0) * peso);
                }, 0);
                return volPonderada;
            };

            const volCalls = calcularVolatilidadPonderada(callsAtm);
            const volPuts = calcularVolatilidadPonderada(putsAtm);

            const sesgo = volPuts - volCalls;

            let tipoSesgo = "Neutro";
            if (Math.abs(sesgo) >= 0.05) {
                tipoSesgo = sesgo > 0 ? "Alcista" : "Bajista";
            }

            return { valor: sesgo, tipo: tipoSesgo };
        }

        function mostrarMetricasPrincipales() {
            const df = resultados.dfProcesado;
            const calls = df.filter(r => r.tipoOpcion === 'Call').length;
            const puts = df.filter(r => r.tipoOpcion === 'Put').length;
            // Calcular volatilidad promedio ponderada por monto operado
            const totalMonto = df.reduce((sum, r) => sum + (r.montoOperado || 0), 0);
            let volPromedio;
            if (totalMonto > 0) {
                // Promedio ponderado por monto operado
                volPromedio = df.reduce((sum, r) => {
                    const peso = (r.montoOperado || 0) / totalMonto;
                    return sum + ((r.volatilidadImplicita ?? r.volatilidadSubyacente ?? 0) * peso);
                }, 0);
            } else {
                // Si no hay monto, usar promedio simple
                volPromedio = df.reduce((sum, r) => sum + (r.volatilidadImplicita ?? r.volatilidadSubyacente ?? 0), 0) / df.length;
            }
            const sesgo = resultados.sesgo_mercado || calcularSesgo(df, resultados.precioSpot);

            return '<h2>Métricas Principales</h2>' +
                '<div class="metrics-grid">' +
                    '<div class="metric">' +
                        '<div class="metric-label">Precio Spot</div>' +
                        '<div class="metric-value">$' + resultados.precioSpot.toFixed(2) + '</div>' +
                    '</div>' +
                    '<div class="metric">' +
                        '<div class="metric-label">Vol. Histórica</div>' +
                        '<div class="metric-value">' + (resultados.volatilidadHistorica * 100).toFixed(2) + '%</div>' +
                    '</div>' +
                    '<div class="metric">' +
                        '<div class="metric-label">Total Opciones</div>' +
                        '<div class="metric-value">' + df.length + '</div>' +
                    '</div>' +
                    '<div class="metric">' +
                        '<div class="metric-label">Calls</div>' +
                        '<div class="metric-value">' + calls + '</div>' +
                    '</div>' +
                    '<div class="metric">' +
                        '<div class="metric-label">Puts</div>' +
                        '<div class="metric-value">' + puts + '</div>' +
                    '</div>' +
                    '<div class="metric">' +
                        '<div class="metric-label">Vol. Impl. Promedio</div>' +
                        '<div class="metric-value">' + (volPromedio * 100).toFixed(2) + '%</div>' +
                    '</div>' +
                    '<div class="metric">' +
                        '<div class="metric-label">Sesgo Mercado</div>' +
                        '<div class="metric-value">' + (sesgo.valor * 100).toFixed(2) + '%<br><small>(' + sesgo.tipo + ')</small></div>' +
                    '</div>' +
                '</div>';
        }

        function mostrarPerfilRiesgo() {
            // Graficar composición sugerida después de insertar HTML
            setTimeout(() => {
                const data = [{
                    values: [30, 20, 25, 25],
                    labels: ['Calls ITM', 'Calls OTM', 'Puts ITM', 'Puts OTM'],
                    type: 'pie',
                    hole: 0.4,
                    marker: {
                        colors: ['#3b82f6', '#60a5fa', '#ef4444', '#f87171'],
                        line: { color: '#161616', width: 2 }
                    },
                    textinfo: 'label+percent',
                    textfont: { color: '#ffffff', family: 'Inter', size: 12 },
                    hovertemplate: '<b>%{label}</b><br>Porcentaje: %{percent}<extra></extra>',
                    hoverlabel: {
                        bgcolor: 'rgba(22, 22, 22, 0.95)',
                        bordercolor: '#353535',
                        font: { color: '#ffffff', family: 'Inter', size: 12 }
                    }
                }];
                const layout = {
                    title: {
                        text: 'Distribución Sugerida',
                        font: { size: 18, color: '#ffffff', family: 'Inter' },
                        x: 0.5,
                        xanchor: 'center'
                    },
                    height: 400,
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    font: { color: '#ffffff', family: 'Inter', size: 12 },
                    showlegend: true,
                    legend: {
                        bgcolor: 'rgba(22, 22, 22, 0.8)',
                        bordercolor: '#252525',
                        borderwidth: 1,
                        font: { color: '#ffffff', size: 11 },
                        x: 1.1,
                        y: 0.5
                    },
                    margin: { l: 0, r: 150, t: 60, b: 0 }
                };
                const div = document.getElementById('chart-composicion');
                if (div) {
                    Plotly.newPlot('chart-composicion', data, layout, {
                        responsive: true,
                        autosize: true,
                        useResizeHandler: true
                    });
                    window.addEventListener('resize', () => {
                        Plotly.Plots.resize('chart-composicion');
                    });
                }
            }, 200);
            
            return '<h2>Perfil de Riesgo y Composición Sugerida</h2>' +
                '<div class="columns">' +
                    '<div>' +
                        '<h3>Perfil de Riesgo</h3>' +
                        '<div class="info-box">' +
                            '<b>Recomendaciones generales:</b><br>' +
                            '- Diversificar entre calls y puts<br>' +
                            '- Considerar diferentes vencimientos<br>' +
                            '- Monitorear volatilidad implícita vs histórica<br>' +
                            '- Establecer stop-loss apropiados' +
                        '</div>' +
                        '<div style="margin-top: 1.5rem;">' +
                            '<button class="btn btn-primary" onclick="ejecutarOptimizacionEstrategias()" style="width: 100%;">Optimizar Estrategias Automáticamente</button>' +
                            '<small style="display: block; margin-top: 0.5rem; color: var(--text-secondary); font-size: 0.85rem;">Encuentra las mejores estrategias que maximizan la ganancia esperada</small>' +
                        '</div>' +
                    '</div>' +
                    '<div>' +
                        '<h3>Composición Sugerida</h3>' +
                        '<div id="chart-composicion" class="chart-container"></div>' +
                        '<div id="resultados-optimizacion" style="margin-top: 1.5rem; display: none;"></div>' +
                    '</div>' +
                '</div>';
        }

        /**
         * Ejecuta la optimización automática de estrategias y muestra los resultados
         */
        async function ejecutarOptimizacionEstrategias() {
            const resultadosDiv = document.getElementById('resultados-optimizacion');
            if (!resultadosDiv) {
                console.error('No se encontró el contenedor de resultados de optimización');
                return;
            }

            // Mostrar loading
            resultadosDiv.style.display = 'block';
            resultadosDiv.innerHTML = '<div class="loading">Optimizando estrategias... Esto puede tomar varios minutos.</div>';

            try {
                // Ejecutar optimización
                const top10Estrategias = await optimizarEstrategiasAutomaticamente();

                if (!top10Estrategias || top10Estrategias.length === 0) {
                    resultadosDiv.innerHTML = '<div class="error">No se encontraron estrategias optimizadas. Asegúrate de haber ejecutado un análisis primero.</div>';
                    return;
                }

                // Formatear y mostrar resultados
                let html = '<h4 style="margin-top: 1rem; margin-bottom: 1rem;">Top 10 Estrategias Optimizadas</h4>';
                
                top10Estrategias.forEach((resultado, index) => {
                    const estrategia = resultado.estrategia;
                    const ganancia = resultado.ganancia;
                    const tipoEstrategia = resultado.tipoEstrategia || 'Desconocida';

                    // Calcular costo neto
                    let costoNeto = 0;
                    let descripcionPatas = [];
                    
                    estrategia.patas.forEach((pata, idx) => {
                        const prima = pata.precioOpcion || 0;
                        if (pata.tipo === 'compra') {
                            costoNeto += prima;
                            descripcionPatas.push(`Compra ${pata.tipoOpcion} K=${pata.strike.toFixed(2)}`);
                        } else {
                            costoNeto -= prima;
                            descripcionPatas.push(`Venta ${pata.tipoOpcion} K=${pata.strike.toFixed(2)}`);
                        }
                    });

                    const colorGanancia = ganancia > 0 ? 'var(--success)' : 'var(--error)';
                    const iconoGanancia = ganancia > 0 ? '✓' : '✗';

                    html += '<div class="info-box" style="margin-bottom: 1rem; border-left: 4px solid ' + colorGanancia + ';">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">' +
                            '<strong style="color: var(--accent-primary);">#' + (index + 1) + ' - ' + tipoEstrategia + '</strong>' +
                            '<span style="color: ' + colorGanancia + '; font-weight: 600;">' + iconoGanancia + ' $' + ganancia.toFixed(2) + '</span>' +
                        '</div>' +
                        '<div style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 0.5rem;">' +
                            '<strong>Patas:</strong> ' + descripcionPatas.join(', ') +
                        '</div>' +
                        '<div style="font-size: 0.85rem; color: var(--text-tertiary);">' +
                            '<strong>Costo Neto:</strong> $' + costoNeto.toFixed(2) + ' | ' +
                            '<strong>Vencimiento:</strong> ' + formatearFechaVencimiento(estrategia.patas[0]?.fechaVencimiento || '') +
                        '</div>' +
                    '</div>';
                });

                resultadosDiv.innerHTML = html;

            } catch (error) {
                console.error('Error al optimizar estrategias:', error);
                resultadosDiv.innerHTML = '<div class="error">Error al ejecutar la optimización: ' + (error.message || 'Error desconocido') + '</div>';
            }
        }

        /**
         * Calcula la correlación entre dos series de retornos
         * @param {Array<number>} retornos1 - Serie de retornos del activo 1
         * @param {Array<number>} retornos2 - Serie de retornos del activo 2
         * @returns {number} Correlación entre -1 y 1
         */
        function calcularCorrelacion(retornos1, retornos2) {
            if (!retornos1 || !retornos2 || retornos1.length !== retornos2.length || retornos1.length === 0) {
                return 0;
            }

            const n = retornos1.length;
            const media1 = retornos1.reduce((a, b) => a + b, 0) / n;
            const media2 = retornos2.reduce((a, b) => a + b, 0) / n;

            let covarianza = 0;
            let varianza1 = 0;
            let varianza2 = 0;

            for (let i = 0; i < n; i++) {
                const diff1 = retornos1[i] - media1;
                const diff2 = retornos2[i] - media2;
                covarianza += diff1 * diff2;
                varianza1 += diff1 * diff1;
                varianza2 += diff2 * diff2;
            }

            const desviacion1 = Math.sqrt(varianza1 / n);
            const desviacion2 = Math.sqrt(varianza2 / n);

            if (desviacion1 === 0 || desviacion2 === 0) return 0;

            return (covarianza / n) / (desviacion1 * desviacion2);
        }

        /**
         * Calcula el beta de un activo respecto a un benchmark
         * @param {Array<number>} retornosActivo - Retornos del activo
         * @param {Array<number>} retornosBenchmark - Retornos del benchmark
         * @returns {number} Beta del activo
         */
        function calcularBeta(retornosActivo, retornosBenchmark) {
            if (!retornosActivo || !retornosBenchmark || retornosActivo.length !== retornosBenchmark.length || retornosActivo.length === 0) {
                return 0;
            }

            const correlacion = calcularCorrelacion(retornosActivo, retornosBenchmark);
            
            const n = retornosBenchmark.length;
            const mediaBenchmark = retornosBenchmark.reduce((a, b) => a + b, 0) / n;
            let varianzaBenchmark = 0;
            for (let i = 0; i < n; i++) {
                const diff = retornosBenchmark[i] - mediaBenchmark;
                varianzaBenchmark += diff * diff;
            }
            const desviacionBenchmark = Math.sqrt(varianzaBenchmark / n);

            const nActivo = retornosActivo.length;
            const mediaActivo = retornosActivo.reduce((a, b) => a + b, 0) / nActivo;
            let varianzaActivo = 0;
            for (let i = 0; i < nActivo; i++) {
                const diff = retornosActivo[i] - mediaActivo;
                varianzaActivo += diff * diff;
            }
            const desviacionActivo = Math.sqrt(varianzaActivo / nActivo);

            if (desviacionBenchmark === 0) return 0;

            return correlacion * (desviacionActivo / desviacionBenchmark);
        }

        /**
         * Optimiza los pesos de cobertura usando regularización (Ridge)
         * Minimiza: ||beta_posicion - sum(w_i * beta_i)||^2 + lambda * ||w||^2
         * @param {number} betaObjetivo - Beta objetivo a cubrir
         * @param {Array<number>} betasHedge - Array de betas de las opciones de cobertura
         * @param {number} regularizacion - Parámetro de regularización (lambda)
         * @returns {Array<number>} Pesos optimizados de cobertura
         */
        function optimizarPesosCobertura(betaObjetivo, betasHedge, regularizacion = 0.1) {
            if (!betasHedge || betasHedge.length === 0) return [];

            const n = betasHedge.length;
            
            // Construir matriz de diseño X (betas) y vector objetivo y
            // Minimizar: ||y - X*w||^2 + lambda*||w||^2
            // Solución: w = (X'*X + lambda*I)^(-1) * X'*y
            
            // Para simplificar, usar gradiente descendente
            let pesos = new Array(n).fill(1 / n); // Inicializar con pesos iguales
            const learningRate = 0.01;
            const maxIter = 1000;
            const tolerance = 1e-6;

            for (let iter = 0; iter < maxIter; iter++) {
                // Calcular error: beta_objetivo - sum(w_i * beta_i)
                let error = betaObjetivo;
                for (let i = 0; i < n; i++) {
                    error -= pesos[i] * betasHedge[i];
                }

                // Calcular gradiente
                const gradientes = betasHedge.map(beta => 
                    -2 * beta * error + 2 * regularizacion * pesos[betasHedge.indexOf(beta)]
                );

                // Actualizar pesos
                let maxGradiente = Math.max(...gradientes.map(Math.abs));
                if (maxGradiente < tolerance) break;

                for (let i = 0; i < n; i++) {
                    pesos[i] -= learningRate * gradientes[i];
                    // Asegurar que los pesos no sean negativos (opcional)
                    if (pesos[i] < 0) pesos[i] = 0;
                }

                // Normalizar pesos
                const suma = pesos.reduce((a, b) => a + b, 0);
                if (suma > 0) {
                    pesos = pesos.map(w => w / suma);
                }
            }

            return pesos;
        }

        /**
         * Calcula cobertura usando opciones con mayor monto operado
         * @param {number} deltaPosicionUSD - Delta de la posición en USD (millones)
         * @param {number} regularizacion - Parámetro de regularización (default: 0.1)
         * @returns {Object} Resultado de la cobertura con pesos, deltas, betas y costos
         */
        async function calcularCoberturaConOpciones(deltaPosicionUSD = 10, regularizacion = 0.1) {
            // Obtener datos de opciones procesadas
            const datosOpciones = (resultados && resultados.dfProcesado) || 
                                 window.dfMcData || 
                                 (window.resultados && window.resultados.dfProcesado) || 
                                 [];

            if (!datosOpciones || datosOpciones.length === 0) {
                console.warn('No hay datos de opciones disponibles para calcular cobertura');
                return null;
            }

            // Filtrar opciones con mayor monto operado y ordenar
            const opcionesConMonto = datosOpciones
                .filter(op => (op.montoOperado || 0) > 0)
                .sort((a, b) => (b.montoOperado || 0) - (a.montoOperado || 0));

            // Tomar las top N opciones con mayor monto operado (por ejemplo, top 20)
            const topOpciones = opcionesConMonto.slice(0, 20);

            if (topOpciones.length === 0) {
                console.warn('No hay opciones con monto operado para calcular cobertura');
                return null;
            }

            console.log(`Calculando cobertura con ${topOpciones.length} opciones de mayor monto operado`);

            // Calcular betas de las opciones (usando delta como proxy del beta)
            // Beta aproximado = Delta * (Precio Subyacente / Precio Opción)
            const precioSpot = resultados?.precioSpot || CONFIG.precio_spot || 0;
            const betasHedge = topOpciones.map(opcion => {
                const delta = opcion.Delta || 0;
                const precioOpcion = opcion.precioOpcion || opcion.ask || 0;
                // Beta aproximado usando delta
                if (precioOpcion > 0) {
                    return delta * (precioSpot / precioOpcion);
                }
                return delta;
            });

            // Beta objetivo: asumimos que queremos cubrir completamente el delta de la posición
            // Beta objetivo = 1 (neutralizar completamente el riesgo)
            const betaObjetivo = 1;

            // Optimizar pesos de cobertura
            const pesos = optimizarPesosCobertura(betaObjetivo, betasHedge, regularizacion);

            // Calcular métricas de cobertura
            let hedgeDeltaUSD = 0;
            let hedgeBetaUSD = 0;
            let hedgeCostUSD = 0;

            const detallesCobertura = topOpciones.map((opcion, idx) => {
                const peso = pesos[idx];
                const delta = opcion.Delta || 0;
                const precioOpcion = opcion.precioOpcion || opcion.ask || 0;
                const montoOperado = opcion.montoOperado || 0;
                
                // Delta en USD (aproximado)
                const deltaUSD = peso * delta * precioSpot;
                hedgeDeltaUSD += deltaUSD;

                // Beta en USD
                const betaUSD = peso * betasHedge[idx] * deltaPosicionUSD;
                hedgeBetaUSD += betaUSD;

                // Costo de cobertura (prima de la opción)
                const costoUSD = peso * precioOpcion * (deltaPosicionUSD / precioSpot);
                hedgeCostUSD += costoUSD;

                return {
                    simbolo: opcion.simbolo,
                    tipo: opcion.tipoOpcion,
                    strike: opcion.strike,
                    peso: peso,
                    delta: delta,
                    beta: betasHedge[idx],
                    deltaUSD: deltaUSD,
                    betaUSD: betaUSD,
                    costoUSD: costoUSD,
                    montoOperado: montoOperado,
                    precioOpcion: precioOpcion
                };
            });

            // Filtrar solo las opciones con peso significativo (> 1%)
            const coberturaActiva = detallesCobertura.filter(d => d.peso > 0.01);

            return {
                positionDeltaUSD: deltaPosicionUSD,
                positionBetaUSD: betaObjetivo * deltaPosicionUSD,
                hedgeWeights: pesos,
                hedgeDeltaUSD: hedgeDeltaUSD,
                hedgeBetaUSD: hedgeBetaUSD,
                hedgeCostUSD: hedgeCostUSD,
                coberturaActiva: coberturaActiva,
                totalOpciones: topOpciones.length,
                opcionesActivas: coberturaActiva.length
            };
        }

        /**
         * Ejecuta el cálculo de cobertura y muestra los resultados
         */
        async function ejecutarCalculoCobertura() {
            const resultadosDiv = document.getElementById('resultados-cobertura');
            if (!resultadosDiv) {
                console.error('No se encontró el contenedor de resultados de cobertura');
                return;
            }

            const deltaPosicion = parseFloat(document.getElementById('delta-posicion')?.value) || 10;
            const regularizacion = parseFloat(document.getElementById('regularizacion-cobertura')?.value) || 0.1;

            resultadosDiv.innerHTML = '<div class="loading">Calculando cobertura optimizada...</div>';

            try {
                const resultado = await calcularCoberturaConOpciones(deltaPosicion, regularizacion);

                if (!resultado) {
                    resultadosDiv.innerHTML = '<div class="error">No se pudo calcular la cobertura. Asegúrate de haber ejecutado un análisis primero.</div>';
                    return;
                }

                // Formatear resultados
                let html = '<h3 style="margin-top: 1rem; margin-bottom: 1rem;">Resultados de la Cobertura</h3>' +
                    '<div class="metrics-grid" style="margin-bottom: 1.5rem;">' +
                        '<div class="metric">' +
                            '<div class="metric-label">Delta Posición (USD)</div>' +
                            '<div class="metric-value">$' + (resultado.positionDeltaUSD * 1000000).toLocaleString('es-AR', {maximumFractionDigits: 0}) + '</div>' +
                        '</div>' +
                        '<div class="metric">' +
                            '<div class="metric-label">Delta Cobertura (USD)</div>' +
                            '<div class="metric-value">$' + (resultado.hedgeDeltaUSD * 1000000).toLocaleString('es-AR', {maximumFractionDigits: 0}) + '</div>' +
                        '</div>' +
                        '<div class="metric">' +
                            '<div class="metric-label">Beta Cobertura</div>' +
                            '<div class="metric-value">' + (resultado.hedgeBetaUSD / resultado.positionDeltaUSD).toFixed(3) + '</div>' +
                        '</div>' +
                        '<div class="metric">' +
                            '<div class="metric-label">Costo Cobertura (USD)</div>' +
                            '<div class="metric-value" style="color: var(--warning);">$' + (resultado.hedgeCostUSD * 1000000).toLocaleString('es-AR', {maximumFractionDigits: 0}) + '</div>' +
                        '</div>' +
                    '</div>';

                if (resultado.coberturaActiva && resultado.coberturaActiva.length > 0) {
                    html += '<h4 style="margin-top: 1.5rem; margin-bottom: 1rem;">Opciones de Cobertura Activas</h4>' +
                        '<div class="data-table-wrapper">' +
                            '<table class="data-table">' +
                                '<thead>' +
                                    '<tr>' +
                                        '<th>Símbolo</th>' +
                                        '<th>Tipo</th>' +
                                        '<th>Strike</th>' +
                                        '<th>Peso</th>' +
                                        '<th>Delta</th>' +
                                        '<th>Beta</th>' +
                                        '<th>Delta USD</th>' +
                                        '<th>Costo USD</th>' +
                                        '<th>Monto Operado</th>' +
                                    '</tr>' +
                                '</thead>' +
                                '<tbody>';

                    resultado.coberturaActiva.forEach(detalle => {
                        html += '<tr>' +
                            '<td style="color: var(--text-primary);">' + detalle.simbolo + '</td>' +
                            '<td style="color: var(--text-secondary);">' + detalle.tipo + '</td>' +
                            '<td style="color: var(--text-primary);">$' + detalle.strike.toFixed(2) + '</td>' +
                            '<td style="color: var(--text-primary);">' + (detalle.peso * 100).toFixed(2) + '%</td>' +
                            '<td style="color: var(--text-primary);">' + detalle.delta.toFixed(4) + '</td>' +
                            '<td style="color: var(--text-primary);">' + detalle.beta.toFixed(4) + '</td>' +
                            '<td style="color: var(--text-primary);">$' + (detalle.deltaUSD * 1000000).toLocaleString('es-AR', {maximumFractionDigits: 0}) + '</td>' +
                            '<td style="color: var(--text-primary);">$' + (detalle.costoUSD * 1000000).toLocaleString('es-AR', {maximumFractionDigits: 0}) + '</td>' +
                            '<td style="color: var(--text-primary);">$' + detalle.montoOperado.toLocaleString('es-AR', {maximumFractionDigits: 2}) + '</td>' +
                        '</tr>';
                    });

                    html += '</tbody></table></div>';
                }

                resultadosDiv.innerHTML = html;

            } catch (error) {
                console.error('Error al calcular cobertura:', error);
                resultadosDiv.innerHTML = '<div class="error">Error al calcular la cobertura: ' + (error.message || 'Error desconocido') + '</div>';
            }
        }

        // Almacenar instancias de widgets de TradingView
        const tradingViewWidgets = {};
        
        function mostrarAnalisisTecnicoSubyacente() {
            const simbolo = resultados.simbolo;
            const simboloFormato = 'BCBA:' + simbolo;
            const containerId = 'tradingview-chart-' + simbolo.replace(/[^a-zA-Z0-9]/g, '');
            
            // Limpiar widget anterior si existe
            if (tradingViewWidgets[containerId]) {
                try {
                    tradingViewWidgets[containerId].remove();
                } catch (e) {
                    console.warn('Error al remover widget anterior:', e);
                }
                delete tradingViewWidgets[containerId];
            }
            
            // Retornar HTML con contenedor para el widget
            const html = '<h2>Análisis Técnico del Subyacente</h2>' +
                '<h3>Gráfico de TradingView</h3>' +
                '<div style="width:100%;height:700px;margin:2rem 0;border-radius:12px;overflow:hidden;border:1px solid var(--border-color);box-shadow: var(--shadow-md);background:#0a0a0a;">' +
                    '<div id="' + containerId + '" style="width:100%;height:700px;"></div>' +
                '</div>';
            
            // Inicializar el widget después de que el HTML se haya insertado
            setTimeout(() => {
                inicializarTradingViewWidget(containerId, simboloFormato);
            }, 100);
            
            return html;
        }
        
        function inicializarTradingViewWidget(containerId, symbol) {
            const container = document.getElementById(containerId);
            if (!container) {
                console.error('Contenedor no encontrado:', containerId);
                return;
            }
            
            // Verificar que TradingView esté disponible
            if (typeof TradingView === 'undefined') {
                console.error('TradingView widget no está disponible. Verificando carga del script...');
                // Intentar cargar el script si no está disponible
                const script = document.createElement('script');
                script.type = 'text/javascript';
                script.src = 'https://s3.tradingview.com/tv.js';
                script.onload = () => {
                    inicializarTradingViewWidget(containerId, symbol);
                };
                document.head.appendChild(script);
                return;
            }
            
            try {
                // Configurar el contenedor
                container.style.width = '100%';
                container.style.height = '700px';
                container.style.minHeight = '700px';
                container.style.display = 'block';
                
                // Crear el widget de TradingView
                const widget = new TradingView.widget({
                    autosize: true,
                    symbol: symbol,
                    interval: 'D',
                    timezone: 'America/Argentina/Buenos_Aires',
                    theme: 'dark',
                    style: '1',
                    locale: 'es',
                    toolbar_bg: '#000000',
                    enable_publishing: false,
                    hide_top_toolbar: false,
                    hide_side_toolbar: false,
                    allow_symbol_change: true,
                    container_id: containerId,
                    width: '100%',
                    height: 700,
                    studies: [],
                    watchlist: [],
                    watchlist_visibility: false
                });
                
                // Guardar la instancia
                tradingViewWidgets[containerId] = widget;
                
                console.log('Widget de TradingView inicializado para:', symbol);
            } catch (error) {
                console.error('Error al inicializar widget de TradingView:', error);
                container.innerHTML = '<div style="padding: 20px; color: #ef4444;">Error al cargar el gráfico de TradingView. Por favor, recarga la página.</div>';
            }
        }

        /**
         * Analiza desarbitrajes en la cadena de opciones
         * @param {Array} df - DataFrame de opciones procesadas
         * @param {number} precioSpot - Precio spot del subyacente
         * @returns {Object} Análisis de desarbitrajes
         */
        function analizarDesarbitrajes(df, precioSpot) {
            const desarbitrajes = {
                opcionesBaratas: [],
                opcionesCaras: [],
                deltasIncoherentes: [],
                vegasAnomalas: [],
                spreadsAnomalos: []
            };
            
            df.forEach(row => {
                const precioTeorico = row.BlackScholes || 0;
                const precioMercado = row.precioOpcion || 0;
                const bid = row.bid || 0;
                const ask = row.ask || 0;
                const delta = row.Delta || 0;
                const vega = row.Vega || 0;
                const gamma = row.Gamma || 0;
                const strike = row.strike || 0;
                const tipoOpcion = row.tipoOpcion || '';
                
                // 1. Opciones baratas (precio mercado < precio teórico - 10%)
                // Excluir opciones con monto operado = 0 (sin liquidez)
                const montoOperado = row.montoOperado || 0;
                if (montoOperado <= 0) {
                    // Saltar opciones sin liquidez
                } else {
                    // También considerar opciones ITM con precio muy bajo (pueden estar baratas por expectativa de caída)
                    const esBarata = precioMercado > 0 && precioTeorico > 0 && precioMercado < precioTeorico * 0.9;
                    // Detectar si es ITM actualmente
                    const esITM = (tipoOpcion === 'Call' && strike < precioSpot * 0.99) || 
                                 (tipoOpcion === 'Put' && strike > precioSpot * 1.01);
                    const esBarataPorCaida = esITM && precioMercado > 0 && precioMercado < precioTeorico * 0.95;
                    
                    if (esBarata || esBarataPorCaida) {
                        const descuento = precioTeorico > 0 ? ((precioTeorico - precioMercado) / precioTeorico * 100).toFixed(2) : '0.00';
                        desarbitrajes.opcionesBaratas.push({
                            simbolo: row.simbolo,
                            tipo: tipoOpcion,
                            strike: strike,
                            precioMercado: precioMercado,
                            precioTeorico: precioTeorico,
                            descuento: descuento,
                            delta: delta,
                            vega: vega,
                            probITM: row.Prob_ITM || row.MC_ProbITM || 0,
                            precioSpot: precioSpot,
                            montoOperado: montoOperado
                        });
                    }
                }
                
                // 2. Opciones caras (precio mercado > precio teórico + 20%)
                // Excluir opciones con monto operado = 0 (sin liquidez)
                if (montoOperado > 0 && precioMercado > 0 && precioTeorico > 0 && precioMercado > precioTeorico * 1.2) {
                    const sobreprecio = ((precioMercado - precioTeorico) / precioTeorico * 100).toFixed(2);
                    desarbitrajes.opcionesCaras.push({
                        simbolo: row.simbolo,
                        tipo: tipoOpcion,
                        strike: strike,
                        precioMercado: precioMercado,
                        precioTeorico: precioTeorico,
                        sobreprecio: sobreprecio,
                        delta: delta,
                        vega: vega,
                        montoOperado: montoOperado
                    });
                }
                
                // 3. Deltas incoherentes
                // Delta debería estar entre -1 y 1
                if (Math.abs(delta) > 1.01) {
                    desarbitrajes.deltasIncoherentes.push({
                        simbolo: row.simbolo,
                        tipo: tipoOpcion,
                        strike: strike,
                        delta: delta,
                        precioMercado: precioMercado,
                        precioSpot: precioSpot
                    });
                }
                
                // 4. Vegas anómalas (vega muy alta o negativa)
                if (vega < 0 || vega > 100) {
                    desarbitrajes.vegasAnomalas.push({
                        simbolo: row.simbolo,
                        tipo: tipoOpcion,
                        strike: strike,
                        vega: vega,
                        volatilidadImplicita: row.volatilidadImplicita != null ? row.volatilidadImplicita * 100 : null
                    });
                }
                
                // 5. Spreads anómalos (bid-ask muy amplio)
                if (bid > 0 && ask > 0) {
                    const spread = ask - bid;
                    const spreadPct = (spread / precioMercado * 100);
                    if (spreadPct > 50) { // Spread > 50% del precio
                        desarbitrajes.spreadsAnomalos.push({
                            simbolo: row.simbolo,
                            tipo: tipoOpcion,
                            strike: strike,
                            bid: bid,
                            ask: ask,
                            spread: spread,
                            spreadPct: spreadPct.toFixed(2)
                        });
                    }
                }
            });
            
            // Ordenar por relevancia
            desarbitrajes.opcionesBaratas.sort((a, b) => parseFloat(b.descuento) - parseFloat(a.descuento));
            desarbitrajes.opcionesCaras.sort((a, b) => parseFloat(b.sobreprecio) - parseFloat(a.sobreprecio));
            
            return desarbitrajes;
        }
        
        /**
         * Genera resumen ejecutivo de la cadena de opciones
         * @param {Array} df - DataFrame de opciones procesadas
         * @param {number} precioSpot - Precio spot del subyacente
         * @returns {Object} Resumen ejecutivo
         */
        function generarResumenEjecutivo(df, precioSpot) {
            const calls = df.filter(r => r.tipoOpcion === 'Call');
            const puts = df.filter(r => r.tipoOpcion === 'Put');
            
            // Moneyness por strike
            const strikes = [...new Set(df.map(r => r.strike))].sort((a, b) => a - b);
            const moneynessPorStrike = strikes.map(strike => {
                const callsStrike = calls.filter(c => Math.abs(c.strike - strike) < 0.01);
                const putsStrike = puts.filter(p => Math.abs(p.strike - strike) < 0.01);
                const totalVolumen = [...callsStrike, ...putsStrike].reduce((sum, r) => sum + (r.montoOperado || 0), 0);
                
                return {
                    strike: strike,
                    distanciaPct: ((strike - precioSpot) / precioSpot * 100).toFixed(2),
                    calls: callsStrike.length,
                    puts: putsStrike.length,
                    volumenTotal: totalVolumen,
                    moneyness: strike < precioSpot ? 'ITM' : strike > precioSpot ? 'OTM' : 'ATM'
                };
            });
            
            // Curva implícita (volatilidad por strike)
            const curvaImplicita = strikes.map(strike => {
                const opcionesStrike = df.filter(r => Math.abs(r.strike - strike) < 0.01);
                const volPromedio = opcionesStrike.length > 0 
                    ? opcionesStrike.reduce((sum, r) => sum + (r.volatilidadImplicita ?? r.volatilidadSubyacente ?? 0), 0) / opcionesStrike.length
                    : 0;
                return {
                    strike: strike,
                    volatilidad: volPromedio * 100
                };
            });
            
            // Flujos y liquidez
            const totalVolumen = df.reduce((sum, r) => sum + (r.montoOperado || 0), 0);
            const opcionesLiquidas = df.filter(r => (r.montoOperado || 0) > totalVolumen / df.length * 2);
            
            // Señales de operación
            const mejoresCalls = calls
                .filter(c => (c.MC_ProbProfit || 0) > 0.5)
                .sort((a, b) => (b.MC_ProbProfit || 0) - (a.MC_ProbProfit || 0))
                .slice(0, 5);
            
            const mejoresPuts = puts
                .filter(p => (p.MC_ProbProfit || 0) > 0.5)
                .sort((a, b) => (b.MC_ProbProfit || 0) - (a.MC_ProbProfit || 0))
                .slice(0, 5);
            
            return {
                precioSpot: precioSpot,
                totalOpciones: df.length,
                calls: calls.length,
                puts: puts.length,
                moneynessPorStrike: moneynessPorStrike,
                curvaImplicita: curvaImplicita,
                totalVolumen: totalVolumen,
                opcionesLiquidas: opcionesLiquidas.length,
                mejoresCalls: mejoresCalls,
                mejoresPuts: mejoresPuts
            };
        }
        
        function mostrarTablaOpciones() {
            if (!resultados || !resultados.dfProcesado || resultados.dfProcesado.length === 0) {
                return '<div class="error">No hay opciones procesadas disponibles. Por favor ejecutá el análisis primero.</div>';
            }
            const df = resultados.dfProcesado;
            const precioSpot = resultados.precioSpot || CONFIG.precio_spot || 0;
            
            // Generar análisis
            const desarbitrajes = analizarDesarbitrajes(df, precioSpot);
            const resumen = generarResumenEjecutivo(df, precioSpot);
            
            // Controles de recalculo
            const nSimActual = parseInt(document.getElementById('config-simulaciones-global')?.value) || 10000;
            
            // Resumen Ejecutivo y Análisis de Desarbitrajes - Tabla con botón opcional
            // Sistema de Decisiones Coherente eliminado completamente
            let html = '' +
                // Sección "Guía Estratégica de Operación" eliminada completamente
                // Filtros
                '<div style="margin-bottom: 1.5rem; padding: 1rem; background: rgba(66, 165, 245, 0.1); border-left: 4px solid #42a5f5; border-radius: 8px;">' +
                    '<div style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">' +
                        '<div style="flex: 1; min-width: 200px;">' +
                            '<label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Ajustar Simulaciones Monte Carlo</label>' +
                            '<input type="number" id="recalc-simulaciones" value="' + nSimActual + '" min="1000" max="100000" step="1000" style="width: 100%; padding: 0.5rem; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; color: white;">' +
                            '<small style="display: block; margin-top: 0.25rem; color: rgba(255,255,255,0.6);">Actual: ' + nSimActual.toLocaleString() + ' simulaciones</small>' +
                        '</div>' +
                        '<button onclick="recalcularProbabilidadesMC()" style="padding: 0.75rem 1.5rem; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 8px; color: var(--text-primary); font-weight: 500; cursor: pointer; white-space: nowrap; margin-top: 1.5rem;">' +
                            'Recalcular Probabilidades' +
                        '</button>' +
                    '</div>' +
                '</div>' +
                '<div class="columns">' +
                    '<div class="form-group">' +
                        '<label for="filtro-tipo">Filtrar por tipo</label>' +
                        '<select id="filtro-tipo" onchange="aplicarFiltros()">' +
                            '<option value="Todos">Todos</option>' +
                            '<option value="Call">Call</option>' +
                            '<option value="Put">Put</option>' +
                        '</select>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label for="ordenar-por">Ordenar por</label>' +
                        '<select id="ordenar-por" onchange="aplicarFiltros()">' +
                            '<option value="strike">Strike</option>' +
                            '<option value="precioSubyacente">Precio Subyacente</option>' +
                            '<option value="precioOpcion">Precio</option>' +
                            '<option value="montoOperado">Monto Operado</option>' +
                            '<option value="volumenNominal">Volumen</option>' +
                            '<option value="cantidadOperaciones">Operaciones</option>' +
                            '<option value="volatilidadImplicita">Vol. Impl.</option>' +
                            '<option value="Prob_ITM">Prob. ITM</option>' +
                            '<option value="VaR">VaR</option>' +
                        '</select>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label for="mm-mode" style="display: flex; align-items: center; gap: 8px;">' +
                            '<input type="checkbox" id="mm-mode" onchange="aplicarFiltros()" style="width: auto;">' +
                            '<span>MM Rigor Mode</span>' +
                        '</label>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label for="trader-mode" style="display: flex; align-items: center; gap: 8px;">' +
                            '<input type="checkbox" id="trader-mode" onchange="aplicarFiltros()" style="width: auto;">' +
                            '<span>Modo Trader</span>' +
                        '</label>' +
                    '</div>' +
                '</div>' +
                '<div id="filtro-estado" style="margin-bottom: 1rem; padding: 0.75rem; background: rgba(76, 175, 80, 0.1); border-left: 4px solid #4caf50; border-radius: 6px; color: var(--text-primary);">' +
                    '<div style="font-weight: 500; margin-bottom: 0.5rem;">🔍 Filtros Activos (MM):</div>' +
                    '<div style="font-size: 0.9rem; line-height: 1.4;">' +
                        '• <strong>Liquidez:</strong> Vol > 0 ó Monto > 0 ó Operaciones > 0<br>' +
                        '• <strong>Spread Bid/Ask:</strong> ≤ 50% del midprice (permisivo para mercado arg)<br>' +
                        '• <strong>Zona Operable:</strong> Strike entre 80% y 120% del spot<br>' +
                        '• <strong>Valor Temporal:</strong> ≥ 1% de la prima (calculado desde spot real)<br>' +
                        '• <strong>Prima Mínima:</strong> ≥ $0.05 (ejecutable en la práctica)<br>' +
                        '• <strong>Paridad:</strong> precio ≥ valor intrínseco × 0.98' +
                    '</div>' +
                    '<div id="filtro-resumen" style="margin-top: 0.5rem; font-weight: 500;"></div>' +
                '</div>' +
                '<div style="margin-bottom: 1rem; text-align: center;">' +
                    '<button onclick="generarAutoPutSpread()" style="padding: 0.75rem 1.5rem; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; border-radius: 8px; color: white; font-weight: 600; cursor: pointer; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3); transition: all 0.3s ease;">' +
                        '🎯 Generar Auto Put Spreads' +
                    '</button>' +
                '</div>' +
                '<div id="auto-spread-results"></div>' +
                '<div class="data-table-wrapper">' +
                    '<table class="data-table" id="tabla-opciones">' +
                        '<thead>' +
                            '<tr>' +
                                '<th onclick="ordenarTabla(\'simbolo\')">Símbolo</th>' +
                                '<th onclick="ordenarTabla(\'tipoOpcion\')">Tipo</th>' +
                                '<th onclick="ordenarTabla(\'strike\')">Strike</th>' +
                                '<th>Moneyness</th>' +
                                '<th onclick="ordenarTabla(\'fechaVencimiento\')">Vencimiento</th>' +
                                '<th onclick="ordenarTabla(\'precioSubyacente\')">Precio Subyacente</th>' +
                                '<th onclick="ordenarTabla(\'precioOpcion\')">Precio</th>' +
                                '<th onclick="ordenarTabla(\'bid\')">Bid</th>' +
                                '<th onclick="ordenarTabla(\'ask\')">Ask</th>' +
                                '<th onclick="ordenarTabla(\'volumenNominal\')">Volumen</th>' +
                                '<th onclick="ordenarTabla(\'montoOperado\')">Monto Operado <span class="help-icon" onclick="event.stopPropagation(); event.preventDefault(); mostrarAyuda(\'montoOperado\'); return false;">?</span></th>' +
                                '<th onclick="ordenarTabla(\'cantidadOperaciones\')">Operaciones</th>' +
                                '<th onclick="ordenarTabla(\'volatilidadImplicita\')">Vol. Impl. <span class="help-icon" onclick="event.stopPropagation(); mostrarAyuda(\'volatilidadImplicita\');">?</span></th>' +
                                '<th onclick="ordenarTabla(\'BlackScholes\')">Black-Scholes <span class="help-icon" onclick="event.stopPropagation(); mostrarAyuda(\'blackScholes\');">?</span></th>' +
                                '<th onclick="ordenarTabla(\'Binomial\')">Binomial</th>' +
                                '<th onclick="ordenarTabla(\'Delta\')">Delta <span class="help-icon" onclick="event.stopPropagation(); mostrarAyuda(\'delta\');">?</span></th>' +
                                '<th onclick="ordenarTabla(\'Gamma\')">Gamma <span class="help-icon" onclick="event.stopPropagation(); mostrarAyuda(\'gamma\');">?</span></th>' +
                                '<th onclick="ordenarTabla(\'Vega\')">Vega <span class="help-icon" onclick="event.stopPropagation(); mostrarAyuda(\'vega\');">?</span></th>' +
                                '<th onclick="ordenarTabla(\'Theta\')">Theta <span class="help-icon" onclick="event.stopPropagation(); mostrarAyuda(\'theta\');">?</span></th>' +
                                '<th onclick="ordenarTabla(\'Prob_ITM\')">Prob. ITM</th>' +
                                '<th onclick="ordenarTabla(\'MC_ProbProfit\')">Prob. Profit (MC) <span class="help-icon" onclick="event.stopPropagation(); mostrarAyuda(\'probabilidadGanancia\');">?</span></th>' +
                                '<th onclick="ordenarTabla(\'VaR\')">VaR</th>' +
                                '<th onclick="ordenarTabla(\'CVaR_95\')">CVaR 95%</th>' +
                                '<th onclick="ordenarTabla(\'valorIntrinseco\')">Valor Intrínseco</th>' +
                                '<th onclick="ordenarTabla(\'valorTemporal\')">Valor Temporal</th>' +
                            '</tr>' +
                        '</thead>' +
                        '<tbody>';

            // Show ALL options in main table (no MM filtering)
            let dfFiltrado = [...df]; // Show all data
            
            // Apply only basic filters for main table display
            // 1. Remove options with zero price
            dfFiltrado = dfFiltrado.filter(row => {
                const prima = row.precioOpcion || 0;
                return prima > 0;
            });

            // 2. Remove options with invalid data
            dfFiltrado = dfFiltrado.filter(row => {
                const strike = row.strike || 0;
                return strike > 0;
            });

            dfFiltrado.forEach(row => {
                // Calcular status ITM/OTM localmente (no confiar en el campo de la API)
                const spot = resultados.precioSpot || CONFIG.precio_spot || 0;
                const esITM_put = row.tipoOpcion === 'Put' && row.strike > spot;
                const esITM_call = row.tipoOpcion === 'Call' && row.strike < spot;
                const esITM = esITM_put || esITM_call;
                const distanciaPct = Math.abs(row.strike - spot) / spot * 100;
                const esATM = distanciaPct < 1.0;

                let statusLabel, statusColor, statusBg;
                if (esATM) {
                    statusLabel = 'ATM';
                    statusColor = '#64b5f6'; statusBg = 'rgba(33,150,243,0.15)';
                } else if (esITM) {
                    statusLabel = `ITM ${distanciaPct.toFixed(1)}%`;
                    statusColor = '#ff9800'; statusBg = 'rgba(255,152,0,0.12)';
                    // Advertencia especial para Puts ITM (regla del trader)
                    if (row.tipoOpcion === 'Put') {
                        statusLabel = `⚠️ ITM ${distanciaPct.toFixed(1)}%`;
                        statusColor = '#f44336'; statusBg = 'rgba(244,67,54,0.12)';
                    }
                } else {
                    statusLabel = `OTM ${distanciaPct.toFixed(1)}%`;
                    statusColor = '#81c784'; statusBg = 'rgba(76,175,80,0.12)';
                }

                const moneynessCell = `<td><span style="background:${statusBg};color:${statusColor};
                    padding:2px 7px;border-radius:4px;font-size:0.8rem;font-weight:600;white-space:nowrap;">
                    ${statusLabel}</span></td>`;

                // Calcular valor intrínseco y temporal
                const prima = row.precioOpcion || 0;
                const strike = row.strike || 0;

                let valorIntrinseco, valorTemporal;
                if (row.tipoOpcion === 'Put') {
                    valorIntrinseco = Math.max(0, strike - spot);
                } else { // Call
                    valorIntrinseco = Math.max(0, spot - strike);
                }
                valorTemporal = Math.max(0, prima - valorIntrinseco);

                html += '<tr>' +
                    '<td>' + (row.simbolo || 'N/A') + '</td>' +
                    '<td>' + (row.tipoOpcion || 'N/A') + '</td>' +
                    '<td>' + formatearStrike(row.strike || 0) + '</td>' +
                    moneynessCell +
                    '<td>' + formatearFechaVencimiento(row.fechaVencimiento || '') + '</td>' +
                    '<td style="color: var(--text-primary); font-weight: bold;">$' + ((row.precioSubyacente || 0).toFixed(2)) + '</td>' +
                    '<td>$' + ((row.precioOpcion || 0).toFixed(2)) + '</td>' +
                    '<td>$' + ((row.bid || 0).toFixed(2)) + '</td>' +
                    '<td>$' + ((row.ask || 0).toFixed(2)) + '</td>' +
                    '<td>' + ((row.volumenNominal || 0).toLocaleString('es-AR')) + '</td>' +
                    '<td>$' + ((row.montoOperado || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + '</td>' +
                    '<td>' + ((row.cantidadOperaciones || 0).toLocaleString('es-AR')) + '</td>' +
                    '<td>' + (row.volatilidadImplicita != null ? ((row.volatilidadImplicita * 100).toFixed(2) + '%') : 'N/D') + '</td>' +
                    '<td>$' + ((row.BlackScholes || 0).toFixed(2)) + '</td>' +
                    '<td>$' + ((row.Binomial || 0).toFixed(2)) + '</td>' +
                    '<td>' + ((row.Delta || 0).toFixed(4)) + '</td>' +
                    '<td>' + ((row.Gamma || 0).toFixed(4)) + '</td>' +
                    '<td>' + ((row.Vega || 0).toFixed(4)) + '</td>' +
                    '<td>' + ((row.Theta || 0).toFixed(4)) + '</td>' +
                    '<td>' + (((row.Prob_ITM || 0) * 100).toFixed(2)) + '%</td>' +
                    '<td>' + (((row.MC_ProbProfit || 0) * 100).toFixed(2)) + '%</td>' +
                    '<td>$' + ((row.VaR || 0).toFixed(2)) + '</td>' +
                    '<td>$' + ((row.CVaR_95 || 0).toFixed(2)) + '</td>' +
                    '<td style="color: ' + (valorIntrinseco > 0 ? '#ff9800' : '#666') + '; font-weight: ' + (valorIntrinseco > 0 ? 'bold' : 'normal') + ';">$' + valorIntrinseco.toFixed(2) + '</td>' +
                    '<td style="color: ' + (valorTemporal > 0 ? '#4caf50' : '#666') + '; font-weight: ' + (valorTemporal > 0 ? 'bold' : 'normal') + ';">$' + valorTemporal.toFixed(2) + '</td>' +
                    '</tr>';
            });

            html += '</tbody></table></div>';

            // Actualizar resumen de filtros
            setTimeout(() => {
                const resumenDiv = document.getElementById('filtro-resumen');
                if (resumenDiv) {
                    const totalOriginal = df.length;
                    const totalFiltrado = dfFiltrado.length;
                    const eliminados = totalOriginal - totalFiltrado;
                    resumenDiv.innerHTML = `📊 <strong>${totalFiltrado}</strong> opciones válidas de <strong>${totalOriginal}</strong> totales (${eliminados} filtradas)`;
                }
            }, 100);

            return html;
        }

        let ordenActual = {};
        
        function toggleEstrategico() {
            const container = document.getElementById('estrategico-container');
            const toggleIcon = document.getElementById('estrategico-toggle-icon');
            if (container.style.display === 'none') {
                container.style.display = 'block';
                toggleIcon.textContent = '▲';
            } else {
                container.style.display = 'none';
                toggleIcon.textContent = '▼';
            }
        }
        
        function ejecutarBacktesting() {
            if (!resultados || !resultados.dfProcesado) {
                alert('No hay datos disponibles. Por favor ejecutá el análisis primero.');
                return;
            }
            
            const minScore = parseFloat(document.getElementById('backtest-min-score')?.value) || 70;
            const capitalInicial = parseFloat(document.getElementById('backtest-capital')?.value) || 100000;
            
            const criterios = { minScore };
            const resultadosBacktest = backtestEstrategia(resultados.dfProcesado, criterios, capitalInicial, 0.1);
            
            const resultsDiv = document.getElementById('backtesting-results');
            if (resultsDiv) {
                resultsDiv.innerHTML = mostrarResultadosBacktesting(resultadosBacktest);
            } else {
                alert('Error: No se encontró el contenedor de resultados');
            }
        }
        
        /**
         * Obtiene datos históricos de precio de opción y subyacente desde la API
         * @param {string} token - Token de autenticación
         * @param {string} simboloOpcion - Símbolo de la opción
         * @param {string} simboloSubyacente - Símbolo del subyacente
         * @param {string} fechaInicio - Fecha inicio (YYYY-MM-DD)
         * @param {string} fechaFin - Fecha fin (YYYY-MM-DD)
         * @param {Object} opcion - Objeto con datos de la opción (strike, tipoOpcion, T, volatilidadImplicita)
         * @returns {Promise<Object>} { preciosOpcion: [], preciosSubyacente: [], fechas: [] }
         */
        async function obtenerDatosHistoricos(token, simboloOpcion, simboloSubyacente, fechaInicio, fechaFin, opcion) {
            try {
                // Intentar obtener datos históricos reales del subyacente desde la API
                let serieHistoricaSubyacente = [];
                if (token && simboloSubyacente) {
                    try {
                        serieHistoricaSubyacente = await obtenerSerieHistorica(token, simboloSubyacente, fechaInicio, fechaFin);
                    } catch (error) {
                        console.warn('No se pudieron obtener datos históricos del subyacente:', error);
                    }
                }
                
                const precioActualSubyacente = resultados.precioSpot || opcion.precioSubyacente || 0;
                const precioActualOpcion = opcion.precioOpcion || 0;
                
                const fechaInicioObj = new Date(fechaInicio);
                const fechaFinObj = new Date(fechaFin);
                const dias = Math.floor((fechaFinObj - fechaInicioObj) / (1000 * 60 * 60 * 24));
                
                const preciosOpcion = [];
                const preciosSubyacente = [];
                const fechas = [];
                
                // Si tenemos datos históricos reales del subyacente, usarlos
                if (serieHistoricaSubyacente.length > 0) {
                    const fechaInicioObj = new Date(fechaInicio);
                    const fechaVencimiento = opcion.fechaVencimiento ? new Date(opcion.fechaVencimiento) : null;
                    
                    serieHistoricaSubyacente.forEach((item, idx) => {
                        const fecha = item.fechaHora ? new Date(item.fechaHora).toISOString().split('T')[0] : 
                                     (item.fecha ? new Date(item.fecha).toISOString().split('T')[0] : null);
                        if (fecha) {
                            fechas.push(fecha);
                            const precioCierre = item.precioCierre || item.ultimoPrecio || item.precio || precioActualSubyacente;
                            preciosSubyacente.push(precioCierre);
                            
                            // Calcular precio de opción usando Black-Scholes con precio histórico
                            const strike = opcion.strike || 0;
                            const volatilidad = opcion.volatilidadImplicita || opcion.volatilidadSubyacente || 0.3;
                            const tasaRiesgo = CONFIG.tasa_riesgo;
                            
                            // Calcular T (tiempo hasta vencimiento) desde la fecha histórica
                            let T = opcion.T || 0;
                            if (fechaVencimiento) {
                                const fechaItem = new Date(fecha);
                                const diasHastaVto = Math.max(0, (fechaVencimiento - fechaItem) / (1000 * 60 * 60 * 24));
                                T = diasHastaVto / 365;
                            }
                            
                            if (T > 0 && precioCierre > 0) {
                                const bs = blackScholes(opcion.tipoOpcion, precioCierre, strike, T, tasaRiesgo, volatilidad);
                                preciosOpcion.push(bs.precio || 0);
                            } else {
                                const valorIntrinseco = opcion.tipoOpcion === 'Call' 
                                    ? Math.max(0, precioCierre - strike)
                                    : Math.max(0, strike - precioCierre);
                                preciosOpcion.push(valorIntrinseco);
                            }
                        }
                    });
                } else {
                    // Fallback: simular trayectoria basada en volatilidad
                    const volatilidad = opcion.volatilidadImplicita || opcion.volatilidadSubyacente || 0.3;
                    const tasaRiesgo = CONFIG.tasa_riesgo;
                    
                    // Empezar desde un precio histórico estimado (5% menos que actual)
                    let precioSubyacenteSim = precioActualSubyacente * 0.95;
                    const strike = opcion.strike || 0;
                    const T = opcion.T || 0;
                    
                    for (let i = 0; i <= dias; i++) {
                        const fecha = new Date(fechaInicioObj);
                        fecha.setDate(fecha.getDate() + i);
                        fechas.push(fecha.toISOString().split('T')[0]);
                        
                        // Simular movimiento del subyacente
                        const Z = generarNormal();
                        const retorno = (tasaRiesgo - 0.5 * volatilidad * volatilidad) * (1/365) + 
                                       volatilidad * Math.sqrt(1/365) * Z;
                        precioSubyacenteSim = precioSubyacenteSim * Math.exp(retorno);
                        preciosSubyacente.push(precioSubyacenteSim);
                        
                        // Calcular precio de opción usando Black-Scholes
                        const TRestante = Math.max(0, T - (i / 365));
                        if (TRestante > 0 && precioSubyacenteSim > 0) {
                            const bs = blackScholes(opcion.tipoOpcion, precioSubyacenteSim, strike, TRestante, tasaRiesgo, volatilidad);
                            preciosOpcion.push(bs.precio || 0);
                        } else {
                            const valorIntrinseco = opcion.tipoOpcion === 'Call' 
                                ? Math.max(0, precioSubyacenteSim - strike)
                                : Math.max(0, strike - precioSubyacenteSim);
                            preciosOpcion.push(valorIntrinseco);
                        }
                    }
                }
                
                return { preciosOpcion, preciosSubyacente, fechas };
            } catch (error) {
                console.error('Error obteniendo datos históricos:', error);
                return { preciosOpcion: [], preciosSubyacente: [], fechas: [] };
            }
        }
        
        // Función clasificarOpciones() eliminada completamente
        
        function aplicarFiltroLiquidez() {
            if (!resultados || !resultados.dfProcesado) {
                alert('No hay datos disponibles. Por favor ejecutá el análisis primero.');
                return;
            }
            
            const df = resultados.dfProcesado;
            const filtradas = df.filter(row => {
                const volumen = row.volumenNominal || 0;
                const bid = row.bid || 0;
                const ask = row.ask || 0;
                const precio = row.precioOpcion || 0;
                const spread = precio > 0 ? ((ask - bid) / precio * 100) : 100;
                const vega = Math.abs(row.Vega || 0);
                
                return volumen > 100 && spread < 10 && vega < 1000;
            });
            
            const resultadoDiv = document.getElementById('resultado-filtrado');
            resultadoDiv.style.display = 'block';
            resultadoDiv.innerHTML = '<strong style="color: var(--success);">✓ Filtro aplicado:</strong> ' + 
                filtradas.length + ' de ' + df.length + ' opciones cumplen los criterios de liquidez y viabilidad. ' +
                '<button onclick="mostrarOpcionesFiltradas()" style="margin-left: 0.5rem; padding: 0.25rem 0.5rem; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); cursor: pointer; font-size: 11px;">Ver detalles</button>';
            
            // Guardar opciones filtradas para mostrar después
            window.opcionesFiltradas = filtradas;
        }
        
        function mostrarOpcionesFiltradas() {
            if (!window.opcionesFiltradas || window.opcionesFiltradas.length === 0) {
                alert('No hay opciones filtradas para mostrar. Aplicá el filtro primero.');
                return;
            }
            
            const resultadoDiv = document.getElementById('resultado-filtrado');
            let html = '<div style="margin-top: 1rem;"><strong style="color: var(--success);">✓ Opciones Filtradas (' + window.opcionesFiltradas.length + '):</strong></div>';
            html += '<div style="max-height: 300px; overflow-y: auto; margin-top: 0.5rem;">';
            html += '<table class="data-table" style="font-size: 12px;">';
            html += '<thead><tr><th>Símbolo</th><th>Tipo</th><th>Strike</th><th>Volumen</th><th>Spread %</th><th>Vega</th></tr></thead><tbody>';
            
            window.opcionesFiltradas.forEach(op => {
                const spread = op.precioOpcion > 0 ? (((op.ask || 0) - (op.bid || 0)) / op.precioOpcion * 100).toFixed(2) : 'N/A';
                html += '<tr>';
                html += `<td>${op.simbolo || 'N/A'}</td>`;
                html += `<td>${op.tipoOpcion || 'N/A'}</td>`;
                html += `<td>$${formatearStrike(op.strike || 0)}</td>`;
                html += `<td>${(op.volumenNominal || 0).toLocaleString('es-AR')}</td>`;
                html += `<td>${spread}%</td>`;
                html += `<td>${(Math.abs(op.Vega || 0)).toFixed(2)}</td>`;
                html += '</tr>';
            });
            
            html += '</tbody></table></div>';
            resultadoDiv.innerHTML += html;
        }
        
        function calcularScores() {
            if (!resultados || !resultados.dfProcesado) {
                alert('No hay datos disponibles. Por favor ejecutá el análisis primero.');
                return;
            }
            
            const df = resultados.dfProcesado;
            const precioSpot = resultados.precioSpot || CONFIG.precio_spot || 0;
            
            const opcionesConScore = df.map(row => {
                const volumen = row.volumenNominal || 0;
                const bid = row.bid || 0;
                const ask = row.ask || 0;
                const precio = row.precioOpcion || 0;
                const spread = precio > 0 ? ((ask - bid) / precio * 100) : 100;
                const theta = Math.abs(row.Theta || 0);
                const probITM = (row.Prob_ITM || row.MC_ProbITM || 0) * 100;
                const tipo = row.tipoOpcion || '';
                const strike = row.strike || 0;
                
                // Calcular prob_ITM_apropiada según si es venta o compra
                let probITMApropiada = probITM;
                if (tipo === 'Call' && strike < precioSpot) {
                    probITMApropiada = 100 - probITM; // Para venta de calls ITM
                } else if (tipo === 'Put' && strike > precioSpot) {
                    probITMApropiada = 100 - probITM; // Para venta de puts ITM
                }
                
                const score = (
                    (volumen / 1000) * 0.3 +
                    (1 / Math.max(spread, 0.1)) * 0.2 +
                    (theta / 10) * 0.2 +
                    (probITMApropiada / 100) * 0.3
                );
                
                return {
                    ...row,
                    score: score
                };
            });
            
            // Ordenar por score descendente
            opcionesConScore.sort((a, b) => b.score - a.score);
            
            // Mostrar top 20
            const resultadoDiv = document.getElementById('resultado-filtrado');
            let html = '<div style="margin-top: 1rem;"><strong style="color: var(--success);">⭐ Top 20 Opciones por Score:</strong></div>';
            html += '<div style="max-height: 400px; overflow-y: auto; margin-top: 0.5rem;">';
            html += '<table class="data-table" style="font-size: 12px;">';
            html += '<thead><tr><th>Rank</th><th>Símbolo</th><th>Tipo</th><th>Strike</th><th>Score</th><th>Volumen</th><th>Spread %</th><th>Theta</th><th>Prob ITM</th></tr></thead><tbody>';
            
            opcionesConScore.slice(0, 20).forEach((op, index) => {
                const spread = op.precioOpcion > 0 ? (((op.ask || 0) - (op.bid || 0)) / op.precioOpcion * 100).toFixed(2) : 'N/A';
                html += '<tr>';
                html += `<td>${index + 1}</td>`;
                html += `<td>${op.simbolo || 'N/A'}</td>`;
                html += `<td>${op.tipoOpcion || 'N/A'}</td>`;
                html += `<td>$${formatearStrike(op.strike || 0)}</td>`;
                html += `<td><strong>${op.score.toFixed(2)}</strong></td>`;
                html += `<td>${(op.volumenNominal || 0).toLocaleString('es-AR')}</td>`;
                html += `<td>${spread}%</td>`;
                html += `<td>${(Math.abs(op.Theta || 0)).toFixed(2)}</td>`;
                html += `<td>${((op.Prob_ITM || op.MC_ProbITM || 0) * 100).toFixed(1)}%</td>`;
                html += '</tr>';
            });
            
            html += '</tbody></table></div>';
            resultadoDiv.style.display = 'block';
            resultadoDiv.innerHTML = html;
        }
        
        function aplicarFiltroLiquidez() {
            if (!resultados || !resultados.dfProcesado) {
                alert('No hay datos disponibles. Por favor ejecutá el análisis primero.');
                return;
            }
            
            const df = resultados.dfProcesado;
            const filtradas = df.filter(row => {
                const volumen = row.volumenNominal || 0;
                const bid = row.bid || 0;
                const ask = row.ask || 0;
                const precio = row.precioOpcion || 0;
                const spread = precio > 0 ? ((ask - bid) / precio * 100) : 100;
                const vega = Math.abs(row.Vega || 0);
                
                return volumen > 100 && spread < 10 && vega < 1000;
            });
            
            const resultadoDiv = document.getElementById('resultado-filtrado');
            resultadoDiv.style.display = 'block';
            resultadoDiv.innerHTML = '<strong style="color: var(--success);">✓ Filtro aplicado:</strong> ' + 
                filtradas.length + ' de ' + df.length + ' opciones cumplen los criterios de liquidez y viabilidad. ' +
                '<button onclick="mostrarOpcionesFiltradas()" style="margin-left: 0.5rem; padding: 0.25rem 0.5rem; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); cursor: pointer; font-size: 11px;">Ver detalles</button>';
            
            // Guardar resultados filtrados
            window.opcionesFiltradas = filtradas;
        }
        
        function mostrarOpcionesFiltradas() {
            if (!window.opcionesFiltradas || window.opcionesFiltradas.length === 0) {
                aplicarFiltroLiquidez();
                if (!window.opcionesFiltradas || window.opcionesFiltradas.length === 0) {
                    alert('No hay opciones que cumplan los criterios de filtrado.');
                    return;
                }
            }
            
            const filtradas = window.opcionesFiltradas;
            let html = '<div style="max-height: 400px; overflow-y: auto; margin-top: 1rem;">' +
                '<table class="data-table" style="font-size: 11px;">' +
                '<thead><tr>' +
                '<th>Símbolo</th><th>Tipo</th><th>Strike</th><th>Volumen</th><th>Spread %</th><th>Vega</th><th>Monto</th>' +
                '</tr></thead><tbody>';
            
            filtradas.forEach(row => {
                const bid = row.bid || 0;
                const ask = row.ask || 0;
                const precio = row.precioOpcion || 0;
                const spread = precio > 0 ? ((ask - bid) / precio * 100).toFixed(2) : '0.00';
                const vega = Math.abs(row.Vega || 0).toFixed(2);
                
                html += '<tr>' +
                    '<td>' + (row.simbolo || 'N/A') + '</td>' +
                    '<td>' + (row.tipoOpcion || 'N/A') + '</td>' +
                    '<td>$' + formatearStrike(row.strike || 0) + '</td>' +
                    '<td>' + ((row.volumenNominal || 0).toLocaleString('es-AR')) + '</td>' +
                    '<td>' + spread + '%</td>' +
                    '<td>' + vega + '</td>' +
                    '<td>$' + ((row.montoOperado || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + '</td>' +
                    '</tr>';
            });
            
            html += '</tbody></table></div>';
            
            const resultadoDiv = document.getElementById('resultado-filtrado');
            resultadoDiv.style.display = 'block';
            resultadoDiv.innerHTML = '<strong style="color: var(--accent-primary);">📊 Opciones Filtradas (' + filtradas.length + '):</strong>' + html;
        }
        
        function calcularScores() {
            if (!resultados || !resultados.dfProcesado) {
                alert('No hay datos disponibles. Por favor ejecutá el análisis primero.');
                return;
            }
            
            const df = resultados.dfProcesado;
            const opcionesConScore = df.map(row => {
                const volumen = row.volumenNominal || 0;
                const bid = row.bid || 0;
                const ask = row.ask || 0;
                const precio = row.precioOpcion || 0;
                const spread = precio > 0 ? ((ask - bid) / precio * 100) : 100;
                const theta = Math.abs(row.Theta || 0);
                const probITM = (row.Prob_ITM || row.MC_ProbITM || 0) * 100;
                
                // Calcular componentes del score
                const scoreVolumen = Math.min((volumen / 1000) * 0.3, 0.3);
                const scoreSpread = spread > 0 ? (1 / spread) * 0.2 : 0;
                const scoreTheta = Math.min((theta / 10) * 0.2, 0.2);
                
                // Prob_ITM_apropiada: para ventas usar (100 - Prob_ITM), para compras usar Prob_ITM
                // Asumimos que si Delta < 0.3 es para venta, si Delta > 0.7 es para compra
                const delta = Math.abs(row.Delta || 0);
                const probApropiada = delta < 0.3 ? (100 - probITM) / 100 : 
                                     delta > 0.7 ? probITM / 100 : probITM / 100;
                const scoreProb = probApropiada * 0.3;
                
                const scoreTotal = scoreVolumen + scoreSpread + scoreTheta + scoreProb;
                
                return {
                    ...row,
                    score: scoreTotal,
                    scoreVolumen: scoreVolumen,
                    scoreSpread: scoreSpread,
                    scoreTheta: scoreTheta,
                    scoreProb: scoreProb
                };
            });
            
            // Ordenar por score descendente
            opcionesConScore.sort((a, b) => (b.score || 0) - (a.score || 0));
            
            // Mostrar top 20
            const top20 = opcionesConScore.slice(0, 20);
            let html = '<div style="max-height: 400px; overflow-y: auto; margin-top: 1rem;">' +
                '<table class="data-table" style="font-size: 11px;">' +
                '<thead><tr>' +
                '<th>Rank</th><th>Símbolo</th><th>Tipo</th><th>Strike</th><th>Score</th><th>Vol</th><th>Spread</th><th>Theta</th><th>Prob</th>' +
                '</tr></thead><tbody>';
            
            top20.forEach((row, idx) => {
                const colorScore = row.score > 0.5 ? 'var(--success)' : row.score > 0.3 ? 'var(--warning)' : 'var(--text-secondary)';
                html += '<tr>' +
                    '<td><strong>' + (idx + 1) + '</strong></td>' +
                    '<td>' + (row.simbolo || 'N/A') + '</td>' +
                    '<td>' + (row.tipoOpcion || 'N/A') + '</td>' +
                    '<td>$' + formatearStrike(row.strike || 0) + '</td>' +
                    '<td style="color: ' + colorScore + '; font-weight: 600;">' + (row.score || 0).toFixed(3) + '</td>' +
                    '<td>' + (row.scoreVolumen || 0).toFixed(3) + '</td>' +
                    '<td>' + (row.scoreSpread || 0).toFixed(3) + '</td>' +
                    '<td>' + (row.scoreTheta || 0).toFixed(3) + '</td>' +
                    '<td>' + (row.scoreProb || 0).toFixed(3) + '</td>' +
                    '</tr>';
            });
            
            html += '</tbody></table></div>';
            
            const resultadoDiv = document.getElementById('resultado-filtrado');
            resultadoDiv.style.display = 'block';
            resultadoDiv.innerHTML = '<strong style="color: var(--accent-primary);">⭐ Top 20 Opciones por Score:</strong><br>' +
                '<small style="color: var(--text-secondary);">Score = (Volumen/1000 × 0.3) + (1/Spread% × 0.2) + (Theta/10 × 0.2) + (Prob_ITM_apropiada × 0.3)</small>' + html;
            
            // Guardar resultados con score
            window.opcionesConScore = opcionesConScore;
        }
        
        function ordenarTabla(columna) {
            const tbody = document.querySelector('#tabla-opciones tbody');
            if (!tbody) return;
            
            const filas = Array.from(tbody.querySelectorAll('tr'));
            const esAscendente = ordenActual[columna] !== 'asc';
            ordenActual[columna] = esAscendente ? 'asc' : 'desc';
            
            // Limpiar clases de ordenamiento
            document.querySelectorAll('#tabla-opciones th').forEach(th => {
                th.classList.remove('sorting_asc', 'sorting_desc');
            });
            
            // Agregar clase al header actual
            const header = Array.from(document.querySelectorAll('#tabla-opciones th')).find(th => 
                th.getAttribute('onclick') && th.getAttribute('onclick').includes(columna)
            );
            if (header) {
                header.classList.add(esAscendente ? 'sorting_asc' : 'sorting_desc');
            }
            
            filas.sort((a, b) => {
                const valA = obtenerValorCelda(a, columna);
                const valB = obtenerValorCelda(b, columna);
                
                if (typeof valA === 'string' && typeof valB === 'string') {
                    return esAscendente ? valA.localeCompare(valB) : valB.localeCompare(valA);
                }
                
                const numA = parseFloat(valA) || 0;
                const numB = parseFloat(valB) || 0;
                return esAscendente ? numA - numB : numB - numA;
            });
            
            tbody.innerHTML = '';
            filas.forEach(fila => tbody.appendChild(fila));
        }
        
        function obtenerValorCelda(fila, columna) {
            const headers = Array.from(document.querySelectorAll('#tabla-opciones th'));
            const index = headers.findIndex(th => 
                th.getAttribute('onclick') && th.getAttribute('onclick').includes(columna)
            );
            if (index === -1) return '';
            const celda = fila.children[index];
            if (!celda) return '';
            
            let valor = celda.textContent.trim();
            
            // Limpiar formato de números argentinos (quitar puntos y comas)
            if (columna === 'cantidadOperaciones' || columna === 'volumenNominal' || columna === 'montoOperado') {
                // Remover puntos de miles y reemplazar coma decimal por punto
                valor = valor.replace(/\./g, '').replace(',', '.');
                return parseFloat(valor) || 0;
            }
            
            // Para porcentajes y otros campos numéricos
            if (columna === 'volatilidadImplicita' || columna === 'Prob_ITM' || columna === 'MC_ProbProfit') {
                valor = valor.replace('%', '').replace(/\./g, '').replace(',', '.');
                return parseFloat(valor) || 0;
            }
            
            // Para campos monetarios
            if (columna === 'precioOpcion' || columna === 'bid' || columna === 'ask' || 
                columna === 'BlackScholes' || columna === 'Binomial' || columna === 'VaR' || columna === 'CVaR_95') {
                valor = valor.replace('$', '').replace(/\./g, '').replace(',', '.');
                return parseFloat(valor) || 0;
            }
            
            // Para Greeks (Delta, Gamma, Vega, Theta)
            if (['Delta', 'Gamma', 'Vega', 'Theta'].includes(columna)) {
                valor = valor.replace(/\./g, '').replace(',', '.');
                return parseFloat(valor) || 0;
            }
            
            return valor;
        }

        function aplicarFiltros() {
            const filtroTipo = document.getElementById('filtro-tipo').value;
            const ordenarPor = document.getElementById('ordenar-por').value;
            let dfFiltrado = [...resultados.dfProcesado];
            const precioSpot = resultados.precioSpot || CONFIG.precio_spot || 0;

            // Check if MM filtering is enabled
            const mmMode = document.getElementById('mm-mode')?.checked || false;
            
            if (mmMode) {
                // ── Paso 1: limpieza básica de incoherencias matemáticas ──
                dfFiltrado = limpiarDataIncoherente(dfFiltrado, precioSpot);

                // ── Paso 2: LIQUIDEZ — al menos uno de los tres indicadores ──
                // No exigir TODOS — en mercados poco líquidos como acciones arg
                // muchas opciones operables tienen volumen = 0 en nominales pero
                // sí tienen monto operado (operaciones grandes en lotes)
                dfFiltrado = dfFiltrado.filter(row => {
                    const vol    = row.volumenNominal       || 0;
                    const monto  = row.montoOperado         || 0;
                    const ops    = row.cantidadOperaciones  || 0;
                    return (vol > 0 || monto > 0 || ops > 0);
                });

                // ── Paso 3: SPREAD BID/ASK operable ──
                // Eliminar solo si tenemos bid Y ask Y el spread es ridículo (>50%)
                // No eliminar si bid/ask = 0 (puede ser que no se cargaron, no que no existan)
                dfFiltrado = dfFiltrado.filter(row => {
                    const bid = row.bid || 0;
                    const ask = row.ask || 0;
                    const mid = row.precioOpcion || 0;
                    if (bid > 0 && ask > 0 && mid > 0) {
                        const spreadPct = (ask - bid) / mid;
                        return spreadPct <= 0.50; // spread hasta 50% — permisivo para este mercado
                    }
                    return true; // sin datos de bid/ask: no eliminar
                });

                // ── Paso 4: ZONA OPERABLE — ATM ±20% ──
                // El rango 85%-115% anterior era demasiado estrecho en combinación
                // con los demás filtros. 80%-120% es más realista para acciones arg.
                dfFiltrado = dfFiltrado.filter(row => {
                    const ratio = (row.strike || 0) / precioSpot;
                    return ratio >= 0.80 && ratio <= 1.20;
                });

                // ── Paso 5: VALOR TEMPORAL — recalculado localmente, mínimo real ──
                // Usar 1% mínimo (no 5%) — el 5% eliminaba opciones OTM cercanas
                // que son exactamente las más interesantes para spreads
                dfFiltrado = dfFiltrado.filter(row => {
                    const prima = row.precioOpcion || 0;
                    if (prima <= 0) return false;
                    const vi = row.tipoOpcion === 'Put'
                        ? Math.max(0, (row.strike || 0) - precioSpot)
                        : Math.max(0, precioSpot - (row.strike || 0));
                    const vt = Math.max(0, prima - vi);
                    // Para OTM: vi = 0, entonces vt = prima (100% valor temporal = ideal)
                    // Para ITM: exigir al menos 1% de valor temporal sobre la prima
                    const pctVT = prima > 0 ? vt / prima : 0;
                    return pctVT >= 0.01;
                });

                // ── Paso 6: PRIMA MÍNIMA OPERABLE ──
                // Filtrar centavos que no se pueden ejecutar en la práctica
                // Umbral: prima >= 0.05 (ajustar según el subyacente)
                dfFiltrado = dfFiltrado.filter(row => {
                    return (row.precioOpcion || 0) >= 0.05;
                });

                // ── Paso 7: PROBABILIDAD DE GANANCIA MÍNIMA ──
                // Excluir opciones con muy baja probabilidad de profit
                dfFiltrado = dfFiltrado.filter(row => {
                    const probProfit = (row.MC_ProbProfit || 0) * 100; // Convertir a porcentaje
                    return probProfit >= 10.0; // Mínimo 10% de probabilidad de profit (más realista)
                });

                // ── Paso 8: VENCIMIENTO MÍNIMO ──
                // Excluir opciones que vencen muy pronto (menos de 3 días)
                dfFiltrado = dfFiltrado.filter(row => {
                    const fechaVenc = row.fechaVencimiento || '';
                    if (!fechaVenc) return false;
                    
                    const hoy = new Date();
                    const venc = new Date(fechaVenc);
                    const diasRestantes = Math.ceil((venc - hoy) / (1000 * 60 * 60 * 24));
                    
                    return diasRestantes >= 3; // Mínimo 3 días para operar (más flexible)
                });

                // ── Paso 9: VALOR TEMPORAL MÍNIMO MEJORADO ──
                // Para opciones OTM cercanas, exigir más valor temporal
                dfFiltrado = dfFiltrado.filter(row => {
                    const prima = row.precioOpcion || 0;
                    const vi = row.tipoOpcion === 'Put'
                        ? Math.max(0, (row.strike || 0) - precioSpot)
                        : Math.max(0, precioSpot - (row.strike || 0));
                    const vt = Math.max(0, prima - vi);
                    const pctVT = prima > 0 ? vt / prima : 0;
                    
                    // Para OTM: exigir al menos 2% de valor temporal (más realista)
                    // Para ITM: mantener el 1% original
                    const esOTM = (row.tipoOpcion === 'Put' && (row.strike || 0) < precioSpot) ||
                               (row.tipoOpcion === 'Call' && (row.strike || 0) > precioSpot);
                    
                    return esOTM ? pctVT >= 0.02 : pctVT >= 0.01;
                });
            }

            const traderMode = document.getElementById('trader-mode')?.checked || false;

            if (traderMode) {
                // Apply Trader expert filtering
                dfFiltrado = dfFiltrado.filter(row => {
                    const strike = row.strike || 0;
                    const prima = row.precioOpcion || 0;
                    const tipo = row.tipoOpcion;
                    const delta = row.Delta || 0;
                    const vega = row.Vega || 0;
                    const theta = row.Theta || 0;
                    const monto = row.montoOperado || 0;
                    const volumen = row.volumenNominal || 0;
                    const iv = row.volatilidadImplicita ?? row.volatilidadSubyacente ?? 0;
                    const bid = row.bid || 0;
                    const ask = row.ask || 0;
                    
                    // 1. LIQUIDEZ REAL — solo opciones que se operaron
                    if (monto === 0 && volumen === 0) return false;
                    if (prima <= 0) return false;
                    
                    // 2. SPREAD BID/ASK razonable (< 15% del midprice)
                    if (bid > 0 && ask > 0) {
                        const mid = (bid + ask) / 2;
                        if ((ask - bid) / mid > 0.15) return false;
                    }
                    
                    // 3. ZONA OPERABLE: ATM ±15% del spot
                    const moneyness = strike / precioSpot;
                    if (moneyness < 0.85 || moneyness > 1.15) return false;
                    
                    // 4. REGLA CLAVE: NO PUTS ITM (el trader lo dice explícitamente)
                    //    Put ITM = strike > spot → máxima Vega, mala relación riesgo/beneficio
                    if (tipo === 'Put' && strike > precioSpot * 1.005) return false;
                    
                    // 5. VALOR TEMPORAL REAL (recalculado desde spot, no de la API)
                    const vi = tipo === 'Put'
                        ? Math.max(0, strike - precioSpot)
                        : Math.max(0, precioSpot - strike);
                    const vt = Math.max(0, prima - vi);
                    const pctVT = prima > 0 ? vt / prima : 0;
                    // Para Puts OTM: toda la prima = valor temporal (ideal)
                    // Mínimo 15% valor temporal sobre la prima
                    if (pctVT < 0.15) return false;
                    
                    // 6. GRIEGAS COHERENTES
                    if (tipo === 'Put') {
                        if (delta >= 0) return false; // delta de put debe ser negativo
                        const absDelta = Math.abs(delta);
                        // Delta entre -0.10 y -0.60 = zona operable para put spread
                        if (absDelta < 0.10 || absDelta > 0.65) return false;
                    }
                    if (tipo === 'Call') {
                        if (delta <= 0) return false;
                        if (delta < 0.10 || delta > 0.65) return false;
                    }
                    if (vega <= 0) return false;   // vega debe ser positiva
                    if (theta >= 0) return false;  // theta negativo = pierde valor temporal (normal para long)
                    
                    // 7. IV CONFIABLE — detectar el 61% hardcodeado
                    if (Math.abs(iv - 0.61) < 0.001 && monto === 0 && volumen === 0) return false;
                    if (iv < 0.05 || iv > 2.0) return false;
                    
                    // 8. PROB ITM en rango operable: entre 15% y 60%
                    //    <15% = demasiado OTM (necesitas un crash)
                    //    >60% = casi ITM = mucha prima en riesgo
                    const probITM = row.Prob_ITM || 0;
                    if (probITM < 0.15 || probITM > 0.60) return false;
                    
                    return true;
                });
                
                // Actualizar descripción de filtros activos
                const resumenDiv = document.getElementById('filtro-estado');
                if (resumenDiv) {
                    if (mmMode) {
                        resumenDiv.innerHTML = `
                        <div style="font-weight:500;margin-bottom:0.5rem;">🔍 Filtros MM Activos:</div>
                        <div style="font-size:0.85rem;line-height:1.6;">
                            • <strong>Liquidez:</strong> Vol > 0 ó Monto > 0 ó Operaciones > 0<br>
                            • <strong>Spread Bid/Ask:</strong> ≤ 50% del midprice (permisivo para mercado arg)<br>
                            • <strong>Zona operable:</strong> Strike entre 80% y 120% del spot<br>
                            • <strong>Valor temporal:</strong> OTM ≥ 2% / ITM ≥ 1% de la prima<br>
                            • <strong>Prob. Profit:</strong> ≥ 10% (más realista para mercado arg)<br>
                            • <strong>Vencimiento:</strong> ≥ 3 días (más flexible para operar)<br>
                            • <strong>Prima mínima:</strong> ≥ $0.05 (ejecutable en la práctica)<br>
                            • <strong>Paridad:</strong> precio ≥ valor intrínseco × 0.98
                        </div>`;
                    } else if (traderMode) {
                        resumenDiv.innerHTML = `
                        <div style="font-weight:500;margin-bottom:0.5rem;">Modo Trader Activo:</div>
                        <div style="font-size:0.85rem;line-height:1.6;">
                            • <strong>Liquidez:</strong> Monto Operado > 0 ó Volumen > 0<br>
                            • <strong>Spread Bid/Ask:</strong> &lt; 15% del midprice<br>
                            • <strong>Zona operable:</strong> Strike entre 85%-115% del spot<br>
                            • <strong style="color:#f44336;">⚠️ NO Puts ITM</strong> (strike > spot): máxima Vega, peor perfil riesgo/retorno<br>
                            • <strong>Valor Temporal:</strong> &gt; 15% de la prima (recalculado localmente)<br>
                            • <strong>Delta:</strong> entre 0.10 y 0.65 en módulo (zona operable)<br>
                            • <strong>Prob ITM:</strong> entre 15% y 60% (ni demasiado OTM ni ITM)
                        </div>`;
                    } else {
                        resumenDiv.innerHTML = `
                        <div style="font-weight:500;margin-bottom:0.25rem;">📋 Sin filtros adicionales</div>
                        <div style="font-size:0.85rem;opacity:0.7;">Mostrando todas las opciones con precio > 0</div>`;
                    }
                }
            } else {
                // Show all options with basic filtering only
                // 1. Remove options with zero price
                dfFiltrado = dfFiltrado.filter(row => {
                    const prima = row.precioOpcion || 0;
                    return prima > 0;
                });

                // 2. Remove options with invalid data
                dfFiltrado = dfFiltrado.filter(row => {
                    const strike = row.strike || 0;
                    return strike > 0;
                });
            }

            // Aplicar filtro de tipo si no es "Todos"
            if (filtroTipo !== 'Todos') {
                dfFiltrado = dfFiltrado.filter(r => r.tipoOpcion === filtroTipo);
            }

            dfFiltrado.sort((a, b) => {
                const valA = a[ordenarPor] || 0;
                const valB = b[ordenarPor] || 0;
                return valB - valA;
            });

            // Actualizar tabla
            const tbody = document.querySelector('#tabla-opciones tbody');
            if (tbody) {
                tbody.innerHTML = '';
                dfFiltrado.forEach(row => {
                    // Calcular status ITM/OTM localmente (no confiar en el campo de la API)
                    const spot = resultados.precioSpot || CONFIG.precio_spot || 0;
                    const esITM_put = row.tipoOpcion === 'Put' && row.strike > spot;
                    const esITM_call = row.tipoOpcion === 'Call' && row.strike < spot;
                    const esITM = esITM_put || esITM_call;
                    const distanciaPct = Math.abs(row.strike - spot) / spot * 100;
                    const esATM = distanciaPct < 1.0;

                    let statusLabel, statusColor, statusBg;
                    if (esATM) {
                        statusLabel = 'ATM';
                        statusColor = '#64b5f6'; statusBg = 'rgba(33,150,243,0.15)';
                    } else if (esITM) {
                        statusLabel = `ITM ${distanciaPct.toFixed(1)}%`;
                        statusColor = '#ff9800'; statusBg = 'rgba(255,152,0,0.12)';
                        // Advertencia especial para Puts ITM (regla del trader)
                        if (row.tipoOpcion === 'Put') {
                            statusLabel = `⚠️ ITM ${distanciaPct.toFixed(1)}%`;
                            statusColor = '#f44336'; statusBg = 'rgba(244,67,54,0.12)';
                        }
                    } else {
                        statusLabel = `OTM ${distanciaPct.toFixed(1)}%`;
                        statusColor = '#81c784'; statusBg = 'rgba(76,175,80,0.12)';
                    }

                    const moneynessCell = `<td><span style="background:${statusBg};color:${statusColor};
                        padding:2px 7px;border-radius:4px;font-size:0.8rem;font-weight:600;white-space:nowrap;">
                        ${statusLabel}</span></td>`;

                    const tr = document.createElement('tr');
                    tr.innerHTML = 
                        '<td>' + (row.simbolo || 'N/A') + '</td>' +
                        '<td>' + (row.tipoOpcion || 'N/A') + '</td>' +
                        '<td>' + formatearStrike(row.strike || 0) + '</td>' +
                        moneynessCell +
                        '<td>' + formatearFechaVencimiento(row.fechaVencimiento || '') + '</td>' +
                        '<td>$' + ((row.precioOpcion || 0).toFixed(2)) + '</td>' +
                        '<td>$' + ((row.bid || 0).toFixed(2)) + '</td>' +
                        '<td>$' + ((row.ask || 0).toFixed(2)) + '</td>' +
                        '<td>' + ((row.volumenNominal || 0).toLocaleString('es-AR')) + '</td>' +
                        '<td>$' + ((row.montoOperado || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + '</td>' +
                        '<td>' + ((row.cantidadOperaciones || 0).toLocaleString('es-AR')) + '</td>' +
                        '<td>' + (row.volatilidadImplicita != null ? ((row.volatilidadImplicita * 100).toFixed(2) + '%') : 'N/D') + '</td>' +
                        '<td>$' + ((row.BlackScholes || 0).toFixed(2)) + '</td>' +
                        '<td>$' + ((row.Binomial || 0).toFixed(2)) + '</td>' +
                        '<td>' + ((row.Delta || 0).toFixed(4)) + '</td>' +
                        '<td>' + ((row.Gamma || 0).toFixed(4)) + '</td>' +
                        '<td>' + ((row.Vega || 0).toFixed(4)) + '</td>' +
                        '<td>' + ((row.Theta || 0).toFixed(4)) + '</td>' +
                        '<td>' + (((row.Prob_ITM || 0) * 100).toFixed(2)) + '%</td>' +
                        '<td>' + (((row.MC_ProbProfit || 0) * 100).toFixed(2)) + '%</td>' +
                        '<td>$' + ((row.VaR || 0).toFixed(2)) + '</td>' +
                        '<td>$' + ((row.CVaR_95 || 0).toFixed(2)) + '</td>';
                    tbody.appendChild(tr);
                });
            }

            // Actualizar resumen de filtros
            const resumenDiv = document.getElementById('filtro-resumen');
            if (resumenDiv) {
                const totalOriginal = resultados.dfProcesado.length;
                const totalFiltrado = dfFiltrado.length;
                const eliminados = totalOriginal - totalFiltrado;
                resumenDiv.innerHTML = `📊 <strong>${totalFiltrado}</strong> opciones válidas de <strong>${totalOriginal}</strong> totales (${eliminados} filtradas)`;
            }
        }

        // MM Rigorous Data Cleaning Function
        function limpiarDataIncoherente(opciones, spot) {
    return opciones.filter(opt => {
        const k      = parseFloat(opt.strike) || 0;
        const p      = parseFloat(opt.precioOpcion) || 0;
        const tipo   = opt.tipoOpcion;
        const delta  = parseFloat(opt.Delta) || 0;
        const bid    = parseFloat(opt.bid) || 0;
        const ask    = parseFloat(opt.ask) || 0;

        // 1. Precio y strike deben existir
        if (p <= 0 || k <= 0) return false;

        // 2. Valor intrínseco recalculado localmente (NO de la API)
        const vi = tipo === 'Put'
            ? Math.max(0, k - spot)
            : Math.max(0, spot - k);

        // 3. Paridad put-call: precio no puede ser menor al VI * 0.98
        //    (margen del 2% para bid/ask y costos)
        if (p < vi * 0.98) return false;

        // 4. Delta coherente con tipo (signo)
        if (tipo === 'Put'  && delta > 0.01)  return false;
        if (tipo === 'Call' && delta < -0.01) return false;

        // 5. Bid/ask coherentes: ask >= bid >= 0
        if (ask > 0 && bid > 0 && bid > ask) return false;

        // 6. No eliminar por IV — el problema del 61% hardcodeado
        //    se maneja mostrando un warning, no eliminando la opción
        //    (sería eliminar la mayoría de los datos)

        return true;
    });
}

        // MM Probability Recalculation using ATM IV
        function recalcularProbabilidadITM(opcion, spot, medianIV) {
            const strike = parseFloat(opcion.strike) || 0;
            const tipo = opcion.tipoOpcion;
            const T = opcion.T || 30/365; // Default 30 days
            
            if (medianIV <= 0 || T <= 0) return 0.5;
            
            // Standard normal distribution using ATM IV
            const d1 = tipo === 'Put' 
                ? (Math.log(spot / strike) + (0.5 * medianIV * medianIV * T)) / (medianIV * Math.sqrt(T))
                : (Math.log(spot / strike) - (0.5 * medianIV * medianIV * T)) / (medianIV * Math.sqrt(T));
            
            // Approximate normal CDF
            const normalCDF = (x) => {
                const t = 1 / (1 + 0.2316419 * Math.abs(x));
                const d = 0.3989423 * Math.exp(-x * x / 2);
                const prob = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
                return x > 0 ? 1 - prob : prob;
            };
            
            if (tipo === 'Put') {
                return normalCDF(-d1);
            } else {
                return normalCDF(d1);
            }
        }

        // Auto-Spread Functionality for Put Spreads with MM Edge Calculation
        function generarAutoPutSpread() {
            if (!resultados || !resultados.dfProcesado) {
                alert('No hay datos. Ejecutá el análisis primero.');
                return;
            }

            const spot = resultados.precioSpot || CONFIG.precio_spot || 0;
            const hoy = new Date();

            // === PASO 1: Filtrar solo Puts con liquidez real ===
            const puts = resultados.dfProcesado.filter(row => {
                if (row.tipoOpcion !== 'Put') return false;
                if ((row.precioOpcion || 0) <= 0) return false;
                
                // Liquidez real: debe tener monto operado O volumen
                const tieneVolumen = (row.volumenNominal || 0) > 0;
                const tieneMonto = (row.montoOperado || 0) > 0;
                if (!tieneVolumen && !tieneMonto) return false;
                
                return true;
            });

            // === PASO 2: Calcular DTE y filtrar ≤ 14 días ===
            function getDTE(row) {
                if (row.fechaVencimiento) {
                    const venc = new Date(row.fechaVencimiento);
                    return Math.ceil((venc - hoy) / (1000 * 60 * 60 * 24));
                }
                // Fallback: usar T si existe (en años → días)
                if (row.T) return Math.round(row.T * 365);
                return 999;
            }

            const putsCortoplazo = puts.filter(row => {
                const dte = getDTE(row);
                return dte >= 1 && dte <= 14;
            });

            if (putsCortoplazo.length < 2) {
                mostrarResultadosAutoSpread([], 
                    '⚠️ No hay suficientes Puts con liquidez y DTE ≤ 14 días para armar spreads.');
                return;
            }

            // === PASO 3: Clasificar en Long Leg y Short Leg ===
            // Long Leg: OTM más cercano al spot por debajo
            // = Puts con strike entre 90% y 100% del spot (OTM, pero cerca)
            // EXCLUIR ITM (strike > spot) — regla del trader
            
            const longLegCandidates = putsCortoplazo.filter(row => {
                const moneyness = row.strike / spot;
                // OTM: strike < spot. Cercano: entre 90% y 99.9% del spot
                return moneyness >= 0.90 && moneyness < 1.00;
            }).sort((a, b) => b.strike - a.strike); // ordenar: el más cercano primero

            // Short Leg: más OTM = el "objetivo bajista"
            // = Puts con strike entre 75% y 92% del spot (nivel técnico de soporte)
            const shortLegCandidates = putsCortoplazo.filter(row => {
                const moneyness = row.strike / spot;
                return moneyness >= 0.75 && moneyness < 0.92;
            });

            const spreads = [];

            // === PASO 4: Generar combinaciones válidas ===
            longLegCandidates.forEach(longLeg => {
                const dteLong = getDTE(longLeg);
                
                shortLegCandidates.forEach(shortLeg => {
                    const dteShort = getDTE(shortLeg);
                    
                    // Mismo vencimiento (o muy cercano, ±3 días)
                    if (Math.abs(dteLong - dteShort) > 3) return;
                    
                    // Short leg debe tener strike MENOR que long leg
                    if (shortLeg.strike >= longLeg.strike) return;
                    
                    // Ancho del spread: mínimo 2%, máximo 15% del spot
                    const anchoSpread = longLeg.strike - shortLeg.strike;
                    const anchoPct = anchoSpread / spot;
                    if (anchoPct < 0.02 || anchoPct > 0.15) return;

                    // === Precios: usar ASK para comprar, BID para vender ===
                    const precioCompra = (longLeg.ask > 0) ? longLeg.ask : longLeg.precioOpcion * 1.02;
                    const precioVenta  = (shortLeg.bid > 0) ? shortLeg.bid : shortLeg.precioOpcion * 0.98;
                    
                    // Costo neto del spread (lo que pagamos)
                    const costoNeto = precioCompra - precioVenta;
                    if (costoNeto <= 0) return; // spread crédito en put spread = error
                    if (costoNeto > anchoSpread) return; // costo > ancho = no tiene sentido
                    
                    // === Métricas del spread ===
                    const maxGanancia = anchoSpread - costoNeto;
                    const maxPerdida  = costoNeto;
                    const breakeven   = longLeg.strike - costoNeto;
                    const ratioBajarNecesario = (spot - breakeven) / spot * 100; // % que debe caer
                    const ratioRR = maxGanancia / maxPerdida;
                    
                    // Filtro mínimo de calidad: R/R >= 1.5 (gana al menos 1.5x lo que arriesga)
                    if (ratioRR < 1.5) return;
                    
                    // === Probabilidad de profit (usando delta como proxy) ===
                    // La delta de la long put ≈ -P(ITM) de la long put
                    // P(profit) ≈ P(S_T < breakeven) ≈ interpolado
                    const deltaLong = Math.abs(longLeg.Delta || 0);
                    const deltaShort = Math.abs(shortLeg.Delta || 0);
                    // Prob de que caiga hasta breakeven (entre ambas deltas)
                    const probProfit = deltaShort + (deltaLong - deltaShort) * 
                                       ((longLeg.strike - breakeven) / anchoSpread);
                    
                    // === Valor temporal de la long leg (debe ser sustancial) ===
                    const viLong = Math.max(0, spot - longLeg.strike); // Para put OTM = 0
                    const vtLong = longLeg.precioOpcion - viLong;
                    const pctVT = longLeg.precioOpcion > 0 ? vtLong / longLeg.precioOpcion : 0;
                    // Como es OTM, toda la prima ES valor temporal — esto es ideal
                    
                    spreads.push({
                        longLeg,
                        shortLeg,
                        dte: dteLong,
                        costoNeto,
                        maxGanancia,
                        maxPerdida,
                        anchoSpread,
                        breakeven,
                        ratioBajarNecesario,
                        ratioRR,
                        probProfit,
                        pctValorTemporal: pctVT,
                        // Score compuesto: premia R/R alto y prob ganancia
                        score: ratioRR * 0.6 + probProfit * 0.4
                    });
                });
            });

            // === PASO 5: Ordenar por score y mostrar top 5 ===
            spreads.sort((a, b) => b.score - a.score);
            mostrarResultadosAutoSpread(spreads.slice(0, 5));
        }

        function mostrarResultadosAutoSpread(spreads, mensajeVacio) {
    let container = document.getElementById('auto-spread-results');
    if (!container) {
        container = document.createElement('div');
        container.id = 'auto-spread-results';
        document.querySelector('.tab-content.active').appendChild(container);
    }

    if (spreads.length === 0) {
        container.innerHTML = `
            <div style="padding:1rem; background:rgba(255,152,0,0.1); border-left:4px solid #ff9800; 
                        border-radius:6px; color:#ff9800; margin-bottom:1rem;">
                ${mensajeVacio || '⚠️ No se encontraron Put Spreads que cumplan los criterios del trader.'}
                <br><small style="opacity:0.8;">Criterios: DTE ≤ 14 días · Long Put OTM cercana · Short Put objetivo bajista · R/R ≥ 1.5</small>
            </div>`;
        return;
    }

    let html = `
    <div style="margin-bottom:0.75rem; padding:0.75rem; background:rgba(33,150,243,0.08); 
                border-left:4px solid #2196f3; border-radius:6px; font-size:0.85rem; color:#90caf9;">
        <strong>🎯 Criterio Trader:</strong> Put Spread corto plazo (≤14 DTE) · Long Put OTM más cercana al spot · 
        Short Put en objetivo bajista · R/R ≥ 1.5 · Usando BID/ASK real
    </div>
    <div class="data-table-wrapper">
    <table class="data-table">
    <thead><tr>
        <th>DTE</th>
        <th>Long Put (compra)</th>
        <th>Short Put (vende)</th>
        <th>Costo Neto</th>
        <th>Ancho Spread</th>
        <th>Max Ganancia</th>
        <th>Max Pérdida</th>
        <th>Breakeven</th>
        <th>Debe caer</th>
        <th>R/R</th>
        <th>Prob Profit</th>
        <th>Score</th>
    </tr></thead><tbody>`;

    spreads.forEach(s => {
        const rrColor = s.ratioRR >= 3 ? '#4caf50' : s.ratioRR >= 2 ? '#8bc34a' : '#ff9800';
        const probColor = s.probProfit >= 0.40 ? '#4caf50' : s.probProfit >= 0.25 ? '#ff9800' : '#f44336';
        
        html += `<tr>
            <td><span style="background:rgba(33,150,243,0.15);color:#64b5f6;padding:2px 7px;
                border-radius:4px;font-weight:bold;">${s.dte}d</span></td>
            <td>
                <strong>K ${s.longLeg.strike.toFixed(1)}</strong><br>
                <small>Ask: $${(s.longLeg.ask || s.longLeg.precioOpcion).toFixed(2)} · 
                Δ ${(s.longLeg.Delta || 0).toFixed(2)}</small>
            </td>
            <td>
                <strong>K ${s.shortLeg.strike.toFixed(1)}</strong><br>
                <small>Bid: $${(s.shortLeg.bid || s.shortLeg.precioOpcion).toFixed(2)} · 
                Δ ${(s.shortLeg.Delta || 0).toFixed(2)}</small>
            </td>
            <td style="color:#f44336;font-weight:bold;">$${s.costoNeto.toFixed(2)}</td>
            <td>$${s.anchoSpread.toFixed(1)}</td>
            <td style="color:#4caf50;font-weight:bold;">$${s.maxGanancia.toFixed(2)}</td>
            <td style="color:#f44336;">$${s.maxPerdida.toFixed(2)}</td>
            <td>${s.breakeven.toFixed(1)}</td>
            <td style="color:#ff9800;font-weight:bold;">-${s.ratioBajarNecesario.toFixed(1)}%</td>
            <td style="color:${rrColor};font-weight:bold;">${s.ratioRR.toFixed(2)}x</td>
            <td style="color:${probColor};font-weight:bold;">${(s.probProfit * 100).toFixed(1)}%</td>
            <td style="font-weight:bold;">${(s.score * 100).toFixed(0)}</td>
        </tr>`;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
}

        function mostrarSonrisaVolatilidad(ocultarMontosCero = false) {
            const df = resultados.dfProcesado;
            let dfVol = df.filter(r => 
                r.volatilidadImplicita && r.strike && r.tipoOpcion && r.fechaVencimiento && r.T > 0
            );

            // Filtrar opciones con monto operado 0 si está activado
            if (ocultarMontosCero) {
                dfVol = dfVol.filter(r => (r.montoOperado || 0) > 0);
            }

            if (dfVol.length === 0) {
                return '<div class="warning">No hay datos de volatilidad implícita disponibles' + 
                    (ocultarMontosCero ? ' (todas las opciones tienen monto operado = 0)' : '') + '</div>';
            }

            // Obtener vencimientos únicos para colores
            const vencimientos = [...new Set(dfVol.map(r => r.fechaVencimiento))].filter(v => v).sort();
            // Paleta de colores moderna y profesional
            const colores = [
                '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', 
                '#06b6d4', '#ef4444', '#6366f1', '#14b8a6', '#f97316'
            ];
            const colorMap = {};
            vencimientos.forEach((v, idx) => {
                colorMap[v] = colores[idx % colores.length];
            });

            // Crear traces por tipo y vencimiento
            const traces = [];
            const tipos = ['Call', 'Put'];
            const symbolMap = {'Call': 'triangle-up', 'Put': 'triangle-down'};

            tipos.forEach(tipo => {
                const dfTipo = dfVol.filter(r => r.tipoOpcion === tipo);
                vencimientos.forEach(venc => {
                        const dfV = dfTipo.filter(r => r.fechaVencimiento === venc);
                        if (dfV.length > 0) {
                            const tamanios = calcularTamaniosMarcadores(dfV, 8, 30);
                            traces.push({
                                x: dfV.map(r => r.strike),
                                y: dfV.map(r => (r.volatilidadImplicita ?? r.volatilidadSubyacente ?? 0) * 100),
                                mode: 'markers',
                                type: 'scatter',
                                name: tipo + ' ' + venc,
                                marker: {
                                    symbol: symbolMap[tipo] || 'circle',
                                    size: tamanios,
                                    color: colorMap[venc],
                                    line: { width: 1, color: '#000' },
                                    opacity: 0.8
                                },
                                customdata: dfV.map(r => [
                                    (r.montoOperado || 0),
                                    (r.precioOpcion || 0)
                                ]),
                                hovertemplate: tipo + ' - Venc: ' + venc + '<br>Strike: $%{x:,.0f}<br>Vol. Impl.: %{y:.2f}%<br>Prima: $%{customdata[1]:,.2f}<br>Monto Operado: $%{customdata[0]:,.2f}<extra></extra>'
                            });
                        }
                });
            });

            const layout = {
                title: {
                    text: 'Sonrisa de Volatilidad Implícita',
                    font: { size: 20, color: '#ffffff', family: 'Inter' },
                    x: 0.5,
                    xanchor: 'center'
                },
                xaxis: { 
                    title: { text: 'Strike', font: { size: 14, color: '#b3b3b3', family: 'Inter' } },
                    gridcolor: '#252525',
                    linecolor: '#353535',
                    zeroline: false,
                    showgrid: true,
                    tickformat: ',.0f',
                    type: 'linear'
                },
                yaxis: { 
                    title: { text: 'Volatilidad Implícita (%)', font: { size: 14, color: '#b3b3b3', family: 'Inter' } },
                    gridcolor: '#252525',
                    linecolor: '#353535',
                    zeroline: false,
                    showgrid: true
                },
                plot_bgcolor: 'rgba(0,0,0,0)',
                paper_bgcolor: 'rgba(0,0,0,0)',
                font: { color: '#ffffff', family: 'Inter', size: 12 },
                height: 600,
                hovermode: 'closest',
                legend: { 
                    title: { text: 'Tipo y Vencimiento', font: { size: 12, color: '#b3b3b3' } },
                    bgcolor: 'rgba(22, 22, 22, 0.8)',
                    bordercolor: '#252525',
                    borderwidth: 1,
                    font: { color: '#ffffff', size: 11 }
                },
                margin: { l: 70, r: 30, t: 80, b: 60 },
                showlegend: true
            };

            // Agregar línea de volatilidad histórica
            if (resultados.volatilidadHistorica) {
                layout.shapes = [{
                    type: 'line',
                    x0: Math.min(...dfVol.map(r => r.strike)),
                    x1: Math.max(...dfVol.map(r => r.strike)),
                    y0: resultados.volatilidadHistorica * 100,
                    y1: resultados.volatilidadHistorica * 100,
                    line: { dash: 'dash', color: '#808080', width: 2 },
                    layer: 'below'
                }];
                layout.annotations = [{
                    x: Math.max(...dfVol.map(r => r.strike)),
                    y: resultados.volatilidadHistorica * 100,
                    text: 'Vol. Histórica: ' + (resultados.volatilidadHistorica * 100).toFixed(2) + '%',
                    showarrow: false,
                    font: { color: '#b3b3b3', family: 'Inter', size: 11 },
                    xanchor: 'right',
                    bgcolor: 'rgba(22, 22, 22, 0.8)',
                    bordercolor: '#252525',
                    borderwidth: 1,
                    borderpad: 4
                }];
            }

            // Agregar línea del precio spot
            if (resultados.precioSpot) {
                if (!layout.shapes) layout.shapes = [];
                layout.shapes.push({
                    type: 'line',
                    x0: resultados.precioSpot,
                    x1: resultados.precioSpot,
                    y0: 0,
                    y1: 100,
                    line: { dash: 'dot', color: '#ef4444', width: 2 },
                    layer: 'below'
                });
                if (!layout.annotations) layout.annotations = [];
                layout.annotations.push({
                    x: resultados.precioSpot,
                    y: 95,
                    text: 'Spot: $' + resultados.precioSpot.toFixed(2),
                    showarrow: false,
                    font: { color: '#ef4444', family: 'Inter', size: 11 },
                    xanchor: 'center',
                    bgcolor: 'rgba(22, 22, 22, 0.8)',
                    bordercolor: '#ef4444',
                    borderwidth: 1,
                    borderpad: 4
                });
            }

            setTimeout(() => {
                Plotly.newPlot('chart-volatilidad', traces, layout, {responsive: true});
            }, 100);

            // Análisis de la sonrisa
            let analisisHtml = '<h3>Análisis de la Sonrisa de Volatilidad</h3><div class="metrics-grid">';
            
            if (dfVol.length > 2) {
                const precioSpot = resultados.precioSpot;
                dfVol.forEach(r => {
                    r.distancia_atm = Math.abs(r.strike - precioSpot);
                });
                
                const dfVolSorted = [...dfVol].sort((a, b) => a.distancia_atm - b.distancia_atm);
                const atmVol = (dfVolSorted[0]?.volatilidadImplicita ?? dfVolSorted[0]?.volatilidadSubyacente ?? 0) * 100 || 0;
                
                const otmCalls = dfVol.filter(r => r.tipoOpcion === 'Call' && r.strike > precioSpot);
                const otmPuts = dfVol.filter(r => r.tipoOpcion === 'Put' && r.strike < precioSpot);
                
                if (otmCalls.length > 0 && otmPuts.length > 0) {
                    const ivC = (r) => (r.volatilidadImplicita ?? r.volatilidadSubyacente ?? 0) * 100;
                    const sesgoCalls = (otmCalls.reduce((sum, r) => sum + ivC(r), 0) / otmCalls.length) - atmVol;
                    const sesgoPuts = (otmPuts.reduce((sum, r) => sum + ivC(r), 0) / otmPuts.length) - atmVol;
                    const sesgoPromedio = (sesgoCalls + sesgoPuts) / 2;
                    
                    analisisHtml += 
                        '<div class="metric">' +
                            '<div class="metric-label">Sesgo Promedio</div>' +
                            '<div class="metric-value">' + sesgoPromedio.toFixed(2) + '%</div>' +
                        '</div>';
                }
            }
            
const volMin = Math.min(...dfVol.map(r => (r.volatilidadImplicita ?? r.volatilidadSubyacente ?? 0) * 100));
                const volMax = Math.max(...dfVol.map(r => (r.volatilidadImplicita ?? r.volatilidadSubyacente ?? 0) * 100));
            const convexidad = volMax - volMin;
            
            analisisHtml += 
                '<div class="metric">' +
                    '<div class="metric-label">Convexidad</div>' +
                    '<div class="metric-value">' + convexidad.toFixed(2) + '%</div>' +
                '</div>' +
                '<div class="metric">' +
                    '<div class="metric-label">Puntos de Datos</div>' +
                    '<div class="metric-value">' + dfVol.length + '</div>' +
                '</div>';
            
            analisisHtml += '</div>';

            // Inicializar gráfico después de insertar HTML
            setTimeout(() => {
                Plotly.newPlot('chart-volatilidad', traces, layout, {responsive: true});
            }, 100);
            
            return '<h2>Sonrisa de Volatilidad Implícita</h2>' +
                '<div style="margin: 1rem 0; padding: 0.75rem; background: rgba(255,255,255,0.05); border-radius: 8px; border: 1px solid var(--border-color);">' +
                    '<label style="display: flex; align-items: center; cursor: pointer; user-select: none;">' +
                        '<input type="checkbox" id="ocultar-monto-cero-vol" onchange="actualizarSonrisaVolatilidad()" style="margin-right: 0.5rem; cursor: pointer;">' +
                        '<span>Ocultar opciones sin volumen operado (monto = $0)</span>' +
                    '</label>' +
                    '<p style="margin: 0.5rem 0 0 1.5rem; font-size: 0.85rem; color: var(--text-secondary);">Las opciones con monto operado $0 se muestran con triángulos muy pequeños (2px). Marcá esta opción para ocultarlas del gráfico.</p>' +
                '</div>' +
                '<div id="chart-volatilidad" class="chart-container"></div>' +
                analisisHtml;
        }

        function actualizarSonrisaVolatilidad() {
            const checkbox = document.getElementById('ocultar-monto-cero-vol');
            const ocultarMontosCero = checkbox ? checkbox.checked : false;
            
            const section = document.getElementById('sonrisa-vol-section');
            if (section) {
                section.innerHTML = '<h3>📉 Sonrisa de Volatilidad</h3>' + mostrarSonrisaVolatilidad(ocultarMontosCero);
            }
        }

        function mostrarVar(ocultarMontosCero = false) {
            const df = resultados.dfProcesado;
            let calls = df.filter(r => r.tipoOpcion === 'Call');
            let puts = df.filter(r => r.tipoOpcion === 'Put');
            
            // Filtrar opciones con monto operado 0 si está activado
            if (ocultarMontosCero) {
                calls = calls.filter(r => (r.montoOperado || 0) > 0);
                puts = puts.filter(r => (r.montoOperado || 0) > 0);
            }

            const tamaniosCalls = calcularTamaniosMarcadores(calls, 10, 35);
            const tamaniosPuts = calcularTamaniosMarcadores(puts, 10, 35);

            const traceCalls = {
                x: calls.map(r => r.strike),
                y: calls.map(r => r.VaR || 0),
                mode: 'markers',
                type: 'scatter',
                name: 'Calls',
                marker: { 
                    symbol: 'triangle-up', 
                    size: tamaniosCalls, 
                    color: '#10b981',
                    opacity: 0.8,
                    line: { width: 1.5, color: '#059669' }
                },
                customdata: calls.map(r => (r.montoOperado || 0)),
                hovertemplate: '<b>Call</b><br>Strike: $%{x:,.0f}<br>VaR: $%{y:.2f}<br>Monto Operado: $%{customdata:,.2f}<extra></extra>',
                hoverlabel: {
                    bgcolor: 'rgba(22, 22, 22, 0.95)',
                    bordercolor: '#10b981',
                    font: { color: '#ffffff', family: 'Inter', size: 12 }
                }
            };

            const tracePuts = {
                x: puts.map(r => r.strike),
                y: puts.map(r => r.VaR || 0),
                mode: 'markers',
                type: 'scatter',
                name: 'Puts',
                marker: { 
                    symbol: 'triangle-down', 
                    size: tamaniosPuts, 
                    color: '#ef4444',
                    opacity: 0.8,
                    line: { width: 1.5, color: '#dc2626' }
                },
                customdata: puts.map(r => (r.montoOperado || 0)),
                hovertemplate: '<b>Put</b><br>Strike: $%{x:,.0f}<br>VaR: $%{y:.2f}<br>Monto Operado: $%{customdata:,.2f}<extra></extra>',
                hoverlabel: {
                    bgcolor: 'rgba(22, 22, 22, 0.95)',
                    bordercolor: '#ef4444',
                    font: { color: '#ffffff', family: 'Inter', size: 12 }
                }
            };

            const layout = {
                title: {
                    text: 'Value at Risk (VaR) por Strike',
                    font: { size: 20, color: '#ffffff', family: 'Inter' },
                    x: 0.5,
                    xanchor: 'center'
                },
                xaxis: { 
                    title: { text: 'Strike', font: { size: 14, color: '#b3b3b3', family: 'Inter' } },
                    gridcolor: '#252525',
                    linecolor: '#353535',
                    zeroline: false,
                    showgrid: true,
                    tickformat: ',.0f',
                    type: 'linear'
                },
                yaxis: { 
                    title: { text: 'VaR', font: { size: 14, color: '#b3b3b3', family: 'Inter' } },
                    gridcolor: '#252525',
                    linecolor: '#353535',
                    zeroline: false,
                    showgrid: true
                },
                plot_bgcolor: 'rgba(0,0,0,0)',
                paper_bgcolor: 'rgba(0,0,0,0)',
                font: { color: '#ffffff', family: 'Inter', size: 12 },
                height: 500,
                hovermode: 'closest',
                legend: { 
                    bgcolor: 'rgba(22, 22, 22, 0.8)',
                    bordercolor: '#252525',
                    borderwidth: 1,
                    font: { color: '#ffffff', size: 11 }
                },
                margin: { l: 70, r: 30, t: 80, b: 60 }
            };

            setTimeout(() => {
                Plotly.newPlot('chart-var', [traceCalls, tracePuts], layout, {
                    responsive: true,
                    autosize: true,
                    useResizeHandler: true
                });
                window.addEventListener('resize', () => {
                    Plotly.Plots.resize('chart-var');
                });
            }, 100);

            return '<h2>Value at Risk (VaR)</h2>' +
                '<div style="margin: 1rem 0; padding: 0.75rem; background: rgba(255,255,255,0.05); border-radius: 8px; border: 1px solid var(--border-color);">' +
                    '<label style="display: flex; align-items: center; cursor: pointer; user-select: none;">' +
                        '<input type="checkbox" id="ocultar-monto-cero-var" onchange="actualizarVaR()" style="margin-right: 0.5rem; cursor: pointer;">' +
                        '<span>Ocultar opciones sin volumen operado (monto = $0)</span>' +
                    '</label>' +
                '</div>' +
                '<div id="chart-var" class="chart-container"></div>';
        }

        function actualizarVaR() {
            const checkbox = document.getElementById('ocultar-monto-cero-var');
            const ocultarMontosCero = checkbox ? checkbox.checked : false;
            
            const section = document.getElementById('var-section');
            if (section) {
                section.innerHTML = '<h3>⚠️ Value at Risk</h3>' + mostrarVar(ocultarMontosCero);
            }
        }

        function mostrarProbabilidadProfit(ocultarMontosCero = false) {
            const df = resultados.dfProcesado;
            let calls = df.filter(r => r.tipoOpcion === 'Call');
            let puts = df.filter(r => r.tipoOpcion === 'Put');
            
            // Filtrar opciones con monto operado 0 si está activado
            if (ocultarMontosCero) {
                calls = calls.filter(r => (r.montoOperado || 0) > 0);
                puts = puts.filter(r => (r.montoOperado || 0) > 0);
            }

            // Función para determinar ITM/ATM/OTM
            const determinarMoneyness = (row) => {
                const precioSpot = resultados.precioSpot;
                const strike = row.strike;
                if (row.tipoOpcion === 'Call') {
                    if (strike < precioSpot * 0.99) return 'ITM';
                    if (strike > precioSpot * 1.01) return 'OTM';
                    return 'ATM';
                } else {
                    if (strike > precioSpot * 1.01) return 'ITM';
                    if (strike < precioSpot * 0.99) return 'OTM';
                    return 'ATM';
                }
            };

            const tamaniosCalls = calcularTamaniosMarcadores(calls, 10, 35);
            const tamaniosPuts = calcularTamaniosMarcadores(puts, 10, 35);

            const traceCalls = {
                x: calls.map(r => r.strike),
                y: calls.map(r => (r.MC_ProbProfit || 0) * 100),
                mode: 'markers',
                type: 'scatter',
                name: 'Calls',
                marker: { 
                    symbol: 'triangle-up', 
                    size: tamaniosCalls, 
                    color: '#10b981',
                    opacity: 0.8,
                    line: { width: 1.5, color: '#059669' }
                },
                text: calls.map(r => {
                    const moneyness = determinarMoneyness(r);
                    return `${r.simbolo || 'N/A'} - ${moneyness}`;
                }),
                customdata: calls.map(r => (r.montoOperado || 0)),
                hovertemplate: '<b>Call - %{text}</b><br>Strike: $%{x:,.0f}<br>Prob. Profit: %{y:.2f}%<br>Monto Operado: $%{customdata:,.2f}<extra></extra>',
                hoverlabel: {
                    bgcolor: 'rgba(22, 22, 22, 0.95)',
                    bordercolor: '#10b981',
                    font: { color: '#ffffff', family: 'Inter', size: 12 }
                }
            };

            const tracePuts = {
                x: puts.map(r => r.strike),
                y: puts.map(r => (r.MC_ProbProfit || 0) * 100),
                mode: 'markers',
                type: 'scatter',
                name: 'Puts',
                marker: { 
                    symbol: 'triangle-down', 
                    size: tamaniosPuts, 
                    color: '#ef4444',
                    opacity: 0.8,
                    line: { width: 1.5, color: '#dc2626' }
                },
                text: puts.map(r => {
                    const moneyness = determinarMoneyness(r);
                    return `${r.simbolo || 'N/A'} - ${moneyness}`;
                }),
                customdata: puts.map(r => (r.montoOperado || 0)),
                hovertemplate: '<b>Put - %{text}</b><br>Strike: $%{x:,.0f}<br>Prob. Profit: %{y:.2f}%<br>Monto Operado: $%{customdata:,.2f}<extra></extra>',
                hoverlabel: {
                    bgcolor: 'rgba(22, 22, 22, 0.95)',
                    bordercolor: '#ef4444',
                    font: { color: '#ffffff', family: 'Inter', size: 12 }
                }
            };

            const layout = {
                title: {
                    text: 'Probabilidad de Profit por Strike',
                    font: { size: 20, color: '#ffffff', family: 'Inter' },
                    x: 0.5,
                    xanchor: 'center'
                },
                xaxis: { 
                    title: { text: 'Strike', font: { size: 14, color: '#b3b3b3', family: 'Inter' } },
                    gridcolor: '#252525',
                    linecolor: '#353535',
                    zeroline: false,
                    showgrid: true,
                    tickformat: ',.0f',
                    type: 'linear'
                },
                yaxis: { 
                    title: { text: 'Probabilidad de Profit (%)', font: { size: 14, color: '#b3b3b3', family: 'Inter' } },
                    gridcolor: '#252525',
                    linecolor: '#353535',
                    zeroline: false,
                    showgrid: true
                },
                plot_bgcolor: 'rgba(0,0,0,0)',
                paper_bgcolor: 'rgba(0,0,0,0)',
                font: { color: '#ffffff', family: 'Inter', size: 12 },
                height: 500,
                hovermode: 'closest',
                legend: { 
                    bgcolor: 'rgba(22, 22, 22, 0.8)',
                    bordercolor: '#252525',
                    borderwidth: 1,
                    font: { color: '#ffffff', size: 11 }
                },
                margin: { l: 70, r: 30, t: 80, b: 60 }
            };

            setTimeout(() => {
                Plotly.newPlot('chart-prob-profit', [traceCalls, tracePuts], layout, {
                    responsive: true,
                    autosize: true,
                    useResizeHandler: true
                });
                // Ajustar al redimensionar
                window.addEventListener('resize', () => {
                    Plotly.Plots.resize('chart-prob-profit');
                });
            }, 100);

            return '<h2>Probabilidad de Profit</h2>' +
                '<div style="margin: 1rem 0; padding: 0.75rem; background: rgba(255,255,255,0.05); border-radius: 8px; border: 1px solid var(--border-color);">' +
                    '<label style="display: flex; align-items: center; cursor: pointer; user-select: none;">' +
                        '<input type="checkbox" id="ocultar-monto-cero-prob" onchange="actualizarProbProfit()" style="margin-right: 0.5rem; cursor: pointer;">' +
                        '<span>Ocultar opciones sin volumen operado (monto = $0)</span>' +
                    '</label>' +
                '</div>' +
                '<div id="chart-prob-profit" class="chart-container"></div>';
        }

        function actualizarProbProfit() {
            const checkbox = document.getElementById('ocultar-monto-cero-prob');
            const ocultarMontosCero = checkbox ? checkbox.checked : false;
            
            const section = document.getElementById('prob-profit-section');
            if (section) {
                section.innerHTML = '<h3>🎯 Probabilidad de Profit</h3>' + mostrarProbabilidadProfit(ocultarMontosCero);
            }
        }

        /**
         * Calcula probabilidad de profit con Monte Carlo usando modelo adaptado para Argentina
         * @param {Object} row - Fila de datos de opción
         * @param {number} nSim - Número de simulaciones
         * @returns {Object} { probProfit, probITM, probProfitReal, payoffs, preciosSubyacentes, precioSpot }
         */
        function calcularProbabilidadProfitMontecarlo(row, nSim = 10000) {
            const S0 = row.precioSubyacente;
            const K = row.strike;
            const T = row.T;
            let sigma = row.volatilidadImplicita ?? row.volatilidadSubyacente;
            
            // Usar volatilidad subyacente si la implícita no es válida
            if (!sigma || sigma <= 0 || !isFinite(sigma)) {
                sigma = row.volatilidadSubyacente || (resultados?.volatilidadHistorica || 0.3);
            }
            
            // Obtener distribución empírica de resultados si está disponible
            const distribucionEmpirica = resultados?.distribucionEmpirica || null;
            
            const r = CONFIG.tasa_riesgo;
            const prima = row.precioOpcion;
            const tipo = row.tipoOpcion;
            const simbolo = row.simbolo ? row.simbolo.substring(0, row.simbolo.search(/\d/)) : CONFIG.simbolo;

            // Validar parámetros
            if (S0 <= 0 || K <= 0 || T <= 0 || sigma <= 0 || prima < 0) {
                return { probProfit: null, probITM: null, probProfitReal: null, payoffs: null, preciosSubyacentes: null };
            }

            // Parámetros calibrados para Argentina según el activo específico
            const paramsArgentina = obtenerParammetrosArgentina(simbolo);

            // Simulación con modelo argentino
            const payoffs = [];
            const preciosSubyacentes = [];
            let itmCount = 0;
            let profitRealCount = 0; // Contador para profit real (break-even)
            
            // Asegurar que nSim sea un número entero válido
            nSim = Math.max(1, Math.floor(nSim));
            
            // Número de pasos para simular trayectoria
            const nPasos = Math.max(10, Math.min(50, Math.ceil(T * 252)));
            const dt = T / nPasos;
            
            for (let i = 0; i < nSim; i++) {
                let St = S0;
                let sigmaT = sigma;
                
                // Simular trayectoria con modelo argentino
                for (let paso = 0; paso < nPasos; paso++) {
                    // 1. Simular volatilidad estocástica (Heston)
                    sigmaT = simularVolatilidadEstocasticaArgentina(sigmaT, dt, paramsArgentina, distribucionEmpirica);
                    sigmaT = Math.max(0.01, Math.min(3.0, sigmaT));
                    
                    // 2. Generar retorno con distribución t-Student y saltos
                    let retorno;
                    
                    // Componente de difusión con t-Student
                    const retornoDifusion = generarRetornoTStudent(
                        r, sigmaT, dt, paramsArgentina.gradosLibertad
                    );
                    
                    // Componente de salto (Jump Diffusion)
                    const retornoSalto = generarSaltoMerton(dt, paramsArgentina);
                    
                    // Evento de devaluación (raro pero impactante)
                    const retornoDevaluacion = generarDevaluacion(dt, paramsArgentina);
                    
                    // Retorno total
                    retorno = retornoDifusion + retornoSalto + retornoDevaluacion;
                    
                    // Actualizar precio
                    St = St * Math.exp(retorno);
                }
                
                preciosSubyacentes.push(St);
                
                // Calcular payoff bruto al vencimiento
                let payoff;
                if (tipo === 'Call') {
                    payoff = Math.max(St - K, 0);
                    if (St > K) itmCount++; // Prob ITM
                    // Break-even real para call comprada: S > K + prima
                    if (St > K + prima) profitRealCount++;
                } else { // Put
                    payoff = Math.max(K - St, 0);
                    if (St < K) itmCount++; // Prob ITM
                    // Break-even real para put comprada: S < K - prima
                    if (St < K - prima) profitRealCount++;
                }
                
                payoffs.push(payoff);
            }

            // Calcular probabilidades
            const probITM = itmCount / nSim;
            const probProfitReal = profitRealCount / nSim; // Probabilidad de profit real
            
            // Probabilidad de profit considerando prima (payoff > prima)
            const profitConPrima = payoffs.filter(p => p > prima).length;
            const probProfit = profitConPrima / nSim;
            
            return { 
                probProfit, 
                probITM, 
                probProfitReal,
                payoffs, 
                preciosSubyacentes, 
                precioSpot: S0,
                parametrosUsados: paramsArgentina,
                activo: simbolo
            };
        }

        // Función para graficar histograma de Monte Carlo
        function graficarHistogramaMontecarlo(payoffs, tipoOpcion, strike, precioOpcion) {
            const data = [{
                x: payoffs,
                type: 'histogram',
                nbinsx: 50,
                name: 'Payoff',
                marker: { color: '#42a5f5' }
            }];

            const layout = {
                title: 'Simulación Monte Carlo - Distribución de Payoff',
                xaxis: { title: 'Payoff al vencimiento' },
                yaxis: { title: 'Frecuencia' },
                bargap: 0.05,
                plot_bgcolor: '#1a1a1a',
                paper_bgcolor: '#232323',
                font: { color: '#fff' },
                shapes: [{
                    type: 'line',
                    x0: 0,
                    x1: 0,
                    y0: 0,
                    y1: 1,
                    yref: 'paper',
                    line: { dash: 'dash', color: '#ef4444', width: 2 }
                }],
                annotations: [{
                    x: 0,
                    y: 0.95,
                    yref: 'paper',
                    text: 'Break-even',
                    showarrow: false,
                    font: { color: '#ef4444', family: 'Inter', size: 11 },
                    bgcolor: 'rgba(22, 22, 22, 0.8)',
                    bordercolor: '#ef4444',
                    borderwidth: 1,
                    borderpad: 4
                }]
            };

            return { data, layout };
        }

        // Función para calcular percentiles
        function calcularPercentil(arr, p) {
            const sorted = [...arr].sort((a, b) => a - b);
            const index = Math.floor(sorted.length * p);
            return sorted[index];
        }

        function mostrarMonteCarloInteractivo() {
            const df = resultados.dfProcesado;
            const dfMc = df.filter(r => r.MC_ProbProfit !== undefined && r.MC_GananciaEsperada !== undefined);

            if (dfMc.length === 0) {
                return '<div class="warning">No hay datos de Monte Carlo disponibles.</div>';
            }

            // Obtener tipos y vencimientos únicos
            const tipos = [...new Set(dfMc.map(r => r.tipoOpcion))].filter(t => t);
            const vencimientos = [...new Set(dfMc.map(r => r.fechaVencimiento))].filter(v => v).sort();

            // Guardar datos en window para acceso global
            window.dfMcData = dfMc;
            window.tiposDisponibles = tipos;
            window.vencimientosDisponibles = vencimientos;

            // Construir opciones de tipos
            const opcionesTipos = tipos.map(t => '<option value="' + t + '">' + t + '</option>').join('');
            
            const html = '<h2>Análisis de Probabilidad de Profit y Monte Carlo</h2>' +
                '<div class="info-box">' +
                    '<b>¿Qué muestra este análisis?</b><br>' +
                    'Cada punto representa una opción. El eje X indica la probabilidad de obtener ganancia (según simulación Monte Carlo), el eje Y la ganancia esperada.<br>' +
                    '<b>Selecciona una opción para ver detalles y ejecutar simulaciones personalizadas.</b>' +
                '</div>' +
                '<div style="margin-top: 20px;">' +
                    '<div class="tabs" style="border-bottom: 2px solid #444;">' +
                        '<button class="tab active" onclick="mostrarTabMonteCarlo(0)" id="mc-tab-0">Simulación Individual</button>' +
                        '<button class="tab" onclick="mostrarTabMonteCarlo(1)" id="mc-tab-1">Análisis Comparativo</button>' +
                    '</div>' +
                    '<div id="mc-content-0" class="tab-content active" style="display: block;">' +
                        '<h3>Simulación Monte Carlo Individual</h3>' +
                        '<div class="info-box" style="margin: 1rem 0;">' +
                            'Selecciona una opción y configura los parámetros. Luego presiona el botón para ejecutar la simulación.' +
                        '</div>' +
                        '<div class="columns">' +
                            '<div class="form-group">' +
                                '<label for="mc-tipo">Tipo de opción</label>' +
                                '<select id="mc-tipo" onchange="actualizarVencimientosMC()">' +
                                    opcionesTipos +
                                '</select>' +
                            '</div>' +
                            '<div class="form-group">' +
                                '<label for="mc-vencimiento">Vencimiento</label>' +
                                '<select id="mc-vencimiento" onchange="actualizarStrikesMC()">' +
                                    '<option value="">Selecciona...</option>' +
                                '</select>' +
                            '</div>' +
                            '<div class="form-group">' +
                                '<label for="mc-strike">Strike</label>' +
                                '<select id="mc-strike" onchange="mostrarInfoOpcionMC()">' +
                                    '<option value="">Selecciona...</option>' +
                                '</select>' +
                            '</div>' +
                        '</div>' +
                        '<div id="info-opcion-mc" style="margin: 1.5rem 0; padding: 1.5rem; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 12px; display: none;">' +
                            '<h4>Información de la Opción Seleccionada</h4>' +
                            '<div id="info-opcion-detalles"></div>' +
                        '</div>' +
                        '<div class="columns">' +
                            '<div class="form-group">' +
                                '<label for="mc-cantidad-contratos">Cantidad de contratos</label>' +
                                '<input type="number" id="mc-cantidad-contratos" min="1" max="10000" value="1" step="1">' +
                            '</div>' +
                            '<div class="form-group">' +
                                '<label for="mc-n-simulaciones">Cantidad de simulaciones</label>' +
                                '<input type="number" id="mc-n-simulaciones" min="1000" max="1000000" value="10000" step="1000">' +
                            '</div>' +
                            '<div class="form-group">' +
                                '<label for="mc-comision">Comisión total ($)</label>' +
                                '<input type="number" id="mc-comision" min="0" value="0" step="1" readonly>' +
                            '</div>' +
                        '</div>' +
                        '<button onclick="ejecutarSimulacionIndividualMC()" style="margin: 1.5rem 0;">Ejecutar Simulación Individual</button>' +
                        '<div id="resultados-simulacion-individual" style="display: none;">' +
                            '<h4>Resultados de la Simulación</h4>' +
                            '<div id="metricas-simulacion-individual" class="metrics-grid"></div>' +
                            '<div id="histograma-simulacion-individual" class="chart-container"></div>' +
                            '<div id="estadisticas-simulacion-individual" class="columns"></div>' +
                        '</div>' +
                        '<hr style="margin: 2rem 0; border: none; border-top: 1px solid var(--border-color);">' +
                        '<h3>Resumen de Simulaciones Monte Carlo</h3>' +
                        '<div class="form-group">' +
                            '<label for="mc-n-sim-resumen">Cantidad de simulaciones para resumen</label>' +
                            '<input type="number" id="mc-n-sim-resumen" min="1000" max="1000000" value="10000" step="1000">' +
                        '</div>' +
                        '<div id="resumen-montecarlo" class="metrics-grid"></div>' +
                        '<div id="analisis-por-tipo" class="columns"></div>' +
                        '<div id="mejores-opciones-table"></div>' +
                        '<div id="distribucion-probabilidades" class="chart-container"></div>' +
                    '</div>' +
                    '<div id="mc-content-1" class="tab-content" style="display: none;">' +
                        '<h3>Análisis Comparativo</h3>' +
                        '<div class="info-box" style="margin: 1rem 0;">' +
                            'En este gráfico, cada punto es una opción. El eje X es la probabilidad de obtener ganancia (Monte Carlo), el eje Y la ganancia esperada. ' +
                            'El símbolo de la opción aparece en el tooltip. Puedes operar directamente desde aquí.' +
                        '</div>' +
                        '<div class="columns">' +
                            '<div class="form-group">' +
                                '<label for="mc-n-sim-comparativo">Cantidad de simulaciones</label>' +
                                '<input type="number" id="mc-n-sim-comparativo" min="1000" max="1000000" value="10000" step="1000">' +
                            '</div>' +
                            '<div class="form-group">' +
                                '<label for="mc-umbral-profit">Umbral de probabilidad de profit (%)</label>' +
                                '<input type="range" id="mc-umbral-profit" min="0" max="100" value="0" step="5" oninput="document.getElementById(\'mc-umbral-profit-value\').textContent = this.value + \'%\'">' +
                                '<span id="mc-umbral-profit-value">0%</span>' +
                            '</div>' +
                            '<div class="form-group">' +
                                '<label for="mc-ordenar-comparativo">Ordenar por</label>' +
                                '<select id="mc-ordenar-comparativo">' +
                                    '<option value="prob_profit">Prob. Profit</option>' +
                                    '<option value="ganancia_esperada">Ganancia Esperada</option>' +
                                    '<option value="ratio_ganancia_riesgo">Ratio Ganancia/Riesgo</option>' +
                                    '<option value="strike">Strike</option>' +
                                '</select>' +
                            '</div>' +
                        '</div>' +
                        '<button onclick="ejecutarSimulacionSimultaneaMC()" style="margin: 1.5rem 0;">Ejecutar Simulación Simultánea</button>' +
                        '<div id="resultados-simulacion-simultanea" style="display: none;">' +
                            '<div id="metricas-simulacion-simultanea" class="metrics-grid"></div>' +
                            '<div id="tabla-mejores-opciones-simultanea"></div>' +
                            '<div id="grafico-comparativo-simultanea" class="chart-container"></div>' +
                            '<div id="analisis-por-tipo-simultanea" class="columns"></div>' +
                        '</div>' +
                        '<hr style="margin: 2rem 0; border: none; border-top: 1px solid var(--border-color);">' +
                        '<h3>Gráfico con Datos Pre-calculados</h3>' +
                        '<div class="info-box" style="margin: 1rem 0;">' +
                            'Gráfico con datos de Monte Carlo pre-calculados durante el análisis inicial. ' +
                            'Usa la simulación simultánea arriba para análisis más preciso.' +
                        '</div>' +
                        '<div id="grafico-precalculado-montecarlo" class="chart-container"></div>' +
                        '<div class="form-group" style="margin-top: 1.5rem;">' +
                            '<label for="mc-opcion-seleccionar">Selecciona una opción para operar</label>' +
                            '<select id="mc-opcion-seleccionar" onchange="mostrarDetallesOpcionSeleccionada()">' +
                                '<option value="">Selecciona una opción...</option>' +
                            '</select>' +
                        '</div>' +
                        '<div id="detalles-opcion-seleccionada"></div>' +
                    '</div>' +
                '</div>' +
                '<div style="margin-top: 2rem; padding: 1.5rem; background: rgba(243, 156, 18, 0.08); border: 1px solid rgba(243, 156, 18, 0.25); border-radius: 12px; color: var(--text-primary);">' +
                    '<b style="color: var(--warning);">Teoría:</b><br>' +
                    'La probabilidad de profit se estima simulando miles de escenarios posibles para el precio del activo subyacente al vencimiento de la opción. ' +
                    'La ganancia esperada es el promedio de los resultados de esas simulaciones, considerando el costo de la prima.<br><br>' +
                    '<b style="color: var(--warning);">¿Cómo operar?</b><br>' +
                    'Puedes comprar o vender la opción seleccionada usando los botones. La orden se envía a InvertirOnline con los parámetros elegidos.' +
                '</div>';
            
            return html;
        }

        // Funciones auxiliares para Monte Carlo interactivo
        function mostrarTabMonteCarlo(index) {
            // Ocultar todos los tabs
            document.querySelectorAll('[id^="mc-content-"]').forEach(tab => {
                tab.style.display = 'none';
                tab.classList.remove('active');
            });
            document.querySelectorAll('[id^="mc-tab-"]').forEach(tab => {
                tab.classList.remove('active');
            });

            // Mostrar tab seleccionado
            document.getElementById('mc-content-' + index).style.display = 'block';
            document.getElementById('mc-content-' + index).classList.add('active');
            document.getElementById('mc-tab-' + index).classList.add('active');
        }

        function actualizarVencimientosMC() {
            const tipo = document.getElementById('mc-tipo').value;
            const df = window.dfMcData || resultados.dfProcesado;
            const dfTipo = df.filter(r => r.tipoOpcion === tipo);
            const vencimientos = [...new Set(dfTipo.map(r => r.fechaVencimiento))].filter(v => v).sort();
            
            const select = document.getElementById('mc-vencimiento');
            select.innerHTML = '<option value="">Selecciona...</option>';
            vencimientos.forEach(v => {
                const option = document.createElement('option');
                option.value = v;
                option.textContent = v;
                select.appendChild(option);
            });
        }

        function actualizarStrikesMC() {
            const tipo = document.getElementById('mc-tipo').value;
            const vencimiento = document.getElementById('mc-vencimiento').value;
            const df = window.dfMcData || resultados.dfProcesado;
            const dfVenc = df.filter(r => r.tipoOpcion === tipo && r.fechaVencimiento === vencimiento);
            const strikes = [...new Set(dfVenc.map(r => r.strike))].filter(s => s).sort((a, b) => a - b);
            
            const select = document.getElementById('mc-strike');
            select.innerHTML = '<option value="">Selecciona...</option>';
            strikes.forEach(s => {
                const option = document.createElement('option');
                option.value = s;
                option.textContent = s.toFixed(2);
                select.appendChild(option);
            });
        }

        function mostrarInfoOpcionMC() {
            const tipo = document.getElementById('mc-tipo').value;
            const vencimiento = document.getElementById('mc-vencimiento').value;
            const strike = parseFloat(document.getElementById('mc-strike').value);
            
            if (!tipo || !vencimiento || !strike) {
                document.getElementById('info-opcion-mc').style.display = 'none';
                return;
            }

            const df = window.dfMcData || resultados.dfProcesado;
            const row = df.find(r => 
                r.tipoOpcion === tipo && 
                r.fechaVencimiento === vencimiento && 
                Math.abs(r.strike - strike) < 0.01
            );

            if (row) {
                document.getElementById('info-opcion-mc').style.display = 'block';
                document.getElementById('info-opcion-detalles').innerHTML = 
                    '<p><strong>Símbolo:</strong> ' + row.simbolo + '</p>' +
                    '<p><strong>Tipo:</strong> ' + row.tipoOpcion + '</p>' +
                    '<p><strong>Strike:</strong> ' + formatearStrike(row.strike) + '</p>' +
                    '<p><strong>Vencimiento:</strong> ' + formatearFechaVencimiento(row.fechaVencimiento || '') + '</p>' +
                    '<p><strong>Precio actual:</strong> $' + row.precioOpcion.toFixed(2) + '</p>';
            }
        }

        function ejecutarSimulacionIndividualMC() {
            const tipo = document.getElementById('mc-tipo').value;
            const vencimiento = document.getElementById('mc-vencimiento').value;
            const strike = parseFloat(document.getElementById('mc-strike').value);
            const cantidadContratos = parseInt(document.getElementById('mc-cantidad-contratos').value) || 1;
            
            // CORRECCIÓN: Validar y asegurar que se respete el número de simulaciones del input
            const nSimInput = document.getElementById('mc-n-simulaciones');
            let nSim = parseInt(nSimInput ? nSimInput.value : 10000);
            if (isNaN(nSim) || nSim < 1) {
                nSim = 10000;
            }
            nSim = Math.max(1, Math.floor(nSim));
            
            const comision = parseFloat(document.getElementById('mc-comision').value) || 0;

            if (!tipo || !vencimiento || !strike) {
                alert('Por favor, selecciona tipo, vencimiento y strike');
                return;
            }

            const df = window.dfMcData || resultados.dfProcesado;
            const row = df.find(r => 
                r.tipoOpcion === tipo && 
                r.fechaVencimiento === vencimiento && 
                Math.abs(r.strike - strike) < 0.01
            );

            if (!row) {
                alert('No se encontró la opción seleccionada');
                return;
            }

            // Ejecutar simulación
            const resultado = calcularProbabilidadProfitMontecarlo(row, nSim);
            
            if (!resultado.probProfit || !resultado.payoffs) {
                alert('No se pudo calcular la simulación Monte Carlo para esta opción.');
                return;
            }

            // Calcular payoffs totales considerando contratos y comisión
            const payoffsTotal = resultado.payoffs.map(p => p * cantidadContratos - comision);
            
            // Calcular inversión inicial
            const inversionInicial = row.precioOpcion * cantidadContratos + comision;

            // Determinar estado ITM/OTM/ATM
            let estadoOpcion = "N/A";
            if (row.tipoOpcion === 'Call') {
                if (row.precioSubyacente > row.strike) estadoOpcion = "ITM";
                else if (row.precioSubyacente < row.strike) estadoOpcion = "OTM";
                else estadoOpcion = "ATM";
            } else if (row.tipoOpcion === 'Put') {
                if (row.precioSubyacente < row.strike) estadoOpcion = "ITM";
                else if (row.precioSubyacente > row.strike) estadoOpcion = "OTM";
                else estadoOpcion = "ATM";
            }

            // Mostrar métricas
            const probProfit = resultado.probProfit;
            const gananciaEsperada = payoffsTotal.reduce((a, b) => a + b, 0) / payoffsTotal.length;
            const maxGanancia = Math.max(...payoffsTotal);
            const maxPerdida = Math.min(...payoffsTotal);

            document.getElementById('resultados-simulacion-individual').style.display = 'block';
            document.getElementById('metricas-simulacion-individual').innerHTML = 
                '<div class="metric">' +
                    '<div class="metric-label">Prima de la opción</div>' +
                    '<div class="metric-value">$' + row.precioOpcion.toFixed(2) + '</div>' +
                '</div>' +
                '<div class="metric">' +
                    '<div class="metric-label">Inversión inicial</div>' +
                    '<div class="metric-value">$' + inversionInicial.toFixed(2) + '</div>' +
                '</div>' +
                '<div class="metric">' +
                    '<div class="metric-label">Comisión</div>' +
                    '<div class="metric-value">$' + comision.toFixed(2) + '</div>' +
                '</div>' +
                '<div class="metric">' +
                    '<div class="metric-label">Estado</div>' +
                    '<div class="metric-value">' + estadoOpcion + '</div>' +
                '</div>' +
                '<div class="metric">' +
                    '<div class="metric-label">Probabilidad de Profit</div>' +
                    '<div class="metric-value">' + (probProfit * 100).toFixed(2) + '%</div>' +
                '</div>' +
                '<div class="metric">' +
                    '<div class="metric-label">Ganancia Esperada</div>' +
                    '<div class="metric-value">$' + gananciaEsperada.toFixed(2) + '</div>' +
                '</div>' +
                '<div class="metric">' +
                    '<div class="metric-label">Máxima Ganancia</div>' +
                    '<div class="metric-value">$' + maxGanancia.toFixed(2) + '</div>' +
                '</div>' +
                '<div class="metric">' +
                    '<div class="metric-label">Máxima Pérdida</div>' +
                    '<div class="metric-value">$' + maxPerdida.toFixed(2) + '</div>' +
                '</div>';

            // Graficar histograma
            const histograma = graficarHistogramaMontecarlo(payoffsTotal, row.tipoOpcion, row.strike, row.precioOpcion);
            setTimeout(() => {
                Plotly.newPlot('histograma-simulacion-individual', histograma.data, histograma.layout, {responsive: true});
            }, 100);

            // Estadísticas detalladas
            const percentil5 = calcularPercentil(payoffsTotal, 0.05);
            const percentil25 = calcularPercentil(payoffsTotal, 0.25);
            const mediana = calcularPercentil(payoffsTotal, 0.5);
            const percentil75 = calcularPercentil(payoffsTotal, 0.75);
            const percentil95 = calcularPercentil(payoffsTotal, 0.95);
            const desviacion = Math.sqrt(payoffsTotal.reduce((sum, p) => sum + Math.pow(p - gananciaEsperada, 2), 0) / payoffsTotal.length);

            document.getElementById('estadisticas-simulacion-individual').innerHTML = 
                '<div>' +
                    '<h4>Estadísticas Detalladas</h4>' +
                    '<p><strong>Percentil 5%:</strong> $' + percentil5.toFixed(2) + '</p>' +
                    '<p><strong>Percentil 25%:</strong> $' + percentil25.toFixed(2) + '</p>' +
                    '<p><strong>Mediana:</strong> $' + mediana.toFixed(2) + '</p>' +
                '</div>' +
                '<div>' +
                    '<h4>&nbsp;</h4>' +
                    '<p><strong>Percentil 75%:</strong> $' + percentil75.toFixed(2) + '</p>' +
                    '<p><strong>Percentil 95%:</strong> $' + percentil95.toFixed(2) + '</p>' +
                    '<p><strong>Desviación Estándar:</strong> $' + desviacion.toFixed(2) + '</p>' +
                '</div>';
        }

        function actualizarResumenMonteCarlo() {
            const df = window.dfMcData || resultados.dfProcesado;
            
            const probProfitPromedio = df.reduce((sum, r) => sum + (r.MC_ProbProfit || 0), 0) / df.length;
            const gananciaPromedio = df.reduce((sum, r) => sum + (r.MC_GananciaEsperada || 0), 0) / df.length;
            const opcionesRentables = df.filter(r => (r.MC_ProbProfit || 0) > 0.3).length;
            const opcionesMuyRentables = df.filter(r => (r.MC_ProbProfit || 0) > 0.5).length;

            const resumenDiv = document.getElementById('resumen-montecarlo');
            if (resumenDiv) {
                resumenDiv.innerHTML = 
                    '<div class="metric">' +
                        '<div class="metric-label">Prob. Profit Promedio</div>' +
                        '<div class="metric-value">' + (probProfitPromedio * 100).toFixed(2) + '%</div>' +
                    '</div>' +
                    '<div class="metric">' +
                        '<div class="metric-label">Ganancia Esperada Promedio</div>' +
                        '<div class="metric-value">$' + gananciaPromedio.toFixed(2) + '</div>' +
                    '</div>' +
                    '<div class="metric">' +
                        '<div class="metric-label">Opciones con >30% Prob. Profit</div>' +
                        '<div class="metric-value">' + opcionesRentables + '</div>' +
                    '</div>' +
                    '<div class="metric">' +
                        '<div class="metric-label">Opciones con >50% Prob. Profit</div>' +
                        '<div class="metric-value">' + opcionesMuyRentables + '</div>' +
                    '</div>';
            }

            // Análisis por tipo
            const calls = df.filter(r => r.tipoOpcion === 'Call');
            const puts = df.filter(r => r.tipoOpcion === 'Put');
            const analisisDiv = document.getElementById('analisis-por-tipo');
            if (analisisDiv) {
                let callsHtml = '';
                if (calls.length > 0) {
                    const mejorCall = calls.reduce((best, r) => (r.MC_ProbProfit || 0) > (best.MC_ProbProfit || 0) ? r : best);
                    const probProfitCalls = calls.reduce((sum, r) => sum + (r.MC_ProbProfit || 0), 0) / calls.length;
                    const gananciaEsperadaCalls = calls.reduce((sum, r) => sum + (r.MC_GananciaEsperada || 0), 0) / calls.length;
                    callsHtml = 
                        '<p><strong>Cantidad:</strong> ' + calls.length + '</p>' +
                        '<p><strong>Prob. Profit promedio:</strong> ' + (probProfitCalls * 100).toFixed(2) + '%</p>' +
                        '<p><strong>Ganancia esperada promedio:</strong> $' + gananciaEsperadaCalls.toFixed(2) + '</p>' +
                        '<p><strong>Mejor call:</strong> ' + formatearStrike(mejorCall.strike) + ' (Prob: ' + (mejorCall.MC_ProbProfit * 100).toFixed(2) + '%)</p>';
                } else {
                    callsHtml = '<p>No hay datos disponibles</p>';
                }
                
                let putsHtml = '';
                if (puts.length > 0) {
                    const mejorPut = puts.reduce((best, r) => (r.MC_ProbProfit || 0) > (best.MC_ProbProfit || 0) ? r : best);
                    const probProfitPuts = puts.reduce((sum, r) => sum + (r.MC_ProbProfit || 0), 0) / puts.length;
                    const gananciaEsperadaPuts = puts.reduce((sum, r) => sum + (r.MC_GananciaEsperada || 0), 0) / puts.length;
                    putsHtml = 
                        '<p><strong>Cantidad:</strong> ' + puts.length + '</p>' +
                        '<p><strong>Prob. Profit promedio:</strong> ' + (probProfitPuts * 100).toFixed(2) + '%</p>' +
                        '<p><strong>Ganancia esperada promedio:</strong> $' + gananciaEsperadaPuts.toFixed(2) + '</p>' +
                        '<p><strong>Mejor put:</strong> ' + formatearStrike(mejorPut.strike) + ' (Prob: ' + (mejorPut.MC_ProbProfit * 100).toFixed(2) + '%)</p>';
                } else {
                    putsHtml = '<p>No hay datos disponibles</p>';
                }
                
                analisisDiv.innerHTML = 
                    '<div>' +
                        '<h4>Calls</h4>' +
                        callsHtml +
                    '</div>' +
                    '<div>' +
                        '<h4>Puts</h4>' +
                        putsHtml +
                    '</div>';
            }

            // Tabla de mejores opciones
            const mejores = [...df].sort((a, b) => (b.MC_ProbProfit || 0) - (a.MC_ProbProfit || 0)).slice(0, 10);
            const mejoresDiv = document.getElementById('mejores-opciones-table');
            if (mejoresDiv) {
                let tabla = '<h4>Mejores Opciones por Probabilidad de Profit</h4><table class="data-table"><thead><tr><th>Tipo</th><th>Strike</th><th>Precio</th><th>Prob. Profit</th><th>Ganancia Esperada</th><th>Vencimiento</th></tr></thead><tbody>';
                mejores.forEach(row => {
                    tabla += 
                        '<tr>' +
                            '<td>' + row.tipoOpcion + '</td>' +
                            '<td>' + formatearStrike(row.strike) + '</td>' +
                            '<td>$' + row.precioOpcion.toFixed(2) + '</td>' +
                            '<td>' + ((row.MC_ProbProfit || 0) * 100).toFixed(2) + '%</td>' +
                            '<td>$' + (row.MC_GananciaEsperada || 0).toFixed(2) + '</td>' +
                            '<td>' + row.fechaVencimiento + '</td>' +
                        '</tr>';
                });
                tabla += '</tbody></table>';
                mejoresDiv.innerHTML = tabla;
            }

            // Gráfico de distribución de probabilidades
            const distribucionDiv = document.getElementById('distribucion-probabilidades');
            if (distribucionDiv) {
                setTimeout(() => {
                    const data = [{
                        x: df.map(r => (r.MC_ProbProfit || 0) * 100),
                        type: 'histogram',
                        nbinsx: 20,
                        name: 'Distribución',
                        marker: { color: '#42a5f5' }
                    }];
                    const layout = {
                        title: 'Distribución de Probabilidades de Profit (Monte Carlo)',
                        xaxis: { title: 'Probabilidad de Profit (%)' },
                        yaxis: { title: 'Cantidad de Opciones' },
                        plot_bgcolor: '#1a1a1a',
                        paper_bgcolor: '#232323',
                        font: { color: '#fff' },
                        height: 400
                    };
                    Plotly.newPlot('distribucion-probabilidades', data, layout, {responsive: true});
                }, 100);
            }
        }

        function mostrarGraficoPrecalculadoMC() {
            const df = window.dfMcData || resultados.dfProcesado;
            const calls = df.filter(r => r.tipoOpcion === 'Call');
            const puts = df.filter(r => r.tipoOpcion === 'Put');

            const tamaniosCalls = calcularTamaniosMarcadores(calls, 10, 35);
            const tamaniosPuts = calcularTamaniosMarcadores(puts, 10, 35);

            const traceCalls = {
                x: calls.map(r => (r.MC_ProbProfit || 0) * 100),
                y: calls.map(r => r.MC_GananciaEsperada || 0),
                mode: 'markers',
                type: 'scatter',
                name: 'Calls',
                marker: { 
                    symbol: 'triangle-up', 
                    size: tamaniosCalls, 
                    color: '#10b981',
                    opacity: 0.8,
                    line: { width: 1.5, color: '#059669' }
                },
                text: calls.map(r => r.simbolo + ' | Strike ' + r.strike + ' | Venc ' + formatearFechaVencimiento(r.fechaVencimiento || '')),
                customdata: calls.map(r => (r.montoOperado || 0)),
                hovertemplate: '<b>Call</b><br>%{text}<br>Prob. Profit: %{x:.2f}%<br>Ganancia Esperada: $%{y:.2f}<br>Monto Operado: $%{customdata:,.2f}<extra></extra>',
                hoverlabel: {
                    bgcolor: 'rgba(22, 22, 22, 0.95)',
                    bordercolor: '#10b981',
                    font: { color: '#ffffff', family: 'Inter', size: 12 }
                }
            };

            const tracePuts = {
                x: puts.map(r => (r.MC_ProbProfit || 0) * 100),
                y: puts.map(r => r.MC_GananciaEsperada || 0),
                mode: 'markers',
                type: 'scatter',
                name: 'Puts',
                marker: { 
                    symbol: 'triangle-down', 
                    size: tamaniosPuts, 
                    color: '#ef4444',
                    opacity: 0.8,
                    line: { width: 1.5, color: '#dc2626' }
                },
                text: puts.map(r => r.simbolo + ' | Strike ' + r.strike + ' | Venc ' + formatearFechaVencimiento(r.fechaVencimiento || '')),
                customdata: puts.map(r => (r.montoOperado || 0)),
                hovertemplate: '<b>Put</b><br>%{text}<br>Prob. Profit: %{x:.2f}%<br>Ganancia Esperada: $%{y:.2f}<br>Monto Operado: $%{customdata:,.2f}<extra></extra>',
                hoverlabel: {
                    bgcolor: 'rgba(22, 22, 22, 0.95)',
                    bordercolor: '#ef4444',
                    font: { color: '#ffffff', family: 'Inter', size: 12 }
                }
            };

            const layout = {
                title: {
                    text: 'Probabilidad de Profit vs Ganancia Esperada (Monte Carlo)',
                    font: { size: 20, color: '#ffffff', family: 'Inter' },
                    x: 0.5,
                    xanchor: 'center'
                },
                xaxis: { 
                    title: { text: 'Probabilidad de Profit (%)', font: { size: 14, color: '#b3b3b3', family: 'Inter' } },
                    gridcolor: '#252525',
                    linecolor: '#353535',
                    zeroline: false,
                    showgrid: true
                },
                yaxis: { 
                    title: { text: 'Ganancia Esperada ($)', font: { size: 14, color: '#b3b3b3', family: 'Inter' } },
                    gridcolor: '#252525',
                    linecolor: '#353535',
                    zeroline: true,
                    zerolinecolor: '#353535',
                    zerolinewidth: 1,
                    showgrid: true
                },
                plot_bgcolor: 'rgba(0,0,0,0)',
                paper_bgcolor: 'rgba(0,0,0,0)',
                font: { color: '#ffffff', family: 'Inter', size: 12 },
                hovermode: 'closest',
                height: 600,
                legend: { 
                    bgcolor: 'rgba(22, 22, 22, 0.8)',
                    bordercolor: '#252525',
                    borderwidth: 1,
                    font: { color: '#ffffff', size: 11 }
                },
                margin: { l: 80, r: 30, t: 80, b: 60 },
                autosize: true
            };

            setTimeout(() => {
                const div = document.getElementById('grafico-precalculado-montecarlo');
                if (div) {
                    Plotly.newPlot('grafico-precalculado-montecarlo', [traceCalls, tracePuts], layout, {
                        responsive: true,
                        autosize: true,
                        useResizeHandler: true
                    });
                    window.addEventListener('resize', () => {
                        Plotly.Plots.resize('grafico-precalculado-montecarlo');
                    });
                }
            }, 200);
        }

        function ejecutarSimulacionSimultaneaMC() {
            const nSim = parseInt(document.getElementById('mc-n-sim-comparativo').value) || 10000;
            const umbralProfit = parseFloat(document.getElementById('mc-umbral-profit').value) / 100 || 0;
            const ordenarPor = document.getElementById('mc-ordenar-comparativo').value;

            const df = window.dfMcData || resultados.dfProcesado;
            const resultadosSimultaneos = [];

            // Mostrar progreso
            const progressDiv = document.createElement('div');
            progressDiv.className = 'loading';
            progressDiv.innerHTML = 'Simulando todas las opciones...';
            document.getElementById('resultados-simulacion-simultanea').appendChild(progressDiv);

            // Simular todas las opciones
            setTimeout(() => {
                df.forEach((row, idx) => {
                    const resultado = calcularProbabilidadProfitMontecarlo(row, nSim);
                    if (resultado.probProfit !== null && resultado.payoffs) {
                        const gananciaEsperada = resultado.payoffs.reduce((a, b) => a + b, 0) / resultado.payoffs.length;
                        const maxGanancia = Math.max(...resultado.payoffs);
                        const maxPerdida = Math.min(...resultado.payoffs);
                        const ratioGananciaRiesgo = Math.abs(gananciaEsperada / maxPerdida) || 0;

                        resultadosSimultaneos.push({
                            simbolo: row.simbolo,
                            tipoOpcion: row.tipoOpcion,
                            strike: row.strike,
                            precioOpcion: row.precioOpcion,
                            fechaVencimiento: row.fechaVencimiento,
                            prob_profit: resultado.probProfit,
                            ganancia_esperada: gananciaEsperada,
                            max_ganancia: maxGanancia,
                            max_perdida: maxPerdida,
                            ratio_ganancia_riesgo: ratioGananciaRiesgo
                        });
                    }
                });

                progressDiv.remove();

                // Filtrar por umbral
                let dfFiltrado = resultadosSimultaneos.filter(r => r.prob_profit >= umbralProfit);

                // Ordenar
                if (ordenarPor === 'prob_profit') {
                    dfFiltrado.sort((a, b) => b.prob_profit - a.prob_profit);
                } else if (ordenarPor === 'ganancia_esperada') {
                    dfFiltrado.sort((a, b) => b.ganancia_esperada - a.ganancia_esperada);
                } else if (ordenarPor === 'ratio_ganancia_riesgo') {
                    dfFiltrado.sort((a, b) => b.ratio_ganancia_riesgo - a.ratio_ganancia_riesgo);
                } else if (ordenarPor === 'strike') {
                    dfFiltrado.sort((a, b) => a.strike - b.strike);
                }

                // Mostrar resultados
                mostrarResultadosSimulacionSimultanea(resultadosSimultaneos, dfFiltrado);
            }, 100);
        }

        function mostrarResultadosSimulacionSimultanea(resultados, filtrado) {
            const probPromedio = filtrado.length > 0 ? filtrado.reduce((sum, r) => sum + r.prob_profit, 0) / filtrado.length : 0;
            const gananciaPromedio = filtrado.length > 0 ? filtrado.reduce((sum, r) => sum + r.ganancia_esperada, 0) / filtrado.length : 0;

            document.getElementById('resultados-simulacion-simultanea').style.display = 'block';
            document.getElementById('metricas-simulacion-simultanea').innerHTML = 
                '<div class="metric">' +
                    '<div class="metric-label">Opciones analizadas</div>' +
                    '<div class="metric-value">' + resultados.length + '</div>' +
                '</div>' +
                '<div class="metric">' +
                    '<div class="metric-label">Opciones que superan umbral</div>' +
                    '<div class="metric-value">' + filtrado.length + '</div>' +
                '</div>' +
                '<div class="metric">' +
                    '<div class="metric-label">Prob. Profit promedio</div>' +
                    '<div class="metric-value">' + (probPromedio * 100).toFixed(2) + '%</div>' +
                '</div>' +
                '<div class="metric">' +
                    '<div class="metric-label">Ganancia esperada promedio</div>' +
                    '<div class="metric-value">$' + gananciaPromedio.toFixed(2) + '</div>' +
                '</div>';

            // Tabla de mejores opciones
            if (filtrado.length > 0) {
                let tabla = '<h4>Mejores Opciones según Simulación Simultánea</h4><table class="data-table"><thead><tr><th>Símbolo</th><th>Tipo</th><th>Strike</th><th>Precio</th><th>Prob. Profit</th><th>Ganancia Esperada</th><th>Ratio G/R</th><th>Vencimiento</th></tr></thead><tbody>';
                filtrado.slice(0, 15).forEach(row => {
                    tabla += 
                        '<tr>' +
                            '<td>' + row.simbolo + '</td>' +
                            '<td>' + row.tipoOpcion + '</td>' +
                            '<td>' + formatearStrike(row.strike) + '</td>' +
                            '<td>$' + row.precioOpcion.toFixed(2) + '</td>' +
                            '<td>' + (row.prob_profit * 100).toFixed(2) + '%</td>' +
                            '<td>$' + row.ganancia_esperada.toFixed(2) + '</td>' +
                            '<td>' + row.ratio_ganancia_riesgo.toFixed(2) + '</td>' +
                            '<td>' + row.fechaVencimiento + '</td>' +
                        '</tr>';
                });
                tabla += '</tbody></table>';
                document.getElementById('tabla-mejores-opciones-simultanea').innerHTML = tabla;

                // Gráfico comparativo
                const calls = filtrado.filter(r => r.tipoOpcion === 'Call');
                const puts = filtrado.filter(r => r.tipoOpcion === 'Put');
                
                const tamaniosCalls = calcularTamaniosMarcadores(calls, 10, 35);
                const tamaniosPuts = calcularTamaniosMarcadores(puts, 10, 35);
                
                const traceCalls = {
                    x: calls.map(r => r.prob_profit * 100),
                    y: calls.map(r => r.ganancia_esperada),
                    mode: 'markers',
                    type: 'scatter',
                    name: 'Calls',
                    marker: { 
                        symbol: 'triangle-up', 
                        size: tamaniosCalls, 
                        color: '#10b981',
                        opacity: 0.8,
                        line: { width: 1.5, color: '#059669' }
                    },
                    text: calls.map(r => r.simbolo + ' | Strike ' + formatearStrike(r.strike) + ' | Ratio ' + r.ratio_ganancia_riesgo.toFixed(2)),
                    customdata: calls.map(r => (r.montoOperado || 0)),
                    hovertemplate: '<b>Call</b><br>%{text}<br>Prob. Profit: %{x:.2f}%<br>Ganancia Esperada: $%{y:.2f}<br>Monto Operado: $%{customdata:,.2f}<extra></extra>',
                    hoverlabel: {
                        bgcolor: 'rgba(22, 22, 22, 0.95)',
                        bordercolor: '#10b981',
                        font: { color: '#ffffff', family: 'Inter', size: 12 }
                    }
                };

                const tracePuts = {
                    x: puts.map(r => r.prob_profit * 100),
                    y: puts.map(r => r.ganancia_esperada),
                    mode: 'markers',
                    type: 'scatter',
                    name: 'Puts',
                    marker: { 
                        symbol: 'triangle-down', 
                        size: tamaniosPuts, 
                        color: '#ef4444',
                        opacity: 0.8,
                        line: { width: 1.5, color: '#dc2626' }
                    },
                    text: puts.map(r => r.simbolo + ' | Strike ' + formatearStrike(r.strike) + ' | Ratio ' + r.ratio_ganancia_riesgo.toFixed(2)),
                    customdata: puts.map(r => (r.montoOperado || 0)),
                    hovertemplate: '<b>Put</b><br>%{text}<br>Prob. Profit: %{x:.2f}%<br>Ganancia Esperada: $%{y:.2f}<br>Monto Operado: $%{customdata:,.2f}<extra></extra>',
                    hoverlabel: {
                        bgcolor: 'rgba(22, 22, 22, 0.95)',
                        bordercolor: '#ef4444',
                        font: { color: '#ffffff', family: 'Inter', size: 12 }
                    }
                };

                const nSimComp = parseInt(document.getElementById('mc-n-sim-comparativo').value) || 10000;
                const layout = {
                    title: {
                        text: 'Comparación de Opciones (Simulación: ' + nSimComp.toLocaleString() + ' iteraciones)',
                        font: { size: 18, color: '#ffffff', family: 'Inter' },
                        x: 0.5,
                        xanchor: 'center'
                    },
                xaxis: { 
                    title: { text: 'Probabilidad de Profit (%)', font: { size: 14, color: '#b3b3b3', family: 'Inter' } },
                    gridcolor: '#252525',
                    linecolor: '#353535',
                    zeroline: false,
                    showgrid: true
                },
                yaxis: { 
                    title: { text: 'Ganancia Esperada ($)', font: { size: 14, color: '#b3b3b3', family: 'Inter' } },
                    gridcolor: '#252525',
                    linecolor: '#353535',
                    zeroline: true,
                    zerolinecolor: '#353535',
                    zerolinewidth: 1,
                    showgrid: true
                },
                plot_bgcolor: 'rgba(0,0,0,0)',
                paper_bgcolor: 'rgba(0,0,0,0)',
                font: { color: '#ffffff', family: 'Inter', size: 12 },
                height: 600,
                hovermode: 'closest',
                legend: { 
                    bgcolor: 'rgba(22, 22, 22, 0.8)',
                    bordercolor: '#252525',
                    borderwidth: 1,
                    font: { color: '#ffffff', size: 11 }
                },
                margin: { l: 80, r: 30, t: 80, b: 60 },
                autosize: true
            };
            
            setTimeout(() => {
                Plotly.newPlot('grafico-precalculado-montecarlo', [traceCalls, tracePuts], layout, {
                    responsive: true,
                    autosize: true,
                    useResizeHandler: true
                });
                window.addEventListener('resize', () => {
                    Plotly.Plots.resize('grafico-precalculado-montecarlo');
                });
            }, 100);

                setTimeout(() => {
                    Plotly.newPlot('grafico-comparativo-simultanea', [traceCalls, tracePuts], layout, {
                        responsive: true,
                        autosize: true,
                        useResizeHandler: true
                    });
                    window.addEventListener('resize', () => {
                        Plotly.Plots.resize('grafico-comparativo-simultanea');
                    });
                }, 100);

                // Análisis por tipo
                const analisisDiv = document.getElementById('analisis-por-tipo-simultanea');
                if (analisisDiv && calls.length > 0 && puts.length > 0) {
                    const mejorCall = calls.reduce((best, r) => r.prob_profit > best.prob_profit ? r : best);
                    const mejorPut = puts.reduce((best, r) => r.prob_profit > best.prob_profit ? r : best);
                    analisisDiv.innerHTML = 
                        '<div>' +
                            '<h4>Calls</h4>' +
                            '<p><strong>Cantidad:</strong> ' + calls.length + '</p>' +
                            '<p><strong>Mejor call:</strong> ' + formatearStrike(mejorCall.strike) + ' (Prob: ' + (mejorCall.prob_profit * 100).toFixed(2) + '%)</p>' +
                            '<p><strong>Ganancia esperada promedio:</strong> $' + (calls.reduce((sum, r) => sum + r.ganancia_esperada, 0) / calls.length).toFixed(2) + '</p>' +
                        '</div>' +
                        '<div>' +
                            '<h4>Puts</h4>' +
                            '<p><strong>Cantidad:</strong> ' + puts.length + '</p>' +
                            '<p><strong>Mejor put:</strong> ' + formatearStrike(mejorPut.strike) + ' (Prob: ' + (mejorPut.prob_profit * 100).toFixed(2) + '%)</p>' +
                            '<p><strong>Ganancia esperada promedio:</strong> $' + (puts.reduce((sum, r) => sum + r.ganancia_esperada, 0) / puts.length).toFixed(2) + '</p>' +
                        '</div>';
                }
            } else {
                document.getElementById('tabla-mejores-opciones-simultanea').innerHTML = 
                    '<div class="warning">No hay opciones que superen el umbral seleccionado.</div>';
            }
        }

        function mostrarDetallesOpcionSeleccionada() {
            const idx = parseInt(document.getElementById('mc-opcion-seleccionar').value);
            if (isNaN(idx)) {
                document.getElementById('detalles-opcion-seleccionada').innerHTML = '';
                return;
            }

            const df = window.dfMcData || resultados.dfProcesado;
            const row = df[idx];

            if (row) {
                document.getElementById('detalles-opcion-seleccionada').innerHTML = 
                    '<div style="padding: 1.5rem; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 12px; margin-top: 1rem;">' +
                        '<h4>Detalles de la opción</h4>' +
                        '<p><strong>Símbolo:</strong> ' + row.simbolo + '</p>' +
                        '<p><strong>Tipo:</strong> ' + row.tipoOpcion + '</p>' +
                        '<p><strong>Strike:</strong> ' + row.strike + '</p>' +
                        '<p><strong>Vencimiento:</strong> ' + formatearFechaVencimiento(row.fechaVencimiento || '') + '</p>' +
                        '<p><strong>Precio:</strong> $' + row.precioOpcion.toFixed(2) + '</p>' +
                        '<p><strong>Prob. Profit:</strong> ' + ((row.MC_ProbProfit || 0) * 100).toFixed(2) + '%</p>' +
                        '<p><strong>Ganancia Esperada:</strong> $' + (row.MC_GananciaEsperada || 0).toFixed(2) + '</p>' +
                    '</div>' +
                    '<p style="margin-top: 1rem;"><strong>¿Deseas operar esta opción?</strong></p>';
            }
        }

        // ==================== SISTEMA DE AYUDA ====================
        
        // Definiciones de ayuda
        const AYUDA_CONTENIDO = {
            // Métricas generales
            volatilidadImplicita: {
                titulo: 'Volatilidad Implícita',
                contenido: `
                    <p>La volatilidad implícita (VI) representa la expectativa del mercado sobre las fluctuaciones futuras del precio del activo subyacente.</p>
                    <div class="help-section">
                        <h4>Características:</h4>
                        <ul>
                            <li>Se deriva del precio de mercado de la opción usando el modelo Black-Scholes invertido</li>
                            <li>Valores altos (>100%) indican mayor incertidumbre o volatilidad esperada</li>
                            <li>Valores muy altos (200%) pueden indicar bajo volumen o datos poco confiables</li>
                        </ul>
                    </div>
                    <div class="formula">
                        <strong>Fórmula (Newton-Raphson):</strong><br>
                        σ<sub>n+1</sub> = σ<sub>n</sub> - (C<sub>market</sub> - C<sub>BS</sub>(σ<sub>n</sub>)) / vega(σ<sub>n</sub>)<br>
                        <small>donde C<sub>market</sub> es el precio de mercado y C<sub>BS</sub> es el precio según Black-Scholes</small>
                    </div>
                `
            },
            volatilidadHistorica: {
                titulo: 'Volatilidad Histórica',
                contenido: `
                    <p>La volatilidad histórica (VH) mide las fluctuaciones reales del precio del activo subyacente en el pasado.</p>
                    <div class="help-section">
                        <h4>Cálculo:</h4>
                        <ol>
                            <li>Se calculan los retornos logarítmicos diarios: r<sub>i</sub> = ln(P<sub>i</sub> / P<sub>i-1</sub>)</li>
                            <li>Se calcula la desviación estándar de los retornos</li>
                            <li>Se anualiza multiplicando por √252 (días de trading)</li>
                        </ol>
                    </div>
                    <div class="formula">
                        <strong>Fórmula:</strong><br>
                        σ<sub>histórica</sub> = √(Σ(r<sub>i</sub> - μ)² / (n-1)) × √252<br>
                        <small>donde μ es el retorno promedio y n el número de observaciones</small>
                    </div>
                `
            },
            delta: {
                titulo: 'Delta (Δ)',
                contenido: `
                    <p>Delta mide cuánto cambia el precio de la opción por cada $1 de cambio en el precio del subyacente.</p>
                    <div class="help-section">
                        <h4>Interpretación:</h4>
                        <ul>
                            <li><strong>Calls:</strong> Delta entre 0 y 1 (típicamente 0.5 para ATM)</li>
                            <li><strong>Puts:</strong> Delta entre -1 y 0 (típicamente -0.5 para ATM)</li>
                            <li>Delta cerca de 1/-1: Opción profundamente ITM</li>
                            <li>Delta cerca de 0: Opción profundamente OTM</li>
                        </ul>
                    </div>
                    <div class="formula">
                        <strong>Fórmula Black-Scholes:</strong><br>
                        Δ<sub>call</sub> = N(d₁)<br>
                        Δ<sub>put</sub> = N(d₁) - 1<br>
                        <small>donde N(x) es la función de distribución normal acumulada</small>
                    </div>
                `
            },
            gamma: {
                titulo: 'Gamma (Γ)',
                contenido: `
                    <p>Gamma mide la tasa de cambio de Delta. Indica cuánto cambia Delta por cada $1 de cambio en el subyacente.</p>
                    <div class="help-section">
                        <h4>Características:</h4>
                        <ul>
                            <li>Siempre positivo para opciones compradas (calls y puts)</li>
                            <li>Máximo en opciones ATM (at-the-money)</li>
                            <li>Se aproxima a 0 para opciones muy ITM o muy OTM</li>
                            <li>Aumenta a medida que se acerca el vencimiento</li>
                        </ul>
                    </div>
                    <div class="formula">
                        <strong>Fórmula:</strong><br>
                        Γ = φ(d₁) / (S × σ × √T)<br>
                        <small>donde φ es la función de densidad normal estándar</small>
                    </div>
                `
            },
            vega: {
                titulo: 'Vega (ν)',
                contenido: `
                    <p>Vega mide cuánto cambia el precio de la opción por cada 1% de cambio en la volatilidad implícita.</p>
                    <div class="help-section">
                        <h4>Características:</h4>
                        <ul>
                            <li>Siempre positivo para opciones compradas</li>
                            <li>Máximo en opciones ATM con vencimientos más lejanos</li>
                            <li>Disminuye a medida que se acerca el vencimiento</li>
                            <li>Importante para estrategias de volatilidad</li>
                        </ul>
                    </div>
                    <div class="formula">
                        <strong>Fórmula:</strong><br>
                        ν = S × φ(d₁) × √T<br>
                        <small>expresado como cambio por 1% de volatilidad</small>
                    </div>
                `
            },
            theta: {
                titulo: 'Theta (Θ)',
                contenido: `
                    <p>Theta mide la pérdida de valor de la opción por el paso del tiempo (decay temporal).</p>
                    <div class="help-section">
                        <h4>Características:</h4>
                        <ul>
                            <li>Generalmente negativo para opciones compradas</li>
                            <li>La pérdida de valor se acelera cerca del vencimiento</li>
                            <li>Máximo en opciones ATM</li>
                            <li>Expresa el cambio por día (dividido por 365)</li>
                        </ul>
                    </div>
                    <div class="formula">
                        <strong>Fórmula (simplificada):</strong><br>
                        Θ<sub>call</sub> = -(S × φ(d₁) × σ)/(2√T) - r × K × e<sup>-rT</sup> × N(d₂)<br>
                        <small>dividido por 365 para obtener decay diario</small>
                    </div>
                `
            },
            rho: {
                titulo: 'Rho (ρ)',
                contenido: `
                    <p>Rho mide cuánto cambia el precio de la opción por cada 1% de cambio en la tasa de interés libre de riesgo.</p>
                    <div class="help-section">
                        <h4>Características:</h4>
                        <ul>
                            <li>Positivo para calls, negativo para puts</li>
                            <li>Generalmente el menos relevante de las griegas</li>
                            <li>Más importante en opciones de largo plazo</li>
                            <li>Mayor impacto en opciones ITM</li>
                        </ul>
                    </div>
                    <div class="formula">
                        <strong>Fórmula:</strong><br>
                        ρ<sub>call</sub> = K × T × e<sup>-rT</sup> × N(d₂)<br>
                        ρ<sub>put</sub> = -K × T × e<sup>-rT</sup> × N(-d₂)
                    </div>
                `
            },
            probabilidadGanancia: {
                titulo: 'Probabilidad de Ganancia',
                contenido: `
                    <p>Estima la probabilidad de que la opción sea rentable al vencimiento.</p>
                    <div class="help-section">
                        <h4>Cálculo:</h4>
                        <ul>
                            <li><strong>Calls:</strong> Probabilidad de que S > K + Prima pagada</li>
                            <li><strong>Puts:</strong> Probabilidad de que S < K - Prima pagada</li>
                            <li>Se calcula usando la distribución normal del modelo Black-Scholes</li>
                        </ul>
                    </div>
                    <div class="formula">
                        <strong>Para Calls:</strong><br>
                        P(ganancia) = N(d₂') donde d₂' considera el punto de equilibrio<br>
                        Punto de equilibrio = K + Prima
                    </div>
                `
            },
            probabilidadITM: {
                titulo: 'Probabilidad In-The-Money (ITM)',
                contenido: `
                    <p>Mide la probabilidad de que la opción termine <strong>dentro del dinero</strong>, independientemente de la prima pagada.</p>
                    <div class="help-section">
                        <h4>Interpretación:</h4>
                        <ul>
                            <li>No considera el costo de la prima ni comisiones</li>
                            <li>Equivale a la probabilidad de que el payoff bruto sea &gt; 0</li>
                            <li>Útil para evaluar la presión direccional necesaria del subyacente</li>
                        </ul>
                    </div>
                    <div class="help-section">
                        <h4>Cálculo en Monte Carlo:</h4>
                        <ul>
                            <li><strong>Calls:</strong> % de simulaciones donde S<sub>T</sub> &gt; K</li>
                            <li><strong>Puts:</strong> % de simulaciones donde S<sub>T</sub> &lt; K</li>
                            <li>Se basa únicamente en el movimiento del subyacente</li>
                        </ul>
                    </div>
                `
            },
            montoOperado: {
                titulo: 'Monto Operado',
                contenido: `
                    <p>Valor total negociado de la opción en el mercado.</p>
                    <div class="help-section">
                        <h4>Cálculo:</h4>
                        <p>Monto Operado = Volumen × Precio × Tamaño del Contrato</p>
                        <p>En Argentina (BCBA), cada contrato de opción representa 100 acciones del subyacente.</p>
                    </div>
                    <div class="formula">
                        <strong>Ejemplo:</strong><br>
                        Si se operaron 50 contratos a $0.25:<br>
                        Monto = 50 × $0.25 × 100 = $1,250
                    </div>
                `
            },
            spread: {
                titulo: 'Spread Bid-Ask',
                contenido: `
                    <p>Diferencia entre el precio de compra (bid) y el precio de venta (ask).</p>
                    <div class="help-section">
                        <h4>Interpretación:</h4>
                        <ul>
                            <li>Spread bajo (< 10%): Buena liquidez</li>
                            <li>Spread moderado (10-30%): Liquidez aceptable</li>
                            <li>Spread alto (> 30%): Baja liquidez, puede ser difícil operar</li>
                        </ul>
                    </div>
                    <div class="formula">
                        <strong>Fórmula:</strong><br>
                        Spread % = ((Precio Ask - Precio Bid) / Precio Mid) × 100<br>
                        Precio Mid = (Ask + Bid) / 2
                    </div>
                `
            },
            montecarloSimulacion: {
                titulo: 'Simulación Monte Carlo',
                contenido: `
                    <p>Método estadístico que simula miles de trayectorias posibles del precio del subyacente para estimar resultados de la opción.</p>
                    <div class="help-section">
                        <h4>Proceso:</h4>
                        <ol>
                            <li>Se genera el precio final usando un modelo geométrico browniano</li>
                            <li>Se calcula el payoff de la opción para ese precio</li>
                            <li>Se repite N veces (típicamente 10,000)</li>
                            <li>Se calculan estadísticas sobre los resultados</li>
                        </ol>
                    </div>
                    <div class="formula">
                        <strong>Modelo de precio:</strong><br>
                        S<sub>T</sub> = S<sub>0</sub> × e<sup>(μ - σ²/2)T + σ√T × Z</sup><br>
                        <small>donde Z ~ N(0,1) es una variable aleatoria normal</small>
                    </div>
                    <div class="help-section">
                        <h4>Métricas calculadas:</h4>
                        <ul>
                            <li><strong>Prob. de Ganancia:</strong> % de simulaciones con resultado positivo</li>
                            <li><strong>Ganancia Esperada:</strong> Promedio de todas las simulaciones</li>
                            <li><strong>VaR 95%:</strong> Pérdida máxima en el 95% de los casos</li>
                            <li><strong>Ratio Riesgo/Retorno:</strong> Ganancia máxima / Pérdida máxima</li>
                        </ul>
                    </div>
                `
            },
            blackScholes: {
                titulo: 'Modelo Black-Scholes',
                contenido: `
                    <p>Modelo matemático para valorar opciones europeas desarrollado por Fischer Black, Myron Scholes y Robert Merton.</p>
                    <div class="help-section">
                        <h4>Supuestos del modelo:</h4>
                        <ul>
                            <li>Los precios siguen un movimiento browniano geométrico</li>
                            <li>No hay costos de transacción ni impuestos</li>
                            <li>La tasa libre de riesgo es constante</li>
                            <li>La volatilidad es constante</li>
                            <li>Solo ejercicio al vencimiento (europea)</li>
                        </ul>
                    </div>
                    <div class="formula">
                        <strong>Fórmulas:</strong><br>
                        C = S×N(d₁) - K×e<sup>-rT</sup>×N(d₂)<br>
                        P = K×e<sup>-rT</sup>×N(-d₂) - S×N(-d₁)<br><br>
                        d₁ = (ln(S/K) + (r + σ²/2)T) / (σ√T)<br>
                        d₂ = d₁ - σ√T
                    </div>
                `
            },
            factorLiquidez: {
                titulo: 'Factor de Liquidez',
                contenido: `
                    <p>Indicador que combina volumen operado y spread bid-ask para evaluar qué tan fácil es entrar/salir de una posición.</p>
                    <div class="help-section">
                        <h4>Clasificación:</h4>
                        <ul>
                            <li><strong>Alta (>7):</strong> Excelente liquidez, fácil de operar</li>
                            <li><strong>Media (4-7):</strong> Liquidez aceptable</li>
                            <li><strong>Baja (<4):</strong> Difícil de operar, spreads amplios</li>
                        </ul>
                    </div>
                    <div class="formula">
                        <strong>Fórmula:</strong><br>
                        Factor = Score_Volumen × (1 + Penalización_Spread)<br>
                        Spread ajustado = Spread × Factor
                    </div>
                `
            },
            var: {
                titulo: 'Value at Risk (VaR)',
                contenido: `
                    <p>El VaR (Value at Risk) mide la pérdida máxima esperada en un nivel de confianza específico (típicamente 95%).</p>
                    <div class="help-section">
                        <h4>Interpretación:</h4>
                        <ul>
                            <li><strong>VaR 95%:</strong> Pérdida máxima en el 95% de los escenarios simulados</li>
                            <li>Un VaR de -$1,000 significa que en el 95% de los casos, la pérdida no superará $1,000</li>
                            <li>El 5% restante puede tener pérdidas mayores</li>
                            <li>Útil para dimensionar el capital de riesgo necesario</li>
                        </ul>
                    </div>
                    <div class="formula">
                        <strong>Cálculo (Monte Carlo):</strong><br>
                        VaR<sub>95%</sub> = Percentil 5% de la distribución de payoffs<br>
                        <small>Se ordenan todos los resultados y se toma el valor en el percentil 5</small>
                    </div>
                    <div class="help-section">
                        <h4>Ejemplo:</h4>
                        <p>Si VaR 95% = -$500, significa que en 9,500 de 10,000 simulaciones, la pérdida fue menor a $500. Solo en 500 casos (5%) la pérdida fue mayor.</p>
                    </div>
                `
            }
        };

        // Funciones para mostrar ayuda
        function mostrarAyuda(concepto) {
            const ayuda = AYUDA_CONTENIDO[concepto];
            if (!ayuda) {
                console.error('No se encontró ayuda para:', concepto);
                return;
            }

            document.getElementById('modal-ayuda-titulo').textContent = ayuda.titulo;
            document.getElementById('modal-ayuda-contenido').innerHTML = ayuda.contenido;
            document.getElementById('modal-ayuda').style.display = 'flex';
        }

        function cerrarModalAyuda() {
            document.getElementById('modal-ayuda').style.display = 'none';
        }

        function mostrarAyudaGeneral() {
            document.getElementById('modal-ayuda-titulo').textContent = 'Guía de Análisis de Opciones';
            document.getElementById('modal-ayuda-contenido').innerHTML = `
                <div class="help-section">
                    <h3>📊 Métricas Principales</h3>
                    <p>Haz clic en cualquier ícono <span class="help-icon">?</span> para ver explicaciones detalladas.</p>
                    <ul style="margin-top: 1rem;">
                        <li><a href="#" onclick="event.preventDefault(); mostrarAyuda('volatilidadImplicita');">Volatilidad Implícita</a></li>
                        <li><a href="#" onclick="event.preventDefault(); mostrarAyuda('delta');">Delta (Δ)</a></li>
                        <li><a href="#" onclick="event.preventDefault(); mostrarAyuda('gamma');">Gamma (Γ)</a></li>
                        <li><a href="#" onclick="event.preventDefault(); mostrarAyuda('vega');">Vega (ν)</a></li>
                        <li><a href="#" onclick="event.preventDefault(); mostrarAyuda('theta');">Theta (Θ)</a></li>
                        <li><a href="#" onclick="event.preventDefault(); mostrarAyuda('rho');">Rho (ρ)</a></li>
                    </ul>
                </div>
                
                <div class="help-section" style="margin-top: 2rem;">
                    <h3>🎯 Herramientas de Análisis</h3>
                    <ul>
                        <li><a href="#" onclick="event.preventDefault(); mostrarAyuda('blackScholes');">Modelo Black-Scholes</a></li>
                        <li><a href="#" onclick="event.preventDefault(); mostrarAyuda('montecarloSimulacion');">Simulación Monte Carlo</a></li>
                        <li><a href="#" onclick="event.preventDefault(); mostrarAyuda('probabilidadGanancia');">Probabilidad de Ganancia</a></li>
                        <li><a href="#" onclick="event.preventDefault(); mostrarAyuda('factorLiquidez');">Factor de Liquidez</a></li>
                    </ul>
                </div>

                <div class="help-section" style="margin-top: 2rem;">
                    <h3>⚠️ Advertencias Importantes</h3>
                    <ul>
                        <li><strong>VI 200%:</strong> Indica datos poco confiables o bajo volumen</li>
                        <li><strong>Delta extremo:</strong> Opción muy ITM o OTM, cálculos menos precisos</li>
                        <li><strong>Spread alto:</strong> Dificulta la ejecución a precios justos</li>
                        <li><strong>Volumen bajo:</strong> Puede ser difícil cerrar la posición</li>
                    </ul>
                </div>

                <div class="help-section" style="margin-top: 2rem;">
                    <h3>📝 Notas del Modelo</h3>
                    <p><strong>Tamaño de contrato:</strong> 100 acciones por contrato (BCBA)</p>
                    <p><strong>Comisiones:</strong> Personalizables en la simulación Monte Carlo</p>
                    <p><strong>Tasa libre de riesgo:</strong> Configurada según tasas argentinas</p>
                </div>
            `;
            document.getElementById('modal-ayuda').style.display = 'flex';
        }

        // Cerrar modal al hacer clic fuera
        window.onclick = function(event) {
            const modal = document.getElementById('modal-ayuda');
            if (event.target === modal) {
                cerrarModalAyuda();
            }
        };

        // ==================== CAMBIAR MODO DE GRÁFICO MONTE CARLO ====================
        
        function cambiarModoGrafico(modo) {
            if (!window.renderizarGraficoMonteCarlo) {
                console.warn('Función de renderizado no disponible');
                return;
            }
            
            // Actualizar radio buttons
            const radioResultados = document.querySelector('input[name="modo-grafico"][value="resultados"]');
            const radioPrecio = document.querySelector('input[name="modo-grafico"][value="precio"]');
            const labelResultados = document.getElementById('modo-resultados-label');
            const labelPrecio = document.getElementById('modo-precio-label');
            
            if (modo === 'resultados') {
                if (radioResultados) radioResultados.checked = true;
                if (labelResultados) {
                    labelResultados.style.background = 'rgba(66, 165, 245, 0.1)';
                    labelResultados.style.borderColor = 'rgba(66, 165, 245, 0.3)';
                }
                if (labelPrecio) {
                    labelPrecio.style.background = 'rgba(255,255,255,0.05)';
                    labelPrecio.style.borderColor = 'rgba(255,255,255,0.2)';
                }
            } else {
                if (radioPrecio) radioPrecio.checked = true;
                if (labelPrecio) {
                    labelPrecio.style.background = 'rgba(66, 165, 245, 0.1)';
                    labelPrecio.style.borderColor = 'rgba(66, 165, 245, 0.3)';
                }
                if (labelResultados) {
                    labelResultados.style.background = 'rgba(255,255,255,0.05)';
                    labelResultados.style.borderColor = 'rgba(255,255,255,0.2)';
                }
            }
            
            // Renderizar gráfico con el modo seleccionado
            window.renderizarGraficoMonteCarlo(modo);
        }

        // ==================== RECALCULAR PROBABILIDADES MONTE CARLO ====================
        
        function recalcularProbabilidadesMC() {
            if (!resultados || !resultados.dfProcesado) {
                alert('No hay datos para recalcular. Primero ejecuta el análisis.');
                return;
            }
            
            // CORRECCIÓN: Validar y asegurar que se respete el número de simulaciones del input
            const nSimNuevoInput = document.getElementById('recalc-simulaciones');
            let nSimNuevo = parseInt(nSimNuevoInput ? nSimNuevoInput.value : 10000);
            if (isNaN(nSimNuevo) || nSimNuevo < 1) {
                nSimNuevo = 10000;
            }
            nSimNuevo = Math.max(1, Math.floor(nSimNuevo));
            
            if (nSimNuevo < 1000) {
                alert('El mínimo es 1000 simulaciones');
                return;
            }
            
            if (nSimNuevo > 100000) {
                alert('El máximo es 100,000 simulaciones para evitar bloquear el navegador');
                return;
            }
            
            // Mostrar loading
            const tablaDiv = document.getElementById('tab-0');
            const scrollPos = window.scrollY;
            tablaDiv.innerHTML = '<div class="loading">Recalculando probabilidades con ' + nSimNuevo.toLocaleString() + ' simulaciones...</div>';
            
            // Recalcular en el siguiente tick para permitir que se muestre el loading
            setTimeout(() => {
                try {
                    // Recalcular Monte Carlo para cada opción
                    resultados.dfProcesado.forEach(row => {
                        if (row.T && row.T > 0) {
                            const mc = calcularMonteCarloSimple(
                                row.tipoOpcion,
                                row.precioSubyacente,
                                row.strike,
                                row.T,
                                row.volatilidadImplicita,
                                row.precioOpcion,
                                nSimNuevo
                            );
                            
                            // Actualizar valores Monte Carlo
                            row.MC_ProbProfit = mc.probProfit;
                            row.MC_GananciaEsperada = mc.gananciaEsperada;
                            row.MC_ProbITM = mc.probITM;
                        }
                    });
                    
                    // Actualizar configuración global
                    document.getElementById('config-simulaciones-global').value = nSimNuevo;
                    
                    // Regenerar tabla
                    tablaDiv.innerHTML = mostrarTablaOpciones();
                    
                    // Restaurar posición de scroll
                    window.scrollTo(0, scrollPos);
                    
                    // Mostrar mensaje de éxito
                    const mensaje = document.createElement('div');
                    mensaje.className = 'success';
                    mensaje.innerHTML = '✅ Probabilidades recalculadas con ' + nSimNuevo.toLocaleString() + ' simulaciones';
                    mensaje.style.position = 'fixed';
                    mensaje.style.top = '20px';
                    mensaje.style.right = '20px';
                    mensaje.style.zIndex = '9999';
                    mensaje.style.padding = '1rem 1.5rem';
                    mensaje.style.borderRadius = '8px';
                    mensaje.style.animation = 'slideIn 0.3s ease';
                    document.body.appendChild(mensaje);
                    
                    setTimeout(() => {
                        mensaje.style.opacity = '0';
                        mensaje.style.transition = 'opacity 0.3s';
                        setTimeout(() => mensaje.remove(), 300);
                    }, 3000);
                    
                } catch (error) {
                    console.error('Error al recalcular:', error);
                    tablaDiv.innerHTML = '<div class="error">Error al recalcular: ' + error.message + '</div>';
                }
            }, 100);
        }

    // Funciones para el backtesting individual
    function actualizarDatosOpcionBacktesting() {
        const select = document.getElementById('bt-opcion');
        const selectedOption = select.value;
        
        if (!selectedOption) return;
        
        const opcion = resultados.dfProcesado.find(opt => opt.simbolo === selectedOption);
        if (opcion) {
            // Establecer fecha de vencimiento como límite máximo
            const fechaVentaInput = document.getElementById('bt-fecha-venta');
            if (opcion.vencimiento) {
                fechaVentaInput.max = opcion.vencimiento.split('T')[0];
            }
        }
    }

    function validarFechasBacktesting() {
        const fechaCompra = document.getElementById('bt-fecha-compra').value;
        const fechaVenta = document.getElementById('bt-fecha-venta').value;
        
        if (fechaCompra && fechaVenta) {
            if (new Date(fechaCompra) >= new Date(fechaVenta)) {
                document.getElementById('bt-fecha-venta').setCustomValidity('La fecha de venta debe ser posterior a la de compra');
            } else {
                document.getElementById('bt-fecha-venta').setCustomValidity('');
            }
        }
    }

    async function ejecutarBacktesting() {
        const opcionSimbolo = document.getElementById('bt-opcion').value;
        const fechaCompra = document.getElementById('bt-fecha-compra').value;
        const fechaVenta = document.getElementById('bt-fecha-venta').value;
        const cantidad = parseInt(document.getElementById('bt-cantidad').value);
        const operacion = document.getElementById('bt-operacion').value;

        // Validaciones
        if (!opcionSimbolo || !fechaCompra || !fechaVenta) {
            alert('Por favor completá todos los campos');
            return;
        }

        if (new Date(fechaCompra) >= new Date(fechaVenta)) {
            alert('La fecha de venta debe ser posterior a la de compra');
            return;
        }

        // Mostrar loading
        document.getElementById('bt-loading').style.display = 'block';
        document.getElementById('bt-resultados').style.display = 'none';

        try {
            // Obtener datos de la opción seleccionada
            const opcion = resultados.dfProcesado.find(opt => opt.simbolo === opcionSimbolo);
            if (!opcion) {
                throw new Error('No se encontró la opción seleccionada');
            }

            // Obtener precios históricos para las fechas seleccionadas
            const token = getAuthToken();
            const precioCompra = await obtenerPrecioOpcionEnFecha(opcionSimbolo, fechaCompra, token);
            const precioVenta = await obtenerPrecioOpcionEnFecha(opcionSimbolo, fechaVenta, token);

            if (!precioCompra || !precioVenta) {
                throw new Error('No se pudieron obtener los precios para las fechas seleccionadas');
            }

            // Calcular resultados
            const resultadosBacktest = calcularResultadosBacktesting(
                opcion, precioCompra, precioVenta, cantidad, operacion, fechaCompra, fechaVenta
            );

            // Mostrar resultados
            mostrarResultadosBacktestingIndividual(resultadosBacktest);

        } catch (error) {
            console.error('Error en backtesting:', error);
            alert('Error al ejecutar el backtesting: ' + error.message);
        } finally {
            document.getElementById('bt-loading').style.display = 'none';
        }
    }

    async function obtenerPrecioOpcionEnFecha(simbolo, fecha, token) {
        try {
            // Intentar obtener datos históricos del activo subyacente
            const subyacente = simbolo.substring(0, simbolo.indexOf(' '));
            const datosHistoricos = await dataService.getHistoricalData(subyacente, token, '6M');
            
            if (!datosHistoricos || datosHistoricos.length === 0) {
                throw new Error('No se encontraron datos históricos');
            }

            // Buscar el precio más cercano a la fecha solicitada
            const fechaBuscada = new Date(fecha);
            let precioCercano = null;
            let menorDiferencia = Infinity;

            for (const dato of datosHistoricos) {
                const diferencia = Math.abs(new Date(dato.date) - fechaBuscada);
                if (diferencia < menorDiferencia) {
                    menorDiferencia = diferencia;
                    precioCercano = dato.close;
                }
            }

            return precioCercano;
        } catch (error) {
            console.error('Error obteniendo precio histórico:', error);
            return null;
        }
    }

    function calcularResultadosBacktesting(opcion, precioCompra, precioVenta, cantidad, operacion, fechaCompra, fechaVenta) {
        const multiplicador = 100; // Cada contrato de opción es por 100 acciones
        const costoTotal = precioCompra * cantidad * multiplicador;
        const valorTotal = precioVenta * cantidad * multiplicador;
        
        let gananciaPerdida = 0;
        let porcentajeRetorno = 0;

        if (operacion === 'compra') {
            gananciaPerdida = valorTotal - costoTotal;
            porcentajeRetorno = ((valorTotal - costoTotal) / costoTotal) * 100;
        } else { // venta
            gananciaPerdida = costoTotal - valorTotal;
            porcentajeRetorno = ((costoTotal - valorTotal) / costoTotal) * 100;
        }

        const dias = Math.ceil((new Date(fechaVenta) - new Date(fechaCompra)) / (1000 * 60 * 60 * 24));
        const retornoAnualizado = porcentajeRetorno * (365 / dias);

        return {
            opcion: opcion,
            operacion: operacion,
            cantidad: cantidad,
            fechaCompra: fechaCompra,
            fechaVenta: fechaVenta,
            precioCompra: precioCompra,
            precioVenta: precioVenta,
            costoTotal: costoTotal,
            valorTotal: valorTotal,
            gananciaPerdida: gananciaPerdida,
            porcentajeRetorno: porcentajeRetorno,
            dias: dias,
            retornoAnualizado: retornoAnualizado,
            multiplicador: multiplicador
        };
    }

    function mostrarResultadosBacktestingIndividual(resultados) {
        const resultadoDiv = document.getElementById('bt-resultado-detalle');
        
        const colorGanancia = resultados.gananciaPerdida >= 0 ? '#00ff88' : '#ff4444';
        const signo = resultados.gananciaPerdida >= 0 ? '+' : '';
        
        const html = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
                <div style="padding: 1rem; background: rgba(255, 255, 255, 0.03); border-radius: 8px; border-left: 4px solid ${colorGanancia};">
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Ganancia/Pérdida</div>
                    <div style="font-size: 1.5rem; font-weight: 600; color: ${colorGanancia};">
                        ${signo}$${resultados.gananciaPerdida.toFixed(2)}
                    </div>
                    <div style="font-size: 0.9rem; color: ${colorGanancia}; margin-top: 0.25rem;">
                        ${signo}${resultados.porcentajeRetorno.toFixed(2)}%
                    </div>
                </div>
                
                <div style="padding: 1rem; background: rgba(255, 255, 255, 0.03); border-radius: 8px;">
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Operación</div>
                    <div style="font-size: 1.1rem; color: var(--text-primary);">${resultados.operacion === 'compra' ? 'Compra' : 'Venta'} de ${resultados.cantidad} contrato(s)</div>
                    <div style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 0.25rem;">
                        ${resultados.opcion.tipo === 'call' ? 'Call' : 'Put'} $${resultados.opcion.strike}
                    </div>
                </div>
                
                <div style="padding: 1rem; background: rgba(255, 255, 255, 0.03); border-radius: 8px;">
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Período</div>
                    <div style="font-size: 1.1rem; color: var(--text-primary);">${resultados.dias} días</div>
                    <div style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 0.25rem;">
                        Retorno anualizado: ${signo}${resultados.retornoAnualizado.toFixed(2)}%
                    </div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
                <div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Precio Compra</div>
                    <div style="font-size: 1rem; color: var(--text-primary);">$${resultados.precioCompra.toFixed(2)}</div>
                </div>
                <div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Precio Venta</div>
                    <div style="font-size: 1rem; color: var(--text-primary);">$${resultados.precioVenta.toFixed(2)}</div>
                </div>
                <div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Costo Total</div>
                    <div style="font-size: 1rem; color: var(--text-primary);">$${resultados.costoTotal.toFixed(2)}</div>
                </div>
                <div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Valor Total</div>
                    <div style="font-size: 1rem; color: var(--text-primary);">$${resultados.valorTotal.toFixed(2)}</div>
                </div>
            </div>
        `;
        
        resultadoDiv.innerHTML = html;
        
        // Crear gráfico de rendimiento
        crearGraficoRendimientoBacktesting(resultados);
        
        // Mostrar sección de resultados
        document.getElementById('bt-resultados').style.display = 'block';
    }

    function crearGraficoRendimientoBacktesting(resultados) {
        const graficoDiv = document.getElementById('bt-grafico-rendimiento');
        
        const trace = {
            x: [resultados.fechaCompra, resultados.fechaVenta],
            y: [resultados.precioCompra, resultados.precioVenta],
            type: 'scatter',
            mode: 'lines+markers',
            name: 'Precio de la Opción',
            line: {
                color: resultados.gananciaPerdida >= 0 ? '#00ff88' : '#ff4444',
                width: 3
            },
            marker: {
                size: 8,
                color: ['#6b7280', resultados.gananciaPerdida >= 0 ? '#00ff88' : '#ff4444']
            }
        };

        const layout = {
            title: {
                text: `Evolución del Precio - ${resultados.opcion.simbolo}`,
                font: { color: '#d4d7dc' }
            },
            xaxis: {
                title: 'Fecha',
                color: '#7a7f85',
                gridcolor: '#1a1e23'
            },
            yaxis: {
                title: 'Precio ($)',
                color: '#7a7f85',
                gridcolor: '#1a1e23'
            },
            paper_bgcolor: '#0a0e13',
            plot_bgcolor: '#111419',
            font: { color: '#d4d7dc' },
            margin: { t: 50, r: 30, b: 50, l: 70 },
            showlegend: false,
            annotations: [
                {
                    x: resultados.fechaCompra,
                    y: resultados.precioCompra,
                    text: `Compra: $${resultados.precioCompra.toFixed(2)}`,
                    showarrow: true,
                    arrowhead: 2,
                    arrowcolor: '#6b7280',
                    font: { color: '#d4d7dc', size: 12 }
                },
                {
                    x: resultados.fechaVenta,
                    y: resultados.precioVenta,
                    text: `Venta: $${resultados.precioVenta.toFixed(2)}`,
                    showarrow: true,
                    arrowhead: 2,
                    arrowcolor: resultados.gananciaPerdida >= 0 ? '#00ff88' : '#ff4444',
                    font: { color: '#d4d7dc', size: 12 }
                }
            ]
        };

        const config = {
            responsive: true,
            displayModeBar: false
        };

        Plotly.newPlot(graficoDiv, [trace], layout, config);
    }

    function limpiarBacktesting() {
        document.getElementById('bt-opcion').value = '';
        document.getElementById('bt-fecha-compra').value = '';
        document.getElementById('bt-fecha-venta').value = '';
        document.getElementById('bt-cantidad').value = '1';
        document.getElementById('bt-operacion').value = 'compra';
        document.getElementById('bt-resultados').style.display = 'none';
        document.getElementById('bt-grafico-rendimiento').innerHTML = '';
    }

    // Función para poblar el selector de opciones en el backtesting
    function poblarSelectorOpcionesBacktesting() {
        const select = document.getElementById('bt-opcion');
        if (!select || !resultados || !resultados.dfProcesado) return;

        select.innerHTML = '<option value="">Elegí una opción...</option>';
        
        // Agregar opciones actuales
        if (resultados.dfProcesado.length > 0) {
            const actualesGroup = document.createElement('optgroup');
            actualesGroup.label = `--- Opciones Disponibles (${resultados.dfProcesado.length}) ---`;
            
            resultados.dfProcesado.forEach(opcion => {
                const option = document.createElement('option');
                option.value = opcion.simbolo;
                option.textContent = `${opcion.simbolo} - ${opcion.tipo === 'call' ? 'Call' : 'Put'} $${opcion.strike} - Vence: ${opcion.vencimiento ? opcion.vencimiento.split('T')[0] : 'N/A'}`;
                actualesGroup.appendChild(option);
            });
            
            select.appendChild(actualesGroup);
        }

        // Agregar botón para buscar opciones vencidas
        const container = select.parentElement;
        
        // Limpiar botones existentes
        const existingBtn = container.querySelector('.btn-vencidas');
        if (existingBtn) {
            existingBtn.remove();
        }
        
        // Crear contenedor para el botón
        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'margin-top: 0.5rem; text-align: center;';
        
        const buscarVencidasBtn = document.createElement('button');
        buscarVencidasBtn.textContent = '🔍 Buscar Opciones Vencidas';
        buscarVencidasBtn.className = 'btn btn-secondary btn-vencidas';
        buscarVencidasBtn.style.cssText = 'padding: 0.5rem 1rem; font-size: 0.9rem;';
        buscarVencidasBtn.onclick = () => buscarOpcionesVencidas();
        
        btnContainer.appendChild(buscarVencidasBtn);
        container.appendChild(btnContainer);
        
        // Agregar instrucciones
        const instructions = document.createElement('div');
        instructions.style.cssText = 'color: var(--text-secondary); font-size: 0.85rem; margin-top: 0.5rem; line-height: 1.4;';
        instructions.innerHTML = `
            💡 <strong>Instrucciones:</strong><br>
            • Seleccioná una opción de las disponibles o<br>
            • Buscá opciones vencidas para ampliar opciones de backtesting
        `;
        
        const existingInstructions = container.querySelector('.instructions');
        if (existingInstructions) {
            existingInstructions.remove();
        }
        instructions.className = 'instructions';
        container.appendChild(instructions);
    }

    // Función global para obtener el token de autenticación
    function getAuthToken() {
        // Intentar obtener desde authService si está disponible
        if (typeof authService !== 'undefined' && authService.getAuthToken) {
            return authService.getAuthToken();
        }
        
        // Intentar obtener desde variables globales
        if (typeof authToken !== 'undefined') {
            return authToken;
        }
        
        // Intentar obtener desde localStorage
        const token = localStorage.getItem('iol_token') || localStorage.getItem('authToken');
        if (token) {
            return token;
        }
        
        throw new Error('No se encontró token de autenticación. Por favor iniciá sesión.');
    }

    // Función para buscar opciones vencidas
    async function buscarOpcionesVencidas() {
        const select = document.getElementById('bt-opcion');
        const symbol = document.getElementById('subyacente').value;
        
        if (!symbol) {
            alert('Por favor seleccioná un activo subyacente primero');
            return;
        }

        // Mostrar loading
        const btn = document.querySelector('.btn-vencidas');
        const originalText = btn.textContent;
        btn.textContent = 'Buscando...';
        btn.disabled = true;

        try {
            const token = getAuthToken(); // Usar función global en lugar de authService
            
            // Obtener opciones históricas/vencidas
            const opcionesVencidas = await dataService.getHistoricalOptions(symbol, token);
            
            if (opcionesVencidas && opcionesVencidas.length > 0) {
                // Agregar opciones vencidas al selector
                const vencidasGroup = document.createElement('optgroup');
                vencidasGroup.label = `--- Opciones Vencidas (${opcionesVencidas.length} encontradas) ---`;
                
                opcionesVencidas.forEach(opcion => {
                    const option = document.createElement('option');
                    option.value = opcion.symbol;
                    
                    const expiryDate = opcion.expiry ? new Date(opcion.expiry).toLocaleDateString() : 'N/A';
                    const status = opcion.isExpired ? 'VENCIDA' : 'POR VENCER';
                    const statusColor = opcion.isExpired ? '#ff4444' : '#ffaa00';
                    
                    option.textContent = `${opcion.symbol} - ${opcion.type === 'call' ? 'Call' : 'Put'} $${opcion.strike} - ${status}: ${expiryDate}`;
                    option.style.color = statusColor;
                    option.dataset.expired = opcion.isExpired;
                    
                    vencidasGroup.appendChild(option);
                });
                
                select.appendChild(vencidasGroup);
                
                // Mostrar mensaje de éxito
                const mensaje = document.createElement('div');
                mensaje.className = 'success-message';
                mensaje.textContent = `Se encontraron ${opcionesVencidas.length} opciones vencidas o próximas a vencer`;
                mensaje.style.cssText = 'background: rgba(0, 255, 136, 0.1); color: #00ff88; padding: 0.5rem; border-radius: 4px; margin-top: 0.5rem; font-size: 0.9rem;';
                
                const container = select.parentElement;
                container.appendChild(mensaje);
                
                setTimeout(() => mensaje.remove(), 5000);
                
            } else {
                // Intentar explorar endpoints disponibles
                console.log('Buscando endpoints disponibles...');
                const endpoints = await dataService.exploreAvailableEndpoints(token);
                console.log('Endpoints disponibles:', endpoints);
                
                const mensaje = document.createElement('div');
                mensaje.style.cssText = 'background: rgba(255, 170, 0, 0.1); color: #ffaa00; padding: 0.5rem; border-radius: 4px; margin-top: 0.5rem; font-size: 0.9rem;';
                mensaje.textContent = 'No se encontraron opciones vencidas. Revisá la consola para ver endpoints disponibles.';
                
                const container = select.parentElement;
                container.appendChild(mensaje);
                
                setTimeout(() => mensaje.remove(), 8000);
            }
            
        } catch (error) {
            console.error('Error buscando opciones vencidas:', error);
            alert('Error al buscar opciones vencidas: ' + error.message);
        } finally {
            // Restaurar botón
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    // Modificar la función actualizarDatosOpcionBacktesting para manejar opciones vencidas
    function actualizarDatosOpcionBacktesting() {
        const select = document.getElementById('bt-opcion');
        const selectedOption = select.value;
        
        if (!selectedOption) return;
        
        // Buscar en opciones actuales
        let opcion = resultados.dfProcesado.find(opt => opt.simbolo === selectedOption);
        
        // Si no se encuentra, podría ser una opción vencida (no tenemos datos completos)
        if (!opcion) {
            const selectedOptionElement = select.querySelector(`option[value="${selectedOption}"]`);
            if (selectedOptionElement && selectedOptionElement.dataset.expired === 'true') {
                // Es una opción vencida, mostrar advertencia
                const warningDiv = document.createElement('div');
                warningDiv.style.cssText = 'background: rgba(255, 68, 68, 0.1); color: #ff4444; padding: 0.5rem; border-radius: 4px; margin-top: 0.5rem; font-size: 0.9rem;';
                warningDiv.textContent = '⚠️ Opción vencida - Los datos históricos podrían ser limitados';
                
                const container = select.parentElement;
                const existingWarning = container.querySelector('.expired-warning');
                if (existingWarning) {
                    existingWarning.remove();
                }
                warningDiv.className = 'expired-warning';
                container.appendChild(warningDiv);
            }
        } else {
            // Opción normal, establecer fecha de vencimiento como límite máximo
            const fechaVentaInput = document.getElementById('bt-fecha-venta');
            if (opcion.vencimiento) {
                fechaVentaInput.max = opcion.vencimiento.split('T')[0];
            }
            
            // Remover advertencia si existe
            const existingWarning = select.parentElement.querySelector('.expired-warning');
            if (existingWarning) {
                existingWarning.remove();
            }
        }
    }

    // Llamar a esta función cuando se carga el tab de backtesting
    function inicializarTabBacktesting() {
        poblarSelectorOpcionesBacktesting();
        
        // Establecer fechas por defecto
        const hoy = new Date();
        const haceUnMes = new Date(hoy.getTime() - (30 * 24 * 60 * 60 * 1000));
        const haceDosMeses = new Date(hoy.getTime() - (60 * 24 * 60 * 60 * 1000));
        
        document.getElementById('bt-fecha-compra').value = haceDosMeses.toISOString().split('T')[0];
        document.getElementById('bt-fecha-venta').value = haceUnMes.toISOString().split('T')[0];
    }

    // Función para análisis cuantitativo completo de opciones
    function realizarAnalisisCuantitativo() {
        if (!resultados || !resultados.dfProcesado || resultados.dfProcesado.length === 0) {
            alert('No hay datos de opciones disponibles para análisis cuantitativo.');
            return;
        }

        // Crear instancia del analista
        const analista = new AnalistaCuantitativoOpciones();
        
        // Actualizar contexto de mercado con datos actuales
        const spotActual = resultados.precioSpot || 6985;
        analista.contextoMercado.spotActual = spotActual;
        analista.contextoMercado.subyacente = document.getElementById('subyacente').value || 'GGAL';

        // Generar diagnósticos para todas las opciones
        const diagnosticos = [];
        const opcionesConDatos = resultados.dfProcesado.map(opcion => {
            // Enriquecer datos para el análisis
            const opcionEnriquecida = {
                ...opcion,
                precioSubyacente: spotActual,
                primaTeorica: opcion.precioTeorico || opcion.precioOpcion,
                spreadBidAsk: calcularSpreadPorcentaje(opcion),
                probabilidadITM: calcularProbabilidadITM(opcion, spotActual)
            };
            
            return opcionEnriquecida;
        });

        // Procesar cada opción
        opcionesConDatos.forEach(opcion => {
            try {
                const diagnostico = analista.generarDiagnosticoCompleto(opcion);
                diagnosticos.push(diagnostico);
            } catch (error) {
                console.error('Error procesando opción:', opcion.simbolo, error);
            }
        });

        // Mostrar resultados
        mostrarResultadosAnalisisCuantitativo(diagnosticos, analista);
    }

    // Calcular spread bid/ask como porcentaje
    function calcularSpreadPorcentaje(opcion) {
        const bid = opcion.bid || 0;
        const ask = opcion.ask || 0;
        const midprice = (bid + ask) / 2;
        
        if (midprice === 0) return 0;
        return ((ask - bid) / midprice) * 100;
    }

    // Calcular probabilidad ITM (usar delta como aproximación o datos existentes)
    function calcularProbabilidadITM(opcion, spotActual) {
        // Si ya tiene probabilidad calculada, usarla
        if (opcion.probabilidadITM) {
            return opcion.probabilidadITM;
        }
        
        // Usar delta como aproximación (para calls) o (1 + delta) para puts
        if (opcion.tipo === 'call' && opcion.delta !== undefined) {
            return opcion.delta * 100;
        } else if (opcion.tipo === 'put' && opcion.delta !== undefined) {
            return (1 + opcion.delta) * 100;
        }
        
        // Calcular usando Black-Scholes si tenemos los datos
        if (opcion.volatilidadImplicita && opcion.strike && opcion.vencimiento) {
            try {
                const T = calcularDiasAlVencimiento(opcion.vencimiento) / 365;
                if (T > 0) {
                    const bs = blackScholes(
                        opcion.tipo,
                        spotActual,
                        opcion.strike,
                        T,
                        0, // tasa libre de riesgo
                        opcion.volatilidadImplicita / 100
                    );
                    return (bs.prob || 0) * 100;
                }
            } catch (error) {
                console.error('Error calculando probabilidad ITM:', error);
            }
        }
        
        // Último recurso: estimación basada en moneyness
        const moneyness = (spotActual - opcion.strike) / opcion.strike;
        if (opcion.tipo === 'call') {
            return Math.max(0, Math.min(100, 50 + moneyness * 100));
        } else {
            return Math.max(0, Math.min(100, 50 - moneyness * 100));
        }
    }

    // Calcular días al vencimiento
    function calcularDiasAlVencimiento(vencimiento) {
        if (!vencimiento) return 0;
        
        const fechaVenc = new Date(vencimiento);
        const hoy = new Date();
        const diffTime = Math.abs(fechaVenc - hoy);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    // Mostrar resultados del análisis cuantitativo
    function mostrarResultadosAnalisisCuantitativo(diagnosticos, analista) {
        // Crear modal o sección para mostrar resultados
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            z-index: 10000;
            overflow-y: auto;
            padding: 2rem;
            box-sizing: border-box;
        `;

        // Contenido del modal
        modal.innerHTML = `
            <div style="max-width: 1200px; margin: 0 auto; background: var(--bg-primary); border-radius: 12px; padding: 2rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                    <h2 style="color: var(--text-primary); margin: 0;">📊 Análisis Cuantitativo de Opciones</h2>
                    <button onclick="this.closest('.modal-analisis').remove()" style="background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color); padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer;">✕ Cerrar</button>
                </div>
                
                <div style="margin-bottom: 2rem; padding: 1rem; background: var(--bg-secondary); border-radius: 8px;">
                    <h3 style="color: var(--text-primary); margin-bottom: 0.5rem;">📈 Contexto de Mercado</h3>
                    <div style="color: var(--text-secondary); line-height: 1.6;">
                        <strong>Subyacente:</strong> ${analista.contextoMercado.subyacente} | 
                        <strong>Spot:</strong> $${analista.contextoMercado.spotActual} | 
                        <strong>MA200:</strong> $${analista.contextoMercado.ma200} | 
                        <strong>RSI(14):</strong> ${analista.contextoMercado.rsi14}<br>
                        <strong>Tendencia:</strong> ${analista.contextoMercado.tendencia}<br>
                        <strong>Sesgo Volatilidad:</strong> ${analista.contextoMercado.sesgoVolatilidad}
                    </div>
                </div>

                <div style="margin-bottom: 2rem;">
                    <h3 style="color: var(--text-primary); margin-bottom: 1rem;">🎯 Opciones Analizadas (${diagnosticos.length})</h3>
                    <div id="diagnosticos-container" style="display: grid; gap: 1rem;">
                        <!-- Los diagnósticos se agregarán aquí -->
                    </div>
                </div>
            </div>
        `;

        modal.className = 'modal-analisis';
        document.body.appendChild(modal);

        // Agregar diagnósticos individuales
        const container = modal.querySelector('#diagnosticos-container');
        diagnosticos.forEach((diagnostico, index) => {
            const diagnosticoDiv = document.createElement('div');
            diagnosticoDiv.style.cssText = `
                background: var(--bg-secondary);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                padding: 1.5rem;
                margin-bottom: 1rem;
            `;

            // Formatear diagnóstico de manera compacta
            diagnosticoDiv.innerHTML = `
                <div style="display: grid; grid-template-columns: 1fr auto; gap: 1rem; align-items: start;">
                    <div>
                        <h4 style="color: var(--text-primary); margin: 0 0 0.5rem 0;">
                            ${diagnostico.ticker} | ${diagnostico.tipo} | $${diagnostico.strike} | ${diagnostico.vencimiento}
                        </h4>
                        
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
                            <div>
                                <strong style="color: var(--accent-primary);">Moneyness:</strong> ${diagnostico.moneyness.clasificacion}<br>
                                <span style="color: var(--text-secondary); font-size: 0.9rem;">${diagnostico.moneyness.interpretacion}</span>
                            </div>
                            

                            <div>
                                <strong style="color: var(--accent-primary);">Delta:</strong> ${diagnostico.griegasClave.delta.valor.toFixed(3)}<br>
                                <span style="color: var(--text-secondary); font-size: 0.9rem;">${diagnostico.griegasClave.delta.interpretacion}</span>
                            </div>
                            

                            <div>
                                <strong style="color: var(--accent-primary);">Theta:</strong> ${diagnostico.griegasClave.theta.valor.toFixed(3)}<br>
                                <span style="color: var(--text-secondary); font-size: 0.9rem;">${diagnostico.griegasClave.theta.interpretacion}</span>
                            </div>
                            

                            <div>
                                <strong style="color: var(--accent-primary);">IV:</strong> ${diagnostico.volatilidadImplicita.iv.toFixed(1)}% (${diagnostico.volatilidadImplicita.clasificacion})<br>
                                <span style="color: var(--text-secondary); font-size: 0.9rem;">${diagnostico.volatilidadImplicita.interpretacion}</span>
                            </div>
                        </div>
                        
                        <div style="margin-bottom: 1rem;">
                            <strong style="color: var(--accent-primary);">Diagnóstico:</strong><br>
                            <span style="color: var(--text-primary);">${diagnostico.diagnosticoGeneral}</span>
                        </div>
                        
                        <div>
                            <strong style="color: var(--accent-primary);">Estrategias Sugeridas:</strong><br>
                            <span style="color: var(--text-success);">${diagnostico.estrategiasSugeridas.join(' • ')}</span>
                        </div>
                    </div>
                    
                    <div style="text-align: right;">
                        <button onclick="mostrarDiagnosticoCompleto(${index})" style="background: var(--accent-primary); color: var(--bg-primary); border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; font-size: 0.9rem;">
                            📋 Ver Completo
                        </button>
                    </div>
                </div>
            `;

            container.appendChild(diagnosticoDiv);
        });

        // Función para mostrar diagnóstico completo
        window.mostrarDiagnosticoCompleto = function(index) {
            const diagnostico = diagnosticos[index];
            const analista = new AnalistaCuantitativoOpciones();
            const formatoCompleto = analista.formatearDiagnostico(diagnostico);
            
            alert(formatoCompleto);
        };
    }

    // Modificar la función mostrarTab para agregar el análisis cuantitativo
    const mostrarTabOriginal = mostrarTab;
    mostrarTab = function(index) {
        mostrarTabOriginal(index);
        
        if (index === 2) { // Tab de backtesting
            setTimeout(() => {
                inicializarTabBacktesting();
            }, 100);
        }
    };

    