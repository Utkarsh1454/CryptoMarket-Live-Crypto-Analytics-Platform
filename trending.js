/**
 * trending.js — Trending Page
 * Data: CoinGecko API (free, CORS-enabled)
 * /search/trending + /coins/markets
 */

const GECKO    = 'https://api.coingecko.com/api/v3';
const CURRENCY = getCurrency(); // from currency.js

let allTickers = [];
let trending   = [];
let activeTab  = 'gainers';
let sparkCharts = {};

document.addEventListener('DOMContentLoaded', async () => {
    await fetchAllData();
    bindTabs();
    bindSearch();
});

// ════════════════════════════
// DATA FETCH
// ════════════════════════════

async function fetchAllData() {
    try {
        const [marketsRes, trendingRes] = await Promise.all([
            fetch(`${GECKO}/coins/markets?vs_currency=${CURRENCY}&order=market_cap_desc&per_page=250&page=1&sparkline=true&price_change_percentage=1h,7d`),
            fetch(`${GECKO}/search/trending`)
        ]);

        allTickers = await marketsRes.json();
        const trendingData = await trendingRes.json();
        trending = trendingData.coins?.map(c => c.item) ?? [];

        updateStatsStrip();
        renderTab('gainers');
    } catch(e) {
        console.error('Data fetch failed', e);
        document.getElementById('trending-grid').innerHTML = `<p style="color:var(--red);grid-column:1/-1;text-align:center;padding:40px">⚠ Failed to load data. ${e.message}</p>`;
        document.getElementById('loading-grid').style.display = 'none';
        document.getElementById('trending-grid').style.display = 'grid';
    }
}

// ════════════════════════════
// STATS STRIP
// ════════════════════════════

function updateStatsStrip() {
    const pct = v => v != null ? `${v >= 0 ? '+' : ''}${(+v).toFixed(2)}%` : '--';

    const gainer = [...allTickers].sort((a,b) => (b.price_change_percentage_24h ?? -999) - (a.price_change_percentage_24h ?? -999))[0];
    const loser  = [...allTickers].sort((a,b) => (a.price_change_percentage_24h ?? 999)  - (b.price_change_percentage_24h ?? 999))[0];
    const volTop = [...allTickers].sort((a,b) => (b.total_volume ?? 0) - (a.total_volume ?? 0))[0];

    document.getElementById('top-gainer').textContent = gainer ? `${gainer.symbol.toUpperCase()} ${pct(gainer.price_change_percentage_24h)}` : '--';
    document.getElementById('top-loser').textContent  = loser  ? `${loser.symbol.toUpperCase()} ${pct(loser.price_change_percentage_24h)}`  : '--';
    document.getElementById('top-vol').textContent    = volTop ? `${volTop.symbol.toUpperCase()} ${fmtLarge(volTop.total_volume)}` : '--';
    document.getElementById('new-count').textContent  = `${trending.length} coins`;
}

// ════════════════════════════
// TAB RENDERING
// ════════════════════════════

function bindTabs() {
    document.querySelectorAll('.ttab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.ttab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeTab = btn.dataset.tab;
            renderTab(activeTab);
        });
    });
}

function renderTab(tab) {
    const loadingEl = document.getElementById('loading-grid');
    const gridEl    = document.getElementById('trending-grid');
    loadingEl.style.display = 'block';
    gridEl.style.display    = 'none';

    Object.values(sparkCharts).forEach(c => c.destroy());
    sparkCharts = {};

    let coins = [];
    switch(tab) {
        case 'gainers':
            coins = [...allTickers]
                .filter(c => c.price_change_percentage_24h != null)
                .sort((a,b) => b.price_change_percentage_24h - a.price_change_percentage_24h)
                .slice(0, 48);
            break;
        case 'losers':
            coins = [...allTickers]
                .filter(c => c.price_change_percentage_24h != null)
                .sort((a,b) => a.price_change_percentage_24h - b.price_change_percentage_24h)
                .slice(0, 48);
            break;
        case 'volume':
            coins = [...allTickers]
                .filter(c => c.total_volume)
                .sort((a,b) => b.total_volume - a.total_volume)
                .slice(0, 48);
            break;
        case 'new': {
            // Use CoinGecko trending (actually trending, not just new)
            // Map trending items back to full ticker data if available
            const tickerMap = Object.fromEntries(allTickers.map(t => [t.id, t]));
            coins = trending.map(item => {
                const full = tickerMap[item.id];
                if (full) return full;
                // Synthesize minimal object from trending data
                return {
                    id: item.id,
                    name: item.name,
                    symbol: item.symbol,
                    image: item.small,
                    market_cap_rank: item.market_cap_rank,
                    current_price: item.data?.price ?? 0,
                    price_change_percentage_24h: item.data?.price_change_percentage_24h?.usd ?? 0,
                    sparkline_in_7d: { price: item.data?.sparkline ?? [] }
                };
            }).slice(0, 48);
            break;
        }
    }

    gridEl.innerHTML = coins.map(coin => {
        const pct  = tab === 'volume'
            ? coin.total_volume
            : (coin.price_change_percentage_24h ?? 0);
        const isUp = tab === 'volume' ? true : (pct >= 0);
        const sid  = `spark-${coin.id?.replace(/[^a-z0-9]/gi,'_')}`;

        return `
        <div class="trend-card" onclick="window.location.href='coin.html?id=${coin.id}'">
            <div class="trend-rank">${coin.market_cap_rank ?? '🔥'}</div>
            <img src="${coin.image}" alt="${coin.symbol}"
                 style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0"
                 onerror="this.style.display='none'">
            <div class="trend-info">
                <div class="trend-name">${coin.name}</div>
                <div class="trend-symbol">${(coin.symbol ?? '').toUpperCase()}</div>
            </div>
            <canvas class="trend-spark" id="${sid}"></canvas>
            <div class="trend-right">
                <div class="trend-price">${fmtPrice(coin.current_price)}</div>
                <div class="trend-pct ${isUp ? 'up' : 'down'}">
                    ${tab === 'volume'
                        ? fmtLarge(pct)
                        : `${isUp ? '▲' : '▼'} ${Math.abs(pct).toFixed(2)}%`}
                </div>
            </div>
        </div>`;
    }).join('');

    loadingEl.style.display = 'none';
    gridEl.style.display    = 'grid';

    requestAnimationFrame(() => {
        coins.forEach(coin => drawSparkline(coin));
    });
}

// ════════════════════════════
// SPARKLINES
// ════════════════════════════

function drawSparkline(coin) {
    const sid = `spark-${coin.id?.replace(/[^a-z0-9]/gi,'_')}`;
    const canvas = document.getElementById(sid);
    if (!canvas || sparkCharts[sid]) return;

    const prices = coin.sparkline_in_7d?.price ?? [];
    if (!prices.length) return;

    const isUp = (coin.price_change_percentage_24h ?? 0) >= 0;

    sparkCharts[sid] = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: Array(prices.length).fill(''),
            datasets: [{ data: prices, borderColor: isUp ? '#16C784' : '#EA3943', borderWidth: 1.8, pointRadius: 0, fill: false, tension: 0.4 }]
        },
        options: {
            responsive: false, animation: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: { x: { display: false }, y: { display: false } }
        }
    });
}

// ════════════════════════════
// SEARCH
// ════════════════════════════

function bindSearch() {
    document.getElementById('search-input')?.addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('.trend-card').forEach(card => {
            card.style.display = card.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
    });
}

// ════════════════════════════
// HELPERS
// ════════════════════════════

// fmtPrice, fmtLarge — defined in currency.js
