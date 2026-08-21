/**
 * Dynamic Filtering System for Options Trading
 * Advanced filtering with liquidity, volume, profitability metrics
 * Optimized for Argentine market conditions
 */

class DynamicFilteringSystem {
    constructor() {
        this.filters = this.initializeFilters();
        this.marketContext = {
            country: 'Argentina',
            exchange: 'BYMA/BCBA',
            characteristics: {
                highVolatility: true,
                liquidityConstraints: true,
                wideSpreads: true,
                currencyRisk: true
            }
        };
    }

    initializeFilters() {
        return {
            // === FILTROS DE LIQUIDEZ AVANZADOS ===
            
            liquidity: {
                name: 'Liquidez Avanzada',
                description: 'Filtrado multinivel de liquidez real',
                enabled: true,
                priority: 'high',
                levels: {
                    ultra_high: {
                        minMontoOperado: 100000,
                        minVolumen: 1000,
                        minOperaciones: 100,
                        maxSpreadPercent: 5,
                        score: 100
                    },
                    high: {
                        minMontoOperado: 50000,
                        minVolumen: 500,
                        minOperaciones: 50,
                        maxSpreadPercent: 10,
                        score: 80
                    },
                    medium: {
                        minMontoOperado: 20000,
                        minVolumen: 200,
                        minOperaciones: 20,
                        maxSpreadPercent: 20,
                        score: 60
                    },
                    low: {
                        minMontoOperado: 5000,
                        minVolumen: 50,
                        minOperaciones: 5,
                        maxSpreadPercent: 30,
                        score: 40
                    },
                    very_low: {
                        minMontoOperado: 1000,
                        minVolumen: 10,
                        minOperaciones: 1,
                        maxSpreadPercent: 50,
                        score: 20
                    }
                },
                
                filter: (options, level = 'medium') => {
                    const config = this.levels[level];
                    return options.filter(option => {
                        const monto = option.montoOperado || 0;
                        const volumen = option.volumenNominal || 0;
                        const operaciones = option.cantidadOperaciones || 0;
                        const spread = this.calculateSpread(option.bid, option.ask);
                        
                        // Calcular score de liquidez
                        const liquidityScore = this.calculateLiquidityScore(option, config);
                        
                        return liquidityScore >= config.score * 0.7 && // 70% del score mínimo
                               monto >= config.minMontoOperado &&
                               volumen >= config.minVolumen &&
                               operaciones >= config.minOperaciones &&
                               spread <= config.maxSpreadPercent;
                    }).map(option => ({
                        ...option,
                        liquidityScore: this.calculateLiquidityScore(option, config),
                        liquidityLevel: level,
                        spreadAnalysis: this.analyzeSpread(option.bid, option.ask)
                    }));
                }
            },

            // === FILTROS DE RENTABILIDAD CUANTITATIVA ===
            
            profitability: {
                name: 'Rentabilidad Cuantitativa',
                description: 'Análisis avanzado de profit probability y expectativas matemáticas',
                enabled: true,
                priority: 'high',
                parameters: {
                    minProbProfit: 0.15, // 15% mínimo
                    minExpectedReturn: 0.10, // 10% mínimo
                    maxRiskReward: 0.5, // Máximo 1:2 riesgo/retorno
                    minSharpeRatio: 0.3,
                    maxVaRPercent: 0.20 // Máximo 20% VaR
                },
                
                filter: (options, spot) => {
                    return options.filter(option => {
                        const metrics = this.calculateProfitabilityMetrics(option, spot);
                        
                        return metrics.probProfit >= this.parameters.minProbProfit &&
                               metrics.expectedReturn >= this.parameters.minExpectedReturn &&
                               metrics.riskRewardRatio <= this.parameters.maxRiskReward &&
                               metrics.sharpeRatio >= this.parameters.minSharpeRatio &&
                               metrics.var95 <= this.parameters.maxVaRPercent;
                    }).map(option => ({
                        ...option,
                        profitabilityMetrics: this.calculateProfitabilityMetrics(option, spot)
                    }));
                }
            },

            // === FILTROS DE VOLATILIDAD INTELIGENTE ===
            
            volatility: {
                name: 'Volatilidad Inteligente',
                description: 'Análisis de volatilidad implícita vs histórica con reversión a la media',
                enabled: true,
                priority: 'medium',
                parameters: {
                    minIV: 0.15,
                    maxIV: 1.5,
                    ivPercentileRange: [0.25, 0.75], // Entre percentil 25 y 75
                    meanReversionThreshold: 0.3,
                    volatilityRegime: 'adaptive' // adaptive, high, low, normal
                },
                
                filter: (options, historicalVolatility = 0.30) => {
                    return options.filter(option => {
                        const iv = option.volatilidadImplicita || 0;
                        const analysis = this.analyzeVolatility(option, historicalVolatility);
                        
                        return iv >= this.parameters.minIV &&
                               iv <= this.parameters.maxIV &&
                               analysis.ivPercentile >= this.parameters.ivPercentileRange[0] &&
                               analysis.ivPercentile <= this.parameters.ivPercentileRange[1] &&
                               analysis.meanReversionSignal !== 'extreme';
                    }).map(option => ({
                        ...option,
                        volatilityAnalysis: this.analyzeVolatility(option, historicalVolatility)
                    }));
                }
            },

            // === FILTROS DE GRIEGAS COHERENTES ===
            
            greeks: {
                name: 'Griegas Coherentes',
                description: 'Validación de consistencia matemática de las griegas',
                enabled: true,
                priority: 'high',
                parameters: {
                    deltaRange: { call: [0.1, 0.9], put: [-0.9, -0.1] },
                    gammaRange: [0.001, 0.01],
                    thetaRange: [-2.0, -0.01],
                    vegaRange: [0.01, 1.0],
                    parityThreshold: 0.05 // 5% tolerancia paridad put-call
                },
                
                filter: (options, spot) => {
                    return options.filter(option => {
                        const delta = option.Delta || 0;
                        const gamma = option.Gamma || 0;
                        const theta = option.Theta || 0;
                        const vega = option.Vega || 0;
                        const tipo = option.tipoOpcion;
                        
                        // Validar rangos de griegas
                        const deltaValid = tipo === 'Call' ? 
                            delta >= this.parameters.deltaRange.call[0] && delta <= this.parameters.deltaRange.call[1] :
                            delta >= this.parameters.deltaRange.put[0] && delta <= this.parameters.deltaRange.put[1];
                        
                        const gammaValid = gamma >= this.parameters.gammaRange[0] && gamma <= this.parameters.gammaRange[1];
                        const thetaValid = theta >= this.parameters.thetaRange[0] && theta <= this.parameters.thetaRange[1];
                        const vegaValid = vega >= this.parameters.vegaRange[0] && vega <= this.parameters.vegaRange[1];
                        
                        // Validar coherencia matemática
                        const coherenceCheck = this.validateGreeksCoherence(option, spot);
                        
                        return deltaValid && gammaValid && thetaValid && vegaValid && coherenceCheck.isValid;
                    }).map(option => ({
                        ...option,
                        greeksValidation: this.validateGreeksCoherence(option, spot)
                    }));
                }
            },

            // === FILTROS DE RIESGO CONTROLADO ===
            
            risk: {
                name: 'Riesgo Controlado',
                description: 'Filtrado por métricas de riesgo ajustadas al mercado argentino',
                enabled: true,
                priority: 'high',
                parameters: {
                    maxTimeDecay: 0.05, // 5% máximo decaimiento diario
                    maxVolatilityRisk: 0.40, // 40% máximo riesgo volatilidad
                    minMarginRequirement: 0.20, // 20% mínimo margen
                    maxConcentration: 0.30, // 30% máximo concentración
                    stressTestScenarios: ['spot_10pct', 'vol_20pct', 'time_7d']
                },
                
                filter: (options, spot) => {
                    return options.filter(option => {
                        const riskMetrics = this.calculateRiskMetrics(option, spot);
                        
                        return riskMetrics.timeDecayRisk <= this.parameters.maxTimeDecay &&
                               riskMetrics.volatilityRisk <= this.parameters.maxVolatilityRisk &&
                               riskMetrics.marginRequirement >= this.parameters.minMarginRequirement &&
                               riskMetrics.stressTestResults.maxLoss <= 0.25; // 25% máximo pérdida en stress
                    }).map(option => ({
                        ...option,
                        riskMetrics: this.calculateRiskMetrics(option, spot)
                    }));
                }
            },

            // === FILTROS DE MERCADO ARGENTINO ===
            
            argentineMarket: {
                name: 'Mercado Argentino',
                description: 'Filtros específicos para condiciones del mercado local',
                enabled: true,
                priority: 'high',
                parameters: {
                    maxCurrencyRisk: 0.15, // 15% máximo riesgo cambiario
                    minPoliticalRiskPremium: 0.05, // 5% mínimo prima por riesgo político
                    maxInflationImpact: 0.10, // 10% máximo impacto inflación
                    tradingHoursOnly: true, // Solo horario de trading
                    settlementDays: 2 // Días de liquidación BCBA
                },
                
                filter: (options, currentTime = new Date()) => {
                    return options.filter(option => {
                        // Validar horario de trading (9:30 - 18:00)
                        if (this.parameters.tradingHoursOnly) {
                            const hour = currentTime.getHours();
                            if (hour < 9 || hour > 18) return false;
                        }
                        
                        // Calcular ajustes por mercado argentino
                        const argentinaAdjustments = this.calculateArgentinaAdjustments(option);
                        
                        return argentinaAdjustments.currencyRisk <= this.parameters.maxCurrencyRisk &&
                               argentinaAdjustments.politicalRiskPremium >= this.parameters.minPoliticalRiskPremium &&
                               argentinaAdjustments.inflationImpact <= this.parameters.maxInflationImpact;
                    }).map(option => ({
                        ...option,
                        argentinaAdjustments: this.calculateArgentinaAdjustments(option)
                    }));
                }
            }
        };
    }

    // === MÉTODOS DE CÁLCULO ===

    calculateSpread(bid, ask) {
        if (!bid || !ask || bid <= 0 || ask <= 0) return 100;
        return ((ask - bid) / ((bid + ask) / 2)) * 100;
    }

    calculateLiquidityScore(option, config) {
        const monto = option.montoOperado || 0;
        const volumen = option.volumenNominal || 0;
        const operaciones = option.cantidadOperaciones || 0;
        const spread = this.calculateSpread(option.bid, option.ask);
        
        // Score normalizado (0-100)
        let score = 0;
        
        // Puntaje por monto operado (40%)
        const montoScore = Math.min(100, (monto / config.minMontoOperado) * 40);
        score += montoScore;
        
        // Puntaje por volumen (30%)
        const volumenScore = Math.min(100, (volumen / config.minVolumen) * 30);
        score += volumenScore;
        
        // Puntaje por operaciones (20%)
        const operacionesScore = Math.min(100, (operaciones / config.minOperaciones) * 20);
        score += operacionesScore;
        
        // Puntaje por spread (10%)
        const spreadScore = Math.max(0, (config.maxSpreadPercent - spread) / config.maxSpreadPercent * 10);
        score += spreadScore;
        
        return Math.min(100, score);
    }

    analyzeSpread(bid, ask) {
        const spread = this.calculateSpread(bid, ask);
        
        let quality, color, recommendation;
        
        if (spread <= 5) {
            quality = 'excelente';
            color = '#00ff88';
            recommendation = 'Operar sin reservas';
        } else if (spread <= 10) {
            quality = 'bueno';
            color = '#ffaa00';
            recommendation = 'Operar con órdenes límite';
        } else if (spread <= 20) {
            quality = 'aceptable';
            color = '#ff8800';
            recommendation = 'Operar con precaución';
        } else if (spread <= 30) {
            quality = 'pobre';
            color = '#ff4444';
            recommendation = 'Evitar si es posible';
        } else {
            quality = 'muy_pobre';
            color = '#ff0000';
            recommendation = 'No operar';
        }
        
        return {
            spread,
            quality,
            color,
            recommendation,
            midPrice: (bid + ask) / 2,
            liquidityImpact: spread > 20 ? 'high' : spread > 10 ? 'medium' : 'low'
        };
    }

    calculateProfitabilityMetrics(option, spot) {
        const premium = option.precioOpcion || 0;
        const strike = option.strike || 0;
        const tipo = option.tipoOpcion;
        const iv = option.volatilidadImplicita || 0.30;
        const timeToExpiry = this.getTimeToExpiry(option.fechaVencimiento);
        
        // Simulación Monte Carlo para probabilidad de profit
        const probProfit = this.calculateProbabilityOfProfit(option, spot);
        
        // Valor esperado usando distribuciones
        const expectedPayoff = this.calculateExpectedPayoff(option, spot);
        const expectedReturn = expectedPayoff / premium;
        
        // Ratio riesgo/retorno
        const maxLoss = premium; // Para opciones compradas
        const maxGain = tipo === 'Call' ? 
            Math.max(0, spot * 1.5 - strike - premium) : 
            Math.max(0, strike - spot * 0.8 - premium);
        const riskRewardRatio = maxLoss / maxGain;
        
        // Sharpe ratio simplificado
        const sharpeRatio = expectedReturn / (iv * Math.sqrt(timeToExpiry));
        
        // VaR 95%
        const var95 = this.calculateVaR(option, spot, 0.05);
        
        return {
            probProfit,
            expectedReturn,
            expectedPayoff,
            riskRewardRatio,
            sharpeRatio,
            var95,
            maxGain,
            maxLoss,
            profitabilityScore: this.calculateProfitabilityScore(probProfit, expectedReturn, sharpeRatio)
        };
    }

    calculateProbabilityOfProfit(option, spot) {
        const simulations = 10000;
        const iv = option.volatilidadImplicita || 0.30;
        const timeToExpiry = this.getTimeToExpiry(option.fechaVencimiento);
        const premium = option.precioOpcion || 0;
        const strike = option.strike || 0;
        const tipo = option.tipoOpcion;
        
        let profitCount = 0;
        
        for (let i = 0; i < simulations; i++) {
            const randomReturn = this.generateRandomReturn(iv, timeToExpiry);
            const futurePrice = spot * (1 + randomReturn);
            
            let payoff = 0;
            if (tipo === 'Call') {
                payoff = Math.max(0, futurePrice - strike) - premium;
            } else {
                payoff = Math.max(0, strike - futurePrice) - premium;
            }
            
            if (payoff > 0) profitCount++;
        }
        
        return profitCount / simulations;
    }

    calculateExpectedPayoff(option, spot) {
        const simulations = 10000;
        const iv = option.volatilidadImplicita || 0.30;
        const timeToExpiry = this.getTimeToExpiry(option.fechaVencimiento);
        const premium = option.precioOpcion || 0;
        const strike = option.strike || 0;
        const tipo = option.tipoOpcion;
        
        let totalPayoff = 0;
        
        for (let i = 0; i < simulations; i++) {
            const randomReturn = this.generateRandomReturn(iv, timeToExpiry);
            const futurePrice = spot * (1 + randomReturn);
            
            let payoff = 0;
            if (tipo === 'Call') {
                payoff = Math.max(0, futurePrice - strike) - premium;
            } else {
                payoff = Math.max(0, strike - futurePrice) - premium;
            }
            
            totalPayoff += Math.max(0, payoff);
        }
        
        return totalPayoff / simulations;
    }

    calculateVaR(option, spot, confidence = 0.05) {
        const simulations = 10000;
        const iv = option.volatilidadImplicita || 0.30;
        const timeToExpiry = this.getTimeToExpiry(option.fechaVencimiento);
        const premium = option.precioOpcion || 0;
        const strike = option.strike || 0;
        const tipo = option.tipoOpcion;
        
        const payoffs = [];
        
        for (let i = 0; i < simulations; i++) {
            const randomReturn = this.generateRandomReturn(iv, timeToExpiry);
            const futurePrice = spot * (1 + randomReturn);
            
            let payoff = 0;
            if (tipo === 'Call') {
                payoff = Math.max(0, futurePrice - strike) - premium;
            } else {
                payoff = Math.max(0, strike - futurePrice) - premium;
            }
            
            payoffs.push(payoff);
        }
        
        payoffs.sort((a, b) => a - b);
        const varIndex = Math.floor(simulations * confidence);
        return Math.abs(payoffs[varIndex]) / premium;
    }

    calculateProfitabilityScore(probProfit, expectedReturn, sharpeRatio) {
        // Score compuesto 0-100
        const probScore = probProfit * 30; // 30% peso
        const returnScore = Math.min(30, expectedReturn * 100); // 30% peso, max 30 puntos
        const sharpeScore = Math.min(40, sharpeRatio * 40); // 40% peso, max 40 puntos
        
        return probScore + returnScore + sharpeScore;
    }

    analyzeVolatility(option, historicalVolatility) {
        const iv = option.volatilidadImplicita || 0.30;
        const timeToExpiry = this.getTimeToExpiry(option.fechaVencimiento);
        
        // Calcular percentil de IV (asumiendo distribución normal)
        const ivPercentile = this.calculateIVPercentile(iv, historicalVolatility);
        
        // Señal de reversión a la media
        const meanReversionSignal = this.calculateMeanReversionSignal(iv, historicalVolatility);
        
        // Régimen de volatilidad
        let regime;
        if (iv > historicalVolatility * 1.5) regime = 'high';
        else if (iv < historicalVolatility * 0.7) regime = 'low';
        else regime = 'normal';
        
        // Ajuste por término
        const termStructure = this.calculateVolatilityTermStructure(iv, timeToExpiry);
        
        return {
            iv,
            ivPercentile,
            meanReversionSignal,
            regime,
            termStructure,
            ivVsHistorical: iv / historicalVolatility,
            volatilityScore: this.calculateVolatilityScore(iv, historicalVolatility, timeToExpiry)
        };
    }

    calculateIVPercentile(iv, historicalVolatility) {
        // Simplificación: asumir distribución normal de volatilidades
        const zScore = (iv - historicalVolatility) / (historicalVolatility * 0.3);
        return 0.5 * (1 + this.erf(zScore / Math.sqrt(2)));
    }

    erf(x) {
        // Aproximación de la función error
        const a1 =  0.254829592;
        const a2 = -0.284496736;
        const a3 =  1.421413741;
        const a4 = -1.453152027;
        const a5 =  1.061405429;
        const p  =  0.3275911;

        const sign = x < 0 ? -1 : 1;
        x = Math.abs(x);

        const t = 1.0 / (1.0 + p * x);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

        return sign * y;
    }

    calculateMeanReversionSignal(iv, historicalVolatility) {
        const ratio = iv / historicalVolatility;
        if (ratio > 1.5) return 'extreme_high';
        if (ratio > 1.2) return 'high';
        if (ratio < 0.5) return 'extreme_low';
        if (ratio < 0.8) return 'low';
        return 'normal';
    }

    calculateVolatilityTermStructure(iv, timeToExpiry) {
        // Término típico: IV aumenta con tiempo al vencimiento
        const expectedIV = iv * (1 + 0.1 * Math.sqrt(timeToExpiry));
        return {
            current: iv,
            expected: expectedIV,
            termPremium: expectedIV - iv,
            isSteep: (expectedIV - iv) / iv > 0.2
        };
    }

    calculateVolatilityScore(iv, historicalVolatility, timeToExpiry) {
        let score = 50; // Base score
        
        // Ajustar por relación con volatilidad histórica
        const ratio = iv / historicalVolatility;
        if (ratio >= 0.8 && ratio <= 1.2) score += 20; // Volatilidad normal
        else if (ratio >= 0.6 && ratio <= 1.4) score += 10; // Volatilidad aceptable
        else score -= 10; // Volatilidad extrema
        
        // Ajustar por término
        if (timeToExpiry > 0.08) score += 10; // Más de 1 mes
        else if (timeToExpiry < 0.02) score -= 10; // Menos de 1 semana
        
        return Math.max(0, Math.min(100, score));
    }

    validateGreeksCoherence(option, spot) {
        const delta = option.Delta || 0;
        const gamma = option.Gamma || 0;
        const theta = option.Theta || 0;
        const vega = option.Vega || 0;
        const tipo = option.tipoOpcion;
        const strike = option.strike || 0;
        const premium = option.precioOpcion || 0;
        
        const errors = [];
        const warnings = [];
        
        // Validar signo de delta
        if (tipo === 'Call' && delta < 0) {
            errors.push('Delta de Call debe ser positivo');
        } else if (tipo === 'Put' && delta > 0) {
            errors.push('Delta de Put debe ser negativo');
        }
        
        // Validar magnitud de delta
        const absDelta = Math.abs(delta);
        if (absDelta > 1) {
            errors.push('Delta no puede ser mayor a 1 en magnitud');
        }
        
        // Validar gamma
        if (gamma < 0) {
            errors.push('Gamma debe ser positivo');
        }
        
        // Validar theta para opciones long
        if (theta > 0) {
            warnings.push('Theta positivo inusual para opción larga');
        }
        
        // Validar vega
        if (vega < 0) {
            errors.push('Vega debe ser positivo');
        }
        
        // Validar paridad put-call aproximada
        const moneyness = spot / strike;
        if (tipo === 'Call' && moneyness > 1 && delta < 0.5) {
            warnings.push('Call ITM con delta bajo - posible error');
        } else if (tipo === 'Put' && moneyness < 1 && Math.abs(delta) < 0.5) {
            warnings.push('Put ITM con delta bajo - posible error');
        }
        
        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            coherenceScore: Math.max(0, 100 - (errors.length * 20) - (warnings.length * 5))
        };
    }

    calculateRiskMetrics(option, spot) {
        const theta = option.Theta || 0;
        const vega = option.Vega || 0;
        const premium = option.precioOpcion || 0;
        const iv = option.volatilidadImplicita || 0.30;
        const timeToExpiry = this.getTimeToExpiry(option.fechaVencimiento);
        
        // Riesgo de decaimiento temporal
        const timeDecayRisk = Math.abs(theta) / premium;
        
        // Riesgo de volatilidad
        const volatilityRisk = (vega * 0.01) / premium; // 1% cambio en IV
        
        // Requerimiento de margen (simplificado)
        const marginRequirement = premium * 1.2; // 20% sobre la prima
        
        // Stress tests
        const stressTestResults = this.performStressTests(option, spot);
        
        return {
            timeDecayRisk,
            volatilityRisk,
            marginRequirement,
            stressTestResults,
            overallRiskScore: this.calculateOverallRiskScore(timeDecayRisk, volatilityRisk, stressTestResults)
        };
    }

    performStressTests(option, spot) {
        const scenarios = {
            spot_10pct: { spotChange: 0.10, volChange: 0 },
            spot_minus_10pct: { spotChange: -0.10, volChange: 0 },
            vol_20pct: { spotChange: 0, volChange: 0.20 },
            vol_minus_20pct: { spotChange: 0, volChange: -0.20 },
            time_7d: { spotChange: 0, volChange: 0, timeDecay: 7 },
            worst_case: { spotChange: -0.15, volChange: 0.30, timeDecay: 7 }
        };
        
        const results = {};
        
        Object.entries(scenarios).forEach(([scenario, params]) => {
            const loss = this.calculateScenarioLoss(option, spot, params);
            results[scenario] = loss;
        });
        
        results.maxLoss = Math.max(...Object.values(results));
        results.worstScenario = Object.keys(results).reduce((a, b) => results[a] > results[b] ? a : b);
        
        return results;
    }

    calculateScenarioLoss(option, spot, params) {
        const { spotChange, volChange, timeDecay = 0 } = params;
        const newSpot = spot * (1 + spotChange);
        const newIV = (option.volatilidadImplicita || 0.30) * (1 + volChange);
        const newTime = Math.max(0.001, this.getTimeToExpiry(option.fechaVencimiento) - timeDecay / 365);
        
        // Calcular nuevo precio con Black-Scholes simplificado
        const newPrice = this.calculateOptionPrice(option.tipoOpcion, newSpot, option.strike, newIV, newTime);
        const originalPrice = option.precioOpcion || 0;
        
        return Math.abs(originalPrice - newPrice) / originalPrice;
    }

    calculateOptionPrice(tipo, S, K, sigma, T) {
        // Black-Scholes simplificado
        const r = 0.05; // Tasa de riesgo libre
        const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
        const d2 = d1 - sigma * Math.sqrt(T);
        
        if (tipo === 'Call') {
            return S * this.normalCDF(d1) - K * Math.exp(-r * T) * this.normalCDF(d2);
        } else {
            return K * Math.exp(-r * T) * this.normalCDF(-d2) - S * this.normalCDF(-d1);
        }
    }

    normalCDF(x) {
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

    calculateOverallRiskScore(timeDecayRisk, volatilityRisk, stressResults) {
        const stressScore = Math.max(0, 100 - stressResults.maxLoss * 100);
        const timeScore = Math.max(0, 100 - timeDecayRisk * 100);
        const volScore = Math.max(0, 100 - volatilityRisk * 100);
        
        return (stressScore * 0.5 + timeScore * 0.3 + volScore * 0.2);
    }

    calculateArgentinaAdjustments(option) {
        const premium = option.precioOpcion || 0;
        
        // Riesgo cambiario (asumiendo USD/ARS)
        const currencyRisk = 0.10; // 10% riesgo típico
        
        // Prima por riesgo político
        const politicalRiskPremium = 0.05; // 5% adicional
        
        // Impacto inflación
        const inflationImpact = 0.08; // 8% impacto esperado
        
        // Ajuste por iliquidez de mercado
        const liquidityDiscount = 0.02; // 2% descuento por iliquidez
        
        return {
            currencyRisk,
            politicalRiskPremium,
            inflationImpact,
            liquidityDiscount,
            totalAdjustment: currencyRisk + politicalRiskPremium + inflationImpact + liquidityDiscount,
            adjustedPremium: premium * (1 + politicalRiskPremium + inflationImpact + liquidityDiscount)
        };
    }

    // === MÉTODOS UTILITARIOS ===

    getTimeToExpiry(expiryDate) {
        const today = new Date();
        const expiry = new Date(expiryDate);
        const diffTime = Math.abs(expiry - today);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays / 365;
    }

    generateRandomReturn(volatility, timeToExpiry) {
        const randomNormal = this.boxMullerRandom();
        return randomNormal * volatility * Math.sqrt(timeToExpiry);
    }

    boxMullerRandom() {
        let u1, u2;
        do { u1 = Math.random(); } while (u1 === 0);
        u2 = Math.random();
        return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    }

    // === FILTRADO DINÁMICO COMPUESTO ===

    applyDynamicFilters(options, spot, filterConfig = {}) {
        let filteredOptions = [...options];
        const filterResults = {};
        
        // Aplicar filtros en orden de prioridad
        const filterOrder = [
            'liquidity',
            'profitability', 
            'volatility',
            'greeks',
            'risk',
            'argentineMarket'
        ];
        
        filterOrder.forEach(filterName => {
            const filter = this.filters[filterName];
            if (filter.enabled && (!filterConfig[filterName] || filterConfig[filterName].enabled)) {
                const config = filterConfig[filterName] || {};
                const beforeCount = filteredOptions.length;
                
                if (filterName === 'liquidity') {
                    filteredOptions = filter.filter(filteredOptions, config.level || 'medium');
                } else if (filterName === 'profitability') {
                    filteredOptions = filter.filter(filteredOptions, spot);
                } else if (filterName === 'volatility') {
                    filteredOptions = filter.filter(filteredOptions, config.historicalVolatility || 0.30);
                } else if (filterName === 'greeks') {
                    filteredOptions = filter.filter(filteredOptions, spot);
                } else if (filterName === 'risk') {
                    filteredOptions = filter.filter(filteredOptions, spot);
                } else if (filterName === 'argentineMarket') {
                    filteredOptions = filter.filter(filteredOptions, config.currentTime || new Date());
                }
                
                filterResults[filterName] = {
                    before: beforeCount,
                    after: filteredOptions.length,
                    removed: beforeCount - filteredOptions.length,
                    removalRate: (beforeCount - filteredOptions.length) / beforeCount
                };
            }
        });
        
        // Calcular score compuesto final
        filteredOptions = filteredOptions.map(option => ({
            ...option,
            compositeScore: this.calculateCompositeScore(option)
        })).sort((a, b) => b.compositeScore - a.compositeScore);
        
        return {
            filteredOptions,
            filterResults,
            summary: {
                totalOriginal: options.length,
                totalFiltered: filteredOptions.length,
                totalRemoved: options.length - filteredOptions.length,
                overallRemovalRate: (options.length - filteredOptions.length) / options.length,
                averageScore: filteredOptions.reduce((sum, opt) => sum + (opt.compositeScore || 0), 0) / filteredOptions.length
            }
        };
    }

    calculateCompositeScore(option) {
        let score = 0;
        let components = 0;
        
        // Liquidez (25%)
        if (option.liquidityScore) {
            score += option.liquidityScore * 0.25;
            components++;
        }
        
        // Rentabilidad (30%)
        if (option.profitabilityMetrics && option.profitabilityMetrics.profitabilityScore) {
            score += option.profitabilityMetrics.profitabilityScore * 0.30;
            components++;
        }
        
        // Volatilidad (15%)
        if (option.volatilityAnalysis && option.volatilityAnalysis.volatilityScore) {
            score += option.volatilityAnalysis.volatilityScore * 0.15;
            components++;
        }
        
        // Griegas (20%)
        if (option.greeksValidation && option.greeksValidation.coherenceScore) {
            score += option.greeksValidation.coherenceScore * 0.20;
            components++;
        }
        
        // Riesgo (10%)
        if (option.riskMetrics && option.riskMetrics.overallRiskScore) {
            score += option.riskMetrics.overallRiskScore * 0.10;
            components++;
        }
        
        return components > 0 ? score : 0;
    }
}

// Exportar para uso en la aplicación
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DynamicFilteringSystem;
} else if (typeof window !== 'undefined') {
    window.DynamicFilteringSystem = DynamicFilteringSystem;
}
