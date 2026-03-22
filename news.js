/**
 * news.js — Crypto News Page
 * News: CryptoCompare News API (authenticated)
 *   https://min-api.cryptocompare.com/data/v2/news/
 * Quick Prices: Coinpaprika /v1/tickers
 */

// API keys are loaded from config.js (gitignored) via window.APP_CONFIG
// See config.example.js for the required format.
const CC_KEY    = (window.APP_CONFIG?.CC_KEY) || '';
if (!CC_KEY) console.warn('[news.js] No CryptoCompare API key found. Copy config.example.js → config.js and add your key.');
const CC_BASE   = `https://min-api.cryptocompare.com/data/v2/news/?lang=EN&api_key=${CC_KEY}`;
const GECKO     = 'https://api.coingecko.com/api/v3';
const GECKO_IDS = 'bitcoin,ethereum,binancecoin,solana,ripple';

let allArticles = [];
let activeCategory = '';

document.addEventListener('DOMContentLoaded', async () => {
    bindCategories();
    bindSearch();
    await Promise.all([fetchNews(''), fetchQuickPrices()]);
});

// ════════════════════════════
// CRYPTOCOMPARE NEWS FETCH
// ════════════════════════════
async function fetchNews(category) {
    const mainEl = document.getElementById('news-main');
    mainEl.innerHTML = `<div class="loading-news"><div class="loading-pulse"><div class="pulse-dot"></div> Loading latest crypto news...</div></div>`;

    try {
        const url = category
            ? `${CC_BASE}&categories=${category}&sortOrder=latest`
            : `${CC_BASE}&sortOrder=latest`;

        const res  = await fetch(url);
        const data = await res.json();

        if (data.Response === 'Error') throw new Error(data.Message);
        allArticles = data.Data ?? [];
        renderNews(allArticles);
        updateSentiment(allArticles);
        renderMostRead(allArticles.slice(0, 5));

    } catch(e) {
        console.error('News fetch failed:', e);
        mainEl.innerHTML = `<div class="loading-news" style="color:var(--text-3)">⚠ Could not load news. Error: ${e.message}</div>`;
    }
}

// ════════════════════════════
// RENDER NEWS FEED
// ════════════════════════════
function renderNews(articles) {
    const mainEl = document.getElementById('news-main');
    if (!articles.length) {
        mainEl.innerHTML = `<div class="loading-news" style="color:var(--text-3)">No articles found for this category.</div>`;
        return;
    }

    const [featured, ...rest] = articles;

    const featuredHtml = `
    <a class="news-featured" href="${featured.url}" target="_blank" rel="noopener">
        <div class="news-featured-img">
            ${featured.imageurl
                ? `<img src="${featured.imageurl}" alt="" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML='📰'">`
                : '📰'}
        </div>
        <div class="news-featured-body">
            <div class="news-source-row">
                <div class="news-source-name">
                    ${featured.source_info?.img ? `<img src="${featured.source_info.img}" class="news-source-icon" onerror="this.style.display='none'">` : '<i class="fa-solid fa-newspaper" style="margin-right:5px"></i>'}
                    ${featured.source_info?.name ?? featured.source ?? 'Crypto News'}
                </div>
                <span class="news-time">${timeAgo(featured.published_on)}</span>
            </div>
            <div class="news-featured-title">${featured.title}</div>
            <p>${(featured.body ?? '').slice(0, 220).trim()}${(featured.body?.length ?? 0) > 220 ? '...' : ''}</p>
            <div class="news-tags">
                ${(featured.categories ?? '').split('|').filter(Boolean).slice(0, 5).map(t =>
                    `<span class="news-tag">${t.trim()}</span>`
                ).join('')}
            </div>
        </div>
    </a>`;

    const listHtml = rest.slice(0, 29).map(a => `
    <a class="news-item" href="${a.url}" target="_blank" rel="noopener">
        <div class="news-item-thumb">
            ${a.imageurl
                ? `<img src="${a.imageurl}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:10px" onerror="this.parentElement.innerHTML='📰'">`
                : '📰'}
        </div>
        <div class="news-item-content">
            <div class="news-item-title">${a.title}</div>
            <p class="news-item-sub">${(a.body ?? '').slice(0, 130).trim()}</p>
            <div class="news-item-meta">
                <span class="news-item-src">
                    ${a.source_info?.img ? `<img src="${a.source_info.img}" style="width:14px;height:14px;border-radius:3px;margin-right:5px;vertical-align:middle" onerror="this.style.display='none'">` : ''}
                    ${a.source_info?.name ?? a.source ?? 'News'}
                </span>
                <span style="font-size:.74rem;color:var(--text-3)">${timeAgo(a.published_on)}</span>
                ${(a.categories ?? '').split('|').filter(Boolean).slice(0,2).map(t =>
                    `<span class="news-tag" style="font-size:.7rem;padding:1px 7px">${t.trim()}</span>`
                ).join('')}
            </div>
        </div>
    </a>`).join('');

    mainEl.innerHTML = featuredHtml + listHtml;
}

// ════════════════════════════
// SIDEBAR: MOST READ
// ════════════════════════════
function renderMostRead(articles) {
    const el = document.getElementById('most-read-list');
    el.innerHTML = articles.map((a, i) => `
    <a class="trending-news-item" href="${a.url}" target="_blank" rel="noopener" style="text-decoration:none">
        <div class="trending-news-num">${i + 1}</div>
        <div>
            <div class="trending-news-title">${a.title.slice(0, 75)}${a.title.length > 75 ? '…' : ''}</div>
            <div class="trending-news-src">${a.source_info?.name ?? a.source} · ${timeAgo(a.published_on)}</div>
        </div>
    </a>`).join('');
}

// ════════════════════════════
// SIDEBAR: SENTIMENT
// ════════════════════════════
function updateSentiment(articles) {
    let bull = 0, bear = 0;
    articles.forEach(a => {
        const text = (a.title + ' ' + (a.body ?? '')).toLowerCase();
        bull += ['bullish','surge','rally','gains','pump','moon','buy','up'].filter(w => text.includes(w)).length;
        bear += ['bearish','drop','crash','falls','dump','sell','down','loss'].filter(w => text.includes(w)).length;
    });
    const total   = bull + bear || 1;
    const bullPct = Math.round(bull / total * 100);
    document.getElementById('sentiment-fill').style.width = `${bullPct}%`;
    document.getElementById('bull-pct').textContent = `${bullPct}% Bullish`;
    document.getElementById('bear-pct').textContent = `Bearish ${100 - bullPct}%`;
}

// ════════════════════════════
// SIDEBAR: QUICK PRICES
// ════════════════════════════
async function fetchQuickPrices() {
    const el = document.getElementById('quick-prices-list');
    try {
        const res  = await fetch(`${GECKO}/simple/price?ids=${GECKO_IDS}&vs_currencies=usd&include_24hr_change=true`);
        const data = await res.json();

        const display = [
            { id: 'bitcoin',     sym: 'BTC', emoji: '₿' },
            { id: 'ethereum',    sym: 'ETH', emoji: 'Ξ' },
            { id: 'binancecoin', sym: 'BNB', emoji: 'B' },
            { id: 'solana',      sym: 'SOL', emoji: '◎' },
            { id: 'ripple',      sym: 'XRP', emoji: '✕' },
        ];

        el.innerHTML = display.map(coin => {
            const d    = data[coin.id] ?? {};
            const p    = d.usd;
            const pct  = d.usd_24h_change ?? 0;
            const isUp = pct >= 0;
            const fmt  = p >= 100 ? p?.toLocaleString('en-US', { maximumFractionDigits: 2 }) : p?.toFixed(4);
            return `
            <div onclick="window.location.href='coin.html?id=${coin.id}'"
                 style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--card-2);border-radius:8px;cursor:pointer;transition:all .2s"
                 onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='var(--card-2)'">
                <div style="display:flex;align-items:center;gap:8px">
                    <span style="font-size:.95rem">${coin.emoji}</span>
                    <span style="font-weight:600;font-size:.85rem">${coin.sym}</span>
                </div>
                <div style="text-align:right">
                    <div style="font-family:'JetBrains Mono',monospace;font-size:.85rem;font-weight:600">$${fmt ?? '--'}</div>
                    <div style="font-size:.75rem;color:${isUp ? 'var(--green)' : 'var(--red)'};font-weight:600">${isUp ? '+' : ''}${pct.toFixed(2)}%</div>
                </div>
            </div>`;
        }).join('');
    } catch(e) {
        el.innerHTML = `<p style="color:var(--text-3);font-size:.8rem">Price data unavailable</p>`;
    }
}

// ════════════════════════════
// CONTROLS
// ════════════════════════════
function bindCategories() {
    document.querySelectorAll('.cat-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeCategory = btn.dataset.cat;
            // Re-fetch with the proper CC category tag
            fetchNews(activeCategory);
        });
    });
}

function bindSearch() {
    document.getElementById('news-search')?.addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('.news-item, .news-featured').forEach(el => {
            el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
    });
}

// ════════════════════════════
// HELPERS
// ════════════════════════════
function timeAgo(unixTs) {
    const now  = Date.now() / 1000;
    const diff = Math.floor(now - unixTs);
    if (diff < 60)    return `${diff}s ago`;
    if (diff < 3600)  return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    return `${Math.floor(diff/86400)}d ago`;
}
