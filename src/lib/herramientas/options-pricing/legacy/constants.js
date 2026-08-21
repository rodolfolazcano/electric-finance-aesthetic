// Configuración y constantes de la aplicación
// Basado en "Finanzas con Python 33 FINAL: Greeks versión intuitiva"

export const API_CONFIG = {
    BASE_URL: 'https://api.invertironline.com',
    ENDPOINTS: {
        LOGIN: '/api/v2/autenticacion/nuevo-token',
        OPCIONES: '/api/v2/mercado/valores/precios',
        COTIZACIONES: '/api/v2/mercado/precioshistoricos',
        ESTADISTICAS: '/api/v2/mercado/estadisticas'
    }
};

export const PROXY_CONFIG = {
    VERCEL_URL: 'https://yf-proxy.vercel.app',
    LOCAL_PROXY: 'http://localhost:3001',
    CORS_PROXIES: [
        'https://cors-anywhere.herokuapp.com/',
        'https://api.allorigins.win/raw?url=',
        'https://thingproxy.freeboard.io/fetch/'
    ]
};

export const SIMULATION_CONFIG = {
    DEFAULT_SIMULATIONS: 10000,
    MIN_SIMULATIONS: 1000,
    MAX_SIMULATIONS: 100000,
    RISK_FREE_RATE: 0,             // r≈0 para BS de opciones sobre acciones BYMA (carry en spot)
    RISK_FREE_RATE_CAUCIONES: 0.8, // solo referencia informativa, NO para pricing BS
    DAYS_TO_EXPIRY_DEFAULT: 30,
    
    // Nuevos parámetros estocásticos según el video
    STOCHASTIC_PROCESSES: {
        GEOMETRIC_BROWNIAN: {
            name: 'Movimiento Geométrico Browniano',
            enabled: true,
            description: 'Modelo estándar Black-Scholes con drift y volatilidad constante'
        },
        MEAN_REVERSION: {
            name: 'Proceso con Reversión a la Media',
            enabled: false,
            speed: 0.5,              // Velocidad de reversión (κ)
            longTermMean: null,        // Media de largo plazo (μ) - null usa precio spot
            volatility: null,          // Volatilidad del proceso - null usa volatilidad implícita
            description: 'Proceso de Ornstein-Uhlenbeck para activos que tienden a revertir'
        },
        JUMP_DIFFUSION: {
            name: 'Difusión con Saltos (Merton)',
            enabled: false,
            jumpIntensity: 0.1,       // Intensidad de saltos (λ)
            jumpMean: 0,              // Media de saltos (μJ)
            jumpVolatility: 0.2,      // Volatilidad de saltos (σJ)
            description: 'Modelo Merton para capturar eventos extremos'
        }
    },
    
    // Configuración de Greeks
    GREEKS_CONFIG: {
        CALCULATION_METHOD: 'ANALYTICAL', // 'ANALYTICAL' | 'FINITE_DIFFERENCE'
        FINITE_DIFFERENCE_STEP: 0.01,    // h para cálculo numérico
        SENSITIVITY_SCENARIOS: {
            SPOT_CHANGE: 0.10,           // ±10% cambio en spot
            VOL_CHANGE: 0.20,            // ±20% cambio en volatilidad
            TIME_DECAY: 7,               // 7 días de time decay
            RATE_CHANGE: 0.01             // ±1% cambio en tasa
        },
        WARNING_THRESHOLDS: {
            HIGH_GAMMA: 0.01,           // Gamma > 0.01 = alta curvatura
            HIGH_THETA_ABS: 0.05,        // |Theta| > 0.05 = time decay acelerado
            LOW_VEGA: 0.05,              // Vega < 0.05 = baja sensibilidad a vol
            EXPIRY_WARNING: 7             // < 7 días = advertencia de vencimiento
        }
    },
    
    // Configuración de visualización
    VISUALIZATION: {
        TIME_POINTS: [0, 5, 15, 30, 60], // Días hasta vencimiento para gráficos
        PRICE_RANGE_STDEV: 3.0,           // Rango de precios en desvíos estándar
        SURFACE_RESOLUTION: 20,             // Resolución para superficie 3D
        CHART_COLORS: {
            CALL: '#00ff88',
            PUT: '#ff4444',
            DELTA: '#2196f3',
            GAMMA: '#ff9800',
            THETA: '#9c27b0',
            VEGA: '#4caf50',
            RHO: '#795548'
        }
    }
};

export const UI_CONFIG = {
    ANIMATION_DURATION: 200,
    TOOLTIP_DELAY: 300,
    AUTO_REFRESH_INTERVAL: 30000,
    MAX_TABLE_ROWS: 100,
    GREEKS_TABLE_CONFIG: {
        SHOW_INTERPRETATION: true,
        SHOW_WARNINGS: true,
        DECIMAL_PLACES: {
            DELTA: 4,
            GAMMA: 4,
            THETA: 4,
            VEGA: 2,
            RHO: 4
        }
    }
};

export const ASSETS = {
    ARGENTINE_STOCKS: [
        'ALUA', 'BBAR', 'BHIP', 'BMA', 'BYMA', 'CECO2', 'CEPU', 'COME',
        'GGAL', 'PAMP', 'SUPV', 'TECO2', 'TGSU2', 'TRAN', 'TXAR', 'YPFD'
    ]
};

export const MESSAGES = {
    AUTH_SUCCESS: 'Autenticación exitosa',
    AUTH_ERROR: 'Error en la autenticación',
    CONNECTION_ERROR: 'Error de conexión',
    LOADING: 'Cargando...',
    NO_DATA: 'No hay datos disponibles',
    CALCULATION_ERROR: 'Error en el cálculo',
    GREEKS_WARNING: '⚠️ Advertencia de Greeks',
    HIGH_GAMMA_WARNING: 'Gamma elevada - alta sensibilidad del Delta',
    TIME_DECAY_WARNING: 'Time Decay acelerado cerca del vencimiento',
    VOLATILITY_WARNING: 'Alta sensibilidad a cambios de volatilidad'
};

export const COLORS = {
    CHART: {
        CALL: '#00ff88',
        PUT: '#ff4444',
        PROFIT: '#00ff88',
        LOSS: '#ff4444',
        BREAKEVEN: '#ffaa00',
        BACKGROUND: '#1a1a1a',
        GRID: '#444444',
        TEXT: '#ffffff'
    },
    GREEKS: {
        POSITIVE: '#4caf50',
        NEGATIVE: '#f44336',
        NEUTRAL: '#ff9800',
        WARNING: '#ff5722'
    }
};

export const FORMULAS = {
    BLACK_SCHOLES: {
        CALL: 'C = S₀N(d₁) - Ke^(-rT)N(d₂)',
        PUT: 'P = Ke^(-rT)N(-d₂) - S₀N(-d₁)',
        D1: 'd₁ = [ln(S₀/K) + (r + σ²/2)T] / (σ√T)',
        D2: 'd₂ = d₁ - σ√T'
    },
    GREEKS: {
        DELTA: 'Δ = ∂V/∂S',
        GAMMA: 'Γ = ∂²V/∂S²',
        THETA: 'Θ = ∂V/∂T',
        VEGA: 'ν = ∂V/∂σ',
        RHO: 'ρ = ∂V/∂r',
        INTUITIVE_DELTA: 'Probabilidad de terminar ITM',
        INTUITIVE_GAMMA: 'Curvatura - sensibilidad del Delta',
        INTUITIVE_THETA: 'Time Decay - pérdida por día',
        INTUITIVE_VEGA: 'Sensibilidad a volatilidad (+1%)'
    },
    STOCHASTIC_PROCESSES: {
        GBM: 'dS = μSdt + σSdW',
        ORNSTEIN_UHLENBECK: 'dS = κ(μ - S)dt + σdW',
        MERTON_JUMP: 'dS = μSdt + σSdW + JdN'
    }
};

export const GREEKS_INTERPRETATION = {
    DELTA: {
        CALL: {
            RANGE_0_03: 'Muy OTM - baja probabilidad ITM',
            RANGE_03_07: 'OTM - probabilidad moderada',
            RANGE_07_04: 'ATM - probabilidad ~50%',
            RANGE_04_07: 'ITM - alta probabilidad',
            RANGE_07_1: 'Muy ITM - casi seguro'
        },
        PUT: {
            RANGE_m1_m07: 'Muy ITM - casi seguro',
            RANGE_m07_m04: 'ITM - alta probabilidad',
            RANGE_m04_m03: 'ATM - probabilidad ~50%',
            RANGE_m03_0: 'OTM - probabilidad moderada',
            RANGE_0_03: 'Muy OTM - baja probabilidad'
        }
    },
    GAMMA: {
        LOW: 'Delta estable - baja curvatura',
        MEDIUM: 'Curvatura moderada',
        HIGH: 'Alta curvatura - Delta cambia rápidamente',
        EXTREME: 'Gamma infinita cerca de vencimiento'
    },
    THETA: {
        POSITIVE: 'Ganancia temporal (raro)',
        SMALL_NEGATIVE: 'Time Decay moderado',
        MODERATE_NEGATIVE: 'Time Decay significativo',
        HIGH_NEGATIVE: 'Time Decay acelerado'
    },
    VEGA: {
        LOW: 'Baja sensibilidad a volatilidad',
        MEDIUM: 'Sensibilidad moderada',
        HIGH: 'Alta sensibilidad a volatilidad',
        EXTREME: 'Máxima sensibilidad ATM'
    }
};
