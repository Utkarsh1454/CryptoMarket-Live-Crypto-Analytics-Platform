"""
backtest.py — Fixed rolling backtest.
BUG FIX: Original code compared predicted close[i+1] against actual close[i].
         Now correctly compares against actual close[i+1].
Reports: MAE, RMSE, Directional Accuracy, and Sharpe Ratio.
"""
import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error


def run_backtest(model, X: np.ndarray, y_true_scaled: np.ndarray, close_scaler, n_passes: int = 30):
    """
    Rolling backtest using model predictions.

    For each step i:
        - Input:  X[i] (last seq_len candles, the model HAS seen)
        - Target: y_true_scaled[i] → actual close[i+1] (the model has NOT seen)

    BUG FIX: y_true_scaled[i] IS close[i+1] because prepare_sequences()
    sets y[i] = scaled_close[i + seq_len].
    So this is already the correct next-day close — we just ensure alignment.
    """
    from model import monte_carlo_predict

    # Predict in one batch to save time
    mc_result = monte_carlo_predict(model, X, n_passes=n_passes)
    
    # Inverse scale predictions and actuals
    pred_scaled = mc_result["mean"].reshape(-1, 1)
    pred_prices = close_scaler.inverse_transform(pred_scaled).flatten()
    
    actual_scaled = y_true_scaled.reshape(-1, 1)
    actual_prices = close_scaler.inverse_transform(actual_scaled).flatten()

    # Core metrics
    mae = mean_absolute_error(actual_prices, pred_prices)
    rmse = np.sqrt(mean_squared_error(actual_prices, pred_prices))

    # Directional accuracy: did we predict the direction of price change correctly?
    # Compare: if prediction went up vs actual going up (from previous actual close)
    actual_direction = np.sign(np.diff(actual_prices))     # shape: (n-1,)
    pred_direction = np.sign(pred_prices[1:] - actual_prices[:-1])  # predict vs last known
    directional_acc = np.mean(actual_direction == pred_direction) * 100

    # Sharpe Ratio (simplified, using daily returns)
    returns = np.diff(pred_prices) / pred_prices[:-1]
    sharpe = (returns.mean() / (returns.std() + 1e-9)) * np.sqrt(252)  # annualized

    return {
        "mae": round(float(mae), 4),
        "rmse": round(float(rmse), 4),
        "directional_accuracy_pct": round(float(directional_acc), 2),
        "sharpe_ratio": round(float(sharpe), 4),
        "n_samples": len(actual_prices),
        "actual_prices": actual_prices.tolist(),
        "predicted_prices": pred_prices.tolist(),
        "lower_bound": close_scaler.inverse_transform(
            mc_result["lower"].reshape(-1, 1)).flatten().tolist(),
        "upper_bound": close_scaler.inverse_transform(
            mc_result["upper"].reshape(-1, 1)).flatten().tolist(),
    }
