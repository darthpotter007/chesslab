// ===== utilities =====
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
const fmt1 = x => (Math.round(x * 10) / 10).toFixed(1);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const DAY = 864e5;
function toast(msg, ms = 2600) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), ms); }
function fmtDate(t) { return new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
function fmtClock(s) { if (s == null) return ''; s = Math.max(0, s); const m = Math.floor(s / 60), x = s % 60; return s < 20 ? `${m}:${x.toFixed(1).padStart(4, '0')}` : `${m}:${String(Math.floor(x)).padStart(2, '0')}`; }

// tooltip: any element with data-tip
(function () {
  let tip;
  document.addEventListener('mousemove', e => {
    tip = tip || document.getElementById('tip');
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (!el) { tip.style.display = 'none'; return; }
    tip.innerHTML = el.getAttribute('data-tip');
    tip.style.display = 'block';
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + w > innerWidth - 8) x = e.clientX - w - 14;
    if (y + h > innerHeight - 8) y = e.clientY - h - 14;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  });
})();

// ===== storage (IndexedDB with in-memory fallback) =====
const DB = {
  db: null, mem: {},
  stores: ['kv', 'games', 'analysis', 'puzzles', 'months'],
  async open() {
    try {
      this.db = await new Promise((res, rej) => {
        const r = indexedDB.open('chesslab', 1);
        r.onupgradeneeded = () => { for (const s of this.stores) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
    } catch (e) { console.warn('IndexedDB unavailable, using memory', e); this.db = null; }
    for (const s of this.stores) this.mem[s] = new Map();
  },
  _tx(store, mode, fn) {
    return new Promise((res, rej) => {
      const tx = this.db.transaction(store, mode); const st = tx.objectStore(store);
      const r = fn(st); tx.oncomplete = () => res(r && r.result); tx.onerror = () => rej(tx.error);
    });
  },
  async get(s, k) { if (!this.db) return this.mem[s].get(k); return this._tx(s, 'readonly', st => st.get(k)); },
  async put(s, k, v) { if (!this.db) return this.mem[s].set(k, v); return this._tx(s, 'readwrite', st => st.put(v, k)); },
  async putMany(s, entries) { if (!this.db) { for (const [k, v] of entries) this.mem[s].set(k, v); return; } return this._tx(s, 'readwrite', st => { for (const [k, v] of entries) st.put(v, k); }); },
  async del(s, k) { if (!this.db) return this.mem[s].delete(k); return this._tx(s, 'readwrite', st => st.delete(k)); },
  async all(s) {
    if (!this.db) return [...this.mem[s].entries()];
    return new Promise((res, rej) => {
      const out = []; const tx = this.db.transaction(s, 'readonly');
      const r = tx.objectStore(s).openCursor();
      r.onsuccess = () => { const c = r.result; if (c) { out.push([c.key, c.value]); c.continue(); } else res(out); };
      r.onerror = () => rej(r.error);
    });
  },
  async clear(s) { if (!this.db) return this.mem[s].clear(); return this._tx(s, 'readwrite', st => st.clear()); }
};

// ===== global state =====
const S = {
  user: '', games: [], byId: new Map(), analysis: new Map(), puzzles: new Map(),
  filters: { tc: 'all', range: 'all', rated: 'all' }, profile: null,
  settings: { tcs: { bullet: false, blitz: true, rapid: true, daily: true, unknown: true } }
};
const inScope = g => S.settings.tcs[g.tc] !== false;
const scoped = () => S.games.filter(inScope);

// ===== PGN parsing =====
function parsePGN(pgn) {
  const headers = {};
  pgn.replace(/\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]/g, (_, k, v) => { headers[k] = v; return ''; });
  let body = pgn.replace(/\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]\s*/g, '');
  const sans = [], clocks = [];
  let i = 0, depth = 0;
  const n = body.length;
  while (i < n) {
    const c = body[i];
    if (c === '{') {
      const j = body.indexOf('}', i); const com = body.slice(i + 1, j < 0 ? n : j);
      if (depth === 0) { const m = com.match(/\[%clk\s+(\d+):(\d+):(\d+(?:\.\d+)?)\]/); if (m && sans.length) clocks[sans.length - 1] = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]); }
      i = j < 0 ? n : j + 1; continue;
    }
    if (c === '(') { depth++; i++; continue; }
    if (c === ')') { depth--; i++; continue; }
    if (c === ';') { const j = body.indexOf('\n', i); i = j < 0 ? n : j; continue; }
    if (/\s/.test(c)) { i++; continue; }
    let j = i; while (j < n && !/[\s{}()]/.test(body[j])) j++;
    const tok = body.slice(i, j); i = j;
    if (depth > 0) continue;
    if (/^\d+\.+$/.test(tok) || /^\$\d+$/.test(tok) || /^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok)) continue;
    let t = tok.replace(/^\d+\.+/, '').replace(/[!?]+$/, '');
    if (!t) continue;
    sans.push(t);
  }
  for (let k = 0; k < sans.length; k++) if (clocks[k] === undefined) clocks[k] = null;
  return { headers, sans, clocks };
}
function splitPGNs(text) {
  const out = []; const parts = text.replace(/\r/g, '').split(/\n(?=\[Event )/);
  for (const p of parts) if (p.trim().startsWith('[')) out.push(p.trim());
  return out;
}

// ===== opening book =====
const BOOKNAME = i => { const s = BOOK.names[i]; const k = s.indexOf('|'); return { eco: s.slice(0, k), name: s.slice(k + 1) }; };
function bookWalk(sans) {
  let node = BOOK.tree, name = null, depth = 0;
  for (let i = 0; i < sans.length && i < 40; i++) {
    const nx = node && node[sans[i]];
    if (!nx) break;
    depth = i + 1; if (nx[0] >= 0) name = nx[0];
    node = nx[1] || null;
  }
  return { depth, name };
}
function bookNode(sans) { let node = BOOK.tree; for (const s of sans) { const nx = node && node[s]; if (!nx) return null; node = nx[1] || {}; } return node; }
const epdOf = fen => fen.split(' ').slice(0, 4).join(' ');
function familyOf(name) { return name ? name.split(':')[0] : 'Unknown'; }

// ===== time classes / normalization =====
const DRAWS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']);
function tcFromString(tc) {
  if (!tc || tc === '-') return 'unknown';
  if (tc.includes('/')) return 'daily';
  const [b, inc] = tc.split('+').map(Number); const est = b + 40 * (inc || 0);
  return est < 180 ? 'bullet' : est < 600 ? 'blitz' : 'rapid';
}
function baseSeconds(tc) { if (!tc || tc.includes('/')) return null; return +tc.split('+')[0] || null; }
function finishGame(g, p) {
  const bw = bookWalk(g.sans);
  g.bookPly = bw.depth;
  if (bw.name != null) { const b = BOOKNAME(bw.name); g.eco = b.eco; g.opening = b.name; } else { g.eco = ''; g.opening = 'Unknown'; }
  g.family = familyOf(g.opening);
  g.moves = Math.ceil(g.sans.length / 2);
  g.base = baseSeconds(g.tcStr);
  return g;
}
function normalizeApi(api, user) {
  if (api.rules && api.rules !== 'chess') return null;
  if (!api.pgn) return null;
  const p = parsePGN(api.pgn);
  const ul = user.toLowerCase();
  const isW = (api.white.username || '').toLowerCase() === ul;
  if (!isW && (api.black.username || '').toLowerCase() !== ul) return null;
  const me = isW ? api.white : api.black, op = isW ? api.black : api.white;
  const result = me.result === 'win' ? 'win' : DRAWS.has(me.result) ? 'draw' : 'loss';
  const how = result === 'win' ? op.result : me.result;
  const g = {
    id: api.url || api.uuid || (p.headers.Link || '') + api.end_time, url: api.url || p.headers.Link || '', user: ul,
    color: isW ? 'w' : 'b', me: { name: me.username, rating: me.rating }, opp: { name: op.username, rating: op.rating },
    result, how, tc: api.time_class || tcFromString(api.time_control), tcStr: api.time_control, rated: api.rated !== false,
    end: (api.end_time || 0) * 1000, sans: p.sans, clocks: p.clocks,
    acc: api.accuracies ? { me: isW ? api.accuracies.white : api.accuracies.black, opp: isW ? api.accuracies.black : api.accuracies.white } : null,
    startFen: p.headers.SetUp === '1' ? p.headers.FEN : null, src: 'api'
  };
  if (g.startFen && g.startFen.startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w')) g.startFen = null;
  return finishGame(g, p);
}
function normalizePGN(pgn, user) {
  const p = parsePGN(pgn); const h = p.headers; const ul = user.toLowerCase();
  const isW = (h.White || '').toLowerCase() === ul;
  if (!isW && (h.Black || '').toLowerCase() !== ul) return null;
  if (h.Variant && h.Variant !== 'Standard') return null;
  const r = h.Result; const won = (r === '1-0' && isW) || (r === '0-1' && !isW);
  const result = r === '1/2-1/2' ? 'draw' : won ? 'win' : (r === '*' ? 'draw' : 'loss');
  const term = (h.Termination || '').toLowerCase();
  let how = /checkmate/.test(term) ? 'checkmated' : /resign/.test(term) ? 'resigned' : /abandon/.test(term) ? 'abandoned' : /insufficient/.test(term) ? 'insufficient' : /time/.test(term) ? 'timeout' : /agree/.test(term) ? 'agreed' : /repetition/.test(term) ? 'repetition' : /stalemate/.test(term) ? 'stalemate' : /50/.test(term) ? '50move' : 'other';
  const date = (h.UTCDate || h.EndDate || h.Date || '1970.01.01').replace(/\./g, '-');
  const time = h.UTCTime || h.EndTime || '00:00:00';
  const end = Date.parse(date + 'T' + time + 'Z') || 0;
  const g = {
    id: h.Link || ('pgn:' + date + time + h.White + h.Black), url: h.Link || '', user: ul, color: isW ? 'w' : 'b',
    me: { name: isW ? h.White : h.Black, rating: +(isW ? h.WhiteElo : h.BlackElo) || null },
    opp: { name: isW ? h.Black : h.White, rating: +(isW ? h.BlackElo : h.WhiteElo) || null },
    result, how, tc: tcFromString(h.TimeControl), tcStr: h.TimeControl, rated: true, end, sans: p.sans, clocks: p.clocks, acc: null,
    startFen: h.SetUp === '1' ? h.FEN : null, src: 'pgn'
  };
  return finishGame(g, p);
}

// ===== chess.com import =====
async function fetchJSON(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url);
    if (r.status === 429) { await sleep(1500 * (i + 1)); continue; }
    if (r.status === 404) throw new Error('notfound');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  throw new Error('Rate limited by chess.com, try again in a minute');
}
async function importChessCom(user, onProg) {
  user = user.trim().toLowerCase();
  const arch = await fetchJSON(`https://api.chess.com/pub/player/${encodeURIComponent(user)}/games/archives`);
  const urls = arch.archives || [];
  const done = new Map((await DB.all('months')));
  let added = 0, k = 0;
  const now = new Date(); const curKey = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const todo = urls.filter(u => { const key = user + '|' + u.slice(-7); return !done.get(key) || u.slice(-7) >= prevMonthKey(curKey); });
  async function one(u) {
    const data = await fetchJSON(u);
    const ents = [];
    for (const api of data.games || []) {
      const g = normalizeApi(api, user); if (!g) continue;
      if (!S.byId.has(g.id)) added++;
      S.byId.set(g.id, g); ents.push([g.id, g]);
    }
    await DB.putMany('games', ents);
    await DB.put('months', user + '|' + u.slice(-7), { at: Date.now(), n: ents.length });
    onProg && onProg(++k, todo.length);
  }
  const pool = 2; let idx = 0;
  await Promise.all(Array.from({ length: pool }, async () => { while (idx < todo.length) { const u = todo[idx++]; await one(u); } }));
  try { S.profile = await fetchJSON(`https://api.chess.com/pub/player/${encodeURIComponent(user)}/stats`); await DB.put('kv', 'profile', S.profile); } catch (e) { }
  return { added, months: urls.length };
}
function prevMonthKey(k) { let [y, m] = k.split('/').map(Number); m--; if (!m) { m = 12; y--; } return `${y}/${String(m).padStart(2, '0')}`; }

async function loadAll() {
  S.user = (await DB.get('kv', 'user')) || '';
  S.profile = (await DB.get('kv', 'profile')) || null;
  const st = await DB.get('kv', 'settings'); if (st) Object.assign(S.settings.tcs, st.tcs || {});
  const games = await DB.all('games');
  S.byId = new Map(); for (const [k, g] of games) if (g.user === S.user) S.byId.set(k, g);
  rebuildGames();
  S.analysis = new Map(await DB.all('analysis'));
  S.puzzles = new Map(await DB.all('puzzles'));
}
function rebuildGames() { S.games = [...S.byId.values()].sort((a, b) => b.end - a.end); }

function filtered(gs = S.games) {
  const f = S.filters; const now = Date.now();
  const lim = { '30': 30, '90': 90, '365': 365 }[f.range];
  return gs.filter(g => inScope(g) && (f.tc === 'all' || g.tc === f.tc) && (!lim || g.end >= now - lim * DAY) && (f.rated === 'all' || (f.rated === 'rated') === g.rated));
}
