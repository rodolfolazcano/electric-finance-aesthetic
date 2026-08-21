/**
 * Sistema de Análisis Cuantitativo de Opciones - Mercado Argentino (BYMA)
 * Analista Cuantitativo Especializado
 * 
 * Este módulo proporciona interpretación detallada de opciones según
 * los parámetros y rangos establecidos para el mercado argentino.
 */

class AnalistaCuantitativoOpciones {
    constructor() {
        // Contexto de mercado actual
        this.contextoMercado = {
            subyacente: 'GGAL',
            spotActual: 6985,
            ma200: 6727,
            rsi14: 37.36,
            tendencia: 'Presión bajista, soporte en MA200',
            sesgoVolatilidad: 'Incertidumbre técnica sin tendencia definida'
        };
        
        // Integración con Market Dispersion
        this.marketDispersionData = null;
        this.volatilityRegime = 'NEUTRAL';
        this.adjustedVolatility = null;
    }

    /**
     * Interpretar Moneyness
     */
    interpretarMoneyness(moneyness, tipo) {
        const valor = Math.abs(moneyness);
        let clasificacion, interpretacion;

        if (tipo === 'Call') {
            if (moneyness > 0.10) {
                clasificacion = 'ITM Profundo';
                interpretacion = 'Prima dominada por valor intrínseco. Poco apalancamiento, comportamiento similar a la acción.';
            } else if (moneyness > 0) {
                clasificacion = 'ITM Leve';
                interpretacion = 'Balance entre valor intrínseco y temporal. Buena para spreads conservadores.';
            } else if (moneyness >= -0.01) {
                clasificacion = 'ATM';
                interpretacion = 'Máxima sensibilidad al movimiento. Theta y Gamma en su punto más alto. Mayor costo pero mayor reactividad.';
            } else if (moneyness >= -0.10) {
                clasificacion = 'OTM Cercano';
                interpretacion = 'Solo valor temporal. Alta sensibilidad relativa al precio. Zona favorita para compra especulativa.';
            } else if (moneyness >= -0.25) {
                clasificacion = 'OTM Moderado';
                interpretacion = 'Bajo costo, baja probabilidad. Útil como seguro o pata corta de spreads alejados.';
            } else {
                clasificacion = 'OTM Lejano';
                interpretacion = 'Prima casi nula. Solo viable como cobertura catastrófica o venta de prima con riesgo controlado.';
            }
        } else { // Put
            if (moneyness < -0.10) {
                clasificacion = 'ITM Profundo';
                interpretacion = 'Prima dominada por valor intrínseco. Poco apalancamiento, comportamiento similar a la acción.';
            } else if (moneyness < 0) {
                clasificacion = 'ITM Leve';
                interpretacion = 'Balance entre valor intrínseco y temporal. Buena para spreads conservadores.';
            } else if (moneyness <= 0.01) {
                clasificacion = 'ATM';
                interpretacion = 'Máxima sensibilidad al movimiento. Theta y Gamma en su punto más alto. Mayor costo pero mayor reactividad.';
            } else if (moneyness <= 0.10) {
                clasificacion = 'OTM Cercano';
                interpretacion = 'Solo valor temporal. Alta sensibilidad relativa al precio. Zona favorita para compra especulativa.';
            } else if (moneyness <= 0.25) {
                clasificacion = 'OTM Moderado';
                interpretacion = 'Bajo costo, baja probabilidad. Útil como seguro o pata corta de spreads alejados.';
            } else {
                clasificacion = 'OTM Lejano';
                interpretacion = 'Prima casi nula. Solo viable como cobertura catastrófica o venta de prima con riesgo controlado.';
            }
        }

        return { clasificacion, interpretacion, valor: moneyness };
    }

    /**
     * Interpretar Delta
     */
    interpretarDelta(delta, tipo) {
        let clasificacion, interpretacion;
        const valorAbs = Math.abs(delta);

        if (tipo === 'Call') {
            if (delta >= 0.80) {
                clasificacion = 'ITM Profundo';
                interpretacion = 'Comportamiento casi igual a la acción. ITM profundo.';
            } else if (delta >= 0.50) {
                clasificacion = 'ITM Moderado';
                interpretacion = 'ITM moderado. Buena captura de movimiento alcista.';
            } else if (delta >= 0.40) {
                clasificacion = 'ATM';
                interpretacion = 'ATM. Máxima incertidumbre direccional.';
            } else if (delta >= 0.20) {
                clasificacion = 'OTM Especulativo';
                interpretacion = 'OTM especulativo. Necesita movimiento importante.';
            } else {
                clasificacion = 'OTM Lejano';
                interpretacion = 'OTM lejano. Alta probabilidad de vencer sin valor.';
            }
        } else { // Put
            if (delta <= -0.80) {
                clasificacion = 'ITM Profundo';
                interpretacion = 'Comportamiento casi igual a la acción corta. ITM profundo.';
            } else if (delta <= -0.50) {
                clasificacion = 'ITM Moderado';
                interpretacion = 'ITM moderado. Buena captura de movimiento bajista.';
            } else if (delta <= -0.40) {
                clasificacion = 'ATM';
                interpretacion = 'ATM. Máxima incertidumbre direccional.';
            } else if (delta <= -0.20) {
                clasificacion = 'OTM Especulativo';
                interpretacion = 'OTM especulativo. Necesita movimiento importante.';
            } else {
                clasificacion = 'OTM Lejano';
                interpretacion = 'OTM lejano. Alta probabilidad de vencer sin valor.';
            }
        }

        const advertencia = valorAbs > 0.90 ? '⚠️ Opción prácticamente equivalente a la acción.' : '';

        return { clasificacion, interpretacion, valor: delta, advertencia };
    }

    /**
     * Interpretar Gamma
     */
    interpretarGamma(gamma) {
        let clasificacion, interpretacion;

        if (gamma < 0.0001) {
            clasificacion = 'Gamma Baja';
            interpretacion = 'Posición estable, delta no cambia mucho con el precio.';
        } else if (gamma <= 0.0005) {
            clasificacion = 'Gamma Moderada';
            interpretacion = 'Cambios de delta manejables.';
        } else if (gamma <= 0.001) {
            clasificacion = 'Gamma Alta';
            interpretacion = 'Posición muy sensible a movimientos del subyacente.';
        } else {
            clasificacion = 'Gamma Extrema';
            interpretacion = 'Riesgo de rebalanceo alto. Favorable para compradores, peligroso para vendedores.';
        }

        return { clasificacion, interpretacion, valor: gamma };
    }

    /**
     * Interpretar Theta
     */
    interpretarTheta(theta) {
        let clasificacion, interpretacion, impacto;

        if (theta >= 0) {
            clasificacion = 'Theta Positivo';
            interpretacion = 'Decaimiento temporal a favor del vendedor.';
            impacto = 'Ingreso diario para vendedor.';
        } else if (theta >= -0.05) {
            clasificacion = 'Decaimiento Mínimo';
            interpretacion = 'Decaimiento temporal mínimo. Opción OTM lejana o largo plazo.';
            impacto = 'Costo diario bajo para comprador.';
        } else if (theta >= -0.20) {
            clasificacion = 'Decaimiento Moderado';
            interpretacion = 'Aceptable para estrategias de compra con horizonte de semanas.';
            impacto = `Costo de $${Math.abs(theta).toFixed(3)} por día.`;
        } else if (theta >= -0.50) {
            clasificacion = 'Decaimiento Significativo';
            interpretacion = 'Requiere movimiento rápido del subyacente para compensar.';
            impacto = `Costo de $${Math.abs(theta).toFixed(3)} por día.`;
        } else if (theta >= -1.00) {
            clasificacion = 'Decaimiento Alto';
            interpretacion = 'Solo viable si se espera movimiento en días.';
            impacto = `Costo de $${Math.abs(theta).toFixed(3)} por día.`;
        } else {
            clasificacion = 'Decaimiento Extremo';
            interpretacion = 'El tiempo juega fuertemente en contra del comprador.';
            impacto = `Costo de $${Math.abs(theta).toFixed(3)} por día.`;
        }

        return { clasificacion, interpretacion, valor: theta, impacto };
    }

    /**
     * Interpretar Vega
     */
    interpretarVega(vega) {
        let clasificacion, interpretacion;

        if (vega < 50) {
            clasificacion = 'Vega Bajo';
            interpretacion = 'Baja sensibilidad a IV. Opción OTM lejana o corto plazo.';
        } else if (vega <= 200) {
            clasificacion = 'Vega Moderado';
            interpretacion = 'Impacto relevante si IV sube/baja 1%.';
        } else if (vega <= 500) {
            clasificacion = 'Vega Alto';
            interpretacion = 'Alta sensibilidad. Estrategias de compra de volatilidad favorecidas si IV está baja.';
        } else {
            clasificacion = 'Vega Extremo';
            interpretacion = 'La opción es muy sensible a cambios de IV. ATM con mucho tiempo al vencimiento.';
        }

        const advertencia = vega > 200 ? 
            '⚠️ En mercados con IV elevada (como Argentina), vega alto es doble filo: si IV cae, la prima se destruye aunque el precio no se mueva.' : '';

        return { clasificacion, interpretacion, valor: vega, advertencia };
    }

    /**
     * Interpretar Volatilidad Implícita
     */
    interpretarVolatilidadImplicita(iv) {
        let clasificacion, interpretacion, estrategia;

        if (iv < 15) {
            clasificacion = 'IV Baja';
            interpretacion = 'Mercado tranquilo. Buena oportunidad para comprar opciones (baratas).';
            estrategia = 'Momento para straddles o compras direccionales.';
        } else if (iv <= 25) {
            clasificacion = 'IV Normal';
            interpretacion = 'IV normal para mercado argentino. Primas razonables.';
            estrategia = 'Estrategias estándar aplicables.';
        } else if (iv <= 40) {
            clasificacion = 'IV Elevada';
            interpretacion = 'Las primas están caras. Favorecer venta de opciones o spreads.';
            estrategia = 'Spreads para reducir costo neto.';
        } else if (iv <= 60) {
            clasificacion = 'IV Muy Alta';
            interpretacion = 'El mercado descuenta incertidumbre importante.';
            estrategia = 'Vender volatilidad con riesgo controlado (spreads).';
        } else {
            clasificacion = 'IV Extrema';
            interpretacion = 'Evento de riesgo implícito. Primas distorsionadas.';
            estrategia = 'Evitar comprar opciones desnudas; solo spreads acotados.';
        }

        return { clasificacion, interpretacion, iv, estrategia };
    }

    /**
     * Interpretar Valuación (Prima teórica vs mercado)
     */
    interpretarValuacion(primaMercado, primaTeorica) {
        const ratio = primaMercado / primaTeorica;
        let clasificacion, interpretacion;

        if (ratio < 0.90) {
            clasificacion = 'Subvaluada';
            interpretacion = 'Opción subvaluada por el mercado. Potencial oportunidad de compra si hay liquidez.';
        } else if (ratio <= 1.10) {
            clasificacion = 'Precio Justo';
            interpretacion = 'El mercado está en línea con Black-Scholes.';
        } else {
            clasificacion = 'Sobrevaluada';
            interpretacion = 'Opción sobrevaluada. Mejor posicionarse como vendedor si el riesgo es controlado.';
        }

        return { clasificacion, interpretacion, ratio, primaMercado, primaTeorica };
    }

    /**
     * Interpretar Probabilidad ITM
     */
    interpretarProbabilidadITM(probabilidad) {
        let clasificacion, interpretacion;

        if (probabilidad < 10) {
            clasificacion = 'Muy Baja';
            interpretacion = 'Muy improbable. Solo como seguro catastrófico o venta de prima con altísimo margen de seguridad.';
        } else if (probabilidad < 25) {
            clasificacion = 'Baja';
            interpretacion = 'OTM especulativo. Relación riesgo/beneficio asimétrica a favor si acierta la dirección.';
        } else if (probabilidad < 40) {
            clasificacion = 'Moderada-Baja';
            interpretacion = 'Zona de spreads OTM con buen balance riesgo/retorno.';
        } else if (probabilidad < 50) {
            clasificacion = 'Zona ATM';
            interpretacion = 'Incertidumbre máxima. Precio puede ir en cualquier dirección con similar probabilidad.';
        } else if (probabilidad < 70) {
            clasificacion = 'Moderadamente Favorable';
            interpretacion = 'ITM leve. Opción con valor intrínseco creciente.';
        } else {
            clasificacion = 'Alta';
            interpretacion = 'Alta probabilidad de ejercicio. Delta alto. Prima cara pero segura para estrategias conservadoras.';
        }

        return { clasificacion, interpretacion, valor: probabilidad };
    }

    /**
     * Interpretar Liquidez
     */
    interpretarLiquidez(volumen, operaciones) {
        let clasificacion, interpretacion, ejecutabilidad;

        if (volumen === 0 && operaciones === 0) {
            clasificacion = 'Sin Liquidez';
            interpretacion = 'No operar. Spread real potencialmente ilimitado.';
            ejecutabilidad = 'Inoperable';
        } else if (volumen > 0 && operaciones <= 5) {
            clasificacion = 'Liquidez Mínima';
            interpretacion = 'Ejecutar con precaución. Verificar spread bid/ask antes de operar.';
            ejecutabilidad = 'Precaución extrema';
        } else if (operaciones <= 50) {
            clasificacion = 'Liquidez Baja';
            interpretacion = 'Viable para lotes pequeños.';
            ejecutabilidad = 'Funcional con cuidado';
        } else if (operaciones <= 500) {
            clasificacion = 'Liquidez Buena';
            interpretacion = 'Mercado activo. Spreads más ajustados.';
            ejecutabilidad = 'Óptima';
        } else {
            clasificacion = 'Alta Liquidez';
            interpretacion = 'Condiciones óptimas para ejecución. Referencia de precio confiable.';
            ejecutabilidad = 'Excelente';
        }

        return { clasificacion, interpretacion, ejecutabilidad, volumen, operaciones };
    }

    /**
     * Interpretar Spread Bid/Ask
     */
    interpretarSpread(spreadPorcentaje) {
        let clasificacion, interpretacion, impacto;

        if (spreadPorcentaje < 5) {
            clasificacion = 'Spread Muy Ajustado';
            interpretacion = 'Mercado eficiente. Costo de transacción mínimo.';
            impacto = 'Costo mínimo';
        } else if (spreadPorcentaje <= 15) {
            clasificacion = 'Spread Normal';
            interpretacion = 'Aceptable en mercados emergentes.';
            impacto = 'Costo moderado';
        } else if (spreadPorcentaje <= 30) {
            clasificacion = 'Spread Amplio';
            interpretacion = 'Aumenta costo real de la estrategia. Usar órdenes límite.';
            impacto = 'Costo elevado';
        } else if (spreadPorcentaje <= 50) {
            clasificacion = 'Spread Muy Amplio';
            interpretacion = 'Solo operar si la estrategia tiene margen suficiente para absorber el costo.';
            impacto = 'Costo muy elevado';
        } else {
            clasificacion = 'Spread Extremo';
            interpretacion = 'Prácticamente inoperable. Precio de referencia no confiable.';
            impacto = 'Inoperable';
        }

        return { clasificacion, interpretacion, valor: spreadPorcentaje, impacto };
    }

    /**
     * Generar diagnóstico completo de una opción
     */
    generarDiagnosticoCompleto(opcion) {
        // Extraer datos de la opción
        const {
            simbolo,
            tipoOpcion,
            strike,
            vencimiento,
            precioOpcion,
            precioSubyacente,
            delta,
            gamma,
            theta,
            vega,
            volatilidadImplicita,
            primaTeorica,
            probabilidadITM,
            volumen,
            operaciones,
            spreadBidAsk
        } = opcion;

        // Calcular moneyness
        const moneyness = (precioSubyacente - strike) / strike;

        // Interpretaciones individuales
        const moneynessInterpretacion = this.interpretarMoneyness(moneyness, tipoOpcion);
        const deltaInterpretacion = this.interpretarDelta(delta, tipoOpcion);
        const gammaInterpretacion = this.interpretarGamma(gamma);
        const thetaInterpretacion = this.interpretarTheta(theta);
        const vegaInterpretacion = this.interpretarVega(vega);
        const ivInterpretacion = this.interpretarVolatilidadImplicita(volatilidadImplicita);
        const valuacionInterpretacion = this.interpretarValuacion(precioOpcion, primaTeorica);
        const probabilidadInterpretacion = this.interpretarProbabilidadITM(probabilidadITM);
        const liquidezInterpretacion = this.interpretarLiquidez(volumen, operaciones);
        const spreadInterpretacion = this.interpretarSpread(spreadBidAsk);

        // Generar diagnóstico general
        const diagnosticoGeneral = this.generarDiagnosticoGeneral(
            moneynessInterpretacion,
            deltaInterpretacion,
            thetaInterpretacion,
            ivInterpretacion,
            liquidezInterpretacion
        );

        // Sugerir estrategias
        const estrategiasSugeridas = this.sugerirEstrategias(
            moneynessInterpretacion,
            deltaInterpretacion,
            thetaInterpretacion,
            ivInterpretacion,
            valuacionInterpretacion,
            liquidezInterpretacion
        );

        // Formatear fecha de vencimiento
        const fechaVencimiento = new Date(vencimiento).toLocaleDateString('es-AR');

        return {
            ticker: simbolo,
            tipo: tipoOpcion,
            strike: strike,
            vencimiento: fechaVencimiento,
            moneyness: moneynessInterpretacion,
            griegasClave: {
                delta: deltaInterpretacion,
                theta: thetaInterpretacion,
                gamma: gammaInterpretacion,
                vega: vegaInterpretacion
            },
            volatilidadImplicita: ivInterpretacion,
            valuacion: valuacionInterpretacion,
            probabilidadITM: probabilidadInterpretacion,
            liquidez: liquidezInterpretacion,
            spread: spreadInterpretacion,
            diagnosticoGeneral,
            estrategiasSugeridas,
            contextoMercado: this.contextoMercado
        };
    }

    /**
     * Generar diagnóstico general
     */
    generarDiagnosticoGeneral(moneyness, delta, theta, iv, liquidez) {
        let diagnostico = '';

        // Evaluar perfil de riesgo
        if (liquidez.clasificacion === 'Sin Liquidez') {
            diagnostico = 'Opción inoperable por falta de liquidez. ';
        } else if (Math.abs(theta.valor) > 1.0 && moneyness.clasificacion.includes('OTM')) {
            diagnostico = 'Alto decaimiento temporal para opción OTM. Requiere movimiento inmediato. ';
        } else if (iv.clasificacion === 'IV Extrema') {
            diagnostico = 'Volatilidad extrema indica alto riesgo/evento. Primas distorsionadas. ';
        } else if (moneyness.clasificacion.includes('ITM Profundo')) {
            diagnostico = 'Opción con comportamiento similar a la acción. Bajo apalancamiento pero mayor seguridad. ';
        } else if (moneyness.clasificacion === 'ATM') {
            diagnostico = 'Máxima sensibilidad direccional con alto decaimiento. Ideal para movimientos cortos y definidos. ';
        } else {
            diagnostico = 'Opción especulativa con riesgo/reward asimétrico. ';
        }

        // Agregar recomendación final
        if (liquidez.clasificacion !== 'Sin Liquidez' && 
            (iv.clasificacion === 'IV Elevada' || iv.clasificacion === 'IV Muy Alta')) {
            diagnostico += 'Favorecer estrategias de venta de prima con riesgo controlado.';
        } else if (liquidez.clasificacion !== 'Sin Liquidez' && 
                   iv.clasificacion === 'IV Baja') {
            diagnostico += 'Oportunidad para compra de volatilidad o direccional.';
        } else {
            diagnostico += 'Evaluar según objetivos de riesgo y horizonte temporal.';
        }

        return diagnostico;
    }

    /**
     * Sugerir estrategias compatibles
     */
    sugerirEstrategias(moneyness, delta, theta, iv, valuacion, liquidez) {
        const estrategias = [];

        if (liquidez.clasificacion === 'Sin Liquidez') {
            return ['No operar - Sin liquidez'];
        }

        // Estrategias según IV
        if (iv.clasificacion === 'IV Elevada' || iv.clasificacion === 'IV Muy Alta') {
            if (moneyness.clasificacion.includes('OTM')) {
                estrategias.push('Venta de prima cubierta');
                estrategias.push('Credit Spread');
            } else {
                estrategias.push('Debit Spread para reducir costo');
            }
        } else if (iv.clasificacion === 'IV Baja') {
            estrategias.push('Compra direccional');
            if (moneyness.clasificacion === 'ATM') {
                estrategias.push('Straddle largo');
            }
        }

        // Estrategias según moneyness
        if (moneyness.clasificacion === 'ATM') {
            if (!estrategias.includes('Straddle largo')) {
                estrategias.push('Estrategias direccionales cortoplacistas');
            }
        } else if (moneyness.clasificacion.includes('ITM')) {
            estrategias.push('Reemplazo de acción synthetic');
        } else if (moneyness.clasificacion.includes('OTM Lejano')) {
            estrategias.push('Seguro catastrófico');
        }

        // Ajustar por valuación
        if (valuacion.clasificacion === 'Subvaluada' && liquidez.clasificacion !== 'Liquidez Mínima') {
            estrategias.unshift('Oportunidad de compra');
        } else if (valuacion.clasificacion === 'Sobrevaluada') {
            estrategias.unshift('Posicionamiento como vendedor');
        }

        // Limitar a máximo 2 estrategias más relevantes
        return estrategias.slice(0, 2);
    }

    /**
     * Integrar datos de Market Dispersion
     */
    integrarMarketDispersion(marketDispersionData) {
        this.marketDispersionData = marketDispersionData;
        
        // Actualizar contexto de mercado con datos de dispersión
        if (marketDispersionData?.marketOverview) {
            this.volatilityRegime = marketDispersionData.marketOverview.marketPhase;
            this.contextoMercado.faseMercado = this.volatilityRegime;
            this.contextoMercado.volRatioPromedio = marketDispersionData.marketOverview.averageVolRatio;
        }
        
        // Actualizar sesgo de volatilidad basado en régimen
        this.contextoMercado.sesgoVolatilidad = this.interpretarSesgoVolatilidadRégimen();
    }
    
    /**
     * Interpretar sesgo de volatilidad basado en régimen
     */
    interpretarSesgoVolatilidadRégimen() {
        const fase = this.volatilityRegime;
        
        const interpretaciones = {
            'EXPANSIVE': 'Volatilidad en expansión - favor comprar volatilidad, evitar venta desnuda',
            'COMPRESSIVE': 'Volatilidad en compresión - oportunidad para venta de tiempo theta positivo',
            'NEUTRAL': 'Volatilidad neutral - estrategias estándar aplicables',
            'UNKNOWN': 'Régimen desconocido - precaución adicional recomendada'
        };
        
        return interpretaciones[fase] || this.contextoMercado.sesgoVolatilidad;
    }
    
    /**
     * Ajustar interpretación de volatilidad implícita con datos de Market Dispersion
     */
    interpretarVolatilidadImplicitaAjustada(iv, ticker) {
        let interpretacionBase = this.interpretarVolatilidadImplicita(iv);
        
        // Ajustar basado en régimen del ticker si está disponible
        if (this.marketDispersionData?.tickers?.[ticker]) {
            const tickerData = this.marketDispersionData.tickers[ticker];
            const regime = tickerData.regime;
            const volRatio = tickerData.volRatio;
            
            // Ajustar clasificación basado en régimen
            if (regime === 'EXPANSION_ALTA' && iv < 40) {
                interpretacionBase.clasificacion = 'IV Relativamente Baja';
                interpretacionBase.interpretacion = 'Volatilidad en expansión detectada - IV actual puede estar subvaluada';
                interpretacionBase.estrategia = 'Considerar compra de volatilidad o spreads direccionales';
            } else if (regime === 'COMPRESION_ALTA' && iv > 30) {
                interpretacionBase.clasificacion = 'IV Relativamente Alta';
                interpretacionBase.interpretacion = 'Volatilidad en compresión - IV puede estar sobrevaluada';
                interpretacionBase.estrategia = 'Oportunidad para venta de volatilidad con riesgo controlado';
            }
            
            // Agregar metadata de régimen
            interpretacionBase.regimen = {
                tipo: regime,
                volRatio: volRatio,
                ajuste: volRatio > 1.2 ? 'EXPANSIVO' : volRatio < 0.8 ? 'COMPRESIVO' : 'NEUTRAL'
            };
        }
        
        return interpretacionBase;
    }
    
    /**
     * Generar diagnóstico completo con Market Dispersion
     */
    generarDiagnosticoCompletoConDispersion(opcion, ticker) {
        // Obtener diagnóstico base
        const diagnosticoBase = this.generarDiagnosticoCompleto(opcion);
        
        // Enriquecer con datos de Market Dispersion
        if (this.marketDispersionData?.tickers?.[ticker]) {
            const tickerData = this.marketDispersionData.tickers[ticker];
            
            // Agregar análisis de régimen
            diagnosticoBase.regimenMercado = {
                tipo: tickerData.regime,
                volRatio: tickerData.volRatio,
                sigmaAjustada: tickerData.sigmaAdj,
                interpretacion: tickerData.regimeInterpretation
            };
            
            // Ajustar recomendaciones basado en régimen
            diagnosticoBase.estrategiasSugeridas = this.ajustarEstrategiasPorRégimen(
                diagnosticoBase.estrategiasSugeridas, 
                tickerData.regime
            );
            
            // Agregar probabilidades de estrategia si están disponibles
            if (tickerData.strategies) {
                diagnosticoBase.probabilidadesEstrategia = tickerData.strategies;
            }
        }
        
        return diagnosticoBase;
    }
    
    /**
     * Ajustar estrategias sugeridas basado en régimen
     */
    ajustarEstrategiasPorRégimen(estrategiasBase, regimen) {
        let estrategiasAjustadas = [...estrategiasBase];
        
        switch(regimen) {
            case 'EXPANSION_ALTA':
                // En expansión alta, evitar venta de opciones desnudas
                estrategiasAjustadas = estrategiasAjustadas.filter(e => 
                    !e.includes('venta') && !e.includes('Credit')
                );
                estrategiasAjustadas.unshift('⚠️ Evitar venta de volatilidad');
                estrategiasAjustadas.push('Considerar compra de straddle');
                break;
                
            case 'COMPRESION_ALTA':
                // En compresión alta, favorecer venta de tiempo
                estrategiasAjustadas = estrategiasAjustadas.filter(e => 
                    !e.includes('compra') && !e.includes('largo')
                );
                estrategiasAjustadas.unshift('✅ Oportunidad venta de tiempo');
                estrategiasAjustadas.push('Short straddle ATM recomendado');
                break;
                
            case 'EXPANSION_MODERADA':
                estrategiasAjustadas.push('Spreads para controlar riesgo');
                break;
                
            case 'COMPRESION_MODERADA':
                estrategiasAjustadas.push('Venta de prima cubierta');
                break;
        }
        
        return estrategiasAjustadas.slice(0, 4); // Limitar a 4 estrategias
    }

    /**
     * Formatear diagnóstico mejorado con Market Dispersion
     */
    formatearDiagnosticoMejorado(diagnostico) {
        let formatoBase = this.formatearDiagnostico(diagnostico);
        
        // Agregar sección de Market Dispersion si está disponible
        if (diagnostico.regimenMercado) {
            const seccionDispersion = `

📊 **MARKET DISPERSION ANALYSIS**:
• Régimen: ${diagnostico.regimenMercado.tipo.replace('_', ' ')}
• Volatility Ratio: ${diagnostico.regimenMercado.volRatio?.toFixed(3)}
• σ Ajustada: ${((diagnostico.regimenMercado.sigmaAjustada || 0) * 100).toFixed(1)}%
• Interpretación: ${diagnostico.regimenMercado.interpretacion}
            `;
            
            // Insertar después del diagnóstico general
            formatoBase = formatoBase.replace(
                '🔍 **DIAGNÓSTICO GENERAL**:',
                seccionDispersion + '\n\n🔍 **DIAGNÓSTICO GENERAL**:'
            );
        }
        
        // Agregar probabilidades de estrategia si están disponibles
        if (diagnostico.probabilidadesEstrategia) {
            let probabilidadesStr = '\n🎯 **PROBABILIDADES DE ESTRATEGIA**:\n';
            
            const strategyNames = {
                long_call: 'Long Call',
                long_put: 'Long Put',
                short_straddle: 'Short Straddle',
                long_strangle: 'Long Strangle',
                bull_call_spread: 'Bull Call Spread',
                bear_put_spread: 'Bear Put Spread'
            };
            
            Object.entries(diagnostico.probabilidadesEstrategia).forEach(([key, strategy]) => {
                const probPercent = (strategy.p_profit * 100).toFixed(1);
                const recommendation = strategy.p_profit > 0.6 ? '✅' : 
                                     strategy.p_profit > 0.4 ? '⚠️' : '❌';
                probabilidadesStr += `• ${strategyNames[key]}: ${probPercent}% ${recommendation}\n`;
            });
            
            formatoBase += probabilidadesStr;
        }
        
        return formatoBase;
    }

    /**
     * Formatear diagnóstico para visualización
     */
    formatearDiagnostico(diagnostico) {
        return `
📊 **DIAGNÓSTICO CUANTITATIVO COMPLETO**

**${diagnostico.ticker}** | ${diagnostico.tipo} | Strike: $${diagnostico.strike} | Vence: ${diagnostico.vencimiento}

💰 **MONEYNESS**: ${diagnostico.moneyness.clasificacion} (${(diagnostico.moneyness.valor * 100).toFixed(1)}%)
${diagnostico.moneyness.interpretacion}

📈 **GRIEGAS CLAVE**:
• Delta: ${diagnostico.griegasClave.delta.valor.toFixed(3)} (${diagnostico.griegasClave.delta.clasificacion})
${diagnostico.griegasClave.delta.interpretacion}
• Theta: ${diagnostico.griegasClave.theta.valor.toFixed(3)} (${diagnostico.griegasClave.theta.clasificacion})
${diagnostico.griegasClave.theta.interpretacion}
• Gamma: ${diagnostico.griegasClave.gamma.valor.toFixed(4)} (${diagnostico.griegasClave.gamma.clasificacion})
${diagnostico.griegasClave.gamma.interpretacion}
• Vega: ${diagnostico.griegasClave.vega.valor.toFixed(1)} (${diagnostico.griegasClave.vega.clasificacion})
${diagnostico.griegasClave.vega.interpretacion}

📊 **VOLATILIDAD IMPLÍCITA**: ${diagnostico.volatilidadImplicita.iv.toFixed(1)}% (${diagnostico.volatilidadImplicita.clasificacion})
${diagnostico.volatilidadImplicita.interpretacion}

💎 **VALUACIÓN**: ${diagnostico.valuacion.clasificacion} (Ratio: ${diagnostico.valuacion.ratio.toFixed(2)})
${diagnostico.valuacion.interpretacion}

🎯 **PROBABILIDAD ITM**: ${diagnostico.probabilidadITM.valor.toFixed(1)}% (${diagnostico.probabilidadITM.clasificacion})
${diagnostico.probabilidadITM.interpretacion}

💧 **LIQUIDEZ**: ${diagnostico.liquidez.clasificacion} | Spread: ${diagnostico.spread.valor.toFixed(1)}%
${diagnostico.liquidez.interpretacion} | ${diagnostico.spread.interpretacion}

🔍 **DIAGNÓSTICO GENERAL**:
${diagnostico.diagnosticoGeneral}

🎯 **ESTRATEGIAS SUGERIDAS**:
${diagnostico.estrategiasSugeridas.map(e => `• ${e}`).join('\n')}

📈 **CONTEXTO DE MERCADO**:
• Subyacente: ${diagnostico.contextoMercado.subyacente} | Spot: $${diagnostico.contextoMercado.spotActual}
• MA200: $${diagnostico.contextoMercado.ma200} | RSI(14): ${diagnostico.contextoMercado.rsi14}
• Tendencia: ${diagnostico.contextoMercado.tendencia}
• Sesgo Volatilidad: ${diagnostico.contextoMercado.sesgoVolatilidad}
        `.trim();
    }
}

// Exportar para uso en la aplicación
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AnalistaCuantitativoOpciones;
} else if (typeof window !== 'undefined') {
    window.AnalistaCuantitativoOpciones = AnalistaCuantitativoOpciones;
}
