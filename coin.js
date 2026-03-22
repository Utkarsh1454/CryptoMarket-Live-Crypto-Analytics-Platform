/**
 * coin.js — Coin Detail Page
 * Data: CoinGecko API (free, CORS-enabled)
 * GET /coins/{id}                                  — metadata + market data + tickers
 * GET /coins/{id}/market_chart?vs_currency=usd&days=30 — historical prices
 */

const GECKO    = 'https://api.coingecko.com/api/v3';
const CURRENCY = getCurrency(); // from currency.js

let priceChart = null;
let livePrice  = 0;

const coinId = new URLSearchParams(location.search).get('id') || 'bitcoin';

document.addEventListener('DOMContentLoaded', () => loadCoinDetail());

// ════════════════════════════════════
// MAIN LOADER
// ════════════════════════════════════

async function loadCoinDetail() {
    showOverlay(true);
    try {
        const [coin, chartData] = await Promise.all([
            fetch(`${GECKO}/coins/${coinId}?localization=false&tickers=true&market_data=true&community_data=false&developer_data=false`).then(r => r.json()),
            fetch(`${GECKO}/coins/${coinId}/market_chart?vs_currency=${CURRENCY}&days=${chartDays}`).then(r => r.json())
        ]);

        if (coin.error) throw new Error(coin.error);

        livePrice = coin.market_data?.current_price?.[CURRENCY] ?? coin.market_data?.current_price?.usd ?? 0;
        renderHeader(coin);
        renderKeyStats(coin);
        initChart();
        renderChart(chartData);
        renderDescription(coin);
        renderMarkets(coin.tickers ?? []);
        renderATH(coin);
        renderSupply(coin);
        renderSocialLinks(coin);
        setupConverter(coin);
        document.title = `${coin.name} (${coin.symbol?.toUpperCase()}) | CryptoMarket`;
        // Update ATL too
        const md = coin.market_data ?? {};
        setHTML('atl-price', fmtPrice(md.atl?.[CURRENCY] ?? md.atl?.usd));
        const atlDate = md.atl_date?.[CURRENCY] ? new Date(md.atl_date[CURRENCY]).toLocaleDateString('en-US', {year:'numeric',month:'short',day:'numeric'}) : '--';
        setHTML('atl-date', atlDate);
        const atlPct = md.atl_change_percentage?.[CURRENCY] ?? md.atl_change_percentage?.usd;
        setHTML('atl-pct', atlPct != null ? `${atlPct.toFixed(1)}% from ATL` : '');

    } catch(e) {
        console.error('Coin load failed', e);
        document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:var(--red);font-size:1.2rem">⚠ Could not load coin data: ${e.message}</div>`;
    } finally {
        showOverlay(false);
    }
}

// ════════════════════════════════════
// HEADER
// ════════════════════════════════════

function renderHeader(coin) {
    const md   = coin.market_data ?? {};
    const img  = coin.image?.large ?? coin.image?.small ?? '';
    const sym  = (coin.symbol ?? '').toUpperCase();
    const curr = CURRENCY.toUpperCase();
    const price = md.current_price?.[CURRENCY] ?? md.current_price?.usd ?? 0;

    // Logo
    const logoEl = document.getElementById('coin-logo');
    if (logoEl) {
        if (img) {
            logoEl.innerHTML = `<img src="${img}" alt="${sym}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
        } else {
            logoEl.textContent = sym.slice(0,2);
        }
    }

    setText('coin-name', coin.name ?? '--');
    setText('coin-symbol', sym);
    setText('coin-rank', `#${coin.market_cap_rank ?? '--'}`);

    // Tags from categories
    const tags = (coin.categories ?? []).filter(Boolean).slice(0, 4);
    setText('coin-tags', '');
    const tagsEl = document.getElementById('coin-tags');
    if (tagsEl) tagsEl.innerHTML = tags.map(t => `<span class="coin-tag">${t}</span>`).join('');

    // Price
    setText('coin-price', fmtPrice(price));
    // Breadcrumb
    setText('bc-name', coin.name ?? '--');
    setText('about-coin-name', coin.name ?? '');
    // Converter label
    const convCurrLabel = document.getElementById('conv-currency-label');
    if (convCurrLabel) convCurrLabel.textContent = curr;

    // % changes
    const changes = [
        ['pct-1h',  md.price_change_percentage_1h_in_currency?.[CURRENCY] ?? md.price_change_percentage_1h_in_currency?.usd],
        ['pct-24h', md.price_change_percentage_24h],
        ['pct-7d',  md.price_change_percentage_7d],
        ['pct-30d', md.price_change_percentage_30d],
    ];
    changes.forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (val == null) { el.textContent = '--'; return; }
        const up = val >= 0;
        el.className = `pct-badge ${up ? 'up' : 'down'}`;
        el.innerHTML = `<span class="pct-label">${id.replace('pct-','').toUpperCase()}</span> ${up ? '▲' : '▼'} ${Math.abs(val).toFixed(2)}%`;
    });
}

// ════════════════════════════════════
// KEY STATS GRID
// ════════════════════════════════════

function renderKeyStats(coin) {
    const md = coin.market_data ?? {};
    const fmt = fmtLarge;

    setHTML('ks-mcap',  fmtLarge(md.market_cap?.[CURRENCY] ?? md.market_cap?.usd));
    setHTML('ks-fdv',   fmtLarge(md.fully_diluted_valuation?.[CURRENCY] ?? md.fully_diluted_valuation?.usd));
    setHTML('ks-vol',   fmtLarge(md.total_volume?.[CURRENCY] ?? md.total_volume?.usd));
    setHTML('ks-circ',  fmtSupply(md.circulating_supply));
    setHTML('ks-max',   fmtSupply(md.max_supply));
    const volUsd  = md.total_volume?.[CURRENCY] ?? md.total_volume?.usd ?? 0;
    const mcapUsd = md.market_cap?.[CURRENCY] ?? md.market_cap?.usd ?? 1;
}

// ════════════════════════════════════
// CHART
// ════════════════════════════════════

function initChart() {
    const canvas = document.getElementById('price-chart');
    if (!canvas) return;
    priceChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels: [], datasets: [] },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#121A2B', borderColor: '#1E293B', borderWidth: 1,
                    callbacks: {
                        label: ctx => ` $${ctx.raw?.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                    }
                }
            },
            scales: {
                x: { grid: { color: '#1E293B' }, ticks: { color: '#94A3B8', maxTicksLimit: 7, font: { size: 11 } } },
                y: { grid: { color: '#1E293B' }, ticks: { color: '#94A3B8', font: { size: 11 }, callback: v => `$${fmtK(v)}` }, position: 'right' }
            }
        }
    });
    bindChartRangeButtons();
}

function renderChart(chartData) {
    if (!priceChart) return;

    // chartData.prices = [[timestamp, price], ...]
    const prices = chartData.prices ?? [];
    const labels = prices.map(([ts]) => {
        const d = new Date(ts);
        return `${d.getMonth()+1}/${d.getDate()}`;
    });
    const closes = prices.map(([,p]) => p);
    const sma    = calcSMA(closes, 7);

    const ctx  = priceChart.ctx;
    const grad = ctx.createLinearGradient(0, 0, 0, 320);
    grad.addColorStop(0, 'rgba(34,211,238,0.18)');
    grad.addColorStop(1, 'rgba(34,211,238,0)');

    priceChart.data.labels = labels;
    priceChart.data.datasets = [
        {
            label: 'Price',
            data: closes,
            borderColor: '#22D3EE',
            backgroundColor: grad,
            borderWidth: 2.5,
            pointRadius: 0, pointHoverRadius: 5,
            fill: true, tension: 0.25,
        },
        {
            label: 'SMA(7)',
            data: sma,
            borderColor: '#2563EB',
            borderWidth: 1.5,
            borderDash: [5, 4],
            pointRadius: 0,
            fill: false, tension: 0.3,
        }
    ];
    priceChart.update('none');

    // OHLCV row (approximate from daily candles)
    const last = prices[prices.length - 1] ?? [];
    setHTML('ohlcv-open',  fmtPrice(prices[prices.length - 2]?.[1]));
    setHTML('ohlcv-high',  fmtPrice(Math.max(...closes.slice(-24))));
    setHTML('ohlcv-low',   fmtPrice(Math.min(...closes.slice(-24))));
    setHTML('ohlcv-close', fmtPrice(last[1]));
    setHTML('ohlcv-vol',   '--');
}

function bindChartRangeButtons() {
    document.querySelectorAll('.range-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            chartDays = btn.dataset.range; // Update global chartDays
            showOverlay(true);
            try {
                const res = await fetch(`${GECKO}/coins/${coinId}/market_chart?vs_currency=${CURRENCY}&days=${chartDays}`);
                const data = await res.json();
                renderChart(data);
            } catch(e) { console.error('Chart update failed', e); }
            finally { showOverlay(false); }
        });
    });
}

// ════════════════════════════════════
// DESCRIPTION + LINKS
// ════════════════════════════════════

function renderDescription(coin) {
    const desc = coin.description?.en ?? '';
    const el   = document.getElementById('coin-description');
    if (el) el.textContent = stripHtml(desc).slice(0, 600) + (desc.length > 600 ? '...' : '');

    const links = [
        { icon: 'fa-globe',     label: 'Website',    href: coin.links?.homepage?.[0] },
        { icon: 'fa-file-lines',label: 'Whitepaper', href: coin.links?.whitepaper },
        { icon: 'fab fa-github',label: 'GitHub',     href: coin.links?.repos_url?.github?.[0] },
        { icon: 'fab fa-reddit',label: 'Reddit',     href: coin.links?.subreddit_url },
        { icon: 'fab fa-twitter',label: 'Twitter',   href: coin.links?.twitter_screen_name ? `https://twitter.com/${coin.links.twitter_screen_name}` : null },
    ].filter(l => l.href);

    const el2 = document.getElementById('coin-links');
    if (el2) el2.innerHTML = links.map(l => `
        <a href="${l.href}" target="_blank" rel="noopener" class="coin-link-btn">
            <i class="fa-solid ${l.icon}"></i> ${l.label}
        </a>`).join('');
}

// ════════════════════════════════════
// MARKETS TABLE
// ════════════════════════════════════

function renderMarkets(tickers) {
    const tbody = document.getElementById('markets-tbody');
    if (!tbody) return;

    const top = tickers
        .filter(t => t.converted_last?.usd > 0)
        .sort((a,b) => (b.converted_volume?.usd ?? 0) - (a.converted_volume?.usd ?? 0))
        .slice(0, 20);

    if (!top.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-2)">No market data available</td></tr>`;
        return;
    }

    tbody.innerHTML = top.map((t, i) => {
        const trust  = t.trust_score ?? 'N/A';
        const tClass = trust === 'green' ? 'trust-high' : trust === 'yellow' ? 'trust-med' : 'trust-low';
        const tLabel = trust === 'green' ? 'High' : trust === 'yellow' ? 'Med' : 'Low';

        return `
        <tr>
            <td>${i + 1}</td>
            <td>${t.market?.name ?? '--'}</td>
            <td>${t.base ?? '--'}/${t.target ?? '--'}</td>
            <td class="price-mono">${fmtPrice(t.converted_last?.[CURRENCY] ?? t.converted_last?.usd)}</td>
            <td class="price-mono">${fmtLarge(t.converted_volume?.[CURRENCY] ?? t.converted_volume?.usd)}</td>
            <td><span class="trust-score ${tClass}">${tLabel}</span></td>
        </tr>`;
    }).join('');
}

// ════════════════════════════════════
// ATH
// ════════════════════════════════════

function renderATH(coin) {
    const md = coin.market_data ?? {};
    const ath     = md.ath?.[CURRENCY] ?? md.ath?.usd;
    const athDate = md.ath_date?.[CURRENCY] ? new Date(md.ath_date[CURRENCY]).toLocaleDateString('en-US', {year:'numeric',month:'short',day:'numeric'}) : '--';
    const athPct  = md.ath_change_percentage?.[CURRENCY] ?? md.ath_change_percentage?.usd;

    setHTML('ath-price', fmtPrice(ath));
    setHTML('ath-date',  athDate);
    setHTML('ath-pct',   athPct != null ? `${athPct.toFixed(1)}% from ATH` : '');
}

// ════════════════════════════════════
// SUPPLY
// ════════════════════════════════════

function renderSupply(coin) {
    const md   = coin.market_data ?? {};
    const circ = md.circulating_supply ?? 0;
    const max  = md.max_supply;
    const tot  = md.total_supply ?? circ;

    const pct = max ? Math.min(100, (circ / max * 100)) : (circ / tot * 100);

    const fillEl = document.getElementById('supply-fill');
    if (fillEl) fillEl.style.width = `${pct.toFixed(1)}%`;

    setHTML('supply-circ', fmtSupply(circ));
    setHTML('supply-total', fmtSupply(tot));
    setHTML('supply-max', fmtSupply(max));
}

// ════════════════════════════════════
// SOCIAL LINKS
// ════════════════════════════════════

function renderSocialLinks(coin) {
    const el = document.getElementById('social-links');
    if (!el) return;

    const socials = [
        { icon: 'fab fa-twitter',   label: 'Twitter', href: coin.links?.twitter_screen_name ? `https://twitter.com/${coin.links.twitter_screen_name}` : null },
        { icon: 'fab fa-reddit',    label: 'Reddit',  href: coin.links?.subreddit_url },
        { icon: 'fab fa-telegram',  label: 'Telegram',href: coin.links?.telegram_channel_identifier ? `https://t.me/${coin.links.telegram_channel_identifier}` : null },
        { icon: 'fab fa-github',    label: 'GitHub',  href: coin.links?.repos_url?.github?.[0] },
        { icon: 'fa-solid fa-globe',label: 'Website', href: coin.links?.homepage?.[0] },
    ].filter(s => s.href);

    el.innerHTML = socials.map(s => `
        <a href="${s.href}" target="_blank" rel="noopener" class="social-link-item">
            <i class="${s.icon}"></i> ${s.label}
        </a>`).join('');
}

// ════════════════════════════════════
// CONVERTER
// ════════════════════════════════════

function setupConverter(coin) {
    const sym  = (coin.symbol ?? '').toUpperCase();
    const inp  = document.getElementById('conv-coin-input');
    const out  = document.getElementById('conv-usd-output');
    const lblCoin  = document.getElementById('conv-coin-label');
    const lblCurr  = document.getElementById('conv-currency-label');

    if (!inp || !out) return;
    if (lblCoin) lblCoin.textContent = sym;
    if (lblCurr) lblCurr.textContent = getCurrencyInfo().name;

    const convert = () => {
        const val = parseFloat(inp.value) || 0;
        const result = val * livePrice;
        out.value = result.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
    };
    inp.addEventListener('input', convert);
    inp.value = '1';
    convert();
}

// ════════════════════════════════════
// HELPERS
// ════════════════════════════════════

function showOverlay(show) {
    const el = document.getElementById('chart-overlay');
    if (el) el.classList.toggle('hidden', !show);
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val ?? '--';
}

function setHTML(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = val ?? '--';
}

function calcSMA(data, period) {
    return data.map((_, i) => {
        if (i < period - 1) return null;
        const slice = data.slice(i - period + 1, i + 1);
        return slice.reduce((s, v) => s + v, 0) / period;
    });
}

// fmtPrice, fmtLarge — from currency.js

function fmtK(v) {
    if (v >= 1e6) return `${(v/1e6).toFixed(1)}M`;
    if (v >= 1e3) return `${(v/1e3).toFixed(1)}K`;
    return v?.toFixed(2) ?? '';
}

function fmtSupply(v) {
    if (!v) return '∞';
    if (v >= 1e9) return `${(v/1e9).toFixed(2)}B`;
    if (v >= 1e6) return `${(v/1e6).toFixed(2)}M`;
    if (v >= 1e3) return `${(v/1e3).toFixed(2)}K`;
    return v?.toLocaleString() ?? '--';
}

function stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}
