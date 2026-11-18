// ===== Cloud sync via a private GitHub Gist =====
// What syncs: analyses, puzzles (+ your progress on them), repertoire + drill progress, settings, practice rating.
// Games themselves are re-imported from chess.com on a new device (automatic after the first sync).
const SYNC = {
  NB: 32, DESC: 'ChessLab sync (managed by the app, do not edit)',
  dirty: new Set(), busy: false, timer: null, status: '', login: '',
  token() { try { return localStorage.getItem('cl_gh_token') || ''; } catch (e) { return ''; } },
  gist() { try { return localStorage.getItem('cl_gist_id') || ''; } catch (e) { return ''; } },
  on() { return !!(this.token() && this.gist()); },
  async api(path, opts = {}) {
    const r = await fetch('https://api.github.com' + path, { ...opts, cache: 'no-store', headers: { Authorization: 'Bearer ' + this.token(), Accept: 'application/vnd.github+json', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
    if (r.status === 401) throw new Error('GitHub rejected the token (expired or revoked). Reconnect in Settings.');
    if (!r.ok) throw new Error('GitHub error ' + r.status);
    return r.status === 204 ? null : r.json();
  },
  bucket(id) { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0; return Math.abs(h) % this.NB; },
  async enc(obj) {
    const gz = await new Response(new Blob([JSON.stringify(obj)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    const u = new Uint8Array(gz); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  },
  async dec(b64) {
    const bin = atob(b64.trim()); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return JSON.parse(await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
  },
  // called by DB.put / putMany: remember what changed so only that is uploaded
  touch(store, key) {
    if (this.applying) return;
    if (store === 'analysis') this.dirty.add('a' + this.bucket(String(key)));
    else if (store === 'puzzles') this.dirty.add('p' + this.bucket(String(key)) % 4);
    else if (store === 'kv' && ['rep', 'prating', 'settings', 'user'].includes(key)) { this.dirty.add('meta'); DB._raw('kv', 'metaMod', Date.now()); }
    else return;
    this.schedule();
  },
  schedule(ms = 20000) { if (!this.on()) return; clearTimeout(this.timer); this.timer = setTimeout(() => this.push().catch(e => this.fail(e)), ms); },
  setStatus(s) { this.status = s; const el = $('#syncst'); if (el) el.innerHTML = s; const hd = $('#syncdot'); if (hd) { hd.textContent = this.on() ? (this.busy ? '☁ syncing…' : '☁ synced') : ''; hd.title = s.replace(/<[^>]+>/g, ''); } },
  fail(e) { console.error(e); this.busy = false; this.setStatus('⚠ ' + esc(e.message)); },
  async connect(token) {
    localStorage.setItem('cl_gh_token', token.trim());
    const me = await this.api('/user'); this.login = me.login; localStorage.setItem('cl_gh_login', me.login);
    let id = '';
    for (let page = 1; page <= 5 && !id; page++) { const list = await this.api(`/gists?per_page=100&page=${page}`); const g = list.find(x => x.description === this.DESC); if (g) id = g.id; if (list.length < 100) break; }
    if (!id) { const g = await this.api('/gists', { method: 'POST', body: JSON.stringify({ description: this.DESC, public: false, files: { 'README.md': { content: 'Private backup of ChessLab progress (analyses, puzzles, repertoire).\nManaged automatically by https://darthpotter007.github.io/chesslab/ — please do not edit.' } } }) }); id = g.id; }
    localStorage.setItem('cl_gist_id', id);
    return this.sync(true);
  },
  disconnect() { localStorage.removeItem('cl_gh_token'); localStorage.removeItem('cl_gist_id'); this.setStatus('Not connected'); },
  async readFiles() {
    const g = await this.api('/gists/' + this.gist()); const out = {};
    for (const [name, f] of Object.entries(g.files)) {
      if (!name.endsWith('.b64')) continue;
      let c = f.content; if (f.truncated) c = await (await fetch(f.raw_url, { cache: 'no-store' })).text();
      out[name.replace('.b64', '')] = c;
    }
    return out;
  },
  // pull remote, merge record by record (newest wins), then push whatever is newer here
  async sync(first = false) {
    if (!this.on() || this.busy) return; this.busy = true; this.setStatus('Syncing…');
    try {
      const files = await this.readFiles(); let got = 0; this.applying = true;
      // analyses
      for (let b = 0; b < this.NB; b++) {
        const key = 'a' + b; const remote = files[key] ? await this.dec(files[key]) : {};
        const local = [...S.analysis.entries()].filter(([id]) => this.bucket(id) === b);
        const put = [];
        for (const [id, a] of Object.entries(remote)) { const l = S.analysis.get(id); if (!l || (a.at || 0) > (l.at || 0)) { S.analysis.set(id, a); put.push([id, a]); got++; } }
        if (put.length) await DB.putMany('analysis', put);
        if (local.some(([id, a]) => !remote[id] || (a.at || 0) > (remote[id].at || 0))) this.dirty.add(key);
      }
      // puzzles
      for (let b = 0; b < 4; b++) {
        const key = 'p' + b; const remote = files[key] ? await this.dec(files[key]) : {};
        const ts = p => Math.max(p.last || 0, p.created || 0);
        const put = [];
        for (const [id, p] of Object.entries(remote)) { const l = S.puzzles.get(id); if (!l || ts(p) > ts(l)) { S.puzzles.set(id, p); put.push([id, p]); got++; } }
        if (put.length) await DB.putMany('puzzles', put);
        if ([...S.puzzles.entries()].some(([id, p]) => this.bucket(id) % 4 === b && (!remote[id] || ts(p) > ts(remote[id])))) this.dirty.add(key);
      }
      // meta: settings, practice rating, repertoire (per colour, newest wins), username
      if (files.meta) {
        const m = await this.dec(files.meta); const myMod = (await DB.get('kv', 'metaMod')) || 0;
        const rep = (await DB.get('kv', 'rep')) || { w: REP.empty(), b: REP.empty() };
        let repChanged = false;
        for (const c of ['w', 'b']) if (m.rep && m.rep[c] && (m.rep[c].mod || m.rep[c].built || 0) > (rep[c].mod || rep[c].built || 0)) { rep[c] = m.rep[c]; repChanged = true; }
        if (repChanged) { await DB.put('kv', 'rep', rep); REP.data = rep; got++; }
        if ((m.mod || 0) > myMod) {
          if (m.settings) { S.settings = m.settings; await DB.put('kv', 'settings', m.settings); }
          if (m.prating) await DB.put('kv', 'prating', m.prating);
          if (m.user && !S.user) { S.user = m.user; await DB.put('kv', 'user', m.user); }
          await DB.put('kv', 'metaMod', m.mod); got++;
        } else if (myMod > (m.mod || 0)) this.dirty.add('meta');
        for (const c of ['w', 'b']) if ((rep[c].mod || rep[c].built || 0) > ((m.rep && m.rep[c] && (m.rep[c].mod || m.rep[c].built)) || 0)) this.dirty.add('meta');
      } else this.dirty.add('meta');
      this.applying = false;
      if (got) { recalib(); userHdr(); }
      await this.push(true);
      await DB.put('kv', 'syncAt', Date.now());
      this.setStatus(`✓ Synced ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${got ? ` · ${got} update${got === 1 ? '' : 's'} pulled from the cloud` : ''}`);
      // brand-new device: fetch the games too
      if (first && S.user && !S.games.length) { this.setStatus('✓ Synced. Importing your games from chess.com…'); try { await importChessCom(S.user, () => { }); rebuildGames(); userHdr(); } catch (e) { } this.setStatus('✓ Synced, games imported'); }
      if (got && VIEWS[CURVIEW] && CURVIEW !== 'review' && CURVIEW !== 'play') render();
    } catch (e) { this.applying = false; this.fail(e); }
    this.busy = false; this.setStatus(this.status);
  },
  async push(inSync = false) {
    if (!this.on() || (!inSync && this.busy) || !this.dirty.size) return;
    if (!inSync) { this.busy = true; this.setStatus('Uploading…'); }
    try {
      const keys = [...this.dirty]; this.dirty.clear(); const files = {};
      for (const k of keys) {
        let obj;
        if (k === 'meta') { const rep = (await DB.get('kv', 'rep')) || null; obj = { v: 1, mod: (await DB.get('kv', 'metaMod')) || Date.now(), user: S.user, settings: S.settings, prating: await DB.get('kv', 'prating'), rep }; }
        else if (k[0] === 'a') { const b = +k.slice(1); obj = {}; for (const [id, a] of S.analysis) if (this.bucket(id) === b) obj[id] = a; }
        else { const b = +k.slice(1); obj = {}; for (const [id, p] of S.puzzles) if (this.bucket(id) % 4 === b) obj[id] = p; }
        files[k + '.b64'] = { content: await this.enc(obj) };
      }
      // GitHub limits request size: send in batches
      const names = Object.keys(files); let batch = {}, size = 0;
      const send = async () => { if (!Object.keys(batch).length) return; await this.api('/gists/' + this.gist(), { method: 'PATCH', body: JSON.stringify({ files: batch }) }); batch = {}; size = 0; };
      for (const n of names) { batch[n] = files[n]; size += files[n].content.length; if (size > 3e6) await send(); }
      await send();
      if (!inSync) { this.busy = false; this.setStatus(`✓ Synced ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`); }
    } catch (e) { if (!inSync) this.fail(e); else throw e; }
  },
  start() {
    if (!this.on()) return;
    this.login = localStorage.getItem('cl_gh_login') || '';
    this.sync();
    setInterval(() => { if (this.dirty.size) this.push().catch(e => this.fail(e)); }, 180000);
    let lastPull = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (this.dirty.size) this.push().catch(e => this.fail(e)); }
      else if (Date.now() - lastPull > 60000) { lastPull = Date.now(); this.sync(); }
    });
  }
};
