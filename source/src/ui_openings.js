// ===== openings =====
let NAME_PATHS = null;
function namePaths() {
  if (NAME_PATHS) return NAME_PATHS;
  NAME_PATHS = new Map();
  const walk = (node, path) => { for (const [san, v] of Object.entries(node)) { const p = [...path, san]; if (v[0] >= 0 && !NAME_PATHS.has(v[0])) NAME_PATHS.set(v[0], p); if (v[1]) walk(v[1], p); } };
  walk(BOOK.tree, []); return NAME_PATHS;
}
function subtreeSize(node) { if (!node) return 0; let n = 0; for (const v of Object.values(node)) n += 1 + (v[1] ? subtreeSize(v[1]) : 0); return n; }
function fenAfter(sans) { const ch = new Chess(); for (const s of sans) if (!ch.move(s)) break; return ch.fen(); }

VIEWS.openings = {
  tab: 'tree', color: 'w', path: [],
  show(m, arg) {
    if (arg && arg.color) {
      this.tab = 'tree'; this.color = arg.color;
      if (arg.family) { const gs = scoped().filter(g => g.color === arg.color && g.family === arg.family); const cnt = {}; for (const g of gs) cnt[g.opening] = (cnt[g.opening] || 0) + 1; const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]; const g0 = top && gs.filter(g => g.opening === top[0]).sort((a, b) => a.bookPly - b.bookPly)[0]; this.path = g0 ? g0.sans.slice(0, Math.min(g0.bookPly, 12)) : []; }
    }
    if (arg && arg.train) { this.tab = 'train'; this.trainSel = arg.train; }
    m.innerHTML = `<div class="filters"><span class="chips">${[['tree', 'Your repertoire'], ['spots', 'Problem spots'], ['train', 'Opening trainer']].map(([v, t]) => `<span class="chip ${this.tab === v ? 'on' : ''}" data-t="${v}">${t}</span>`).join('')}</span></div><div id="obody"></div>`;
    $$('.chip[data-t]', m).forEach(c => c.onclick = () => { this.tab = c.dataset.t; liveStop(); render(); });
    this[this.tab]($('#obody'));
  },
  leave() { liveStop(); clearTimeout(this.tt); },
  // ---------- repertoire tree ----------
  tree(el) {
    el.innerHTML = `<div class="review"><div><div id="ob"></div><div class="navbtns"><button class="btn" id="oback">◀ Back</button><button class="btn" id="oroot">Start position</button></div></div>
      <div class="grid" style="gap:12px"><div class="card"><div class="row"><span class="chips">${[['w', 'As White'], ['b', 'As Black']].map(([v, t]) => `<span class="chip ${this.color === v ? 'on' : ''}" data-c="${v}">${t}</span>`).join('')}</span><span class="sp"></span><span class="note" id="oname"></span></div>
      <div class="crumbs" id="ocr" style="margin-top:10px"></div><div id="olist"></div></div>
      <div class="card" style="padding:10px 14px"><h3>Engine</h3><div class="enginelines" id="oeng"></div></div></div></div>`;
    $$('.chip[data-c]', el).forEach(c => c.onclick = () => { this.color = c.dataset.c; this.path = []; this.tree(el); });
    this.ob = new Board($('#ob'), { orient: this.color, canMove: () => true, onMove: u => { const ch = new Chess(fenAfter(this.path)); const mv = moveUci(ch, u); if (!mv) return false; this.path = [...this.path, mv.san]; this.drawTree(); } });
    $('#oback').onclick = () => { this.path = this.path.slice(0, -1); this.drawTree(); };
    $('#oroot').onclick = () => { this.path = []; this.drawTree(); };
    this.drawTree();
  },
  drawTree() {
    const path = this.path; const fen = fenAfter(path);
    const gs = filtered().filter(g => g.color === this.color && path.every((s, i) => g.sans[i] === s));
    const next = new Map();
    for (const g of gs) { const s = g.sans[path.length]; if (!s) continue; if (!next.has(s)) next.set(s, []); next.get(s).push(g); }
    const bn = bookNode(path);
    const myTurn = (path.length % 2 === 0) === (this.color === 'w');
    const bw = bookWalk(path);
    $('#oname').textContent = bw.name != null && bw.depth === path.length ? BOOKNAME(bw.name).name : bw.name != null ? BOOKNAME(bw.name).name + ' (out of book)' : '';
    let lastU = null; if (path.length) { const ch = new Chess(fenAfter(path.slice(0, -1))); const mm = ch.move(path[path.length - 1]); if (mm) lastU = uciOf(mm); }
    this.ob.orient = this.color; this.ob.set(fen, { last: lastU });
    let mn = 1, cr = `<span data-i="0">Start</span>`;
    path.forEach((s, i) => { cr += ` <span data-i="${i + 1}">${i % 2 === 0 ? (i / 2 + 1) + '.' : ''}${esc(s)}</span>`; });
    $('#ocr').innerHTML = cr; $$('#ocr span').forEach(sp => sp.onclick = () => { this.path = path.slice(0, +sp.dataset.i); this.drawTree(); });
    const rows = [...next.entries()].sort((a, b) => b[1].length - a[1].length);
    const bookOnly = bn ? Object.keys(bn).filter(s => !next.has(s)) : [];
    $('#olist').innerHTML = `<div class="t2" style="margin:4px 0 8px">${gs.length} of your games reached this position. ${myTurn ? '<b>Your move</b> — how you\'ve played it:' : '<b>Opponent to move</b> — what they played against you:'}</div>${WDL_LEGEND}
      ${rows.map(([s, list]) => { const inBook = bn && bn[s]; const nm = inBook && inBook[0] >= 0 ? BOOKNAME(inBook[0]).name : ''; return `<div data-s="${esc(s)}" style="cursor:pointer">${wdlRow(s, list, inBook ? '📖' + (nm ? ' ' + esc(nm.split(':').slice(1).join(':').trim() || nm) : '') : '<span style="color:var(--c-inaccuracy)">out of book</span>')}</div>`; }).join('') || '<div class="muted">None of your games continue from here.</div>'}
      ${bookOnly.length ? `<div class="note" style="margin-top:10px">Other book moves: ${bookOnly.slice(0, 10).map(s => `<a href="#" data-s="${esc(s)}">${esc(s)}</a>`).join(', ')}</div>` : ''}
      ${path.length >= 2 ? `<div class="row" style="margin-top:12px"><button class="btn sm" id="otrain">Train this line</button>${gs.length ? `<button class="btn sm" id="ogames">See these ${gs.length} games</button>` : ''}</div>` : ''}`;
    $$('#olist [data-s]').forEach(d => d.onclick = e => { e.preventDefault(); this.path = [...path, d.dataset.s]; this.drawTree(); });
    const ot = $('#otrain'); if (ot) ot.onclick = () => { this.tab = 'train'; this.trainSel = { path: path.slice(), color: this.color }; render(); };
    const og = $('#ogames'); if (og) og.onclick = () => { const bw2 = bookWalk(path); go('games', { q: bw2.name != null ? BOOKNAME(bw2.name).name : '' }); };
    $('#oeng').innerHTML = '<div class="muted">Thinking…</div>';
    liveEval(fen, (c, fin) => {
      if (fenAfter(this.path) !== fen) return;
      $('#oeng').innerHTML = c.lines.filter(Boolean).map(l => { const san = pvToSan(fen, l.pv, 1)[0]; const mine = next.get(san); return `<div><b>${evalText(l)}</b> ${esc(pvText(fen, l.pv, 7))}${mine ? ` <span class="tag">you: ${mine.length}×</span>` : ''}</div>`; }).join('') + `<div class="note">depth ${c.depth}</div>`;
    }, 18, 3);
  },
  // ---------- problem spots ----------
  spots(el) {
    const an = scoped().filter(g => isAnalysed(g.id));
    if (!an.length) { el.innerHTML = `<div class="card empty">Analyze some games first. Problem spots are the opening positions where you keep losing ground.<div style="margin-top:12px"><button class="btn primary" onclick="Q.add(scoped().filter(g=>!isAnalysed(g.id)).slice(0,30).map(g=>g.id));toast('Analyzing in the background')">Analyze 30 latest games</button></div></div>`; return; }
    const spots = new Map();
    for (const g of an) {
      const a = S.analysis.get(g.id); const { fens, moves } = replay(g);
      for (let i = 0; i < Math.min(moves.length, 30); i++) {
        if (fens[i].split(' ')[1] !== g.color) continue;
        if (a.phase[i] !== 'open' && i >= 24) continue;
        const c = a.cls[i]; if (!['inaccuracy', 'mistake', 'blunder', 'miss'].includes(c)) continue;
        const key = epdOf(fens[i]) + '|' + moves[i].san;
        if (!spots.has(key)) spots.set(key, { fen: fens[i], san: moves[i].san, best: a.best[i], n: 0, loss: 0, games: [], ply: i, opening: g.opening, worst: c });
        const s = spots.get(key); s.n++; s.loss += a.loss[i]; s.games.push(g); if (CLS_ORDER.indexOf(c) > CLS_ORDER.indexOf(s.worst)) s.worst = c;
      }
    }
    const list = [...spots.values()].sort((a, b) => b.n * b.loss - a.n * a.loss).slice(0, 25);
    el.innerHTML = `<div class="card"><h2>Where you go wrong in the opening</h2><p class="t2">Positions from the first ~12 moves where your move lost win chances, from ${an.length} analyzed games. Repeated mistakes are at the top. Fix these and you stop giving away points before the game starts.</p>
      <table><thead><tr><th>Opening</th><th>Move</th><th>You played</th><th>Better</th><th>Times</th><th>Avg win % lost</th><th></th></tr></thead><tbody>
      ${list.map((s, k) => `<tr class="click" data-k="${k}"><td class="t2" style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.opening)}</td><td>${Math.floor(s.ply / 2) + 1}${s.ply % 2 ? '...' : '.'}</td><td>${icon(s.worst)} ${esc(s.san)}</td><td style="color:var(--c-best);font-weight:700">${esc(uciToSan(s.fen, s.best))}</td><td>${s.n}</td><td>${fmt1(s.loss / s.n * 100)}</td><td><button class="btn sm" data-r="${k}">Review</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">No opening mistakes found. Nice!</td></tr>'}
      </tbody></table>${list.length ? `<div class="row" style="margin-top:12px"><button class="btn primary" onclick="go('puzzles',{kind:'opening'})">Drill opening fixes as puzzles →</button></div>` : ''}</div>`;
    $$('tr.click', el).forEach(r => r.onclick = () => { const s = list[+r.dataset.k]; const g = s.games[s.games.length - 1]; go('review', { id: g.id, ply: s.ply + 1 }); });
  },
  // ---------- trainer ----------
  train(el) {
    const mine = { w: {}, b: {} };
    for (const g of filtered()) if (g.opening !== 'Unknown') { const k = g.opening; mine[g.color][k] = mine[g.color][k] || { n: 0, g }; mine[g.color][k].n++; }
    const tops = col => Object.entries(mine[col]).sort((a, b) => b[1].n - a[1].n).slice(0, 8);
    el.innerHTML = `<div class="review"><div><div class="plyr" id="trt"></div><div id="trb"></div><div class="navbtns"><button class="btn" id="trre">↺ Restart line</button><button class="btn" id="trshow">Show move</button></div></div>
      <div class="grid" style="gap:12px">
        <div class="card"><h3>Pick a line</h3>
          <div class="t2" style="font-weight:600;margin:6px 0">Your most-played as White</div><div>${tops('w').map(([k, v]) => `<span class="tag" style="cursor:pointer" data-o="${esc(k)}" data-c="w">${esc(k)} · ${v.n}</span>`).join('') || '<span class="muted">—</span>'}</div>
          <div class="t2" style="font-weight:600;margin:10px 0 6px">Your most-played as Black</div><div>${tops('b').map(([k, v]) => `<span class="tag" style="cursor:pointer" data-o="${esc(k)}" data-c="b">${esc(k)} · ${v.n}</span>`).join('') || '<span class="muted">—</span>'}</div>
          <div class="row" style="margin-top:12px"><input id="trq" placeholder="Search any opening (e.g. Caro-Kann, London, Najdorf)" style="flex:1"><select id="trcol"><option value="w">Play White</option><option value="b">Play Black</option></select></div>
          <div id="trres" class="scroll" style="max-height:200px;margin-top:6px"></div></div>
        <div class="status" id="trstat">Pick an opening to start.</div>
        <div class="card" id="trinfo"></div></div></div>`;
    this.tb = new Board($('#trb'), { canMove: col => this.tr && !this.tr.wait && col === this.tr.color, onMove: u => this.trMove(u) });
    this.tb.set(new Chess().fen());
    const pickName = (name, col) => { const idx = BOOK.names.findIndex(n => n.split('|')[1] === name); const path = idx >= 0 ? namePaths().get(idx) : null; if (path) this.trStart({ path, color: col, name }); };
    $$('.tag[data-o]', el).forEach(t => t.onclick = () => pickName(t.dataset.o, t.dataset.c));
    $('#trq').oninput = e => {
      const q = e.target.value.toLowerCase().trim(); if (q.length < 2) { $('#trres').innerHTML = ''; return; }
      const res = []; const seen = new Set();
      BOOK.names.forEach((n, i) => { const nm = n.split('|')[1]; if (nm.toLowerCase().includes(q) && !seen.has(nm)) { seen.add(nm); res.push([nm, i]); } });
      res.sort((a, b) => a[0].length - b[0].length);
      $('#trres').innerHTML = res.slice(0, 40).map(([nm, i]) => `<div class="tree-row" style="grid-template-columns:1fr auto" data-i="${i}"><span>${esc(nm)}</span><span class="note">${esc(pvShort(namePaths().get(i)))}</span></div>`).join('') || '<div class="muted">No match</div>';
      $$('#trres [data-i]').forEach(d => d.onclick = () => { const i = +d.dataset.i; this.trStart({ path: namePaths().get(i), color: $('#trcol').value, name: BOOKNAME(i).name }); });
    };
    $('#trre').onclick = () => this.tr && this.trStart(this.tr.sel);
    $('#trshow').onclick = () => this.trShow();
    if (this.trainSel) { const s = this.trainSel; this.trainSel = null; const bw = bookWalk(s.path); this.trStart({ path: s.path, color: s.color, name: bw.name != null ? BOOKNAME(bw.name).name : 'Your line' }); }
  },
  trStart(sel) {
    clearTimeout(this.tt);
    this.tr = { sel, color: sel.color, path: [], target: sel.path, wait: false, errs: 0, right: 0, missedHere: false };
    this.tb.orient = sel.color; this.tb.set(new Chess().fen());
    $('#trt').innerHTML = `<b>${esc(sel.name)}</b><span class="sp"></span><span class="note">You play ${sel.color === 'w' ? 'White' : 'Black'}</span>`;
    $('#trinfo').innerHTML = `<div class="t2">Line: <b>${esc(pvShort(sel.path))}</b></div><div class="note" style="margin-top:6px">Play the moves of the line. After it, the trainer keeps going with other book moves, choosing the replies your real opponents play most.</div>`;
    this.trNext();
  },
  trBookMoves() {
    const t = this.tr; const ply = t.path.length;
    if (ply < t.target.length) return [t.target[ply]];
    const n = bookNode(t.path); return n ? Object.keys(n) : [];
  },
  trNext() {
    const t = this.tr; const fen = fenAfter(t.path); const ply = t.path.length;
    const moves = this.trBookMoves();
    let lastU = null; if (ply) { const ch = new Chess(fenAfter(t.path.slice(0, -1))); const mm = ch.move(t.path[ply - 1]); lastU = mm && uciOf(mm); }
    this.tb.set(fen, { last: lastU });
    if (!moves.length || ply >= 24) { SND.play('correct'); this.trStat('ok', `✓ End of book line. ${t.right} correct, ${t.errs} mistake${t.errs === 1 ? '' : 's'}. <a href="#" id="tragain">Again</a>`); const a = $('#tragain'); if (a) a.onclick = e => { e.preventDefault(); this.trStart(t.sel); }; return; }
    const myTurn = (ply % 2 === 0) === (t.color === 'w');
    if (myTurn) { t.missedHere = false; this.trStat('', `Your move. ${ply < t.target.length ? '' : '<span class="note">(any book move counts)</span>'}`); return; }
    // opponent: weighted by your real opponents' replies + book popularity
    t.wait = true;
    const counts = {}; for (const g of scoped()) if (g.color === t.color && t.path.every((s, i) => g.sans[i] === s)) { const s = g.sans[ply]; if (s) counts[s] = (counts[s] || 0) + 1; }
    const bn = bookNode(t.path) || {};
    const ws = moves.map(s => 1 + (counts[s] || 0) * 4 + Math.sqrt(subtreeSize(bn[s] && bn[s][1])));
    let r = Math.random() * ws.reduce((a, b) => a + b, 0), pick = moves[0]; for (let i = 0; i < moves.length; i++) { r -= ws[i]; if (r <= 0) { pick = moves[i]; break; } }
    this.tt = setTimeout(() => { t.path.push(pick); t.wait = false; this.trNext(); }, 450);
  },
  trMove(u) {
    const t = this.tr; const ch = new Chess(fenAfter(t.path)); const m = moveUci(ch, u); if (!m) return false;
    const ok = this.trBookMoves();
    if (ok.includes(m.san)) { if (!t.missedHere) t.right++; t.path.push(m.san); this.tb.set(ch.fen(), { last: u, marks: { [m.to]: 'good' } }); this.trStat('ok', `✓ ${esc(m.san)}`); t.wait = true; this.tt = setTimeout(() => { t.wait = false; this.trNext(); }, 350); return; }
    if (!t.missedHere) { t.errs++; t.missedHere = true; }
    this.tb.set(ch.fen(), { last: u, marks: { [m.to]: 'bad' } }); t.wait = true; setTimeout(() => SND.play('wrong'), 120);
    this.trStat('bad', `✗ ${esc(m.san)} isn't the book move here. Try again, or press <b>Show move</b>.`);
    this.tt = setTimeout(() => { t.wait = false; this.tb.set(fenAfter(t.path)); }, 800);
  },
  trShow() {
    const t = this.tr; if (!t) return; const mv = this.trBookMoves(); if (!mv.length) return;
    if (!t.missedHere) { t.errs++; t.missedHere = true; }
    const fen = fenAfter(t.path); const ch = new Chess(fen); const m = ch.move(mv[0]); if (!m) return;
    this.tb.set(fen, { arrows: [{ u: uciOf(m), color: '#5598e7' }] });
    this.trStat('', `Book move: <b>${esc(mv.join(', '))}</b>. Play it on the board.`);
  },
  trStat(c, h) { const s = $('#trstat'); if (s) { s.className = 'status ' + c; s.innerHTML = h; } }
};
function pvShort(sans) { if (!sans) return ''; return sans.map((s, i) => (i % 2 === 0 ? (i / 2 + 1) + '.' : '') + s).join(' '); }
