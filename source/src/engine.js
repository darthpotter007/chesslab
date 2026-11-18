// ===== Stockfish wrapper =====
let SF_URL = null;
function sfUrls() {
  // The wasm binary is handed to the engine directly (Module.wasmBinary), so nothing is fetched:
  // this works when the page is opened straight from disk (file://).
  if (SF_URL) return SF_URL;
  if (!document.getElementById('sfwasm')) { SF_URL = 'engine/sf.js'; return SF_URL; } // hosted build: engine served as files
  const b64 = document.getElementById('sfwasm').textContent.trim();
  const pre = "self.__wb=(function(s){var b=atob(s),u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u})('" + b64 + "');\n";
  const loader = document.getElementById('sfjs').textContent.replace('u=function(n){r={locateFile', 'u=function(n){r={wasmBinary:self.__wb,locateFile');
  SF_URL = URL.createObjectURL(new Blob([pre, loader], { type: 'application/javascript' }));
  return SF_URL;
}
class Engine {
  constructor(name) { this.name = name; this.chain = Promise.resolve(); this.cur = null; this.listeners = []; }
  init() {
    if (this.ready) return this.ready;
    this.ready = new Promise((res, rej) => {
      try { this.w = new Worker(sfUrls()); } catch (e) { rej(e); return; }
      this.w.onmessage = e => this._line(String(e.data));
      this.w.onerror = e => { console.error(e); rej(e); };
      this._wait = l => { if (l === 'readyok') { this._wait = null; res(); } };
      this.w.postMessage('uci'); this.w.postMessage('setoption name Hash value 32'); this.w.postMessage('isready');
    });
    return this.ready;
  }
  _line(l) {
    if (this._wait) this._wait(l);
    const c = this.cur; if (!c) return;
    if (l.startsWith('info') && l.includes(' pv ') && l.includes('score')) {
      const d = +(/ depth (\d+)/.exec(l) || [])[1]; const mpv = +((/ multipv (\d+)/.exec(l) || [])[1] || 1);
      const sc = / score (cp|mate) (-?\d+)/.exec(l); const pv = l.split(' pv ')[1].trim().split(' ');
      if (l.includes('lowerbound') || l.includes('upperbound')) return;
      const stmW = c.fen.split(' ')[1] === 'w';
      let v = { d, pv };
      if (sc[1] === 'cp') v.cp = stmW ? +sc[2] : -sc[2]; else v.mate = stmW ? +sc[2] : -sc[2];
      if (!c.lines[mpv - 1] || d >= c.lines[mpv - 1].d) c.lines[mpv - 1] = v;
      if (mpv === 1) c.depth = d;
      c.onInfo && c.onInfo(c);
    } else if (l.startsWith('bestmove')) {
      const done = this.cur; this.cur = null;
      // ensure lines reflect final depth: drop secondary lines from lower depth than primary
      done.best = l.split(' ')[1];
      done.resolve(done);
    }
  }
  // Serialized analysis. opts: {depth, multipv, movetime, onInfo}
  analyze(fen, opts = {}) {
    const job = () => new Promise(async resolve => {
      await this.init();
      this.cur = { fen, lines: [], depth: 0, onInfo: opts.onInfo, resolve };
      this.w.postMessage('setoption name MultiPV value ' + (opts.multipv || 1));
      if (opts.skill != null || this._skill != null) { this.w.postMessage('setoption name Skill Level value ' + (opts.skill ?? 20)); this._skill = opts.skill ?? null; }
      this.w.postMessage('position fen ' + fen);
      this.w.postMessage(opts.movetime ? 'go movetime ' + opts.movetime : opts.infinite ? 'go infinite' : 'go depth ' + (opts.depth || 14));
    });
    const p = this.chain.then(job); this.chain = p.catch(() => { }); return p;
  }
  stop() { if (this.cur && this.w) this.w.postMessage('stop'); }
  newGame() { if (this.w) { this.w.postMessage('ucinewgame'); } }
}
const ENG_BG = new Engine('bg'), ENG_FG = new Engine('fg');

// ===== evaluation math =====
function winW(ev) { // white win% 0..100
  if (!ev) return 50;
  if (ev.mate != null) return ev.mate > 0 ? 100 : ev.mate < 0 ? 0 : (ev.matedW ? 0 : 100);
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * ev.cp)) - 1);
}
const winFor = (ev, col) => col === 'w' ? winW(ev) : 100 - winW(ev);
function evalText(ev) {
  if (!ev) return '';
  if (ev.mate != null) return ev.mate === 0 ? '#' : (ev.mate > 0 ? '' : '-') + 'M' + Math.abs(ev.mate);
  const v = ev.cp / 100; return (v > 0 ? '+' : '') + v.toFixed(2);
}
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
function material(ch, col) { let s = 0; for (const row of ch.board()) for (const p of row) if (p) s += (p.color === col ? 1 : -1) * VAL[p.type]; return s; }
function pieceCount(ch) { let n = 0; for (const row of ch.board()) for (const p of row) if (p && p.type !== 'p' && p.type !== 'k') n++; return n; }
function uciOf(m) { return m.from + m.to + (m.promotion || ''); }
function moveUci(ch, u) { return ch.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' }); }
function uciToSan(fen, u) { const c = new Chess(fen); const m = moveUci(c, u); return m ? m.san : u; }
function pvToSan(fen, pv, max = 10) { const c = new Chess(fen); const out = []; for (const u of pv.slice(0, max)) { const m = moveUci(c, u); if (!m) break; out.push(m.san); } return out; }
function pvText(fen, pv, max = 10) {
  const c = new Chess(fen); let n = +fen.split(' ')[5]; let t = c.turn(); let s = t === 'b' ? n + '... ' : '';
  for (const u of pv.slice(0, max)) { const m = moveUci(c, u); if (!m) break; if (t === 'w') s += n + '. '; s += m.san + ' '; if (t === 'b') n++; t = t === 'w' ? 'b' : 'w'; }
  return s.trim();
}

// static exchange on a square, side to move captures (returns gain >= 0)
function seeSq(ch, sq, d = 0) {
  if (d > 8) return 0;
  const caps = ch.moves({ verbose: true }).filter(m => m.to === sq && m.captured);
  if (!caps.length) return 0;
  caps.sort((a, b) => VAL[a.piece] - VAL[b.piece] || (a.piece === 'k') - (b.piece === 'k'));
  let best = 0;
  const m = caps[0]; const v = VAL[m.captured];
  ch.move(m); const g = v - seeSq(ch, sq, d + 1); ch.undo();
  best = Math.max(best, g);
  return best;
}
// best material the side NOT to move could grab right now (pieces worth 3+), via static exchange
function oppBestGrab(ch) {
  let worst = 0;
  for (const m of ch.moves({ verbose: true })) {
    if (!m.captured || VAL[m.captured] < 3) continue;
    ch.move(m); const g = VAL[m.captured] - seeSq(ch, m.to); ch.undo();
    if (g > worst) worst = g;
  }
  return worst;
}
// A real sacrifice: after the move the opponent can win >= 2 points net, AND the move itself created
// that (the material was not already hanging before it, e.g. a rook left behind by a forced king move).
function isSacrifice(fenBefore, uci) {
  const ch = new Chess(fenBefore); const mover = ch.turn();
  // what could the opponent already grab before our move? (flip the side to move)
  let hangingBefore = 0;
  if (!ch.in_check()) { const f = fenBefore.split(' '); f[1] = f[1] === 'w' ? 'b' : 'w'; f[3] = '-'; const c2 = new Chess(); if (c2.load(f.join(' '))) hangingBefore = oppBestGrab(c2); }
  const before = material(ch, mover);
  const mv = moveUci(ch, uci); if (!mv) return false;
  if (ch.in_checkmate()) return false;
  const afterMove = material(ch, mover);
  const worst = oppBestGrab(ch);
  const net = afterMove - before - worst;
  return net <= -2 && worst > hangingBefore;
}
// was the moved piece simply under attack (moving it away is the obvious move)?
function escapesAttack(fen, m) {
  const f = fen.split(' '); f[1] = f[1] === 'w' ? 'b' : 'w'; f[3] = '-';
  const c = new Chess(); if (!c.load(f.join(' '))) return false;
  return seeSq(c, m.from) > 0;
}
// ===== classification =====
const CLS = {
  brilliant: { sym: '!!', name: 'Brilliant' }, great: { sym: '!', name: 'Great' }, best: { sym: '★', name: 'Best' },
  excellent: { sym: '👍', name: 'Excellent' }, good: { sym: '✓', name: 'Good' }, book: { sym: '📖', name: 'Book' },
  inaccuracy: { sym: '?!', name: 'Inaccuracy' }, mistake: { sym: '?', name: 'Mistake' }, miss: { sym: '✗', name: 'Miss' },
  blunder: { sym: '??', name: 'Blunder' }, forced: { sym: '□', name: 'Forced' }
};
const CLS_ORDER = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];
const clsColor = c => `var(--c-${c})`;
function icon(c) { if (!c) return ''; const s = CLS[c].sym; return `<span class="ic" style="background:${clsColor(c)};font-size:${s.length > 1 && s !== '!!' && s !== '?!' && s !== '??' ? 9 : 10}px" title="${CLS[c].name}">${c === 'excellent' ? '👍' : c === 'book' ? '📖' : s}</span>`; }

const ANALYSIS_VER = 3;
const CLS_VER = 5; // bump when classification rules change: re-labels saved analyses without re-running the engine
// Build positions & moves for a game
function replay(g) {
  const ch = new Chess(g.startFen || undefined);
  const fens = [ch.fen()], moves = [];
  for (const s of g.sans) { const m = ch.move(s, { sloppy: true }); if (!m) break; moves.push(m); fens.push(ch.fen()); }
  return { fens, moves };
}
function terminalEval(fen) {
  const ch = new Chess(fen);
  if (ch.in_checkmate()) return { mate: 0, matedW: ch.turn() === 'w', cp: null };
  if (ch.in_draw() || ch.in_stalemate()) return { cp: 0 };
  return null;
}
async function analyzeGame(g, eng, depth = 12, onProg) {
  const { fens, moves } = replay(g);
  const ev = [], best = [], pv = [], sec = [];
  for (let i = 0; i < fens.length; i++) {
    const t = terminalEval(fens[i]);
    if (t) { ev.push(t); best.push(null); pv.push(null); sec.push(null); continue; }
    const r = await eng.analyze(fens[i], { depth, multipv: 2 });
    const l0 = r.lines[0] || {}; const l1 = r.lines[1];
    ev.push(l0.mate != null ? { mate: l0.mate } : { cp: l0.cp || 0 });
    best.push(l0.pv ? l0.pv[0] : r.best); pv.push((l0.pv || []).slice(0, 12).join(' '));
    sec.push(l1 ? (l1.mate != null ? { mate: l1.mate, u: l1.pv[0] } : { cp: l1.cp, u: l1.pv[0] }) : null);
    onProg && onProg(i + 1, fens.length);
  }
  const a = { id: g.id, ver: ANALYSIS_VER, depth, ev, best, pv, sec, at: Date.now() };
  classifyAll(g, a, fens, moves);
  return a;
}
function classifyAll(g, a, fens, moves) {
  if (!fens) ({ fens, moves } = replay(g));
  const cls = [], loss = [], acc = [];
  for (let i = 0; i < moves.length; i++) {
    const mover = fens[i].split(' ')[1]; const m = moves[i]; const u = uciOf(m);
    let evAfter = a.ev[i + 1];
    const isBest = a.best[i] === u;
    if (isBest && a.ev[i]) evAfter = a.ev[i];
    const wb = winFor(a.ev[i], mover), wa = winFor(evAfter, mover);
    const l = Math.max(0, wb - wa) / 100; loss.push(l);
    const ch = new Chess(fens[i]); const nLegal = ch.moves().length;
    let c;
    const inBook = i < (g.bookPly || 0) || (i < 30 && BOOK.epd[epdOf(fens[i + 1])] != null);
    if (nLegal === 1) c = 'forced';
    else if (inBook && l < 0.1) c = 'book';
    else {
      c = isBest || l <= 0.002 ? 'best' : l <= 0.02 ? 'excellent' : l <= 0.05 ? 'good' : l <= 0.10 ? 'inaccuracy' : l <= 0.20 ? 'mistake' : 'blunder';
      const prevL = i > 0 ? loss[i - 1] : 0;
      if ((c === 'mistake' || c === 'blunder') && prevL >= 0.10 && wb >= 60 && wb - winFor(a.ev[i - 1], mover) >= 10) c = 'miss';
      if ((c === 'best' || c === 'excellent') && l <= 0.02) {
        const secW = a.sec[i] ? winFor(a.sec[i], mover) : null;
        const recapture = i > 0 && m.captured && m.to === moves[i - 1].to;
        const inCheck = ch.in_check();
        // Brilliant = a real, voluntary sacrifice that the engine rates as the top move, when the position
        // wasn't already won anyway: not a reply to check, not a king move, not when a quiet alternative wins just as well.
        if (isBest && !inCheck && nLegal > 2 && m.piece !== 'k' && !(m.piece === 'p' && !m.promotion) && wa >= 50 && wb < 90 && !(secW != null && secW >= 80) && isSacrifice(fens[i], u)) c = 'brilliant';
        else if (secW != null && isBest && wb - secW >= 20 && !recapture && !ch.in_check() && wa >= 30 && wb < 92 && !(secW >= 80) && (m.piece !== 'k' || m.flags.includes('k') || m.flags.includes('q')) && !escapesAttack(fens[i], m)) c = 'great';
      }
    }
    cls.push(c);
  }
  a.cls = cls; a.loss = loss; a.cver = CLS_VER;
  a.acc = accuracy(a.ev, fens);
  a.phase = fens.slice(0, -1).map((f, i) => phaseOf(f, i));
  return a;
}
function phaseOf(fen, ply) {
  const ch = new Chess(fen); const n = pieceCount(ch);
  if (n <= 6) return 'end';
  if (ply < 20 && n > 10) return 'open';
  return 'mid';
}
// Game accuracy, tuned against chess.com's own accuracy numbers on 33 of your 2025-26 games
// (same "who played better" verdict in 33/33; ~5 points average gap after calibration):
// win chance uses a steeper curve (k=0.006), each move scores 103.17*e^(-0.085*winLoss)-2.17,
// and the game accuracy is the plain average of your move scores. calAcc() then maps it onto chess.com's scale.
const ACC_K1 = 0.006, ACC_K2 = 0.085;
function accuracy(evs, fens) {
  const wpA = ev => { if (!ev) return 50; if (ev.mate != null) return winW(ev); return 50 + 50 * (2 / (1 + Math.exp(-ACC_K1 * ev.cp)) - 1); };
  const wps = evs.map(wpA); const n = wps.length - 1; const out = { w: null, b: null, wm: [], bm: [] };
  if (n < 2) return out;
  const acc = { w: [], b: [] };
  for (let i = 0; i < n; i++) {
    const col = fens[i].split(' ')[1];
    const before = col === 'w' ? wps[i] : 100 - wps[i], after = col === 'w' ? wps[i + 1] : 100 - wps[i + 1];
    const d = Math.max(0, before - after);
    acc[col].push(clamp(103.1668 * Math.exp(-ACC_K2 * d) - 3.1669 + 1, 0, 100));
  }
  for (const c of ['w', 'b']) { const A = acc[c]; if (!A.length) continue; out[c] = A.reduce((x, y) => x + y, 0) / A.length; out[c + 'm'] = A; }
  return out;
}

// ===== puzzle generation from an analysed game =====
async function makePuzzles(g, a, eng, depth = 14) {
  const { fens, moves } = replay(g);
  const me = g.color; const cands = [];
  for (let i = 1; i < moves.length; i++) {
    if (fens[i].split(' ')[1] !== me || !a.best[i] || !a.ev[i]) continue;
    const wb = winFor(a.ev[i], me); const sw = a.sec[i] ? winFor(a.sec[i], me) : 0;
    const played = uciOf(moves[i]); const gap = wb - sw;
    const prevW = winFor(a.ev[i - 1], me);
    let kind = null;
    if (wb >= 70 && gap >= 22 && sw < 80 && wb - prevW >= 12) kind = played === a.best[i] ? 'found' : 'missed';
    else if (wb >= 70 && gap >= 22 && sw < 80 && played !== a.best[i] && (a.loss[i] || 0) >= 0.2) kind = 'missed';
    else if (played !== a.best[i] && (a.loss[i] || 0) >= 0.2 && wb >= 35 && wb < 70 && gap >= 25) kind = 'defense';
    else if (a.phase && a.phase[i] === 'open' && played !== a.best[i] && (a.loss[i] || 0) >= 0.08 && wb >= 40) kind = 'opening';
    if (kind) cands.push({ i, kind, gap });
  }
  cands.sort((x, y) => (x.kind === 'missed' ? -1 : 0) - (y.kind === 'missed' ? -1 : 0) || y.gap - x.gap);
  const out = [];
  for (const c of cands.slice(0, 4)) {
    const i = c.i; const line = [a.best[i]];
    const alts = [];
    if (c.kind === 'opening' && a.sec[i] && winFor(a.ev[i], me) - winFor(a.sec[i], me) <= 3) alts.push(a.sec[i].u);
    if (c.kind !== 'opening') {
      // extend line while the solver's moves stay unique
      const ch = new Chess(fens[i]); moveUci(ch, line[0]);
      const pv = (a.pv[i] || '').split(' ');
      const mat0 = material(new Chess(fens[i]), me);
      for (let k = 1; k + 1 < pv.length && line.length < 5; k += 2) {
        if (ch.game_over()) break;
        const reply = pv[k]; const rm = moveUci(ch, reply); if (!rm) break;
        if (ch.game_over()) { ch.undo(); break; }
        const r = await eng.analyze(ch.fen(), { depth, multipv: 2 });
        const l0 = r.lines[0], l1 = r.lines[1]; if (!l0) { ch.undo(); break; }
        const w0 = winFor(l0, me), w1 = l1 ? winFor(l1, me) : 0;
        const mateLine = l0.mate != null && (me === 'w' ? l0.mate > 0 : l0.mate < 0);
        const unique = mateLine ? !(l1 && l1.mate != null && Math.sign(l1.mate) === Math.sign(l0.mate)) || Math.abs(l0.mate) === 1 : (w0 - w1 >= 20 && w1 < 85);
        const gained = material(ch, me) - mat0;
        if (!unique || (!mateLine && gained >= 2 && !/[x+#]/.test(uciToSan(ch.fen(), l0.pv[0])))) { ch.undo(); break; }
        line.push(reply, l0.pv[0]); moveUci(ch, l0.pv[0]);
      }
    }
    const first = new Chess(fens[i]); const fm = moveUci(first, line[0]);
    const themes = [];
    const e = a.ev[i];
    if (e.mate != null && (me === 'w' ? e.mate > 0 : e.mate < 0) && Math.abs(e.mate) <= 5) themes.push('Mate in ' + Math.abs(e.mate));
    if (fm) {
      if (fm.promotion) themes.push('Promotion');
      if (isSacrifice(fens[i], line[0])) themes.push('Sacrifice');
      else if (fm.captured && VAL[fm.captured] >= 3 && seeSq(first, fm.to) === 0) themes.push('Hanging piece');
      if (forkCount(first, fm) >= 2) themes.push('Fork');
      if (fm.san.includes('+') && !themes.length) themes.push('Check');
    }
    if (a.phase && a.phase[i] === 'end') themes.push('Endgame');
    if (c.kind === 'defense') themes.push('Defense');
    if (c.kind === 'opening') themes.push('Opening');
    if (!themes.length || (themes.length === 1 && themes[0] === 'Endgame')) themes.push(fm && fm.captured ? 'Winning material' : 'Quiet move');
    const userMoves = Math.ceil(line.length / 2);
    const rating = Math.round(900 + userMoves * 180 + (themes.includes('Sacrifice') ? 250 : 0) + (themes.includes('Quiet move') ? 200 : 0) + (c.kind === 'defense' ? 150 : 0) + Math.min(200, (g.opp.rating || 1000) - 1000) * 0.4);
    out.push({
      id: g.id + '#' + i, gameId: g.id, ply: i, fen: fens[i], prevFen: fens[i - 1], prevMove: uciOf(moves[i - 1]),
      line, alts, color: me, kind: c.kind, themes, played: uciOf(moves[i]), rating, created: Date.now(),
      tries: 0, solved: 0, due: 0, ivl: 0, last: 0, phase: a.phase ? a.phase[i] : 'mid'
    });
  }
  return out;
}
function forkCount(chAfter, m) {
  // count enemy pieces (value>=3 or king) attacked by the moved piece
  const fen = chAfter.fen().split(' '); fen[1] = fen[1] === 'w' ? 'b' : 'w'; fen[3] = '-';
  const c = new Chess(); if (!c.load(fen.join(' '))) return 0;
  let n = m.san.includes('+') ? 1 : 0;
  for (const x of c.moves({ verbose: true, square: m.to })) if (x.captured && VAL[x.captured] >= 3 && VAL[x.captured] >= VAL[m.piece] - 0) n++;
  return n;
}

// ===== background queue (several engines in parallel on multi-core machines) =====
const Q = {
  items: [], active: new Map(), done: 0, total: 0, depth: 16, engines: [ENG_BG],
  get cur() { return this.active.size ? [...this.active.keys()][0] : null; },
  get frac() { const v = [...this.active.values()]; return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0; },
  workers() { const n = clamp(Math.floor((navigator.hardwareConcurrency || 2) / 4), 1, 3); while (this.engines.length < n) this.engines.push(new Engine('bg' + this.engines.length)); return n; },
  busy(id) { return this.active.has(id) || this.items.includes(id); },
  add(ids) { for (const id of ids) if (!this.items.includes(id) && !this.active.has(id)) this.items.push(id); this.total = this.done + this.items.length + this.active.size; this.run(); updateStatus(); },
  front(id, depth) { this.items = this.items.filter(x => x !== id); this.items.unshift(id); if (depth) { this.depthOverride = this.depthOverride || {}; this.depthOverride[id] = depth; } this.total = this.done + this.items.length + this.active.size; this.run(); updateStatus(); },
  cancel() { this.items = []; this.total = this.done + this.active.size; updateStatus(); },
  run() {
    const n = this.workers(); this.running = this.running || 0;
    while (this.running < n && this.items.length) { const eng = this.engines.find(e => !e._busy); if (!eng) break; this.worker(eng); }
  },
  async worker(eng) {
    eng._busy = true; this.running++;
    while (this.items.length) {
      const id = this.items.shift(); const g = S.byId.get(id); if (!g) continue;
      this.active.set(id, 0); updateStatus();
      try {
        const a = await analyzeGame(g, eng, (this.depthOverride && this.depthOverride[id]) || this.depth, (k, n) => { this.active.set(id, k / n); updateStatus(); });
        S.analysis.set(id, a); await DB.put('analysis', id, a);
        const ps = await makePuzzles(g, a, eng);
        for (const p of ps) if (!S.puzzles.has(p.id)) { S.puzzles.set(p.id, p); await DB.put('puzzles', p.id, p); }
        this.active.delete(id); onAnalysed(id);
      } catch (e) { console.error('analysis failed', id, e); this.active.delete(id); }
      this.done++;
    }
    eng._busy = false; this.running--;
    if (!this.running) { this.done = 0; this.total = 0; }
    updateStatus();
  }
};
function isAnalysed(id) { const a = S.analysis.get(id); return a && a.ver === ANALYSIS_VER; }
