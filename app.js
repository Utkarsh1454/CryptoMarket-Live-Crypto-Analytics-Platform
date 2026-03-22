/**
 * app.js — Market Overview Page
 * Data: CoinGecko API (free, CORS-enabled from localhost)
 * https://api.coingecko.com/api/v3
 */

const GECKO    = 'https://api.coingecko.com/api/v3';
const CURRENCY = getCurrency(); // from currency.js

let allCoins     = [];
let displayCoins = [];
let page         = 0;
const PAGE_SIZE  = 50;
let sortField    = 'rank';
let sortAsc      = true;
let filterMode   = 'all';
let sparkCharts  = {};

const globalSearch = document.getElementById('global-search');
const tableSearch  = document.getElementById('table-search');
const tbody        = document.getElementById('market-tbody');
const loadMoreBtn  = document.getElementById('load-more-btn');

document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([fetchGlobal(), fetchTickers()]);
    bindControls();
});

// ════════════════════════════════
// COINGECKO FETCHES
// ════════════════════════════════

async function fetchGlobal() {
    try {
        const res  = await fetch(`${GECKO}/global`);
        const json = await res.json();
        const d    = json.data;

        const mcap     = d.total_market_cap?.[CURRENCY] ?? d.total_market_cap?.usd ?? 0;
        const vol      = d.total_volume?.[CURRENCY] ?? d.total_volume?.usd ?? 0;
        const btcDom   = d.market_cap_percentage?.btc ?? 0;
        const ethDom   = d.market_cap_percentage?.eth ?? 0;
        const numCoins = d.active_cryptocurrencies ?? 0;

        document.getElementById('gs-mcap').textContent  = fmtLarge(mcap);
        document.getElementById('gs-vol').textContent   = fmtLarge(vol);
        document.getElementById('gs-btc').textContent   = `${btcDom.toFixed(1)}%`;
        document.getElementById('gs-coins').textContent = numCoins.toLocaleString();

        document.getElementById('tb-coins').textContent = `${numCoins.toLocaleString()} Coins`;
        document.getElementById('tb-mcap').textContent  = fmt(mcap);
        document.getElementById('tb-vol').textContent   = fmt(vol);
        document.getElementById('tb-btc').textContent   = `${btcDom.toFixed(1)}%`;
        document.getElementById('tb-eth').textContent   = `${ethDom.toFixed(1)}%`;
        document.getElementById('hero-coin-count').textContent = numCoins.toLocaleString();

    } catch(e) { console.error('Global stats failed', e); }
}

async function fetchTickers() {
    tbody.innerHTML = `<tr><td colspan="9" class="table-loading"><div class="loading-pulse"><div class="pulse-dot"></div> Fetching live market data...</div></td></tr>`;
    try {
        const params = new URLSearchParams({
            vs_currency: CURRENCY,
            order: 'market_cap_desc',
            per_page: 250,
            page: 1,
            sparkline: true,
            price_change_percentage: '1h,7d'
        });
        const res = await fetch(`${GECKO}/coins/markets?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        allCoins = await res.json();
        applyFilterAndRender();
    } catch(e) {
        console.error('Tickers failed', e);
        tbody.innerHTML = `<tr><td colspan="9" class="table-loading" style="color:var(--red)">⚠ Failed to fetch market data. ${e.message}</td></tr>`;
    }
}

// ════════════════════════════════
// FILTER + SORT + RENDER
// ════════════════════════════════

function applyFilterAndRender() {
    const query = (tableSearch?.value ?? '').toLowerCase();
    let coins   = [...allCoins];

    if (query) {
        coins = coins.filter(c =>
            c.name.toLowerCase().includes(query) ||
            c.symbol.toLowerCase().includes(query)
        );
    }

    if (filterMode === 'top')     coins = coins.slice(0, 100);
    if (filterMode === 'gainers') coins = coins.filter(c => (c.price_change_percentage_24h ?? 0) > 0)
                                               .sort((a,b) => b.price_change_percentage_24h - a.price_change_percentage_24h);
    if (filterMode === 'losers')  coins = coins.filter(c => (c.price_change_percentage_24h ?? 0) < 0)
                                               .sort((a,b) => a.price_change_percentage_24h - b.price_change_percentage_24h);

    if (filterMode !== 'gainers' && filterMode !== 'losers') {
        coins.sort((a, b) => {
            let av, bv;
            switch(sortField) {
                case 'rank':       av = a.market_cap_rank ?? 9999;                          bv = b.market_cap_rank ?? 9999; break;
                case 'price':      av = a.current_price ?? 0;                               bv = b.current_price ?? 0; break;
                case 'change_1h':  av = a.price_change_percentage_1h_in_currency ?? 0;      bv = b.price_change_percentage_1h_in_currency ?? 0; break;
                case 'change_24h': av = a.price_change_percentage_24h ?? 0;                 bv = b.price_change_percentage_24h ?? 0; break;
                case 'change_7d':  av = a.price_change_percentage_7d_in_currency ?? 0;      bv = b.price_change_percentage_7d_in_currency ?? 0; break;
                case 'market_cap': av = a.market_cap ?? 0;                                  bv = b.market_cap ?? 0; break;
                case 'volume':     av = a.total_volume ?? 0;                                bv = b.total_volume ?? 0; break;
                default:           av = a.market_cap_rank ?? 9999;                          bv = b.market_cap_rank ?? 9999;
            }
            return sortAsc ? av - bv : bv - av;
        });
    }

    displayCoins = coins;
    page = 0;
    renderTable(true);
}

function renderTable(reset = false) {
    const slice = displayCoins.slice(0, (page + 1) * PAGE_SIZE);

    if (reset) {
        Object.values(sparkCharts).forEach(c => c.destroy());
        sparkCharts = {};
    }

    tbody.innerHTML = slice.map(coin => {
        const p   = coin.current_price;
        const h1  = pctCell(coin.price_change_percentage_1h_in_currency);
        const h24 = pctCell(coin.price_change_percentage_24h);
        const d7  = pctCell(coin.price_change_percentage_7d_in_currency);
        const sid = `spark-${coin.id}`;

        return `
        <tr onclick="goToCoin('${coin.id}')" style="cursor:pointer">
            <td>${coin.market_cap_rank ?? '--'}</td>
            <td>
                <div class="coin-name-cell">
                    <img src="${coin.image}" alt="${coin.symbol}"
                         width="34" height="34"
                         style="border-radius:50%;object-fit:cover;flex-shrink:0"
                         onerror="this.style.display='none'">
                    <div>
                        <div class="coin-cell-name">${coin.name}</div>
                        <div class="coin-cell-symbol">${coin.symbol.toUpperCase()}</div>
                    </div>
                </div>
            </td>
            <td class="price-mono">${fmtPrice(p)}</td>
            <td>${h1}</td>
            <td>${h24}</td>
            <td>${d7}</td>
            <td class="price-mono">${fmtLarge(coin.market_cap)}</td>
            <td class="price-mono">${fmtLarge(coin.total_volume)}</td>
            <td class="sparkline-cell"><canvas id="${sid}" width="100" height="36"></canvas></td>
        </tr>`;
    }).join('');

    requestAnimationFrame(() => drawSparklines(slice));
    loadMoreBtn.style.display = displayCoins.length > slice.length ? 'inline-block' : 'none';
}

function drawSparklines(coins) {
    coins.forEach(coin => {
        const canvas = document.getElementById(`spark-${coin.id}`);
        if (!canvas || sparkCharts[coin.id]) return;

        const prices = coin.sparkline_in_7d?.price ?? [];
        if (!prices.length) return;

        const isUp = (coin.price_change_percentage_7d_in_currency ?? 0) >= 0;
        sparkCharts[coin.id] = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: Array(prices.length).fill(''),
                datasets: [{ data: prices, borderColor: isUp ? '#16C784' : '#EA3943', borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.4 }]
            },
            options: {
                responsive: false, animation: false,
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                scales: { x: { display: false }, y: { display: false } }
            }
        });
    });
}

// ════════════════════════════════
// CONTROLS
// ════════════════════════════════

function bindControls() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterMode = btn.dataset.filter;
            applyFilterAndRender();
        });
    });

    document.querySelectorAll('.market-table th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            if (sortField === field) sortAsc = !sortAsc;
            else { sortField = field; sortAsc = field === 'rank'; }
            applyFilterAndRender();
        });
    });

    loadMoreBtn?.addEventListener('click', () => { page++; renderTable(false); });
    tableSearch?.addEventListener('input', debounce(applyFilterAndRender, 300));
    globalSearch?.addEventListener('keypress', e => {
        if (e.key === 'Enter') { tableSearch.value = globalSearch.value; applyFilterAndRender(); globalSearch.value = ''; }
    });
}

function goToCoin(id) { window.location.href = `coin.html?id=${encodeURIComponent(id)}`; }

// ════════════════════════════════
// HELPERS
// ════════════════════════════════

// fmtPrice, fmtLarge, pctCell — defined in currency.js
function pctCell(v) {
    if (v == null) return '<span class="pct-flat">--</span>';
    const cls = v >= 0 ? 'pct-up' : 'pct-down';
    const ico = v >= 0 ? '▲' : '▼';
    return `<span class="${cls}">${ico} ${Math.abs(v).toFixed(2)}%</span>`;
}

function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
