/**
 * Componente UI para Market Dispersion Analysis
 * Integración con la interfaz existente de opciones
 */

import { marketDispersionAnalyzer } from '../services/market-dispersion.js';

export class MarketDispersionUI {
    constructor() {
        this.currentAnalysis = null;
        this.selectedPanel = 'panel_general';
        this.selectedTicker = null;
        this.isLoading = false;
        
        this.initializeUI();
    }

    initializeUI() {
        this.createMarketDispersionPanel();
        this.bindEvents();
        this.loadHistoricalData();
    }

    createMarketDispersionPanel() {
        // Crear panel principal
        const panelHTML = `
            <div id="market-dispersion-panel" class="card mb-4" style="display: none;">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h5 class="mb-0">
                        <i class="fas fa-chart-line me-2"></i>
                        Market Dispersion Analysis
                    </h5>
                    <div class="btn-group" role="group">
                        <button type="button" class="btn btn-sm btn-outline-primary" id="refresh-analysis">
                            <i class="fas fa-sync-alt"></i> Actualizar
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-info" id="export-analysis">
                            <i class="fas fa-download"></i> Exportar
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <!-- Controles principales -->
                    <div class="row mb-4">
                        <div class="col-md-4">
                            <label for="panel-selector" class="form-label">Panel de Análisis</label>
                            <select class="form-select" id="panel-selector">
                                <option value="panel_general">Panel General</option>
                                <option value="merval">S&P Merval</option>
                                <option value="adrs">ADRs</option>
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label for="ticker-selector" class="form-label">Ticker Individual</label>
                            <select class="form-select" id="ticker-selector">
                                <option value="">Seleccionar ticker...</option>
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label for="time-horizon" class="form-label">Horizonte Temporal</label>
                            <select class="form-select" id="time-horizon">
                                <option value="30">30 días</option>
                                <option value="60">60 días</option>
                                <option value="90">90 días</option>
                                <option value="252">1 año</option>
                            </select>
                        </div>
                    </div>

                    <!-- Resumen del Mercado -->
                    <div class="row mb-4">
                        <div class="col-12">
                            <div class="card bg-dark border-secondary">
                                <div class="card-header">
                                    <h6 class="mb-0">Resumen del Mercado</h6>
                                </div>
                                <div class="card-body">
                                    <div class="row" id="market-overview">
                                        <!-- Se llenará dinámicamente -->
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Tabs para diferentes vistas -->
                    <ul class="nav nav-tabs mb-4" id="analysis-tabs" role="tablist">
                        <li class="nav-item" role="presentation">
                            <button class="nav-link active" id="regime-tab" data-bs-toggle="tab" data-bs-target="#regime-view" type="button">
                                Régimen de Mercado
                            </button>
                        </li>
                        <li class="nav-item" role="presentation">
                            <button class="nav-link" id="volatility-tab" data-bs-toggle="tab" data-bs-target="#volatility-view" type="button">
                                Análisis de Volatilidad
                            </button>
                        </li>
                        <li class="nav-item" role="presentation">
                            <button class="nav-link" id="strategies-tab" data-bs-toggle="tab" data-bs-target="#strategies-view" type="button">
                                Probabilidades de Estrategia
                            </button>
                        </li>
                        <li class="nav-item" role="presentation">
                            <button class="nav-link" id="cone-tab" data-bs-toggle="tab" data-bs-target="#cone-view" type="button">
                                Volatility Cone
                            </button>
                        </li>
                    </ul>

                    <!-- Contenido de los tabs -->
                    <div class="tab-content" id="analysis-tab-content">
                        <!-- Régimen de Mercado -->
                        <div class="tab-pane fade show active" id="regime-view" role="tabpanel">
                            <div class="row">
                                <div class="col-md-6">
                                    <div id="regime-distribution-chart"></div>
                                </div>
                                <div class="col-md-6">
                                    <div id="regime-table-container"></div>
                                </div>
                            </div>
                        </div>

                        <!-- Análisis de Volatilidad -->
                        <div class="tab-pane fade" id="volatility-view" role="tabpanel">
                            <div class="row">
                                <div class="col-md-8">
                                    <div id="volatility-ratio-chart"></div>
                                </div>
                                <div class="col-md-4">
                                    <div id="volatility-stats"></div>
                                </div>
                            </div>
                        </div>

                        <!-- Probabilidades de Estrategia -->
                        <div class="tab-pane fade" id="strategies-view" role="tabpanel">
                            <div class="row">
                                <div class="col-12">
                                    <div id="strategies-table-container"></div>
                                </div>
                            </div>
                        </div>

                        <!-- Volatility Cone -->
                        <div class="tab-pane fade" id="cone-view" role="tabpanel">
                            <div class="row">
                                <div class="col-md-8">
                                    <div id="volatility-cone-chart"></div>
                                </div>
                                <div class="col-md-4">
                                    <div id="cone-stats"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Insertar el panel en el DOM
        const container = document.querySelector('.container');
        if (container) {
            container.insertAdjacentHTML('afterbegin', panelHTML);
        }
    }

    bindEvents() {
        // Event listeners
        document.getElementById('refresh-analysis')?.addEventListener('click', () => {
            this.refreshAnalysis();
        });

        document.getElementById('export-analysis')?.addEventListener('click', () => {
            this.exportAnalysis();
        });

        document.getElementById('panel-selector')?.addEventListener('change', (e) => {
            this.selectedPanel = e.target.value;
            this.updateTickerSelector();
            this.updateAnalysis();
        });

        document.getElementById('ticker-selector')?.addEventListener('change', (e) => {
            this.selectedTicker = e.target.value;
            this.updateAnalysis();
        });

        document.getElementById('time-horizon')?.addEventListener('change', () => {
            this.updateAnalysis();
        });
    }

    async loadHistoricalData() {
        // Simular carga de datos históricos
        // En producción, esto vendría de tu API
        const mockHistoricalData = this.generateMockHistoricalData();
        
        // Realizar análisis
        this.performAnalysis(mockHistoricalData);
    }

    generateMockHistoricalData() {
        const tickers = [
            'GGAL', 'PAMP', 'YPF', 'TXAR', 'BMA', 'CEPU', 'CRESY', 'EDN', 
            'TGS', 'TS', 'VALO', 'MIRG', 'AUSO', 'LOMA', 'BBAR', 'CGO2'
        ];
        
        const priceData = {};
        const days = 252; // 1 año de datos
        
        tickers.forEach(ticker => {
            const prices = [];
            let basePrice = 100 + Math.random() * 900; // Precio base entre 100-1000
            
            for (let i = 0; i < days; i++) {
                // Simular movimiento browniano geométrico
                const drift = 0.0005; // Deriva diaria positiva
                const volatility = 0.02; // Volatilidad diaria
                const randomShock = (Math.random() - 0.5) * 2 * volatility;
                
                basePrice = basePrice * Math.exp(drift + randomShock);
                prices.push(basePrice);
            }
            
            priceData[ticker] = prices;
        });
        
        return priceData;
    }

    async performAnalysis(priceData) {
        this.setLoading(true);
        
        try {
            // Realizar análisis completo
            const analysis = await marketDispersionAnalyzer.analyzeMarket(priceData);
            this.currentAnalysis = marketDispersionAnalyzer.formatAnalysisForDisplay(analysis);
            
            // Actualizar UI
            this.updateMarketOverview();
            this.updateTickerSelector();
            this.updateRegimeAnalysis();
            this.updateVolatilityAnalysis();
            this.updateStrategiesAnalysis();
            this.updateVolatilityCone();
            
            // Mostrar panel
            document.getElementById('market-dispersion-panel').style.display = 'block';
            
        } catch (error) {
            console.error('Error en análisis de market dispersion:', error);
            this.showError('Error al realizar el análisis de mercado');
        } finally {
            this.setLoading(false);
        }
    }

    updateMarketOverview() {
        if (!this.currentAnalysis?.marketOverview) return;
        
        const overview = this.currentAnalysis.marketOverview;
        const marketPhase = this.currentAnalysis.display.marketPhase;
        
        const overviewHTML = `
            <div class="col-md-3">
                <div class="text-center">
                    <h6 class="text-secondary">Fase de Mercado</h6>
                    <div style="color: ${marketPhase.color}; font-size: 1.5rem; font-weight: bold;">
                        ${marketPhase.icon} ${marketPhase.label}
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="text-center">
                    <h6 class="text-secondary">Tickers Analizados</h6>
                    <div class="h4">${overview.totalTickers}</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="text-center">
                    <h6 class="text-secondary">Vol Ratio Promedio</h6>
                    <div class="h4">${overview.averageVolRatio?.toFixed(3) || 'N/A'}</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="text-center">
                    <h6 class="text-secondary">Vol Ajustada Promedio</h6>
                    <div class="h4">${(overview.averageAdjustedVolatility * 100)?.toFixed(1) || 'N/A'}%</div>
                </div>
            </div>
        `;
        
        document.getElementById('market-overview').innerHTML = overviewHTML;
    }

    updateTickerSelector() {
        const selector = document.getElementById('ticker-selector');
        if (!selector || !this.currentAnalysis) return;
        
        const tickers = Object.keys(this.currentAnalysis.tickers).filter(t => 
            !this.currentAnalysis.tickers[t].error
        );
        
        let optionsHTML = '<option value="">Todos los tickers</option>';
        tickers.forEach(ticker => {
            const analysis = this.currentAnalysis.tickers[ticker];
            optionsHTML += `<option value="${ticker}">${ticker} - ${analysis.regime.replace('_', ' ')}</option>`;
        });
        
        selector.innerHTML = optionsHTML;
    }

    updateRegimeAnalysis() {
        if (!this.currentAnalysis) return;
        
        // Distribución de regímenes
        const regimeData = this.prepareRegimeChartData();
        this.createRegimeChart(regimeData);
        
        // Tabla de regímenes por ticker
        this.createRegimeTable();
    }

    prepareRegimeChartData() {
        const tickers = Object.values(this.currentAnalysis.tickers).filter(t => !t.error);
        const regimeCounts = {};
        
        tickers.forEach(ticker => {
            const regime = ticker.regime || 'UNKNOWN';
            regimeCounts[regime] = (regimeCounts[regime] || 0) + 1;
        });
        
        return {
            labels: Object.keys(regimeCounts).map(r => r.replace('_', ' ')),
            values: Object.values(regimeCounts),
            colors: Object.keys(regimeCounts).map(r => 
                this.currentAnalysis.display.regimeColors[r] || '#666'
            )
        };
    }

    createRegimeChart(data) {
        const chartData = [{
            values: data.values,
            labels: data.labels,
            type: 'pie',
            marker: {
                colors: data.colors
            },
            textinfo: 'label+percent',
            textposition: 'outside'
        }];
        
        const layout = {
            title: 'Distribución de Regímenes de Mercado',
            font: { color: '#fff' },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            showlegend: true,
            height: 400
        };
        
        Plotly.newPlot('regime-distribution-chart', chartData, layout);
    }

    createRegimeTable() {
        const tickers = Object.entries(this.currentAnalysis.tickers)
            .filter(([_, analysis]) => !analysis.error)
            .sort((a, b) => (b[1].volRatio || 0) - (a[1].volRatio || 0));
        
        let tableHTML = `
            <div class="table-responsive">
                <table class="table table-dark table-sm">
                    <thead>
                        <tr>
                            <th>Ticker</th>
                            <th>Régimen</th>
                            <th>Vol Ratio</th>
                            <th>σ Ajustada</th>
                            <th>Precio</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        tickers.forEach(([ticker, analysis]) => {
            const regimeColor = this.currentAnalysis.display.regimeColors[analysis.regime] || '#666';
            tableHTML += `
                <tr>
                    <td><strong>${ticker}</strong></td>
                    <td>
                        <span style="color: ${regimeColor}; font-weight: bold;">
                            ${analysis.regime.replace('_', ' ')}
                        </span>
                    </td>
                    <td>${(analysis.volRatio || 0).toFixed(3)}</td>
                    <td>${((analysis.sigmaAdj || 0) * 100).toFixed(1)}%</td>
                    <td>$${(analysis.currentPrice || 0).toFixed(2)}</td>
                </tr>
            `;
        });
        
        tableHTML += '</tbody></table></div>';
        document.getElementById('regime-table-container').innerHTML = tableHTML;
    }

    updateVolatilityAnalysis() {
        if (!this.currentAnalysis) return;
        
        // Gráfico de volatility ratio
        this.createVolatilityChart();
        
        // Estadísticas de volatilidad
        this.createVolatilityStats();
    }

    createVolatilityChart() {
        const panel = this.currentAnalysis.panels[this.selectedPanel];
        if (!panel?.volatilityRatio?.volRatio) return;
        
        const data = [{
            x: panel.volatilityRatio.volRatio.map((_, i) => i),
            y: panel.volatilityRatio.volRatio,
            type: 'scatter',
            mode: 'lines',
            name: 'Volatility Ratio',
            line: { color: '#00ff88' }
        }, {
            x: [0, panel.volatilityRatio.volRatio.length],
            y: [1, 1],
            type: 'scatter',
            mode: 'lines',
            name: 'Neutral',
            line: { color: '#666', dash: 'dash' }
        }];
        
        const layout = {
            title: `Volatility Ratio - ${this.selectedPanel.replace('_', ' ')}`,
            xaxis: { title: 'Días', gridcolor: '#333' },
            yaxis: { title: 'Ratio', gridcolor: '#333' },
            font: { color: '#fff' },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            height: 400
        };
        
        Plotly.newPlot('volatility-ratio-chart', data, layout);
    }

    createVolatilityStats() {
        const panel = this.currentAnalysis.panels[this.selectedPanel];
        if (!panel) return;
        
        const currentVolRatio = panel.volatilityRatio?.current;
        const currentRetRatio = panel.returnRatio?.current;
        
        const statsHTML = `
            <div class="card bg-dark border-secondary">
                <div class="card-body">
                    <h6>Estadísticas del Panel</h6>
                    <div class="mb-2">
                        <small class="text-secondary">Volatility Ratio Actual:</small>
                        <div class="h5">${currentVolRatio?.toFixed(3) || 'N/A'}</div>
                    </div>
                    <div class="mb-2">
                        <small class="text-secondary">Return Ratio Actual:</small>
                        <div class="h5">${currentRetRatio?.toFixed(3) || 'N/A'}</div>
                    </div>
                    <div>
                        <small class="text-secondary">Tickers en Panel:</small>
                        <div class="h6">${panel.tickers?.length || 0}</div>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('volatility-stats').innerHTML = statsHTML;
    }

    updateStrategiesAnalysis() {
        if (!this.currentAnalysis || !this.selectedTicker) return;
        
        const tickerAnalysis = this.currentAnalysis.tickers[this.selectedTicker];
        if (!tickerAnalysis?.strategies) {
            document.getElementById('strategies-table-container').innerHTML = 
                '<p class="text-muted">Seleccione un ticker para ver probabilidades de estrategia</p>';
            return;
        }
        
        this.createStrategiesTable(tickerAnalysis);
    }

    createStrategiesTable(tickerAnalysis) {
        const strategies = tickerAnalysis.strategies;
        
        let tableHTML = `
            <div class="table-responsive">
                <table class="table table-dark table-sm">
                    <thead>
                        <tr>
                            <th>Estrategia</th>
                            <th>Prob. Profit</th>
                            <th>Breakeven</th>
                            <th>Recomendación</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        const strategyNames = {
            long_call: 'Long Call',
            long_put: 'Long Put',
            short_straddle: 'Short Straddle',
            long_strangle: 'Long Strangle',
            bull_call_spread: 'Bull Call Spread',
            bear_put_spread: 'Bear Put Spread'
        };
        
        Object.entries(strategies).forEach(([key, strategy]) => {
            const probPercent = (strategy.p_profit * 100).toFixed(1);
            const probColor = strategy.p_profit > 0.6 ? '#00ff88' : 
                            strategy.p_profit > 0.4 ? '#ffaa00' : '#ff4444';
            
            const recommendation = this.getStrategyRecommendation(key, strategy.p_profit, tickerAnalysis.regime);
            
            tableHTML += `
                <tr>
                    <td><strong>${strategyNames[key]}</strong></td>
                    <td>
                        <span style="color: ${probColor}; font-weight: bold;">
                            ${probPercent}%
                        </span>
                    </td>
                    <td>$${typeof strategy.breakeven === 'object' ? 
                        `${strategy.breakeven.lower?.toFixed(2)} - ${strategy.breakeven.upper?.toFixed(2)}` : 
                        strategy.breakeven?.toFixed(2) || 'N/A'}
                    </td>
                    <td>${recommendation}</td>
                </tr>
            `;
        });
        
        tableHTML += '</tbody></table></div>';
        document.getElementById('strategies-table-container').innerHTML = tableHTML;
    }

    getStrategyRecommendation(strategy, probability, regime) {
        if (probability > 0.7) {
            return '<span class="badge bg-success">Excelente oportunidad</span>';
        } else if (probability > 0.5) {
            return '<span class="badge bg-warning">Considerar</span>';
        } else {
            return '<span class="badge bg-danger">Evitar</span>';
        }
    }

    updateVolatilityCone() {
        if (!this.currentAnalysis || !this.selectedTicker) return;
        
        const tickerAnalysis = this.currentAnalysis.tickers[this.selectedTicker];
        if (!tickerAnalysis?.volCone) {
            document.getElementById('volatility-cone-chart').innerHTML = 
                '<p class="text-muted">Seleccione un ticker para ver volatility cone</p>';
            return;
        }
        
        this.createVolatilityConeChart(tickerAnalysis);
        this.createConeStats(tickerAnalysis);
    }

    createVolatilityConeChart(tickerAnalysis) {
        const cone = tickerAnalysis.volCone;
        const horizons = Object.keys(cone).sort((a, b) => parseInt(a) - parseInt(b));
        
        const traces = [
            {
                x: horizons,
                y: horizons.map(h => cone[h].p10),
                type: 'scatter',
                mode: 'lines',
                name: 'P10',
                line: { color: '#ff4444' }
            },
            {
                x: horizons,
                y: horizons.map(h => cone[h].p25),
                type: 'scatter',
                mode: 'lines',
                name: 'P25',
                line: { color: '#ff8844' }
            },
            {
                x: horizons,
                y: horizons.map(h => cone[h].p50),
                type: 'scatter',
                mode: 'lines',
                name: 'P50',
                line: { color: '#ffaa00' }
            },
            {
                x: horizons,
                y: horizons.map(h => cone[h].p75),
                type: 'scatter',
                mode: 'lines',
                name: 'P75',
                line: { color: '#88ff44' }
            },
            {
                x: horizons,
                y: horizons.map(h => cone[h].p90),
                type: 'scatter',
                mode: 'lines',
                name: 'P90',
                line: { color: '#44ff44' }
            },
            {
                x: horizons,
                y: horizons.map(h => cone[h].current),
                type: 'scatter',
                mode: 'markers',
                name: 'Actual',
                marker: { color: '#00ffff', size: 10 }
            }
        ];
        
        const layout = {
            title: `Volatility Cone - ${this.selectedTicker}`,
            xaxis: { title: 'Días', gridcolor: '#333' },
            yaxis: { title: 'Volatilidad Anualizada (%)', gridcolor: '#333' },
            font: { color: '#fff' },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            height: 400
        };
        
        Plotly.newPlot('volatility-cone-chart', traces, layout);
    }

    createConeStats(tickerAnalysis) {
        const cone = tickerAnalysis.volCone;
        const current30d = cone['30']?.current;
        const p50_30d = cone['30']?.p50;
        
        const statsHTML = `
            <div class="card bg-dark border-secondary">
                <div class="card-body">
                    <h6>Volatility Cone Stats</h6>
                    <div class="mb-2">
                        <small class="text-secondary">Vol Actual (30d):</small>
                        <div class="h5">${current30d?.toFixed(1) || 'N/A'}%</div>
                    </div>
                    <div class="mb-2">
                        <small class="text-secondary">Mediana Histórica (30d):</small>
                        <div class="h5">${p50_30d?.toFixed(1) || 'N/A'}%</div>
                    </div>
                    <div>
                        <small class="text-secondary">Percentil Actual:</small>
                        <div class="h6">${this.calculatePercentile(cone['30'], current30d)}</div>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('cone-stats').innerHTML = statsHTML;
    }

    calculatePercentile(coneData, current) {
        if (!coneData || !current) return 'N/A';
        
        const values = [coneData.p10, coneData.p25, coneData.p50, coneData.p75, coneData.p90]
            .filter(v => v !== null);
        
        if (values.length === 0) return 'N/A';
        
        let percentile = 0;
        if (current <= coneData.p10) percentile = 10;
        else if (current <= coneData.p25) percentile = 25;
        else if (current <= coneData.p50) percentile = 50;
        else if (current <= coneData.p75) percentile = 75;
        else if (current <= coneData.p90) percentile = 90;
        else percentile = 95;
        
        return `P${percentile}`;
    }

    updateAnalysis() {
        if (!this.currentAnalysis) return;
        
        // Actualizar vistas basadas en la selección actual
        this.updateRegimeAnalysis();
        this.updateVolatilityAnalysis();
        this.updateStrategiesAnalysis();
        this.updateVolatilityCone();
    }

    refreshAnalysis() {
        this.loadHistoricalData();
    }

    exportAnalysis() {
        if (!this.currentAnalysis) {
            alert('No hay análisis para exportar');
            return;
        }
        
        const dataStr = JSON.stringify(this.currentAnalysis, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const exportFileDefaultName = `market-dispersion-analysis-${new Date().toISOString().split('T')[0]}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
    }

    setLoading(loading) {
        this.isLoading = loading;
        const refreshBtn = document.getElementById('refresh-analysis');
        if (refreshBtn) {
            if (loading) {
                refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analizando...';
                refreshBtn.disabled = true;
            } else {
                refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Actualizar';
                refreshBtn.disabled = false;
            }
        }
    }

    showError(message) {
        // Implementar notificación de error
        console.error(message);
        alert(message); // Simple fallback
    }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
    window.MarketDispersionUI = MarketDispersionUI;
}
