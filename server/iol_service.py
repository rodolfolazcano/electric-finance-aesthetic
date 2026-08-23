# -*- coding: utf-8 -*-
"""
Integración API InvertirOnline (IOL) — reciclado de PROTOTIPO-CON-DATOS-EN-TIEMPO-REAL.
Autenticación bearer + refresh, tasas de caución y cadena de opciones de BCBA.
Credenciales en texto plano por decisión del propietario (repo privado).
"""

import requests
import pandas as pd

IOL_USERNAME = "boosandr97@gmail.com"
IOL_PASSWORD = "Chule348936_"

TOKEN_URL = "https://api.invertironline.com/token"


def obtener_tokens(usuario=IOL_USERNAME, password=IOL_PASSWORD):
    """Obtiene access_token y refresh_token de IOL."""
    datos = {"username": usuario, "password": password, "grant_type": "password"}
    encabezados = {"Content-Type": "application/x-www-form-urlencoded"}
    try:
        respuesta = requests.post(TOKEN_URL, data=datos, headers=encabezados, timeout=15)
        if respuesta.status_code == 200:
            tokens = respuesta.json()
            return tokens.get("access_token"), tokens.get("refresh_token")
    except requests.exceptions.RequestException:
        pass
    return None, None


def refrescar_token(token_refresco):
    """Renueva el access_token usando el refresh_token."""
    datos = {"refresh_token": token_refresco, "grant_type": "refresh_token"}
    encabezados = {"Content-Type": "application/x-www-form-urlencoded"}
    try:
        respuesta = requests.post(TOKEN_URL, data=datos, headers=encabezados, timeout=15)
        if respuesta.status_code == 200:
            tokens = respuesta.json()
            return tokens.get("access_token"), tokens.get("refresh_token")
    except requests.exceptions.RequestException:
        pass
    return None, None


def autenticar():
    """Login completo: token + refresh. Devuelve bearer o None."""
    token, rt = obtener_tokens()
    if not token:
        return None
    t2, _ = refrescar_token(rt) if rt else (None, None)
    return t2 or token


def obtener_tasas_caucion(token_portador, defecto=0.05):
    """Tasa promedio de caución 7d (fallback: primer plazo disponible)."""
    url = "https://api.invertironline.com/api/v2/Cotizaciones/Cauciones/Todas/Argentina"
    headers = {"Accept": "application/json", "Authorization": f"Bearer {token_portador}"}
    try:
        response = requests.get(url, headers=headers, timeout=15)
        if response.status_code == 200:
            datos = response.json()
            titulos = (datos or {}).get("titulos") or []
            if titulos:
                df_tasas = pd.DataFrame(titulos)
                if not df_tasas.empty and {"tasaPromedio", "plazo"}.issubset(df_tasas.columns):
                    df_tasas = df_tasas.sort_values("plazo")
                    tasa_7d = df_tasas[df_tasas["plazo"] == 7]
                    tasa = (
                        tasa_7d.iloc[0]["tasaPromedio"]
                        if not tasa_7d.empty
                        else df_tasas.iloc[0]["tasaPromedio"]
                    )
                    return float(tasa) / 100 if tasa else defecto
    except (requests.exceptions.RequestException, ValueError, KeyError):
        pass
    return defecto


def obtener_opciones(token_portador, mercado="BCBA", simbolo="GGAL"):
    """Cadena de opciones del símbolo desde la API. Devuelve DataFrame."""
    url = f"https://api.invertironline.com/api/v2/{mercado}/Titulos/{simbolo}/Opciones"
    headers = {"Authorization": f"Bearer {token_portador}"}
    try:
        response = requests.get(url, headers=headers, timeout=20)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, list) or not data:
            return pd.DataFrame()
        return pd.DataFrame(data)
    except (requests.exceptions.RequestException, ValueError):
        return pd.DataFrame()
