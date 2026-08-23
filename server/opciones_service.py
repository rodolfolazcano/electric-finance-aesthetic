# -*- coding: utf-8 -*-
"""
Pricing de opciones — reciclado de calculadora_opciones.py (PROTOTIPO).
Black-Scholes + griegas, binomial (europea/americana), volatilidad implícita,
volatilidad histórica/dinámica (EWMA), VaR delta-gamma y sesgo de volatilidad.
Funciones puras: sin IOL, sin gráficos, sin side-effects.
"""

import math
import numpy as np
import pandas as pd
from scipy.stats import norm

try:
    import pandas_market_calendars as mcal
    HAS_MCAL = True
except ImportError:
    HAS_MCAL = False


def procesar_monto(valor):
    """Convierte montos con formato AR ('1.234,56') a float."""
    try:
        return float(valor.replace(".", "").replace(",", ".")) if isinstance(valor, str) else float(valor)
    except (ValueError, TypeError):
        return 0.0


def ajustar_precio_por_dividendos(S, dividendos, fecha_vencimiento, tasa_riesgo=0.05):
    now = pd.Timestamp.now(tz="UTC")
    ajuste = 0
    for fecha_pago, monto_dividendo in dividendos:
        fecha_pago = pd.to_datetime(fecha_pago).tz_localize("UTC")
        fecha_vencimiento = pd.to_datetime(fecha_vencimiento).tz_localize("UTC")
        if now < fecha_pago <= fecha_vencimiento:
            t = (fecha_pago - now).days / 365
            ajuste += monto_dividendo * math.exp(-tasa_riesgo * t)
    return S - ajuste


def black_scholes(tipo, S, K, T, r, sigma, q=0, dividendos_discretos=None, tasa_riesgo=0.05):
    """Devuelve (precio, delta, gamma, vega, theta_diario, rho, prob_ITM)."""
    if dividendos_discretos:
        S = ajustar_precio_por_dividendos(S, dividendos_discretos, T, tasa_riesgo)
    if None in [S, K, T, r, sigma] or T <= 0 or sigma <= 0:
        return (None,) * 7
    d1 = (np.log(S / K) + (r - q + 0.5 * sigma ** 2) * T) / (sigma * np.sqrt(T))
    d2 = d1 - sigma * np.sqrt(T)
    nd1 = norm.pdf(d1)
    if tipo == "Call":
        precio = S * norm.cdf(d1) - K * np.exp(-r * T) * norm.cdf(d2)
        delta, prob = norm.cdf(d1), norm.cdf(d2)
        theta = ((-S * nd1 * sigma) / (2 * np.sqrt(T)) - r * K * np.exp(-r * T) * norm.cdf(d2)) / 252
    else:
        precio = K * np.exp(-r * T) * norm.cdf(-d2) - S * norm.cdf(-d1)
        delta, prob = norm.cdf(d1) - 1, norm.cdf(-d2)
        theta = ((-S * nd1 * sigma) / (2 * np.sqrt(T)) + r * K * np.exp(-r * T) * norm.cdf(-d2)) / 252
    if tipo == "Put" and prob < 0:
        prob = 0
    gamma = nd1 / (S * sigma * np.sqrt(T))
    vega = S * nd1 * np.sqrt(T)
    rho = K * T * np.exp(-r * T) * (norm.cdf(d2) if tipo == "Call" else -norm.cdf(-d2))
    return precio, delta, gamma, vega, theta, rho, prob


def binomial_pricing(tipo, S, K, T, r, sigma, N=100, q=0, americana=False,
                     dividendos_discretos=None, tasa_riesgo=0.05):
    """CRR binomial. americana=True permite ejercicio temprano."""
    if dividendos_discretos:
        S = ajustar_precio_por_dividendos(S, dividendos_discretos, T, tasa_riesgo)
    if None in [S, K, T, r, sigma] or T <= 0 or sigma <= 0:
        return None
    dt = T / N
    u = math.exp(sigma * math.sqrt(dt))
    d = 1 / u
    p = (math.exp((r - q) * dt) - d) / (u - d)
    disc = math.exp(-r * dt)
    precios = [S * (u ** (N - i)) * (d ** i) for i in range(N + 1)]
    payoff = [max(0, precio - K) if tipo == "Call" else max(0, K - precio) for precio in precios]
    for j in range(N - 1, -1, -1):
        for i in range(j + 1):
            payoff[i] = disc * (p * payoff[i] + (1 - p) * payoff[i + 1])
            if americana:
                ejercicio = max(0, precios[i] - K) if tipo == "Call" else max(0, K - precios[i])
                payoff[i] = max(payoff[i], ejercicio)
    return payoff[0]


def calcular_volatilidad_implicita(tipo, S, K, T, r, precio_mercado, q=0,
                                   tol=1e-5, max_iter=100, volatilidad_historica=0.2):
    """IV por brentq (fallback newton por vega). None fuera de límites teóricos."""
    from scipy.optimize import brentq

    if precio_mercado <= 0 or T <= 0 or S <= 0:
        return None
    if tipo == "Call":
        lower = max(S - K * math.exp(-r * T), 0)
        upper = S
    else:
        lower = max(K * math.exp(-r * T) - S, 0)
        upper = K * math.exp(-r * T)
    if precio_mercado < lower or precio_mercado > upper:
        return None
    sigma_min = max(volatilidad_historica * 0.8, 0.20)
    sigma_max = min(volatilidad_historica * 1.5, 2.0)

    def f(sig):
        return black_scholes(tipo, S, K, T, r, sig, q)[0] - precio_mercado

    try:
        return brentq(f, sigma_min, sigma_max, xtol=tol, maxiter=max_iter)
    except ValueError:
        def vega(sig):
            d1 = (math.log(S / K) + (r - q + 0.5 * sig ** 2) * T) / (sig * math.sqrt(T))
            return S * math.sqrt(T) * norm.pdf(d1)
        try:
            from scipy.optimize import newton
            return newton(f, volatilidad_historica, fprime=vega, tol=tol, maxiter=max_iter)
        except (RuntimeError, ValueError):
            return None


def calcular_volatilidad_historica_serie(hist, ventana=30):
    """Ventana móvil anualizada sobre log-retornos → col VolatilidadHistorica."""
    hist = hist.copy()
    log_retornos = np.log(hist["Close"] / hist["Close"].shift(1))
    hist["VolatilidadHistorica"] = log_retornos.rolling(window=ventana).std() * np.sqrt(252)
    return hist


def calcular_volatilidad_dinamica(hist, lmbda=0.94, ventana_inicial=30):
    """EWMA RiskMetrics anualizada → col VolatilidadDinamica."""
    hist = hist.copy()
    log_retornos = np.log(hist["Close"] / hist["Close"].shift(1)).dropna()
    vol_squared = np.zeros(len(log_retornos))
    initial_variance = log_retornos.iloc[:ventana_inicial].var()
    vol_squared[:ventana_inicial] = initial_variance
    for t in range(ventana_inicial, len(log_retornos)):
        vol_squared[t] = lmbda * vol_squared[t - 1] + (1 - lmbda) * float(log_retornos.iloc[t - 1]) ** 2
    hist["VolatilidadDinamica"] = pd.Series(np.sqrt(vol_squared * 252), index=log_retornos.index)
    return hist


def _dias_habiles_argentinos(desde, hasta):
    """Días hábiles BCBA entre dos fechas (XBUE si hay mcal, si no Mon-Fri)."""
    if HAS_MCAL:
        calendario = mcal.get_calendar("XBUE")
        return len(calendario.valid_days(start_date=pd.Timestamp(desde), end_date=pd.Timestamp(hasta)))
    return len(pd.bdate_range(start=desde, end=hasta))


def calcular_var_opciones(df, nivel_confianza=0.95, dias=1):
    """VaR paramétrico delta-gamma por opción → col VaR."""
    if df.empty:
        return df
    df_var = df.copy()
    req = {"Delta", "Gamma", "precioSubyacente", "volatilidadImplicita"}
    if not req.issubset(df_var.columns):
        df_var["VaR"] = None
        return df_var
    z = abs(norm.ppf(1 - nivel_confianza))

    def var_fila(row):
        vals = [row.get(c) for c in req]
        if any(pd.isnull(v) for v in vals):
            return None
        S, vol = row["precioSubyacente"], row["volatilidadImplicita"]
        delta_S = S * vol * z * np.sqrt(dias / 252)
        var = -(row["Delta"] * delta_S + 0.5 * row["Gamma"] * delta_S ** 2) * S
        return max(var, -row["Delta"] * delta_S * S)

    df_var["VaR"] = df_var.apply(var_fila, axis=1)
    return df_var


def calcular_sesgo(df, precio_spot):
    """Skew de volatilidad OTM: % puts vs calls. >10 alcista, <-10 bajista."""
    if df.empty or "volatilidadImplicita" not in df.columns:
        return None
    calls_otm = df[(df["tipoOpcion"] == "Call") & (df["strike"] > precio_spot)]
    puts_otm = df[(df["tipoOpcion"] == "Put") & (df["strike"] < precio_spot)]
    if calls_otm.empty or puts_otm.empty:
        return None
    vol_calls, vol_puts = calls_otm["volatilidadImplicita"].mean(), puts_otm["volatilidadImplicita"].mean()
    if pd.isnull(vol_calls) or pd.isnull(vol_puts):
        return None
    return 100 * (vol_puts - vol_calls) / ((vol_puts + vol_calls) / 2)


def procesar_cadena_opciones(df_api, precio_spot, vol_hist, vol_dinam, tasa_dividendos,
                             tasa_riesgo=0.05, pasos_binomial=100):
    """
    Enriquece la cadena de IOL: strikes, T hábil, moneyness, IV, BS+griegias,
    binomial americana y VaR. Reciclado de procesar_dataframe().
    """
    df = df_api.copy()
    df["precioOpcion"] = df["cotizacion"].apply(
        lambda x: procesar_monto(x.get("ultimoPrecio", 0)) if isinstance(x, dict) else 0.0)
    df["volumen"] = df["cotizacion"].apply(
        lambda x: procesar_monto(x.get("volumen", 0)) if isinstance(x, dict) else 0.0)
    df["bid"] = df["cotizacion"].apply(
        lambda x: procesar_monto(x.get("bid", 0)) if isinstance(x, dict) else 0.0)
    df["ask"] = df["cotizacion"].apply(
        lambda x: procesar_monto(x.get("ask", 0)) if isinstance(x, dict) else 0.0)
    df.loc[df["bid"] == 0, "bid"] = df["precioOpcion"] * 0.95
    df.loc[df["ask"] == 0, "ask"] = df["precioOpcion"] * 1.05
    df["strike"] = df["descripcion"].str.split().str[2].str.replace(",", "", regex=False)
    df["strike"] = pd.to_numeric(df["strike"], errors="coerce")
    df["strike"] = df["strike"].apply(lambda x: x * 1000 if pd.notnull(x) and x < 10 else x)
    df = df[df["strike"].notnull() & (df["strike"] > 0)]
    df["fechaVencimiento"] = pd.to_datetime(df["fechaVencimiento"], errors="coerce").dt.date
    now = pd.Timestamp.now().normalize()
    df["T"] = df["fechaVencimiento"].apply(
        lambda x: _dias_habiles_argentinos(now, pd.Timestamp(x)) / 252
        if pd.notnull(x) and pd.Timestamp(x) > now else None)
    df = df[(df["precioOpcion"] > 0) & df["T"].notnull() & (df["T"] > 0)]
    if df.empty:
        return df
    if "precioSubyacente" not in df.columns:
        df["precioSubyacente"] = precio_spot
    if "montoOperado" not in df.columns:
        df["montoOperado"] = 0
    df["Moneyness"] = df.apply(
        lambda r: "ITM" if (r["tipoOpcion"] == "Call" and r["strike"] < r["precioSubyacente"]) or
                           (r["tipoOpcion"] == "Put" and r["strike"] > r["precioSubyacente"])
                  else "OTM", axis=1)
    df["volatilidadImplicita"] = df.apply(
        lambda r: calcular_volatilidad_implicita(
            r["tipoOpcion"], precio_spot, r["strike"], r["T"], tasa_riesgo,
            r["precioOpcion"], tasa_dividendos, volatilidad_historica=vol_dinam)
        if r["precioOpcion"] > 0 else None, axis=1)
    vol_para_calculos = df.apply(
        lambda r: r["volatilidadImplicita"] if pd.notnull(r["volatilidadImplicita"]) else vol_dinam, axis=1)
    bs = df.apply(
        lambda r: black_scholes(r["tipoOpcion"], precio_spot, r["strike"], r["T"],
                                tasa_riesgo, r["volatilidadImplicita"], tasa_dividendos)
        if pd.notnull(r["volatilidadImplicita"]) else (None,) * 7, axis=1)
    df[["BlackScholes", "Delta", "Gamma", "Vega", "Theta", "Rho", "Prob_ITM"]] = pd.DataFrame(bs.tolist(), index=df.index)
    df["Binomial"] = df.apply(
        lambda r: binomial_pricing(r["tipoOpcion"], precio_spot, r["strike"], r["T"], tasa_riesgo,
                                   vol_para_calculos[r.name], pasos_binomial, tasa_dividendos,
                                   americana=True)
        if vol_para_calculos[r.name] > 0 else None, axis=1)
    df = calcular_var_opciones(df)
    df["Prob_OTM"] = 1 - df["Prob_ITM"]
    return df
