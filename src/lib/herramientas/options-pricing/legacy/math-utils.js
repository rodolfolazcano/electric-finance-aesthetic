// Funciones matemáticas para análisis de opciones
// Basado en "Finanzas con Python 33 FINAL: Greeks versión intuitiva"

export class MathUtils {
    // Función de distribución normal acumulada (CDF) - Abramowitz & Stegun 7.1.26
    // La exponencial debe ser exp(-x²/2) (PDF normal), NO exp(-x²) que sería erf
    static normalCDF(x) {
        const a1 =  0.254829592;
        const a2 = -0.284496736;
        const a3 =  1.421413741;
        const a4 = -1.453152027;
        const a5 =  1.061405429;
        const p  =  0.3275911;

        const sign = x < 0 ? -1 : 1;
        const absX = Math.abs(x);
        const t = 1.0 / (1.0 + p * absX);
        const poly = ((((a5 * t + a4) * t + a3) * t + a2) * t + a1);
        const y = 1.0 - poly * t * Math.exp(-absX * absX / 2.0);

        return 0.5 * (1.0 + sign * y);
    }

    // Función de densidad normal (PDF)
    static normalPDF(x) {
        return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
    }

    // Cálculo de d1 para Black-Scholes
    static calculateD1(S, K, r, sigma, T) {
        return (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    }

    // Cálculo de d2 para Black-Scholes
    static calculateD2(d1, sigma, T) {
        return d1 - sigma * Math.sqrt(T);
    }

    // Black-Scholes para Call Europea
    static blackScholesCall(S, K, r, sigma, T) {
        if (T <= 0) return Math.max(0, S - K);
        
        const d1 = this.calculateD1(S, K, r, sigma, T);
        const d2 = this.calculateD2(d1, sigma, T);
        
        return S * this.normalCDF(d1) - K * Math.exp(-r * T) * this.normalCDF(d2);
    }

    // Black-Scholes para Put Europea
    static blackScholesPut(S, K, r, sigma, T) {
        if (T <= 0) return Math.max(0, K - S);
        
        const d1 = this.calculateD1(S, K, r, sigma, T);
        const d2 = this.calculateD2(d1, sigma, T);
        
        return K * Math.exp(-r * T) * this.normalCDF(-d2) - S * this.normalCDF(-d1);
    }

    // Delta para Call - Versión intuitiva: probabilidad de terminar ITM
    static callDelta(S, K, r, sigma, T) {
        if (T <= 0) return S > K ? 1 : 0;
        const d1 = this.calculateD1(S, K, r, sigma, T);
        return this.normalCDF(d1);
    }

    // Delta para Put - Versión intuitiva: -probabilidad de terminar ITM
    static putDelta(S, K, r, sigma, T) {
        if (T <= 0) return S > K ? 0 : -1;
        const d1 = this.calculateD1(S, K, r, sigma, T);
        return this.normalCDF(d1) - 1;
    }

    // Gamma - Versión intuitiva: curvatura, sensibilidad del Delta
    // Se vuelve infinita cerca del vencimiento (como se muestra en el video)
    static gamma(S, K, r, sigma, T) {
        if (T <= 0) return 0;
        const d1 = this.calculateD1(S, K, r, sigma, T);
        return this.normalPDF(d1) / (S * sigma * Math.sqrt(T));
    }

    // Theta para Call - Versión intuitiva: decaimiento temporal (Time Decay)
    // Representa cuánto pierde la opción por cada día que pasa
    static callTheta(S, K, r, sigma, T) {
        if (T <= 0) return 0;
        const d1 = this.calculateD1(S, K, r, sigma, T);
        const d2 = this.calculateD2(d1, sigma, T);
        
        const theta = -(S * this.normalPDF(d1) * sigma) / (2 * Math.sqrt(T)) 
                     - r * K * Math.exp(-r * T) * this.normalCDF(d2);
        
        return theta / 365; // Convertir a theta diario
    }

    // Theta para Put - Versión intuitiva: decaimiento temporal
    static putTheta(S, K, r, sigma, T) {
        if (T <= 0) return 0;
        const d1 = this.calculateD1(S, K, r, sigma, T);
        const d2 = this.calculateD2(d1, sigma, T);
        
        const theta = -(S * this.normalPDF(d1) * sigma) / (2 * Math.sqrt(T)) 
                     + r * K * Math.exp(-r * T) * this.normalCDF(-d2);
        
        return theta / 365; // Convertir a theta diario
    }

    // Vega - Versión intuitiva: sensibilidad a la volatilidad
    // Mide cuánto cambia el precio por 1% de cambio en volatilidad
    static vega(S, K, r, sigma, T) {
        if (T <= 0) return 0;
        const d1 = this.calculateD1(S, K, r, sigma, T);
        return S * this.normalPDF(d1) * Math.sqrt(T) / 100; // Por 1% cambio en volatilidad
    }

    // Rho para Call - Sensibilidad a tasas de interés
    static callRho(S, K, r, sigma, T) {
        if (T <= 0) return 0;
        const d2 = this.calculateD2(this.calculateD1(S, K, r, sigma, T), sigma, T);
        return K * T * Math.exp(-r * T) * this.normalCDF(d2) / 100; // Por 1% cambio en tasa
    }

    // Rho para Put - Sensibilidad a tasas de interés
    static putRho(S, K, r, sigma, T) {
        if (T <= 0) return 0;
        const d2 = this.calculateD2(this.calculateD1(S, K, r, sigma, T), sigma, T);
        return -K * T * Math.exp(-r * T) * this.normalCDF(-d2) / 100; // Por 1% cambio en tasa
    }

    // Calcular todas las griegas para una opción
    static calculateGreeks(optionType, S, K, r, sigma, T) {
        const d1 = this.calculateD1(S, K, r, sigma, T);
        const d2 = this.calculateD2(d1, sigma, T);

        const greeks = {
            delta: optionType === 'call' ? this.callDelta(S, K, r, sigma, T) : this.putDelta(S, K, r, sigma, T),
            gamma: this.gamma(S, K, r, sigma, T),
            theta: optionType === 'call' ? this.callTheta(S, K, r, sigma, T) : this.putTheta(S, K, r, sigma, T),
            vega: this.vega(S, K, r, sigma, T),
            rho: optionType === 'call' ? this.callRho(S, K, r, sigma, T) : this.putRho(S, K, r, sigma, T),
            d1: d1,
            d2: d2
        };

        // Agregar interpretaciones intuitivas según el video
        greeks.interpretation = this.interpretGreeks(greeks, optionType, S, K, T);

        return greeks;
    }

    // Interpretación intuitiva de las Greeks (basado en el video)
    static interpretGreeks(greeks, optionType, S, K, T) {
        const moneyness = S / K;
        const daysToExpiry = T * 365;
        
        return {
            delta: {
                value: greeks.delta,
                meaning: optionType === 'call' 
                    ? `Probabilidad de terminar ITM: ${(greeks.delta * 100).toFixed(1)}%`
                    : `Probabilidad de terminar ITM: ${((greeks.delta + 1) * 100).toFixed(1)}%`,
                impact: `Por cada $1 de cambio en el subyacente, la opción cambia $${Math.abs(greeks.delta).toFixed(2)}`
            },
            gamma: {
                value: greeks.gamma,
                meaning: greeks.gamma > 0.01 ? 'Alta curvatura - Delta cambia rápidamente' : 'Baja curvatura - Delta estable',
                warning: daysToExpiry < 7 && Math.abs(moneyness - 1) < 0.1 ? '⚠️ Gamma infinita cerca de vencimiento' : null
            },
            theta: {
                value: greeks.theta,
                meaning: greeks.theta < 0 ? `Pérdida diaria por Time Decay: $${Math.abs(greeks.theta).toFixed(4)}` : 'Ganancia temporal',
                impact: daysToExpiry < 30 ? '⏰ Time Decay acelerado' : 'Time Decay moderado'
            },
            vega: {
                value: greeks.vega,
                meaning: `Por cada 1% de cambio en volatilidad, el precio cambia $${greeks.vega.toFixed(2)}`,
                insight: moneyness > 0.9 && moneyness < 1.1 ? '🎯 Máxima sensibilidad a volatilidad cerca del ATM' : null
            }
        };
    }

    // Simulación Monte Carlo con proceso estocástico mejorado
    static monteCarloSimulation(S0, r, sigma, T, numSimulations, meanReversion = null) {
        const tradingDaysPerYear = 252;
        const numSteps = Math.max(1, Math.round(T * tradingDaysPerYear));
        const dt = T / numSteps;
        const sqrtDt = Math.sqrt(dt);

        const results = [];
        
        for (let i = 0; i < numSimulations; i++) {
            let price = S0;
            
            for (let step = 0; step < numSteps; step++) {
                const z = this.boxMullerRandom();
                
                let drift;
                if (meanReversion && meanReversion.enabled) {
                    // Proceso de Ornstein-Uhlenbeck (mean reversion)
                    const speed = meanReversion.speed || 0.5;
                    const longTermMean = meanReversion.longTermMean || S0;
                    const volatility = meanReversion.volatility || sigma;
                    
                    drift = speed * (longTermMean - price) * dt;
                    price += drift + volatility * price * sqrtDt * z;
                } else {
                    // Movimiento geométrico browniano estándar
                    drift = (r - 0.5 * sigma * sigma) * dt;
                    price *= Math.exp(drift + sigma * sqrtDt * z);
                }
            }
            
            results.push(price);
        }

        return results;
    }

    // Calcular Greeks finitas (diferencias numéricas) para validación
    static calculateFiniteDifferenceGreeks(optionType, S, K, r, sigma, T, h = 0.01) {
        const price = optionType === 'call' 
            ? this.blackScholesCall(S, K, r, sigma, T)
            : this.blackScholesPut(S, K, r, sigma, T);
        
        // Delta finito
        const priceUp = optionType === 'call'
            ? this.blackScholesCall(S * (1 + h), K, r, sigma, T)
            : this.blackScholesPut(S * (1 + h), K, r, sigma, T);
        const deltaFinite = (priceUp - price) / (S * h);
        
        // Gamma finito
        const priceDown = optionType === 'call'
            ? this.blackScholesCall(S * (1 - h), K, r, sigma, T)
            : this.blackScholesPut(S * (1 - h), K, r, sigma, T);
        const gammaFinite = (priceUp - 2 * price + priceDown) / (S * h * S * h);
        
        // Theta finito
        const priceTomorrow = optionType === 'call'
            ? this.blackScholesCall(S, K, r, sigma, Math.max(0.001, T - 1/365))
            : this.blackScholesPut(S, K, r, sigma, Math.max(0.001, T - 1/365));
        const thetaFinite = (priceTomorrow - price);
        
        // Vega finito
        const priceVolUp = optionType === 'call'
            ? this.blackScholesCall(S, K, r, sigma * 1.01, T)
            : this.blackScholesPut(S, K, r, sigma * 1.01, T);
        const vegaFinite = (priceVolUp - price) / (sigma * 0.01);
        
        return {
            delta: deltaFinite,
            gamma: gammaFinite,
            theta: thetaFinite,
            vega: vegaFinite
        };
    }

    // Calcular superficie de volatilidad implícita
    static calculateImpliedVolatilitySurface(S, K, r, T, marketPrice, optionType) {
        // Método de Newton-Raphson para encontrar volatilidad implícita
        let sigma = 0.3; // Initial guess
        const tolerance = 1e-6;
        const maxIterations = 100;
        
        for (let i = 0; i < maxIterations; i++) {
            const price = optionType === 'call'
                ? this.blackScholesCall(S, K, r, sigma, T)
                : this.blackScholesPut(S, K, r, sigma, T);
            
            const error = price - marketPrice;
            
            if (Math.abs(error) < tolerance) {
                return sigma;
            }
            
            // Vega para el método de Newton
            const vega = this.vega(S, K, r, sigma, T);
            
            if (Math.abs(vega) < tolerance) {
                break; // Avoid division by zero
            }
            
            sigma = sigma - error / vega;
            sigma = Math.max(0.001, Math.min(2.0, sigma)); // Keep sigma reasonable
        }
        
        return null; // No convergence
    }

    // Generador de números aleatorios normales (Box-Muller)
    // Evitar u1 === 0 porque log(0) = -Infinity → NaN en la simulación
    static boxMullerRandom() {
        let u1, u2;
        do { u1 = Math.random(); } while (u1 === 0);
        u2 = Math.random();
        return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    }

    // Calcular probabilidades basadas en simulación
    static calculateProbabilities(simulations, strike, optionType = 'call') {
        const ITMCount = optionType === 'call' 
            ? simulations.filter(price => price > strike).length
            : simulations.filter(price => price < strike).length;
        
        return ITMCount / simulations.length;
    }

    // Calcular valor esperado de payoff
    static calculateExpectedPayoff(simulations, strike, optionType = 'call', premium = 0) {
        const payoffs = simulations.map(price => {
            const payoff = optionType === 'call' 
                ? Math.max(0, price - strike)
                : Math.max(0, strike - price);
            return payoff - premium;
        });

        return payoffs.reduce((sum, payoff) => sum + payoff, 0) / payoffs.length;
    }

    // Análisis de sensibilidad completa
    static performSensitivityAnalysis(optionType, S, K, r, sigma, T) {
        const basePrice = optionType === 'call' 
            ? this.blackScholesCall(S, K, r, sigma, T)
            : this.blackScholesPut(S, K, r, sigma, T);
        
        const greeks = this.calculateGreeks(optionType, S, K, r, sigma, T);
        
        // Escenarios de stress
        const scenarios = {
            spotUp10: optionType === 'call'
                ? this.blackScholesCall(S * 1.1, K, r, sigma, T)
                : this.blackScholesPut(S * 1.1, K, r, sigma, T),
            spotDown10: optionType === 'call'
                ? this.blackScholesCall(S * 0.9, K, r, sigma, T)
                : this.blackScholesPut(S * 0.9, K, r, sigma, T),
            volUp20: optionType === 'call'
                ? this.blackScholesCall(S, K, r, sigma * 1.2, T)
                : this.blackScholesPut(S, K, r, sigma * 1.2, T),
            timeDecay7d: optionType === 'call'
                ? this.blackScholesCall(S, K, r, sigma, Math.max(0.001, T - 7/365))
                : this.blackScholesPut(S, K, r, sigma, Math.max(0.001, T - 7/365))
        };
        
        return {
            basePrice,
            greeks,
            scenarios,
            sensitivities: {
                spot10pct: ((scenarios.spotUp10 - basePrice) / basePrice * 100).toFixed(2) + '%',
                vol20pct: ((scenarios.volUp20 - basePrice) / basePrice * 100).toFixed(2) + '%',
                time7d: ((scenarios.timeDecay7d - basePrice) / basePrice * 100).toFixed(2) + '%'
            }
        };
    }

    // Formatear número para display
    static formatNumber(num, decimals = 2) {
        if (isNaN(num)) return 'N/A';
        return num.toFixed(decimals);
    }

    // Formatear porcentaje
    static formatPercentage(num, decimals = 2) {
        if (isNaN(num)) return 'N/A';
        return `${(num * 100).toFixed(decimals)}%`;
    }

    // Formatear moneda
    static formatCurrency(num, decimals = 2, currency = '$') {
        if (isNaN(num)) return 'N/A';
        return `${currency}${num.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    }

    // ==================== ANÁLISIS DE LIQUIDEZ PROFESIONAL ====================
    
    /**
     * Calcula el spread porcentual Bid/Ask para análisis de liquidez
     * @param {number} bid - Precio de compra (bid)
     * @param {number} ask - Precio de venta (ask)
     * @returns {Object} { spreadPercent, midPrice, isValid, liquidityLevel }
     */
    static calculateSpread(bid, ask) {
        // Validación de datos de entrada
        if (!bid || !ask || bid <= 0 || ask <= 0 || bid === ask) {
            return {
                spreadPercent: 1000, // Spread infinito
                midPrice: 0,
                isValid: false,
                liquidityLevel: 'NONE',
                reason: 'Bid/Ask inválidos o faltantes'
            };
        }

        // Validar orden lógica (bid <= ask)
        if (bid > ask) {
            return {
                spreadPercent: 1000,
                midPrice: 0,
                isValid: false,
                liquidityLevel: 'NONE',
                reason: 'Bid > Ask (datos invertidos)'
            };
        }

        const midPrice = (bid + ask) / 2;
        const spreadPercent = ((ask - bid) / midPrice) * 100;

        // Clasificación de liquidez
        let liquidityLevel;
        if (spreadPercent <= 5) {
            liquidityLevel = 'HIGH';
        } else if (spreadPercent <= 15) {
            liquidityLevel = 'MEDIUM';
        } else if (spreadPercent <= 25) {
            liquidityLevel = 'LOW';
        } else {
            liquidityLevel = 'VERY_LOW';
        }

        return {
            spreadPercent: Math.round(spreadPercent * 100) / 100, // 2 decimales
            midPrice: Math.round(midPrice * 100) / 100,
            isValid: true,
            liquidityLevel,
            reason: null
        };
    }

    /**
     * Evalúa si una opción es comercializable basado en liquidez
     * @param {number} bid - Precio bid
     * @param {number} ask - Precio ask
     * @param {number} maxSpreadPercent - Spread máximo aceptable (default: 25%)
     * @returns {Object} { isTradable, lowLiquidity, spreadAnalysis, shouldIgnore }
     */
    static evaluateLiquidity(bid, ask, maxSpreadPercent = 25) {
        const spreadAnalysis = this.calculateSpread(bid, ask);
        
        // Si no hay datos válidos, ignorar completamente
        if (!spreadAnalysis.isValid) {
            return {
                isTradable: false,
                lowLiquidity: true,
                spreadAnalysis,
                shouldIgnore: true,
                recommendation: 'IGNORAR - Sin puntas firmes'
            };
        }

        // Evaluar límite de spread
        const lowLiquidity = spreadAnalysis.spreadPercent > maxSpreadPercent;
        const isTradable = !lowLiquidity && spreadAnalysis.liquidityLevel !== 'VERY_LOW';
        
        return {
            isTradable,
            lowLiquidity,
            spreadAnalysis,
            shouldIgnore: !isTradable,
            recommendation: isTradable ? 
                'COMERCIABLE - Buena liquidez' : 
                `EVITAR - Spread ${spreadAnalysis.spreadPercent}% > ${maxSpreadPercent}%`
        };
    }

    /**
     * Filtra opciones por liquidez antes de cálculos Monte Carlo
     * @param {Array} options - Array de opciones con bid/ask
     * @param {number} maxSpreadPercent - Spread máximo aceptable
     * @returns {Object} { tradableOptions, ignoredOptions, stats }
     */
    static filterByLiquidity(options, maxSpreadPercent = 25) {
        const tradableOptions = [];
        const ignoredOptions = [];
        const stats = {
            total: options.length,
            tradable: 0,
            ignored: 0,
            highLiquidity: 0,
            mediumLiquidity: 0,
            lowLiquidity: 0,
            veryLowLiquidity: 0,
            noData: 0
        };

        options.forEach(option => {
            const liquidityEval = this.evaluateLiquidity(option.bid, option.ask, maxSpreadPercent);
            
            // Agregar metadata de liquidez a la opción
            option.liquidity = liquidityEval;
            option.spreadPercent = liquidityEval.spreadAnalysis.spreadPercent;
            option.liquidityLevel = liquidityEval.spreadAnalysis.liquidityLevel;
            option.lowLiquidity = liquidityEval.lowLiquidity;
            option.shouldIgnore = liquidityEval.shouldIgnore;

            // Actualizar estadísticas
            if (!liquidityEval.spreadAnalysis.isValid) {
                stats.noData++;
            } else {
                stats[liquidityEval.spreadAnalysis.liquidityLevel.toLowerCase() + 'Liquidity']++;
            }

            // Clasificar opción
            if (liquidityEval.shouldIgnore) {
                ignoredOptions.push(option);
                stats.ignored++;
            } else {
                tradableOptions.push(option);
                stats.tradable++;
            }
        });

        return {
            tradableOptions,
            ignoredOptions,
            stats,
            summary: `${stats.tradable}/${stats.total} opciones con liquidez aceptable (${((stats.tradable/stats.total)*100).toFixed(1)}%)`
        };
    }

    /**
     * Genera código de colores HTML para spread basado en liquidez
     * @param {number} spreadPercent - Spread porcentual
     * @returns {Object} { color, bgColor, opacity, icon }
     */
    static getSpreadColorCode(spreadPercent) {
        if (spreadPercent <= 5) {
            return {
                color: '#00ff88',
                bgColor: 'rgba(0, 255, 136, 0.1)',
                opacity: 1.0,
                icon: '🟢',
                label: 'Alta'
            };
        } else if (spreadPercent <= 15) {
            return {
                color: '#ffaa00',
                bgColor: 'rgba(255, 170, 0, 0.1)',
                opacity: 1.0,
                icon: '🟡',
                label: 'Normal'
            };
        } else {
            return {
                color: '#ff4444',
                bgColor: 'rgba(255, 68, 68, 0.1)',
                opacity: 0.5,
                icon: '🔴',
                label: 'Ilíquida'
            };
        }
    }

    /**
     * Formatea el spread para display en tabla
     * @param {number} spreadPercent - Spread porcentual
     * @param {boolean} lowLiquidity - Flag de baja liquidez
     * @returns {string} HTML formateado con colores
     */
    static formatSpreadForDisplay(spreadPercent, lowLiquidity = false) {
        if (spreadPercent >= 1000) {
            return '<span style="color: #666; font-style: italic;">N/D</span>';
        }

        const colorCode = this.getSpreadColorCode(spreadPercent);
        const opacity = lowLiquidity ? 0.5 : colorCode.opacity;
        
        return `
            <span style="
                color: ${colorCode.color}; 
                background: ${colorCode.bgColor}; 
                opacity: ${opacity};
                padding: 2px 6px; 
                border-radius: 4px; 
                font-weight: 500;
                font-size: 0.9em;
            ">
                ${colorCode.icon} ${spreadPercent.toFixed(1)}%
            </span>
        `;
    }
}
