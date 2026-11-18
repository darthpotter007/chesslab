// ===== Repertoire: build, edit, spaced-repetition drills (Chessreps-style) =====
const REP = {
  data: null,
  async load() { this.data = (await DB.get('kv', 'rep')) || { w: this.empty(), b: this.empty() }; this._last = { w: JSON.stringify(this.data.w), b: JSON.stringify(this.data.b) }; return this.data; },
  empty() { return { my: {}, opp: {}, srs: {}, built: 0 }; },
  save() {
    // stamp whichever colour actually changed, so cloud sync can merge White and Black independently
    this._last = this._last || {};
    for (const c of ['w', 'b']) { const { mod, ...rest } = this.data[c]; const j = JSON.stringify(rest); if (this._last[c] !== j) { this.data[c].mod = Date.now(); this._last[c] = j; } }
    return DB.put('kv', 'rep', this.data);
  },
  c(color) { return this.data[color]; }
};
const pk = path => path.join(' ');
const myTurnAt = (color, n) => (n % 2 === 0) === (color === 'w');

// --- build from your games (+ engine fixes + book where you have no data) ---
function repAutoBuild(color, maxPly = 18) {
  const R = REP.empty(); const old = REP.c(color);
  const gs = scoped().filter(g => g.color === color && !g.startFen);
  const fixes = []; let myN = 0;
  // best-first: always expand the position you reach most often, so common lines get covered before rare ones
  const heap = [{ path: [], here: gs }];
  while (heap.length && myN < 220) {
    heap.sort((x, y) => y.here.length - x.here.length);
    const { path, here } = heap.shift();
    const n = path.length; if (n >= maxPly) continue;
    const key = pk(path); const cnt = {};
    for (const g of here) { const s = g.sans[n]; if (s) cnt[s] = (cnt[s] || 0) + 1; }
    const bn = bookNode(path);
    const bookTop = k => bn ? Object.entries(bn).sort((a, b) => subtreeSize(b[1][1]) - subtreeSize(a[1][1])).slice(0, k).map(x => x[0]) : [];
    if (myTurnAt(color, n)) {
      let san = Object.entries(cnt).sort((a, b) => b[1] - a[1]).find(([s, c]) => c >= 2)?.[0];
      if (san) {
        const an = here.filter(g => g.sans[n] === san && isAnalysed(g.id)); let loss = 0; const bests = {};
        for (const g of an) { const a = S.analysis.get(g.id); loss += a.loss[n] || 0; const b = a.best[n]; if (b) bests[b] = (bests[b] || 0) + 1; }
        if (an.length >= 2 && loss / an.length >= 0.07) {
          const bu = Object.entries(bests).sort((a, b) => b[1] - a[1])[0]; const bs = bu && uciToSan(fenAfter(path), bu[0]);
          if (bs && bs !== san) { fixes.push({ path: path.slice(), from: san, to: bs }); san = bs; }
        }
      } else if (n < 12) san = bookTop(1)[0];
      if (!san) continue;
      R.my[key] = san; myN++;
      heap.push({ path: [...path, san], here: here.filter(g => g.sans[n] === san) });
    } else {
      let reps = Object.entries(cnt).filter(([s, c]) => c >= Math.max(2, here.length * 0.02)).sort((a, b) => b[1] - a[1]).slice(0, n < 2 ? 7 : 5).map(x => x[0]);
      if (!reps.length && n < 12) reps = bookTop(here.length ? 1 : 2);
      if (!reps.length) continue;
      R.opp[key] = reps;
      for (const r of reps) heap.push({ path: [...path, r], here: here.filter(g => g.sans[n] === r) });
    }
  }
  for (const k in old.srs) if (R.my[k] && old.my[k] === R.my[k]) R.srs[k] = old.srs[k];
  R.built = Date.now();
  return { rep: R, fixes };
}
function repLines(color) {
  const R = REP.c(color); const out = [];
  const rec = (path) => {
    if (path.length > 40) { out.push(path); return; }
    const key = pk(path);
    if (myTurnAt(color, path.length)) { const m = R.my[key]; if (!m) { if (path.length) out.push(path); return; } rec([...path, m]); }
    else { const rs = R.opp[key] || []; if (!rs.length) { out.push(path); return; } for (const r of rs) rec([...path, r]); }
  };
  rec([]); return out.filter(l => l.some((_, i) => myTurnAt(color, i)));
}
function repCards(color) { const R = REP.c(color); return Object.keys(R.my).filter(k => { const n = k ? k.split(' ').length : 0; return myTurnAt(color, n); }); }
function repDue(color) { const R = REP.c(color), now = Date.now(); return repCards(color).filter(k => R.srs[k] && R.srs[k].due <= now); }
function repNew(color) { const R = REP.c(color); return repCards(color).filter(k => !R.srs[k]); }
function repRemoveBelow(R, key) { const pre = key ? key + ' ' : ''; for (const t of ['my', 'opp', 'srs']) for (const k of Object.keys(R[t])) if (k !== key && (key === '' ? k !== '' : k.startsWith(pre))) delete R[t][k]; }
// where did a game leave the repertoire?
function repDeviation(g) {
  const R = REP.data && REP.data[g.color]; if (!R || !Object.keys(R.my).length || g.startFen) return null;
  for (let i = 0; i < Math.min(g.sans.length, 40); i++) {
    const key = pk(g.sans.slice(0, i));
    if (myTurnAt(g.color, i)) { const m = R.my[key]; if (!m) return { ply: i, type: 'end' }; if (g.sans[i] !== m) return { ply: i, type: 'me', played: g.sans[i], expected: m }; }
    else { const rs = R.opp[key]; if (!rs || !rs.length) return { ply: i, type: 'end' }; if (!rs.includes(g.sans[i])) return { ply: i, type: 'opp', played: g.sans[i], key }; }
  }
  return { ply: Math.min(g.sans.length, 40), type: 'end' };
}

VIEWS.rep = {
  tab: 'home', color: 'w', path: [],
  async show(m, arg) {
    await REP.load();
    if (arg && arg.color) this.color = arg.color;
    if (arg && arg.tab) this.tab = arg.tab;
    if (arg && arg.path) this.path = arg.path;
    m.innerHTML = `<div class="filters"><span class="chips">${[['w', 'White repertoire'], ['b', 'Black repertoire']].map(([v, t]) => `<span class="chip ${this.color === v ? 'on' : ''}" data-c="${v}">${t}</span>`).join('')}</span>
      <span class="chips">${[['home', 'Overview'], ['drill', 'Drill'], ['edit', 'Edit tree'], ['games', 'Games vs repertoire']].map(([v, t]) => `<span class="chip ${this.tab === v ? 'on' : ''}" data-t="${v}">${t}</span>`).join('')}</span></div><div id="rpbody"></div>`;
    $$('.chip[data-c]', m).forEach(c => c.onclick = () => { this.color = c.dataset.c; this.path = []; liveStop(); render(); });
    $$('.chip[data-t]', m).forEach(c => c.onclick = () => { this.tab = c.dataset.t; liveStop(); render(); });
    this[this.tab]($('#rpbody'));
  },
  leave() { clearTimeout(this.t); liveStop(); },
  // ---------- overview ----------
  home(el) {
    const col = this.color, R = REP.c(col); const cards = repCards(col), due = repDue(col), nw = repNew(col);
    const learned = cards.length - nw.length; const lines = repLines(col);
    const gs = scoped().filter(g => g.color === col);
    if (!cards.length) {
      el.innerHTML = `<div class="card hero" style="text-align:left;max-width:760px"><h2>Build your ${col === 'w' ? 'White' : 'Black'} repertoire</h2>
        <p class="t2">ChessLab builds a starting repertoire from <b>how you actually play</b> (${gs.length} games as ${col === 'w' ? 'White' : 'Black'}). It keeps your usual moves, swaps in the engine's move wherever your analyzed games show your choice losing ground, and prepares answers to the replies your opponents really play against you. Where you have no games, it follows the most popular book line.</p>
        <p class="t2">Then you drill it with spaced repetition: new moves first, then reviews spaced out (1 day, 3 days, a week…) so they stick.</p>
        <div class="row" style="margin-top:10px"><button class="btn primary" id="rpbuild">Build my ${col === 'w' ? 'White' : 'Black'} repertoire</button><button class="btn" id="rpblank">Start empty and build it myself</button></div></div>`;
      $('#rpbuild').onclick = () => this.build(col);
      $('#rpblank').onclick = () => { this.tab = 'edit'; this.path = []; render(); };
      return;
    }
    const devs = gs.slice(0, 40).map(g => ({ g, d: repDeviation(g) })).filter(x => x.d);
    const meDev = devs.filter(x => x.d.type === 'me'), oppDev = devs.filter(x => x.d.type === 'opp');
    const gaps = this.gaps(col);
    el.innerHTML = `<div class="grid g4" style="margin-bottom:14px">
        <div class="card tile"><div class="v">${due.length}</div><div class="l">Due for review</div><div class="s">${due.length ? 'Ready now' : 'All caught up'}</div></div>
        <div class="card tile"><div class="v">${nw.length}</div><div class="l">New moves to learn</div><div class="s">${learned} of ${cards.length} learned</div></div>
        <div class="card tile"><div class="v">${lines.length}</div><div class="l">Lines</div><div class="s">${cards.length} of your moves</div></div>
        <div class="card tile"><div class="v">${devs.length ? pct(devs.filter(x => x.d.type !== 'me').length, devs.length) + '%' : '—'}</div><div class="l">Followed your prep</div><div class="s">Last ${devs.length} games as ${col === 'w' ? 'White' : 'Black'}</div></div></div>
      <div class="grid g2">
        <div class="card"><h2>Train</h2><p class="t2">Each session plays whole lines from move 1. You play your moves; the trainer plays the opponent's. Mistakes come back sooner.</p>
          <div class="row"><button class="btn primary" id="rprev" ${due.length ? '' : 'disabled'}>Review ${due.length} due</button><button class="btn ${due.length ? '' : 'primary'}" id="rplearn" ${nw.length ? '' : 'disabled'}>Learn ${Math.min(8, nw.length)} new moves</button><button class="btn" id="rpall">Practice everything</button></div></div>
        <div class="card"><h2>Gaps in your prep</h2>${gaps.length ? `<p class="t2">Replies your opponents actually played that you have no prepared answer for:</p>${gaps.slice(0, 6).map((x, i) => `<div class="row" style="padding:4px 0"><span>${esc(pvShort(x.path).replace(/\s?\S+$/, ''))} <b>${esc(x.path[x.path.length - 1])}</b> <span class="muted">· ${x.n}× vs you</span></span><span class="sp"></span><button class="btn sm" data-gap="${i}">Prepare</button></div>`).join('')}` : '<p class="t2">No gaps: every reply your opponents played more than once is covered.</p>'}</div>
        <div class="card"><h2>Recent games vs your prep</h2>
          ${devs.slice(0, 8).map(({ g, d }) => `<div class="row click" style="padding:4px 0;cursor:pointer" data-g="${esc(g.id)}" data-p="${d.ply}"><span class="res ${g.result}">${g.result === 'win' ? 'W' : g.result === 'loss' ? 'L' : '½'}</span><span>${d.type === 'me' ? `<span style="color:var(--c-mistake)">You left prep</span> at move ${Math.floor(d.ply / 2) + 1}: ${esc(d.played)} instead of <b>${esc(d.expected)}</b>` : d.type === 'opp' ? `Opponent left your prep at move ${Math.floor(d.ply / 2) + 1}: ${esc(d.played)}` : `Stayed in your prep to the end of it (move ${Math.floor(d.ply / 2) + 1})`}</span><span class="sp"></span><span class="muted">${fmtDate(g.end)}</span></div>`).join('') || '<div class="muted">No games yet.</div>'}
          <div class="note" style="margin-top:6px">${meDev.length} of ${devs.length} recent games: you played something other than your prepared move.</div></div>
        <div class="card"><h2>Rebuild</h2><p class="t2">Built ${R.built ? fmtDate(R.built) : 'by hand'}. Rebuilding re-reads your games and analyses; progress on moves that didn't change is kept.</p><div class="row"><button class="btn" id="rpre">Rebuild from my games</button><button class="btn" id="rpedit">Edit tree</button><button class="btn" id="rpclear">Delete this repertoire</button></div></div>
      </div>`;
    $('#rprev').onclick = () => this.startDrill('due');
    $('#rplearn').onclick = () => this.startDrill('new');
    $('#rpall').onclick = () => this.startDrill('all');
    $('#rpre').onclick = () => this.build(col);
    $('#rpedit').onclick = () => { this.tab = 'edit'; this.path = []; render(); };
    const cl = $('#rpclear'); cl.onclick = async () => { if (cl.dataset.c !== '1') { cl.dataset.c = '1'; cl.textContent = 'Click again to delete'; return; } REP.data[col] = REP.empty(); await REP.save(); render(); };
    $$('[data-gap]', el).forEach(b => b.onclick = () => { const x = gaps[+b.dataset.gap]; this.tab = 'edit'; this.path = x.path; render(); });
    $$('[data-g]', el).forEach(r => r.onclick = () => go('review', { id: r.dataset.g, ply: +r.dataset.p + 1 }));
  },
  gaps(col) {
    const R = REP.c(col); const out = []; const gs = scoped().filter(g => g.color === col);
    for (const [key, reps] of Object.entries(R.opp)) {
      const path = key ? key.split(' ') : []; const n = path.length; const cnt = {};
      for (const g of gs) if (path.every((s, i) => g.sans[i] === s) && g.sans[n]) cnt[g.sans[n]] = (cnt[g.sans[n]] || 0) + 1;
      for (const [s, c] of Object.entries(cnt)) if (c >= 2 && !reps.includes(s)) out.push({ path: [...path, s], n: c });
    }
    // reached my-turn positions with no prepared move
    for (const [key, reps] of Object.entries(R.opp)) for (const r of reps) { const k = key ? key + ' ' + r : r; if (!R.my[k] && k.split(' ').length < 14) { const c = gs.filter(g => k.split(' ').every((s, i) => g.sans[i] === s)).length; if (c >= 2) out.push({ path: k.split(' '), n: c, mine: true }); } }
    return out.sort((a, b) => b.n - a.n);
  },
  async build(col) {
    const { rep, fixes } = repAutoBuild(col); REP.data[col] = rep; await REP.save();
    this.tab = 'home'; render();
    const an = scoped().filter(g => g.color === col && isAnalysed(g.id)).length;
    toast(`Built: ${repCards(col).length} moves in ${repLines(col).length} lines${fixes.length ? `, ${fixes.length} of your moves replaced by better ones` : ''}${an < 20 ? ' · analyze more games for better engine fixes' : ''}`, 5000);
  },
  // ---------- edit tree ----------
  edit(el) {
    const col = this.color;
    el.innerHTML = `<div class="review"><div><div id="rpb"></div><div class="navbtns"><button class="btn" id="rpback">◀ Back</button><button class="btn" id="rproot">Start</button></div></div>
      <div class="grid" style="gap:12px"><div class="card"><div class="crumbs" id="rpcr"></div><div id="rpnode"></div></div>
      <div class="card" style="padding:10px 14px"><h3>Engine</h3><div class="enginelines" id="rpeng"></div></div></div></div>`;
    this.eb = new Board($('#rpb'), { orient: col, canMove: () => true, onMove: u => this.editMove(u) });
    $('#rpback').onclick = () => { this.path = this.path.slice(0, -1); this.drawEdit(); };
    $('#rproot').onclick = () => { this.path = []; this.drawEdit(); };
    this.drawEdit();
  },
  async editMove(u) {
    const col = this.color, R = REP.c(col); const ch = new Chess(fenAfter(this.path)); const m = moveUci(ch, u); if (!m) return false;
    const key = pk(this.path);
    if (myTurnAt(col, this.path.length)) { if (R.my[key] && R.my[key] !== m.san) { const old = key ? key + ' ' + R.my[key] : R.my[key]; repRemoveBelow(R, old); delete R.my[old]; delete R.opp[old]; } R.my[key] = m.san; delete R.srs[key]; }
    else { R.opp[key] = R.opp[key] || []; if (!R.opp[key].includes(m.san)) R.opp[key].push(m.san); }
    await REP.save(); this.path = [...this.path, m.san]; this.drawEdit();
  },
  drawEdit() {
    const col = this.color, R = REP.c(col), path = this.path, key = pk(path), n = path.length; const fen = fenAfter(path);
    let lastU = null; if (n) { const c = new Chess(fenAfter(path.slice(0, -1))); const mm = c.move(path[n - 1]); lastU = mm && uciOf(mm); }
    const mine = myTurnAt(col, n);
    const arrows = [];
    if (mine && R.my[key]) { const c = new Chess(fen); const mm = c.move(R.my[key]); if (mm) arrows.push({ u: uciOf(mm), color: '#5fb03c' }); }
    if (!mine) for (const r of R.opp[key] || []) { const c = new Chess(fen); const mm = c.move(r); if (mm) arrows.push({ u: uciOf(mm), color: '#d95926', op: .6 }); }
    this.eb.orient = col; this.eb.set(fen, { last: lastU, arrows });
    $('#rpcr').innerHTML = `<span data-i="0">Start</span>` + path.map((s, i) => ` <span data-i="${i + 1}">${i % 2 === 0 ? (i / 2 + 1) + '.' : ''}${esc(s)}</span>`).join('');
    $$('#rpcr span').forEach(sp => sp.onclick = () => { this.path = path.slice(0, +sp.dataset.i); this.drawEdit(); });
    const gs = scoped().filter(g => g.color === col && path.every((s, i) => g.sans[i] === s)); const cnt = {};
    for (const g of gs) if (g.sans[n]) (cnt[g.sans[n]] = cnt[g.sans[n]] || []).push(g);
    const bn = bookNode(path) || {}; const bw = bookWalk(path);
    const nm = bw.name != null ? BOOKNAME(bw.name).name : '';
    let h = `<div class="note">${esc(nm)}</div>`;
    if (mine) {
      h += `<h3 style="margin-top:8px">Your move here</h3>${R.my[key] ? `<div class="row"><span class="kpi" style="font-size:20px;color:var(--c-best)">${esc(R.my[key])}</span><button class="btn sm" id="rpgo">Go to it →</button><button class="btn sm" id="rpdel">Remove (and everything after)</button></div>` : '<div class="t2">No move chosen yet. Play one on the board, or pick below.</div>'}
        <h3 style="margin-top:14px">Options</h3>${WDL_LEGEND}${Object.entries(cnt).sort((a, b) => b[1].length - a[1].length).map(([s, l]) => `<div class="row"><div style="flex:1" data-pick="${esc(s)}">${wdlRow(s, l, bn[s] ? '📖' : '')}</div></div>`).join('') || '<div class="muted">You have no games from this position.</div>'}
        ${Object.keys(bn).filter(s => !cnt[s]).length ? `<div class="note" style="margin-top:6px">Book moves: ${Object.keys(bn).filter(s => !cnt[s]).slice(0, 10).map(s => `<a href="#" data-pick="${esc(s)}">${esc(s)}</a>`).join(', ')}</div>` : ''}
        <div class="note" style="margin-top:6px">Click an option, or play a move on the board, to make it your move here.</div>`;
    } else {
      const reps = R.opp[key] || [];
      h += `<h3 style="margin-top:8px">Opponent replies you've prepared</h3>${reps.map(r => `<div class="row" style="padding:3px 0"><a href="#" data-goto="${esc(r)}"><b>${esc(r)}</b></a><span class="muted">${cnt[r] ? cnt[r].length + '× vs you' : bn[r] ? 'book' : ''}</span><span class="sp"></span><button class="btn sm" data-rm="${esc(r)}">Remove</button></div>`).join('') || '<div class="t2">None yet. Play a reply on the board to add it.</div>'}
        <h3 style="margin-top:14px">What opponents played vs you</h3>${WDL_LEGEND}${Object.entries(cnt).sort((a, b) => b[1].length - a[1].length).map(([s, l]) => `<div data-add="${esc(s)}" style="cursor:pointer">${wdlRow(s, l, reps.includes(s) ? '✓ prepared' : '<span style="color:var(--c-inaccuracy)">not prepared</span>')}</div>`).join('') || '<div class="muted">No games from this position.</div>'}
        <div class="note" style="margin-top:6px">Click a reply (or play it on the board) to add it.</div>`;
    }
    $('#rpnode').innerHTML = h;
    const pick = async s => { const c = new Chess(fen); const mm = c.move(s); if (mm) await this.editMove(uciOf(mm)); };
    $$('[data-pick]').forEach(d => d.onclick = e => { e.preventDefault(); pick(d.dataset.pick); });
    $$('[data-add]').forEach(d => d.onclick = () => pick(d.dataset.add));
    $$('[data-goto]').forEach(d => d.onclick = e => { e.preventDefault(); this.path = [...path, d.dataset.goto]; this.drawEdit(); });
    $$('[data-rm]').forEach(d => d.onclick = async () => { const r = d.dataset.rm; R.opp[key] = (R.opp[key] || []).filter(x => x !== r); const k = key ? key + ' ' + r : r; repRemoveBelow(R, k); delete R.my[k]; delete R.srs[k]; await REP.save(); this.drawEdit(); });
    const gb = $('#rpgo'); if (gb) gb.onclick = () => { this.path = [...path, R.my[key]]; this.drawEdit(); };
    const db = $('#rpdel'); if (db) db.onclick = async () => { const k = key ? key + ' ' + R.my[key] : R.my[key]; repRemoveBelow(R, k); delete R.opp[k]; delete R.my[key]; delete R.srs[key]; await REP.save(); this.drawEdit(); };
    $('#rpeng').innerHTML = '<div class="muted">Thinking…</div>';
    liveEval(fen, (c) => {
      if (fenAfter(this.path) !== fen) return;
      $('#rpeng').innerHTML = c.lines.filter(Boolean).map(l => { const s = pvToSan(fen, l.pv, 1)[0]; return `<div><b>${evalText(l)}</b> ${esc(pvText(fen, l.pv, 6))}${mine && s === R.my[key] ? ' <span class="tag">your move</span>' : ''}</div>`; }).join('') + `<div class="note">depth ${c.depth}</div>`;
    }, 18, 3);
  },
  // ---------- drill ----------
  startDrill(mode) { this.drillMode = mode; this.tab = 'drill'; render(); },
  drill(el) {
    const col = this.color; const R = REP.c(col);
    if (!repCards(col).length) { el.innerHTML = '<div class="card empty">Build or create a repertoire first (Overview tab).</div>'; return; }
    const mode = this.drillMode || (repDue(col).length ? 'due' : 'new'); this.drillMode = null;
    const now = Date.now(); const lines = repLines(col);
    const cardsOf = l => l.map((_, i) => i).filter(i => myTurnAt(col, i)).map(i => pk(l.slice(0, i)));
    let pickFn;
    if (mode === 'due') pickFn = l => cardsOf(l).filter(k => R.srs[k] && R.srs[k].due <= now).length;
    else if (mode === 'new') pickFn = l => cardsOf(l).filter(k => !R.srs[k]).length;
    else pickFn = () => 1;
    let q = lines.map(l => ({ l, s: pickFn(l) + Math.random() * .5 })).filter(x => x.s >= 1).sort((a, b) => b.s - a.s).map(x => x.l);
    if (mode === 'new') { const out = []; let nn = 0; const seen = new Set(); for (const l of q) { const fresh = cardsOf(l).filter(k => !R.srs[k] && !seen.has(k)); if (!fresh.length) continue; fresh.forEach(k => seen.add(k)); out.push(l); nn += fresh.length; if (nn >= 8) break; } q = out; }
    else if (mode === 'due') { const out = []; const seen = new Set(); for (const l of q) { const d = cardsOf(l).filter(k => R.srs[k] && R.srs[k].due <= now && !seen.has(k)); if (!d.length) continue; d.forEach(k => seen.add(k)); out.push(l); } q = out; }
    else q = q.slice(0, 10);
    this.dq = q; this.dstats = { ok: 0, bad: 0, learned: 0 };
    el.innerHTML = `<div class="review"><div><div class="plyr" id="drt"></div><div id="drb"></div><div class="navbtns"><button class="btn" id="drhint">Show move</button><button class="btn" id="drskip">Skip line</button></div></div>
      <div class="grid" style="gap:12px"><div class="status" id="drst"></div><div class="card" id="drinfo"></div><div class="prog"><i id="drprog" style="width:0"></i></div></div></div>`;
    this.db = new Board($('#drb'), { orient: col, canMove: c => this.dl && !this.dwait && c === col, onMove: u => this.drillMove(u) });
    $('#drhint').onclick = () => this.drillHint(true);
    $('#drskip').onclick = () => this.nextLine();
    this.total = q.length;
    if (!q.length) { this.dst('ok', mode === 'due' ? 'Nothing due right now. Come back later, or learn new moves.' : 'Nothing new to learn. Nice!'); return; }
    this.nextLine();
  },
  nextLine() {
    clearTimeout(this.t);
    const l = this.dq.shift(); const col = this.color;
    $('#drprog').style.width = pct(this.total - this.dq.length - (l ? 1 : 0), this.total) + '%';
    if (!l) { this.dl = null; const s = this.dstats; this.dst('ok', `✓ Session done: ${s.ok} correct, ${s.bad} wrong${s.learned ? `, ${s.learned} new moves learned` : ''}.`); $('#drinfo').innerHTML = `<div class="row"><button class="btn primary" onclick="VIEWS.rep.tab='home';render()">Back to overview</button><button class="btn" onclick="VIEWS.rep.startDrill('all')">Practice more</button></div>`; REP.save(); return; }
    this.dl = l; this.di = 0; this.dmiss = false;
    const bw = bookWalk(l);
    $('#drt').innerHTML = `<b>${esc(bw.name != null ? BOOKNAME(bw.name).name : 'Your line')}</b><span class="sp"></span><span class="note">${this.dq.length} line${this.dq.length === 1 ? '' : 's'} left</span>`;
    $('#drinfo').innerHTML = `<div class="note">Line: ${esc(pvShort(l))}</div>`;
    this.db.orient = col; this.db.set(new Chess().fen()); this.step();
  },
  step() {
    const l = this.dl, col = this.color, R = REP.c(col);
    if (this.di >= l.length) { this.dst('ok', '✓ Line complete'); this.dwait = true; this.t = setTimeout(() => { this.dwait = false; this.nextLine(); }, 700); return; }
    const fen = fenAfter(l.slice(0, this.di));
    if (myTurnAt(col, this.di)) {
      const key = pk(l.slice(0, this.di)); const s = R.srs[key]; this.dmiss = false;
      if (!s) { this.dnew = true; this.drillHint(false); this.dst('', `New move: <b>${esc(l[this.di])}</b>. Play it on the board.`); }
      else { this.dnew = false; this.dst('', 'Your move'); }
      return;
    }
    this.dwait = true;
    this.t = setTimeout(() => { const c = new Chess(fen); const mm = c.move(l[this.di]); this.di++; this.db.set(c.fen(), { last: mm && uciOf(mm) }); this.dwait = false; this.step(); }, 380);
  },
  drillMove(u) {
    const l = this.dl, col = this.color, R = REP.c(col); const fen = fenAfter(l.slice(0, this.di)); const c = new Chess(fen); const m = moveUci(c, u); if (!m) return false;
    const key = pk(l.slice(0, this.di)); const exp = l[this.di];
    if (m.san === exp) {
      const s = R.srs[key];
      if (!s) { R.srs[key] = { ivl: 1, due: Date.now() + DAY, reps: 1, lapses: 0 }; this.dstats.learned++; }
      else if (this.dmiss) { s.ivl = 1; s.due = Date.now() + DAY; s.lapses++; }
      else { s.ivl = Math.min(180, Math.max(3, s.ivl * 2.5)); s.due = Date.now() + s.ivl * DAY; s.reps++; this.dstats.ok++; }
      this.di++; this.db.set(c.fen(), { last: u, marks: { [m.to]: 'good' } }); this.dst('ok', `✓ ${esc(m.san)}`); REP.save();
      this.dwait = true; this.t = setTimeout(() => { this.dwait = false; this.step(); }, 300); return;
    }
    if (!this.dmiss && !this.dnew) { this.dmiss = true; this.dstats.bad++; if (!this.dq.includes(l)) this.dq.push(l); }
    this.db.set(c.fen(), { last: u, marks: { [m.to]: 'bad' } }); this.dwait = true;
    this.dst('bad', `✗ ${esc(m.san)} isn't your prepared move. Try again${this.dmiss ? ', or press Show move' : ''}.`);
    this.t = setTimeout(() => { this.dwait = false; this.db.set(fen, { last: this.lastU() }); }, 800);
  },
  lastU() { if (!this.di) return null; const c = new Chess(fenAfter(this.dl.slice(0, this.di - 1))); const mm = c.move(this.dl[this.di - 1]); return mm && uciOf(mm); },
  drillHint(count) {
    const l = this.dl; if (!l || this.di >= l.length || !myTurnAt(this.color, this.di)) return;
    if (count && !this.dmiss && !this.dnew) { this.dmiss = true; this.dstats.bad++; if (!this.dq.includes(l)) this.dq.push(l); }
    const fen = fenAfter(l.slice(0, this.di)); const c = new Chess(fen); const mm = c.move(l[this.di]);
    this.db.set(fen, { last: this.lastU(), arrows: mm ? [{ u: uciOf(mm), color: '#5598e7' }] : [] });
    if (count) this.dst('', `Your prepared move is <b>${esc(l[this.di])}</b>. Play it.`);
  },
  dst(c, h) { const s = $('#drst'); if (s) { s.className = 'status ' + c; s.innerHTML = h; } },
  // ---------- games vs repertoire ----------
  games(el) {
    const col = this.color; const gs = scoped().filter(g => g.color === col).slice(0, 100);
    if (!repCards(col).length) { el.innerHTML = '<div class="card empty">Build a repertoire first (Overview tab).</div>'; return; }
    const rows = gs.map(g => ({ g, d: repDeviation(g) })).filter(x => x.d);
    el.innerHTML = `<div class="card"><h2>Your last ${rows.length} games as ${col === 'w' ? 'White' : 'Black'} vs your repertoire</h2><table><thead><tr><th></th><th>Date</th><th>Opponent</th><th>What happened</th><th></th></tr></thead><tbody>
      ${rows.map(({ g, d }, i) => `<tr><td><span class="res ${g.result}">${g.result === 'win' ? 'W' : g.result === 'loss' ? 'L' : '½'}</span></td><td>${fmtDate(g.end)}</td><td>${esc(g.opp.name)} <span class="muted">(${g.opp.rating || '?'})</span></td>
        <td>${d.type === 'me' ? `<span style="color:var(--c-mistake)">You played ${esc(d.played)}</span> at move ${Math.floor(d.ply / 2) + 1}; your prep says <b>${esc(d.expected)}</b>` : d.type === 'opp' ? `Opponent played ${esc(d.played)} at move ${Math.floor(d.ply / 2) + 1}: not in your prep` : `Followed your prep to its end (move ${Math.floor(d.ply / 2) + 1})`}</td>
        <td class="row" style="flex-wrap:nowrap"><button class="btn sm" data-rv="${i}">Review</button>${d.type === 'opp' ? `<button class="btn sm" data-add="${i}">Add to prep</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
    $$('[data-rv]', el).forEach(b => b.onclick = () => { const x = rows[+b.dataset.rv]; go('review', { id: x.g.id, ply: x.d.ply + 1 }); });
    $$('[data-add]', el).forEach(b => b.onclick = () => { const x = rows[+b.dataset.add]; const R = REP.c(col); R.opp[x.d.key] = R.opp[x.d.key] || []; if (!R.opp[x.d.key].includes(x.d.played)) R.opp[x.d.key].push(x.d.played); REP.save(); this.tab = 'edit'; this.path = x.g.sans.slice(0, x.d.ply + 1); render(); });
  }
};
