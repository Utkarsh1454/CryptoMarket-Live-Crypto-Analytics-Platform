/**
 * news.js — Crypto News Page
 * News:   Multi-source RSS feeds via rss2json.com (100% public, no API key)
 *         Sources: CoinTelegraph · CoinDesk · Decrypt
 * Prices: CoinGecko /simple/price (public, no API key)
 */

const GECKO     = 'https://api.coingecko.com/api/v3';
const GECKO_IDS = 'bitcoin,ethereum,binancecoin,solana,ripple';
const RSS2JSON  = 'https://api.rss2json.com/v1/api.json';

const RSS_SOURCES = [
    { name: 'CoinTelegraph', color: '#2563EB', url: 'https://cointelegraph.com/rss' },
    { name: 'CoinDesk',      color: '#06B6D4', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
    { name: 'Decrypt',       color: '#16C784', url: 'https://decrypt.co/feed' },
];

// Keyword → category mapping for filter buttons
const CATEGORY_KEYWORDS = {
    BTC:        ['bitcoin', 'btc'],
    ETH:        ['ethereum', 'eth'],
    BNB:        ['binance', 'bnb'],
    SOL:        ['solana', 'sol'],
    REGULATION: ['regulation', 'sec', 'cftc', 'ban', 'law', 'legal', 'government'],
    DEFI:       ['defi', 'decentralized finance', 'protocol', 'liquidity', 'yield'],
    NFT:        ['nft', 'non-fungible', 'token', 'opensea', 'marketplace'],
};

let allArticles    = [];
let activeCategory = '';

document.addEventListener('DOMContentLoaded', async () => {
    bindCategories();
    bindSearch();
    await Promise.all([fetchNews(), fetchQuickPrices()]);
});

// ════════════════════════════════════════
// RSS NEWS FETCH
// ════════════════════════════════════════

async function fetchNews() {
    const mainEl = document.getElementById('news-main');
    mainEl.innerHTML = `<div class="loading-news"><div class="loading-pulse"><div class="pulse-dot"></div> Loading latest crypto news...</div></div>`;

    try {
        // Fetch all sources in parallel
        const results = await Promise.allSettled(
            RSS_SOURCES.map(src =>
                fetch(`${RSS2JSON}?rss_url=${encodeURIComponent(src.url)}&count=20`)
                    .then(r => r.json())
                    .then(d => ({ src, items: d.items ?? [] }))
            )
        );

        // Merge, tag source, sort by date
        allArticles = results
            .filter(r => r.status === 'fulfilled')
            .flatMap(r => r.value.items.map(item => ({
                ...item,
                _src:  r.value.src.name,
                _color: r.value.src.color,
                _tags: inferTags(item),
                _ts:   new Date(item.pubDate).getTime(),
            })))
            .sort((a, b) => b._ts - a._ts);

        if (!allArticles.length) throw new Error('All RSS feeds failed');

        updateMostRead();
        updateSentiment();
        renderArticles();
    } catch(e) {
        console.error('News fetch failed', e);
        document.getElementById('news-main').innerHTML = `
            <div class="loading-news" style="color:var(--red)">
                ⚠ Could not load news. Check your connection.<br>
                <small style="color:var(--text-3)">${e.message}</small>
            </div>`;
    }
}

function inferTags(item) {
    const text = ((item.title ?? '') + ' ' + (item.description ?? '')).toLowerCase();
    return Object.entries(CATEGORY_KEYWORDS)
        .filter(([, kws]) => kws.some(kw => text.includes(kw)))
        .map(([cat]) => cat);
}

// ════════════════════════════════════════
// RENDER ARTICLES
// ════════════════════════════════════════

function renderArticles() {
    const mainEl = document.getElementById('news-main');
    let articles = allArticles;

    if (activeCategory) {
        articles = articles.filter(a => a._tags.includes(activeCategory));
    }

    if (!articles.length) {
        mainEl.innerHTML = `<p style="color:var(--text-2);padding:40px 0;text-align:center">No articles found for this category.</p>`;
        return;
    }

    // First article = featured card, rest = list items
    const [featured, ...rest] = articles.slice(0, 25);

    mainEl.innerHTML = renderFeatured(featured) + rest.map(renderItem).join('');
}

function renderFeatured(a) {
    const img   = getThumb(a);
    const tags  = a._tags.slice(0, 3).map(t => `<span class="news-tag">${t}</span>`).join('');
    const body  = stripHtml(a.description ?? a.content ?? '').slice(0, 180) + '…';

    return `
    <a class="news-featured" href="${a.link}" target="_blank" rel="noopener">
        ${img
            ? `<img src="${img}" class="news-featured-img" alt="${a.title}" onerror="this.style.display='none'">`
            : `<div class="news-featured-img" style="background:linear-gradient(135deg,rgba(37,99,235,.18),rgba(6,182,212,.18))">📰</div>`}
        <div class="news-featured-body">
            <div class="news-source-row">
                <span class="news-source-name" style="color:${a._color}">${a._src}</span>
                <span class="news-time">${timeAgo(a._ts)}</span>
            </div>
            <h2 class="news-featured-title">${a.title}</h2>
            <p>${body}</p>
            <div class="news-tags">${tags}</div>
        </div>
    </a>`;
}

function renderItem(a) {
    const img  = getThumb(a);
    const body = stripHtml(a.description ?? a.content ?? '').slice(0, 120) + '…';

    return `
    <a class="news-item" href="${a.link}" target="_blank" rel="noopener">
        ${img
            ? `<img src="${img}" class="news-item-thumb" alt="" onerror="this.style.display='none'">`
            : `<div class="news-item-thumb">📰</div>`}
        <div class="news-item-content">
            <div class="news-item-title">${a.title}</div>
            <div class="news-item-sub">${body}</div>
            <div class="news-item-meta">
                <span class="news-item-src" style="color:${a._color}">${a._src}</span>
                <span class="news-time">${timeAgo(a._ts)}</span>
                ${a._tags.slice(0,2).map(t=>`<span class="news-tag">${t}</span>`).join('')}
            </div>
        </div>
    </a>`;
}

// ════════════════════════════════════════
// SIDEBAR: MOST READ + SENTIMENT
// ════════════════════════════════════════

function updateMostRead() {
    const el = document.getElementById('most-read-list');
    if (!el) return;
    el.innerHTML = allArticles.slice(0, 6).map((a, i) => `
        <div class="trending-news-item" onclick="window.open('${a.link}','_blank')">
            <span class="trending-news-num">${i + 1}</span>
            <div>
                <div class="trending-news-title">${a.title}</div>
                <div class="trending-news-src" style="color:${a._color}">${a._src} · ${timeAgo(a._ts)}</div>
            </div>
        </div>`).join('');
}

function updateSentiment() {
    const bullish = allArticles.filter(a => {
        const t = (a.title + ' ' + (a.description ?? '')).toLowerCase();
        return ['surge', 'rally', 'bull', 'gain', 'record', 'high', 'boost', 'rise', 'soar', 'broke'].some(w => t.includes(w));
    }).length;

    const total  = Math.max(allArticles.length, 1);
    const bullPct = Math.round(bullish / total * 100);
    const bearPct = 100 - bullPct;

    const fillEl = document.getElementById('sentiment-fill');
    const bullEl = document.getElementById('bull-pct');
    const bearEl = document.getElementById('bear-pct');
    if (fillEl) fillEl.style.width = `${bullPct}%`;
    if (bullEl) bullEl.textContent = `${bullPct}% Bullish`;
    if (bearEl) bearEl.textContent = `Bearish ${bearPct}%`;
}

// ════════════════════════════════════════
// CATEGORY FILTER + SEARCH
// ════════════════════════════════════════

function bindCategories() {
    document.querySelectorAll('.cat-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeCategory = btn.dataset.cat;
            renderArticles();
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

// ════════════════════════════════════════
// QUICK PRICES (CoinGecko — public)
// ════════════════════════════════════════

async function fetchQuickPrices() {
    const el = document.getElementById('quick-prices-list');
    try {
        const res  = await fetch(`${GECKO}/simple/price?ids=${GECKO_IDS}&vs_currencies=usd&include_24hr_change=true`);
        const data = await res.json();

        const coins = [
            { id: 'bitcoin',     sym: 'BTC', emoji: '₿' },
            { id: 'ethereum',    sym: 'ETH', emoji: 'Ξ' },
            { id: 'binancecoin', sym: 'BNB', emoji: 'B' },
            { id: 'solana',      sym: 'SOL', emoji: '◎' },
            { id: 'ripple',      sym: 'XRP', emoji: '✕' },
        ];

        el.innerHTML = coins.map(coin => {
            const d    = data[coin.id] ?? {};
            const p    = d.usd;
            const pct  = d.usd_24h_change ?? 0;
            const isUp = pct >= 0;
            const fmt  = p >= 100
                ? p?.toLocaleString('en-US', { maximumFractionDigits: 2 })
                : p?.toFixed(4);
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

// ════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════

function getThumb(a) {
    // rss2json provides thumbnail field; also try og:image in content
    if (a.thumbnail && !a.thumbnail.includes('1x1')) return a.thumbnail;
    const match = (a.content ?? '').match(/src="(https?:\/\/[^"]+\.(jpe?g|png|webp)[^"]*)"/i);
    return match ? match[1] : null;
}

function stripHtml(html) {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function timeAgo(ts) {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}
