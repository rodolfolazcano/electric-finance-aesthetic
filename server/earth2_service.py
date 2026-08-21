# -*- coding: utf-8 -*-
"""
Earth2Studio Weather Forecast Service — Deterministic Forecasting
NVIDIA Earth-2: pronósticos meteorológicos con ML para análisis financiero.

Requiere: earth2studio + CUDA GPU instalados.
Falla graceful si no está disponible, retornando datos de ejemplo.

Endpoints:
  POST /api/earth2/forecast  — ejecuta pronóstico determinista
  GET  /api/earth2/status    — verifica disponibilidad de Earth2Studio
  GET  /api/earth2/models    — lista modelos disponibles
"""

import os
import sys
import json
import logging
from datetime import datetime, timedelta
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# ─── Detectar Earth2Studio ─────────────────────────────────────────────────
EARTH2_AVAILABLE = False
try:
    import torch
    from earth2studio.run import deterministic
    from earth2studio.models.px import (
        PanguWeather, FourCastNet, DLWP, FengWu
    )
    from earth2studio.data import GFS, ARCO
    from earth2studio.io import ZarrBackend, NetCDF4Backend, XarrayBackend
    EARTH2_AVAILABLE = torch.cuda.is_available()
    if not EARTH2_AVAILABLE:
        logger.warning("Earth2Studio instalado pero no hay CUDA GPU disponible")
except ImportError:
    logger.warning("Earth2Studio no instalado — usando modo simulación")
except Exception as e:
    logger.warning(f"Error cargando Earth2Studio: {e}")

# ─── Modelos disponibles ────────────────────────────────────────────────────
MODEL_REGISTRY = {
    "pangu": {
        "name": "PanguWeather",
        "cls": "PanguWeather",
        "step_hours": 6,
        "max_lead": 168,      # 7 días
        "variables": ["t2m", "u10m", "v10m", "msl", "sp", "tp"],
        "region": "global",
        "vram_gb": 2,
    },
    "fourcastnet": {
        "name": "FourCastNet",
        "cls": "FourCastNet",
        "step_hours": 6,
        "max_lead": 168,
        "variables": ["t2m", "u10m", "v10m", "msl", "sp", "tp", "r"],
        "region": "global",
        "vram_gb": 3,
    },
    "fengwu": {
        "name": "FengWu",
        "cls": "FengWu",
        "step_hours": 6,
        "max_lead": 240,      # 10 días
        "variables": ["t2m", "u10m", "v10m", "msl", "sp", "tp", "r"],
        "region": "global",
        "vram_gb": 4,
    },
    "dlwp": {
        "name": "DLWP",
        "cls": "DLWP",
        "step_hours": 6,
        "max_lead": 168,
        "variables": ["t2m", "msl"],
        "region": "global",
        "vram_gb": 1,
    },
}

FINANCIAL_HOTSPOTS = {
    "argentina": {"lat": -34.6, "lon": -58.4, "label": "Buenos Aires (AGRO)"},
    "brazil": {"lat": -15.8, "lon": -47.9, "label": "Brasilia (SOJA)"},
    "us_midwest": {"lat": 41.9, "lon": -93.6, "label": "US Corn Belt (MAÍZ)"},
    "us_gulf": {"lat": 29.8, "lon": -95.4, "label": "Houston (ENERGÍA)"},
    "china": {"lat": 31.2, "lon": 121.5, "label": "Shanghai (COMMODITIES)"},
    "europe": {"lat": 48.9, "lon": 2.3, "label": "Paris (TRIGO)"},
    "patagonia": {"lat": -45.9, "lon": -67.5, "label": "Patagonia (ENERGÍA EÓLICA)"},
    "nordic": {"lat": 59.9, "lon": 10.7, "label": "Nordics (HIDROELÉCTRICA)"},
}

# ─── Variables climáticas de interés financiero ──────────────────────────────
FINANCIAL_WEATHER_IMPACT = {
    "t2m": {
        "label": "Temperatura 2m",
        "unit": "°C",
        "impact": "Energía (demanda AC/calefacción), agro (heladas/golpes de calor)",
    },
    "tp": {
        "label": "Precipitación",
        "unit": "mm",
        "impact": "Agro (rendimiento cultivos), hidroeléctrica, inundaciones",
    },
    "u10m": {
        "label": "Viento (U 10m)",
        "unit": "m/s",
        "impact": "Generación eólica, energéticas renovables",
    },
    "v10m": {
        "label": "Viento (V 10m)",
        "unit": "m/s",
        "impact": "Generación eólica, direccionalidad",
    },
    "msl": {
        "label": "Presión nivel mar",
        "unit": "hPa",
        "impact": "Tormentas, ciclones → seguros, reaseguros",
    },
    "sp": {
        "label": "Presión superficie",
        "unit": "Pa",
        "impact": "Condiciones meteorológicas extremas",
    },
    "r": {
        "label": "Humedad relativa",
        "unit": "%",
        "impact": "Agro (enfermedades, hongos), sensación térmica",
    },
}

# ─── Servicio de Forecast ────────────────────────────────────────────────────

def get_available_models():
    """Retorna lista de modelos disponibles según la instalación."""
    available = []
    for key, meta in MODEL_REGISTRY.items():
        if EARTH2_AVAILABLE:
            try:
                mod_cls = eval(meta["cls"])  # verifica que la clase exista
                available.append({**meta, "id": key, "available": True})
            except Exception:
                available.append({**meta, "id": key, "available": False})
        else:
            available.append({**meta, "id": key, "available": False})
    return available


def interpolate_to_point(grid_data, lat_target, lon_target):
    """
    Interpola bilinealmente datos de grilla a un punto (lat, lon).
    grid_data: array 2D (lat, lon) con coordenadas regulares.
    """
    lats = np.linspace(90, -90, grid_data.shape[0])
    lons = np.linspace(0, 360, grid_data.shape[1])
    lon_target = lon_target % 360

    ilat = np.searchsorted(lats, lat_target) - 1
    ilat = max(0, min(ilat, len(lats) - 2))
    ilon = np.searchsorted(lons, lon_target) - 1
    ilon = max(0, min(ilon, len(lons) - 2))

    lat_frac = (lat_target - lats[ilat]) / (lats[ilat + 1] - lats[ilat]) if lats[ilat + 1] != lats[ilat] else 0
    lon_frac = (lon_target - lons[ilon]) / (lons[ilon + 1] - lons[ilon]) if lons[ilon + 1] != lons[ilon] else 0

    return (
        grid_data[ilat, ilon] * (1 - lat_frac) * (1 - lon_frac)
        + grid_data[ilat + 1, ilon] * lat_frac * (1 - lon_frac)
        + grid_data[ilat, ilon + 1] * (1 - lat_frac) * lon_frac
        + grid_data[ilat + 1, ilon + 1] * lat_frac * lon_frac
    )


def _mock_forecast(time: str, nsteps: int, variables: list[str]):
    """Genera datos simulados cuando Earth2Studio no está disponible."""
    np.random.seed(42)
    base_time = datetime.fromisoformat(time) if isinstance(time, str) else time
    steps = []
    for step in range(nsteps):
        step_time = base_time + timedelta(hours=6 * step)
        data = {}
        for var in variables:
            base_val = {
                "t2m": 25.0 + np.random.randn() * 3,
                "tp": max(0, np.random.exponential(2)),
                "u10m": np.random.randn() * 2,
                "v10m": np.random.randn() * 2,
                "msl": 1013.0 + np.random.randn() * 5,
                "sp": 101300 + np.random.randn() * 500,
                "r": 50 + np.random.randn() * 15,
            }.get(var, 0)
            data[var] = float(base_val + np.random.randn() * 0.1 * step)
        steps.append({
            "step": step,
            "time": step_time.isoformat(),
            "lead_hours": step * 6,
            "data": data,
        })
    return {
        "status": "simulated",
        "model": "mock",
        "init_time": base_time.isoformat(),
        "total_steps": nsteps,
        "total_hours": nsteps * 6,
        "steps": steps,
    }


def run_forecast(
    model_id: str = "pangu",
    variables: list[str] | None = None,
    forecast_hours: int = 120,
    init_time: str | None = None,
    hotspot: str | None = None,
):
    """
    Ejecuta pronóstico determinista con Earth2Studio.
    Si Earth2Studio no está disponible, retorna datos simulados.
    """
    if variables is None:
        variables = ["t2m", "u10m", "v10m", "msl"]

    if init_time is None:
        init_time = datetime.utcnow().strftime("%Y-%m-%dT00:00:00")

    if not EARTH2_AVAILABLE:
        return _mock_forecast(init_time, forecast_hours // 6, variables)

    # ─── Earth2Studio real ───
    try:
        import torch
        from earth2studio.run import deterministic
        from earth2studio.io import ZarrBackend
        import tempfile

        model_meta = MODEL_REGISTRY.get(model_id)
        if not model_meta:
            return {"error": f"Modelo {model_id} no encontrado"}

        # Cargar modelo
        model_cls = eval(model_meta["cls"])
        model = model_cls.load_model(model_cls.load_default_package())

        # Fuente de datos
        if model_meta["region"] == "global":
            from earth2studio.data import GFS
            data = GFS()
        else:
            from earth2studio.data import HRRR
            data = HRRR()

        # IO temporal
        tmp_dir = tempfile.mkdtemp()
        output_path = os.path.join(tmp_dir, "forecast.zarr")
        io = ZarrBackend(output_path)

        # Calcular nsteps
        step_hours = model_meta["step_hours"]
        nsteps = min(forecast_hours // step_hours, model_meta["max_lead"] // step_hours)

        # Output coords si se pidieron variables específicas
        from collections import OrderedDict
        output_coords = OrderedDict({"variable": np.array(variables)})

        # Ejecutar
        io = deterministic(
            time=[init_time],
            nsteps=nsteps,
            prognostic=model,
            data=data,
            io=io,
            output_coords=output_coords,
            device=torch.device("cuda"),
        )

        # Leer resultados
        import xarray as xr
        ds = xr.open_zarr(output_path)

        steps = []
        for step_idx in range(nsteps):
            data_dict = {}
            for var in variables:
                if var in ds:
                    vals = ds[var].isel(time=0, lead_time=step_idx).values
                    if hotspot and hotspot in FINANCIAL_HOTSPOTS:
                        pt = FINANCIAL_HOTSPOTS[hotspot]
                        val = interpolate_to_point(vals, pt["lat"], pt["lon"])
                    else:
                        val = float(np.mean(vals))
                    data_dict[var] = round(val, 4)
            lead_time_h = step_idx * step_hours
            step_time = datetime.fromisoformat(init_time) + timedelta(hours=lead_time_h)
            steps.append({
                "step": step_idx,
                "time": step_time.isoformat(),
                "lead_hours": lead_time_h,
                "data": data_dict,
            })

        # Limpiar
        import shutil
        shutil.rmtree(tmp_dir, ignore_errors=True)

        return {
            "status": "success",
            "model": model_id,
            "init_time": init_time,
            "total_steps": nsteps,
            "total_hours": nsteps * step_hours,
            "steps": steps,
        }

    except Exception as e:
        logger.error(f"Earth2Studio error: {e}")
        return {"error": str(e), "status": "failed"}


def analyze_financial_impact(forecast_data: dict, hotspot: str | None = None):
    """
    Analiza el impacto financiero del pronóstico climático.
    Retorna análisis estructurado por sector.
    """
    if "steps" not in forecast_data or not forecast_data["steps"]:
        return {"error": "Sin datos de pronóstico"}

    steps = forecast_data["steps"]
    analysis = {
        "hotspot": hotspot,
        "summary": [],
        "sector_impacts": {},
        "alerts": [],
        "trading_implications": [],
    }

    # Extraer series temporales
    series = {}
    for var in FINANCIAL_WEATHER_IMPACT:
        values = []
        for s in steps:
            if var in s.get("data", {}):
                values.append(s["data"][var])
        if values:
            series[var] = values

    # Temperatura extrema → energía
    if "t2m" in series:
        temps = series["t2m"]
        avg_temp = np.mean(temps)
        max_temp = np.max(temps)
        min_temp = np.min(temps)
        if max_temp > 35:
            analysis["sector_impacts"]["energia"] = {
                "impact": "high",
                "detail": f"Temperatura máxima {max_temp:.1f}°C → pico demanda AC → beneficia generadoras",
                "assets": ["PAMP", "CEPU", "TGSU2"],
            }
            analysis["alerts"].append(f"⚠️ Ola de calor: {max_temp:.1f}°C — demanda energética elevada")
        if min_temp < 0:
            analysis["sector_impacts"]["agro"] = {
                "impact": "high",
                "detail": f"Helada (mín {min_temp:.1f}°C) → riesgo para cultivos → presión sobre precios alimentos",
                "assets": ["AGRO", "INAG", "MOLA"],
            }
            analysis["alerts"].append(f"❄️ Helada detectada: {min_temp:.1f}°C — impacto agrícola")

    # Precipitación → agro, energía
    if "tp" in series:
        total_precip = np.sum(series["tp"])
        max_precip = np.max(series["tp"])
        if total_precip > 50:
            analysis["sector_impacts"]["hidroelectrica"] = {
                "impact": "positive",
                "detail": f"Precipitación acumulada {total_precip:.0f}mm → mejora embalses → mayor generación",
                "assets": ["CEPU", "PAMP"],
            }
        if max_precip > 20:
            analysis["alerts"].append(f"🌧️ Lluvia intensa: {max_precip:.0f}mm en 6h — riesgo inundación")
            analysis["sector_impacts"]["seguros"] = {
                "impact": "negative",
                "detail": "Lluvia extrema → siniestros → presión sobre aseguradoras",
                "assets": [],
            }

    # Viento → eólica
    if "u10m" in series and "v10m" in series:
        wind_speeds = [
            np.sqrt(series["u10m"][i]**2 + series["v10m"][i]**2)
            for i in range(len(series["u10m"]))
        ]
        avg_wind = np.mean(wind_speeds)
        max_wind = np.max(wind_speeds)
        if avg_wind > 8:
            analysis["sector_impacts"]["eolica"] = {
                "impact": "positive",
                "detail": f"Viento promedio {avg_wind:.1f} m/s → alta generación eólica → +INGE, +TRAN",
                "assets": [],
            }
        if max_wind > 20:
            analysis["alerts"].append(f"💨 Viento extremo: {max_wind:.0f} m/s — alerta tormenta")

    # Resumen general
    alerts = analysis["alerts"]
    if not alerts:
        analysis["summary"].append("✅ Sin eventos climáticos extremos en el horizonte de pronóstico")
    else:
        analysis["summary"].append(f"⚠️ {len(alerts)} alerta(s) climática(s) detectada(s)")

    impact_sectors = list(analysis["sector_impacts"].keys())
    if impact_sectors:
        analysis["summary"].append(
            f"📊 Sectores con impacto: {', '.join(impact_sectors)}"
        )

    # Trading implications
    for sector, info in analysis["sector_impacts"].items():
        if info["impact"] in ("high", "positive"):
            analysis["trading_implications"].append(
                f"{sector}: {info['detail']}"
            )

    return analysis
