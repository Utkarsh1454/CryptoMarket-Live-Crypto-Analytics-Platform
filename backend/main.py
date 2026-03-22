"""
main.py — FastAPI application serving crypto forecasts.
Endpoints:
    GET /health                   — keep-warm for Render cron
    GET /coins                    — list supported coins
    GET /predict/{coin}?horizon=7 — forecast + confidence bands
    GET /backtest/{coin}          — detailed historical backtest
"""
import numpy as np
import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from data import prepare_sequences, COIN_CONFIG
from model import build_model, monte_carlo_predict
from backtest import run_backtest
from cache import cached_or_compute

# --- Global model store (trained on startup for supported coins) ---
_models: dict = {}
_scalers: dict = {}
_sequences: dict = {}


def train_coin(coin: str):
    """Train model for a single coin and store it."""
    print(f"[main.py] Training model for {coin}...")
    X, y, close_scaler, feat_scaler, df, seq_len = prepare_sequences(coin)

    # Train / val split (80/20)
    split = int(len(X) * 0.8)
    X_train, y_train = X[:split], y[:split]
    X_val, y_val = X[split:], y[split:]

    model = build_model(seq_len=seq_len, n_features=X.shape[2])
    model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=30,
        batch_size=32,
        verbose=0,
        callbacks=[
            # Stop early if no improvement for 5 epochs
            __import__("tensorflow").keras.callbacks.EarlyStopping(
                patience=5, restore_best_weights=True
            )
        ]
    )
    _models[coin] = model
    _scalers[coin] = {"close": close_scaler, "feat": feat_scaler}
    _sequences[coin] = {"X": X, "y": y, "df": df, "seq_len": seq_len}
    print(f"[main.py] {coin} model trained. {len(X)} samples.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Train all coin models on startup."""
    for coin in COIN_CONFIG:
        try:
            train_coin(coin)
        except Exception as e:
            print(f"[main.py] Failed to train {coin}: {e}")
    yield


app = FastAPI(title="CryptoForecaster API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    """Keep-warm endpoint. Pinged every 10 min by cron to prevent cold starts."""
    return {"status": "ok", "models_loaded": list(_models.keys())}


_PAPRIKA = "https://api.coinpaprika.com/v1"

@app.get("/paprika/{path:path}")
async def paprika_proxy(path: str, request: Request):
    """
    Transparent proxy to Coinpaprika API.
    Solves CORS: frontend calls /paprika/tickers, backend fetches from Coinpaprika.
    Query params are forwarded automatically.
    """
    qs = str(request.url.query)
    target = f"{_PAPRIKA}/{path}{'?' + qs if qs else ''}"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(target)
        return JSONResponse(content=resp.json(), status_code=resp.status_code)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Coinpaprika proxy error: {e}")


@app.get("/coins")
def get_coins():
    """Return metadata for all supported coins."""
    return {
        "coins": [
            {"symbol": coin, "name": _coin_name(coin), "trained": coin in _models}
            for coin in COIN_CONFIG
        ]
    }


@app.get("/predict/{coin}")
def predict(coin: str, horizon: int = Query(default=7, ge=1, le=30)):
    """
    Forecast next `horizon` days with confidence bands.
    Uses 3-tier cache for sub-100ms responses after the first request.
    """
    coin = coin.upper()
    if coin not in _models:
        raise HTTPException(status_code=404, detail=f"Model for {coin} not found.")

    def _live_inference():
        model = _models[coin]
        close_scaler = _scalers[coin]["close"]
        X = _sequences[coin]["X"]
        df = _sequences[coin]["df"]

        # Predict forward `horizon` steps autoregressively
        last_seq = X[-1].copy()  # (seq_len, n_features)
        predictions_scaled = []

        for _ in range(horizon):
            inp = last_seq[np.newaxis, :, :]  # (1, seq_len, n_features)
            mc = monte_carlo_predict(model, inp, n_passes=100)
            predictions_scaled.append({
                "mean": float(mc["mean"][0]),
                "lower": float(mc["lower"][0]),
                "upper": float(mc["upper"][0]),
            })
            # Shift window: append predicted close (close is col index 3)
            new_row = last_seq[-1].copy()
            new_row[3] = mc["mean"][0]  # Update Close (scaled)
            last_seq = np.vstack([last_seq[1:], new_row])

        # Inverse scale
        means = close_scaler.inverse_transform(
            np.array([p["mean"] for p in predictions_scaled]).reshape(-1, 1)
        ).flatten()
        lowers = close_scaler.inverse_transform(
            np.array([p["lower"] for p in predictions_scaled]).reshape(-1, 1)
        ).flatten()
        uppers = close_scaler.inverse_transform(
            np.array([p["upper"] for p in predictions_scaled]).reshape(-1, 1)
        ).flatten()

        # Last 30 days of actual closes for context
        hist_closes = df["Close"].values[-30:].tolist()
        hist_dates = [str(d)[:10] for d in df.index[-30:].tolist()]

        import datetime
        last_date = df.index[-1]
        forecast_dates = []
        d = last_date
        for _ in range(horizon):
            d += datetime.timedelta(days=1)
            while d.weekday() >= 5:  # Skip weekends
                d += datetime.timedelta(days=1)
            forecast_dates.append(str(d)[:10])

        return {
            "coin": coin,
            "horizon_days": horizon,
            "historical": {"dates": hist_dates, "closes": hist_closes},
            "forecast": {
                "dates": forecast_dates,
                "mean": means.tolist(),
                "lower": lowers.tolist(),
                "upper": uppers.tolist(),
            },
        }

    result = cached_or_compute(coin, horizon, _live_inference)
    return result


@app.get("/backtest/{coin}")
def backtest(coin: str):
    """Run rolling backtest and return accuracy metrics."""
    coin = coin.upper()
    if coin not in _models:
        raise HTTPException(status_code=404, detail=f"Model for {coin} not found.")

    model = _models[coin]
    close_scaler = _scalers[coin]["close"]
    X = _sequences[coin]["X"]
    y = _sequences[coin]["y"]

    # Run on last 90 days (validation set proxy)
    X_bt = X[-90:]
    y_bt = y[-90:]
    report = run_backtest(model, X_bt, y_bt, close_scaler, n_passes=30)
    report["coin"] = coin
    return report


def _coin_name(coin: str) -> str:
    names = {
        "BTC": "Bitcoin", "ETH": "Ethereum", "BNB": "BNB",
        "ADA": "Cardano", "SOL": "Solana", "XRP": "Ripple"
    }
    return names.get(coin, coin)
