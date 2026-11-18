// ===== live engine helper (foreground engine) =====
const LIVE = { token: 0 };
function liveEval(fen, cb, depth = 20, multipv = 3) {
  const t = ++LIVE.token; ENG_FG.stop();
  setTimeout(() => {
    if (t !== LIVE.token) return;
    const term = terminalEval(fen); if (term) { cb({ lines: [term], depth: 0, fen, terminal: true }); return; }
    ENG_FG.analyze(fen, { depth, multipv, onInfo: c => { if (t === LIVE.token) cb(c); } }).then(c => { if (t === LIVE.token) cb(c, true); });
  }, 140);
}
function liveStop() { LIVE.token++; ENG_FG.stop(); }

// ===== review view =====
VIEWS.review = {
  id: null,
  show(m, arg) {
    if (arg && typeof arg === 'object') { this.id = arg.id; this._startPly = arg.ply; } else if (arg) this.id = arg;
    if (!this.id || !S.byId.has(this.id)) this.id = S.games[0] && S.games[0].id;
    const g = S.byId.get(this.id);
    if (!g) { m.innerHTML = '<div class="card empty">No games yet. <a href="#import">Import your games</a>.</div>'; return; }
    this.g = g; const r = replay(g); this.fens = r.fens; this.moves = r.moves;
    this.ply = this._startPly != null ? Math.min(this._startPly, this.moves.length) : this.moves.length; this._startPly = null;
    this.vari = null;
    m.innerHTML = `<div class="review">
      <div>
        <div class="plyr" id="ptop"></div>
        <div class="boardwrap">${EVALBAR_HTML}<div style="flex:1"><div id="rb"></div></div></div>
        <div class="plyr" id="pbot"></div>
        <div class="navbtns"><button class="btn" data-n="start">⏮</button><button class="btn" data-n="prev">◀</button><button class="btn" data-n="next">▶</button><button class="btn" data-n="end">⏭</button><button class="btn" data-n="flip" data-tip="Flip board (F)">⇅</button></div>
        <div class="note" style="margin-top:6px">Use ← → keys. Drag pieces to try your own moves; the engine evaluates them live. Right-click drag to draw arrows (hold Shift, Ctrl or Alt for other colours), right-click a square to circle it.</div>
      </div>
      <div class="grid" style="gap:12px">
        <div class="card" id="rhead"></div>
        <div class="card" id="rsum"></div>
        <div class="comment" id="rcom"></div>
        <div class="card" style="padding:10px 14px"><div class="row" style="margin-bottom:4px"><h3 style="margin:0">Engine</h3><span class="sp"></span><span class="note" id="edepth"></span></div><div class="enginelines" id="elines"></div></div>
        <div id="rvar"></div>
        <div class="moves" id="rmoves"></div>
      </div></div>`;
    this.board = new Board($('#rb'), { orient: g.color, canMove: () => true, onMove: u => this.userMove(u) });
    $$('.navbtns .btn', m).forEach(b => b.onclick = () => this.nav(b.dataset.n));
    this.key = e => { if (e.target.tagName === 'INPUT') return; if (e.key === 'ArrowLeft') { this.nav('prev'); e.preventDefault(); } if (e.key === 'ArrowRight') { this.nav('next'); e.preventDefault(); } if (e.key === 'Home') this.nav('start'); if (e.key === 'End') this.nav('end'); if (e.key === 'f') this.nav('flip'); };
    document.addEventListener('keydown', this.key);
    this.renderHead(); this.renderSummary(); this.renderMoves(); this.update();
  },
  leave() { document.removeEventListener('keydown', this.key); liveStop(); },
  get a() { return isAnalysed(this.g.id) ? S.analysis.get(this.g.id) : null; },
  renderHead() {
    const g = this.g; const queued = Q.cur === g.id || Q.items.includes(g.id);
    $('#rhead').innerHTML = `<div class="row"><span class="res ${g.result}">${g.result === 'win' ? 'W' : g.result === 'loss' ? 'L' : '½'}</span>
      <div><b>${esc(g.color === 'w' ? g.me.name : g.opp.name)}</b> (${(g.color === 'w' ? g.me.rating : g.opp.rating) || '?'}) vs <b>${esc(g.color === 'b' ? g.me.name : g.opp.name)}</b> (${(g.color === 'b' ? g.me.rating : g.opp.rating) || '?'})<div class="note">${fmtDate(g.end)} · ${g.tc} ${esc(g.tcStr || '')} · ${esc(g.opening)} · ${g.result === 'win' ? 'You won' : g.result === 'loss' ? 'You lost' : 'Draw'} by ${esc(g.how)}</div></div>
      <span class="sp"></span>${g.url ? `<a href="${esc(g.url)}" target="_blank" class="note">chess.com ↗</a>` : ''}</div>${(() => { const d = repDeviation(g); if (!d || d.type === 'end') return ''; return `<div class="note" style="margin-top:6px">📚 Repertoire: ${d.type === 'me' ? `<span style="color:var(--c-mistake)">you played ${esc(d.played)} at move ${Math.floor(d.ply / 2) + 1}; your prep says <b>${esc(d.expected)}</b></span>` : `opponent left your prep at move ${Math.floor(d.ply / 2) + 1} with ${esc(d.played)}`} · <a href="#" id="rgoply" data-p="${d.ply + 1}">jump there</a></div>`; })()}`;
    const jp = $('#rgoply'); if (jp) jp.onclick = e => { e.preventDefault(); this.vari = null; this.ply = +jp.dataset.p; this.update(); };
  },
  renderSummary() {
    const a = this.a, g = this.g, el = $('#rsum');
    if (!a) {
      const queued = Q.cur === g.id || Q.items.includes(g.id);
      el.innerHTML = `<div class="row"><div><b>Game review</b><div class="note">Runs Stockfish 17.1 on every move: classifications, accuracy, best moves and puzzles from this game.</div></div><span class="sp"></span>${queued ? `<span class="pill"><span class="dot"></span>${Q.cur === g.id ? 'Analyzing… ' + Math.round((Q.frac || 0) * 100) + '%' : 'Queued'}</span>` : `<select id="rdepth"><option value="12">Depth 12 (fast)</option><option value="16" selected>Depth 16</option><option value="20">Depth 20 (slow)</option></select><button class="btn primary" id="ranal">Analyze game</button>`}</div>`;
      const b = $('#ranal'); if (b) b.onclick = () => { const d = +$('#rdepth').value; const old = Q.depth; Q.items = Q.items.filter(x => x !== g.id); Q.items.unshift(g.id); Q.depthOverride = Q.depthOverride || {}; Q.depthOverride[g.id] = d; Q.total = Q.done + Q.items.length + (Q.cur ? 1 : 0); Q.run(); updateStatus(); this.renderSummary(); };
      return;
    }
    const cnt = { w: {}, b: {} };
    a.cls.forEach((c, i) => { const col = this.fens[i].split(' ')[1]; cnt[col][c] = (cnt[col][c] || 0) + 1; });
    const wN = g.color === 'w' ? g.me.name : g.opp.name, bN = g.color === 'b' ? g.me.name : g.opp.name;
    el.innerHTML = `<div class="row" style="justify-content:space-around;text-align:center;margin-bottom:6px">
      <div><div class="note">${esc(wN)}</div><div class="kpi" style="font-size:28px">${a.acc.w != null ? fmt1(calAcc(a.acc.w)) : '—'}</div><div class="note">Accuracy${g.acc ? ` · chess.com ${fmt1(g.color === 'w' ? g.acc.me : g.acc.opp)}` : ''}</div></div>
      <div><div class="note">${esc(bN)}</div><div class="kpi" style="font-size:28px">${a.acc.b != null ? fmt1(calAcc(a.acc.b)) : '—'}</div><div class="note">Accuracy${g.acc ? ` · chess.com ${fmt1(g.color === 'b' ? g.acc.me : g.acc.opp)}` : ''}</div></div></div>
      <svg class="graph" id="rgraph" viewBox="0 0 600 110" preserveAspectRatio="none"></svg>
      <table class="cls-tbl" style="margin-top:8px">${CLS_ORDER.map(c => `<tr><td class="c" style="color:${clsColor(c)}">${cnt.w[c] || 0}</td><td style="width:60%"><span class="row" style="gap:8px;justify-content:center">${icon(c)} ${CLS[c].name}</span></td><td class="c" style="color:${clsColor(c)}">${cnt.b[c] || 0}</td></tr>`).join('')}</table>
      <div class="note" style="text-align:center">Depth ${a.depth} · <a href="#" id="reanal">re-analyze deeper</a></div>`;
    $('#reanal').onclick = e => { e.preventDefault(); S.analysis.delete(g.id); DB.del('analysis', g.id); Q.items.unshift(g.id); Q.depthOverride = Q.depthOverride || {}; Q.depthOverride[g.id] = Math.min(22, a.depth + 4); Q.total = Q.done + Q.items.length + (Q.cur ? 1 : 0); Q.run(); this.renderSummary(); this.renderMoves(); this.update(); };
    this.drawGraph();
  },
  drawGraph() {
    const a = this.a, svg = $('#rgraph'); if (!a || !svg) return;
    const n = a.ev.length; const X = i => i / Math.max(1, n - 1) * 600, Y = ev => 110 - winW(ev) / 100 * 110;
    let d = `M0,110 ` + a.ev.map((e, i) => `L${X(i).toFixed(1)},${Y(e).toFixed(1)}`).join(' ') + ` L600,110 Z`;
    let s = `<rect width="600" height="110" fill="#3a3a36"/><path d="${d}" fill="#f1f1ec"/><line x1="0" x2="600" y1="55" y2="55" stroke="#888" stroke-width=".6"/>`;
    a.cls.forEach((c, i) => { if (['blunder', 'mistake', 'miss', 'brilliant', 'great'].includes(c)) s += `<circle cx="${X(i + 1)}" cy="${Y(a.ev[i + 1])}" r="3.4" fill="${getComputedStyle(document.documentElement).getPropertyValue('--c-' + c)}" stroke="#222" stroke-width="1" vector-effect="non-scaling-stroke"/>`; });
    s += `<line id="gcur" x1="${X(this.ply)}" x2="${X(this.ply)}" y1="0" y2="110" stroke="#5598e7" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
    svg.innerHTML = s;
    svg.onclick = e => { const b = svg.getBoundingClientRect(); this.vari = null; this.ply = clamp(Math.round((e.clientX - b.left) / b.width * (n - 1)), 0, n - 1); this.update(); };
    svg.onmousemove = e => { const b = svg.getBoundingClientRect(); const i = clamp(Math.round((e.clientX - b.left) / b.width * (n - 1)), 0, n - 1); svg.setAttribute('data-tip', i ? `Move ${Math.ceil(i / 2)}${i % 2 ? '' : '...'} ${esc(this.moves[i - 1].san)} · ${evalText(a.ev[i])}` : 'Start'); };
  },
  renderMoves() {
    const a = this.a; let h = '';
    const startB = this.fens[0].split(' ')[1] === 'b';
    const items = this.moves.map((m, i) => `<div class="m" data-p="${i + 1}">${a ? icon(a.cls[i]) : ''}${esc(m.san)}</div>`);
    if (startB) items.unshift('<div class="m"></div>');
    const mn0 = +this.fens[0].split(' ')[5];
    for (let i = 0; i < items.length; i += 2) h += `<div class="n">${mn0 + i / 2}.</div>${items[i]}${items[i + 1] || '<div></div>'}`;
    const el = $('#rmoves'); el.innerHTML = h;
    el.onclick = e => { const d = e.target.closest('.m[data-p]'); if (!d) return; this.vari = null; this.ply = +d.dataset.p; this.update(); };
  },
  nav(k) {
    if (k === 'flip') { this.board.flip(); this.update(); return; }
    if (this.vari) {
      const v = this.vari;
      if (k === 'prev') { if (v.i > 0) v.i--; else { this.vari = null; } }
      else if (k === 'next') { if (v.i < v.sans.length) v.i++; }
      else if (k === 'start' || k === 'end') { this.vari = null; this.ply = k === 'start' ? 0 : this.moves.length; }
      this.update(); return;
    }
    if (k === 'start') this.ply = 0; else if (k === 'end') this.ply = this.moves.length;
    else if (k === 'prev') this.ply = Math.max(0, this.ply - 1); else if (k === 'next') this.ply = Math.min(this.moves.length, this.ply + 1);
    this.update();
  },
  userMove(u) {
    const fen = this.curFen(); const ch = new Chess(fen); const m = moveUci(ch, u); if (!m) return false;
    if (!this.vari && this.ply < this.moves.length && uciOf(this.moves[this.ply]) === uciOf(m)) { this.ply++; this.update(); return; }
    if (!this.vari) this.vari = { base: this.ply, fens: [fen], sans: [], ucis: [], i: 0 };
    const v = this.vari; v.fens = v.fens.slice(0, v.i + 1); v.sans = v.sans.slice(0, v.i); v.ucis = v.ucis.slice(0, v.i);
    v.fens.push(ch.fen()); v.sans.push(m.san); v.ucis.push(uciOf(m)); v.i++;
    this.update();
  },
  curFen() { return this.vari ? this.vari.fens[this.vari.i] : this.fens[this.ply]; },
  update() {
    const a = this.a, g = this.g, p = this.ply; const fen = this.curFen();
    const opts = { arrows: [] };
    if (this.vari) { const v = this.vari; if (v.i) opts.last = v.ucis[v.i - 1]; }
    else if (p > 0) {
      const mv = this.moves[p - 1]; opts.last = uciOf(mv);
      if (a) {
        const c = a.cls[p - 1]; opts.badge = { sq: mv.to, cls: c };
        const best = a.best[p - 1]; if (best && best !== uciOf(mv) && !['book', 'forced', 'best'].includes(c)) opts.arrows.push({ u: best, color: '#5fb03c' });
      }
    }
    this.board.set(fen, opts);
    // players & clocks
    const top = this.board.orient === 'w' ? 'b' : 'w';
    const pl = col => { const isMe = col === g.color; const who = isMe ? g.me : g.opp; let clk = null; if (!this.vari) for (let i = p - 1; i >= 0; i--) { if (this.fens[i].split(' ')[1] === col) { clk = g.clocks[i]; break; } } return `<span class="cdot ${col}"></span>${esc(who.name)} <span class="muted">(${who.rating || '?'})</span>${clk != null ? `<span class="clk">${fmtClock(clk)}</span>` : ''}`; };
    $('#ptop').innerHTML = pl(top); $('#pbot').innerHTML = pl(top === 'w' ? 'b' : 'w');
    // move list highlight
    $$('#rmoves .m').forEach(d => d.classList.toggle('cur', !this.vari && +d.dataset.p === p));
    const cur = $(`#rmoves .m[data-p="${p}"]`); if (cur && !this.vari) { const box = $('#rmoves'); const t = cur.offsetTop - box.offsetTop; if (t < box.scrollTop || t > box.scrollTop + box.clientHeight - 30) box.scrollTop = t - 100; }
    const gc = $('#gcur'); if (gc && a) { const x = p / Math.max(1, a.ev.length - 1) * 600; gc.setAttribute('x1', x); gc.setAttribute('x2', x); }
    // variation panel
    const vr = $('#rvar');
    if (this.vari) { const v = this.vari; vr.innerHTML = `<div class="card" style="padding:10px 14px"><div class="row"><b>Your line:</b> <span class="t2">${v.sans.map((s, i) => `<span style="${i === v.i - 1 ? 'background:#4a4a42;border-radius:4px;padding:0 3px' : ''}">${esc(s)}</span>`).join(' ')}</span><span class="sp"></span><button class="btn sm" id="vexit">Back to game</button></div></div>`; $('#vexit').onclick = () => { this.vari = null; this.update(); }; }
    else vr.innerHTML = '';
    // comment
    this.comment();
    // eval bar + live engine
    const bar = $('.evalbar');
    if (a && !this.vari) evalBarSet(bar, a.ev[p], this.board.orient);
    $('#elines').innerHTML = '<div class="muted">Thinking…</div>';
    liveEval(fen, (c, fin) => {
      if (this.curFen() !== fen) return;
      if (c.terminal) { $('#elines').innerHTML = `<div>${c.lines[0].mate === 0 ? 'Checkmate' : 'Draw'}</div>`; evalBarSet(bar, c.lines[0], this.board.orient); return; }
      if (!a || this.vari) evalBarSet(bar, c.lines[0], this.board.orient);
      $('#edepth').textContent = 'depth ' + c.depth + (fin ? '' : '…');
      $('#elines').innerHTML = c.lines.filter(Boolean).map(l => `<div data-tip="${esc(pvText(fen, l.pv, 16))}"><b>${evalText(l)}</b> ${esc(pvText(fen, l.pv, 8))}</div>`).join('');
    });
  },
  comment() {
    const el = $('#rcom'), a = this.a, p = this.ply;
    if (this.vari) { el.style.borderLeftColor = 'var(--line)'; el.innerHTML = '<span class="t2">Exploring your own line. The engine panel shows how it evaluates.</span>'; return; }
    if (p === 0) { el.style.borderLeftColor = 'var(--line)'; el.innerHTML = `<span class="t2">Start position. ${a ? 'Step through the moves with → or click any move.' : 'Analyze the game to see move-by-move feedback.'}</span>`; return; }
    const mv = this.moves[p - 1];
    if (!a) { el.style.borderLeftColor = 'var(--line)'; el.innerHTML = `<b>${Math.ceil(p / 2)}${p % 2 ? '.' : '...'} ${esc(mv.san)}</b>`; return; }
    const c = a.cls[p - 1]; const mover = this.fens[p - 1].split(' ')[1];
    const isMe = mover === this.g.color; const who = isMe ? 'You' : esc(this.g.opp.name);
    const bestSan = a.best[p - 1] ? uciToSan(this.fens[p - 1], a.best[p - 1]) : null;
    const desc = { brilliant: 'is brilliant!! A sacrifice the engine approves.', great: 'is a great move — the only move that keeps the position.', best: 'is the best move.', excellent: 'is excellent.', good: 'is good.', book: 'is a book move.', inaccuracy: 'is an inaccuracy.', mistake: 'is a mistake.', miss: 'is a miss — this gave back a chance your opponent handed you.', blunder: 'is a blunder.', forced: 'was forced (only legal move).' }[c];
    let h = `<div class="row" style="gap:8px">${icon(c)}<b style="color:${clsColor(c)}">${esc(mv.san)}</b> <span>${desc}</span><span class="sp"></span><b>${evalText(a.ev[p])}</b></div>`;
    if (c === 'book') h += `<div class="note" style="margin-top:4px">${esc(this.g.opening)}</div>`;
    if (bestSan && !['best', 'book', 'forced', 'brilliant', 'great'].includes(c) && a.best[p - 1] !== uciOf(mv)) {
      h += `<div style="margin-top:6px" class="t2">Best was <b style="color:var(--c-best)">${esc(bestSan)}</b> (${evalText(a.ev[p - 1])}) <span class="note">${esc(pvText(this.fens[p - 1], (a.pv[p - 1] || '').split(' '), 6))}</span></div>`;
      if (['mistake', 'blunder', 'miss'].includes(c)) h += `<button class="btn sm" style="margin-top:8px" id="showbest">Show best line</button>`;
    }
    el.style.borderLeftColor = clsColor(c);
    el.innerHTML = h;
    const sb = $('#showbest'); if (sb) sb.onclick = () => {
      const pv = (a.pv[p - 1] || '').split(' ').slice(0, 8); const ch = new Chess(this.fens[p - 1]);
      this.ply = p - 1; this.vari = { base: p - 1, fens: [ch.fen()], sans: [], ucis: [], i: 0 };
      for (const u of pv) { const m = moveUci(ch, u); if (!m) break; this.vari.fens.push(ch.fen()); this.vari.sans.push(m.san); this.vari.ucis.push(u); }
      this.vari.i = 1; this.update();
    };
  },
  onAnalysed(id) { if (id === this.g.id) { this.renderSummary(); this.renderMoves(); this.update(); } else if (Q.cur === this.g.id || Q.items.includes(this.g.id)) this.renderSummary(); }
};
