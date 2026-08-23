# -*- coding: utf-8 -*-
"""
Portfolio Optimizer API — Flask backend
Sirve datos de yfinance para el dashboard HTML.
Ejecutar: python server.py
"""

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import yfinance as yf
import numpy as np
import pandas as pd
import scipy.optimize as op
import requests
import warnings
import os
from datetime import datetime, timedelta
warnings.filterwarnings("ignore")

app = Flask(__name__, static_folder=".")
CORS(app)

FACTOR = 252
DECIMALS = 4

# ─── Utilidades de datos ──────────────────────────────────────────────────────

def download_prices(tickers, start="2022-01-01", end=None):
    if not tickers:
        return pd.DataFrame()
    raw = yf.download(tickers, start=start, end=end, auto_adjust=True, progress=False)
    if raw.empty:
        return pd.DataFrame()
    if isinstance(raw.columns, pd.MultiIndex):
        prices = raw["Close"].copy()
    else:
        prices = raw[["Close"]].copy()
        prices.columns = tickers if len(tickers) > 1 else tickers
    if isinstance(prices, pd.Series):
        prices = prices.to_frame(name=tickers[0])
    valid = [c for c in prices.columns if prices[c].count() >= 30]
    return prices[valid].ffill().dropna(how="all")

def compute_returns(prices):
    return np.log(prices / prices.shift(1)).dropna()

def _portfolio_variance(weights, mtx_cov):
    return float(weights @ mtx_cov @ weights)

# ─── Indicadores técnicos ─────────────────────────────────────────────────────

def compute_rsi(series, period=14):
    delta = series.diff()
    gain = delta.where(delta > 0, 0.0).rolling(period).mean()
    loss = -delta.where(delta < 0, 0.0).rolling(period).mean()
    rs = gain / (loss + 1e-10)
    rsi = 100 - 100 / (1 + rs)
    val = rsi.dropna()
    return float(val.iloc[-1]) if len(val) > 0 else 50.0

def compute_macd(series):
    ema12 = series.ewm(span=12, adjust=False).mean()
    ema26 = series.ewm(span=26, adjust=False).mean()
    macd = ema12 - ema26
    signal = macd.ewm(span=9, adjust=False).mean()
    return float(macd.iloc[-1]), float(signal.iloc[-1])

# ─── Semáforo ─────────────────────────────────────────────────────────────────

def get_semaforo_data(ticker):
    try:
        t = yf.Ticker(ticker)
        hist = t.history(period="2y")
        info = t.info or {}

        if hist.empty or len(hist) < 30:
            return {"ticker": ticker, "semaforo": "gray", "score": 0,
                    "tech_score": 0, "fund_score": 0, "signals": {},
                    "error": "Datos insuficientes"}

        close = hist["Close"]
        current = float(close.iloc[-1])

        sma50  = float(close.rolling(50).mean().iloc[-1])  if len(close) >= 50  else float(close.mean())
        sma200 = float(close.rolling(200).mean().iloc[-1]) if len(close) >= 200 else float(close.rolling(min(len(close), 200)).mean().iloc[-1])
        rsi    = compute_rsi(close)
        macd_v, macd_s = compute_macd(close)

        # — Técnico —
        tech_score = 0
        signals = {}

        if current > sma50:
            tech_score += 1; signals["Precio > SMA50"] = "green"
        else:
            tech_score -= 1; signals["Precio < SMA50"] = "red"

        if sma50 > sma200:
            tech_score += 1; signals["Cruce Dorado (SMA50>200)"] = "green"
        else:
            tech_score -= 1; signals["Cruce de la Muerte (SMA50<200)"] = "red"

        if rsi < 30:
            tech_score += 2; signals[f"RSI {rsi:.0f} — Sobreventa"] = "green"
        elif rsi > 70:
            tech_score -= 2; signals[f"RSI {rsi:.0f} — Sobrecompra"] = "red"
        else:
            signals[f"RSI {rsi:.0f} — Neutral"] = "yellow"

        if macd_v > macd_s:
            tech_score += 1; signals["MACD alcista"] = "green"
        else:
            tech_score -= 1; signals["MACD bajista"] = "red"

        # — Fundamental —
        fund_score = 0
        pe     = info.get("trailingPE")
        rev_g  = info.get("revenueGrowth")
        margin = info.get("profitMargins")
        roe    = info.get("returnOnEquity")
        de     = info.get("debtToEquity")

        def valid_float(v):
            return isinstance(v, (int, float)) and not (v != v)  # not NaN

        if valid_float(pe) and pe > 0:
            if pe < 15:
                fund_score += 2; signals[f"P/E {pe:.1f} — Valor atractivo"] = "green"
            elif pe < 30:
                fund_score += 1; signals[f"P/E {pe:.1f} — Razonable"] = "yellow"
            else:
                fund_score -= 1; signals[f"P/E {pe:.1f} — Caro"] = "red"

        if valid_float(rev_g):
            if rev_g > 0.15:
                fund_score += 2; signals[f"Revenue +{rev_g*100:.0f}% — Fuerte"] = "green"
            elif rev_g > 0:
                fund_score += 1; signals[f"Revenue +{rev_g*100:.0f}% — Positivo"] = "yellow"
            else:
                fund_score -= 1; signals[f"Revenue {rev_g*100:.0f}% — Negativo"] = "red"

        if valid_float(margin):
            if margin > 0.20:
                fund_score += 2; signals[f"Margen {margin*100:.0f}% — Excelente"] = "green"
            elif margin > 0.10:
                fund_score += 1; signals[f"Margen {margin*100:.0f}% — Bueno"] = "yellow"
            elif margin > 0:
                signals[f"Margen {margin*100:.0f}% — Bajo"] = "yellow"
            else:
                fund_score -= 1; signals[f"Margen {margin*100:.0f}% — Negativo"] = "red"

        if valid_float(roe):
            if roe > 0.15:
                fund_score += 1; signals[f"ROE {roe*100:.0f}%"] = "green"
            elif roe > 0:
                signals[f"ROE {roe*100:.0f}%"] = "yellow"
            else:
                fund_score -= 1; signals[f"ROE {roe*100:.0f}% — Negativo"] = "red"

        if valid_float(de):
            if de < 30:
                fund_score += 1; signals[f"D/E {de:.0f}% — Bajo apalancamiento"] = "green"
            elif de < 100:
                signals[f"D/E {de:.0f}% — Moderado"] = "yellow"
            else:
                fund_score -= 1; signals[f"D/E {de:.0f}% — Alto apalancamiento"] = "red"

        total = tech_score + fund_score

        if total >= 4:
            sem, rec = "green", "COMPRAR"
        elif total >= 0:
            sem, rec = "yellow", "MANTENER"
        else:
            sem, rec = "red", "EVITAR"

        # 52-week range
        low52  = float(close.rolling(252).min().iloc[-1]) if len(close) >= 252 else float(close.min())
        high52 = float(close.rolling(252).max().iloc[-1]) if len(close) >= 252 else float(close.max())

        return {
            "ticker": ticker,
            "name": info.get("longName", ticker),
            "sector": info.get("sector", "—"),
            "semaforo": sem,
            "recomendacion": rec,
            "score": total,
            "tech_score": tech_score,
            "fund_score": fund_score,
            "signals": signals,
            "price": round(current, 2),
            "sma50": round(sma50, 2),
            "sma200": round(sma200, 2),
            "low52": round(low52, 2),
            "high52": round(high52, 2),
            "rsi": round(rsi, 1),
            "macd": round(macd_v, 4),
            "macd_signal": round(macd_s, 4),
            "pe": round(pe, 2) if valid_float(pe) and pe > 0 else None,
            "rev_growth": round(rev_g * 100, 1) if valid_float(rev_g) else None,
            "profit_margin": round(margin * 100, 1) if valid_float(margin) else None,
            "roe": round(roe * 100, 1) if valid_float(roe) else None,
            "market_cap": info.get("marketCap"),
            "currency": info.get("currency", "USD"),
        }
    except Exception as e:
        return {"ticker": ticker, "semaforo": "gray", "score": 0,
                "tech_score": 0, "fund_score": 0, "signals": {}, "error": str(e)}

# ─── Optimización ─────────────────────────────────────────────────────────────

def optimize_portfolio(ptype, mean_vec, vol_vec, mtx_cov, tickers):
    n = len(tickers)
    x0 = np.array([1/n] * n)
    non_neg = [(0, None)] * n
    l1_eq = {"type": "eq", "fun": lambda x: np.sum(x) - 1}
    weights = x0.copy()
    try:
        if ptype == "min-variance":
            res = op.minimize(_portfolio_variance, x0, args=(mtx_cov,),
                              constraints=[l1_eq], bounds=non_neg, method="SLSQP")
            weights = res.x
        elif ptype == "markowitz":
            tr = float(np.mean(mean_vec))
            ret_eq = {"type": "eq", "fun": lambda x, r=tr: mean_vec @ x - r}
            res = op.minimize(_portfolio_variance, x0, args=(mtx_cov,),
                              constraints=[l1_eq, ret_eq], bounds=non_neg, method="SLSQP")
            weights = res.x
        elif ptype == "max-sharpe":
            def neg_sharpe(w):
                r = float(mean_vec @ w)
                v = float(np.sqrt(_portfolio_variance(w, mtx_cov)))
                return -r / v if v > 0 else 1e9
            res = op.minimize(neg_sharpe, x0, constraints=[l1_eq], bounds=non_neg, method="SLSQP")
            weights = res.x
        elif ptype == "volatility-weighted":
            inv_vol = 1 / np.where(vol_vec > 0, vol_vec, 1e-8)
            weights = inv_vol / np.sum(inv_vol)
        elif ptype == "equi-weight":
            weights = x0
    except Exception:
        weights = x0

    norm = np.sum(np.abs(weights))
    if norm > 0:
        weights = weights / norm

    ret = float(mean_vec @ weights)
    vol = float(np.sqrt(_portfolio_variance(weights, mtx_cov)))
    sharpe = ret / vol if vol > 0 else 0

    return {
        "estrategia": ptype,
        "retorno": round(ret, DECIMALS),
        "volatilidad": round(vol, DECIMALS),
        "sharpe": round(sharpe, DECIMALS),
        "pesos": {tickers[i]: round(float(weights[i]), 4) for i in range(n)},
    }

# ─── Contexto Macroeconómico (Capa 1) ─────────────────────────────────────────

BCRA_HEADERS = {"Accept": "application/json", "User-Agent": "Mozilla/5.0"}

def _bcra_ultimo_valor(url):
    try:
        r = requests.get(url, headers=BCRA_HEADERS, timeout=10)
        if r.ok:
            data = r.json()
            results = data.get("results", [])
            if results:
                return float(results[-1]["valor"])
    except:
        pass
    return None

def _bcra_serie(url, dias=90):
    try:
        r = requests.get(url, headers=BCRA_HEADERS, timeout=10)
        if r.ok:
            data = r.json()
            results = data.get("results", [])
            if results:
                return [{"fecha": r["fecha"], "valor": float(r["valor"])} for r in results[-dias:]]
    except:
        pass
    return []

def get_macro_context():
    ctx = {"timestamp": datetime.now().isoformat()}

    # ── BCRA / ArgentinaDatos ─────────────────────────────────────────────
    ctx["inflacion_mensual"] = _bcra_ultimo_valor(
        "https://api.bcra.gob.ar/estadisticas/v3.0/monetarias/variacionIPC")
    ctx["tipo_cambio_oficial"] = _bcra_ultimo_valor(
        "https://api.bcra.gob.ar/estadisticas/v3.0/monetarias/tipoCambioReferencia")
    ctx["tasa_pasiva"] = _bcra_ultimo_valor(
        "https://api.bcra.gob.ar/estadisticas/v3.0/monetarias/tasaPasivaBancaria")
    # Riesgo país vía ArgentinaDatos
    try:
        rp = requests.get("https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo",
                          headers=BCRA_HEADERS, timeout=10)
        if rp.ok:
            rp_data = rp.json()
            ctx["riesgo_pais"] = float(rp_data.get("valor", 0))
    except:
        ctx["riesgo_pais"] = None
    # Serie inflación vía BCRA
    ctx["serie_inflacion"] = _bcra_serie(
        "https://api.bcra.gob.ar/estadisticas/v3.0/monetarias/variacionIPC", 12)
    # Serie riesgo país vía ArgentinaDatos
    try:
        rps = requests.get("https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais",
                           headers=BCRA_HEADERS, timeout=10)
        if rps.ok:
            rps_data = rps.json()
            ctx["serie_riesgo_pais"] = [{"fecha": r["fecha"], "valor": float(r["valor"])}
                                        for r in rps_data[-60:]]
    except:
        ctx["serie_riesgo_pais"] = []

    # ── Dólar MEP / CCL (criptoya) ─────────────────────────────────────────
    try:
        r = requests.get("https://criptoya.com/api/dolar", timeout=10)
        if r.ok:
            dol = r.json()
            ctx["dolar_oficial"] = {"compra": dol.get("oficial", {}).get("bid"),
                                    "venta": dol.get("oficial", {}).get("ask")}
            ctx["dolar_blue"] = {"compra": dol.get("blue", {}).get("bid"),
                                 "venta": dol.get("blue", {}).get("ask")}
            ctx["dolar_mep"] = {"compra": dol.get("mep", {}).get("bid"),
                                "venta": dol.get("mep", {}).get("ask")}
            ctx["dolar_ccl"] = {"compra": dol.get("ccl", {}).get("bid"),
                                "venta": dol.get("ccl", {}).get("ask")}
    except:
        pass

    # ── Yahoo Finance (SPY, DXY, TNX) ──────────────────────────────────────
    try:
        macro_tickers = yf.download(["SPY", "DX-Y.NYB", "^TNX"], period="5d",
                                    auto_adjust=True, progress=False)
        if not macro_tickers.empty:
            if isinstance(macro_tickers.columns, pd.MultiIndex):
                close = macro_tickers["Close"]
            else:
                close = macro_tickers
            for col in close.columns:
                vals = close[col].dropna()
                if len(vals) > 0:
                    ctx[f"precio_{col}"] = round(float(vals.iloc[-1]), 2)
                    if len(vals) > 1:
                        var = (vals.iloc[-1] / vals.iloc[-2] - 1) * 100
                        ctx[f"variacion_{col}"] = round(var, 2)
    except:
        pass

    # ── Cálculos ───────────────────────────────────────────────────────────

    # Tasa real mensual (Fisher)
    tem = ctx.get("tasa_pasiva")
    pi  = ctx.get("inflacion_mensual")
    if tem is not None and pi is not None and pi < 100:
        tem_mensual = tem / 100
        pi_mensual  = pi / 100
        ctx["tasa_real_mensual_fisher"] = round(((1 + tem_mensual) / (1 + pi_mensual) - 1) * 100, 4)
    else:
        ctx["tasa_real_mensual_fisher"] = None

    # Tasa real anualizada (Fisher compuesto)
    if tem is not None and pi is not None and pi < 100:
        tea = (1 + tem_mensual) ** 12 - 1
        inflacion_acumulada = (1 + pi_mensual) ** 12 - 1
        ctx["tasa_real_anual_fisher"] = round(((1 + tea) / (1 + inflacion_acumulada) - 1) * 100, 4)
    else:
        ctx["tasa_real_anual_fisher"] = None

    # Spread soberano implícito
    rp = ctx.get("riesgo_pais")
    tnx = ctx.get("precio_^TNX")
    if rp is not None and tnx is not None:
        ctx["spread_soberano"] = round(rp / 100 + tnx, 2)
    else:
        ctx["spread_soberano"] = None

    # Clasificación de régimen macro
    regime_signals = []
    if pi is not None:
        if pi > 5:
            regime_signals.append("Inflación alta (>5% mensual) — riesgo de devaluación latente")
        elif pi > 3:
            regime_signals.append("Inflación elevada")

    if rp is not None:
        if rp > 1000:
            regime_signals.append("Riesgo país >1000bps — descuento adicional en WACC")
            regime_signals.append("Tasa de descuento penalizada")

    dxy_var = ctx.get("variacion_DX-Y.NYB")
    if dxy_var is not None:
        if dxy_var > 0:
            regime_signals.append("DXY alcista — presión sobre emergentes")
        elif dxy_var < -0.5:
            regime_signals.append("DXY bajista — alivio para emergentes")

    # Score macro
    score = 0
    if pi is not None and pi <= 3: score += 1
    elif pi is not None and pi > 5: score -= 2
    if rp is not None and rp < 500: score += 1
    elif rp is not None and rp > 1000: score -= 2
    if dxy_var is not None and dxy_var < -0.5: score += 1
    elif dxy_var is not None and dxy_var > 1: score -= 1

    if score >= 1: clasif = "FAVORABLE"
    elif score <= -1: clasif = "ADVERSO"
    else: clasif = "NEUTRO"

    ctx["regimen_macro"] = clasif
    ctx["score_macro"] = score
    ctx["senal_regimen"] = regime_signals

    # Tasa libre de riesgo local calibrada
    if tnx is not None:
        if rp is not None:
            ctx["tasa_libre_riesgo_local"] = round(tnx + rp / 100, 2)
        else:
            ctx["tasa_libre_riesgo_local"] = round(tnx, 2)
    else:
        ctx["tasa_libre_riesgo_local"] = None

    return ctx


# ─── Análisis Cualitativo (Paso 3) ────────────────────────────────────────────

def _safe_float(v):
    try: return float(v)
    except: return None

def _extraer_financieros_adhoc(ticker):
    """Extrae datos financieros para cualquier ticker vía yfinance."""
    try:
        t = yf.Ticker(ticker)
        info = t.info or {}
        bs = t.balance_sheet
        inc = t.income_stmt
        cf = t.cashflow
        precios = t.history(period="1y")
        return info, bs, inc, cf, precios
    except:
        return {}, None, None, None, None

def qualitative_analysis(ticker):
    """Puntúa 6 dimensiones cualitativas (0-10). Score < 5 → no continuar."""
    info, bs, inc, cf, precios = _extraer_financieros_adhoc(ticker)
    result = {"ticker": ticker, "dimensiones": {}, "score_total": 0, "continuar": False}

    # --- Dimensión 1: Modelo de Negocio (20%) ---
    d1 = 5.0
    sector = (info.get("sector") or "").lower()
    industry = (info.get("industry") or "").lower()
    result["sector"] = sector
    result["industry"] = industry
    # Empresas con ingresos recurrentes → mejor score
    if any(k in industry for k in ["software", "insurance", "healthcare", "utilities"]):
        d1 = 7.0
    elif any(k in sector for k in ["technology", "healthcare", "consumer defensive"]):
        d1 = 6.5
    elif any(k in sector for k in ["financial services"]):
        d1 = 6.0
    # Crecimiento de ingresos (3 años)
    if inc is not None and not inc.empty:
        try:
            rev_col = [c for c in inc.index if "revenue" in c.lower() or "total revenue" in c.lower() or "operating revenue" in c.lower()]
            if rev_col:
                revs = inc.loc[rev_col[0]].dropna().values
                if len(revs) >= 2:
                    growth = (revs[0] / revs[-1] - 1) if revs[-1] != 0 else 0
                    if growth > 0.1: d1 = min(10, d1 + 1.5)
                    elif growth > 0: d1 = min(10, d1 + 0.5)
                    elif growth < -0.1: d1 = max(0, d1 - 1.5)
        except:
            pass

    result["dimensiones"]["modelo_negocio"] = {"score": round(d1, 1), "peso": 0.20}

    # --- Dimensión 2: Management (25%) ---
    d2 = 5.0
    if bs is not None and inc is not None and not bs.empty and not inc.empty:
        try:
            pn_col = [c for c in bs.index if "stockholders equity" in c.lower() or "total equity" in c.lower() or "shareholders equity" in c.lower()]
            ni_col = [c for c in inc.index if "net income" in c.lower() or "net income common" in c.lower()]
            deuda_col = [c for c in bs.index if "total debt" in c.lower() or "long term debt" in c.lower()]
            if pn_col and ni_col:
                pn = bs.loc[pn_col[0]].dropna()
                ni = inc.loc[ni_col[0]].dropna()
                comunes = pn.index.intersection(ni.index)
                if len(comunes) >= 2:
                    roes = [ni[c] / pn[c] if pn[c] != 0 else 0 for c in comunes]
                    if roes[-1] > 0.15: d2 += 2
                    elif roes[-1] > 0.10: d2 += 1
                    elif roes[-1] < 0: d2 -= 2
                    # Tendencia creciente
                    if len(roes) >= 3 and roes[-1] > roes[0]: d2 += 1
                # Deuda controlada
                if deuda_col:
                    deuda = bs.loc[deuda_col[0]].dropna()
                    d_e = deuda.iloc[-1] / pn.iloc[-1] if pn.iloc[-1] != 0 else 999
                    if d_e < 0.5: d2 += 1
                    elif d_e > 2: d2 -= 1.5
        except:
            pass

    result["dimensiones"]["management"] = {"score": round(min(10, max(0, d2)), 1), "peso": 0.25}

    # --- Dimensión 3: Ventaja Competitiva / Moat (30%) ---
    d3 = 5.0
    if inc is not None and not inc.empty:
        try:
            ebitda_col = [c for c in inc.index if "ebitda" in c.lower()]
            rev_col = [c for c in inc.index if "revenue" in c.lower() or "total revenue" in c.lower()]
            if ebitda_col and rev_col:
                ebitda = inc.loc[ebitda_col[0]].dropna()
                rev = inc.loc[rev_col[0]].dropna()
                comunes = ebitda.index.intersection(rev.index)
                if len(comunes) > 0:
                    margin = ebitda[comunes[-1]] / rev[comunes[-1]] if rev[comunes[-1]] != 0 else 0
                    if margin > 0.30: d3 = 8.0
                    elif margin > 0.20: d3 = 7.0
                    elif margin > 0.10: d3 = 6.0
                    elif margin < 0: d3 = 2.0
        except:
            pass

    result["dimensiones"]["ventaja_competitiva"] = {"score": round(min(10, max(0, d3)), 1), "peso": 0.30}

    # --- Dimensión 4: Gobierno Corporativo (15%) ---
    d4 = 5.0
    try:
        divs = t.dividends if hasattr(t, 'dividends') else None
        if divs is not None and not divs.empty and len(divs) >= 4:
            d4 = 6.5
            # Paga dividendos regulares (al menos 1 por año en últimos 3 años)
            years = set(divs.index.year)
            if len(years) >= 3: d4 += 1.5
        # Proxy: institucional ownership alto → mejor gov
        inst_own = info.get("heldPercentInstitutions", 0)
        if inst_own and inst_own > 0.3: d4 += 1
        elif inst_own and inst_own > 0.5: d4 += 1.5
    except:
        pass

    result["dimensiones"]["gobierno_corporativo"] = {"score": round(min(10, max(0, d4)), 1), "peso": 0.15}

    # --- Dimensión 5: Porter 5 Fuerzas (10%) ---
    # Proxy sectorial
    d5 = 5.0
    sector_map = {
        "technology": 4.0, "communication services": 4.5,
        "healthcare": 5.0, "financial services": 5.5,
        "consumer defensive": 4.5, "consumer cyclical": 6.0,
        "energy": 5.5, "basic materials": 6.0,
        "industrials": 5.5, "utilities": 4.0,
        "real estate": 5.0,
    }
    for key, val in sector_map.items():
        if key in sector:
            d5 = val
            break
    result["dimensiones"]["porter"] = {"score": round(d5, 1), "peso": 0.10}

    # --- Dimensión 6: Círculo de Competencia ---
    # Automático: SI para sectores comunes, requiere decisión del usuario
    result["dimensiones"]["circulo_competencia"] = "SI"
    result["circulo_competencia_data"] = {
        "sector": sector,
        "industry": industry,
        "descripcion": info.get("longBusinessSummary", "")[:300],
    }

    # Score total ponderado
    pesos = {"modelo_negocio": 0.20, "management": 0.25, "ventaja_competitiva": 0.30,
             "gobierno_corporativo": 0.15, "porter": 0.10}
    total = sum(result["dimensiones"][k]["score"] * pesos[k]
                for k in pesos if k in result["dimensiones"])
    result["score_total"] = round(total, 2)
    result["continuar"] = total >= 5.0

    return result


# ─── Análisis Cuantitativo (Paso 4) ────────────────────────────────────────────

def quantitative_analysis(ticker):
    """Extrae 15 métricas clave y genera alertas."""
    info, bs, inc, cf, precios = _extraer_financieros_adhoc(ticker)
    result = {"ticker": ticker, "metricas": {}, "alertas": [], "errores": []}
    err = result["errores"]

    # Shares outstanding
    shares = info.get("sharesOutstanding") or info.get("impliedSharesOutstanding") or 0
    price = info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose") or 0
    mkt_cap = info.get("marketCap") or 0

    # --- Estado de Resultados ---
    rev = ni = ebitda = da = op_income = None
    if inc is not None and not inc.empty:
        try:
            rev_col = next((c for c in inc.index if "total revenue" in c.lower()), None) or \
                      next((c for c in inc.index if "revenue" in c.lower()), None)
            ni_col  = next((c for c in inc.index if "net income common" in c.lower()), None) or \
                      next((c for c in inc.index if "net income" in c.lower()), None)
            ebitda_col = next((c for c in inc.index if "ebitda" in c.lower()), None)
            op_col = next((c for c in inc.index if "operating income" in c.lower()), None) or \
                     next((c for c in inc.index if "operating" in c.lower() and "revenue" not in c.lower()), None)
            da_col = next((c for c in inc.index if "depreciation and amortization" in c.lower() or "depreciation & amortization" in c.lower()), None)

            if rev_col:
                rev = inc.loc[rev_col]
                result["metricas"]["M1_ingresos_netos"] = _safe_float(rev.iloc[-1]) if len(rev) > 0 else None
            if ni_col:
                ni = inc.loc[ni_col]
                result["metricas"]["M3_resultado_neto"] = _safe_float(ni.iloc[-1]) if len(ni) > 0 else None
            if op_col:
                op_income = inc.loc[op_col]
            if da_col:
                da = inc.loc[da_col]
            if ebitda_col:
                ebitda = inc.loc[ebitda_col]
                result["metricas"]["M2_ebitda"] = _safe_float(ebitda.iloc[-1]) if len(ebitda) > 0 else None
            elif op_income is not None and da is not None:
                ebitda = op_income + da
                result["metricas"]["M2_ebitda"] = _safe_float(ebitda.iloc[-1]) if hasattr(ebitda, 'iloc') and len(ebitda) > 0 else None

            # M4 EPS
            ni_val = result["metricas"].get("M3_resultado_neto")
            if ni_val is not None and shares > 0:
                result["metricas"]["M4_eps"] = round(ni_val / shares, 4)
            elif price and info.get("trailingEps"):
                result["metricas"]["M4_eps"] = _safe_float(info["trailingEps"])

            # M5 Margen EBITDA, M6 Margen Neto
            rev_val = result["metricas"].get("M1_ingresos_netos")
            if rev_val and rev_val != 0:
                if result["metricas"].get("M2_ebitda") is not None:
                    result["metricas"]["M5_margen_ebitda"] = round(result["metricas"]["M2_ebitda"] / rev_val, 4)
                if ni_val is not None:
                    result["metricas"]["M6_margen_neto"] = round(ni_val / rev_val, 4)
        except Exception as e:
            err.append(f"Error leyendo income_stmt: {e}")

    # --- Balance ---
    activo = pasivo = pn = deuda = caja = current_assets = current_liab = None
    if bs is not None and not bs.empty:
        try:
            at_col = next((c for c in bs.index if "total assets" in c.lower()), None)
            pt_col = next((c for c in bs.index if "total liabilities" in c.lower() or "total liabilities net" in c.lower()), None)
            pn_col = next((c for c in bs.index if "total equity" in c.lower() or "stockholders equity" in c.lower()), None)
            deuda_col = next((c for c in bs.index if "total debt" in c.lower()), None)
            caja_col = next((c for c in bs.index if "cash and cash equivalents" in c.lower()), None)
            ca_col = next((c for c in bs.index if "total current assets" in c.lower()), None)
            cl_col = next((c for c in bs.index if "total current liabilities" in c.lower()), None)

            if at_col:
                activo = bs.loc[at_col]; result["metricas"]["M7_activo_total"] = _safe_float(activo.iloc[-1]) if len(activo) > 0 else None
            if pt_col:
                pasivo = bs.loc[pt_col]; result["metricas"]["M8_pasivo_total"] = _safe_float(pasivo.iloc[-1]) if len(pasivo) > 0 else None
            if pn_col:
                pn = bs.loc[pn_col]; result["metricas"]["M9_patrimonio_neto"] = _safe_float(pn.iloc[-1]) if len(pn) > 0 else None
            else:
                a = result["metricas"].get("M7_activo_total")
                p = result["metricas"].get("M8_pasivo_total")
                if a is not None and p is not None:
                    result["metricas"]["M9_patrimonio_neto"] = round(a - p, 2)

            # M10 Deuda Financiera Neta
            if deuda_col:
                deuda = bs.loc[deuda_col]
            if caja_col:
                caja = bs.loc[caja_col]
            d_val = _safe_float(deuda.iloc[-1]) if deuda is not None and len(deuda) > 0 else 0
            c_val = _safe_float(caja.iloc[-1]) if caja is not None and len(caja) > 0 else 0
            result["metricas"]["M10_deuda_financiera_neta"] = round(d_val - c_val, 2)

            # M11 Capital de Trabajo
            if ca_col:
                current_assets = bs.loc[ca_col]
            if cl_col:
                current_liab = bs.loc[cl_col]
            ca_val = _safe_float(current_assets.iloc[-1]) if current_assets is not None and len(current_assets) > 0 else None
            cl_val = _safe_float(current_liab.iloc[-1]) if current_liab is not None and len(current_liab) > 0 else None
            if ca_val is not None and cl_val is not None:
                result["metricas"]["M11_capital_trabajo"] = round(ca_val - cl_val, 2)

            # M12 ROE, M13 ROA
            ni_val = result["metricas"].get("M3_resultado_neto")
            pn_val = result["metricas"].get("M9_patrimonio_neto")
            at_val = result["metricas"].get("M7_activo_total")
            if ni_val is not None and pn_val is not None and pn_val != 0:
                result["metricas"]["M12_roe"] = round(ni_val / pn_val, 4)
            if ni_val is not None and at_val is not None and at_val != 0:
                result["metricas"]["M13_roa"] = round(ni_val / at_val, 4)

            # M14 Deuda/EBITDA
            dfn = result["metricas"].get("M10_deuda_financiera_neta")
            ebitda_val = result["metricas"].get("M2_ebitda")
            if dfn is not None and ebitda_val is not None and ebitda_val != 0:
                result["metricas"]["M14_deuda_ebitda"] = round(dfn / ebitda_val, 4)

        except Exception as e:
            err.append(f"Error leyendo balance_sheet: {e}")

    # M15 P/E, EV/EBITDA
    eps_val = result["metricas"].get("M4_eps")
    if price and eps_val and eps_val != 0:
        result["metricas"]["M15_pe"] = round(price / eps_val, 2)
    if mkt_cap and result["metricas"].get("M10_deuda_financiera_neta") is not None and result["metricas"].get("M2_ebitda"):
        ev = mkt_cap + result["metricas"]["M10_deuda_financiera_neta"]
        ebitda_val = result["metricas"]["M2_ebitda"]
        if ebitda_val != 0:
            result["metricas"]["ev_ebitda"] = round(ev / ebitda_val, 2)

    # ── Señales de alerta ────────────────────────────────────────────────
    alertas_rojas = []
    alertas_amarillas = []

    # ROJA: Deuda/EBITDA > 4x
    d_e = result["metricas"].get("M14_deuda_ebitda")
    if d_e is not None and d_e > 4:
        alertas_rojas.append(f"Deuda/EBITDA {d_e:.1f}x > 4x — Apalancamiento excesivo")

    # ROJA: Patrimonio Neto negativo
    pn_val = result["metricas"].get("M9_patrimonio_neto")
    if pn_val is not None and pn_val < 0:
        alertas_rojas.append("Patrimonio Neto negativo — Riesgo de default técnico")

    # ROJA: Margen neto < 0
    mn = result["metricas"].get("M6_margen_neto")
    if mn is not None and mn < 0:
        alertas_rojas.append(f"Margen neto {mn*100:.1f}% — Pérdida neta")

    # ROJA: Capital de trabajo negativo
    ct = result["metricas"].get("M11_capital_trabajo")
    if ct is not None and ct < 0:
        alertas_rojas.append("Capital de trabajo negativo — Problemas de liquidez")

    # AMARILLA: Caída de ingresos > 10%
    if inc is not None and rev is not None and len(rev) >= 2:
        try:
            caida = (rev.iloc[-1] / rev.iloc[-2] - 1)
            if caida < -0.10:
                alertas_amarillas.append(f"Caída de ingresos {caida*100:.0f}% interanual")
        except:
            pass

    result["alertas"] = {
        "rojas": alertas_rojas,
        "amarillas": alertas_amarillas,
        "total_rojas": len(alertas_rojas),
        "total_amarillas": len(alertas_amarillas),
    }

    # Precio de mercado actual
    if price:
        result["precio_actual"] = price
    result["market_cap"] = mkt_cap

    return result


# ─── WACC (Paso 5) ────────────────────────────────────────────────────────────

def calc_wacc(ticker):
    """Calcula WACC vía CAPM con ajuste por riesgo país y tamaño."""
    result = {"ticker": ticker}
    info, bs, inc, cf, precios = _extraer_financieros_adhoc(ticker)

    # ── Datos de mercado ──────────────────────────────────────────────────
    mkt_cap = info.get("marketCap") or 0
    price = info.get("currentPrice") or info.get("regularMarketPrice") or 0
    currency = info.get("currency", "USD")
    is_ba = ticker.endswith(".BA")

    # ── Rf: UST 10Y ──────────────────────────────────────────────────────
    rf = 4.5  # fallback
    try:
        tnx = yf.download("^TNX", period="5d", progress=False)
        if not tnx.empty:
            if isinstance(tnx.columns, pd.MultiIndex):
                rf = float(tnx["Close"].iloc[-1].iloc[0])
            else:
                rf = float(tnx.iloc[-1].iloc[0])
    except:
        pass
    result["rf_ust_10y"] = round(rf, 2)

    # ── β: beta vs benchmark ──────────────────────────────────────────────
    beta = 1.0
    benchmark = "^MERV" if is_ba else "SPY"
    try:
        hist_activo = yf.download(ticker, period="1y", progress=False)
        hist_bench  = yf.download(benchmark, period="1y", progress=False)
        if not hist_activo.empty and not hist_bench.empty:
            ca = hist_activo["Close"] if "Close" in hist_activo else hist_activo.iloc[:, 0]
            cb = hist_bench["Close"] if "Close" in hist_bench else hist_bench.iloc[:, 0]
            ra = np.log(ca / ca.shift(1)).dropna()
            rb = np.log(cb / cb.shift(1)).dropna()
            comunes = ra.index.intersection(rb.index)
            if len(comunes) > 20:
                ra = ra.loc[comunes]
                rb = rb.loc[comunes]
                cov = np.cov(ra, rb)[0, 1]
                var = np.var(rb)
                beta = cov / var if var > 0 else 1.0
    except:
        pass
    result["beta"] = round(beta, 3)
    result["benchmark"] = "MERVAL" if is_ba else "S&P 500"

    # ── (Rm - Rf) prima de riesgo ────────────────────────────────────────
    premio = 6.0 if is_ba else 5.5
    result["prima_riesgo_mercado"] = premio

    # ── Riesgo País ───────────────────────────────────────────────────────
    riesgo_pais = 0
    try:
        rp = requests.get("https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo",
                          headers=BCRA_HEADERS, timeout=10)
        if rp.ok:
            riesgo_pais = float(rp.json().get("valor", 0)) / 100
    except:
        pass
    result["riesgo_pais_pct"] = round(riesgo_pais, 2)

    # ── Ke (CAPM) ─────────────────────────────────────────────────────────
    ke = rf / 100 + beta * (premio / 100) + riesgo_pais / 100
    # Size premium si Market Cap < USD 300M
    size_prem = 0
    if mkt_cap and mkt_cap < 300_000_000:
        if mkt_cap < 50_000_000:
            size_prem = 0.03
        elif mkt_cap < 150_000_000:
            size_prem = 0.02
        else:
            size_prem = 0.015
    ke += size_prem
    result["size_premium"] = round(size_prem * 100, 2)
    result["ke_capm"] = round(ke * 100, 2)

    # ── Kd (costo de deuda) ───────────────────────────────────────────────
    kd = rf / 100 + 0.02  # spread default 2% sobre RF
    if bs is not None and not bs.empty:
        try:
            deuda_col = next((c for c in bs.index if "total debt" in c.lower()), None)
            ni_col = next((c for c in inc.index if "net income" in c.lower()), None)
            if deuda_col:
                deuda = bs.loc[deuda_col].iloc[-1]
            if ni_col:
                ni = inc.loc[ni_col].iloc[-1]
                int_col = next((c for c in inc.index if "interest expense" in c.lower()), None)
                if int_col:
                    gasto_int = inc.loc[int_col].iloc[-1]
                    if deuda != 0:
                        kd = abs(gasto_int / deuda)
            # Kd mín 3%
            kd = max(0.03, kd)
        except:
            pass
    result["kd"] = round(kd * 100, 2)

    # ── Tasa impositiva ───────────────────────────────────────────────────
    t = 0.35 if is_ba else 0.25
    result["tasa_impositiva"] = t

    # ── Pesos E / D ───────────────────────────────────────────────────────
    e = mkt_cap or 1
    d = 0
    if bs is not None and not bs.empty:
        try:
            deuda_col = next((c for c in bs.index if "total debt" in c.lower()), None)
            if deuda_col:
                d = abs(float(bs.loc[deuda_col].iloc[-1]))
                caja_col = next((c for c in bs.index if "cash and cash equivalents" in c.lower()), None)
                if caja_col:
                    caja = abs(float(bs.loc[caja_col].iloc[-1]))
                    d = max(0, d - caja)
        except:
            pass
    v = e + d
    w_e = e / v
    w_d = d / v
    result["peso_equity"] = round(w_e, 4)
    result["peso_deuda"] = round(w_d, 4)

    # ── WACC USD ──────────────────────────────────────────────────────────
    wacc_usd = w_e * ke + w_d * kd * (1 - t)
    result["wacc_usd"] = round(wacc_usd * 100, 2)

    # ── Calibración Argentina ─────────────────────────────────────────────
    if is_ba:
        # Devaluación esperada vía Fisher
        inflacion_ars = 0.03  # fallback 3% mensual
        pi_cn = requests.get("https://api.bcra.gob.ar/estadisticas/v3.0/monetarias/variacionIPC",
                             headers=BCRA_HEADERS, timeout=10)
        if pi_cn.ok:
            pi_data = pi_cn.json().get("results", [])
            if pi_data:
                inflacion_ars = float(pi_data[-1]["valor"]) / 100
        inflacion_usa = 0.0025
        devaluacion = (1 + inflacion_ars) / (1 + inflacion_usa) - 1
        devaluacion_anual = (1 + devaluacion) ** 12 - 1
        result["devaluacion_esperada_anual"] = round(devaluacion_anual * 100, 2)

        wacc_ars = (1 + wacc_usd / 100) * (1 + devaluacion_anual) - 1
        result["wacc_nominal_ars"] = round(wacc_ars * 100, 2)
    else:
        result["wacc_nominal_ars"] = None

    return result


# ─── DCF (Paso 6) ─────────────────────────────────────────────────────────────

def dcf_valuation(ticker):
    """Proyecta FCFF a 5 años, calcula valor terminal y valor intrínseco."""
    result = {"ticker": ticker}
    info, bs, inc, cf, precios = _extraer_financieros_adhoc(ticker)

    wacc_data = calc_wacc(ticker)
    wacc = wacc_data.get("wacc_usd", 10) / 100
    result["wacc_usado"] = round(wacc * 100, 2)

    # ── Ingresos base ─────────────────────────────────────────────────────
    ingresos_base = None
    ingresos_hist = []
    if inc is not None and not inc.empty:
        try:
            rev_col = next((c for c in inc.index if "total revenue" in c.lower()), None) or \
                      next((c for c in inc.index if "revenue" in c.lower()), None)
            if rev_col:
                ingresos_hist = inc.loc[rev_col].dropna().values.tolist()
                ingresos_base = ingresos_hist[-1] if ingresos_hist else None
        except:
            pass

    if not ingresos_base:
        result["error"] = "No se pudieron obtener ingresos históricos"
        return result

    # ── Crecimiento histórico ─────────────────────────────────────────────
    g_corto = 0.05
    if len(ingresos_hist) >= 3:
        try:
            cagr = (ingresos_hist[-1] / ingresos_hist[0]) ** (1 / max(1, len(ingresos_hist) - 1)) - 1
            g_corto = max(0.01, min(cagr, 0.30))
        except:
            pass
    result["g_corto"] = round(g_corto * 100, 2)

    # g_largo = max(inflación USD largo plazo, 2.5%)
    g_largo = max(wacc * 0.5, 0.025)
    g_largo = min(g_largo, wacc - 0.01)  # nunca mayor que WACC
    result["g_largo"] = round(g_largo * 100, 2)

    # ── Márgenes históricos ───────────────────────────────────────────────
    margen_neto_prom = 0.10
    ni_hist = []
    if inc is not None and not inc.empty:
        try:
            ni_col = next((c for c in inc.index if "net income common" in c.lower()), None) or \
                     next((c for c in inc.index if "net income" in c.lower()), None)
            if ni_col:
                ni_hist = inc.loc[ni_col].dropna().values.tolist()
                if ni_hist and ingresos_hist:
                    min_len = min(len(ni_hist), len(ingresos_hist))
                    margenes = [ni_hist[i] / ingresos_hist[i] if ingresos_hist[i] != 0 else 0
                                for i in range(min_len)]
                    margen_neto_prom = sum(margenes) / len(margenes) if margenes else 0.10
        except:
            pass
    result["margen_neto_promedio"] = round(margen_neto_prom * 100, 2)

    # ── Capex / D&A ───────────────────────────────────────────────────────
    capex_pct = 0.05  # capex como % de ingresos
    da_pct = 0.03     # D&A como % de ingresos
    if cf is not None and not cf.empty:
        try:
            capex_col = next((c for c in cf.index if "capital expenditure" in c.lower() or "capex" in c.lower()), None)
            dep_col = next((c for c in cf.index if "depreciation and amortization" in c.lower() or "depreciation & amortization" in c.lower()), None)
            if capex_col:
                capex_vals = cf.loc[capex_col].dropna()
                if len(capex_vals) > 0 and ingresos_base:
                    capex_pct = abs(capex_vals.iloc[-1]) / ingresos_base
            if dep_col:
                dep_vals = cf.loc[dep_col].dropna()
                if len(dep_vals) > 0 and ingresos_base:
                    da_pct = abs(dep_vals.iloc[-1]) / ingresos_base
        except:
            pass

    # ── Deuda / Caja ──────────────────────────────────────────────────────
    deuda_neta = 0
    caja = 0
    if bs is not None and not bs.empty:
        try:
            deuda_col = next((c for c in bs.index if "total debt" in c.lower()), None)
            caja_col = next((c for c in bs.index if "cash and cash equivalents" in c.lower()), None)
            if deuda_col:
                deuda_neta = abs(float(bs.loc[deuda_col].iloc[-1]))
            if caja_col:
                caja = abs(float(bs.loc[caja_col].iloc[-1]))
            deuda_neta = max(0, deuda_neta - caja)
        except:
            pass

    shares = info.get("sharesOutstanding") or info.get("impliedSharesOutstanding") or 0
    price = info.get("currentPrice") or info.get("regularMarketPrice") or 0

    # ── Proyección 5 años ─────────────────────────────────────────────────
    tasas_crec = [g_corto] * 3 + [g_corto + (g_largo - g_corto) * 0.5] * 1 + [g_largo] * 1

    proyecciones = []
    ing_anterior = ingresos_base
    fcff_vals = []

    for year, g in enumerate(tasas_crec, 1):
        ing = ing_anterior * (1 + g)
        ni_proy = ing * margen_neto_prom
        da_proy = ing * da_pct
        capex_proy = ing * capex_pct
        var_ct = ing * 0.02  # variación capital de trabajo ~2% de ingresos
        fcff = ni_proy + da_proy - capex_proy - var_ct

        proyecciones.append({
            "año": year,
            "crecimiento": round(g * 100, 2),
            "ingresos": round(ing, 2),
            "resultado_neto": round(ni_proy, 2),
            "da": round(da_proy, 2),
            "capex": round(capex_proy, 2),
            "fcff": round(fcff, 2),
        })
        fcff_vals.append(fcff)
        ing_anterior = ing

    result["proyecciones"] = proyecciones

    # ── Valor Terminal ────────────────────────────────────────────────────
    vt = fcff_vals[-1] * (1 + g_largo) / (wacc - g_largo) if wacc > g_largo else fcff_vals[-1] * 15
    result["valor_terminal"] = round(vt, 2)

    # ── Enterprise Value ──────────────────────────────────────────────────
    ev = sum(fcff_vals[y] / ((1 + wacc) ** (y + 1)) for y in range(5))
    ev += vt / ((1 + wacc) ** 5)
    result["enterprise_value"] = round(ev, 2)

    # ── Equity Value ──────────────────────────────────────────────────────
    equity_value = ev - deuda_neta + caja
    result["equity_value"] = round(equity_value, 2)

    # ── Valor Intrínseco por acción ───────────────────────────────────────
    vi = equity_value / shares if shares > 0 else 0
    result["valor_intrinseco"] = round(vi, 2)
    result["precio_actual"] = price

    if price > 0 and vi > 0:
        margen_seguridad = (vi - price) / vi * 100
        result["margen_seguridad_pct"] = round(margen_seguridad, 2)
        if margen_seguridad >= 30:
            result["decision"] = "COMPRAR"
        elif margen_seguridad >= 10:
            result["decision"] = "MANTENER / ACUMULAR"
        elif margen_seguridad > -10:
            result["decision"] = "MANTENER"
        else:
            result["decision"] = "VENDER / EVITAR"
    else:
        result["margen_seguridad_pct"] = None
        result["decision"] = "INSUFICIENTES DATOS"

    result["deuda_neta"] = round(deuda_neta, 2)
    result["caja"] = round(caja, 2)
    result["acciones"] = int(shares)

    return result


# ─── Valuación por Múltiplos (Paso 7) ────────────────────────────────────────

def sector_peers(ticker):
    """Obtiene peers del sector para comparación de múltiplos."""
    info, bs, inc, cf, precios = _extraer_financieros_adhoc(ticker)
    sector = info.get("sector", "")
    industry = info.get("industry", "")
    return sector, industry

def valuation_multiples(ticker):
    """Calcula EV/EBITDA, P/E, P/BV, EV/Revenue y valúa por múltiplos."""
    result = {"ticker": ticker}
    info, bs, inc, cf, precios = _extraer_financieros_adhoc(ticker)

    price = info.get("currentPrice") or info.get("regularMarketPrice") or 0
    mkt_cap = info.get("marketCap") or 0
    shares = info.get("sharesOutstanding") or info.get("impliedSharesOutstanding") or 0

    # ── EBITDA ────────────────────────────────────────────────────────────
    ebitda_val = None
    if inc is not None and not inc.empty:
        try:
            ebitda_col = next((c for c in inc.index if "ebitda" in c.lower()), None)
            if ebitda_col:
                ebitda_val = float(inc.loc[ebitda_col].dropna().iloc[-1])
        except:
            pass

    # ── Deuda Neta ────────────────────────────────────────────────────────
    deuda_neta = 0
    caja = 0
    if bs is not None and not bs.empty:
        try:
            deuda_col = next((c for c in bs.index if "total debt" in c.lower()), None)
            caja_col = next((c for c in bs.index if "cash and cash equivalents" in c.lower()), None)
            if deuda_col:
                deuda_neta = abs(float(bs.loc[deuda_col].iloc[-1]))
            if caja_col:
                caja = abs(float(bs.loc[caja_col].iloc[-1]))
            deuda_neta = max(0, deuda_neta - caja)
        except:
            pass

    ev = mkt_cap + deuda_neta
    result["enterprise_value"] = round(ev, 2)

    # ── EV/EBITDA ─────────────────────────────────────────────────────────
    if ebitda_val and ebitda_val != 0:
        result["ev_ebitda"] = round(ev / ebitda_val, 2)
    else:
        result["ev_ebitda"] = None

    # ── P/E ───────────────────────────────────────────────────────────────
    eps = info.get("trailingEps")
    if price and eps and eps != 0:
        result["pe"] = round(price / eps, 2)
    else:
        result["pe"] = None

    # ── P/BV ──────────────────────────────────────────────────────────────
    if bs is not None and not bs.empty:
        try:
            pn_col = next((c for c in bs.index if "total equity" in c.lower() or "stockholders equity" in c.lower()), None)
            if pn_col:
                pn = float(bs.loc[pn_col].dropna().iloc[-1])
                if pn != 0:
                    result["pbv"] = round(mkt_cap / pn, 2)
                else:
                    result["pbv"] = None
        except:
            result["pbv"] = None
    else:
        result["pbv"] = None

    # ── EV/Revenue ────────────────────────────────────────────────────────
    if inc is not None and not inc.empty:
        try:
            rev_col = next((c for c in inc.index if "total revenue" in c.lower()), None) or \
                      next((c for c in inc.index if "revenue" in c.lower()), None)
            if rev_col:
                rev = float(inc.loc[rev_col].dropna().iloc[-1])
                if rev != 0:
                    result["ev_revenue"] = round(ev / rev, 2)
                else:
                    result["ev_revenue"] = None
        except:
            result["ev_revenue"] = None
    else:
        result["ev_revenue"] = None

    # ── Múltiplos sectoriales estimados (proxy) ───────────────────────────
    sector = (info.get("sector") or "").lower()
    industry = (info.get("industry") or "").lower()
    result["sector"] = sector
    result["industry"] = industry

    # Medians sectoriales proxy (basadas en datos de mercado observados)
    sector_medians = {
        "technology": {"ev_ebitda": 18, "pe": 25, "pbv": 6, "ev_revenue": 4},
        "healthcare": {"ev_ebitda": 16, "pe": 22, "pbv": 4, "ev_revenue": 3},
        "financial services": {"ev_ebitda": 12, "pe": 15, "pbv": 1.5, "ev_revenue": 3},
        "consumer defensive": {"ev_ebitda": 14, "pe": 20, "pbv": 3, "ev_revenue": 2},
        "consumer cyclical": {"ev_ebitda": 10, "pe": 18, "pbv": 2.5, "ev_revenue": 1.5},
        "energy": {"ev_ebitda": 6, "pe": 12, "pbv": 1.5, "ev_revenue": 1.5},
        "basic materials": {"ev_ebitda": 8, "pe": 14, "pbv": 1.8, "ev_revenue": 1.5},
        "industrials": {"ev_ebitda": 12, "pe": 18, "pbv": 3, "ev_revenue": 1.8},
        "utilities": {"ev_ebitda": 10, "pe": 16, "pbv": 1.5, "ev_revenue": 2.5},
        "real estate": {"ev_ebitda": 18, "pe": 20, "pbv": 1.2, "ev_revenue": 6},
        "communication services": {"ev_ebitda": 12, "pe": 18, "pbv": 2.5, "ev_revenue": 3},
    }
    median = sector_medians.get(sector, {"ev_ebitda": 12, "pe": 18, "pbv": 2, "ev_revenue": 2.5})
    result["multiples_sector"] = median

    # ── Valor implícito por múltiplos ─────────────────────────────────────
    # Método principal: EV/EBITDA sectorial
    if ebitda_val and ebitda_val > 0 and median.get("ev_ebitda"):
        ev_implied = ebitda_val * median["ev_ebitda"]
        eq_implied = ev_implied - deuda_neta
        vi_multi = eq_implied / shares if shares > 0 else 0
    elif result.get("ev_revenue") and median.get("ev_revenue") and result.get("ev_revenue"):
        # Fallback: EV/Revenue
        rev = ev / result["ev_revenue"] if result["ev_revenue"] else 0
        ev_implied = rev * median["ev_revenue"]
        eq_implied = ev_implied - deuda_neta
        vi_multi = eq_implied / shares if shares > 0 else 0
    else:
        vi_multi = 0

    result["valor_intrinseco_multi"] = round(vi_multi, 2) if vi_multi else None

    # Rango percentil 25-75 (proxy ±20%)
    if vi_multi:
        result["rango_multi"] = {
            "min": round(vi_multi * 0.8, 2),
            "max": round(vi_multi * 1.2, 2),
        }

    return result


# ─── Valor Libro Ajustado / APV (Paso 8) ────────────────────────────────────

def valuation_book_value(ticker):
    """Calcula valor libro ajustado y APV como piso de valuación."""
    result = {"ticker": ticker}
    info, bs, inc, cf, precios = _extraer_financieros_adhoc(ticker)

    mkt_cap = info.get("marketCap") or 0
    shares = info.get("sharesOutstanding") or info.get("impliedSharesOutstanding") or 0
    price = info.get("currentPrice") or info.get("regularMarketPrice") or 0

    activo = pasivo = pn = 0
    deuda = 0
    caja = 0

    if bs is not None and not bs.empty:
        try:
            at_col = next((c for c in bs.index if "total assets" in c.lower()), None)
            pt_col = next((c for c in bs.index if "total liabilities" in c.lower() or "total liabilities net" in c.lower()), None)
            pn_col = next((c for c in bs.index if "total equity" in c.lower() or "stockholders equity" in c.lower()), None)
            deuda_col = next((c for c in bs.index if "total debt" in c.lower()), None)
            caja_col = next((c for c in bs.index if "cash and cash equivalents" in c.lower()), None)
            ap_col = next((c for c in bs.index if "total current assets" in c.lower()), None)
            cl_col = next((c for c in bs.index if "total current liabilities" in c.lower()), None)

            if at_col: activo = float(bs.loc[at_col].dropna().iloc[-1])
            if pt_col: pasivo = float(bs.loc[pt_col].dropna().iloc[-1])
            if pn_col: pn = float(bs.loc[pn_col].dropna().iloc[-1])
            else: pn = activo - pasivo
            if deuda_col: deuda = abs(float(bs.loc[deuda_col].dropna().iloc[-1]))
            if caja_col: caja = abs(float(bs.loc[caja_col].dropna().iloc[-1]))
        except:
            pass

    # ── Valor Libro Ajustado ──────────────────────────────────────────────
    # Aproximación: PN a valor de mercado (asumiendo activos a valor razonable)
    vl_ajustado = pn
    vi_libro = vl_ajustado / shares if shares > 0 else 0
    result["valor_libro"] = round(pn, 2)
    result["valor_libro_por_accion"] = round(vi_libro, 2)

    if price > 0 and vi_libro > 0:
        ratio_pb = price / vi_libro
        result["ratio_precio_valor_libro"] = round(ratio_pb, 2)
        if ratio_pb < 1:
            result["senal_subvaluacion"] = "Precio < Valor Libro — cotiza bajo liquidación"
        else:
            result["senal_subvaluacion"] = None

    # ── APV (Adjusted Present Value) ──────────────────────────────────────
    wacc_data = calc_wacc(ticker)
    ke = wacc_data.get("ke_capm", 10) / 100
    kd = wacc_data.get("kd", 6) / 100
    t = wacc_data.get("tasa_impositiva", 0.25)

    # VAN empresa sin deuda (aproximación: capitalization de earnings)
    ni = None
    if inc is not None and not inc.empty:
        try:
            ni_col = next((c for c in inc.index if "net income common" in c.lower()), None) or \
                     next((c for c in inc.index if "net income" in c.lower()), None)
            if ni_col: ni = float(inc.loc[ni_col].dropna().iloc[-1])
        except:
            pass

    if ni and ke > 0:
        van_unlevered = ni / ke
    else:
        van_unlevered = 0
    result["van_unlevered"] = round(van_unlevered, 2)

    # PV(escudo fiscal) = Kd × D × T / Ke_unlevered
    if kd > 0 and deuda > 0:
        pv_tax_shield = kd * deuda * t / ke if ke > 0 else 0
    else:
        pv_tax_shield = 0
    result["pv_tax_shield"] = round(pv_tax_shield, 2)

    apv = van_unlevered + pv_tax_shield
    result["apv"] = round(apv, 2)
    vi_apv = apv / shares if shares > 0 else 0
    result["valor_intrinseco_apv"] = round(vi_apv, 2)

    return result


# ─── Triangulación Final (Paso 9) ────────────────────────────────────────────

def triangulate(ticker):
    """Combina DCF + Múltiplos + Valor Libro en un rango ponderado."""
    result = {"ticker": ticker}
    info, bs, inc, cf, precios = _extraer_financieros_adhoc(ticker)

    # Ejecutar los 3 métodos
    dcf = dcf_valuation(ticker)
    multi = valuation_multiples(ticker)
    book = valuation_book_value(ticker)

    vi_dcf = dcf.get("valor_intrinseco") or 0
    vi_multi = multi.get("valor_intrinseco_multi") or 0
    vi_libro = book.get("valor_libro_por_accion") or 0

    price = info.get("currentPrice") or info.get("regularMarketPrice") or 0

    result["valor_dcf"] = round(vi_dcf, 2)
    result["valor_multi"] = round(vi_multi, 2)
    result["valor_libro"] = round(vi_libro, 2)
    result["precio_actual"] = price

    # ── Determinar perfil ─────────────────────────────────────────────────
    sector = (info.get("sector") or "").lower()
    industry = (info.get("industry") or "").lower()

    # Clasificar empresa
    is_growth = any(k in sector for k in ["technology"]) or \
                any(k in industry for k in ["software", "internet", "biotechnology"])
    is_distress = dcf.get("decision") == "VENDER / EVITAR" or \
                  (vi_dcf <= 0 and vi_multi <= 0)

    if is_distress:
        w_dcf, w_multi, w_book = 0.20, 0.30, 0.50
        perfil = "reestructuración / distress"
    elif is_growth:
        w_dcf, w_multi, w_book = 0.40, 0.50, 0.10
        perfil = "crecimiento"
    else:
        w_dcf, w_multi, w_book = 0.50, 0.30, 0.20
        perfil = "madura / flujos estables"

    result["perfil"] = perfil
    result["pesos"] = {"dcf": w_dcf, "multi": w_multi, "book": w_book}

    # ── VI ponderado ──────────────────────────────────────────────────────
    vi_pond = w_dcf * vi_dcf + w_multi * vi_multi + w_book * vi_libro
    result["valor_intrinseco_ponderado"] = round(vi_pond, 2)

    # ── Rango final ──────────────────────────────────────────────────────
    valores = [v for v in [vi_dcf, vi_multi, vi_libro] if v > 0]
    if valores:
        result["rango_final"] = {
            "min": round(min(valores), 2),
            "max": round(max(valores), 2),
            "central": round(vi_pond, 2),
        }
    else:
        result["rango_final"] = None

    # ── Decisión final ────────────────────────────────────────────────────
    if price > 0 and vi_pond > 0:
        margen = (vi_pond - price) / vi_pond * 100
        result["margen_seguridad_pct"] = round(margen, 2)
        if margen >= 30:
            result["decision_final"] = "COMPRAR"
        elif margen >= 10:
            result["decision_final"] = "MANTENER / ACUMULAR"
        elif margen >= 0:
            result["decision_final"] = "MANTENER"
        elif margen > -20:
            result["decision_final"] = "REDUCIR"
        else:
            result["decision_final"] = "VENDER"
    else:
        result["margen_seguridad_pct"] = None
        result["decision_final"] = "DATOS INSUFICIENTES"

    # Incluir todos los sub-resultados para el frontend
    result["dcf"] = dcf
    result["multiples"] = multi
    result["book_value"] = book

    return result


# ─── Full Analysis — Todas las Capas (Paso 10 + 11) ──────────────────────────

def full_analysis(ticker):
    """Ejecuta todas las capas y produce la ficha de decisión estructurada."""
    result = {"ticker": ticker, "fecha": datetime.now().isoformat()[:10]}

    info, _, _, _, _ = _extraer_financieros_adhoc(ticker)
    price = info.get("currentPrice") or info.get("regularMarketPrice") or 0
    result["precio_actual"] = price

    # ── Capa 1: Macro ─────────────────────────────────────────────────────
    macro = get_macro_context()
    result["macro"] = {
        "score_macro": macro.get("regimen_macro"),
        "tasa_libre_riesgo_local": macro.get("tasa_libre_riesgo_local"),
        "riesgo_pais_bps": macro.get("riesgo_pais"),
    }

    # ── Capa 3: Cualitativo ──────────────────────────────────────────────
    cuali = qualitative_analysis(ticker)
    result["cualitativo"] = {
        "score_total": cuali.get("score_total"),
        "dimensiones": cuali.get("dimensiones"),
        "continuar": cuali.get("continuar"),
        "sector": cuali.get("sector"),
        "industry": cuali.get("industry"),
    }

    # ── Capa 4: Cuantitativo ──────────────────────────────────────────────
    cuanti = quantitative_analysis(ticker)
    result["cuantitativo"] = {
        "metricas": cuanti.get("metricas"),
        "alertas": cuanti.get("alertas"),
    }

    # ── Capa 5: WACC ──────────────────────────────────────────────────────
    wacc = calc_wacc(ticker)
    result["wacc"] = {
        "wacc_usd": wacc.get("wacc_usd"),
        "ke": wacc.get("ke_capm"),
        "kd": wacc.get("kd"),
        "beta": wacc.get("beta"),
    }

    # ── Capa 6-9: Valuación ───────────────────────────────────────────────
    tri = triangulate(ticker)
    vi_central = tri.get("valor_intrinseco_ponderado") or 0
    vi_dcf = tri.get("valor_dcf") or 0
    vi_multi = tri.get("valor_multi") or 0
    vi_libro = tri.get("valor_libro") or 0

    result["valuacion"] = {
        "vi_dcf": vi_dcf,
        "vi_multi": vi_multi,
        "vi_libro": vi_libro,
        "vi_central": vi_central,
        "rango": tri.get("rango_final"),
        "perfil": tri.get("perfil"),
        "decision": tri.get("decision_final"),
    }

    # ── Paso 10: Margen de Seguridad calibrado ────────────────────────────
    score_cuali = cuali.get("score_total") or 5.0
    if score_cuali >= 8.0:
        mos = 0.20
    elif score_cuali >= 6.0:
        mos = 0.35
    else:
        mos = 0.50

    p_max = vi_central * (1 - mos) if vi_central > 0 else 0
    upside = (vi_central / price - 1) * 100 if price > 0 and vi_central > 0 else None

    result["margen_seguridad"] = {
        "mos_aplicado_pct": round(mos * 100, 1),
        "precio_max_entrada": round(p_max, 2),
        "precio_target": round(vi_central, 2),
        "upside_pct": round(upside, 2) if upside is not None else None,
    }

    # ── Decisión final ────────────────────────────────────────────────────
    if not cuali.get("continuar"):
        result["decision_final"] = "NO ANALIZAR — Score cualitativo insuficiente. No comprar lo que no se entiende (Buffett)."
        result["bloqueado_por_cualitativo"] = True
    elif price <= 0 or vi_central <= 0:
        result["decision_final"] = "DATOS INSUFICIENTES"
        result["bloqueado_por_cualitativo"] = False
    else:
        result["bloqueado_por_cualitativo"] = False
        if upside is not None and upside >= mos * 100:
            result["decision_final"] = "COMPRAR"
        elif price <= vi_central:
            result["decision_final"] = "ESPERAR / MANTENER"
        else:
            result["decision_final"] = "NO COMPRAR / EVALUAR VENTA"

        # Regla 6 — Notas de consistencia
        result["notas_consistencia"] = [
            "Fisher usado para tasa real — nunca resta simple",
            "El valor libro es el piso, no el objetivo",
            "Múltiplos ajustados por riesgo país si aplica" if ticker.endswith(".BA") else "Múltiplos comparables de mercado USA",
            "Score cualitativo >= 5.0 — análisis cuantitativo habilitado" if cuali.get("continuar") else "Score cualitativo < 5.0 — análisis bloqueado",
        ]

    # Resumen para frontend
    result["resumen"] = {
        "ticker": ticker,
        "precio": price,
        "vi_central": round(vi_central, 2),
        "upside": round(upside, 2) if upside else None,
        "decision": result.get("decision_final"),
        "score_cualitativo": score_cuali,
        "score_macro": macro.get("regimen_macro"),
    }

    return result


# ─── FACTORS MASTER LIST (Análisis Intermarket) ────────────────────────────────

FACTORS_MASTER_LIST = {
    # --- MACRO Y DIVISAS ---
    'DX-Y.NYB': {'name': 'Dólar Index (DXY)', 'cat': 'Macro', 'sub': 'Currency'},
    'EURUSD=X': {'name': 'Euro/Dólar', 'cat': 'Macro', 'sub': 'Currency'},
    '^TNX': {'name': 'Yield 10Y Tesoro', 'cat': 'Macro', 'sub': 'Rates'},
    '^VIX': {'name': 'Índice de Volatilidad (Miedo)', 'cat': 'Macro', 'sub': 'Risk'},
    'TIP': {'name': 'TIPS (Inflación)', 'cat': 'Macro', 'sub': 'Inflation'},
    # --- RENTA FIJA ---
    'SHY': {'name': 'Bonos 1-3Y (Corto)', 'cat': 'Bonds', 'sub': 'Yield'},
    'IEF': {'name': 'Bonos 7-10Y (Medio)', 'cat': 'Bonds', 'sub': 'Yield'},
    'TLT': {'name': 'Bonos 20+Y (Largo)', 'cat': 'Bonds', 'sub': 'Yield'},
    'HYG': {'name': 'High Yield (Corporativo)', 'cat': 'Bonds', 'sub': 'Risk'},
    'LQD': {'name': 'Corp. Investment Grade', 'cat': 'Bonds', 'sub': 'Risk'},
    'BNDX': {'name': 'Bonos Int. Total', 'cat': 'Bonds', 'sub': 'Global'},
    # --- COMMODITIES ---
    'USO': {'name': 'Petróleo WTI', 'cat': 'Commodities', 'sub': 'Energy'},
    'UNG': {'name': 'Gas Natural', 'cat': 'Commodities', 'sub': 'Energy'},
    'GLD': {'name': 'Oro', 'cat': 'Commodities', 'sub': 'Precious'},
    'SLV': {'name': 'Plata', 'cat': 'Commodities', 'sub': 'Precious'},
    'COPX': {'name': 'Cobre', 'cat': 'Commodities', 'sub': 'Industrial'},
    'DBA': {'name': 'Agricultura', 'cat': 'Commodities', 'sub': 'Agri'},
    'SOYB': {'name': 'Soja', 'cat': 'Commodities', 'sub': 'Agri'},
    'CORN': {'name': 'Maíz', 'cat': 'Commodities', 'sub': 'Agri'},
    'LIT': {'name': 'Litio', 'cat': 'Commodities', 'sub': 'Strategic'},
    'DBC': {'name': 'Commodities Total', 'cat': 'Commodities', 'sub': 'Broad'},
    # --- SECTORES EE.UU. ---
    'XLK': {'name': 'Tecnología', 'cat': 'Sectors', 'sub': 'US'},
    'XLF': {'name': 'Finanzas', 'cat': 'Sectors', 'sub': 'US'},
    'XLV': {'name': 'Salud', 'cat': 'Sectors', 'sub': 'US'},
    'XLE': {'name': 'Energía', 'cat': 'Sectors', 'sub': 'US'},
    'XLC': {'name': 'Comunicación', 'cat': 'Sectors', 'sub': 'US'},
    'XLY': {'name': 'Consumo Discrecional', 'cat': 'Sectors', 'sub': 'US'},
    'XLP': {'name': 'Consumo Básico', 'cat': 'Sectors', 'sub': 'US'},
    'XLI': {'name': 'Industrial', 'cat': 'Sectors', 'sub': 'US'},
    'XLB': {'name': 'Materiales', 'cat': 'Sectors', 'sub': 'US'},
    'XLRE': {'name': 'Inmobiliario', 'cat': 'Sectors', 'sub': 'US'},
    'XLU': {'name': 'Utilities', 'cat': 'Sectors', 'sub': 'US'},
    # --- SMART BETA / FACTORES ---
    'MTUM': {'name': 'Momentum', 'cat': 'Factors', 'sub': 'Alpha'},
    'QUAL': {'name': 'Calidad', 'cat': 'Factors', 'sub': 'Alpha'},
    'SIZE': {'name': 'Small Caps', 'cat': 'Factors', 'sub': 'Style'},
    'USMV': {'name': 'Min. Volatilidad', 'cat': 'Factors', 'sub': 'Risk'},
    'IVE': {'name': 'Value', 'cat': 'Factors', 'sub': 'Style'},
    'IVW': {'name': 'Growth', 'cat': 'Factors', 'sub': 'Style'},
    'IWM': {'name': 'Russell 2000', 'cat': 'Factors', 'sub': 'Market'},
    # --- ÍNDICES GLOBALES ---
    'SPY': {'name': 'S&P 500', 'cat': 'Market', 'sub': 'US'},
    '^GSPC': {'name': 'S&P 500 (precio)', 'cat': 'Market', 'sub': 'US'},
    '^IXIC': {'name': 'NASDAQ', 'cat': 'Market', 'sub': 'US'},
    '^DJI': {'name': 'Dow Jones', 'cat': 'Market', 'sub': 'US'},
    '^RUT': {'name': 'Russell 2000', 'cat': 'Market', 'sub': 'US'},
    # --- PAÍSES Y REGIONES ---
    'ARGT': {'name': 'MSCI Argentina', 'cat': 'Countries', 'sub': 'Latam'},
    'EWZ': {'name': 'MSCI Brasil', 'cat': 'Countries', 'sub': 'Latam'},
    'EWW': {'name': 'MSCI México', 'cat': 'Countries', 'sub': 'Latam'},
    'ECH': {'name': 'MSCI Chile', 'cat': 'Countries', 'sub': 'Latam'},
    'EEM': {'name': 'Emerging Markets', 'cat': 'Countries', 'sub': 'Global'},
    'VWO': {'name': 'Emerging Vanguard', 'cat': 'Countries', 'sub': 'Global'},
    'FXI': {'name': 'China Large Caps', 'cat': 'Countries', 'sub': 'Asia'},
    'INDA': {'name': 'MSCI India', 'cat': 'Countries', 'sub': 'Asia'},
    'EFA': {'name': 'Desarrollados ex-US', 'cat': 'Countries', 'sub': 'Global'},
    'EWG': {'name': 'MSCI Alemania', 'cat': 'Countries', 'sub': 'Europe'},
    'EWJ': {'name': 'MSCI Japón', 'cat': 'Countries', 'sub': 'Asia'},
    '^GDAXI': {'name': 'DAX Alemania', 'cat': 'Countries', 'sub': 'Europe'},
    '^N225': {'name': 'Nikkei 225', 'cat': 'Countries', 'sub': 'Asia'},
    # --- ARGENTINA LOCAL ---
    '^MERV': {'name': 'MERVAL', 'cat': 'Countries', 'sub': 'Argentina'},
    'GGAL.BA': {'name': 'Grupo Financiero Galicia', 'cat': 'Countries', 'sub': 'Argentina'},
    'YPFD.BA': {'name': 'YPF', 'cat': 'Countries', 'sub': 'Argentina'},
}

def compute_correlation_beta(asset_returns, factor_returns):
    """Calcula correlación y beta entre rendimientos del activo y un factor."""
    common = asset_returns.index.intersection(factor_returns.index)
    if len(common) < 10:
        return None, None, None
    a = asset_returns.loc[common].values
    f = factor_returns.loc[common].values
    corr = float(np.corrcoef(a, f)[0, 1])
    cov = float(np.cov(a, f)[0, 1])
    var = float(np.var(f))
    beta = cov / var if var > 1e-10 else 0.0
    r2 = corr * corr
    return corr, beta, r2

def intermarket_analysis(ticker, period="1y"):
    """
    Analiza un ticker contra todos los factores de FACTORS_MASTER_LIST.
    Retorna correlaciones, betas, R² agrupados por categoría.
    """
    result = {
        "ticker": ticker,
        "period": period,
        "timestamp": datetime.now().isoformat(),
        "total_factors": 0,
        "categories": {},
        "rankings": [],
        "summary": {}
    }

    # Descargar datos del activo
    try:
        asset = yf.download(ticker, period=period, auto_adjust=True, progress=False)
        if asset.empty:
            return {**result, "error": f"Sin datos para {ticker}"}
        if isinstance(asset.columns, pd.MultiIndex):
            asset_close = asset["Close"]
        else:
            asset_close = asset
        if isinstance(asset_close, pd.DataFrame):
            asset_series = asset_close.iloc[:, 0].dropna()
        else:
            asset_series = asset_close.dropna()
        if len(asset_series) < 20:
            return {**result, "error": f"Datos insuficientes para {ticker}"}
        asset_returns = asset_series.pct_change().dropna()
    except Exception as e:
        return {**result, "error": str(e)}

    # Agrupar factores por categoría
    categories = {}
    for ticker_f, meta in FACTORS_MASTER_LIST.items():
        cat = meta['cat']
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(ticker_f)

    all_results = []

    for cat, tickers_list in categories.items():
        cat_factors = []
        cat_results = []
        # Descargar todos los tickers de esta categoría juntos (más eficiente)
        batch_tickers = [t for t in tickers_list if t != ticker and not t.endswith("=X")]
        # Algunos tickers los descargamos individualmente por formato especial
        special_tickers = [t for t in tickers_list if t.endswith("=X") or t.startswith("^") or '-' in t]

        # Batch download para tickers normales
        if batch_tickers:
            try:
                batch_data = yf.download(batch_tickers, period=period, auto_adjust=True, progress=False)
                if not batch_data.empty:
                    if isinstance(batch_data.columns, pd.MultiIndex):
                        batch_close = batch_data["Close"]
                    else:
                        batch_close = batch_data
                    for t in batch_tickers:
                        if t in batch_close.columns:
                            series = batch_close[t].dropna()
                            if len(series) >= 20:
                                f_returns = series.pct_change().dropna()
                                corr, beta, r2 = compute_correlation_beta(asset_returns, f_returns)
                                meta_f = FACTORS_MASTER_LIST[t]
                                entry = {
                                    "ticker": t,
                                    "name": meta_f['name'],
                                    "category": cat,
                                    "subcategory": meta_f['sub'],
                                    "correlation": round(corr, 4) if corr is not None else None,
                                    "beta": round(beta, 4) if beta is not None else None,
                                    "r_squared": round(r2, 4) if r2 is not None else None,
                                }
                                cat_results.append(entry)
                                all_results.append(entry)
            except:
                pass

        # Descargar tickers especiales individualmente
        for t in special_tickers:
            try:
                td = yf.download(t, period=period, auto_adjust=True, progress=False)
                if not td.empty:
                    if isinstance(td.columns, pd.MultiIndex):
                        ts = td["Close"]
                    else:
                        ts = td
                    if isinstance(ts, pd.DataFrame):
                        series = ts.iloc[:, 0].dropna()
                    else:
                        series = ts.dropna()
                    if len(series) >= 20:
                        f_returns = series.pct_change().dropna()
                        corr, beta, r2 = compute_correlation_beta(asset_returns, f_returns)
                        meta_f = FACTORS_MASTER_LIST[t]
                        entry = {
                            "ticker": t,
                            "name": meta_f['name'],
                            "category": cat,
                            "subcategory": meta_f['sub'],
                            "correlation": round(corr, 4) if corr is not None else None,
                            "beta": round(beta, 4) if beta is not None else None,
                            "r_squared": round(r2, 4) if r2 is not None else None,
                        }
                        cat_results.append(entry)
                        all_results.append(entry)
            except:
                pass

        # Calcular stats de la categoría
        corrs = [r['correlation'] for r in cat_results if r['correlation'] is not None]
        result['categories'][cat] = {
            "factors": cat_results,
            "count": len(cat_results),
            "avg_correlation": round(float(np.mean(corrs)), 4) if corrs else None,
            "max_correlation": round(float(max(corrs, key=abs)), 4) if corrs else None,
        }

    # Rankings: mejores correlaciones positivas y negativas
    valid = [r for r in all_results if r['correlation'] is not None]
    valid.sort(key=lambda x: x['correlation'], reverse=True)

    result['rankings'] = {
        "top_positive": valid[:10],
        "top_negative": sorted([r for r in valid if r['correlation'] < 0], key=lambda x: x['correlation'])[:10],
        "by_beta": sorted(valid, key=lambda x: abs(x['beta']), reverse=True)[:10],
    }

    # Summary
    strong_positive = len([r for r in valid if r['correlation'] > 0.5])
    strong_negative = len([r for r in valid if r['correlation'] < -0.5])
    weak = len([r for r in valid if abs(r['correlation']) < 0.2])
    result['summary'] = {
        "total_valid": len(valid),
        "strong_positive": strong_positive,
        "strong_negative": strong_negative,
        "weak_correlation": weak,
        "avg_correlation_all": round(float(np.mean([r['correlation'] for r in valid])), 4) if valid else None,
    }
    result['total_factors'] = len(all_results)

    return result


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory(".", "index (7).html")

@app.route("/api/price")
def api_price():
    ticker = request.args.get("ticker", "").strip()
    if not ticker:
        return jsonify({"error": "Falta ticker"}), 400
    try:
        t = yf.Ticker(ticker)
        hist = t.history(period="5d")
        if hist.empty:
            return jsonify({"error": "Sin datos"}), 404
        info = t.info or {}
        return jsonify({
            "ticker": ticker,
            "price": round(float(hist["Close"].iloc[-1]), 2),
            "name": info.get("longName", ticker),
            "currency": info.get("currency", "USD"),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/panel-ons")
def panel_ons():
    return send_from_directory(".", "panel-ons.html")

@app.route("/api/ons/precios")
def api_ons_precios():
    """Devuelve TODAS las ONs desde IOL API con precios, TIR y paridad."""
    iol_user = os.environ.get("IOL_USERNAME", "")
    iol_pass = os.environ.get("IOL_PASSWORD", "")
    resultados = []

    if not iol_user or not iol_pass:
        return jsonify({"error": "Credenciales IOL no configuradas", "data": []})

    try:
        r = requests.post("https://api.invertironline.com/token",
            data={"username": iol_user, "password": iol_pass, "grant_type": "password"},
            headers={"Content-Type": "application/x-www-form-urlencoded"}, timeout=10)
        if not r.ok:
            return jsonify({"error": "Auth IOL falló", "data": []})
        token = r.json().get("access_token")
    except Exception as e:
        return jsonify({"error": str(e), "data": []})

    try:
        resp = requests.get(
            "https://api.invertironline.com/api/v2/Cotizaciones/obligacionesNegociables/argentina/Todos",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            timeout=15
        )
        if not resp.ok:
            return jsonify({"error": f"IOL {resp.status_code}", "data": []})
        
        data = resp.json()
        titulos = data.get("titulos", []) if isinstance(data, dict) else data
        
        for t in titulos:
            try:
                simbolo = (t.get("simbolo") or "").strip()
                if not simbolo:
                    continue
                ultimo = t.get("ultimoPrecio") or t.get("ultimoOperado", 0)
                apertura = t.get("apertura", 0) or t.get("cierreAnterior", 0)
                try:
                    ultimo_f = float(ultimo)
                except:
                    continue
                if ultimo_f <= 0:
                    continue
                variacion = round(((ultimo_f / float(apertura)) - 1) * 100, 2) if float(apertura) > 0 else 0
                desc = t.get("descripcion", "") or t.get("titulo", {}).get("descripcion", "")
                volumen = t.get("volumen", 0) or t.get("montoOperado", 0)
                try:
                    volumen_f = float(volumen)
                except:
                    volumen_f = 0
                # TIR y paridad pueden venir de campos específicos de IOL
                tir = t.get("tir", None) or t.get("rendimiento", None)
                paridad = t.get("paridad", None) or t.get("cotizacion", 0)
                try:
                    tir_f = float(tir) if tir else None
                except:
                    tir_f = None
                try:
                    paridad_f = float(paridad) if paridad else None
                except:
                    paridad_f = None

                resultados.append({
                    "simbolo": simbolo,
                    "descripcion": desc[:100] if desc else "",
                    "precio": round(ultimo_f, 2),
                    "variacion": variacion,
                    "tir": round(tir_f, 2) if tir_f else None,
                    "paridad": round(paridad_f, 4) if paridad_f else None,
                    "volumen": round(volumen_f, 2),
                    "fuente": "IOL",
                })
            except:
                continue

        resultados.sort(key=lambda x: x.get("volumen", 0), reverse=True)
        return jsonify({"total": len(resultados), "data": resultados})

    except Exception as e:
        return jsonify({"error": str(e), "data": []})

@app.route("/api/news")
def api_news():
    ticker = request.args.get("ticker", "").strip()
    count = request.args.get("count", 10, type=int)
    if not ticker:
        return jsonify({"error": "Falta ticker"}), 400
    try:
        t = yf.Ticker(ticker)
        try:
            items = t.get_news(count=count, tab='news')
        except TypeError:
            items = t.get_news(count=count)
        except AttributeError:
            items = (t.news or [])[:count]
        from datetime import datetime as _dt
        results = []
        for item in items:
            c = item.get("content", {})
            title = c.get("title", "")
            publisher = c.get("provider", {}).get("displayName", "")
            link = c.get("canonicalUrl", {}).get("url", "") or c.get("clickThroughUrl", {}).get("url", "")
            pub_str = c.get("pubDate", "") or c.get("displayTime", "")
            pub_ts = int(_dt.fromisoformat(pub_str.replace("Z", "+00:00")).timestamp()) if pub_str else 0
            results.append({
                "title": title,
                "link": link,
                "publisher": publisher,
                "providerPublishTime": pub_ts,
                "summary": c.get("summary", ""),
            })
        return jsonify({"news": results, "total": len(results), "ticker": ticker})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/prices", methods=["POST"])
def api_prices():
    data = request.json or {}
    tickers = data.get("tickers", [])
    if not tickers:
        return jsonify({"error": "Falta lista de tickers"}), 400
    try:
        prices = {}
        for ticker in tickers:
            t = yf.Ticker(ticker)
            hist = t.history(period="5d")
            if not hist.empty:
                prices[ticker] = round(float(hist["Close"].iloc[-1]), 2)
            else:
                prices[ticker] = None
        return jsonify({"prices": prices})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/semaforo", methods=["POST"])
def api_semaforo():
    data = request.json or {}
    tickers = data.get("tickers", [])
    return jsonify([get_semaforo_data(t) for t in tickers])

@app.route("/api/analyze", methods=["POST"])
def api_analyze():
    data = request.json or {}
    holdings = data.get("holdings", {})
    start_date = data.get("start_date", "2022-01-01")
    tickers = list(holdings.keys())

    if not tickers:
        return jsonify({"error": "Sin tickers"}), 400

    try:
        prices = download_prices(tickers, start_date)
        if prices.empty:
            return jsonify({"error": "No se pudieron descargar datos. Verifica los tickers."}), 400

        valid_tickers = list(prices.columns)
        returns_df = compute_returns(prices)
        n = len(valid_tickers)

        if n < 2:
            return jsonify({"error": "Se necesitan ≥2 activos con datos históricos suficientes."}), 400

        mtx = returns_df.values
        mtx_cov  = np.cov(mtx, rowvar=False) * FACTOR
        mtx_corr = np.corrcoef(mtx, rowvar=False)
        mean_vec = returns_df.mean().values * FACTOR
        vol_vec  = returns_df.std().values  * np.sqrt(FACTOR)

        # Stats individuales
        individual_stats = []
        for i, ticker in enumerate(valid_tickers):
            sharpe = mean_vec[i] / vol_vec[i] if vol_vec[i] > 0 else 0
            individual_stats.append({
                "ticker": ticker,
                "retorno": round(float(mean_vec[i]), DECIMALS),
                "volatilidad": round(float(vol_vec[i]), DECIMALS),
                "sharpe": round(float(sharpe), DECIMALS),
            })
        individual_stats.sort(key=lambda x: x["sharpe"], reverse=True)

        # Portafolio actual
        current_prices = prices.iloc[-1]
        positions = {}
        total_value = 0.0
        for ticker in valid_tickers:
            qty = holdings.get(ticker, 0)
            if qty > 0:
                val = qty * float(current_prices[ticker])
                positions[ticker] = val
                total_value += val

        current_weights = np.array([
            positions.get(t, 0) / total_value if total_value > 0 else 0
            for t in valid_tickers
        ])
        curr_ret  = float(mean_vec @ current_weights) if total_value > 0 else 0
        curr_vol  = float(np.sqrt(_portfolio_variance(current_weights, mtx_cov))) if total_value > 0 else 0
        curr_sharpe = curr_ret / curr_vol if curr_vol > 0 else 0

        # Optimizaciones
        strategies = ["equi-weight", "min-variance", "volatility-weighted", "markowitz", "max-sharpe"]
        optimizations = [optimize_portfolio(s, mean_vec, vol_vec, mtx_cov, valid_tickers) for s in strategies]

        # Rebalanceo solo activos positivos
        pos_mask = mean_vec > 0
        pos_tickers = [valid_tickers[i] for i in range(n) if pos_mask[i]]
        rebalance = None
        if len(pos_tickers) >= 2:
            n_pos   = len(pos_tickers)
            mean_p  = mean_vec[pos_mask]
            vol_p   = vol_vec[pos_mask]
            cov_p   = mtx_cov[np.ix_(pos_mask, pos_mask)]
            res_rb  = optimize_portfolio("min-variance", mean_p, vol_p, cov_p, pos_tickers)
            w_full  = np.zeros(n)
            for i, t in enumerate(valid_tickers):
                if t in pos_tickers:
                    w_full[i] = res_rb["pesos"][t]
            ret_rb = float(mean_vec @ w_full)
            vol_rb = float(np.sqrt(_portfolio_variance(w_full, mtx_cov)))
            rebalance = {
                "retorno": round(ret_rb, DECIMALS),
                "volatilidad": round(vol_rb, DECIMALS),
                "sharpe": round(ret_rb / vol_rb if vol_rb > 0 else 0, DECIMALS),
                "pesos": {valid_tickers[i]: round(float(w_full[i]), 4) for i in range(n)},
                "activos_positivos": pos_tickers,
            }

        return jsonify({
            "tickers": valid_tickers,
            "individual_stats": individual_stats,
            "current_portfolio": {
                "total_value": round(total_value, 2),
                "retorno": round(curr_ret, DECIMALS),
                "volatilidad": round(curr_vol, DECIMALS),
                "sharpe": round(curr_sharpe, DECIMALS),
                "weights": {t: round(float(current_weights[i]), 4) for i, t in enumerate(valid_tickers)},
                "positions": {t: round(v, 2) for t, v in positions.items()},
            },
            "optimizations": optimizations,
            "rebalance": rebalance,
            "correlation": {
                "tickers": valid_tickers,
                "data": np.round(mtx_corr, 2).tolist(),
            },
        })

    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "detail": traceback.format_exc()}), 500

@app.route("/api/qualitative", methods=["POST"])
def api_qualitative():
    data = request.json or {}
    ticker = data.get("ticker", "").strip()
    if not ticker: return jsonify({"error": "Falta ticker"}), 400
    return jsonify(qualitative_analysis(ticker))

@app.route("/api/quantitative", methods=["POST"])
def api_quantitative():
    data = request.json or {}
    ticker = data.get("ticker", "").strip()
    if not ticker: return jsonify({"error": "Falta ticker"}), 400
    return jsonify(quantitative_analysis(ticker))

@app.route("/api/wacc", methods=["POST"])
def api_wacc():
    data = request.json or {}
    ticker = data.get("ticker", "").strip()
    if not ticker: return jsonify({"error": "Falta ticker"}), 400
    return jsonify(calc_wacc(ticker))

@app.route("/api/dcf", methods=["POST"])
def api_dcf():
    data = request.json or {}
    ticker = data.get("ticker", "").strip()
    if not ticker: return jsonify({"error": "Falta ticker"}), 400
    return jsonify(dcf_valuation(ticker))

@app.route("/api/multiples", methods=["POST"])
def api_multiples():
    data = request.json or {}
    ticker = data.get("ticker", "").strip()
    if not ticker: return jsonify({"error": "Falta ticker"}), 400
    return jsonify(valuation_multiples(ticker))

@app.route("/api/book-value", methods=["POST"])
def api_book_value():
    data = request.json or {}
    ticker = data.get("ticker", "").strip()
    if not ticker: return jsonify({"error": "Falta ticker"}), 400
    return jsonify(valuation_book_value(ticker))

@app.route("/api/triangulate", methods=["POST"])
def api_triangulate():
    data = request.json or {}
    ticker = data.get("ticker", "").strip()
    if not ticker: return jsonify({"error": "Falta ticker"}), 400
    return jsonify(triangulate(ticker))

@app.route("/api/full-analysis", methods=["POST"])
def api_full_analysis():
    data = request.json or {}
    ticker = data.get("ticker", "").strip()
    if not ticker: return jsonify({"error": "Falta ticker"}), 400
    return jsonify(full_analysis(ticker))

@app.route("/api/comparar", methods=["POST"])
def api_comparar():
    """Compara tickers seleccionados contra un benchmark sectorial."""
    data = request.json or {}
    tickers = data.get("tickers", [])
    benchmark = data.get("benchmark", "SPY").strip()
    start_date = data.get("start_date", "2022-01-01")

    if not tickers or len(tickers) < 1:
        return jsonify({"error": "Se necesitan al menos 1 ticker"}), 400

    todos = list(tickers) + [benchmark]
    try:
        prices = download_prices(todos, start_date)
        if prices.empty or benchmark not in prices.columns:
            return jsonify({"error": f"No se pudieron descargar datos para {benchmark}"}), 400

        valid_tickers = [t for t in tickers if t in prices.columns]
        missing_tickers = [t for t in tickers if t not in prices.columns]
        if not valid_tickers:
            return jsonify({"error": "Ningún ticker tiene datos suficientes"}), 400

        bench_series = prices[benchmark].dropna()
        benchmark_name = benchmark
        try:
            bi = yf.Ticker(benchmark).info
            benchmark_name = bi.get("longName", benchmark) or benchmark
        except:
            pass

        returns_df = compute_returns(prices)
        bench_returns = returns_df[benchmark].dropna()
        factor = FACTOR

        results = []
        excluded = []
        cumulative_data = {}

        # Tickers que directamente no tienen datos en yfinance
        for mt in missing_tickers:
            excluded.append({"ticker": mt, "error": "Sin datos en yfinance (verificá el símbolo)"})

        for t in valid_tickers:
            t_returns = returns_df[t].dropna()
            aligned = pd.concat([t_returns, bench_returns], axis=1, join="inner").dropna()
            aligned.columns = ["ticker", "bench"]

            if len(aligned) < 10:
                excluded.append({"ticker": t, "error": f"Datos insuficientes ({len(aligned)} días en común con {benchmark})"})
                continue

            ret_ann = float(aligned["ticker"].mean() * factor)
            vol_ann = float(aligned["ticker"].std() * np.sqrt(factor))
            sharpe = ret_ann / vol_ann if vol_ann > 0 else 0

            bench_ret_ann = float(aligned["bench"].mean() * factor)
            bench_vol_ann = float(aligned["bench"].std() * np.sqrt(factor))

            cov_mtx = np.cov(aligned["ticker"], aligned["bench"]) * factor
            beta = float(cov_mtx[0, 1] / cov_mtx[1, 1]) if cov_mtx[1, 1] > 0 else 0
            alpha = ret_ann - beta * bench_ret_ann

            corr = float(aligned["ticker"].corr(aligned["bench"]))

            # Cumulative returns for chart
            cum_ret_ticker = (1 + aligned["ticker"]).cumprod().values.tolist()
            cum_ret_bench  = (1 + aligned["bench"]).cumprod().values.tolist()
            dates = aligned.index.strftime("%Y-%m-%d").tolist()

            results.append({
                "ticker": t,
                "retorno": round(ret_ann, DECIMALS),
                "volatilidad": round(vol_ann, DECIMALS),
                "sharpe": round(sharpe, DECIMALS),
                "alpha": round(alpha, DECIMALS),
                "beta": round(beta, 3),
                "correlacion": round(corr, 3),
                "r_squared": round(corr * corr, 3),
                "bench_retorno": round(bench_ret_ann, DECIMALS),
                "error": None,
            })
            cumulative_data[t] = {
                "dates": dates,
                "ticker_cum": [round(v, 6) for v in cum_ret_ticker],
                "bench_cum": [round(v, 6) for v in cum_ret_bench],
            }

        if not results and not excluded:
            return jsonify({"error": "Datos insuficientes para comparar"}), 400

        # Correlation matrix among selected tickers
        corr_tickers = valid_tickers
        corr_vals = returns_df[corr_tickers].corr().round(3).values.tolist() if len(corr_tickers) >= 2 else [[1.0]]

        # Best performer
        best = max(results, key=lambda r: r["sharpe"])

        return jsonify({
            "tickers": valid_tickers,
            "benchmark": benchmark,
            "benchmark_name": benchmark_name,
            "start_date": start_date,
            "resultados": results,
            "excluidos": excluded,
            "correlacion_entre_tickers": corr_tickers,
            "correlacion_matriz": corr_vals,
            "cumulative": cumulative_data,
            "mejor": best,
        })

    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "detail": traceback.format_exc()}), 500


@app.route("/api/news/infobae")
def api_news_infobae():
    query = request.args.get("q", "").strip()
    count = min(request.args.get("count", 5, type=int), 10)
    if not query:
        return jsonify({"error": "Falta query"}), 400
    try:
        from urllib.parse import quote
        rss_url = f"https://news.google.com/rss/search?q={quote(query)}+site:infobae.com&hl=es-419&gl=AR&ceid=AR:es-419"
        r = requests.get(rss_url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
        if not r.ok:
            return jsonify({"news": []})
        import xml.etree.ElementTree as ET
        root = ET.fromstring(r.content)
        news = []
        for item in root.findall(".//item")[:count]:
            title = item.findtext("title", "")
            link = item.findtext("link", "")
            pub_date = item.findtext("pubDate", "")
            if title and len(title) > 10:
                news.append({"title": title, "link": link, "source": "Infobae", "date": pub_date[:10] if pub_date else ""})
        return jsonify({"news": news, "total": len(news), "query": query})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/intermarket-analysis")
def api_intermarket_analysis():
    """Endpoint de análisis intermarket contra la FACTORS_MASTER_LIST (yfinance)."""
    ticker = request.args.get("ticker", "SPY").strip().upper()
    period = request.args.get("period", "1y").strip()
    try:
        data = intermarket_analysis(ticker, period)
        return jsonify(data)
    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "detail": traceback.format_exc()}), 500

# ─── Sector Analysis Endpoints ─────────────────────────────────────────────

SECTOR_ETF_MAP = {
    "Technology": "XLK",
    "Healthcare": "XLV",
    "Financial Services": "XLF",
    "Energy": "XLE",
    "Consumer Defensive": "XLP",
    "Consumer Cyclical": "XLY",
    "Industrials": "XLI",
    "Basic Materials": "XLB",
    "Utilities": "XLU",
    "Communication Services": "XLC",
    "Real Estate": "XLRE",
}

_SECTOR_CACHE: dict = {}
_SECTOR_CACHE_TTL = 600  # 10 min

def _sector_cache_get(key: str):
    entry = _SECTOR_CACHE.get(key)
    if entry and (datetime.now() - entry["ts"]).total_seconds() < _SECTOR_CACHE_TTL:
        return entry["data"]
    return None

def _sector_cache_set(key: str, data):
    _SECTOR_CACHE[key] = {"data": data, "ts": datetime.now()}

def fetch_sector_fundamentals(ticker_list: list[str], period="1y"):
    """Descarga fundamentos básicos para una lista de tickers desde yfinance."""
    result = {}
    for t in ticker_list:
        try:
            stock = yf.Ticker(t)
            info = stock.info or {}
            hist = stock.history(period=period, auto_adjust=True, progress=False)
            price = float(hist["Close"].iloc[-1]) if not hist.empty else None
            result[t] = {
                "price": price,
                "marketCap": info.get("marketCap"),
                "trailingPE": info.get("trailingPE"),
                "forwardPE": info.get("forwardPE"),
                "priceToBook": info.get("priceToBook"),
                "pegRatio": info.get("pegRatio"),
                "returnOnEquity": info.get("returnOnEquity"),
                "returnOnAssets": info.get("returnOnAssets"),
                "profitMargin": info.get("profitMargin"),
                "operatingMargin": info.get("operatingMargin"),
                "revenueGrowth": info.get("revenueGrowth"),
                "earningsGrowth": info.get("earningsGrowth"),
                "debtToEquity": info.get("debtToEquity"),
                "freeCashflow": info.get("freeCashflow"),
                "dividendYield": info.get("dividendYield"),
                "totalAssets": info.get("totalAssets"),
                "totalDebt": info.get("totalDebt"),
                "totalRevenue": info.get("totalRevenue"),
                "netIncome": info.get("netIncome"),
                "operatingCashflow": info.get("operatingCashflow"),
                "currentRatio": info.get("currentRatio"),
                "ebitda": info.get("ebitda"),
                "sector": info.get("sector"),
                "industry": info.get("industry"),
                "longName": info.get("longName"),
            }
        except:
            result[t] = {"error": f"No data for {t}"}
    return result

def compute_sector_percentiles(fundamentals: dict, metric="trailingPE"):
    """Calcula percentiles de una métrica dentro de un grupo de tickers."""
    values = [f[metric] for f in fundamentals.values() if isinstance(f, dict) and f.get(metric) and f[metric] > 0]
    if len(values) < 3:
        return {}
    sorted_vals = sorted(values)
    n = len(sorted_vals)
    result = {}
    for ticker, f in fundamentals.items():
        if not isinstance(f, dict) or not f.get(metric) or f[metric] <= 0:
            result[ticker] = None
            continue
        val = f[metric]
        below = sum(1 for v in sorted_vals if v <= val)
        pct = (below / n) * 100
        result[ticker] = round(pct, 1)
    return result

def compute_wacc_sectorial(fundamentals: dict, risk_free_rate=0.045, market_premium=0.055):
    """
    Calcula WACC estimado por ticker y promedia por sector.
    WACC = (E/V) * Re + (D/V) * Rd * (1 - t)
    Re = rf + beta * mp (CAPM simplificado)
    """
    results = {}
    for ticker, f in fundamentals.items():
        if not isinstance(f, dict) or f.get("error"):
            continue
        total_debt = f.get("totalDebt") or 0
        total_assets = f.get("totalAssets")
        mcap = f.get("marketCap")
        total_revenue = f.get("totalRevenue")
        net_income = f.get("netIncome")
        ebitda = f.get("ebitda")

        if not total_assets or total_assets <= 0:
            continue

        equity = total_assets - total_debt if total_debt else total_assets
        ev = mcap + total_debt if mcap and total_debt else (total_assets if total_assets > 0 else None)
        if not ev or ev <= 0:
            ev = mcap or total_assets
        if not ev or ev <= 0:
            continue

        # Beta proxy: si no hay beta real, usar 1.0
        beta = 1.0
        # Cost of equity
        re = risk_free_rate + beta * market_premium
        # Cost of debt (proxy: rf + 2% spread)
        rd = risk_free_rate + 0.02
        # Tax rate proxy: 25%
        tax = 0.25

        e_ratio = equity / ev if ev > 0 else 1.0
        d_ratio = total_debt / ev if ev > 0 else 0.0

        wacc = e_ratio * re + d_ratio * rd * (1 - tax)

        roa = net_income / total_assets if net_income and total_assets else 0

        results[ticker] = {
            "wacc": round(wacc, 4),
            "costOfEquity": round(re, 4),
            "costOfDebt": round(rd, 4),
            "equityRatio": round(e_ratio, 4),
            "debtRatio": round(d_ratio, 4),
            "roa": round(roa, 4),
            "spread": round(roa - wacc, 4) if roa and wacc else None,
            "equity": round(equity, 2),
            "totalDebt": round(total_debt, 2),
        }
    return results

def compute_solvency_metrics(fundamentals: dict):
    """Patrimonio Neto / Activo Total por ticker (Amat)."""
    results = {}
    ratios = []
    for ticker, f in fundamentals.items():
        if not isinstance(f, dict) or f.get("error"):
            continue
        ta = f.get("totalAssets")
        td = f.get("totalDebt")
        if not ta or ta <= 0:
            continue
        equity = ta - td if td else ta
        solvency = equity / ta
        debt_ratio = td / ta if td else 0
        net_income = f.get("netIncome") or 0
        roe = net_income / equity if equity > 0 and net_income else 0

        results[ticker] = {
            "solvencyRatio": round(solvency, 4),
            "debtToAssets": round(debt_ratio, 4),
            "equity": round(equity, 2),
            "totalAssets": round(ta, 2),
            "roe": round(roe, 4),
            "healthy": solvency >= 0.4,
        }
        if solvency > 0:
            ratios.append(solvency)

    avg = round(float(np.mean(ratios)), 4) if ratios else None
    return {"tickers": results, "averageSolvency": avg, "totalTickers": len(results)}

@app.route("/api/sector/valuation", methods=["GET"])
def api_sector_valuation():
    """Valuación sectorial: PE, percentiles, WACC, solvencia por sector."""
    sector = request.args.get("sector", "").strip()
    period = request.args.get("period", "1y").strip()
    if not sector:
        return jsonify({"error": "Falta sector"}), 400

    cache_key = f"valuation_{sector}_{period}"
    cached = _sector_cache_get(cache_key)
    if cached:
        return jsonify(cached)

    etf = SECTOR_ETF_MAP.get(sector)
    if not etf:
        return jsonify({"error": f"Sector {sector} no reconocido"}), 400

    try:
        # Obtener componentes del ETF sectorial desde yfinance
        etf_ticker = yf.Ticker(etf)
        etf_info = etf_ticker.info or {}
        holdings = etf_info.get("holdings", []) or etf_info.get("topHoldings", []) or etf_info.get("components", [])

        if not holdings:
            holdings_data = etf_ticker.history(period="1d")
            # intentar obtener holdings desde info
            for key in ["holdings", "topHoldings", "components", "holdingsList"]:
                h = etf_info.get(key, [])
                if h:
                    holdings = h
                    break

        # Si no hay holdings, usar lista predefinida del sector
        if not holdings or len(holdings) < 5:
            sector_tickers = {
                "XLK": ["AAPL", "MSFT", "NVDA", "AVGO", "CRM", "ADBE", "CSCO", "ACN", "INTC", "AMD", "IBM", "NOW", "QCOM", "TXN", "AMAT", "ADI", "MU", "FIS", "FISV", "ADP"],
                "XLV": ["UNH", "JNJ", "PFE", "ABBV", "MRK", "TMO", "ABT", "BMY", "DHR", "LLY", "AMGN", "MDT", "SYK", "BSX", "ISRG", "GILD", "REGN", "VRTX", "HUM", "CI"],
                "XLF": ["JPM", "BAC", "WFC", "C", "GS", "MS", "AXP", "V", "MA", "BLK", "SCHW", "SPGI", "CB", "MMC", "BK", "PNC", "USB", "COF", "TROW", "MET"],
                "XLE": ["XOM", "CVX", "COP", "EOG", "SLB", "PXD", "OXY", "MPC", "VLO", "PSX", "HAL", "WMB", "HES", "DVN", "OKE", "KMI", "MRO", "FANG", "CTRA", "APA"],
                "XLP": ["PG", "KO", "PEP", "WMT", "COST", "MO", "PM", "CL", "KMB", "MDLZ", "SYY", "GIS", "ADM", "CAG", "KHC", "CPB", "CLX", "HRL", "K", "SJM"],
                "XLY": ["AMZN", "TSLA", "HD", "MCD", "NKE", "SBUX", "LOW", "BKNG", "TJX", "MAR", "GM", "F", "ROST", "DHI", "LEN", "HLT", "AZO", "ORLY", "EBAY", "YUM"],
                "XLI": ["UPS", "HON", "UNP", "CAT", "BA", "GE", "RTX", "MMM", "CSX", "NSC", "DE", "LMT", "ITW", "EMR", "NXPI", "GD", "CARR", "OTIS", "ETN", "PH"],
                "XLB": ["LIN", "SHW", "APD", "ECL", "NEM", "FCX", "DOW", "DD", "BLL", "PPG", "NUE", "DAL", "CTVA", "FMC", "EMN", "IP", "ALB", "CE", "CF", "IFF"],
                "XLU": ["NEE", "DUK", "SO", "D", "AEP", "SRE", "EXC", "XEL", "PEG", "ED", "WEC", "AWK", "ES", "DTE", "AEE", "PPL", "CMS", "CNP", "EIX", "ATO"],
                "XLC": ["META", "GOOGL", "GOOG", "NFLX", "DIS", "CMCSA", "VZ", "T", "CHTR", "TMUS", "EA", "TTWO", "DISH", "FOXA", "FOX", "WBD", "PARA", "OMC", "IPG", "TME"],
                "XLRE": ["PLD", "AMT", "CCI", "EQIX", "SPG", "PSA", "WELL", "DLR", "O", "AVB", "EQR", "ELS", "HST", "ARE", "MAA", "ESS", "UDR", "VICI", "IRM", "INVH"],
            }
            holdings = sector_tickers.get(etf, [])

        holdings = holdings[:20]  # top 20
        ticker_list = [h if isinstance(h, str) else h.get("symbol", "") for h in holdings]
        ticker_list = [t for t in ticker_list if t and t != ""]

        # Fetch fundamentals
        fundamentals = fetch_sector_fundamentals(ticker_list, period)

        # Compute percentiles
        pe_percentiles = compute_sector_percentiles(fundamentals, "trailingPE")
        pb_percentiles = compute_sector_percentiles(fundamentals, "priceToBook")

        # WACC
        wacc_data = compute_wacc_sectorial(fundamentals)

        # Solvencia
        solvency_data = compute_solvency_metrics(fundamentals)

        # Aggregate sector stats
        pe_values = [f["trailingPE"] for f in fundamentals.values() if isinstance(f, dict) and f.get("trailingPE") and f["trailingPE"] > 0]
        pb_values = [f["priceToBook"] for f in fundamentals.values() if isinstance(f, dict) and f.get("priceToBook") and f["priceToBook"] > 0]
        mcap_values = [f["marketCap"] for f in fundamentals.values() if isinstance(f, dict) and f.get("marketCap")]

        avg_pe = round(float(np.mean(pe_values)), 2) if pe_values else None
        avg_pb = round(float(np.mean(pb_values)), 2) if pb_values else None
        total_mcap = round(sum(mcap_values), 2) if mcap_values else None

        # Solvencia promedio del sector
        avg_solvency = solvency_data.get("averageSolvency")

        # WACC promedio del sector
        wacc_values = [v["wacc"] for v in wacc_data.values() if isinstance(v, dict) and v.get("wacc")]
        avg_wacc = round(float(np.mean(wacc_values)), 4) if wacc_values else None

        healthy_count = sum(1 for v in solvency_data.get("tickers", {}).values() if isinstance(v, dict) and v.get("healthy"))

        result = {
            "sector": sector,
            "etf": etf,
            "period": period,
            "timestamp": datetime.now().isoformat(),
            "tickerCount": len(ticker_list),
            "metrics": {
                "avgTrailingPE": avg_pe,
                "avgPriceToBook": avg_pb,
                "totalMarketCap": total_mcap,
            },
            "solvency": {
                "averageSolvency": avg_solvency,
                "healthyCount": healthy_count,
                "totalTickers": solvency_data.get("totalTickers", 0),
                "fragileSector": avg_solvency < 0.4 if avg_solvency else None,
            },
            "wacc": {
                "averageWacc": avg_wacc,
                "averageSpread": None,
            },
            "percentiles": {
                "pe": pe_percentiles,
                "pb": pb_percentiles,
            },
            "tickers": {},
        }

        # Merge ticker-level data
        for t in ticker_list:
            f = fundamentals.get(t, {})
            w = wacc_data.get(t, {})
            s = solvency_data.get("tickers", {}).get(t, {})
            result["tickers"][t] = {
                "price": f.get("price"),
                "marketCap": f.get("marketCap"),
                "trailingPE": f.get("trailingPE"),
                "forwardPE": f.get("forwardPE"),
                "priceToBook": f.get("priceToBook"),
                "dividendYield": f.get("dividendYield"),
                "pePercentile": pe_percentiles.get(t),
                "pbPercentile": pb_percentiles.get(t),
                "solvency": s.get("solvencyRatio"),
                "healthy": s.get("healthy"),
                "wacc": w.get("wacc"),
                "roa": w.get("roa"),
                "spread": w.get("spread"),
            }

        # Compute average spread
        spreads = [t.get("spread") for t in result["tickers"].values() if t.get("spread") is not None]
        if spreads:
            result["wacc"]["averageSpread"] = round(float(np.mean(spreads)), 4)

        _sector_cache_set(cache_key, result)
        return jsonify(result)

    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "detail": traceback.format_exc()}), 500


@app.route("/api/sector/performance", methods=["GET"])
def api_sector_performance():
    """Performance sectorial unificada con parámetro period (1d, 5d, 1mo, 3mo, 6mo, 1y, 2y)."""
    period = request.args.get("period", "5d").strip()
    period_map = {"1d": "5d", "5d": "5d", "1mo": "1mo", "3mo": "3mo", "6mo": "6mo", "1y": "1y", "2y": "2y"}
    yf_period = period_map.get(period, "5d")

    cache_key = f"perf_{period}"
    cached = _sector_cache_get(cache_key)
    if cached:
        return jsonify(cached)

    results = []
    for sector, etf in SECTOR_ETF_MAP.items():
        try:
            data = yf.download(etf, period=yf_period, auto_adjust=True, progress=False)
            if data.empty:
                continue
            if isinstance(data.columns, pd.MultiIndex):
                closes = data["Close"].iloc[:, 0]
            else:
                closes = data["Close"] if "Close" in data.columns else data.iloc[:, 0]
            closes = closes.dropna()
            if len(closes) < 2:
                continue
            first = float(closes.iloc[0])
            last = float(closes.iloc[-1])
            change_pct = round(((last - first) / first) * 100, 2) if first > 0 else None
            # Calcular score basado en tendencia
            if len(closes) >= 5:
                sma5 = closes.rolling(5).mean().iloc[-1]
                trend_score = 1 if last > sma5 else -1
            else:
                trend_score = 0
            results.append({
                "sector": sector,
                "etf": etf,
                "period": period,
                "changePercent": change_pct,
                "trendScore": trend_score,
                "currentPrice": round(last, 2),
            })
        except:
            continue

    results.sort(key=lambda x: x["changePercent"] or 0, reverse=True)
    output = {"items": results, "period": period, "timestamp": datetime.now().isoformat()}
    _sector_cache_set(cache_key, output)
    return jsonify(output)


@app.route("/api/intermarket/cycle")
def api_intermarket_cycle():
    """Detecta etapa del ciclo económico (Pring/Stovall 6-stage) basado en ratios intermarket."""
    try:
        tickers = ["DBC", "TLT", "SPY", "DIA", "GLD", "XLP", "XLY"]
        prices = download_prices(tickers, start=(datetime.now() - timedelta(days=500)).strftime("%Y-%m-%d"))
        if prices.empty:
            return jsonify({"error": "No se pudieron obtener precios"}), 503

        ratios = {}
        for a, b, key in [
            ("DBC", "TLT", "CRB_BOND"),
            ("TLT", "SPY", "BOND_SPX"),
            ("DIA", "GLD", "DOW_GOLD"),
            ("XLP", "XLY", "CONS_CYCL"),
        ]:
            if a in prices.columns and b in prices.columns:
                r = prices[a] / prices[b]
                ratio_val = float(r.iloc[-1]) if not r.empty else None
                ma200 = float(r.rolling(200).mean().iloc[-1]) if len(r) >= 200 else None
                slope = ((ma200 / r.rolling(200).mean().iloc[-201]) - 1) if len(r) >= 201 and ma200 else None
                trend = "bullish" if slope and slope > 0.005 else "bearish" if slope and slope < -0.005 else "neutral"
                ratios[key] = {"ratio": ratio_val, "ma200": ma200, "slope": slope, "trend": trend}

        # Detectar etapa del ciclo (orden: casos más específicos primero)
        # NOTA: usamos las tendencias ABSOLUTAS de DBC (commodities), SPY (stocks),
        # TLT (bonds) y GLD (gold) — NO los ratios intermarket.
        def compute_asset_trend(col):
            if col not in prices.columns or prices[col].dropna().empty:
                return "neutral"
            s = prices[col].dropna()
            ma200 = s.rolling(200).mean()
            if len(ma200.dropna()) < 200:
                return "neutral"
            now = ma200.iloc[-1]
            before = ma200.iloc[-201]
            slope = (now / before) - 1 if before > 0 else 0
            return "bullish" if slope > 0.005 else "bearish" if slope < -0.005 else "neutral"

        crb = compute_asset_trend("DBC")
        bond = compute_asset_trend("TLT")
        spx = compute_asset_trend("SPY")
        gold = compute_asset_trend("GLD")

        # Pring 6-Stage: Bonds → Stocks → Commodities
        # Stage 1: Recuperación — bonos lideran, acciones y commods aún débiles
        if bond == "bullish" and spx != "bullish" and crb != "bullish":
            stage, label, cat = 1, "Recuperación Inicial", "recovery"
            activos = ["TLT (Bonos largos)", "SPY (S&P 500 gradual)"]
            sectores = ["XLK (Tecnología)", "XLY (Consumo Discrecional)", "XLF (Financieras)"]
            riesgos = ["Salir muy temprano", "No reconocer el cambio de régimen"]
        # Stage 2: Expansión temprana — acciones rally, bonos estables, commods despiertan
        elif spx == "bullish" and gold != "bearish" and crb != "bearish":
            stage, label, cat = 2, "Expansión Temprana", "expansion"
            activos = ["SPY", "QQQ", "IWM (Small Caps)"]
            sectores = ["XLI (Industriales)", "XLB (Materiales)", "XLK (Tecnología)"]
            riesgos = ["Subestimar inflación rezagada", "Sobreponderar defensivos"]
        # Stage 3: Expansión tardía inflacionaria — commods fuertes, bonos caen
        elif crb == "bullish" and bond == "bearish" and spx == "bullish":
            stage, label, cat = 3, "Expansión Tardía (Inflacionaria)", "expansion"
            activos = ["DBC (Commodities)", "XLE (Energía)", "GLD (Oro)"]
            sectores = ["XLE (Energía)", "XLB (Materiales)", "XLV (Healthcare)"]
            riesgos = ["Inflación fuera de control", "Fin de ciclo alcista"]
        # Stage 4: Pico — oro lidera, commods no caen
        elif gold == "bullish" and spx != "bullish" and crb != "bearish":
            stage, label, cat = 4, "Pico / Euforia", "peak"
            activos = ["GLD (Oro)", "SLV (Plata)", "Cash"]
            sectores = ["XLU (Utilities)", "XLP (Consumo Básico)", "XLV (Healthcare)"]
            riesgos = ["Máximos de mercado", "Corrección inminente"]
        # Stage 5: Contracción — flight to bonds
        elif bond == "bullish" and spx == "bearish" and crb != "bullish":
            stage, label, cat = 5, "Contracción / Flight-to-Quality", "contraction"
            activos = ["TLT (Bonos)", "GLD (Oro)", "XLP (Defensivos)"]
            sectores = ["XLP (Cons. Básico)", "XLU (Utilities)", "XLV (Healthcare)"]
            riesgos = ["Vender en pánico", "Perder el rebote"]
        # Stage 6: Recesión plena — todo cae
        elif spx == "bearish" and crb == "bearish" and gold != "bullish":
            stage, label, cat = 6, "Recesión Plena", "recession"
            activos = ["Cash", "GLD (Oro)", "SHY (Corto plazo)"]
            sectores = ["Ninguno — preservación de capital"]
            riesgos = ["Quedarse fuera del rebound"]
        # Default: Stage 2 (asumir expansión)
        else:
            stage, label, cat = 2, "Expansión Temprana", "expansion"
            activos = ["SPY", "QQQ"]
            sectores = ["Tecnología (XLK)", "Industriales (XLI)"]
            riesgos = ["Falsas señales", "Cambio abrupto de régimen"]

        return jsonify({
            "stage": stage,
            "label": label,
            "categoria": cat,
            "ratios": ratios,
            "activosFavorecidos": activos,
            "sectoresFavorecidos": sectores,
            "riesgos": riesgos,
            "generatedAt": datetime.now().isoformat(),
        })
    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "detail": traceback.format_exc()}), 500


# ─── Earth2Studio: Pronóstico Climático Determinista ─────────────────────────
try:
    from server.earth2_service import (
        run_forecast, analyze_financial_impact,
        get_available_models, FINANCIAL_HOTSPOTS, FINANCIAL_WEATHER_IMPACT,
        EARTH2_AVAILABLE,
    )
    EARTH2_LOADED = True
except ImportError:
    EARTH2_LOADED = False
    EARTH2_AVAILABLE = False


# ─── Opciones IOL + Predicción ML (reciclado de PROTOTIPO) ───────────────────
try:
    from server.iol_service import (
        autenticar, obtener_tasas_caucion, obtener_opciones,
    )
    from server.opciones_service import (
        black_scholes, binomial_pricing, procesar_cadena_opciones,
        calcular_sesgo, calcular_volatilidad_historica_serie,
        calcular_volatilidad_dinamica,
    )
    from server.prediccion_service import ejecutar_prediccion
    OPCIONES_LOADED = True
except ImportError:
    OPCIONES_LOADED = False




# ─── Contexto Macro API ───────────────────────────────────────────────────────

# Cache en memoria de 30 minutos
_macro_context_cache = None
_macro_context_ts = None
CACHE_TTL = 30 * 60  # 30 minutes

def _obtener_macro_context_servidor():
    """Obtiene el contexto macro con cache de 30 minutos."""
    global _macro_context_cache, _macro_context_ts
    
    ahora = datetime.now()
    if (_macro_context_cache is not None and 
        _macro_context_ts is not None and
        (ahora - _macro_context_ts).total_seconds() < CACHE_TTL):
        return _macro_context_cache
    
    ctx = get_macro_context()
    _macro_context_cache = ctx
    _macro_context_ts = ahora
    return ctx

@app.route("/api/macro-context")
def api_macro_context():
    """Endpoint de contexto macro con contrato fijo.
    
    Returns:
        - riesgoPais: valor actual, fecha, variación mensual
        - inflacion: mensual, interanual, fecha
        - dolares: oficial, blue, MEP, CCL con compra/venta
        - tasas: badlar, plazoFijo30d
        - timestamp: ISO 8601
    """
    try:
        datos = _obtener_macro_context_servidor()
        # Formatear según el contrato especificado
        resultado = {
            "riesgoPais": {
                "valor": datos.get("riesgo_pais"),
                "fecha": None,
                "variacionMensual": None,
            },
            "inflacion": {
                "mensual": None,
                "interanual": None,
                "fecha": None,
            },
            "dolares": {
                "oficial": datos.get("dolar_oficial"),
                "blue": datos.get("dolar_blue"),
                "mep": datos.get("dolar_mep"),
                "ccl": datos.get("dolar_ccl"),
            },
            "tasas": {
                "badlar": None,
                "plazoFijo30d": None,
            },
            "timestamp": datos.get("timestamp"),
        }
        return jsonify(resultado), 200
    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "detail": traceback.format_exc()}), 500
@app.route("/api/earth2/status")
def earth2_status():
    return jsonify({
        "earth2_available": EARTH2_AVAILABLE,
        "service_loaded": EARTH2_LOADED,
        "simulation_mode": not EARTH2_AVAILABLE,
        "note": "Sin CUDA GPU se usan datos simulados para demostración",
    })


@app.route("/api/earth2/models")
def earth2_models():
    if not EARTH2_LOADED:
        return jsonify({
            "available": False,
            "note": "Earth2Studio no instalado",
        })
    return jsonify({
        "available": EARTH2_AVAILABLE,
        "models": get_available_models(),
        "hotspots": FINANCIAL_HOTSPOTS,
        "variables": {
            k: {"label": v["label"], "unit": v["unit"], "impact": v["impact"]}
            for k, v in FINANCIAL_WEATHER_IMPACT.items()
        },
    })


@app.route("/api/earth2/forecast", methods=["POST"])
def earth2_forecast():
    try:
        body = request.get_json(force=True) or {}
        model_id = body.get("model", "pangu")
        variables = body.get("variables", ["t2m", "u10m", "v10m", "msl"])
        forecast_hours = body.get("forecast_hours", 120)
        init_time = body.get("init_time")
        hotspot = body.get("hotspot")

        # Validar
        if forecast_hours < 6 or forecast_hours > 240:
            return jsonify({"error": "forecast_hours debe estar entre 6 y 240"}), 400

        forecast = run_forecast(
            model_id=model_id,
            variables=variables,
            forecast_hours=forecast_hours,
            init_time=init_time,
            hotspot=hotspot,
        )

        if "error" in forecast:
            return jsonify(forecast), 500

        analysis = analyze_financial_impact(forecast, hotspot=hotspot)

        return jsonify({
            "forecast": forecast,
            "analysis": analysis,
            "earth2_available": EARTH2_AVAILABLE,
        })

    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "detail": traceback.format_exc()}), 500


@app.route("/api/earth2/analyze-hotsplot", methods=["POST"])
def earth2_analyze_hotspot():
    """Analiza el hotspot financiero sin ejecutar forecast completo."""
    try:
        body = request.get_json(force=True) or {}
        hotspot = body.get("hotspot", "argentina")
        point = FINANCIAL_HOTSPOTS.get(hotspot, FINANCIAL_HOTSPOTS["argentina"])
        return jsonify({
            "hotspot": hotspot,
            "point": point,
            "sectors_affected": ["agro", "energia", "seguros"],
            "description": f"Análisis climático para {point['label']} — coord ({point['lat']}, {point['lon']})",
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── Opciones IOL + Predicción ML API ────────────────────────────────────────

def _datos_subyacente(simbolo, periodo="1y"):
    """Spot + volatilidades desde yfinance (reciclado de obtener_datos_subyacente)."""
    ticker = yf.Ticker(f"{simbolo}.BA")
    hist = ticker.history(period=periodo)
    if hist.empty or len(hist) < 60:
        return None, None, None, None
    if isinstance(hist.columns, pd.MultiIndex):
        hist.columns = [c[0] for c in hist.columns]
    hist = calcular_volatilidad_historica_serie(hist)
    hist = calcular_volatilidad_dinamica(hist)
    spot = float(hist["Close"].iloc[-1])
    vol_h = float(hist["VolatilidadHistorica"].iloc[-1])
    vol_d = float(hist["VolatilidadDinamica"].iloc[-1])
    if vol_h > 1.0:
        vol_h = min(vol_h, 0.5)
    if abs(vol_h - vol_d) / max(vol_h, vol_d) > 0.5:
        vol_h = vol_d = (vol_h + vol_d) / 2
    return spot, vol_h, vol_d, hist


@app.route("/api/iol/status")
def iol_status():
    if not OPCIONES_LOADED:
        return jsonify({"available": False, "note": "servicios de opciones no cargados"})
    token = autenticar()
    if not token:
        return jsonify({"available": False, "autenticado": False})
    tasa = obtener_tasas_caucion(token)
    return jsonify({"available": True, "autenticado": True, "tasa_caucion": tasa})


@app.route("/api/opciones/precio", methods=["POST"])
def opciones_precio():
    """Pricing puntual: BS + griegas y binomial opcional."""
    try:
        body = request.get_json(force=True) or {}
        tipo = body.get("tipo", "Call")
        S = float(body["S"]); K = float(body["K"])
        T = float(body["T"]); r = float(body.get("r", 0.05))
        sigma = float(body["sigma"]); q = float(body.get("q", 0))
        bs = black_scholes(tipo, S, K, T, r, sigma, q)
        resultado = {
            "BlackScholes": bs[0], "Delta": bs[1], "Gamma": bs[2],
            "Vega": bs[3], "Theta_diario": bs[4], "Rho": bs[5], "Prob_ITM": bs[6],
        }
        if body.get("binomial", False):
            resultado["Binomial"] = binomial_pricing(
                tipo, S, K, T, r, sigma,
                N=int(body.get("pasos", 100)), q=q, americana=bool(body.get("americana", False)))
        return jsonify(resultado)
    except KeyError as e:
        return jsonify({"error": f"falta parámetro {e}"}), 400
    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "detail": traceback.format_exc()}), 500


@app.route("/api/opciones/cadena", methods=["POST"])
def opciones_cadena():
    """Cadena completa de opciones BCBA: IV, griegas, VaR y sesgo por vencimiento."""
    try:
        body = request.get_json(force=True) or {}
        simbolo = str(body.get("simbolo", "GGAL")).upper()
        if not OPCIONES_LOADED:
            return jsonify({"error": "servicios de opciones no disponibles"}), 503
        token = autenticar()
        tasa_riesgo = obtener_tasas_caucion(token) if token else 0.05
        spot, vol_h, vol_d, hist = _datos_subyacente(simbolo)
        if not spot:
            return jsonify({"error": f"sin datos del subyacente {simbolo}.BA"}), 404
        df_api = obtener_opciones(token, simbolo=simbolo) if token else pd.DataFrame()
        sesgo = None
        cadena = []
        if not df_api.empty:
            df_proc = procesar_cadena_opciones(
                df_api, spot, vol_h, vol_d, 0.0,
                tasa_riesgo=tasa_riesgo, pasos_binomial=int(body.get("pasos", 100)))
            if not df_proc.empty:
                sesgo = calcular_sesgo(df_proc, spot)
                cols = ["simbolo", "tipoOpcion", "strike", "fechaVencimiento", "T",
                        "precioOpcion", "bid", "ask", "Moneyness",
                        "volatilidadImplicita", "BlackScholes", "Delta", "Gamma",
                        "Vega", "Theta", "Rho", "Prob_ITM", "Prob_OTM", "VaR", "Binomial"]
                cols = [c for c in cols if c in df_proc.columns]
                cadena = df_proc[cols].replace({np.nan: None}).to_dict(orient="records")
        return jsonify({
            "simbolo": simbolo,
            "spot": round(spot, 2),
            "volatilidad_historica": round(vol_h, 4),
            "volatilidad_dinamica": round(vol_d, 4),
            "tasa_riesgo": tasa_riesgo,
            "iol_autenticado": bool(token),
            "sesgo_volatilidad": round(sesgo, 2) if sesgo is not None else None,
            "opciones": cadena,
            "total": len(cadena),
        })
    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "detail": traceback.format_exc()}), 500


@app.route("/api/prediccion", methods=["POST"])
def api_prediccion():
    """Pipeline ML completo: Logistic/Ridge/NN + walk-forward + señal de opciones."""
    try:
        body = request.get_json(force=True) or {}
        simbolo = str(body.get("simbolo", "GGAL")).upper()
        horizonte = int(body.get("horizonte", 5))
        if not OPCIONES_LOADED:
            return jsonify({"error": "servicios de predicción no disponibles"}), 503
        _, _, _, hist = _datos_subyacente(simbolo)
        if hist is None:
            return jsonify({"error": f"sin datos del subyacente {simbolo}.BA"}), 404
        spot = float(hist["Close"].iloc[-1])
        resultado = ejecutar_prediccion(hist, spot, horizonte=horizonte)
        if "error" in resultado:
            return jsonify(resultado), 400
        resultado["simbolo"] = simbolo
        resultado["spot"] = round(spot, 2)
        return jsonify(resultado)
    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "detail": traceback.format_exc()}), 500


@app.route("/health")
def health():
    return jsonify({"status": "ok", "version": "1.0"})

if __name__ == "__main__":
    print("\n" + "="*60)
    print("  Portfolio Optimizer API")
    print("  http://localhost:5000")
    print("  Abre index.html en tu navegador")
    print("="*60 + "\n")
    app.run(debug=False, port=5000, host="0.0.0.0")
