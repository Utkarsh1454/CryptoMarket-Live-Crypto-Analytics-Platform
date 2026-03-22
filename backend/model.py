"""
model.py — Parallel CNN + LSTM with Monte Carlo Dropout
Both branches see the full raw sequence for better accuracy.
MC Dropout is active on BOTH branches so uncertainty estimation is correct.
"""
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers, Model


def build_model(seq_len: int, n_features: int, dropout_rate: float = 0.2) -> Model:
    """
    Parallel CNN + LSTM model.
    - LSTM branch: captures long-term temporal dependencies
    - CNN branch: captures short-term local patterns
    Both branches receive the raw input sequence directly.
    Dropout(training=True) on both branches enables MC Dropout at inference.
    """
    inp = layers.Input(shape=(seq_len, n_features), name="input")

    # --- LSTM Branch ---
    lstm_out = layers.LSTM(64, return_sequences=True, name="lstm_1")(inp)
    lstm_out = layers.Dropout(dropout_rate, name="lstm_dropout_1")(lstm_out, training=True)
    lstm_out = layers.LSTM(32, return_sequences=False, name="lstm_2")(lstm_out)
    lstm_out = layers.Dropout(dropout_rate, name="lstm_dropout_2")(lstm_out, training=True)

    # --- CNN Branch (parallel — also sees raw inp) ---
    cnn_out = layers.Conv1D(64, kernel_size=3, padding="causal", activation="relu", name="cnn_1")(inp)
    cnn_out = layers.Dropout(dropout_rate, name="cnn_dropout_1")(cnn_out, training=True)  # Fixed: was missing
    cnn_out = layers.Conv1D(32, kernel_size=3, padding="causal", activation="relu", name="cnn_2")(cnn_out)
    cnn_out = layers.Dropout(dropout_rate, name="cnn_dropout_2")(cnn_out, training=True)
    cnn_out = layers.GlobalAveragePooling1D(name="cnn_pool")(cnn_out)

    # --- Merge ---
    merged = layers.Concatenate(name="merge")([lstm_out, cnn_out])
    merged = layers.Dense(64, activation="relu", name="dense_1")(merged)
    merged = layers.Dropout(dropout_rate, name="merge_dropout")(merged, training=True)
    out = layers.Dense(1, name="output")(merged)

    model = Model(inputs=inp, outputs=out, name="CryptoForecaster")
    model.compile(optimizer=tf.keras.optimizers.Adam(1e-3), loss="mse")
    return model


def monte_carlo_predict(model: Model, X: np.ndarray, n_passes: int = 100) -> dict:
    """
    Run n_passes forward passes with Dropout active (training=True is baked in).
    Returns mean prediction + 95% confidence interval.
    """
    preds = np.array([model.predict(X, verbose=0) for _ in range(n_passes)])
    # preds shape: (n_passes, n_samples, 1)
    preds = preds.squeeze(-1)  # (n_passes, n_samples)

    mean = preds.mean(axis=0)
    std = preds.std(axis=0)

    lower = mean - 1.96 * std  # 95% CI lower
    upper = mean + 1.96 * std  # 95% CI upper

    return {"mean": mean, "lower": lower, "upper": upper, "std": std}
