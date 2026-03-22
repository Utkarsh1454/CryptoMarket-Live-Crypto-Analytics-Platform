"""
data.py — Per-coin OHLCV data pipeline with fallback support.
Uses yfinance as primary source, with per-coin configs for data-scarce assets.
"""
import numpy as np
import pandas as pd
import yfinance as yf
from sklearn.preprocessing import MinMaxScaler

# Per-coin configuration
# BNB and ADA are data-scarce on many exchanges, so we
# use shorter lookbacks + higher row limits = 3-4x more training samples
COIN_CONFIG = {
    "BTC":  {"ticker": "BTC-USD", "lookback": 60, "max_rows": 365 * 4},
    "ETH":  {"ticker": "ETH-USD", "lookback": 60, "max_rows": 365 * 4},
    "BNB":  {"ticker": "BNB-USD", "lookback": 30, "max_rows": 365 * 5},  # shorter lookback
    "ADA":  {"ticker": "ADA-USD", "lookback": 30, "max_rows": 365 * 5},  # shorter lookback
    "SOL":  {"ticker": "SOL-USD", "lookback": 45, "max_rows": 365 * 3},
    "XRP":  {"ticker": "XRP-USD", "lookback": 60, "max_rows": 365 * 4},
}

FEATURES = ["Open", "High", "Low", "Close", "Volume"]


def fetch_ohlcv(coin: str) -> pd.DataFrame:
    """Fetch OHLCV data via yfinance."""
    cfg = COIN_CONFIG.get(coin.upper(), COIN_CONFIG["BTC"])
    ticker = cfg["ticker"]
    period = f"{cfg['max_rows'] // 365}y"

    try:
        df = yf.download(ticker, period=period, interval="1d", progress=False, auto_adjust=True)
        df = df[FEATURES].dropna()
        return df
    except Exception as e:
        print(f"[data.py] yfinance failed for {coin}: {e}. Using CCXT fallback.")
        return _fetch_ccxt_fallback(coin)


def _fetch_ccxt_fallback(coin: str) -> pd.DataFrame:
    """CCXT fallback for when yfinance is unavailable."""
    try:
        import ccxt
        exchange = ccxt.binance()
        symbol = f"{coin.upper()}/USDT"
        cfg = COIN_CONFIG.get(coin.upper(), COIN_CONFIG["BTC"])
        limit = cfg["max_rows"]
        ohlcv = exchange.fetch_ohlcv(symbol, timeframe="1d", limit=limit)
        df = pd.DataFrame(ohlcv, columns=["timestamp", "Open", "High", "Low", "Close", "Volume"])
        df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
        df = df.set_index("timestamp")[FEATURES].dropna()
        return df
    except Exception as e:
        raise RuntimeError(f"Both yfinance and CCXT failed for {coin}: {e}")


def prepare_sequences(coin: str):
    """
    Returns:
        X: (n_samples, seq_len, n_features)
        y: (n_samples,)
        scaler: fitted MinMaxScaler on Close
        df: raw DataFrame
    """
    cfg = COIN_CONFIG.get(coin.upper(), COIN_CONFIG["BTC"])
    seq_len = cfg["lookback"]

    df = fetch_ohlcv(coin)
    close_scaler = MinMaxScaler()
    feature_scaler = MinMaxScaler()

    scaled_features = feature_scaler.fit_transform(df[FEATURES])
    close_scaled = close_scaler.fit_transform(df[["Close"]])

    X, y = [], []
    for i in range(seq_len, len(df)):
        X.append(scaled_features[i - seq_len:i])
        y.append(close_scaled[i, 0])

    X, y = np.array(X), np.array(y)
    return X, y, close_scaler, feature_scaler, df, seq_len
