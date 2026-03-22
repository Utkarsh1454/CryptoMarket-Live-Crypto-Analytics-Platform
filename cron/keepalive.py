"""
keepalive.py — Cron keep-warm script.
Pings the /health endpoint every 10 minutes to prevent cold starts on Render's free tier.

Setup: Run this locally, OR schedule it on cron-job.org to hit:
    GET https://your-render-app.onrender.com/health
    every 10 minutes.
"""
import time
import urllib.request
import urllib.error

# Update this to your deployed Render URL
HEALTH_URL = "https://your-crypto-forecaster.onrender.com/health"
INTERVAL_SECONDS = 60 * 10  # 10 minutes

def ping():
    try:
        with urllib.request.urlopen(HEALTH_URL, timeout=10) as res:
            print(f"[keepalive] OK — {res.status} at {time.strftime('%H:%M:%S')}")
    except urllib.error.URLError as e:
        print(f"[keepalive] FAILED — {e}")

if __name__ == "__main__":
    print(f"[keepalive] Starting. Pinging {HEALTH_URL} every {INTERVAL_SECONDS // 60} minutes.")
    while True:
        ping()
        time.sleep(INTERVAL_SECONDS)
