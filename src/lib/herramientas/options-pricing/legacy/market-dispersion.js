/**
 * Sistema de Market Dispersion + Options Probability
 * Implementación completa para mercado argentino
 * Basado en análisis cuantitativo avanzado con datos históricos
 */

export class MarketDispersionAnalyzer {
    constructor() {
        // Configuración de paneles del mercado argentino
        this.panels = {
            panel_general: [
                'GGAL', 'PAMP', 'YPF', 'TXAR', 'BMA', 'CEPU', 'CRESY', 'EDN', 
                'TGS', 'TS', 'VALO', 'MIRG', 'AUSO', 'LOMA', 'BBAR', 'CGO2'
            ],
            merval: [
                'GGAL', 'YPF', 'PAMP', 'TXAR', 'BMA', 'CEPU', 'TGS', 'TS', 
                'VALO', 'MIRG', 'BBAR', 'CGO2'
            ],
            adrs: [
                'GGAL', 'YPF', 'PAMP', 'BMA', 'CEPU', 'CRESY', 'TGS', 'TS', 
                'LOMA', 'BBAR'
            ]
        };

        // Ventanas para análisis rolling
        this.windows = [5, 20, 60];
        
        // Horizontes para volatility cone
        this.coneHorizons = [5, 10, 20, 30, 60, 90];
        
        // Tasa libre de riesgo para Argentina (USD)
        this.riskFreeRate = 0.05;
        
        // Datos históricos cache
        this.priceData = new Map();
        this.analysisCache = new Map();
    }

    /**
     * 1. CÁLCULO DE LOG RETURNS
     * log_returns = log(P_t / P_{t-1})
     */
    calculateLogReturns(prices) {
        if (!prices || prices.length < 2) return [];
        
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            if (prices[i-1] > 0 && prices[i] > 0) {
                returns.push(Math.log(prices[i] / prices[i-1]));
            }
        }
        return returns;
    }

    /**
     * 2. ROLLING VOLATILITY (SD) Y ROLLING MEAN RETURN
     * Para cada ventana w en [5, 20, 60]
     */
    calculateRollingStats(returns, windows = this.windows) {
        const rollingStats = {};
        
        windows.forEach(w => {
            const rollingSD = [];
            const rollingMean = [];
            
            for (let i = w - 1; i < returns.length; i++) {
                const window = returns.slice(i - w + 1, i + 1);
                
                // Calcular media
                const mean = window.reduce((sum, val) => sum + val, 0) / w;
                rollingMean.push(mean);
                
                // Calcular desviación estándar (sample)
                const variance = window.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (w - 1);
                const sd = Math.sqrt(variance);
                rollingSD.push(sd);
            }
            
            rollingStats[w] = { sd: rollingSD, mean: rollingMean };
        });
        
        return rollingStats;
    }

    /**
     * 3. VOLATILITY RANGE RATIO (cross-stock, por panel)
     * vol_ratio_panel[t] = vol_range_5d_panel[t] / vol_range_20d_panel[t]
     */
    calculateVolatilityRangeRatio(rollingStatsByTicker, panel) {
        const tickers = this.panels[panel];
        if (!tickers || tickers.length === 0) return [];
        
        const maxLength = Math.max(...tickers.map(ticker => {
            const stats = rollingStatsByTicker[ticker];
            return stats && stats[20] ? stats[20].sd.length : 0;
        }));
        
        const volRange5d = [];
        const volRange20d = [];
        const volRatio = [];
        
        for (let t = 0; t < maxLength; t++) {
            const sd5dValues = [];
            const sd20dValues = [];
            
            tickers.forEach(ticker => {
                const stats = rollingStatsByTicker[ticker];
                if (stats && stats[5] && stats[20]) {
                    if (t < stats[5].sd.length && stats[5].sd[t] !== null) {
                        sd5dValues.push(stats[5].sd[t]);
                    }
                    if (t < stats[20].sd.length && stats[20].sd[t] !== null) {
                        sd20dValues.push(stats[20].sd[t]);
                    }
                }
            });
            
            // Calcular cross-sectional standard deviation
            const volRange5d_t = this.calculateStandardDeviation(sd5dValues);
            const volRange20d_t = this.calculateStandardDeviation(sd20dValues);
            
            volRange5d.push(volRange5d_t);
            volRange20d.push(volRange20d_t);
            
            // Ratio (>1 = expansión, <1 = compresión)
            const ratio = volRange20d_t > 0 ? volRange5d_t / volRange20d_t : null;
            volRatio.push(ratio);
        }
        
        return {
            volRange5d,
            volRange20d,
            volRatio,
            current: volRatio.length > 0 ? volRatio[volRatio.length - 1] : null
        };
    }

    /**
     * 4. RETURN RANGE RATIO (ídem para retornos medios)
     */
    calculateReturnRangeRatio(rollingStatsByTicker, panel) {
        const tickers = this.panels[panel];
        if (!tickers || tickers.length === 0) return [];
        
        const maxLength = Math.max(...tickers.map(ticker => {
            const stats = rollingStatsByTicker[ticker];
            return stats && stats[20] ? stats[20].mean.length : 0;
        }));
        
        const retRange5d = [];
        const retRange20d = [];
        const retRatio = [];
        
        for (let t = 0; t < maxLength; t++) {
            const mean5dValues = [];
            const mean20dValues = [];
            
            tickers.forEach(ticker => {
                const stats = rollingStatsByTicker[ticker];
                if (stats && stats[5] && stats[20]) {
                    if (t < stats[5].mean.length && stats[5].mean[t] !== null) {
                        mean5dValues.push(Math.abs(stats[5].mean[t]));
                    }
                    if (t < stats[20].mean.length && stats[20].mean[t] !== null) {
                        mean20dValues.push(Math.abs(stats[20].mean[t]));
                    }
                }
            });
            
            const retRange5d_t = this.calculateStandardDeviation(mean5dValues);
            const retRange20d_t = this.calculateStandardDeviation(mean20dValues);
            
            retRange5d.push(retRange5d_t);
            retRange20d.push(retRange20d_t);
            
            const ratio = retRange20d_t > 0 ? retRange5d_t / retRange20d_t : null;
            retRatio.push(ratio);
        }
        
        return {
            retRange5d,
            retRange20d,
            retRatio,
            current: retRatio.length > 0 ? retRatio[retRatio.length - 1] : null
        };
    }

    /**
     * 5. RÉGIMEN DE MERCADO (por ticker individual)
     */
    determineMarketRegime(rollingStats, ticker) {
        if (!rollingStats || !rollingStats[5] || !rollingStats[20]) {
            return { regime: 'INSUFFICIENT_DATA', volRatio: null };
        }
        
        const latest5d = rollingStats[5].sd[rollingStats[5].sd.length - 1];
        const latest20d = rollingStats[20].sd[rollingStats[20].sd.length - 1];
        
        if (latest20d === null || latest5d === null) {
            return { regime: 'INSUFFICIENT_DATA', volRatio: null };
        }
        
        const volRatio = latest5d / latest20d;
        
        let regime;
        if (volRatio > 1.3) {
            regime = 'EXPANSION_ALTA';
        } else if (volRatio > 1.0) {
            regime = 'EXPANSION_MODERADA';
        } else if (volRatio > 0.7) {
            regime = 'COMPRESION_MODERADA';
        } else {
            regime = 'COMPRESION_ALTA';
        }
        
        return {
            regime,
            volRatio,
            interpretation: this.getRegimeInterpretation(regime, volRatio)
        };
    }

    getRegimeInterpretation(regime, volRatio) {
        const interpretations = {
            'EXPANSION_ALTA': 'Vol burst extremo - evitar venta de opciones, considerar compra de volatilidad',
            'EXPANSION_MODERADA': 'Expansión de volatilidad - precaución para vendedores, spreads recomendados',
            'COMPRESION_MODERADA': 'Compresión moderada - favorable para venta de tiempo theta positivo',
            'COMPRESION_ALTA': 'Compresión extrema - oportunidad para comprar volatilidad (straddle/strangle)',
            'INSUFFICIENT_DATA': 'Datos insuficientes para determinar régimen'
        };
        
        return interpretations[regime] || 'Régimen desconocido';
    }

    /**
     * 6. VOLATILIDAD EMPÍRICA ANUALIZADA
     */
    calculateEmpiricalVolatility(rollingStats, marketRegime) {
        if (!rollingStats || !rollingStats[20]) {
            return { sigmaDaily: null, sigmaAnnual: null, sigmaAdj: null };
        }
        
        const sigmaDaily = rollingStats[20].sd[rollingStats[20].sd.length - 1];
        if (sigmaDaily === null) {
            return { sigmaDaily: null, sigmaAnnual: null, sigmaAdj: null };
        }
        
        const sigmaAnnual = sigmaDaily * Math.sqrt(252);
        
        // Ajuste por régimen de mercado
        const volRatio = marketRegime.volRatio || 1.0;
        const sigmaAdj = sigmaAnnual * Math.min(volRatio, 1.5);
        
        return {
            sigmaDaily,
            sigmaAnnual,
            sigmaAdj,
            adjustmentFactor: volRatio > 1 ? Math.min(volRatio, 1.5) : 1.0
        };
    }

    /**
     * 7. PROBABILIDAD DE PROFIT POR ESTRATEGIA
     */
    calculateStrategyProbabilities(S, sigmaAdj, T, strikeOffset = 0.05) {
        const r = this.riskFreeRate;
        
        // Calcular strikes OTM
        const K_call = S * (1 + strikeOffset);
        const K_put = S * (1 - strikeOffset);
        
        // Función d2 para Black-Scholes
        const d2 = (S, K, sigma, T) => {
            return (Math.log(S/K) + (r - 0.5*sigma*sigma)*T) / (sigma*Math.sqrt(T));
        };
        
        // Función CDF normal
        const normCDF = (x) => {
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
        };
        
        // Long Call (OTM): necesita S_T > K
        const P_call = normCDF(d2(S, K_call, sigmaAdj, T));
        
        // Long Put (OTM): necesita S_T < K
        const P_put = 1 - normCDF(d2(S, K_put, sigmaAdj, T));
        
        // Short Straddle ATM: necesita precio en rango ± 1σ√T
        const range_1sigma = sigmaAdj * Math.sqrt(T) * S;
        const P_straddle = normCDF(d2(S, S + range_1sigma, sigmaAdj, T)) - 
                           normCDF(d2(S, S - range_1sigma, sigmaAdj, T));
        
        // Long Strangle: max de los dos lados OTM
        const P_strangle = Math.max(P_call, P_put);
        
        // Spreads: descuento de ~15% por coste de la pata vendida
        const P_bull_call_spread = normCDF(d2(S, S, sigmaAdj, T)) * 0.85;
        const P_bear_put_spread = (1 - normCDF(d2(S, S, sigmaAdj, T))) * 0.85;
        
        // Calcular breakeven points
        const breakevens = {
            long_call: K_call,
            long_put: K_put,
            short_straddle: {
                lower: S - range_1sigma,
                upper: S + range_1sigma
            },
            long_strangle: Math.max(K_call, K_put),
            bull_call_spread: S,
            bear_put_spread: S
        };
        
        return {
            long_call: { p_profit: P_call, breakeven: breakevens.long_call },
            long_put: { p_profit: P_put, breakeven: breakevens.long_put },
            short_straddle: { p_profit: P_straddle, breakeven: breakevens.short_straddle },
            long_strangle: { p_profit: P_strangle, breakeven: breakevens.long_strangle },
            bull_call_spread: { p_profit: P_bull_call_spread, breakeven: breakevens.bull_call_spread },
            bear_put_spread: { p_profit: P_bear_put_spread, breakeven: breakevens.bear_put_spread }
        };
    }

    /**
     * 8. VOLATILITY CONE
     */
    calculateVolatilityCone(rollingStats, horizons = this.coneHorizons) {
        const cone = {};
        
        horizons.forEach(h => {
            if (!rollingStats || !rollingStats[h]) {
                cone[h] = { p10: null, p25: null, p50: null, p75: null, p90: null, current: null };
                return;
            }
            
            // Convertir a volatilidad anualizada en porcentaje
            const annualizedVols = rollingStats[h].sd.map(sd => 
                sd !== null ? sd * Math.sqrt(252) * 100 : null
            ).filter(vol => vol !== null);
            
            if (annualizedVols.length === 0) {
                cone[h] = { p10: null, p25: null, p50: null, p75: null, p90: null, current: null };
                return;
            }
            
            // Calcular percentiles
            annualizedVols.sort((a, b) => a - b);
            const percentiles = this.calculatePercentiles(annualizedVols);
            
            cone[h] = {
                ...percentiles,
                current: rollingStats[h].sd.length > 0 ? 
                    rollingStats[h].sd[rollingStats[h].sd.length - 1] * Math.sqrt(252) * 100 : null
            };
        });
        
        return cone;
    }

    /**
     * 9. ANÁLISIS COMPLETO POR TICKER
     */
    analyzeTicker(ticker, prices, optionsData = null) {
        if (!prices || prices.length < 60) {
            return {
                ticker,
                error: 'Insufficient price data (minimum 60 days required)'
            };
        }
        
        // 1. Calcular log returns
        const logReturns = this.calculateLogReturns(prices);
        
        // 2. Calcular rolling statistics
        const rollingStats = this.calculateRollingStats(logReturns);
        
        // 3. Determinar régimen de mercado
        const marketRegime = this.determineMarketRegime(rollingStats, ticker);
        
        // 4. Calcular volatilidad empírica
        const volatility = this.calculateEmpiricalVolatility(rollingStats, marketRegime);
        
        // 5. Calcular probabilidades de estrategia (si hay datos de opciones)
        let strategyProbabilities = null;
        if (optionsData && volatility.sigmaAdj) {
            const S = prices[prices.length - 1];
            const T = optionsData.daysToExpiry ? optionsData.daysToExpiry / 252 : 30/252;
            strategyProbabilities = this.calculateStrategyProbabilities(S, volatility.sigmaAdj, T);
        }
        
        // 6. Calcular volatility cone
        const volCone = this.calculateVolatilityCone(rollingStats);
        
        return {
            ticker,
            currentPrice: prices[prices.length - 1],
            dataPoints: prices.length,
            sigmaDaily: volatility.sigmaDaily,
            sigmaAnnual: volatility.sigmaAnnual,
            sigmaAdj: volatility.sigmaAdj,
            volRatio: marketRegime.volRatio,
            retRatio: null, // Se calculará a nivel de panel
            regime: marketRegime.regime,
            regimeInterpretation: marketRegime.interpretation,
            strategies: strategyProbabilities,
            volCone,
            rollingStats,
            lastUpdate: new Date().toISOString()
        };
    }

    /**
     * ANÁLISIS COMPLETO DE MERCADO
     */
    async analyzeMarket(priceDataDict, optionsData = null) {
        const analysis = {
            timestamp: new Date().toISOString(),
            tickers: {},
            panels: {},
            marketOverview: {}
        };
        
        // Analizar cada ticker individualmente
        for (const [ticker, prices] of Object.entries(priceDataDict)) {
            const tickerOptions = optionsData && optionsData[ticker] ? optionsData[ticker] : null;
            analysis.tickers[ticker] = this.analyzeTicker(ticker, prices, tickerOptions);
        }
        
        // Análisis por panel
        const rollingStatsByTicker = {};
        Object.entries(analysis.tickers).forEach(([ticker, tickerAnalysis]) => {
            if (tickerAnalysis.rollingStats) {
                rollingStatsByTicker[ticker] = tickerAnalysis.rollingStats;
            }
        });
        
        // Calcular ratios por panel
        Object.keys(this.panels).forEach(panel => {
            const volRatioAnalysis = this.calculateVolatilityRangeRatio(rollingStatsByTicker, panel);
            const retRatioAnalysis = this.calculateReturnRangeRatio(rollingStatsByTicker, panel);
            
            analysis.panels[panel] = {
                volatilityRatio: volRatioAnalysis,
                returnRatio: retRatioAnalysis,
                tickers: this.panels[panel]
            };
            
            // Agregar ratios a cada ticker del panel
            this.panels[panel].forEach(ticker => {
                if (analysis.tickers[ticker]) {
                    analysis.tickers[ticker].volRatio = volRatioAnalysis.current;
                    analysis.tickers[ticker].retRatio = retRatioAnalysis.current;
                }
            });
        });
        
        // Resumen del mercado
        analysis.marketOverview = this.generateMarketOverview(analysis);
        
        return analysis;
    }

    /**
     * Generar resumen del mercado
     */
    generateMarketOverview(analysis) {
        const tickers = Object.values(analysis.tickers).filter(t => !t.error);
        
        if (tickers.length === 0) {
            return { error: 'No valid ticker analysis available' };
        }
        
        const regimes = tickers.reduce((acc, ticker) => {
            acc[ticker.regime] = (acc[ticker.regime] || 0) + 1;
            return acc;
        }, {});
        
        const avgVolRatio = tickers.reduce((sum, t) => sum + (t.volRatio || 0), 0) / tickers.length;
        const avgSigmaAdj = tickers.reduce((sum, t) => sum + (t.sigmaAdj || 0), 0) / tickers.length;
        
        return {
            totalTickers: tickers.length,
            regimeDistribution: regimes,
            averageVolRatio: avgVolRatio,
            averageAdjustedVolatility: avgSigmaAdj,
            marketPhase: avgVolRatio > 1.1 ? 'EXPANSIVE' : avgVolRatio < 0.8 ? 'COMPRESSIVE' : 'NEUTRAL',
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Funciones utilitarias
     */
    calculateStandardDeviation(values) {
        if (!values || values.length === 0) return null;
        
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (values.length - 1);
        return Math.sqrt(variance);
    }

    calculatePercentiles(sortedValues) {
        if (!sortedValues || sortedValues.length === 0) {
            return { p10: null, p25: null, p50: null, p75: null, p90: null };
        }
        
        const getPercentile = (p) => {
            const index = Math.ceil((p / 100) * sortedValues.length) - 1;
            return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
        };
        
        return {
            p10: getPercentile(10),
            p25: getPercentile(25),
            p50: getPercentile(50),
            p75: getPercentile(75),
            p90: getPercentile(90)
        };
    }

    /**
     * Formatear resultados para visualización
     */
    formatAnalysisForDisplay(analysis) {
        return {
            ...analysis,
            display: {
                marketPhase: {
                    'EXPANSIVE': { color: '#ff6b6b', label: 'Expansivo', icon: '📈' },
                    'COMPRESSIVE': { color: '#4ecdc4', label: 'Compresivo', icon: '📉' },
                    'NEUTRAL': { color: '#95e77e', label: 'Neutral', icon: '➡️' }
                }[analysis.marketOverview.marketPhase] || { color: '#666', label: 'Desconocido', icon: '❓' },
                
                regimeColors: {
                    'EXPANSION_ALTA': '#ff4444',
                    'EXPANSION_MODERADA': '#ff8844',
                    'COMPRESION_MODERADA': '#44ff44',
                    'COMPRESION_ALTA': '#4444ff',
                    'INSUFFICIENT_DATA': '#666666'
                }
            }
        };
    }
}

// Exportar para uso en la aplicación
export const marketDispersionAnalyzer = new MarketDispersionAnalyzer();
