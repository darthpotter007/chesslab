// ===== router & shell =====
const VIEWS = {};
let CURVIEW = null;
function go(v, arg) { ROUTE_ARG = arg; if (location.hash.slice(1) === v) render(); else location.hash = v; }
let ROUTE_ARG = null;
function render() {
  let v = location.hash.slice(1) || (S.games.length ? 'stats' : 'import');
  if (!VIEWS[v]) v = 'stats';
  if (!S.user && v !== 'import') v = 'import';
  if (CURVIEW && CURVIEW !== v && VIEWS[CURVIEW].leave) VIEWS[CURVIEW].leave();
  CURVIEW = v;
  $$('nav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + v));
  const m = $('main'); m.innerHTML = '';
  VIEWS[v].show(m, ROUTE_ARG); ROUTE_ARG = null;
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', render);
function updateStatus() {
  const el = $('#qstatus'); if (!el) return;
  if (CURVIEW === 'review' && VIEWS.review.g && Q.cur === VIEWS.review.g.id && !VIEWS.review.a) { const pl = $('#rsum .pill'); if (pl) pl.innerHTML = '<span class="dot"></span>Analyzing… ' + Math.round((Q.frac || 0) * 100) + '%'; else if ($('#rsum')) VIEWS.review.renderSummary(); }
  if (!Q.cur && !Q.items.length) { el.innerHTML = ''; return; }
  const g = S.byId.get(Q.cur);
  el.innerHTML = `<span class="pill" data-tip="Engine analysis runs in the background. Results are saved."><span class="dot"></span>Analyzing ${Q.done + 1}/${Q.total}${g ? ' · vs ' + esc(g.opp.name) : ''} · ${Math.round((Q.frac || 0) * 100)}%</span> <button class="btn sm" onclick="Q.cancel()">Stop</button>`;
}
let _refreshT = null;
function onAnalysed(id) {
  userHdr();
  // live-refresh analysis-dependent views
  if (VIEWS[CURVIEW] && VIEWS[CURVIEW].onAnalysed) VIEWS[CURVIEW].onAnalysed(id);
}
function userHdr() { const sc = scoped(); $('#who').innerHTML = S.user ? `<b>${esc(S.user)}</b> · ${sc.length} games · ${sc.filter(g => isAnalysed(g.id)).length} analyzed` : ''; }

// ===== filters bar =====
function filtersBar(onChange) {
  const f = S.filters; const d = document.createElement('div'); d.className = 'filters';
  const grp = (label, key, opts) => `<div><label>${label}</label><span class="chips">${opts.map(([v, t]) => `<span class="chip ${f[key] === v ? 'on' : ''}" data-k="${key}" data-v="${v}">${t}</span>`).join('')}</span></div>`;
  const tcs = ['bullet', 'blitz', 'rapid', 'daily'].filter(t => S.settings.tcs[t] !== false && S.games.some(g => g.tc === t));
  d.innerHTML = grp('Time', 'tc', [['all', 'All'], ...tcs.map(t => [t, t[0].toUpperCase() + t.slice(1)])]) + grp('Period', 'range', [['30', '30 days'], ['90', '90 days'], ['365', '1 year'], ['all', 'All time']]) + grp('Games', 'rated', [['all', 'All'], ['rated', 'Rated'], ['casual', 'Casual']]);
  d.addEventListener('click', e => { const c = e.target.closest('.chip'); if (!c) return; S.filters[c.dataset.k] = c.dataset.v; try { localStorage.setItem('cl_filters', JSON.stringify(S.filters)); } catch (e) { } onChange(); });
  return d;
}

// ===== import view =====
VIEWS.import = {
  show(m) {
    m.innerHTML = `<div class="hero">
      <h1>♟ Chess<span style="color:var(--acc)">Lab</span></h1>
      <p class="t2">Your whole chess.com history, analyzed on your own computer. Free in-depth stats, game review with move classifications, puzzles made from your own games, opening training, and a coach that finds your weak spots.</p>
      <div class="card" style="text-align:left;margin-top:20px">
        <h2>Import from chess.com</h2>
        <div class="row"><input id="uname" placeholder="chess.com username" value="${esc(S.user || DEFAULT_USER)}" style="flex:1"><button class="btn primary" id="go">${S.games.length ? 'Update games' : 'Import games'}</button></div>
        <div id="iprog" style="margin-top:12px"></div>
      </div>
      <div class="card" style="text-align:left;margin-top:14px">
        <h2>Or upload PGN files</h2>
        <p class="note">Use this if the import can't reach chess.com. You can download a month of games as PGN from <code>https://api.chess.com/pub/player/USERNAME/games/YYYY/MM/pgn</code>, or from chess.com → Archive → select games → Download.</p>
        <div class="row"><input type="file" id="pgnf" accept=".pgn,.txt" multiple></div>
        <div id="pprog" class="note" style="margin-top:8px"></div>
      </div>
      <div class="card" style="text-align:left;margin-top:14px"><h2>Settings</h2>
        <div class="t2" style="margin-bottom:6px">Time controls to include in stats, analysis, puzzles and training:</div>
        <div class="row" id="tcset">${['rapid', 'blitz', 'daily', 'bullet'].map(t => `<label class="chip ${S.settings.tcs[t] !== false ? 'on' : ''}" style="user-select:none"><input type="checkbox" data-tc="${t}" ${S.settings.tcs[t] !== false ? 'checked' : ''} style="display:none">${t[0].toUpperCase() + t.slice(1)} <span style="opacity:.7">${S.games.filter(g => g.tc === t).length}</span></label>`).join('')}</div>
        <div class="note" style="margin-top:6px">Bullet is off by default: fast games are noisy and teach less. You can turn it back on anytime.</div></div>
      ${S.games.length ? `<div class="card" style="text-align:left;margin-top:14px"><h2>Data</h2><p class="note">Everything is stored in this browser only. ${S.games.length} games, ${S.analysis.size} analyses, ${S.puzzles.size} puzzles.</p><div class="row"><button class="btn" id="wipeA">Clear analyses & puzzles</button><button class="btn" id="wipe">Delete everything</button></div></div>` : ''}
    </div>`;
    $('#go').onclick = async () => {
      const u = $('#uname').value.trim(); if (!u) return;
      const p = $('#iprog');
      p.innerHTML = '<div class="note">Fetching archive list…</div><div class="prog"><i style="width:0"></i></div>';
      if (u.toLowerCase() !== S.user) { S.user = u.toLowerCase(); await DB.put('kv', 'user', S.user); S.byId = new Map(); for (const [k, g] of await DB.all('games')) if (g.user === S.user) S.byId.set(k, g); }
      try {
        const r = await importChessCom(u, (k, n) => { p.innerHTML = `<div class="note">Downloading month ${k} of ${n}…</div><div class="prog"><i style="width:${pct(k, n)}%"></i></div>`; });
        rebuildGames(); userHdr();
        p.innerHTML = `<div class="status ok">Done: ${S.games.length} games (${r.added} new) from ${r.months} months.</div><div class="row" style="margin-top:10px"><button class="btn primary" onclick="go('stats')">See my stats →</button><button class="btn" onclick="Q.add(scoped().slice(0,25).filter(g=>!isAnalysed(g.id)).map(g=>g.id));go('train')">Analyze last 25 games</button></div>`;
      } catch (e) {
        console.error(e);
        p.innerHTML = e.message === 'notfound' ? `<div class="status bad">No chess.com player called “${esc(u)}”.</div>` :
          `<div class="status bad">Couldn't reach chess.com from this page (${esc(e.message)}).</div><p class="note">Open this file directly in Chrome, Edge or Firefox (double-click the downloaded .html). If it still fails, use the PGN upload below.</p>`;
      }
    };
    $$('#tcset input').forEach(i => i.onchange = async () => { S.settings.tcs[i.dataset.tc] = i.checked; i.parentElement.classList.toggle('on', i.checked); if (!['all', ...Object.keys(S.settings.tcs).filter(k => S.settings.tcs[k])].includes(S.filters.tc)) S.filters.tc = 'all'; await DB.put('kv', 'settings', S.settings); userHdr(); });
    $('#uname').onkeydown = e => { if (e.key === 'Enter') $('#go').click(); };
    $('#pgnf').onchange = async e => {
      const u = $('#uname').value.trim().toLowerCase(); if (!u) { $('#pprog').textContent = 'Type your username above first.'; return; }
      if (u !== S.user) { S.user = u; await DB.put('kv', 'user', u); S.byId = new Map(); }
      let n = 0, skipped = 0; const ents = [];
      for (const f of e.target.files) {
        const txt = await f.text();
        for (const pg of splitPGNs(txt)) { const g = normalizePGN(pg, u); if (g && g.sans.length) { S.byId.set(g.id, g); ents.push([g.id, g]); n++; } else skipped++; }
      }
      await DB.putMany('games', ents); rebuildGames(); userHdr();
      $('#pprog').innerHTML = `Imported ${n} games${skipped ? ` (${skipped} skipped: not ${esc(u)}'s, or a variant)` : ''}. <a href="#stats">See stats →</a>`;
    };
    const w = $('#wipe'); if (w) w.onclick = async () => { if (w.dataset.c !== '1') { w.dataset.c = '1'; w.textContent = 'Click again to confirm'; return; } for (const s of DB.stores) await DB.clear(s); location.reload(); };
    const wa = $('#wipeA'); if (wa) wa.onclick = async () => { if (wa.dataset.c !== '1') { wa.dataset.c = '1'; wa.textContent = 'Click again to confirm'; return; } await DB.clear('analysis'); await DB.clear('puzzles'); S.analysis.clear(); S.puzzles.clear(); userHdr(); toast('Cleared'); };
  }
};

// ===== games list =====
VIEWS.games = {
  q: '', res: 'all', page: 0,
  show(m, arg) {
    if (arg && arg.q != null) { this.q = arg.q; this.page = 0; }
    m.innerHTML = '';
    m.appendChild(filtersBar(() => render()));
    const wrap = document.createElement('div'); wrap.className = 'card'; m.appendChild(wrap);
    const draw = () => {
      const q = this.q.toLowerCase();
      const gs = filtered().filter(g => (this.res === 'all' || g.result === this.res) && (!q || g.opp.name.toLowerCase().includes(q) || g.opening.toLowerCase().includes(q)));
      const per = 50, pages = Math.max(1, Math.ceil(gs.length / per)); this.page = Math.min(this.page, pages - 1);
      const un = gs.filter(g => !isAnalysed(g.id));
      wrap.innerHTML = `<div class="row" style="margin-bottom:10px"><input id="gq" placeholder="Search opponent or opening" value="${esc(this.q)}" style="min-width:260px">
        <span class="chips">${[['all', 'All'], ['win', 'Wins'], ['loss', 'Losses'], ['draw', 'Draws']].map(([v, t]) => `<span class="chip ${this.res === v ? 'on' : ''}" data-r="${v}">${t}</span>`).join('')}</span>
        <span class="sp"></span><span class="muted">${gs.length} games · ${gs.length - un.length} analyzed</span>
        <select id="bdepth" data-tip="Engine depth for bulk analysis. 12 is fast and solid; 16 is slower and more precise."><option value="10">Fast (depth 10)</option><option value="12" selected>Standard (depth 12)</option><option value="16">Deep (depth 16)</option></select>
        <button class="btn primary" id="anall" ${un.length ? '' : 'disabled'}>Analyze ${un.length > 50 ? 'next 50' : un.length} unanalyzed</button></div>
        <table><thead><tr><th></th><th>Date</th><th>Opponent</th><th>Opening</th><th>Type</th><th>Moves</th><th>Accuracy</th><th></th></tr></thead><tbody>
        ${gs.slice(this.page * per, this.page * per + per).map(g => { const a = S.analysis.get(g.id); const acc = isAnalysed(g.id) && a.acc[g.color] != null ? fmt1(a.acc[g.color]) : g.acc && g.acc.me ? fmt1(g.acc.me) + '<span class="muted" data-tip="From chess.com"> *</span>' : '<span class="muted">—</span>';
          return `<tr class="click" data-id="${esc(g.id)}"><td><span class="res ${g.result}">${g.result === 'win' ? 'W' : g.result === 'loss' ? 'L' : '½'}</span></td><td>${fmtDate(g.end)}</td><td><span class="cdot ${g.color}" data-tip="You played ${g.color === 'w' ? 'White' : 'Black'}"></span> ${esc(g.opp.name)} <span class="muted">(${g.opp.rating || '?'})</span></td><td class="t2" style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(g.opening)}</td><td class="t2">${g.tc}</td><td>${g.moves}</td><td>${acc}</td><td>${isAnalysed(g.id) ? '<span class="tag">analyzed</span>' : Q.cur === g.id || Q.items.includes(g.id) ? '<span class="tag">queued</span>' : ''}</td></tr>`; }).join('')}
        </tbody></table>
        <div class="row" style="margin-top:10px;justify-content:center">${pages > 1 ? `<button class="btn sm" id="pp" ${this.page ? '' : 'disabled'}>← Prev</button><span class="muted">Page ${this.page + 1} of ${pages}</span><button class="btn sm" id="pn" ${this.page < pages - 1 ? '' : 'disabled'}>Next →</button>` : ''}</div>`;
      const gq = $('#gq', wrap); gq.oninput = () => { this.q = gq.value; this.page = 0; const pos = gq.selectionStart; draw(); const n = $('#gq', wrap); n.focus(); n.setSelectionRange(pos, pos); };
      $$('.chip[data-r]', wrap).forEach(c => c.onclick = () => { this.res = c.dataset.r; this.page = 0; draw(); });
      $$('tr.click', wrap).forEach(r => r.onclick = () => go('review', r.dataset.id));
      $('#bdepth', wrap).value = String(Q.depth);
      $('#bdepth', wrap).onchange = e => { Q.depth = +e.target.value; };
      $('#anall', wrap).onclick = () => { Q.add(un.slice(0, 50).map(g => g.id)); draw(); };
      const pp = $('#pp', wrap), pn = $('#pn', wrap); if (pp) pp.onclick = () => { this.page--; draw(); }; if (pn) pn.onclick = () => { this.page++; draw(); };
    };
    this.draw = draw; draw();
  },
  onAnalysed() { if (this.draw && !_refreshT) _refreshT = setTimeout(() => { _refreshT = null; if (CURVIEW === 'games') this.draw(); }, 1500); }
};
