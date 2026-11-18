// ===== puzzles =====
const KIND_LABEL = { missed: 'Missed in your game', found: 'You found it', defense: 'Defense', opening: 'Opening fix', convert: 'Conversion' };
VIEWS.puzzles = {
  f: { kind: 'all', theme: 'all', since: '30', multi: false }, cur: null,
  // puzzles in the current filters; "since" keeps you learning from your recent games
  inPeriod(p, since = this.f.since) { if (since === 'all') return true; const g = S.byId.get(p.gameId); return g && g.end >= Date.now() - (+since) * DAY; },
  list(since) {
    const now = Date.now();
    return [...S.puzzles.values()].filter(p => S.byId.has(p.gameId) && inScope(S.byId.get(p.gameId)) && this.inPeriod(p, since)
      && (!this.f.multi || p.line.length >= 3)
      && (this.f.kind === 'all' || (this.f.kind === 'due' ? p.due && p.due <= now : p.kind === this.f.kind))
      && (this.f.theme === 'all' || p.themes.includes(this.f.theme) || (this.f.theme === 'Endgame' && p.phase === 'end')));
  },
  pick() {
    const ps = this.list(); if (!ps.length) return null; const now = Date.now();
    const due = ps.filter(p => p.due && p.due <= now && p !== this.cur);
    if (due.length) return due.sort((a, b) => a.due - b.due)[0];
    // newest games first; tactics before opening fixes (an opening fix counts as a week older)
    const lag = { missed: 0, defense: 1, found: 3, opening: 7 };
    const end = p => (S.byId.get(p.gameId) || {}).end || 0;
    const fresh = ps.filter(p => !p.tries && p !== this.cur).sort((a, b) => (end(b) - (lag[b.kind] || 0) * DAY) - (end(a) - (lag[a.kind] || 0) * DAY));
    if (fresh.length) return fresh[Math.floor(Math.random() * Math.min(3, fresh.length))];
    const rest = ps.filter(p => p !== this.cur).sort((a, b) => (a.due || 0) - (b.due || 0));
    return rest[0] || ps[0];
  },
  async show(m, arg) {
    if (arg && arg.kind) this.f.kind = arg.kind; if (arg && arg.theme) this.f.theme = arg.theme; if (arg && arg.since) this.f.since = arg.since;
    this.prating = (await DB.get('kv', 'prating')) || 1200;
    const all = [...S.puzzles.values()].filter(p => S.byId.has(p.gameId) && inScope(S.byId.get(p.gameId)));
    const themes = [...new Set(all.flatMap(p => p.themes))].sort();
    const now = Date.now(); const dueN = all.filter(p => p.due && p.due <= now).length;
    const tried = all.filter(p => p.tries), solved = all.filter(p => p.solved);
    if (!all.length) {
      m.innerHTML = `<div class="card hero"><h2>Puzzles from your own games</h2><p class="t2">After a game is analyzed, ChessLab pulls out the tactics you missed, the ones you found, and the moments you needed one precise defensive move. Each move in a solution is checked to be the only good one.</p>
      <button class="btn primary" onclick="Q.add(scoped().filter(g=>!isAnalysed(g.id)).slice(0,30).map(g=>g.id));toast('Analyzing 30 games, puzzles will appear here as they finish')">Analyze my 30 latest games</button></div>`;
      return;
    }
    m.innerHTML = `<div class="grid g4" style="margin-bottom:14px">
        <div class="card tile"><div class="v">${Math.round(this.prating)}</div><div class="l">Practice rating</div><div class="s">Moves up and down as you solve</div></div>
        <div class="card tile"><div class="v">${all.length}</div><div class="l">Puzzles from your games</div><div class="s">${all.filter(p => p.kind === 'missed').length} missed chances</div></div>
        <div class="card tile"><div class="v">${tried.length ? pct(solved.length, tried.length) + '%' : '—'}</div><div class="l">Solved first try</div><div class="s">${tried.length} attempted</div></div>
        <div class="card tile" style="cursor:pointer" onclick="go('puzzles',{kind:'due'})"><div class="v">${dueN}</div><div class="l">Due for review</div><div class="s">Missed puzzles come back</div></div></div>
      <div class="filters"><div><label>From games in</label><span class="chips">${[['14', 'Last 2 weeks'], ['30', 'Last month'], ['90', 'Last 3 months'], ['all', 'All time']].map(([v, t]) => `<span class="chip ${this.f.since === v ? 'on' : ''}" data-since="${v}">${t} <span style="opacity:.7">${all.filter(p => this.inPeriod(p, v)).length}</span></span>`).join('')}</span></div>
        <div><span class="chip ${this.f.multi ? 'on' : ''}" id="pzmulti">Multi-move only <span style="opacity:.7">${all.filter(p => p.line.length >= 3 && this.inPeriod(p)).length}</span></span></div></div>
      <div class="filters" style="margin-top:-6px"><div><label>Type</label><span class="chips">${[['all', 'All'], ['missed', 'Missed in game'], ['found', 'Found in game'], ['defense', 'Defense'], ['opening', 'Opening fixes'], ['due', 'Due']].map(([v, t]) => `<span class="chip ${this.f.kind === v ? 'on' : ''}" data-k="kind" data-v="${v}">${t}</span>`).join('')}</span></div>
        <div><label>Theme</label><select id="pth"><option value="all">All themes</option>${themes.map(t => `<option ${this.f.theme === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div></div>
      <div class="review"><div><div class="plyr" id="pzt"></div><div id="pzb"></div></div>
      <div class="grid" style="gap:12px"><div class="card" id="pzinfo"></div><div class="status" id="pzstat"></div>
      <div class="row"><button class="btn" id="pzhint">Hint</button><button class="btn" id="pzsol">Solution</button><button class="btn primary" id="pznext">Next puzzle →</button></div>
      <div class="card" id="pzgame"></div></div></div>`;
    $$('.chip[data-k]', m).forEach(c => c.onclick = () => { this.f.kind = c.dataset.v; this.cur = null; render(); });
    $$('.chip[data-since]', m).forEach(c => c.onclick = () => { this.f.since = c.dataset.since; this.cur = null; render(); });
    $('#pzmulti').onclick = () => { this.f.multi = !this.f.multi; this.cur = null; render(); };
    $('#pth').onchange = e => { this.f.theme = e.target.value; this.cur = null; render(); };
    this.board = new Board($('#pzb'), { canMove: col => this.cur && !this.done && col === this.cur.color && !this.busy, onMove: u => this.move(u) });
    $('#pznext').onclick = () => this.start(this.pick());
    $('#pzhint').onclick = () => this.hint();
    $('#pzsol').onclick = () => this.solution();
    this.start(this.cur && this.list().includes(this.cur) ? this.cur : this.pick());
  },
  leave() { clearTimeout(this.t); },
  start(p) {
    clearTimeout(this.t);
    if (!p) { const recentUn = scoped().filter(g => !isAnalysed(g.id) && (this.f.since === 'all' || g.end >= Date.now() - (+this.f.since) * DAY)).length;
      $('#pzinfo').innerHTML = `<span class="t2">No puzzles match these filters.${recentUn ? ` You have ${recentUn} unanalyzed games in this period.` : ''}</span>${recentUn ? `<div style="margin-top:8px"><button class="btn primary sm" onclick="Q.add(scoped().filter(g=>!isAnalysed(g.id)${this.f.since === 'all' ? '' : ' && g.end >= Date.now() - ' + (+this.f.since) + ' * DAY'}).map(g=>g.id));toast('Analyzing your recent games: puzzles appear as they finish')">Analyze them</button></div>` : ''}`; $('#pzstat').textContent = ''; this.board.set('8/8/8/8/8/8/8/8 w - - 0 1'); return; }
    this.cur = p; this.step = 0; this.failed = false; this.done = false; this.busy = true; this.hinted = 0;
    this.board.orient = p.color;
    const g = S.byId.get(p.gameId);
    const ch = new Chess(p.prevFen);
    this.board.set(p.prevFen, {});
    const um = Math.ceil(p.line.length / 2);
    $('#pzt').innerHTML = `<span class="cdot ${p.color}"></span> ${p.color === 'w' ? 'White' : 'Black'} to move <span class="sp"></span>${um > 1 ? `<span class="tag" style="background:#3e5a2c;color:#d8f0c8">${um}-move combination</span>` : ''}<span class="tag">≈${p.rating}</span>`;
    $('#pzinfo').innerHTML = `<div class="row"><b>${KIND_LABEL[p.kind]}</b><span class="sp"></span>${p.tries ? `<span class="note">Tried ${p.tries}× · solved ${p.solved}×</span>` : '<span class="tag">New</span>'}</div>
      <div class="t2" style="margin-top:6px">${um > 1 ? `<b>Find the whole ${um}-move sequence.</b> ` : ''}${{ missed: 'There was a strong move here that you didn\'t play. Find it.', found: 'You found the right idea in the game. Can you do it again?', defense: 'One precise move holds the position. Find it.', opening: 'You went wrong in the opening here. What should you play?' }[p.kind]}</div>
      <div style="margin-top:8px">${p.themes.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>`;
    $('#pzgame').innerHTML = `<div class="note">From your game vs <b>${esc(g.opp.name)}</b> (${g.opp.rating || '?'}) · ${fmtDate(g.end)} · ${esc(g.opening)}</div><div class="row" style="margin-top:6px"><button class="btn sm" id="pzopen">Open position in game review</button></div>`;
    $('#pzopen').onclick = () => go('review', { id: g.id, ply: p.ply });
    this.stat('', 'Watch your opponent\'s move…');
    this.t = setTimeout(() => { this.board.set(p.fen, { last: p.prevMove }); this.busy = false; this.stat('', 'Your move'); }, 650);
  },
  stat(cls, txt) { const s = $('#pzstat'); s.className = 'status ' + cls; s.innerHTML = txt; },
  move(u) {
    const p = this.cur; const exp = p.line[this.step]; const ch = new Chess(this.board.fen);
    const m = moveUci(ch, u); if (!m) return false;
    const ok = u === exp || (u.length === 4 && exp && exp.length === 5 && u === exp.slice(0, 4) && false) || (this.step === 0 && p.alts && p.alts.includes(u)) || ch.in_checkmate();
    if (!ok) {
      if (!this.failed) { this.failed = true; this.record(false); }
      this.board.set(ch.fen(), { last: u, marks: { [u.slice(2, 4)]: 'bad' } }); this.busy = true; setTimeout(() => SND.play('wrong'), 120);
      this.stat('bad', `✗ ${esc(m.san)} isn't it.${p.kind === 'missed' && this.step === 0 && u === p.played ? ' That\'s what you played in the game!' : ''} Try again.`);
      this.t = setTimeout(() => { this.busy = false; this.board.set(this.fenAt(), { last: this.lastU() }); }, 900);
      return;
    }
    this.step++; this.board.set(ch.fen(), { last: u, marks: { [u.slice(2, 4)]: 'good' } });
    if (this.step >= p.line.length || ch.game_over()) { this.finish(); return; }
    this.busy = true; this.stat('ok', `✓ ${esc(m.san)} — keep going`);
    this.t = setTimeout(() => { const r = p.line[this.step]; const c2 = new Chess(ch.fen()); moveUci(c2, r); this.step++; this.board.set(c2.fen(), { last: r }); this.busy = false; this.stat('', 'Your move'); }, 500);
  },
  fenAt() { const ch = new Chess(this.cur.fen); for (let i = 0; i < this.step; i++) moveUci(ch, this.cur.line[i]); return ch.fen(); },
  lastU() { return this.step ? this.cur.line[this.step - 1] : this.cur.prevMove; },
  finish() {
    this.done = true; setTimeout(() => SND.play(this.failed ? 'end' : 'correct'), 150);
    if (!this.failed) this.record(true);
    this.stat('ok', this.failed ? '✓ Solved (with help). It\'ll come back for review tomorrow.' : `✓ Solved! ${this.cur.kind === 'missed' ? 'Next time you\'ll see it over the board.' : ''}`);
  },
  async record(ok) {
    const p = this.cur; p.tries++; p.last = Date.now();
    if (ok) { p.solved++; p.ivl = Math.max(3, (p.ivl || 0) * 2.5); p.due = Date.now() + p.ivl * DAY; }
    else { p.ivl = 0; p.due = Date.now() + DAY; }
    const E = 1 / (1 + 10 ** ((p.rating - this.prating) / 400));
    this.prating = Math.round(this.prating + 24 * ((ok ? 1 : 0) - E));
    await DB.put('puzzles', p.id, p); await DB.put('kv', 'prating', this.prating);
    const t = $('.tile .v'); if (t) t.textContent = this.prating;
  },
  hint() {
    if (!this.cur || this.done || this.busy) return;
    if (!this.failed) { this.failed = true; this.record(false); }
    const u = this.cur.line[this.step]; this.hinted++;
    const marks = { [u.slice(0, 2)]: 'hint' }; if (this.hinted > 1) marks[u.slice(2, 4)] = 'hint';
    this.board.set(this.board.fen, { last: this.lastU(), marks });
    this.stat('', this.hinted > 1 ? 'Move the highlighted piece to the highlighted square.' : 'Hint: move the highlighted piece.');
  },
  solution() {
    if (!this.cur || this.done) return;
    if (!this.failed) { this.failed = true; this.record(false); }
    this.done = true; this.busy = true;
    const p = this.cur; const play = () => {
      if (this.step >= p.line.length) { this.busy = false; this.stat('', `Solution: <b>${esc(pvToSan(p.fen, p.line).join(' '))}</b>. This one will come back tomorrow.`); return; }
      const ch = new Chess(this.board.fen); const u = p.line[this.step]; moveUci(ch, u); this.step++;
      this.board.set(ch.fen(), { last: u, arrows: [] }); this.t = setTimeout(play, 700);
    };
    play();
  },
  onAnalysed() { }
};
