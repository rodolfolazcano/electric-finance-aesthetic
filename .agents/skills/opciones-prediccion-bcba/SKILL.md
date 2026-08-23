---
name: opciones-prediccion-bcba
description: Use when a user asks to price Argentine BCBA options, compute Greeks/IV/VaR, authenticate with the IOL API, predict underlying direction with Logistic/Ridge/NN, backtest walk-forward, or translate an ML signal into a Call/Put strike recommendation.
license: MIT
metadata:
  author: electric-finance-aesthetic
  tags:
    - opciones
    - black-scholes
    - iol-api
    - machine-learning
    - bcba
    - var
---

# Opciones BCBA + Predicción del Subyacente

Metodología reciclada de `PROTOTIPO-CON-DATOS-EN-TIEMPO-REAL` (Labadie ML 2018 Secc 2-5,
Labadie Stat Arb 2016/2021) integrada al backend Flask de este proyecto.

## Purpose

Pricear opciones argentinas con Black-Scholes y binomial CRR, calcular griegas,
volatilidad implícita/histórica/EWMA, VaR delta-gamma, entrenar modelos de
predicción direccional y convertir la señal en recomendación de strikes.

## When to Use

- Pricer una opción puntual o una cadena completa de BCBA.
- Calcular IV por brentq (fallback newton-vega), VaR paramétrico o skew OTM.
- Autenticar contra la API de InvertirOnline (bearer + refresh).
- Ejecutar el pipeline ML completo con validación temporal 60/20/20.
- Backtest walk-forward (ventanas 504 train / 63 test).
- Traducir probabilidad de subida → Call/Put/Neutral con strikes ATM/OTM.

Do **not** use for: optimización de carteras (usar `/api/full-analysis` del
servidor), forecasting climático (`earth2_service`), o datos no-BCBA sin ajustar
sufijos (`.BA`).

## Architecture

| Módulo | Responsabilidad |
|---|---|
| `server/iol_service.py` | Auth IOL (credenciales hardcodeadas por decisión del propietario), tasa de caución 7d, cadena de opciones |
| `server/opciones_service.py` | Funciones puras: BS+griegias, binomial, IV, EWMA, VaR, sesgo, `procesar_cadena_opciones` |
| `server/prediccion_service.py` | Features técnicos, targets, splits temporales, Logistic/Ridge/NN, walk-forward, `senial_a_opciones`, `ejecutar_prediccion` |

## Endpoints

| Endpoint | Método | Descripción |
|---|---|---|
| `/api/iol/status` | GET | Autenticación + tasa de caución |
| `/api/opciones/precio` | POST | `{tipo,S,K,T,r,sigma,q,pasos,americana}` → BS + griegas (+binomial opcional) |
| `/api/opciones/cadena` | POST | `{simbolo}` → cadena completa con IV/griegias/VaR/sesgo |
| `/api/prediccion` | POST | `{simbolo,horizonte}` → pipeline ML + decisión |

## Instructions

1. **Reutilizar, no duplicar**: si una función existe en los módulos, impórtala
   (regla 1-2 de DESARROLLO.md). No crear variantes paralelas de BS/binomial.
2. **Validar datos antes de modelar**: mínimo 100 filas útiles post-dropna para
   predicción; ≥60 para estadísticas. Nunca fabricar precios.
3. **Split siempre temporal** (60/20/20, sin shuffle); StandardScaler ajustado
   SOLO con train. Regla de oro: features ≤ n_train/10.
4. **T en años hábiles XBUE** (`_dias_habiles_argentinos`), no días corridos.
5. **Fallbacks graceful**: sin token IOL → tasa 0.05; sin sklearn → error
   descriptivo; sin mcal → bdate_range Mon-Fri.
6. **Funciones puras en services**, side-effects solo en rutas Flask;
   envolver ejecutables en `if __name__ == '__main__':`.
7. Tras editar cualquier módulo Python: `python -m py_compile <archivo>`.

## Reference values

- Caución default si falla API: 5% anual.
- EWMA lambda: 0.94 (RiskMetrics); ventana inicial 30.
- Walk-forward: 504 días train, 63 test (~2 años / ~3 meses).
- Señal: prob > threshold → CALL OTM 103% spot; prob < 1−threshold → PUT OTM 97%;
  confianza = distancia normalizada al threshold; comprar solo si confianza > 0.5.
