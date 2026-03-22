"""
cache.py — 3-Tier Prediction Cache
Tier 1: Python in-memory dict (sub-millisecond)
Tier 2: Local JSON flat file cache (pre-computed nightly)
Tier 3: Live inference (cold path — slowest but always available)
"""
import json
import os
import time
import hashlib
from typing import Optional, Callable

CACHE_DIR = os.path.join(os.path.dirname(__file__), ".cache")
os.makedirs(CACHE_DIR, exist_ok=True)

# Tier 1: In-memory cache
_memory_cache: dict = {}

# TTL in seconds (6 hours for predictions)
PREDICTION_TTL = 60 * 60 * 6


def _cache_key(coin: str, horizon: int) -> str:
    raw = f"{coin.upper()}_{horizon}"
    return hashlib.md5(raw.encode()).hexdigest()


def _file_path(key: str) -> str:
    return os.path.join(CACHE_DIR, f"{key}.json")


def get_cached(coin: str, horizon: int) -> Optional[dict]:
    """
    Check Tier 1 (memory) then Tier 2 (file).
    Returns None if cache is cold or expired.
    """
    key = _cache_key(coin, horizon)

    # --- Tier 1: Memory ---
    if key in _memory_cache:
        entry = _memory_cache[key]
        if time.time() - entry["timestamp"] < PREDICTION_TTL:
            return entry["data"]
        else:
            del _memory_cache[key]

    # --- Tier 2: File ---
    fpath = _file_path(key)
    if os.path.exists(fpath):
        try:
            with open(fpath, "r") as f:
                entry = json.load(f)
            if time.time() - entry["timestamp"] < PREDICTION_TTL:
                # Promote back to memory
                _memory_cache[key] = entry
                return entry["data"]
            else:
                os.remove(fpath)  # Expired, clean up
        except Exception:
            pass

    return None


def set_cache(coin: str, horizon: int, data: dict):
    """Write to both Tier 1 (memory) and Tier 2 (file)."""
    key = _cache_key(coin, horizon)
    entry = {"timestamp": time.time(), "data": data}

    # Tier 1
    _memory_cache[key] = entry

    # Tier 2
    try:
        with open(_file_path(key), "w") as f:
            json.dump(entry, f)
    except Exception as e:
        print(f"[cache.py] Failed to write file cache: {e}")


def cached_or_compute(coin: str, horizon: int, compute_fn: Callable) -> dict:
    """
    Main entry point. Tries cache first (Tier 1 → Tier 2),
    falls back to Tier 3 (live inference via compute_fn).
    """
    result = get_cached(coin, horizon)
    if result is not None:
        result["cached"] = True
        return result

    # Tier 3: Live inference
    start = time.time()
    result = compute_fn()
    elapsed_ms = (time.time() - start) * 1000
    result["inference_ms"] = round(elapsed_ms, 1)
    result["cached"] = False

    set_cache(coin, horizon, result)
    return result


def warm_cache(coin: str, horizon: int, compute_fn: Callable):
    """Pre-warm cache for a coin. Called by nightly cron. """
    print(f"[cache.py] Warming cache for {coin} horizon={horizon}d...")
    result = compute_fn()
    set_cache(coin, horizon, result)
    print(f"[cache.py] Cache warm for {coin}.")
