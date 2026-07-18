// TrendingRepo terminal shell — shared client behavior
// Sparklines (Catmull-Rom smoothed SVG), live clock, sidebar drawer,
// ticker realism. Idempotent — re-runs safely on tab switches.

(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const afterHydration = (fn) => {
    const run = () => {
      if ('requestIdleCallback' in window) window.requestIdleCallback(fn, { timeout: 1200 });
      else setTimeout(fn, 180);
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
  };

  /* ─────────────────────────────────────────────────────────────
     Sparkline renderer — Catmull-Rom-smoothed SVG line + filled area
     Picks up any element with class .spark and data-points
     ───────────────────────────────────────────────────────────── */
  function catmullRom(points) {
    if (points.length < 2) return '';
    const pts = [points[0], ...points, points[points.length - 1]];
    let d = `M ${pts[1][0]} ${pts[1][1]}`;
    for (let i = 1; i < pts.length - 2; i++) {
      const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2];
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0]} ${p2[1]}`;
    }
    return d;
  }

  function renderSpark(el) {
    if (el.dataset.rendered === '1') return;
    const raw = (el.dataset.points || '').split(/[\s,]+/).filter(Boolean).map(Number);
    if (raw.length < 2) return;
    const w = 80;
    const h = 24;
    const padX = 2, padY = 3;
    const min = Math.min(...raw), max = Math.max(...raw);
    const range = max - min || 1;
    const stepX = (w - padX * 2) / (raw.length - 1);
    const points = raw.map((v, i) => [padX + i * stepX, h - padY - ((v - min) / range) * (h - padY * 2)]);
    const d = catmullRom(points);
    const last = points[points.length - 1];
    const area = `${d} L ${last[0]} ${h} L ${points[0][0]} ${h} Z`;
    const svg = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <path class="area" d="${area}" />
      <path class="line" d="${d}" />
      <circle class="endpoint" cx="${last[0].toFixed(2)}" cy="${last[1].toFixed(2)}" r="2" />
    </svg>`;
    el.innerHTML = svg;
    el.dataset.rendered = '1';
  }
  function renderAllSparks(root = document) {
    const sparks = $$('.spark', root).filter(el => el.dataset.rendered !== '1');
    if (sparks.length === 0) return;
    if (root !== document || sparks.length < 20) {
      sparks.forEach(renderSpark);
      return;
    }
    let i = 0;
    function batch() {
      const end = Math.min(i + 16, sparks.length);
      for (; i < end; i++) renderSpark(sparks[i]);
      if (i < sparks.length) requestAnimationFrame(batch);
    }
    batch();
  }

  /* ─────────────────────────────────────────────────────────────
     Live clock — UTC + local + market session tag
     ───────────────────────────────────────────────────────────── */
  function tickClocks() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const utc = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())} UTC`;
    const local = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    $$('[data-clock="utc"]').forEach(el => el.textContent = utc);
    $$('[data-clock="local"]').forEach(el => el.textContent = local);
  }

  /* ─────────────────────────────────────────────────────────────
     Sidebar drawer toggle (mobile)
     ───────────────────────────────────────────────────────────── */
  function bindDrawer() {
    const sb = $('.sidebar');
    if (!sb) return;
    $$('.hamburger, [data-toggle="sidebar"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        sb.classList.toggle('open');
      });
    });
    document.addEventListener('click', (e) => {
      if (sb.classList.contains('open') && !sb.contains(e.target)) {
        sb.classList.remove('open');
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') sb.classList.remove('open');
    });
  }

  /* ─────────────────────────────────────────────────────────────
     Tab switcher — minimal client-side toggle
     <div data-tabset>
       <button data-tab="repos" class="tab active">Repos</button>
       …
     </div>
     <div data-panel="repos">…</div>
     ───────────────────────────────────────────────────────────── */
  function bindTabsets() {
    $$('[data-tabset]').forEach(set => {
      if (set.__trBound === true) return;
      set.__trBound = true;
      const tabs = $$('[data-tab]', set);
      tabs.forEach(t => {
        t.addEventListener('click', () => {
          const id = t.dataset.tab;
          tabs.forEach(x => x.classList.toggle('active', x === t));
          $$('[data-panel]').forEach(p => {
            if (p.dataset.panelGroup && p.dataset.panelGroup !== (set.dataset.panelGroup || '')) return;
            p.style.display = (p.dataset.panel === id) ? '' : 'none';
          });
          renderAllSparks();
        });
      });
      // Auto-init: hide non-active panels
      const active = $('[data-tab].active', set);
      if (active) {
        const id = active.dataset.tab;
        $$('[data-panel]').forEach(p => {
          if (p.dataset.panelGroup && p.dataset.panelGroup !== (set.dataset.panelGroup || '')) return;
          if (p.dataset.panel !== id) p.style.display = 'none';
        });
      }
    });
  }

  /* ─────────────────────────────────────────────────────────────
     Segmented control — like tabs but for time ranges etc.
     ───────────────────────────────────────────────────────────── */
  function bindSegmented() {
    $$('.segmented').forEach(seg => {
      if (seg.__trBound === true) return;
      seg.__trBound = true;
      const btns = $$('button', seg);
      btns.forEach(b => {
        b.addEventListener('click', () => {
          btns.forEach(x => x.classList.toggle('on', x === b));
        });
      });
    });
  }

  /* ─────────────────────────────────────────────────────────────
     Number ticker — smoothly animates to a target value
     <span data-counter data-target="2400">0</span>
     ───────────────────────────────────────────────────────────── */
  function tickCounters() {
    $$('[data-counter]').forEach(el => {
      const target = parseFloat(el.dataset.target || el.textContent.replace(/[,]/g, '')) || 0;
      const duration = 900;
      const start = performance.now();
      const from = 0;
      function step(t) {
        const elapsed = t - start;
        const pct = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - pct, 3);
        const val = from + (target - from) * eased;
        el.textContent = formatNum(val);
        if (pct < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
      el.removeAttribute('data-counter');
    });
  }
  function formatNum(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return Math.round(n).toLocaleString();
  }

  /* ─────────────────────────────────────────────────────────────
     Sidebar nav parent — Trending dropdown toggle
     ───────────────────────────────────────────────────────────── */
  function bindNavParents() {
    $$('[data-nav-parent]').forEach(parent => {
      const toggle = $('[data-nav-toggle]', parent);
      if (!toggle) return;
      toggle.addEventListener('click', (e) => {
        // If clicking caret, toggle. If clicking link, also allow nav.
        const isCaret = e.target.closest('.nav-caret');
        const isChild = parent.classList.contains('open');
        if (isCaret || (isChild && !e.target.closest('a[href]:not([data-nav-toggle])'))) {
          e.preventDefault();
          parent.classList.toggle('open');
        }
      });
    });
  }

  /* ─────────────────────────────────────────────────────────────
     Watch button toggle — heart fill + count
     ───────────────────────────────────────────────────────────── */
  function bindWatchButtons() {
    $$('[data-watch-toggle]').forEach(btn => {
      if (btn.__trBound === true) return;
      btn.__trBound = true;
      btn.addEventListener('click', () => {
        const isOn = btn.classList.toggle('on');
        const label = btn.childNodes[1];
        if (label && label.nodeType === 3) {
          label.textContent = isOn ? ' Watching' : ' Watch';
        } else {
          // Rebuild label safely
          const heart = btn.querySelector('.heart');
          const meta = btn.querySelector('span');
          btn.textContent = '';
          if (heart) btn.appendChild(heart);
          btn.appendChild(document.createTextNode(isOn ? ' Watching' : ' Watch'));
          if (meta) btn.appendChild(meta);
        }
      });
    });
  }

  /* ─────────────────────────────────────────────────────────────
     Alert config inline reveal — fold open/closed
     ───────────────────────────────────────────────────────────── */
  function bindAlertConfig() {
    $$('[data-alert-toggle]').forEach(btn => {
      if (btn.__trBound === true) return;
      btn.__trBound = true;
      const panel = document.querySelector('[data-alert-panel]');
      if (!panel) return;
      // Start expanded by default to show the value prop; collapse on second click
      btn.addEventListener('click', () => {
        const isOpen = panel.style.display !== 'none';
        panel.style.display = isOpen ? 'none' : 'flex';
      });
    });
  }

  /* ─────────────────────────────────────────────────────────────
     Feed filter chips — single-select within filter row
     ───────────────────────────────────────────────────────────── */
  function bindFeedChips() {
    $$('.feed-filter').forEach(row => {
      if (row.__trBound === true) return;
      row.__trBound = true;
      const chips = $$('.feed-chip', row);
      chips.forEach(c => {
        c.addEventListener('click', () => {
          chips.forEach(x => x.classList.toggle('on', x === c));
        });
      });
    });
  }

  /* ─────────────────────────────────────────────────────────────
     Merge "Sources" + "Mentions" columns into one "Mentions" cell
     Sources ARE mentions — one column shows pips (which channels)
     AND count (how many) co-located.
     ───────────────────────────────────────────────────────────── */
  function mergeSourcesIntoMentions() {
    $$('table.tdata').forEach(table => {
      const headers = $$('thead th', table);
      let srcIdx = -1, mentIdx = -1;
      headers.forEach((h, i) => {
        const t = h.textContent.trim().toLowerCase();
        if (t === 'sources' || t === 'mention sources') srcIdx = i;
        if (t === 'mentions') mentIdx = i;
      });
      if (srcIdx < 0 || mentIdx < 0) return;

      // Remove Sources header; widen Mentions header
      headers[srcIdx].remove();
      headers[mentIdx > srcIdx ? mentIdx - 1 : mentIdx]?.classList.add('col-mentions');

      // For each row: hoist pips into the mentions cell, delete the now-empty Sources td
      $$('tbody tr', table).forEach(row => {
        const cells = $$('td', row);
        const srcCell = cells[srcIdx];
        const mentCell = cells[mentIdx];
        if (!srcCell || !mentCell) return;
        const pipsHTML = srcCell.querySelector('.source-pips')?.outerHTML || '';
        const countText = mentCell.textContent.trim();
        mentCell.innerHTML = `<div class="mention-cell">${pipsHTML}<span class="mc-count">${countText}</span></div>`;
        mentCell.classList.add('col-mentions');
        srcCell.remove();
      });
    });
  }

  /* ─────────────────────────────────────────────────────────────
     Mention-source pip "just lit" flash — pick a random pip every
     few seconds to simulate live mention activity on that source
     ───────────────────────────────────────────────────────────── */
  function startPipPulse() {
    const pips = $$('.source-pips .spip.on');
    if (pips.length === 0) return;
    setInterval(() => {
      const pick = pips[Math.floor(Math.random() * pips.length)];
      pick.classList.remove('just-lit');
      void pick.offsetWidth; // reflow to restart animation
      pick.classList.add('just-lit');
    }, 3200);
  }

  /* Repo hover preview removed 2026-05-24 — the popover was fed by hardcoded
     fake stats with a hash-based fallback for unknown repos. Operator killed
     it. The dead /api/repos/{owner}/{name}/hover route was deleted with it.
     `bindRepoHover` is a no-op stub so the old call site + window.TR export
     keep working without throwing. The actual click-to-detail navigation is
     handled by Next.js <Link href={...}> wrappers on .repo-name already. */
  function bindRepoHover() {}

  /* ─────────────────────────────────────────────────────────────
     Share menu — Twitter / LinkedIn / Reddit / Bluesky / copy / embed
     ───────────────────────────────────────────────────────────── */
  function bindShareMenus() {
    $$('.share-wrap').forEach(wrap => {
      if (wrap.__trBound === true) return;
      wrap.__trBound = true;
      const btn = $('.share-btn', wrap);
      const menu = $('.share-menu', wrap);
      if (!btn || !menu) return;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        $$('.share-menu.open').forEach(m => { if (m !== menu) m.classList.remove('open'); });
        menu.classList.toggle('open');
      });
      $$('.item', menu).forEach(it => {
        it.addEventListener('click', () => {
          const kind = it.dataset.share;
          const url = it.dataset.url || window.location.href;
          const text = it.dataset.text || document.title;
          switch (kind) {
            case 'x': window.open('https://x.com/intent/tweet?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(url)); break;
            case 'li': window.open('https://linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(url)); break;
            case 'rd': window.open('https://reddit.com/submit?url=' + encodeURIComponent(url) + '&title=' + encodeURIComponent(text)); break;
            case 'bs': window.open('https://bsky.app/intent/compose?text=' + encodeURIComponent(text + ' ' + url)); break;
            case 'cp':
              if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => showToast('Link copied')).catch(() => showToast('Link copied'));
              else showToast('Link copied');
              break;
            case 'em':
              const snippet = '<iframe src="' + url + '/embed" width="600" height="400" frameborder="0"></iframe>';
              if (navigator.clipboard) navigator.clipboard.writeText(snippet);
              showToast('Embed snippet copied');
              break;
            case 'rss':
              showToast('RSS URL copied — paste in your reader');
              if (navigator.clipboard) navigator.clipboard.writeText(url + '/rss.xml');
              break;
          }
          menu.classList.remove('open');
        });
      });
    });
    document.addEventListener('click', () => {
      $$('.share-menu.open').forEach(m => m.classList.remove('open'));
    });
  }

  /* ─────────────────────────────────────────────────────────────
     Toast — bottom-center confirmation
     ───────────────────────────────────────────────────────────── */
  function showToast(text) {
    text = text || 'Link copied';
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.innerHTML = '<span class="check">✓</span>' + text;
    toast.classList.add('show');
    clearTimeout(toast.__t);
    toast.__t = setTimeout(() => toast.classList.remove('show'), 1800);
  }

  /* ─────────────────────────────────────────────────────────────
     Fade-up on scroll-in (intersection observer)
     ───────────────────────────────────────────────────────────── */
  function bindFadeUp() {
    if (!('IntersectionObserver' in window)) {
      $$('.fade-up').forEach(el => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.05, rootMargin: '0px 0px -40px 0px' });
    $$('.fade-up').forEach(el => io.observe(el));
  }

  /* ─────────────────────────────────────────────────────────────
     Bootstrap
     ───────────────────────────────────────────────────────────── */
  function boot() {
    bindDrawer();
    bindTabsets();
    bindSegmented();
    bindNavParents();
    bindWatchButtons();
    bindAlertConfig();
    bindFeedChips();
    tickClocks();
    setInterval(tickClocks, 1000);
    bindShareMenus();
    afterHydration(() => {
      renderAllSparks();
      mergeSourcesIntoMentions();
      tickCounters();
      startPipPulse();
      bindRepoHover();
      bindFadeUp();
    });
  }

  /* ─────────────────────────────────────────────────────────────
     Rebind on client-side route transitions
     Next.js App Router swaps DOM without a full page reload, which
     leaves new .spark / .segmented / [data-tabset] / .share-wrap
     / [data-counter] / .fade-up elements unbound. All bind* helpers
     are idempotent via __trBound (JS property — invisible to React hydration), so we can safely re-run them
     whenever the subtree changes. Debounced to coalesce rapid mutations.
     ───────────────────────────────────────────────────────────── */
  function rebindAll() {
    renderAllSparks();
    bindTabsets();
    bindSegmented();
    bindNavParents();
    bindWatchButtons();
    bindAlertConfig();
    bindFeedChips();
    bindShareMenus();
    mergeSourcesIntoMentions();
    tickCounters();
    bindFadeUp();
  }
  function startRebindObserver() {
    if (!('MutationObserver' in window)) return;
    const main = document.querySelector('main, .app') || document.body;
    let t;
    new MutationObserver((mutations) => {
      if (mutations.every(isShellOnlyMutation)) return;
      clearTimeout(t);
      t = setTimeout(rebindAll, 120);
    }).observe(main, { childList: true, subtree: true });
  }
  function isShellOnlyMutation(m) {
    const target = m.target;
    if (!target || !target.closest) return false;
    if (!target.closest('.spark, .kpi-value, .toast')) return false;
    return [...m.addedNodes, ...m.removedNodes].every(n => {
      if (n.nodeType === Node.TEXT_NODE) return true;
      if (n.nodeType !== Node.ELEMENT_NODE) return false;
      return /^(svg|path|circle|span)$/i.test(n.nodeName);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { boot(); startRebindObserver(); });
  } else {
    boot();
    startRebindObserver();
  }

  // Re-render sparks on resize (debounced)
  let resizeT;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      $$('.spark').forEach(el => { el.dataset.rendered = '0'; });
      renderAllSparks();
    }, 180);
  });

  // Expose for ad-hoc use in pages
  window.TR = { renderAllSparks, formatNum, showToast, bindShareMenus, bindRepoHover };
})();
