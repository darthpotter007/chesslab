// ===== Highlights: every brilliant / great / blunder ... across analysed games =====
function miniBoard(fen, { orient = 'w', last, cls, to } = {}) {
  const B = new Chess(fen).board(); let h = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const r = orient === 'w' ? y : 7 - y, f = orient === 'w' ? x : 7 - x; const sq = FILES[f] + (8 - r); const p = B[r][f];
    const lt = last && (last.slice(0, 2) === sq || last.slice(2, 4) === sq);
    h += `<div style="position:absolute;left:${x * 12.5}%;top:${y * 12.5}%;width:12.5%;height:12.5%;background:${(x + y) % 2 ? 'var(--dark)' : 'var(--light)'}">${lt ? '<div style="position:absolute;inset:0;background:rgba(255,235,59,.42)"></div>' : ''}${p ? `<img src="${PIECES[p.color + p.type.toUpperCase()]}" style="position:absolute;inset:0;width:100%;height:100%">` : ''}${cls && sq === to ? `<div style="position:absolute;right:-6%;top:-6%;width:52%;height:52%;border-radius:50%;background:${clsColor(cls)};border:1.5px solid #fff;color:#fff;font-weight:900;font-size:10px;display:flex;align-items:center;justify-content:center;z-index:2">${CLS[cls].sym}</div>` : ''}</div>`;
  }
  return `<div style="position:relative;width:100%;aspect-ratio:1;border-radius:4px;overflow:hidden">${h}</div>`;
}
VIEWS.highlights = {
  cls: 'brilliant', who: 'me', page: 0,
  collect() {
    const out = [];
    for (const g of filtered()) {
      if (!isAnalysed(g.id)) continue; const a = S.analysis.get(g.id);
      let fens = null, moves = null;
      a.cls.forEach((c, i) => {
        if (c !== this.cls) return;
        const startB = !!(g.startFen && g.startFen.split(' ')[1] === 'b');
        const mover = ((i % 2 === 0) !== startB) ? 'w' : 'b';
        if ((this.who === 'me') !== (mover === g.color)) return;
        if (!fens) ({ fens, moves } = replay(g));
        out.push({ g, i, fen: fens[i + 1], mv: moves[i], ev: a.ev[i + 1], best: a.best[i], before: fens[i] });
      });
    }
    return out.sort((a, b) => b.g.end - a.g.end);
  },
  show(m, arg) {
    if (arg && arg.cls) { this.cls = arg.cls; this.page = 0; } if (arg && arg.who) this.who = arg.who;
    const an = filtered().filter(g => isAnalysed(g.id));
    const counts = {}; for (const g of an) { const a = S.analysis.get(g.id); a.cls.forEach((c, i) => { const startB = !!(g.startFen && g.startFen.split(' ')[1] === 'b'); const mover = ((i % 2 === 0) !== startB) ? 'w' : 'b'; if ((this.who === 'me') === (mover === g.color)) counts[c] = (counts[c] || 0) + 1; }); }
    const items = this.collect(); const per = 24; const pages = Math.max(1, Math.ceil(items.length / per)); this.page = Math.min(this.page, pages - 1);
    m.innerHTML = '';
    m.appendChild(filtersBar(() => render()));
    const box = document.createElement('div'); m.appendChild(box);
    box.innerHTML = `<div class="filters" style="margin-top:-4px"><div><label>Move</label><span class="chips">${['brilliant', 'great', 'best', 'miss', 'mistake', 'blunder'].map(c => `<span class="chip ${this.cls === c ? 'on' : ''}" data-cls="${c}">${icon(c)} ${c === 'miss' ? 'Misses' : CLS[c].name + 's'} <span style="opacity:.7">${counts[c] || 0}</span></span>`).join('')}</span></div>
        <div><label>By</label><span class="chips"><span class="chip ${this.who === 'me' ? 'on' : ''}" data-who="me">Me</span><span class="chip ${this.who === 'opp' ? 'on' : ''}" data-who="opp">My opponents</span></span></div></div>
      <div class="row" style="margin-bottom:10px"><span class="t2">${items.length} ${CLS[this.cls].name.toLowerCase()} move${items.length === 1 ? '' : 's'} across ${an.length} analyzed games.</span><span class="sp"></span>${an.length < scoped().length ? `<button class="btn sm" onclick="go('games')">Analyze more games to find more</button>` : ''}</div>
      ${items.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">${items.slice(this.page * per, this.page * per + per).map((x, k) => `<div class="card" style="padding:10px;cursor:pointer" data-k="${this.page * per + k}">
          ${miniBoard(x.fen, { orient: x.g.color, last: uciOf(x.mv), cls: this.cls, to: x.mv.to })}
          <div class="row" style="margin-top:8px;gap:6px">${icon(this.cls)}<b>${Math.floor(x.i / 2) + 1}${x.i % 2 ? '...' : '.'} ${esc(x.mv.san)}</b><span class="sp"></span><span class="note">${evalText(x.ev)}</span></div>
          <div class="note">vs ${esc(x.g.opp.name)} · ${fmtDate(x.g.end)} · <span class="res ${x.g.result}" style="width:16px;height:16px;line-height:16px;font-size:10px">${x.g.result === 'win' ? 'W' : x.g.result === 'loss' ? 'L' : '½'}</span></div>
          ${['miss', 'mistake', 'blunder'].includes(this.cls) && x.best ? `<div class="note">Best was <b style="color:var(--c-best)">${esc(uciToSan(x.before, x.best))}</b></div>` : ''}</div>`).join('')}</div>` : `<div class="card empty">No ${CLS[this.cls].name.toLowerCase()} moves yet${an.length ? ' in your analyzed games' : '. Analyze some games first'}.</div>`}
      <div class="row" style="margin-top:12px;justify-content:center">${pages > 1 ? `<button class="btn sm" id="hp" ${this.page ? '' : 'disabled'}>← Prev</button><span class="muted">Page ${this.page + 1} of ${pages}</span><button class="btn sm" id="hn" ${this.page < pages - 1 ? '' : 'disabled'}>Next →</button>` : ''}</div>`;
    $$('[data-cls]', box).forEach(c => c.onclick = () => { this.cls = c.dataset.cls; this.page = 0; render(); });
    $$('[data-who]', box).forEach(c => c.onclick = () => { this.who = c.dataset.who; this.page = 0; render(); });
    $$('[data-k]', box).forEach(c => c.onclick = () => { const x = items[+c.dataset.k]; go('review', { id: x.g.id, ply: x.i + 1 }); });
    const hp = $('#hp'), hn = $('#hn'); if (hp) hp.onclick = () => { this.page--; render(); }; if (hn) hn.onclick = () => { this.page++; render(); };
  },
  onAnalysed() { if (!_refreshT) _refreshT = setTimeout(() => { _refreshT = null; if (CURVIEW === 'highlights') render(); }, 4000); }
};

// ===== backup / restore =====
async function exportBackup() {
  const data = { app: 'chesslab', v: 1, at: Date.now() };
  for (const s of DB.stores) data[s] = await DB.all(s);
  let blob = new Blob([JSON.stringify(data)], { type: 'application/json' }); let ext = 'json';
  if (window.CompressionStream) { blob = await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob(); ext = 'json.gz'; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `chesslab-backup-${new Date().toISOString().slice(0, 10)}.${ext}`; document.body.appendChild(a); a.click(); a.remove();
  await DB.put('kv', 'lastBackup', Date.now());
  return blob.size;
}
async function importBackup(file) {
  let text;
  if (file.name.endsWith('.gz')) text = await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text(); else text = await file.text();
  const data = JSON.parse(text); if (data.app !== 'chesslab') throw new Error('Not a ChessLab backup file');
  for (const s of DB.stores) if (data[s]) await DB.putMany(s, data[s]);
  return data;
}
async function protectStorage() {
  try { if (navigator.storage && navigator.storage.persist) { const already = await navigator.storage.persisted(); return already || await navigator.storage.persist(); } } catch (e) { }
  return false;
}
