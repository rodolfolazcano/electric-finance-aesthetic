# -*- coding: utf-8 -*-
"""
Predicción del subyacente — reciclado de calculadora_opciones.py (PROTOTIPO).
Metodología Labadie ML (2018) Secc 2-5 + Stat Arb (2016/2021):
  features técnicos → targets → split temporal 60/20/20 → Logistic/Ridge/NN
  → walk-forward backtest → señal de opciones.
Función pura: sin prints ni gráficos; devuelve dict serializable a JSON.
"""

import numpy as np
import pandas as pd

try:
    from sklearn.linear_model import Ridge, LogisticRegression
    from sklearn.metrics import (accuracy_score, precision_score, recall_score,
                                 f1_score, confusion_matrix, mean_squared_error,
                                 r2_score)
    from sklearn.preprocessing import StandardScaler
    try:
        from sklearn.neural_network import MLPClassifier
        HAS_SKLEARN = True
    except ImportError:
        HAS_SKLEARN = False
except ImportError:
    HAS_SKLEARN = False

FEATURES_PRED = [
    "return_1d", "return_5d", "return_10d", "return_20d",
    "vol_10d", "vol_20d", "vol_60d",
    "spread_bps", "adv_pct",
    "rsi_14", "macd", "macd_hist",
    "bb_pct_b", "factor1", "factor2",
]

HORIZONTE_DEFAULT = 5
MIN_FILAS = 100


def engineer_features(df):
    """Features técnicos (Labadie ML Secc 2-3)."""
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


def normalize_features(train, cv, test):
    """StandardScaler ajustado SOLO con train (evita leakage)."""
    scaler = StandardScaler()
    train_n, cv_n, test_n = train.copy(), cv.copy(), test.copy()
    scaler.fit(train[FEATURES_PRED])
    train_n[FEATURES_PRED] = scaler.transform(train[FEATURES_PRED])
    cv_n[FEATURES_PRED] = scaler.transform(cv[FEATURES_PRED])
    test_n[FEATURES_PRED] = scaler.transform(test[FEATURES_PRED])
    return train_n, cv_n, test_n, scaler


def train_logistic_model(train_df, cv_df):
    """Logistic L2 + threshold óptimo en CV (fallback Acc+F1 si degenera)."""
    Xtr, ytr = train_df[FEATURES_PRED].values, train_df["Y_clf"].values
    Xcv, ycv = cv_df[FEATURES_PRED].values, cv_df["Y_clf"].values
    model = LogisticRegression(penalty="l2", C=1.0, solver="lbfgs", max_iter=1000, random_state=42)
    model.fit(Xtr, ytr)
    prob_cv = model.predict_proba(Xcv)[:, 1]
    best_thresh, best_f1 = 0.5, 0.0
    for thresh in np.linspace(0.01, 0.99, 99):
        pred = (prob_cv >= thresh).astype(int)
        f1 = f1_score(ycv, pred, zero_division=0)
        if f1 > best_f1:
            best_f1, best_thresh = f1, thresh
    pred_best = (prob_cv >= best_thresh).astype(int)
    if len(np.unique(pred_best)) < 2 or abs(
            precision_score(ycv, pred_best, zero_division=0)
            - recall_score(ycv, pred_best, zero_division=0)) > 0.3:
        combined = []
        for thresh in np.linspace(0.01, 0.99, 99):
            p = (prob_cv >= thresh).astype(int)
            combined.append((thresh, accuracy_score(ycv, p) + f1_score(ycv, p, zero_division=0)))
        best_thresh = max(combined, key=lambda x: x[1])[0]
        pred_best = (prob_cv >= best_thresh).astype(int)
    metrics = {
        "threshold": round(float(best_thresh), 4),
        "train_acc": float(accuracy_score(ytr, model.predict(Xtr))),
        "cv_acc": float(accuracy_score(ycv, pred_best)),
        "cv_precision": float(precision_score(ycv, pred_best, zero_division=0)),
        "cv_recall": float(recall_score(ycv, pred_best, zero_division=0)),
        "cv_f1": float(best_f1),
        "cv_cm": confusion_matrix(ycv, pred_best).tolist(),
        "coefs": {k: float(v) for k, v in zip(FEATURES_PRED, model.coef_[0])},
    }
    return model, float(best_thresh), metrics


def train_ridge_model(train_df, cv_df):
    """Ridge cerrado con λ=1 (Labadie ML Secc 2)."""
    Xtr, ytr = train_df[FEATURES_PRED].values, train_df["Y_reg"].values
    Xcv, ycv = cv_df[FEATURES_PRED].values, cv_df["Y_reg"].values
    model = Ridge(alpha=1.0, fit_intercept=True)
    model.fit(Xtr, ytr)
    dir_cv = (model.predict(Xcv) > 0).astype(int)
    return model, {
        "cv_mse": float(mean_squared_error(ycv, model.predict(Xcv))),
        "cv_r2": float(r2_score(ycv, model.predict(Xcv))),
        "cv_dir_acc": float(accuracy_score((ycv > 0).astype(int), dir_cv)),
    }


def train_neural_network(train_df, cv_df):
    """MLP (32,16) logística + early stopping, mejor de 5 seeds."""
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
    }


def walk_forward_backtest(df_full, window_train=504, window_test=63):
    """Walk-forward recalibrado por ventana (Stat Arb Stage 3-5)."""
    df = df_full.dropna(subset=FEATURES_PRED + ["Y_clf", "Y_reg"]).copy()
    preds, actuals = [], []
    start = window_train
    while start < len(df):
        end = min(start + window_test, len(df))
        train = df.iloc[start - window_train:start]
        test = df.iloc[start:end]
        scaler = StandardScaler()
        Xtr = scaler.fit_transform(train[FEATURES_PRED].values)
        Xte = scaler.transform(test[FEATURES_PRED].values)
        model = LogisticRegression(penalty="l2", C=1.0, solver="lbfgs", max_iter=1000, random_state=42)
        model.fit(Xtr, train["Y_clf"].values)
        preds.extend(model.predict(Xte))
        actuals.extend(test["Y_clf"].values)
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


def ejecutar_prediccion(hist, precio_spot, horizonte=HORIZONTE_DEFAULT):
    """
    Pipeline completo. Devuelve dict JSON-safe o {'error': ...}.
    Requiere scikit-learn instalado.
    """
    if not HAS_SKLEARN:
        return {"error": "scikit-learn no instalado", "detalle": "pip install scikit-learn"}
    df_feat = engineer_features(hist)
    df = create_targets(df_feat, horizonte=horizonte)
    df = df.dropna(subset=FEATURES_PRED + ["Y_clf", "Y_reg"]).copy()
    if len(df) < MIN_FILAS:
        return {"error": "Datos insuficientes para predicción", "filas_utiles": int(len(df))}
    train, cv, test = train_cv_test_split(df)
    train_n, cv_n, test_n, scaler = normalize_features(train, cv, test)
    log_model, log_th, log_m = train_logistic_model(train_n, cv_n)
    _, ridge_m = train_ridge_model(train_n, cv_n)
    nn_model, nn_th, nn_m = train_neural_network(train_n, cv_n)
    wf_acc, wf_f1 = walk_forward_backtest(df)
    Xte = test_n[FEATURES_PRED].values
    yte = test_n["Y_clf"].values
    prob_te = log_model.predict_proba(Xte)[:, 1]
    pred_te = (prob_te >= log_th).astype(int)
    coefs = sorted(log_m["coefs"].items(), key=lambda x: abs(x[1]), reverse=True)
    last_feat = scaler.transform(df[FEATURES_PRED].iloc[-1:].values)
    prob_actual = float(log_model.predict_proba(last_feat)[0, 1])
    decision = senial_a_opciones(prob_actual, log_th, precio_spot)
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
    }
