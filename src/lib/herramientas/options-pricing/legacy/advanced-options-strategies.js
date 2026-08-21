/**
 * Advanced Options Strategies for Argentine Market
 * Specialized for BYMA/BCBA conditions with high volatility and liquidity constraints
 */

class AdvancedOptionsStrategies {
    constructor() {
        this.marketContext = {
            country: 'Argentina',
            exchange: 'BYMA/BCBA',
            characteristics: {
                highVolatility: true,
                liquidityConstraints: true,
                wideSpreads: true,
                currencyRisk: true,
                politicalRisk: true
            }
        };
        
        this.strategyTemplates = this.initializeStrategies();
    }

    initializeStrategies() {
        return {
            // === ESTRATEGIAS PARA MERCADO ARGENTINO ===
            
            // 1. Put Spread Vertical (Bajista moderado)
            putSpreadVertical: {
                name: 'Put Spread Vertical',
                description: 'Venta de put con strike más cercano, compra de put más lejano',
                marketConditions: ['lateral_descendente', 'volatilidad_alta'],
                riskProfile: 'limited_risk',
                maxLoss: 'net_premium_paid',
                maxGain: 'strike_difference - net_premium',
                liquidityRequirement: 'medium',
                volatilityImpact: 'positive',
                
                generateStrategy: (options, spot, params = {}) => {
                    const { targetReturn = 0.15, maxSpread = 0.20, minLiquidity = 1000 } = params;
                    
                    // Filtrar puts con liquidez
                    const puts = options.filter(opt => 
                        opt.tipoOpcion === 'Put' && 
                        opt.montoOperado >= minLiquidez &&
                        this.isSpreadAcceptable(opt.bid, opt.ask, maxSpread)
                    ).sort((a, b) => a.strike - b.strike);

                    const strategies = [];
                    
                    for (let i = 0; i < puts.length - 1; i++) {
                        const shortPut = puts[i];  // Strike más cercano (vendido)
                        const longPut = puts[i + 1]; // Strike más lejano (comprado)
                        
                        if (shortPut.strike > spot * 0.95 && longPut.strike > spot * 0.90) {
                            const credit = shortPut.precioOpcion - longPut.precioOpcion;
                            const maxRisk = longPut.strike - shortPut.strike - credit;
                            const expectedReturn = credit / maxRisk;
                            
                            if (expectedReturn >= targetReturn && credit > 0) {
                                strategies.push({
                                    type: 'putSpreadVertical',
                                    legs: [
                                        { ...shortPut, action: 'sell', quantity: 1 },
                                        { ...longPut, action: 'buy', quantity: 1 }
                                    ],
                                    metrics: {
                                        credit: credit,
                                        maxRisk: maxRisk,
                                        expectedReturn: expectedReturn,
                                        breakEven: shortPut.strike - credit,
                                        probability: this.calculateSpreadProbability(shortPut, longPut, spot)
                                    }
                                });
                            }
                        }
                    }
                    
                    return strategies.sort((a, b) => b.metrics.expectedReturn - a.metrics.expectedReturn);
                }
            },

            // 2. Call Spread Vertical (Alcista moderado)
            callSpreadVertical: {
                name: 'Call Spread Vertical',
                description: 'Compra de call con strike más cercano, venta de call más lejano',
                marketConditions: ['lateral_ascendente', 'volatilidad_alta'],
                riskProfile: 'limited_risk',
                maxLoss: 'net_premium_paid',
                maxGain: 'strike_difference - net_premium',
                liquidityRequirement: 'medium',
                volatilityImpact: 'positive',
                
                generateStrategy: (options, spot, params = {}) => {
                    const { targetReturn = 0.20, maxSpread = 0.20, minLiquidity = 1000 } = params;
                    
                    const calls = options.filter(opt => 
                        opt.tipoOpcion === 'Call' && 
                        opt.montoOperado >= minLiquidity &&
                        this.isSpreadAcceptable(opt.bid, opt.ask, maxSpread)
                    ).sort((a, b) => a.strike - b.strike);

                    const strategies = [];
                    
                    for (let i = 0; i < calls.length - 1; i++) {
                        const longCall = calls[i];   // Strike más cercano (comprado)
                        const shortCall = calls[i + 1]; // Strike más lejano (vendido)
                        
                        if (longCall.strike >= spot * 0.98 && shortCall.strike <= spot * 1.15) {
                            const debit = longCall.precioOpcion - shortCall.precioOpcion;
                            const maxGain = shortCall.strike - longCall.strike - debit;
                            const expectedReturn = maxGain / debit;
                            
                            if (expectedReturn >= targetReturn && debit > 0) {
                                strategies.push({
                                    type: 'callSpreadVertical',
                                    legs: [
                                        { ...longCall, action: 'buy', quantity: 1 },
                                        { ...shortCall, action: 'sell', quantity: 1 }
                                    ],
                                    metrics: {
                                        debit: debit,
                                        maxGain: maxGain,
                                        expectedReturn: expectedReturn,
                                        breakEven: longCall.strike + debit,
                                        probability: this.calculateSpreadProbability(longCall, shortCall, spot)
                                    }
                                });
                            }
                        }
                    }
                    
                    return strategies.sort((a, b) => b.metrics.expectedReturn - a.metrics.expectedReturn);
                }
            },

            // 3. Iron Condor (Rango definido)
            ironCondor: {
                name: 'Iron Condor',
                description: 'Combinación de put spread y call spread para rango definido',
                marketConditions: ['lateral', 'volatilidad_alta'],
                riskProfile: 'limited_risk',
                maxLoss: 'max_width - credit',
                maxGain: 'credit_received',
                liquidityRequirement: 'high',
                volatilityImpact: 'positive',
                
                generateStrategy: (options, spot, params = {}) => {
                    const { targetCredit = 0.30, maxSpread = 0.25, minLiquidity = 2000 } = params;
                    
                    const puts = options.filter(opt => 
                        opt.tipoOpcion === 'Put' && 
                        opt.montoOperado >= minLiquidity &&
                        opt.strike < spot * 0.95
                    ).sort((a, b) => b.strike - a.strike);

                    const calls = options.filter(opt => 
                        opt.tipoOpcion === 'Call' && 
                        opt.montoOperado >= minLiquidity &&
                        opt.strike > spot * 1.05
                    ).sort((a, b) => a.strike - b.strike);

                    const strategies = [];
                    
                    // Encontrar mejores combinaciones
                    for (let i = 0; i < Math.min(puts.length - 1, 3); i++) {
                        for (let j = 0; j < Math.min(calls.length - 1, 3); j++) {
                            const shortPut = puts[i];
                            const longPut = puts[i + 1];
                            const longCall = calls[j];
                            const shortCall = calls[j + 1];
                            
                            const credit = (shortPut.precioOpcion + shortCall.precioOpcion) - 
                                         (longPut.precioOpcion + longCall.precioOpcion);
                            
                            const maxRisk = (shortPut.strike - longPut.strike) + 
                                          (shortCall.strike - longCall.strike) - credit;
                            
                            const expectedReturn = credit / maxRisk;
                            
                            if (credit >= targetCredit && expectedReturn >= 0.15) {
                                strategies.push({
                                    type: 'ironCondor',
                                    legs: [
                                        { ...shortPut, action: 'sell', quantity: 1 },
                                        { ...longPut, action: 'buy', quantity: 1 },
                                        { ...longCall, action: 'buy', quantity: 1 },
                                        { ...shortCall, action: 'sell', quantity: 1 }
                                    ],
                                    metrics: {
                                        credit: credit,
                                        maxRisk: maxRisk,
                                        expectedReturn: expectedReturn,
                                        lowerBreakEven: shortPut.strike - credit,
                                        upperBreakEven: shortCall.strike + credit,
                                        rangeWidth: (shortCall.strike - shortPut.strike) / spot,
                                        probability: this.calculateIronCondorProbability(shortPut, longPut, longCall, shortCall, spot)
                                    }
                                });
                            }
                        }
                    }
                    
                    return strategies.sort((a, b) => b.metrics.expectedReturn - a.metrics.expectedReturn);
                }
            },

            // 4. Straddle Comprado (Alta volatilidad esperada)
            straddleLong: {
                name: 'Straddle Comprado',
                description: 'Compra simultánea de call y put ATM para capturar movimientos grandes',
                marketConditions: ['breakout_esperado', 'volatilidad_baja'],
                riskProfile: 'limited_loss',
                maxLoss: 'total_premium',
                maxGain: 'unlimited',
                liquidityRequirement: 'high',
                volatilityImpact: 'very_positive',
                
                generateStrategy: (options, spot, params = {}) => {
                    const { maxDebit = spot * 0.05, maxSpread = 0.15, minLiquidity = 3000 } = params;
                    
                    // Encontrar calls y puts ATM
                    const atmCalls = options.filter(opt => 
                        opt.tipoOpcion === 'Call' && 
                        Math.abs(opt.strike - spot) / spot < 0.02 &&
                        opt.montoOperado >= minLiquidity &&
                        this.isSpreadAcceptable(opt.bid, opt.ask, maxSpread)
                    );

                    const atmPuts = options.filter(opt => 
                        opt.tipoOpcion === 'Put' && 
                        Math.abs(opt.strike - spot) / spot < 0.02 &&
                        opt.montoOperado >= minLiquidity &&
                        this.isSpreadAcceptable(opt.bid, opt.ask, maxSpread)
                    );

                    const strategies = [];
                    
                    // Combinar calls y puts ATM con mismo vencimiento
                    atmCalls.forEach(call => {
                        atmPuts.forEach(put => {
                            if (call.fechaVencimiento === put.fechaVencimiento) {
                                const totalDebit = call.precioOpcion + put.precioOpcion;
                                
                                if (totalDebit <= maxDebit) {
                                    const breakEvenUp = call.strike + totalDebit;
                                    const breakEvenDown = put.strike - totalDebit;
                                    const moveRequired = totalDebit / spot;
                                    
                                    strategies.push({
                                        type: 'straddleLong',
                                        legs: [
                                            { ...call, action: 'buy', quantity: 1 },
                                            { ...put, action: 'buy', quantity: 1 }
                                        ],
                                        metrics: {
                                            totalDebit: totalDebit,
                                            breakEvenUp: breakEvenUp,
                                            breakEvenDown: breakEvenDown,
                                            moveRequired: moveRequired,
                                            maxLoss: totalDebit,
                                            probability: this.calculateStraddleProbability(call, put, spot)
                                        }
                                    });
                                }
                            }
                        });
                    });
                    
                    return strategies.sort((a, b) => a.metrics.totalDebit - b.metrics.totalDebit);
                }
            },

            // 5. Butterfly Spread (Alta precisión direccional)
            butterflySpread: {
                name: 'Butterfly Spread',
                description: 'Estrategia de riesgo limitado con alto potencial si el precio se mantiene cerca del strike central',
                marketConditions: ['lateral_estable', 'volatilidad_baja'],
                riskProfile: 'limited_risk',
                maxLoss: 'net_premium_paid',
                maxGain: 'strike_difference - net_premium',
                liquidityRequirement: 'medium',
                volatilityImpact: 'negative',
                
                generateStrategy: (options, spot, params = {}) => {
                    const { maxDebit = spot * 0.02, maxSpread = 0.20, minLiquidity = 1500 } = params;
                    
                    const calls = options.filter(opt => 
                        opt.tipoOpcion === 'Call' && 
                        opt.montoOperado >= minLiquidity &&
                        this.isSpreadAcceptable(opt.bid, opt.ask, maxSpread)
                    ).sort((a, b) => a.strike - b.strike);

                    const strategies = [];
                    
                    // Generar butterflies con strikes equidistantes
                    for (let i = 0; i < calls.length - 2; i++) {
                        const lowerCall = calls[i];
                        const middleCall = calls[i + 1];
                        const upperCall = calls[i + 2];
                        
                        // Verificar equidistancia
                        const lowerSpread = middleCall.strike - lowerCall.strike;
                        const upperSpread = upperCall.strike - middleCall.strike;
                        
                        if (Math.abs(lowerSpread - upperSpread) / lowerSpread < 0.1) {
                            const debit = (lowerCall.precioOpcion + upperCall.precioOpcion) - 
                                        (2 * middleCall.precioOpcion);
                            
                            if (debit > 0 && debit <= maxDebit) {
                                const maxGain = lowerSpread - debit;
                                const expectedReturn = maxGain / debit;
                                
                                strategies.push({
                                    type: 'butterflySpread',
                                    legs: [
                                        { ...lowerCall, action: 'buy', quantity: 1 },
                                        { ...middleCall, action: 'sell', quantity: 2 },
                                        { ...upperCall, action: 'buy', quantity: 1 }
                                    ],
                                    metrics: {
                                        debit: debit,
                                        maxGain: maxGain,
                                        expectedReturn: expectedReturn,
                                        breakEvenLower: lowerCall.strike + debit,
                                        breakEvenUpper: upperCall.strike - debit,
                                        sweetSpot: middleCall.strike,
                                        probability: this.calculateButterflyProbability(lowerCall, middleCall, upperCall, spot)
                                    }
                                });
                            }
                        }
                    }
                    
                    return strategies.sort((a, b) => b.metrics.expectedReturn - a.metrics.expectedReturn);
                }
            },

            // 6. Covered Call (Generación de ingresos)
            coveredCall: {
                name: 'Covered Call',
                description: 'Venta de calls sobre posición subyacente para generar ingresos',
                marketConditions: ['lateral_ascendente', 'volatilidad_alta'],
                riskProfile: 'limited_gain',
                maxLoss: 'stock_price - premium',
                maxGain: 'strike_difference + premium',
                liquidityRequirement: 'low',
                volatilityImpact: 'positive',
                
                generateStrategy: (options, spot, params = {}) => {
                    const { minPremium = spot * 0.01, maxSpread = 0.25, minLiquidity = 500 } = params;
                    
                    const otmCalls = options.filter(opt => 
                        opt.tipoOpcion === 'Call' && 
                        opt.strike > spot * 1.02 &&
                        opt.strike <= spot * 1.15 &&
                        opt.montoOperado >= minLiquidity &&
                        this.isSpreadAcceptable(opt.bid, opt.ask, maxSpread)
                    ).sort((a, b) => a.strike - b.strike);

                    const strategies = [];
                    
                    otmCalls.forEach(call => {
                        if (call.precioOpcion >= minPremium) {
                            const premium = call.precioOpcion;
                            const maxReturn = (call.strike - spot + premium) / spot;
                            const downsideProtection = premium / spot;
                            
                            strategies.push({
                                type: 'coveredCall',
                                legs: [
                                    { action: 'buy_stock', quantity: 100, price: spot },
                                    { ...call, action: 'sell', quantity: 1 }
                                ],
                                metrics: {
                                    premium: premium,
                                    maxReturn: maxReturn,
                                    downsideProtection: downsideProtection,
                                    breakEven: spot - premium,
                                    assignedPrice: call.strike,
                                    probability: this.calculateCoveredCallProbability(call, spot)
                                }
                            });
                        }
                    });
                    
                    return strategies.sort((a, b) => b.metrics.downsideProtection - a.metrics.downsideProtection);
                }
            }
        };
    }

    // === MÉTODOS DE ANÁLISIS Y CÁLCULO ===

    isSpreadAcceptable(bid, ask, maxSpread) {
        if (!bid || !ask || bid <= 0 || ask <= 0) return false;
        const spread = ((ask - bid) / ((bid + ask) / 2)) * 100;
        return spread <= maxSpread;
    }

    calculateSpreadProbability(shortLeg, longLeg, spot) {
        // Usar Monte Carlo simplificado para probabilidad de profit
        const volatility = shortLeg.volatilidadImplicita || 0.30;
        const timeToExpiry = this.getTimeToExpiry(shortLeg.fechaVencimiento);
        
        const simulations = 10000;
        let profitableCount = 0;
        
        for (let i = 0; i < simulations; i++) {
            const randomReturn = this.generateRandomReturn(volatility, timeToExpiry);
            const futurePrice = spot * (1 + randomReturn);
            
            let payoff = 0;
            if (shortLeg.tipoOpcion === 'Put') {
                payoff = Math.max(0, shortLeg.strike - futurePrice) - 
                        Math.max(0, longLeg.strike - futurePrice) + 
                        (shortLeg.precioOpcion - longLeg.precioOpcion);
            } else {
                payoff = Math.max(0, futurePrice - longLeg.strike) - 
                        Math.max(0, futurePrice - shortLeg.strike) - 
                        (longLeg.precioOpcion - shortLeg.precioOpcion);
            }
            
            if (payoff > 0) profitableCount++;
        }
        
        return profitableCount / simulations;
    }

    calculateIronCondorProbability(shortPut, longPut, longCall, shortCall, spot) {
        const volatility = (shortPut.volatilidadImplicita + shortCall.volatilidadImplicita) / 2;
        const timeToExpiry = this.getTimeToExpiry(shortPut.fechaVencimiento);
        
        const simulations = 10000;
        let profitableCount = 0;
        
        for (let i = 0; i < simulations; i++) {
            const randomReturn = this.generateRandomReturn(volatility, timeToExpiry);
            const futurePrice = spot * (1 + randomReturn);
            
            // Iron Condor es rentable si el precio se mantiene dentro del rango
            if (futurePrice >= longPut.strike && futurePrice <= longCall.strike) {
                profitableCount++;
            }
        }
        
        return profitableCount / simulations;
    }

    calculateStraddleProbability(call, put, spot) {
        const volatility = (call.volatilidadImplicita + put.volatilidadImplicita) / 2;
        const timeToExpiry = this.getTimeToExpiry(call.fechaVencimiento);
        
        const simulations = 10000;
        let profitableCount = 0;
        const totalPremium = call.precioOpcion + put.precioOpcion;
        
        for (let i = 0; i < simulations; i++) {
            const randomReturn = this.generateRandomReturn(volatility, timeToExpiry);
            const futurePrice = spot * (1 + randomReturn);
            
            let payoff = 0;
            if (futurePrice > call.strike) {
                payoff = futurePrice - call.strike - totalPremium;
            } else if (futurePrice < put.strike) {
                payoff = put.strike - futurePrice - totalPremium;
            }
            
            if (payoff > 0) profitableCount++;
        }
        
        return profitableCount / simulations;
    }

    calculateButterflyProbability(lowerCall, middleCall, upperCall, spot) {
        const volatility = (lowerCall.volatilidadImplicita + upperCall.volatilidadImplicita) / 2;
        const timeToExpiry = this.getTimeToExpiry(lowerCall.fechaVencimiento);
        
        const simulations = 10000;
        let profitableCount = 0;
        const debit = (lowerCall.precioOpcion + upperCall.precioOpcion) - (2 * middleCall.precioOpcion);
        
        for (let i = 0; i < simulations; i++) {
            const randomReturn = this.generateRandomReturn(volatility, timeToExpiry);
            const futurePrice = spot * (1 + randomReturn);
            
            let payoff = 0;
            if (futurePrice <= lowerCall.strike) {
                payoff = -debit;
            } else if (futurePrice <= middleCall.strike) {
                payoff = futurePrice - lowerCall.strike - debit;
            } else if (futurePrice <= upperCall.strike) {
                payoff = upperCall.strike - futurePrice - debit;
            } else {
                payoff = -debit;
            }
            
            if (payoff > 0) profitableCount++;
        }
        
        return profitableCount / simulations;
    }

    calculateCoveredCallProbability(call, spot) {
        const volatility = call.volatilidadImplicita || 0.30;
        const timeToExpiry = this.getTimeToExpiry(call.fechaVencimiento);
        
        const simulations = 10000;
        let profitableCount = 0;
        
        for (let i = 0; i < simulations; i++) {
            const randomReturn = this.generateRandomReturn(volatility, timeToExpiry);
            const futurePrice = spot * (1 + randomReturn);
            
            // Covered Call genera ingresos del premium más ganancia limitada
            const totalReturn = call.precioOpcion + Math.min(futurePrice - spot, call.strike - spot);
            
            if (totalReturn > 0) profitableCount++;
        }
        
        return profitableCount / simulations;
    }

    generateRandomReturn(volatility, timeToExpiry) {
        // Generar retorno aleatorio con distribución normal
        const randomNormal = this.boxMullerRandom();
        return randomNormal * volatility * Math.sqrt(timeToExpiry);
    }

    boxMullerRandom() {
        let u1, u2;
        do { u1 = Math.random(); } while (u1 === 0);
        u2 = Math.random();
        return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    }

    getTimeToExpiry(expiryDate) {
        const today = new Date();
        const expiry = new Date(expiryDate);
        const diffTime = Math.abs(expiry - today);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays / 365; // Convertir a años
    }

    // === SELECCIÓN DINÁMICA DE ESTRATEGIAS ===

    selectOptimalStrategies(options, spot, marketCondition = 'neutral', riskTolerance = 'medium') {
        const allStrategies = [];
        
        // Generar estrategias para cada plantilla
        Object.entries(this.strategyTemplates).forEach(([key, template]) => {
            if (template.marketConditions.includes(marketCondition)) {
                const strategies = template.generateStrategy(options, spot, {
                    targetReturn: riskTolerance === 'high' ? 0.25 : riskTolerance === 'low' ? 0.10 : 0.15,
                    maxSpread: riskTolerance === 'high' ? 0.30 : 0.20,
                    minLiquidity: riskTolerance === 'high' ? 1000 : 2000
                });
                
                strategies.forEach(strategy => {
                    strategy.template = key;
                    strategy.name = template.name;
                    strategy.riskProfile = template.riskProfile;
                    strategy.liquidityRequirement = template.liquidityRequirement;
                });
                
                allStrategies.push(...strategies);
            }
        });

        // Ordenar por retorno esperado ajustado por riesgo
        return allStrategies.sort((a, b) => {
            const scoreA = this.calculateRiskAdjustedScore(a, riskTolerance);
            const scoreB = this.calculateRiskAdjustedScore(b, riskTolerance);
            return scoreB - scoreA;
        }).slice(0, 10); // Top 10 estrategias
    }

    calculateRiskAdjustedScore(strategy, riskTolerance) {
        const baseScore = strategy.metrics.expectedReturn || 0;
        const probability = strategy.metrics.probability || 0;
        
        // Ajustar por tolerancia al riesgo
        let riskMultiplier = 1;
        if (riskTolerance === 'low' && strategy.riskProfile === 'limited_risk') {
            riskMultiplier = 1.2;
        } else if (riskTolerance === 'high' && strategy.riskProfile === 'limited_loss') {
            riskMultiplier = 1.1;
        }
        
        // Ajustar por liquidez
        let liquidityMultiplier = 1;
        if (strategy.liquidityRequirement === 'low') liquidityMultiplier = 1.1;
        else if (strategy.liquidityRequirement === 'high') liquidityMultiplier = 0.9;
        
        return baseScore * probability * riskMultiplier * liquidityMultiplier;
    }

    // === ANÁLISIS DE MERCADO PARA SELECCIÓN ===

    analyzeMarketConditions(options, spot, historicalData = null) {
        const ivs = options.map(opt => opt.volatilidadImplicita).filter(iv => iv > 0);
        const avgIV = ivs.length > 0 ? ivs.reduce((a, b) => a + b) / ivs.length : 0.30;
        
        const liquidityScore = this.calculateLiquidityScore(options);
        const spreadScore = this.calculateSpreadScore(options);
        
        let condition = 'neutral';
        let volatilityLevel = 'medium';
        
        if (avgIV > 0.40) volatilityLevel = 'high';
        else if (avgIV < 0.20) volatilityLevel = 'low';
        
        // Análisis técnico si hay datos históricos
        if (historicalData && historicalData.length > 20) {
            const recent = historicalData.slice(-20);
            const older = historicalData.slice(-40, -20);
            const recentAvg = recent.reduce((a, b) => a + b) / recent.length;
            const olderAvg = older.reduce((a, b) => a + b) / older.length;
            
            if (recentAvg > olderAvg * 1.02) condition = 'lateral_ascendente';
            else if (recentAvg < olderAvg * 0.98) condition = 'lateral_descendente';
            else condition = 'lateral';
        }
        
        return {
            condition,
            volatilityLevel,
            liquidityScore,
            spreadScore,
            avgIV,
            recommendations: this.getMarketRecommendations(condition, volatilityLevel, liquidityScore)
        };
    }

    calculateLiquidityScore(options) {
        const liquidOptions = options.filter(opt => opt.montoOperado > 0);
        return liquidOptions.length / options.length;
    }

    calculateSpreadScore(options) {
        const spreads = options.map(opt => {
            if (!opt.bid || !opt.ask) return 100;
            return ((opt.ask - opt.bid) / ((opt.bid + opt.ask) / 2)) * 100;
        }).filter(s => s < 100);
        
        return spreads.length > 0 ? spreads.reduce((a, b) => a + b) / spreads.length : 50;
    }

    getMarketRecommendations(condition, volatilityLevel, liquidityScore) {
        const recommendations = [];
        
        if (liquidityScore < 0.3) {
            recommendations.push('Mercado con baja liquidez - Considerar estrategias que requieran menos capital');
        }
        
        if (volatilityLevel === 'high') {
            recommendations.push('Alta volatilidad - Favorable para venta de opciones y spreads');
        } else if (volatilityLevel === 'low') {
            recommendations.push('Baja volatilidad - Oportunidad para compra de volatilidad');
        }
        
        if (condition.includes('ascendente')) {
            recommendations.push('Tendencia alcista - Considerar call spreads y covered calls');
        } else if (condition.includes('descendente')) {
            recommendations.push('Tendencia bajista - Considerar put spreads');
        } else {
            recommendations.push('Mercado lateral - Iron condors y butterflies pueden ser efectivos');
        }
        
        return recommendations;
    }
}

// Exportar para uso en la aplicación
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AdvancedOptionsStrategies;
} else if (typeof window !== 'undefined') {
    window.AdvancedOptionsStrategies = AdvancedOptionsStrategies;
}
