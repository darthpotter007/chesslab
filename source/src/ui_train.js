// ===== coach / training =====
VIEWS.train = {
  show(m) {
    this.acts = [];
    const gs = filtered(); const an = gs.filter(g => isAnalysed(g.id)); const un = gs.filter(g => !isAnalysed(g.id));
    const qn = Q.items.length + Q.active.size;
    let h = `<div class="row" style="margin-bottom:14px"><div><h1>Your coach</h1><div class="t2">Built from ${gs.length} games (${an.length} engine-analyzed). Change the scope with the filters on Stats, or time controls in Settings.</div></div><span class="sp"></span>
      ${un.length ? `<button class="btn ${an.length < 20 ? 'primary' : ''}" id="tan">Analyze ${Math.min(50, un.length)} more games</button>` : ''}</div>`;
    if (an.length < 5) h += `<div class="card" style="margin-bottom:14px"><b>${an.length < 1 ? 'Analyze some games to get coaching.' : 'Almost there.'}</b> <span class="t2">The coach needs at least 5 analyzed games, and 30 or more for reliable patterns. ${qn ? `${qn} games are in the queue right now.` : ''}</span></div>`;
    const items = an.length >= 5 ? this.findings(gs, an) : this.basicFindings(gs);
    const weak = items.filter(x => x.sev > 0).sort((a, b) => b.sev - a.sev), strong = items.filter(x => x.sev <= 0);
    if (weak.length) h += `<h2>Focus areas</h2><div class="grid g2" style="margin-bottom:18px">${weak.map((x, i) => this.card(x, i < 3)).join('')}</div>`;
    if (strong.length) h += `<h2>Strengths</h2><div class="grid g2">${strong.map(x => this.card(x)).join('')}</div>`;
    m.innerHTML = h;
    const ta = $('#tan'); if (ta) ta.onclick = () => { Q.add(un.slice(0, 50).map(g => g.id)); toast('Analyzing in the background. This page updates as games finish.'); };
    $$('[data-act]', m).forEach(b => b.onclick = () => { const a = this.acts[+b.dataset.act]; a && a(); });
  },
  acts: [],
  card(x, hi) {
    const acts = (x.actions || []).map(([label, fn]) => { this.acts.push(fn); return `<button class="btn sm ${hi ? 'primary' : ''}" data-act="${this.acts.length - 1}">${label}</button>`; }).join('');
    return `<div class="card focus ${x.sev <= 0 ? 'ok' : hi ? 'hi' : ''}"><div class="row"><b style="font-size:15px">${x.title}</b><span class="sp"></span>${x.metric ? `<span class="kpi" style="font-size:18px">${x.metric}</span>` : ''}</div>
      <div class="t2" style="margin:6px 0 10px">${x.detail}</div>${acts ? `<div class="row">${acts}</div>` : ''}</div>`;
  },
  basicFindings(gs) {
    const out = []; const c = wdlCount(gs); if (!c.n) return out;
    const score = gs2 => { const k = wdlCount(gs2); return k.n ? (k.w + k.d / 2) / k.n * 100 : null; };
    const overall = score(gs);
    const lt = gs.filter(g => g.result === 'loss' && g.how === 'timeout').length;
    if (c.l >= 5) out.push({ sev: lt / c.l > .25 ? .6 : -1, title: lt / c.l > .25 ? 'You lose a lot on time' : 'Clock handling is fine', metric: pct(lt, c.l) + '%', detail: `${lt} of your ${c.l} losses were on time. ${lt / c.l > .25 ? 'Try games with increment (e.g. 10+5 or 15+10), and make quick, simple moves in the opening, saving your time for critical positions.' : ''}` });
    this.openingFindings(gs, overall, out);
    this.tiltFindings(gs, overall, out);
    return out;
  },
  openingFindings(gs, overall, out) {
    for (const col of ['w', 'b']) {
      const mp = {}; for (const g of gs) if (g.color === col) (mp[g.family] = mp[g.family] || []).push(g);
      const rows = Object.entries(mp).filter(([k, v]) => v.length >= 6 && k !== 'Unknown').map(([k, v]) => { const c = wdlCount(v); return [k, v, (c.w + c.d / 2) / c.n * 100]; });
      rows.sort((a, b) => a[2] - b[2]);
      const worst = rows[0];
      if (worst && worst[2] < overall - 10) out.push({ sev: Math.min(1, (overall - worst[2]) / 30) * Math.min(1, worst[1].length / 15), title: `${worst[0]} as ${col === 'w' ? 'White' : 'Black'}`, metric: Math.round(worst[2]) + '%', detail: `You score ${Math.round(worst[2])}% in ${worst[1].length} games, against ${Math.round(overall)}% overall. See where your games in it go wrong and drill the main line.`, actions: [['Explore my games in it', () => go('openings', { color: col, family: worst[0] })], ['Problem spots', () => { VIEWS.openings.tab = 'spots'; go('openings'); }]] });
      const best = rows[rows.length - 1];
      if (best && best[2] > overall + 8 && best[1].length >= 8) out.push({ sev: -1, title: `${best[0]} as ${col === 'w' ? 'White' : 'Black'}`, metric: Math.round(best[2]) + '%', detail: `Your best opening by score (${best[1].length} games). Keep playing it.` });
    }
    const sw = wdlCount(gs.filter(g => g.color === 'w')), sb = wdlCount(gs.filter(g => g.color === 'b'));
    if (sw.n > 10 && sb.n > 10) { const a = (sw.w + sw.d / 2) / sw.n * 100, b = (sb.w + sb.d / 2) / sb.n * 100; if (Math.abs(a - b) > 12) { const weakC = a < b ? 'Black' : 'White'; out.push({ sev: Math.min(.7, Math.abs(a - b) / 40), title: `Weaker with ${a < b ? 'White' : 'Black'}`, metric: `${Math.round(Math.min(a, b))}% vs ${Math.round(Math.max(a, b))}%`, detail: `You score ${Math.round(a)}% as White and ${Math.round(b)}% as Black. Your ${a < b ? 'White' : 'Black'} repertoire deserves attention.`, actions: [['Open repertoire', () => go('openings', { color: a < b ? 'w' : 'b' })]] }); } }
  },
  tiltFindings(gs, overall, out) {
    const chron = [...gs].sort((a, b) => a.end - b.end); const after = [];
    for (let i = 1; i < chron.length; i++) if (chron[i - 1].result === 'loss' && chron[i].end - chron[i - 1].end < 3 * 3600e3) after.push(chron[i]);
    const c = wdlCount(after);
    if (c.n >= 10) { const s = (c.w + c.d / 2) / c.n * 100; out.push(s < overall - 7 ? { sev: Math.min(.8, (overall - s) / 25), title: 'You tilt after losses', metric: Math.round(s) + '%', detail: `Right after a loss you score ${Math.round(s)}%, against ${Math.round(overall)}% normally (${c.n} games). Rule to try: after 2 losses in a row, stop for at least 30 minutes, or go solve puzzles instead.` } : { sev: -1, title: 'You handle losses well', metric: Math.round(s) + '%', detail: `You score about the same right after a loss (${Math.round(s)}%) as normally (${Math.round(overall)}%).` }); }
  },
  findings(gs, an) {
    const out = []; const A = analysisAgg(an);
    const c = wdlCount(gs); const overall = (c.w + c.d / 2) / c.n * 100;
    // tactics
    const missRate = A.missed / an.length; const pun = A.oppBlunders ? A.punished / A.oppBlunders * 100 : 100;
    const missedPz = [...S.puzzles.values()].filter(p => p.kind === 'missed' && S.byId.has(p.gameId) && inScope(S.byId.get(p.gameId))).length;
    out.push(pun < 70 || missRate > .4 ? { sev: Math.min(1, (75 - pun) / 40 + missRate / 2), title: 'Missed tactics', metric: Math.round(pun) + '% punished', detail: `When your opponent made a mistake or blunder, you made them pay ${Math.round(pun)}% of the time (${A.punished}/${A.oppBlunders}). That's free points left on the board. There are ${missedPz} puzzles waiting from the exact moments you missed.`, actions: [['Solve my missed tactics', () => go('puzzles', { kind: 'missed' })]] } : { sev: -1, title: 'You punish mistakes', metric: Math.round(pun) + '%', detail: `You punished ${A.punished} of ${A.oppBlunders} opponent mistakes.` });
    // blunders by phase
    const ph = { open: 'opening', mid: 'middlegame', end: 'endgame' };
    const accs = ['open', 'mid', 'end'].filter(p => A.phaseAcc[p].n >= 20).map(p => [p, A.phaseAcc[p].avg]);
    if (accs.length >= 2) {
      accs.sort((a, b) => a[1] - b[1]); const [wp, wv] = accs[0]; const other = accs.slice(1).reduce((s, x) => s + x[1], 0) / (accs.length - 1);
      const acts = wp === 'end' ? [['Endgame puzzles', () => go('puzzles', { theme: 'Endgame' })], ['Play out my endgames', () => this.endgameDrill(an)]] : wp === 'open' ? [['Opening problem spots', () => { VIEWS.openings.tab = 'spots'; go('openings'); }], ['Opening trainer', () => { VIEWS.openings.tab = 'train'; go('openings'); }]] : [['Tactics from my games', () => go('puzzles', { kind: 'missed' })]];
      if (other - wv > 3) out.push({ sev: Math.min(1, (other - wv) / 15), title: `Weakest phase: ${ph[wp]}`, metric: fmt1(wv) + '%', detail: `Your average move accuracy is ${fmt1(wv)}% in the ${ph[wp]} vs ${fmt1(other)}% in the rest of the game. ${wp === 'end' ? 'Endgames reward technique: king activity, passed pawns, and knowing a few key positions.' : wp === 'open' ? 'You lose ground early. Learn your main lines a bit deeper and fix the repeated mistakes.' : 'Middlegames are where tactics live. Check every capture, check and threat before you move.'}`, actions: acts });
      const [bp, bv] = accs[accs.length - 1]; out.push({ sev: -1, title: `Strongest phase: ${ph[bp]}`, metric: fmt1(bv) + '%', detail: `Your most accurate phase.` });
    }
    // conversion
    if (A.winning.n >= 4) { const cr = A.winning.won / A.winning.n * 100; out.push(cr < 85 ? { sev: Math.min(1, (90 - cr) / 35), title: 'Converting winning positions', metric: Math.round(cr) + '%', detail: `You reached a winning position (85%+ win chance) in ${A.winning.n} games but won only ${A.winning.won}. Practice by playing those exact positions against Stockfish until you win them.`, actions: [['Practice converting (' + A.winning.games.length + ')', () => this.convertDrill(A.winning.games)]] } : { sev: -1, title: 'You convert your advantages', metric: Math.round(cr) + '%', detail: `You won ${A.winning.won} of ${A.winning.n} games where you got a winning position.` }); }
    if (A.losing.n >= 4) { const sr = A.losing.saved / A.losing.n * 100; if (sr >= 25) out.push({ sev: -1, title: 'Fighting spirit', metric: Math.round(sr) + '%', detail: `You saved ${A.losing.saved} of ${A.losing.n} lost positions. You don't give up.` }); }
    // time trouble
    if (A.lowTime.n >= 30) { const r1 = A.lowTime.rate, r0 = A.normalTime.rate; if (r1 > r0 * 1.8 && r1 > 3) out.push({ sev: Math.min(.9, (r1 / Math.max(r0, .5)) / 8), title: 'Blunders in time trouble', metric: `${fmt1(r1)} vs ${fmt1(r0)}`, detail: `You blunder ${fmt1(r1)} times per 100 moves when low on the clock, vs ${fmt1(r0)} normally. Spend less time in the opening (play your prepared moves fast) and avoid long thinks in quiet positions.` }); }
    const lt = gs.filter(g => g.result === 'loss' && g.how === 'timeout').length;
    if (c.l >= 8 && lt / c.l > .25) out.push({ sev: .5, title: 'Losing on time', metric: pct(lt, c.l) + '%', detail: `${lt} of ${c.l} losses were on time. Play some games with increment and practice making "good enough" moves quickly.` });
    // piece blunders
    const bp = Object.entries(A.blunderPiece).sort((a, b) => b[1] - a[1]); const tot = bp.reduce((s, x) => s + x[1], 0);
    if (tot >= 8) { const [p, n] = bp[0]; const nm = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }[p]; if (n / tot > .3 && p !== 'p') out.push({ sev: .35, title: `Most blunders are ${nm} moves`, metric: pct(n, tot) + '%', detail: `${n} of your ${tot} blunders came from moving your ${nm}. Before moving it, ask: is the square it's going to safe, and what did it stop defending?` }); }
    // blunder rate per game
    const bpg = (A.clsCount.blunder || 0) / an.length;
    out.push(bpg > 1 ? { sev: Math.min(.9, bpg / 3), title: 'Blunders', metric: fmt1(bpg) + '/game', detail: `You average ${fmt1(bpg)} blunders per game. A blunder-check before every move ("what does their last move threaten? is my piece safe there?") is the fastest way to gain rating.`, actions: [['Defensive puzzles', () => go('puzzles', { kind: 'defense' })]] } : { sev: -1, title: 'Few blunders', metric: fmt1(bpg) + '/game', detail: 'You keep your blunders low. Good discipline.' });
    this.openingFindings(gs, overall, out);
    this.tiltFindings(gs, overall, out);
    return out;
  },
  convertDrill(list) {
    const items = list.slice().sort((a, b) => b.g.end - a.g.end).map(({ g, ply }) => { const { fens } = replay(g); return { fen: fens[ply + 1], color: g.color, title: `Win this from your game vs ${g.opp.name}`, gameId: g.id, goal: 'win' }; }).filter(x => x.fen && x.fen.split(' ')[1] === x.color);
    if (!items.length) { toast('No positions available yet'); return; }
    go('play', { list: items, i: 0 });
  },
  endgameDrill(an) {
    const items = [];
    for (const g of an) { const a = S.analysis.get(g.id); const { fens } = replay(g); for (let i = 0; i < a.cls.length; i++) if (a.phase[i] === 'end' && fens[i].split(' ')[1] === g.color && ['mistake', 'blunder', 'miss'].includes(a.cls[i])) { const w = winFor(a.ev[i], g.color); items.push({ fen: fens[i], color: g.color, title: `Endgame vs ${g.opp.name}: you went wrong here`, gameId: g.id, goal: w >= 70 ? 'win' : w >= 30 ? 'draw' : 'draw' }); break; } }
    if (!items.length) { toast('No endgame mistakes found yet'); return; }
    go('play', { list: items, i: 0 });
  },
  onAnalysed() { if (!_refreshT) _refreshT = setTimeout(() => { _refreshT = null; if (CURVIEW === 'train') render(); }, 4000); }
};

// ===== play vs engine =====
VIEWS.play = {
  lvl: 20,
  show(m, arg) {
    if (arg) this.arg = arg;
    if (!this.arg) this.arg = { list: [{ fen: new Chess().fen(), color: 'w', title: 'Free game vs Stockfish', goal: 'win' }], i: 0 };
    const it = this.arg.list[this.arg.i];
    m.innerHTML = `<div class="review"><div><div class="plyr" id="plt"></div><div class="boardwrap"><div class="evalbar" id="pleb" style="visibility:hidden"><div class="wfill"></div><div class="txt"></div></div><div style="flex:1"><div id="plb"></div></div></div>
      <div class="navbtns"><button class="btn" id="plundo">↶ Take back</button><button class="btn" id="plre">↺ Restart</button><button class="btn" id="pleval">Show eval</button></div></div>
      <div class="grid" style="gap:12px"><div class="card"><b>${esc(it.title)}</b><div class="t2" style="margin-top:6px">Goal: <b>${it.goal === 'win' ? 'win the game' : 'hold the draw (or better)'}</b> as ${it.color === 'w' ? 'White' : 'Black'} against Stockfish.</div>
        <div class="row" style="margin-top:10px"><label class="note">Engine strength</label><select id="pllvl">${[[20, 'Full strength'], [15, 'Strong (~2400)'], [10, 'Club (~1900)'], [5, 'Casual (~1400)'], [1, 'Beginner']].map(([v, t]) => `<option value="${v}" ${this.lvl == v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        ${this.arg.list.length > 1 ? `<div class="row" style="margin-top:10px"><span class="note">Position ${this.arg.i + 1} of ${this.arg.list.length}</span><span class="sp"></span><button class="btn sm" id="plprev" ${this.arg.i ? '' : 'disabled'}>← Prev</button><button class="btn sm" id="plnext" ${this.arg.i < this.arg.list.length - 1 ? '' : 'disabled'}>Next →</button></div>` : ''}
        ${it.gameId ? `<div style="margin-top:8px"><a href="#" id="plgame" class="note">Open the original game</a></div>` : ''}
        <div class="row" style="margin-top:10px"><button class="btn sm" id="plnew">New game from start position</button></div></div>
      <div class="status" id="plst"></div></div></div>`;
    this.it = it; this.hist = [it.fen]; this.showEval = false;
    this.b = new Board($('#plb'), { orient: it.color, canMove: col => col === it.color && !this.thinking && !this.over, onMove: u => this.move(u) });
    $('#pllvl').onchange = e => this.lvl = +e.target.value;
    $('#plundo').onclick = () => { if (this.thinking) return; while (this.hist.length > 1) { this.hist.pop(); if (this.hist[this.hist.length - 1].split(' ')[1] === it.color) break; } this.over = false; this.sync(); };
    $('#plre').onclick = () => { if (this.thinking) return; this.hist = [it.fen]; this.over = false; this.sync(); };
    $('#pleval').onclick = () => { this.showEval = !this.showEval; $('#pleb').style.visibility = this.showEval ? 'visible' : 'hidden'; $('#pleval').textContent = this.showEval ? 'Hide eval' : 'Show eval'; this.sync(); };
    const pp = $('#plprev'), pn = $('#plnext'); if (pp) pp.onclick = () => { this.arg.i--; render(); }; if (pn) pn.onclick = () => { this.arg.i++; render(); };
    const pg = $('#plgame'); if (pg) pg.onclick = e => { e.preventDefault(); go('review', it.gameId); };
    $('#plnew').onclick = () => { this.arg = { list: [{ fen: new Chess().fen(), color: Math.random() < .5 ? 'w' : 'b', title: 'Free game vs Stockfish', goal: 'win' }], i: 0 }; render(); };
    $('#plt').innerHTML = `<span class="cdot ${it.color}"></span> You play ${it.color === 'w' ? 'White' : 'Black'}`;
    this.over = false; this.sync();
  },
  leave() { liveStop(); this.thinking = false; },
  sync(last) {
    const fen = this.hist[this.hist.length - 1]; this.b.set(fen, { last });
    const ch = new Chess(fen);
    if (this.showEval) liveEval(fen, c => { if (this.hist[this.hist.length - 1] === fen && c.lines[0]) evalBarSet($('#pleb'), c.lines[0], this.it.color); }, 14, 1);
    if (ch.game_over() || this.repetition()) { if (!this.over && !ch.in_checkmate()) SND.play('end'); this.over = true; const draw = !ch.in_checkmate(); const iWon = ch.in_checkmate() && ch.turn() !== this.it.color; const ok = iWon || (draw && this.it.goal === 'draw'); this.st(ok ? 'ok' : 'bad', iWon ? '🏆 Checkmate, you won!' : draw ? (this.it.goal === 'draw' ? '✓ Draw — goal achieved.' : '½ Draw. You were trying to win — try again!') : 'You were checkmated. Take back or restart and try another plan.'); return; }
    if (ch.turn() !== this.it.color) this.engineMove(); else this.st('', 'Your move');
  },
  repetition() { const k = this.hist.map(f => f.split(' ').slice(0, 4).join(' ')); const last = k[k.length - 1]; return k.filter(x => x === last).length >= 3; },
  move(u) { const ch = new Chess(this.hist[this.hist.length - 1]); const m = moveUci(ch, u); if (!m) return false; this.hist.push(ch.fen()); this.sync(u); },
  async engineMove() {
    this.thinking = true; this.st('', 'Stockfish is thinking…'); liveStop();
    const fen = this.hist[this.hist.length - 1];
    const r = await ENG_FG.analyze(fen, { movetime: this.lvl >= 20 ? 700 : 400, skill: this.lvl, multipv: 1 });
    this.thinking = false;
    if (CURVIEW !== 'play' || this.hist[this.hist.length - 1] !== fen) return;
    const ch = new Chess(fen); if (!moveUci(ch, r.best)) return;
    this.hist.push(ch.fen()); this.sync(r.best);
  },
  st(c, h) { const s = $('#plst'); if (s) { s.className = 'status ' + c; s.innerHTML = h; } }
};
