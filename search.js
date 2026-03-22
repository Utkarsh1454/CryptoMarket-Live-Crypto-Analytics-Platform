/**
 * search.js — Live search autocomplete for all pages
 * Uses CoinGecko /search API for real-time coin suggestions.
 * Attach to any input with id="global-search" or id="search-input".
 */

(function () {
    const GECKO      = 'https://api.coingecko.com/api/v3';
    const SELECTORS  = ['#global-search', '#search-input', '#news-search'];
    let   dropdowns  = {};
    let   debounceT  = {};
    let   lastQuery  = {};

    // ── Bootstrap on DOMContentLoaded ─────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        SELECTORS.forEach(sel => {
            const inp = document.querySelector(sel);
            if (inp) attachAutocomplete(inp, sel);
        });

        // Close all dropdowns when clicking outside
        document.addEventListener('click', e => {
            Object.values(dropdowns).forEach(dd => {
                if (!dd.contains(e.target) && !dd._input?.contains(e.target)) {
                    hideDropdown(dd);
                }
            });
        });
    });

    // ── Attach autocomplete to a single input ──────────────
    function attachAutocomplete(inp, key) {
        // Create dropdown element
        const dd     = document.createElement('div');
        dd.className = 'search-dropdown';
        dd._input    = inp;
        inp.parentElement.style.position = 'relative';
        inp.parentElement.appendChild(dd);
        dropdowns[key] = dd;

        inp.addEventListener('input', () => {
            clearTimeout(debounceT[key]);
            const q = inp.value.trim();
            if (q.length < 2) { hideDropdown(dd); return; }
            debounceT[key] = setTimeout(() => fetchSuggestions(q, dd, inp, key), 220);
        });

        inp.addEventListener('keydown', e => {
            if (e.key === 'Escape') { hideDropdown(dd); inp.value = ''; }

            // Arrow key navigation
            const items = dd.querySelectorAll('.sug-item');
            const active = dd.querySelector('.sug-item.hovered');
            if (!items.length) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const next = active ? active.nextElementSibling ?? items[0] : items[0];
                setHovered(active, next);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prev = active ? active.previousElementSibling ?? items[items.length - 1] : items[items.length - 1];
                setHovered(active, prev);
            } else if (e.key === 'Enter') {
                if (active) { e.preventDefault(); active.click(); }
            }
        });
    }

    // ── Fetch from CoinGecko /search ───────────────────────
    async function fetchSuggestions(query, dd, inp, key) {
        if (lastQuery[key] === query) return;
        lastQuery[key] = query;

        // If we have local coin data (from app.js), use it first for instant results
        if (typeof allCoins !== 'undefined' && allCoins.length) {
            const local = allCoins
                .filter(c => c.name.toLowerCase().includes(query.toLowerCase()) || c.symbol.toLowerCase().includes(query.toLowerCase()))
                .slice(0, 8);
            if (local.length) { renderDropdown(local.map(c => ({
                id:     c.id,
                name:   c.name,
                symbol: c.symbol,
                thumb:  c.image,
                market_cap_rank: c.market_cap_rank,
                current_price: c.current_price,
                price_change_percentage_24h: c.price_change_percentage_24h,
            })), dd, inp); }
        }

        // Always also fetch from CoinGecko for names not in the local 250
        try {
            const res  = await fetch(`${GECKO}/search?query=${encodeURIComponent(query)}`);
            const data = await res.json();
            const coins = (data.coins ?? []).slice(0, 8);
            if (coins.length) renderDropdown(coins, dd, inp);
        } catch (_) { /* silently ignore */ }
    }

    // ── Render dropdown ────────────────────────────────────
    function renderDropdown(coins, dd, inp) {
        const currency    = (typeof getCurrency === 'function') ? getCurrency() : 'usd';
        const currencyFmt = (typeof fmtPrice === 'function') ? fmtPrice : v => `$${(+v).toFixed(2)}`;

        dd.innerHTML = coins.map(coin => {
            const thumb  = coin.thumb ?? coin.image ?? '';
            const rank   = coin.market_cap_rank ? `#${coin.market_cap_rank}` : '';
            const price  = coin.current_price != null ? currencyFmt(coin.current_price) : '';
            const pct    = coin.price_change_percentage_24h;
            const pctBit = pct != null
                ? `<span class="sug-pct ${pct >= 0 ? 'up' : 'dn'}">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</span>`
                : '';

            return `
            <div class="sug-item" data-id="${coin.id}" tabindex="-1">
                <div class="sug-left">
                    ${thumb
                        ? `<img src="${thumb}" alt="${coin.symbol}" class="sug-img" onerror="this.style.display='none'">`
                        : `<div class="sug-img sug-avatar">${(coin.symbol??'?').slice(0,2).toUpperCase()}</div>`}
                    <div class="sug-info">
                        <span class="sug-name">${coin.name}</span>
                        <span class="sug-sym">${(coin.symbol??'').toUpperCase()}</span>
                    </div>
                </div>
                <div class="sug-right">
                    ${rank ? `<span class="sug-rank">${rank}</span>` : ''}
                    ${price ? `<span class="sug-price">${price}</span>` : ''}
                    ${pctBit}
                </div>
            </div>`;
        }).join('');

        // Wire click handlers
        dd.querySelectorAll('.sug-item').forEach(item => {
            item.addEventListener('mouseenter', () => {
                dd.querySelectorAll('.sug-item').forEach(i => i.classList.remove('hovered'));
                item.classList.add('hovered');
            });
            item.addEventListener('click', () => {
                const id = item.dataset.id;
                hideDropdown(dd);
                if (id) window.location.href = `coin.html?id=${encodeURIComponent(id)}`;
            });
        });

        if (coins.length) showDropdown(dd);
        else hideDropdown(dd);
    }

    function showDropdown(dd) {
        dd.classList.add('visible');
    }
    function hideDropdown(dd) {
        if (!dd) return;
        dd.classList.remove('visible');
        dd.innerHTML = '';
    }
    function setHovered(prev, next) {
        if (prev) prev.classList.remove('hovered');
        if (next) { next.classList.add('hovered'); next.scrollIntoView({ block: 'nearest' }); }
    }
})();
