/**
 * currency.js — Shared currency management
 * Persists selection in localStorage. Reload re-fetches data in chosen currency.
 * Include this FIRST, before page-specific scripts.
 */

const CURRENCIES = {
    usd: { symbol: '$',  name: 'USD', label: '$ USD', decimals: 2  },
    eur: { symbol: '€',  name: 'EUR', label: '€ EUR', decimals: 2  },
    gbp: { symbol: '£',  name: 'GBP', label: '£ GBP', decimals: 2  },
    inr: { symbol: '₹',  name: 'INR', label: '₹ INR', decimals: 0  },
    jpy: { symbol: '¥',  name: 'JPY', label: '¥ JPY', decimals: 0  },
    cad: { symbol: 'C$', name: 'CAD', label: 'C$ CAD', decimals: 2  },
    aud: { symbol: 'A$', name: 'AUD', label: 'A$ AUD', decimals: 2  },
    cny: { symbol: '¥',  name: 'CNY', label: '¥ CNY', decimals: 2  },
    btc: { symbol: '₿',  name: 'BTC', label: '₿ BTC', decimals: 8  },
    eth: { symbol: 'Ξ',  name: 'ETH', label: 'Ξ ETH', decimals: 6  },
};

function getCurrency()       { return localStorage.getItem('cryptoCurrency') || 'usd'; }
function getCurrencyInfo()   { return CURRENCIES[getCurrency()] ?? CURRENCIES.usd; }
function getCurrencySymbol() { return getCurrencyInfo().symbol; }

function changeCurrency(value) {
    localStorage.setItem('cryptoCurrency', value);
    // Animate out, then reload
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.2s';
    setTimeout(() => location.reload(), 200);
}

// ── Formatters that respect selected currency ─────────────
function fmtPrice(v) {
    const info = getCurrencyInfo();
    if (!v && v !== 0) return '--';
    const sym = info.symbol;

    if (info.name === 'BTC') {
        return `₿ ${v < 0.001 ? v.toFixed(8) : v < 1 ? v.toFixed(6) : v.toFixed(4)}`;
    }
    if (info.name === 'ETH') {
        return `Ξ ${v < 0.01 ? v.toFixed(6) : v.toFixed(4)}`;
    }
    if (info.name === 'JPY' || info.name === 'INR') {
        if (v >= 1e7) return `${sym}${(v/1e7).toFixed(2)}Cr`;
        if (v >= 1e5) return `${sym}${(v/1e5).toFixed(2)}L`;
        return `${sym}${Math.round(v).toLocaleString()}`;
    }

    if (v >= 1000) return `${sym}${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    if (v >= 1)    return `${sym}${v.toFixed(4)}`;
    if (v >= 0.01) return `${sym}${v.toFixed(5)}`;
    return `${sym}${v.toFixed(8)}`;
}

function fmtLarge(v) {
    const sym = getCurrencySymbol();
    if (!v) return '--';
    if (v >= 1e12) return `${sym}${(v/1e12).toFixed(2)}T`;
    if (v >= 1e9)  return `${sym}${(v/1e9).toFixed(2)}B`;
    if (v >= 1e6)  return `${sym}${(v/1e6).toFixed(2)}M`;
    return `${sym}${v.toLocaleString()}`;
}

// ── Init selector on every page ───────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const sel = document.getElementById('currency-select');
    if (sel) sel.value = getCurrency();
});
