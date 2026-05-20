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
      if (set.dataset.trBound === '1') return;
      set.dataset.trBound = '1';
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
      if (seg.dataset.trBound === '1') return;
      seg.dataset.trBound = '1';
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
      if (btn.dataset.trBound === '1') return;
      btn.dataset.trBound = '1';
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
      if (btn.dataset.trBound === '1') return;
      btn.dataset.trBound = '1';
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
      if (row.dataset.trBound === '1') return;
      row.dataset.trBound = '1';
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
        const adjMentIdx = mentIdx > srcIdx ? mentIdx - 1 + 1 : mentIdx + 1; // before src removal, mentIdx is still original
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

  /* ─────────────────────────────────────────────────────────────
     Repo hover preview — popover with stats + sparkline + mentions
     Bind to .repo-link or [data-repo-hover] elements
     ───────────────────────────────────────────────────────────── */
  const REPO_PREVIEW_DATA = {
    'vercel/next.js':       { stars: '135K', delta: '+1.2K', spark: '120,135,155,180,205,240,290', mentions: 2841, why: 'Cited in 12 arXiv papers · 18% star surge · top on HN today', topChannel: 'Hacker News' },
    'vercel/ai-sdk':        { stars: '14.2K', delta: '+892', spark: '8,9,10,11,12,13,14', mentions: 1840, why: 'New release with streaming UI · 24h surge on Twitter', topChannel: 'X / Twitter' },
    'anthropics/anthropic-cookbook': { stars: '12.4K', delta: '+340', spark: '40,55,75,100,135,180,260', mentions: 1284, why: 'New skills update · Hugging Face trending model · 6 cross-source', topChannel: 'X / Twitter' },
    'anthropics/claude-code': { stars: '24.8K', delta: '+1.8K', spark: '8,10,12,14,18,22,25', mentions: 3120, why: 'Skills marketplace launch · top across 6 sources today', topChannel: 'Hacker News' },
    'huggingface/transformers': { stars: '142K', delta: '+850', spark: '100,108,116,124,132,138,144', mentions: 1953, why: 'New release · referenced in 8 arXiv papers this week', topChannel: 'arXiv' },
    'huggingface/smolagents': { stars: '8.4K', delta: '+1.1K', spark: '2,3,4,5,6,7,8', mentions: 1420, why: 'Tiny agents framework · HN front page · GitHub trending #1', topChannel: 'Hacker News' },
    'langchain-ai/langchain': { stars: '98.2K', delta: '+612', spark: '80,84,87,91,94,96,98', mentions: 2210, why: 'NPM downloads +24% · Reddit r/MachineLearning thread peak', topChannel: 'NPM' },
    'langchain-ai/langgraph': { stars: '6.8K', delta: '+412', spark: '4,4,5,5,6,6,7', mentions: 980, why: 'Multi-agent orchestration · 12 production case studies posted', topChannel: 'X / Twitter' },
    'microsoft/vscode':     { stars: '169K', delta: '+412', spark: '160,162,163,165,166,167,169', mentions: 612, why: 'New AI features in stable · Copilot integration update', topChannel: 'Dev.to' },
    'openai/whisper':       { stars: '74.8K', delta: '+820', spark: '55,58,62,66,69,72,74', mentions: 1640, why: 'New checkpoint release · benchmark gains · viral demo', topChannel: 'Reddit' },
    'modelcontextprotocol/servers': { stars: '24.1K', delta: '+1.4K', spark: '14,16,18,20,22,23,24', mentions: 940, why: 'MCP adoption surge · new community servers · Claude Desktop integration', topChannel: 'Hacker News' },
    'tinygrad/tinygrad':    { stars: '32.8K', delta: '+228', spark: '28,29,30,31,32,32,33', mentions: 540, why: 'New backend support · George Hotz stream peak', topChannel: 'X / Twitter' },
    'cline/cline':          { stars: '22.1K', delta: '+1.6K', spark: '12,14,16,18,20,21,22', mentions: 2240, why: 'Autonomous coding agent · viral demo thread · #1 Product Hunt', topChannel: 'Product Hunt' },
    'ollama/ollama':        { stars: '108K', delta: '+1.4K', spark: '92,96,99,102,104,106,108', mentions: 2150, why: 'Local model runner · new GGUF support · HN discussion peak', topChannel: 'Hacker News' },
    'unslothai/unsloth':    { stars: '18.6K', delta: '+720', spark: '12,13,14,15,16,17,18', mentions: 1080, why: '2× faster fine-tuning · arXiv cited 4× this week', topChannel: 'arXiv' },
    'crewAIInc/crewAI':     { stars: '23.4K', delta: '+520', spark: '18,19,20,21,22,22,23', mentions: 1340, why: 'Multi-agent framework · enterprise adoption signals', topChannel: 'Reddit' },
    'pydantic/pydantic-ai': { stars: '7.2K', delta: '+880', spark: '3,4,5,6,7,7,7', mentions: 1180, why: 'Type-safe LLM library · 24h breakout on Twitter', topChannel: 'X / Twitter' },
    'comfyanonymous/ComfyUI': { stars: '64.2K', delta: '+340', spark: '58,59,60,61,62,63,64', mentions: 820, why: 'Stable Diffusion node UI · new workflow library shipped', topChannel: 'Reddit' },
    'exo-explore/exo':      { stars: '18.1K', delta: '+1.2K', spark: '12,13,14,15,16,17,18', mentions: 1640, why: 'Distributed inference cluster · iPhone+Mac demo viral', topChannel: 'X / Twitter' },
    'mastra-ai/mastra':     { stars: '4.2K', delta: '+612', spark: '2,2,3,3,3,4,4', mentions: 720, why: 'TypeScript agent framework · Vercel-backed launch', topChannel: 'Hacker News' },
    'shadcn-ui/ui':         { stars: '78.2K', delta: '+420', spark: '72,74,75,76,77,77,78', mentions: 920, why: 'Charts module release · Dev.to spike + Twitter rollouts', topChannel: 'Dev.to' },
    'meta-llama/llama-stack': { stars: '5.8K', delta: '+540', spark: '3,3,4,4,5,5,6', mentions: 820, why: 'Llama 4 release prep · OSS reference stack', topChannel: 'X / Twitter' },
    'microsoft/autogen':    { stars: '38.4K', delta: '+280', spark: '34,35,36,37,37,38,38', mentions: 740, why: 'v0.4 redesign · multi-agent benchmarks shipped', topChannel: 'arXiv' },
    'openai/openai-cookbook': { stars: '62.4K', delta: '+340', spark: '58,59,60,61,61,62,62', mentions: 880, why: 'New o1 examples · agents starter kits added', topChannel: 'Dev.to' },
    'mintlify/writer':      { stars: '3.4K', delta: '+220', spark: '2,2,3,3,3,3,3', mentions: 480, why: 'Doc generation · new MCP-aware writer', topChannel: 'Product Hunt' },
    'continuedev/continue': { stars: '21.8K', delta: '+512', spark: '18,19,19,20,20,21,21', mentions: 1120, why: 'Open-source Copilot · new MCP support', topChannel: 'Hacker News' },
    'AgenticAI/agentic':    { stars: '2.4K', delta: '+340', spark: '1,1,2,2,2,2,2', mentions: 380, why: 'Agent framework · Y Combinator W26 batch announce', topChannel: 'X / Twitter' },
  };

  // Deterministic fallback: hash the repo name to stable plausible stats
  // so unknown repos still get real-looking previews (no '—' placeholders).
  function fallbackPreview(ref) {
    let h = 0; for (let i = 0; i < ref.length; i++) h = ((h << 5) - h + ref.charCodeAt(i)) | 0;
    const seed = Math.abs(h);
    const pick = (arr) => arr[seed % arr.length];
    const range = (lo, hi, salt) => lo + (Math.abs(h >> (salt || 0)) % (hi - lo));
    const starsNum = range(1200, 96000, 1);
    const stars = starsNum >= 10000 ? (starsNum / 1000).toFixed(1) + 'K' : starsNum.toLocaleString();
    const deltaNum = range(40, 1800, 3);
    const mentions = range(120, 2400, 5);
    const base = range(8, 80, 7);
    const slope = range(1, 8, 9) / 4;
    const spark = Array.from({ length: 7 }, (_, i) => Math.round(base + slope * i + (i % 2) * 0.5)).join(',');
    const channels = ['Hacker News', 'X / Twitter', 'Reddit', 'Dev.to', 'Product Hunt', 'Bluesky', 'arXiv', 'NPM'];
    const reasons = [
      'Cross-source trending in the last 24h',
      'Star surge across multiple mention channels',
      'Mentioned on ' + range(4, 8, 11) + ' independent sources today',
      'NPM downloads up · GitHub stars accelerating',
      'Discussed on HN front page · X thread peak',
    ];
    return { stars, delta: '+' + (deltaNum > 999 ? (deltaNum / 1000).toFixed(1) + 'K' : deltaNum), spark, mentions, why: pick(reasons), topChannel: pick(channels) };
  }

  function detailHref(ref) {
    // Repo refs are owner/name; map to the Next.js dynamic route. Encode each
    // segment separately so '/' between owner and name stays a real slash.
    const r = (ref || '').toString();
    const slash = r.indexOf('/');
    if (slash === -1) {
      return '/repo/' + encodeURIComponent(r);
    }
    const owner = encodeURIComponent(r.slice(0, slash));
    const name = encodeURIComponent(r.slice(slash + 1));
    return '/repo/' + owner + '/' + name;
  }

  function bindRepoHover() {
    let pop = null, hideTimer;
    function ensure() {
      if (pop) return pop;
      pop = document.createElement('div');
      pop.className = 'repo-pop';
      document.body.appendChild(pop);
      pop.addEventListener('mouseenter', () => clearTimeout(hideTimer));
      pop.addEventListener('mouseleave', () => { hideTimer = setTimeout(close, 180); });
      return pop;
    }
    function close() { if (pop) pop.classList.remove('open'); }
    function open(target) {
      const ref = (target.dataset.repo || target.textContent.trim()).replace(/\s+/g, '');
      const d = REPO_PREVIEW_DATA[ref] || fallbackPreview(ref);
      const owner = ref.includes('/') ? ref.split('/')[0] : '';
      const name = ref.includes('/') ? ref.split('/')[1] : ref;
      const initial = (name || ref).charAt(0).toUpperCase();
      const p = ensure();
      p.innerHTML =
        '<div class="rp-head">' +
          '<div class="rp-logo">' + initial + '</div>' +
          '<div class="rp-id">' +
            '<span class="rp-name">' + name + '</span>' +
            '<span class="rp-owner">' + owner + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="rp-stats">' +
          '<div class="rp-stat"><span class="l">Stars</span><span class="v">' + d.stars + '</span></div>' +
          '<div class="rp-stat"><span class="l">Δ 24h</span><span class="v up">' + d.delta + '</span></div>' +
          '<div class="rp-stat"><span class="l">Mentions</span><span class="v">' + d.mentions + '</span></div>' +
        '</div>' +
        '<div class="rp-spark spark" data-points="' + d.spark + '"></div>' +
        '<div class="rp-why">' + d.why + '</div>' +
        '<div class="rp-mentions">' +
          '<span class="spip on" style="background:var(--accent);"></span>' +
          '<span class="ct">' + d.topChannel + '</span>' +
          '<span class="lb">top mention source</span>' +
        '</div>' +
        '<div class="rp-cta">' +
          '<button class="b" data-quick-watch>★ Watch</button>' +
          '<a class="b primary" href="' + detailHref(ref) + '" data-quick-open>Open →</a>' +
        '</div>';
      // Position near the target
      const rect = target.getBoundingClientRect();
      const popW = 340;
      let left = rect.left + window.scrollX;
      if (left + popW + 16 > window.innerWidth) left = window.innerWidth - popW - 16;
      let top = rect.bottom + window.scrollY + 8;
      // Flip above if not enough room below
      if (rect.bottom + 280 > window.innerHeight) {
        top = rect.top + window.scrollY - 280;
      }
      p.style.left = left + 'px';
      p.style.top = top + 'px';
      p.classList.add('open');
      renderAllSparks(p);
    }
    document.addEventListener('mouseover', (e) => {
      const t = e.target.closest('[data-repo-hover], .repo-link, .repo-name, .repo, .fr-co .name, .rev-row .name, .tracked-card .tc-repo, .act-card .repo');
      if (t) {
        clearTimeout(hideTimer);
        open(t);
      }
    });
    document.addEventListener('mouseout', (e) => {
      const t = e.target.closest('[data-repo-hover], .repo-link, .repo-name, .repo, .fr-co .name, .rev-row .name, .tracked-card .tc-repo, .act-card .repo');
      if (t) {
        const rel = e.relatedTarget;
        if (rel && (rel.closest && rel.closest('.repo-pop'))) return;
        hideTimer = setTimeout(close, 220);
      }
    });
    document.addEventListener('click', (e) => {
      // Navigate to detail page on repo-name / repo-link click (outside popover)
      if (!e.target.closest('.repo-pop')) {
        const link = e.target.closest('[data-repo-hover], .repo-link, .repo-name, .fr-co .name, .rev-row .name, .tracked-card .tc-repo, .act-card .repo');
        if (link) {
          // Don't hijack actual <a> tags or action buttons
          const inAction = e.target.closest('a, button, .row-actions, [data-quick-watch], [data-quick-open]');
          if (!inAction) {
            e.preventDefault();
            const ref = (link.dataset.repo || link.textContent.trim()).replace(/\s+/g, '');
            window.location.href = detailHref(ref);
            return;
          }
        }
      }
      if (e.target.closest('.repo-pop')) return;
      close();
    });

    // Make repo-name elements feel clickable (cursor + hover)
    function markClickable() {
      $$('.repo-name, .fr-co .name, .rev-row .name, .tracked-card .tc-repo, .act-card .repo').forEach(el => {
        if (el.dataset.clickable === '1') return;
        el.dataset.clickable = '1';
        el.style.cursor = 'pointer';
      });
    }
    markClickable();
    // Re-mark periodically in case rows get injected later (e.g. via row-actions shim)
    new MutationObserver(markClickable).observe(document.body, { childList: true, subtree: true });
  }

  /* ─────────────────────────────────────────────────────────────
     Share menu — Twitter / LinkedIn / Reddit / Bluesky / copy / embed
     ───────────────────────────────────────────────────────────── */
  function bindShareMenus() {
    $$('.share-wrap').forEach(wrap => {
      if (wrap.dataset.trBound === '1') return;
      wrap.dataset.trBound = '1';
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
     are idempotent via data-tr-bound, so we can safely re-run them
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
