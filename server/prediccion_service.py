# -*- coding: utf-8 -*-
"""
Predicción del subyacente — reciclado de calculadora_opciones.py (PROTOTIPO).
Metodología Labadie ML (2018) Secc 2-5 + Stat Arb (2016/2021):
  features técnicos → targets → split temporal 60/20/20 → Logistic/Ridge/NN
  → walk-forward backtest → señal de opciones.
Función pura: sin prints ni gráficos; devuelve dict serializable a JSON.

Aceleración GPU con fallback CPU (no rompe deploy Vercel):
 - cuDF acelera engineer_features (pandas → GPU sin cambios de código)
 - cuML acelera Logistic/Ridge/StandardScaler (sklearn → GPU)
 - Si no hay GPU/cuDF/cuML instalado, usa 100% CPU (pandas/sklearn)
 Patrón codelab NVIDIA RAPIDS: zero-code-change acceleration.
"""

import time
import numpy as np
import pandas as pd

# ── CPU: sklearn (obligatorio para Vercel) ──────────────────────────────
try:
    from sklearn.linear_model import Ridge, LogisticRegression
    from sklearn.metrics import (accuracy_score, precision_score, recall_score,
                                 f1_score, confusion_matrix, mean_squared_error,
                                 r2_score)
    from sklearn.preprocessing import StandardScaler as SkStandardScaler
    try:
        from sklearn.neural_network import MLPClassifier
        HAS_SKLEARN = True
    except ImportError:
        HAS_SKLEARN = False
except ImportError:
    HAS_SKLEARN = False
    SkStandardScaler = None  # type: ignore

# ── GPU opcional: cuDF / cuML / cupy (no falla si no existen) ───────────
try:
    import cudf  # type: ignore
    HAS_CUDF = True
except ImportError:
    cudf = None  # type: ignore
    HAS_CUDF = False

try:
    import cupy as cp  # type: ignore
    HAS_CUPY = True
except ImportError:
    cp = None  # type: ignore
    HAS_CUPY = False

try:
    from cuml.linear_model import LogisticRegression as cuLogisticRegression  # type: ignore
    from cuml.linear_model import Ridge as cuRidge  # type: ignore
    from cuml.preprocessing import StandardScaler as cuStandardScaler  # type: ignore
    HAS_CUML = True
except ImportError:
    cuLogisticRegression = None  # type: ignore
    cuRidge = None  # type: ignore
    cuStandardScaler = None  # type: ignore
    HAS_CUML = False

FEATURES_PRED = [
    "return_1d", "return_5d", "return_10d", "return_20d",
    "vol_10d", "vol_20d", "vol_60d",
    "spread_bps", "adv_pct",
    "rsi_14", "macd", "macd_hist",
    "bb_pct_b", "factor1", "factor2",
]

HORIZONTE_DEFAULT = 5
MIN_FILAS = 100
# cuDF solo compensa overhead GPU a partir de ~1k filas; debajo CPU es igual/más rápido
GPU_MIN_FILAS = 1000


def _as_numpy(arr):
    """Convierte cupy/cudf → numpy sin romper si no hay GPU."""
    if HAS_CUPY and cp is not None:
        try:
            if isinstance(arr, cp.ndarray):
                return cp.asnumpy(arr)
        except Exception:
            pass
    # cudf Series / DataFrame
    if HAS_CUDF and cudf is not None:
        try:
            if isinstance(arr, (cudf.Series, cudf.DataFrame)):  # type: ignore
                return arr.to_pandas().values if hasattr(arr, 'to_pandas') else np.asarray(arr)
        except Exception:
            pass
    if hasattr(arr, "to_numpy"):
        try:
            return arr.to_numpy()
        except Exception:
            pass
    if hasattr(arr, "get"):
        try:
            return arr.get()  # cupy
        except Exception:
            pass
    return np.asarray(arr)


def _should_use_gpu(df_len=None, use_gpu="auto"):
    """Decide si usar GPU. 'auto' usa GPU solo si hay cuDF/cuML y df es grande."""
    if use_gpu is False or use_gpu == "cpu":
        return False
    if use_gpu is True or use_gpu == "gpu":
        return HAS_CUDF or HAS_CUML
    # auto
    if not (HAS_CUDF or HAS_CUML):
        return False
    if df_len is not None and df_len < GPU_MIN_FILAS:
        return False
    return True


def _get_scaler(use_gpu="auto", df_len=None):
    if _should_use_gpu(df_len, use_gpu) and HAS_CUML and cuStandardScaler is not None:
        return cuStandardScaler(), True
    return SkStandardScaler(), False  # type: ignore


def _get_logistic(use_gpu="auto", df_len=None):
    if _should_use_gpu(df_len, use_gpu) and HAS_CUML and cuLogisticRegression is not None:
        # cuML no soporta solver='lbfgs', usa 'qn' (quasi-newton) equivalente
        try:
            return cuLogisticRegression(penalty="l2", C=1.0, max_iter=1000), True
        except Exception:
            pass
    return LogisticRegression(penalty="l2", C=1.0, solver="lbfgs", max_iter=1000, random_state=42), False


def _get_ridge(use_gpu="auto", df_len=None):
    if _should_use_gpu(df_len, use_gpu) and HAS_CUML and cuRidge is not None:
        try:
            return cuRidge(alpha=1.0, fit_intercept=True), True
        except Exception:
            pass
    return Ridge(alpha=1.0, fit_intercept=True), False


def get_aceleracion_info():
    """Para exponer en /api/prediccion: qué aceleración está disponible."""
    import importlib.util
    return {
        "has_cudf": HAS_CUDF,
        "has_cuml": HAS_CUML,
        "has_cupy": HAS_CUPY,
        "has_sklearn": HAS_SKLEARN,
        "gpu_min_filas": GPU_MIN_FILAS,
        "cudf_version": getattr(cudf, "__version__", None) if HAS_CUDF else None,
        "recomendacion": "GPU activa" if (HAS_CUDF and HAS_CUML) else "CPU (instala cudf-cu12 cuml-cu12 en Colab para GPU)",
    }


def engineer_features(df, use_gpu="auto"):
    """
    Features técnicos (Labadie ML Secc 2-3).
    Acelerado con cuDF si use_gpu != 'cpu' y hay GPU disponible.
    Zero-code-change: misma lógica pandas, ejecutada en GPU cuando conviene.

    Args:
        df: DataFrame con columnas Open/High/Low/Close/Volume
        use_gpu: "auto" | True | False | "gpu" | "cpu"
    """
    use_gpu_flag = _should_use_gpu(len(df) if hasattr(df, "__len__") else None, use_gpu)

    # ── Ruta GPU: convierte a cudf, calcula, convierte de vuelta a pandas ──
    if use_gpu_flag and HAS_CUDF and cudf is not None:
        try:
            # Si ya es cudf, úsalo directo; si es pandas, convierte
            is_cudf_input = isinstance(df, cudf.DataFrame)  # type: ignore
            gdf = df if is_cudf_input else cudf.from_pandas(df.copy())  # type: ignore

            if isinstance(gdf.columns, pd.MultiIndex):
                gdf.columns = [c[0] for c in gdf.columns]

            # Nota: cuDF API es 1:1 con pandas para estas ops
            gdf["return_1d"] = gdf["Close"].pct_change(1)
            gdf["return_5d"] = gdf["Close"].pct_change(5)
            gdf["return_10d"] = gdf["Close"].pct_change(10)
            gdf["return_20d"] = gdf["Close"].pct_change(20)
            gdf["vol_10d"] = gdf["return_1d"].rolling(10).std()
            gdf["vol_20d"] = gdf["return_1d"].rolling(20).std()
            gdf["vol_60d"] = gdf["return_1d"].rolling(60).std()
            gdf["spread_bps"] = (gdf["High"] - gdf["Low"]) / gdf["Close"].replace(0, np.nan) * 10000
            gdf["vol_mavg_20"] = gdf["Volume"].rolling(20).mean()
            gdf["adv_pct"] = gdf["Volume"] / gdf["vol_mavg_20"].replace(0, np.nan)
            delta = gdf["Close"].diff()
            gain = delta.clip(lower=0)
            loss = -delta.clip(upper=0)
            avg_gain = gain.rolling(14).mean()
            avg_loss = loss.rolling(14).mean().replace(0, np.nan)
            gdf["rsi_14"] = 100 - (100 / (1 + avg_gain / avg_loss))
            ema12 = gdf["Close"].ewm(span=12).mean()
            ema26 = gdf["Close"].ewm(span=26).mean()
            gdf["macd"] = ema12 - ema26
            gdf["macd_signal"] = gdf["macd"].ewm(span=9).mean()
            gdf["macd_hist"] = gdf["macd"] - gdf["macd_signal"]
            bb_mavg = gdf["Close"].rolling(20).mean()
            bb_std = gdf["Close"].rolling(20).std()
            gdf["bb_pct_b"] = (gdf["Close"] - bb_mavg) / (2 * bb_std).replace(0, np.nan)
            gdf["factor1"] = gdf["return_5d"] / gdf["vol_20d"].replace(0, np.nan)
            gdf["factor2"] = gdf["adv_pct"] * gdf["spread_bps"]

            # Siempre devuelve pandas para compatibilidad con sklearn/cuml downstream
            # (cuml acepta ambos, pero Vercel sin GPU necesita pandas)
            return gdf.to_pandas() if hasattr(gdf, "to_pandas") else pd.DataFrame(gdf)
        except Exception as e:
            # Fallback silencioso a CPU si cuDF falla (ej: tipos no soportados)
            # print(f"[cuDF fallback] {e}")
            pass

    # ── Ruta CPU: pandas puro (Vercel / local sin GPU) ───────────────────
    df = df.copy()
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0] for c in df.columns]
    df["return_1d"] = df["Close"].pct_change(1)
    df["return_5d"] = df["Close"].pct_change(5)
    df["return_10d"] = df["Close"].pct_change(10)
    df["return_20d"] = df["Close"].pct_change(20)
    df["vol_10d"] = df["return_1d"].rolling(10).std()
    df["vol_20d"] = df["return_1d"].rolling(20).std()
    df["vol_60d"] = df["return_1d"].rolling(60).std()
    df["spread_bps"] = (df["High"] - df["Low"]) / df["Close"].replace(0, np.nan) * 10000
    df["vol_mavg_20"] = df["Volume"].rolling(20).mean()
    df["adv_pct"] = df["Volume"] / df["vol_mavg_20"].replace(0, np.nan)
    delta = df["Close"].diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(14).mean()
    avg_loss = loss.rolling(14).mean().replace(0, np.nan)
    df["rsi_14"] = 100 - (100 / (1 + avg_gain / avg_loss))
    ema12 = df["Close"].ewm(span=12).mean()
    ema26 = df["Close"].ewm(span=26).mean()
    df["macd"] = ema12 - ema26
    df["macd_signal"] = df["macd"].ewm(span=9).mean()
    df["macd_hist"] = df["macd"] - df["macd_signal"]
    bb_mavg = df["Close"].rolling(20).mean()
    bb_std = df["Close"].rolling(20).std()
    df["bb_pct_b"] = (df["Close"] - bb_mavg) / (2 * bb_std).replace(0, np.nan)
    df["factor1"] = df["return_5d"] / df["vol_20d"].replace(0, np.nan)
    df["factor2"] = df["adv_pct"] * df["spread_bps"]
    return df


def create_targets(df, horizonte=HORIZONTE_DEFAULT):
    """Targets: Y_clf binario (sube/baja), Y_reg continuo."""
    df = df.copy()
    df["close_future"] = df["Close"].shift(-horizonte)
    df["return_future"] = (df["close_future"] - df["Close"]) / df["Close"]
    df["Y_reg"] = df["return_future"]
    df["Y_clf"] = (df["return_future"] > 0).astype(int)
    return df


def train_cv_test_split(df, train_pct=0.60, cv_pct=0.20):
    """Split temporal 60/20/20 (sin shuffle)."""
    n = len(df)
    train_end = int(n * train_pct)
    cv_end = train_end + int(n * cv_pct)
    return df.iloc[:train_end].copy(), df.iloc[train_end:cv_end].copy(), df.iloc[cv_end:].copy()


def normalize_features(train, cv, test, use_gpu="auto"):
    """StandardScaler ajustado SOLO con train (evita leakage). Acelerado con cuML si hay GPU."""
    is_gpu = _should_use_gpu(len(train), use_gpu) and HAS_CUML
    scaler, _ = _get_scaler(use_gpu, len(train))
    train_n, cv_n, test_n = train.copy(), cv.copy(), test.copy()
    # cuML y sklearn comparten API fit/transform; cuML acepta pandas y cudf
    scaler.fit(train[FEATURES_PRED])
    train_n[FEATURES_PRED] = _as_numpy(scaler.transform(train[FEATURES_PRED])) if is_gpu else scaler.transform(train[FEATURES_PRED])
    cv_n[FEATURES_PRED] = _as_numpy(scaler.transform(cv[FEATURES_PRED])) if is_gpu else scaler.transform(cv[FEATURES_PRED])
    test_n[FEATURES_PRED] = _as_numpy(scaler.transform(test[FEATURES_PRED])) if is_gpu else scaler.transform(test[FEATURES_PRED])
    # Si cuML devolvió cupy, lo convertimos a numpy para asignar a pandas
    # _as_numpy ya hace la conversión; pero asignar array numpy a DataFrame pandas es válido
    return train_n, cv_n, test_n, scaler


def train_logistic_model(train_df, cv_df, use_gpu="auto"):
    """Logistic L2 + threshold óptimo en CV (fallback Acc+F1 si degenera). Acelerado con cuML."""
    Xtr, ytr = train_df[FEATURES_PRED].values, train_df["Y_clf"].values
    Xcv, ycv = cv_df[FEATURES_PRED].values, cv_df["Y_clf"].values
    # Si hay GPU y cuML, convertir a cupy para evitar copia CPU->GPU extra si ya son numpy
    ytr_np = _as_numpy(ytr)
    ycv_np = _as_numpy(ycv)
    model, is_gpu = _get_logistic(use_gpu, len(train_df))
    model.fit(Xtr, ytr_np)
    prob_cv = _as_numpy(model.predict_proba(Xcv)[:, 1] if hasattr(model, "predict_proba") else model.predict(Xcv))
    # cuML predict_proba puede devolver cupy; aseguramos numpy
    if prob_cv.ndim > 1:
        prob_cv = prob_cv[:, 1] if prob_cv.shape[1] > 1 else prob_cv.ravel()
    prob_cv = _as_numpy(prob_cv)
    best_thresh, best_f1 = 0.5, 0.0
    for thresh in np.linspace(0.01, 0.99, 99):
        pred = (prob_cv >= thresh).astype(int)
        f1 = f1_score(ycv_np, pred, zero_division=0)
        if f1 > best_f1:
            best_f1, best_thresh = f1, thresh
    pred_best = (prob_cv >= best_thresh).astype(int)
    if len(np.unique(pred_best)) < 2 or abs(
            precision_score(ycv_np, pred_best, zero_division=0)
            - recall_score(ycv_np, pred_best, zero_division=0)) > 0.3:
        combined = []
        for thresh in np.linspace(0.01, 0.99, 99):
            p = (prob_cv >= thresh).astype(int)
            combined.append((thresh, accuracy_score(ycv_np, p) + f1_score(ycv_np, p, zero_division=0)))
        best_thresh = max(combined, key=lambda x: x[1])[0]
        pred_best = (prob_cv >= best_thresh).astype(int)
    # métricas siempre en CPU/numpy
    ytr_pred = _as_numpy(model.predict(Xtr))
    if ytr_pred.ndim > 1:
        ytr_pred = ytr_pred.ravel()
    # coef puede ser cupy
    try:
        coef_raw = model.coef_
        coef_np = _as_numpy(coef_raw)
        if coef_np.ndim == 2:
            coef_np = coef_np[0]
    except Exception:
        coef_np = np.zeros(len(FEATURES_PRED))
    metrics = {
        "threshold": round(float(best_thresh), 4),
        "train_acc": float(accuracy_score(ytr_np, _as_numpy(ytr_pred))),
        "cv_acc": float(accuracy_score(ycv_np, pred_best)),
        "cv_precision": float(precision_score(ycv_np, pred_best, zero_division=0)),
        "cv_recall": float(recall_score(ycv_np, pred_best, zero_division=0)),
        "cv_f1": float(best_f1),
        "cv_cm": confusion_matrix(ycv_np, pred_best).tolist(),
        "coefs": {k: float(v) for k, v in zip(FEATURES_PRED, coef_np)},
        "backend": "cuml" if is_gpu else "sklearn",
    }
    return model, float(best_thresh), metrics


def train_ridge_model(train_df, cv_df, use_gpu="auto"):
    """Ridge cerrado con λ=1 (Labadie ML Secc 2). Acelerado con cuML."""
    Xtr, ytr = train_df[FEATURES_PRED].values, train_df["Y_reg"].values
    Xcv, ycv = cv_df[FEATURES_PRED].values, cv_df["Y_reg"].values
    ytr_np = _as_numpy(ytr)
    ycv_np = _as_numpy(ycv)
    model, is_gpu = _get_ridge(use_gpu, len(train_df))
    model.fit(Xtr, ytr_np)
    pred_xcv = _as_numpy(model.predict(Xcv))
    dir_cv = (pred_xcv > 0).astype(int)
    return model, {
        "cv_mse": float(mean_squared_error(ycv_np, pred_xcv)),
        "cv_r2": float(r2_score(ycv_np, pred_xcv)),
        "cv_dir_acc": float(accuracy_score((ycv_np > 0).astype(int), dir_cv)),
        "backend": "cuml" if is_gpu else "sklearn",
    }


def train_neural_network(train_df, cv_df):
    """MLP (32,16) logística + early stopping, mejor de 5 seeds. Solo CPU (cuml no tiene MLP)."""
    if not HAS_SKLEARN:
        return None, 0.5, {}
    Xtr, ytr = train_df[FEATURES_PRED].values, train_df["Y_clf"].values
    Xcv, ycv = cv_df[FEATURES_PRED].values, cv_df["Y_clf"].values
    best_model, best_loss = None, float("inf")
    for seed in range(5):
        m = MLPClassifier(hidden_layer_sizes=(32, 16), activation="logistic",
                          solver="adam", alpha=0.001, max_iter=1000,
                          random_state=42 + seed, early_stopping=True, verbose=False)
        m.fit(Xtr, ytr)
        if m.loss_ < best_loss:
            best_loss, best_model = m.loss_, m
    prob_cv = best_model.predict_proba(Xcv)[:, 1]
    best_thresh = 0.5
    for thresh in np.linspace(0.01, 0.99, 99):
        if f1_score(ycv, (prob_cv >= thresh).astype(int), zero_division=0) > \
           f1_score(ycv, (prob_cv >= best_thresh).astype(int), zero_division=0):
            best_thresh = thresh
    pred_cv = (prob_cv >= best_thresh).astype(int)
    return best_model, float(best_thresh), {
        "cv_acc": float(accuracy_score(ycv, pred_cv)),
        "cv_f1": float(f1_score(ycv, pred_cv, zero_division=0)),
        "n_inits": 5,
        "backend": "sklearn",
    }


def walk_forward_backtest(df_full, window_train=504, window_test=63, use_gpu="auto"):
    """Walk-forward recalibrado por ventana (Stat Arb Stage 3-5). Acelerado con cuML si hay GPU."""
    df = df_full.dropna(subset=FEATURES_PRED + ["Y_clf", "Y_reg"]).copy()
    preds, actuals = [], []
    start = window_train
    while start < len(df):
        end = min(start + window_test, len(df))
        train = df.iloc[start - window_train:start]
        test = df.iloc[start:end]
        scaler, is_gpu_scaler = _get_scaler(use_gpu, len(train))
        # fit scaler
        scaler.fit(train[FEATURES_PRED])
        Xtr = _as_numpy(scaler.transform(train[FEATURES_PRED])) if is_gpu_scaler else scaler.transform(train[FEATURES_PRED])
        Xte = _as_numpy(scaler.transform(test[FEATURES_PRED])) if is_gpu_scaler else scaler.transform(test[FEATURES_PRED])
        model, _ = _get_logistic(use_gpu, len(train))
        y_train = _as_numpy(train["Y_clf"].values)
        model.fit(Xtr, y_train)
        batch_pred = _as_numpy(model.predict(Xte))
        preds.extend(np.asarray(batch_pred).ravel().tolist())
        actuals.extend(test["Y_clf"].values.tolist())
        start = end
    if not actuals:
        return None, None
    return float(accuracy_score(actuals, preds)), float(f1_score(actuals, preds, zero_division=0))


def senial_a_opciones(prob_subida, threshold, precio_spot, strikes=None):
    """Traduce probabilidad de subida a recomendación Call/Put/Neutral."""
    if strikes is None or len(strikes) == 0:
        strikes = np.linspace(precio_spot * 0.85, precio_spot * 1.15, 10)
    if prob_subida > threshold:
        direccion = "CALL (alcista)"
        strike_otm = min(strikes, key=lambda s: abs(s - precio_spot * 1.03))
        strike_atm = min(strikes, key=lambda s: abs(s - precio_spot))
        confianza = (prob_subida - threshold) / (1 - threshold) if threshold < 1 else 0
    elif prob_subida < (1 - threshold):
        direccion = "PUT (bajista)"
        strike_otm = min(strikes, key=lambda s: abs(s - precio_spot * 0.97))
        strike_atm = min(strikes, key=lambda s: abs(s - precio_spot))
        confianza = (threshold - prob_subida) / threshold if threshold > 0 else 0
    else:
        direccion = "NEUTRAL (esperar)"
        strike_atm = min(strikes, key=lambda s: abs(s - precio_spot))
        strike_otm = strike_atm
        confianza = 0
    return {
        "direccion": direccion,
        "probabilidad": round(float(prob_subida), 4),
        "confianza": round(min(float(confianza), 1.0), 4),
        "strike_atm": round(float(strike_atm)),
        "strike_otm": round(float(strike_otm)),
        "estrategia": f"Comprar {direccion.split('(')[0].strip()} Strike {strike_otm:.0f}"
                      if confianza > 0.5 else "Esperar señal más clara",
    }


def ejecutar_prediccion(hist, precio_spot, horizonte=HORIZONTE_DEFAULT, use_gpu="auto"):
    """
    Pipeline completo. Devuelve dict JSON-safe o {'error': ...}.
    Requiere scikit-learn instalado. Usa GPU automáticamente si está disponible.

    Args:
        hist: DataFrame OHLCV
        precio_spot: float
        horizonte: días futuro
        use_gpu: "auto" | True | False | "gpu" | "cpu"  -> "auto" no rompe Vercel
    """
    if not HAS_SKLEARN:
        return {"error": "scikit-learn no instalado", "detalle": "pip install scikit-learn"}
    t0 = time.perf_counter()
    df_feat = engineer_features(hist, use_gpu=use_gpu)
    t_feat = time.perf_counter() - t0
    df = create_targets(df_feat, horizonte=horizonte)
    df = df.dropna(subset=FEATURES_PRED + ["Y_clf", "Y_reg"]).copy()
    if len(df) < MIN_FILAS:
        return {"error": "Datos insuficientes para predicción", "filas_utiles": int(len(df))}
    train, cv, test = train_cv_test_split(df)
    train_n, cv_n, test_n, scaler = normalize_features(train, cv, test, use_gpu=use_gpu)
    log_model, log_th, log_m = train_logistic_model(train_n, cv_n, use_gpu=use_gpu)
    _, ridge_m = train_ridge_model(train_n, cv_n, use_gpu=use_gpu)
    nn_model, nn_th, nn_m = train_neural_network(train_n, cv_n)
    wf_acc, wf_f1 = walk_forward_backtest(df, use_gpu=use_gpu)
    Xte = test_n[FEATURES_PRED].values
    yte = test_n["Y_clf"].values
    prob_te = _as_numpy(log_model.predict_proba(Xte)[:, 1])
    pred_te = (prob_te >= log_th).astype(int)
    coefs = sorted(log_m["coefs"].items(), key=lambda x: abs(x[1]), reverse=True)
    last_feat = scaler.transform(df[FEATURES_PRED].iloc[-1:].values)
    last_feat_np = _as_numpy(last_feat)
    # si es cupy, predict_proba espera cupy; pero _as_numpy lo pasó a numpy y sklearn/cuml acepta ambos
    try:
        prob_actual = float(_as_numpy(log_model.predict_proba(last_feat_np)[0, 1]))
    except Exception:
        prob_actual = float(_as_numpy(log_model.predict_proba(last_feat)[0, 1]))
    decision = senial_a_opciones(prob_actual, log_th, precio_spot)
    total_time = time.perf_counter() - t0
    return {
        "log_threshold": round(log_th, 4),
        "ridge": ridge_m,
        "neural_network": nn_m,
        "nn_threshold": nn_th,
        "logistic_cv": {k: v for k, v in log_m.items() if k != "coefs"},
        "test_acc": float(accuracy_score(yte, pred_te)),
        "test_f1": float(f1_score(yte, pred_te, zero_division=0)),
        "wf_acc": wf_acc,
        "wf_f1": wf_f1,
        "prob_actual": round(prob_actual, 4),
        "decision": decision,
        "features_importancia": [[k, round(float(v), 4)] for k, v in coefs[:5]],
        "regla_oro_ok": len(FEATURES_PRED) <= min(len(train), len(cv)) / 10,
        "aceleracion": get_aceleracion_info(),
        "backend_logistic": log_m.get("backend", "sklearn"),
        "timing": {
            "features_sec": round(t_feat, 4),
            "total_sec": round(total_time, 4),
        },
    }


def comparar_cpu_gpu(hist, precio_spot=None, horizonte=HORIZONTE_DEFAULT):
    """
    Benchmark CPU vs GPU para el codelab 'Compara el rendimiento de la CPU y la GPU'.
    Ejecuta engineer_features + train en ambos backends y reporta speedup.
    Útil para 'Genera un perfil de tu código' con cProfile.

    Returns dict con tiempos y speedup. No falla si no hay GPU (devuelve solo CPU).
    """
    import time as _time
    res = {"cpu": {}, "gpu": {}, "speedup": {}, "aceleracion": get_aceleracion_info()}

    # CPU
    t0 = _time.perf_counter()
    df_cpu = engineer_features(hist, use_gpu=False)
    t_feat_cpu = _time.perf_counter() - t0
    t1 = _time.perf_counter()
    try:
        out_cpu = ejecutar_prediccion(hist, precio_spot or float(hist["Close"].iloc[-1]), horizonte=horizonte, use_gpu=False)
        t_pred_cpu = _time.perf_counter() - t1
    except Exception as e:
        out_cpu = {"error": str(e)}
        t_pred_cpu = _time.perf_counter() - t1
    res["cpu"] = {"features_sec": round(t_feat_cpu, 4), "prediccion_sec": round(t_pred_cpu, 4), "ok": "error" not in out_cpu}

    # GPU (si disponible)
    if not (HAS_CUDF or HAS_CUML):
        res["gpu"] = {"error": "GPU no disponible (cudf/cuml no instalados)", "hint": "En Colab: !pip install cudf-cu12 cuml-cu12 --extra-index-url=https://pypi.nvidia.com"}
        return res

    t0 = _time.perf_counter()
    df_gpu = engineer_features(hist, use_gpu=True)
    t_feat_gpu = _time.perf_counter() - t0
    t1 = _time.perf_counter()
    try:
        out_gpu = ejecutar_prediccion(hist, precio_spot or float(hist["Close"].iloc[-1]), horizonte=horizonte, use_gpu=True)
        t_pred_gpu = _time.perf_counter() - t1
    except Exception as e:
        out_gpu = {"error": str(e)}
        t_pred_gpu = _time.perf_counter() - t1

    res["gpu"] = {"features_sec": round(t_feat_gpu, 4), "prediccion_sec": round(t_pred_gpu, 4), "ok": "error" not in out_gpu}
    # speedup >1 significa GPU más rápido
    res["speedup"] = {
        "features": round(t_feat_cpu / t_feat_gpu, 2) if t_feat_gpu > 0 else None,
        "prediccion": round(t_pred_cpu / t_pred_gpu, 2) if t_pred_gpu > 0 else None,
    }
    # validar que resultados sean numéricamente iguales (tolerancia)
    try:
        if res["cpu"]["ok"] and res["gpu"]["ok"]:
            res["validacion"] = {
                "prob_diff": round(abs(out_cpu.get("prob_actual", 0) - out_gpu.get("prob_actual", 0)), 6),
                "igual": abs(out_cpu.get("prob_actual", 0) - out_gpu.get("prob_actual", 0)) < 1e-4
            }
    except Exception:
        pass
    return res

