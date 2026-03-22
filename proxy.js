/**
 * proxy.js — Shared Coinpaprika fetch helper
 * Priority order:
 *   1. Local FastAPI backend (/paprika/...) — most reliable, no CORS
 *   2. Direct Coinpaprika API — works on deployed domains
 *   3. Public CORS proxies — fallbacks for local dev without backend
 *
 * Include this BEFORE app.js / coin.js / trending.js / news.js
 */

const PAPRIKA    = 'https://api.coinpaprika.com/v1';
const BACKEND    = 'http://localhost:8000';

// Public CORS proxy fallbacks (used only if backend is offline)
const CORS_PROXIES = [
    url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

// Track whether the backend is available (cached per page load)
let _backendOk = null;

async function _checkBackend() {
    if (_backendOk !== null) return _backendOk;
    try {
        const res = await fetch(`${BACKEND}/health`, { signal: AbortSignal.timeout(2000) });
        _backendOk = res.ok;
    } catch (_) {
        _backendOk = false;
    }
    return _backendOk;
}

async function paprikaFetch(path) {
    // 1️⃣ Try FastAPI backend proxy (best option — server-side, no CORS)
    if (await _checkBackend()) {
        try {
            const res = await fetch(`${BACKEND}/paprika${path}`);
            if (res.ok) return res.json();
        } catch (_) { _backendOk = false; }
    }

    // 2️⃣ Try direct Coinpaprika call (works on deployed non-localhost domains)
    const fullUrl = `${PAPRIKA}${path}`;
    try {
        const res = await fetch(fullUrl, { mode: 'cors' });
        if (res.ok) return res.json();
    } catch (_) { /* CORS blocked on localhost */ }

    // 3️⃣ Try each public CORS proxy in sequence
    for (const proxyFn of CORS_PROXIES) {
        try {
            const res = await fetch(proxyFn(fullUrl));
            if (res.ok) {
                const text = await res.text();
                return JSON.parse(text);
            }
        } catch (_) { continue; }
    }

    throw new Error(`All fetch attempts failed for ${path}`);
}
