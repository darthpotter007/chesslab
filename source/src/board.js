// ===== Board widget =====
const FILES = 'abcdefgh';
class Board {
  constructor(el, opts = {}) {
    this.el = el; el.classList.add('board'); el.innerHTML = '';
    this.orient = opts.orient || 'w'; this.canMove = opts.canMove || (() => false); this.onMove = opts.onMove || (() => { });
    this.fen = null; this.sel = null; this.opts = {};
    this.sqEls = {};
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) { const d = document.createElement('div'); d.className = 'sq ' + ((r + f) % 2 ? 'd' : 'l'); el.appendChild(d); this.sqEls[r * 8 + f] = d; }
    this.layer = document.createElement('div'); this.layer.style.cssText = 'position:absolute;inset:0;pointer-events:none'; el.appendChild(this.layer);
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); this.svg.setAttribute('viewBox', '0 0 8 8'); this.svg.classList.add('arr'); el.appendChild(this.svg);
    el.addEventListener('pointerdown', e => this._down(e));
    window.addEventListener('pointermove', e => this._move(e));
    window.addEventListener('pointerup', e => this._up(e));
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  xy(sq) { const f = FILES.indexOf(sq[0]), r = +sq[1] - 1; return this.orient === 'w' ? [f, 7 - r] : [7 - f, r]; }
  sqAt(e) { const b = this.el.getBoundingClientRect(); const x = Math.floor((e.clientX - b.left) / b.width * 8), y = Math.floor((e.clientY - b.top) / b.height * 8); if (x < 0 || x > 7 || y < 0 || y > 7) return null; return this.orient === 'w' ? FILES[x] + (8 - y) : FILES[7 - x] + (y + 1); }
  flip() { this.orient = this.orient === 'w' ? 'b' : 'w'; this.render(); }
  set(fen, opts = {}) { this.fen = fen; this.opts = opts; this.sel = null; this.render(); }
  render() {
    if (!this.fen) return;
    const ch = new Chess(this.fen); this.ch = ch;
    const o = this.opts;
    // squares
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const d = this.sqEls[y * 8 + x]; d.style.left = x * 12.5 + '%'; d.style.top = y * 12.5 + '%';
      const sq = this.orient === 'w' ? FILES[x] + (8 - y) : FILES[7 - x] + (y + 1);
      d.dataset.sq = sq;
      d.className = 'sq ' + ((x + y) % 2 ? 'd' : 'l');
      if (o.last && (o.last.slice(0, 2) === sq || o.last.slice(2, 4) === sq)) d.classList.add('last');
      if (this.sel === sq) d.classList.add('sel');
      if (o.marks && o.marks[sq]) d.classList.add('mk-' + o.marks[sq]);
    }
    if (ch.in_check()) { const k = this._king(ch, ch.turn()); if (k) this.sqEls[this._idx(k)].classList.add('chk'); }
    // pieces, coords, dots
    let h = '';
    const B = ch.board();
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const p = B[r][f]; if (!p) continue; const sq = FILES[f] + (8 - r); const [x, y] = this.xy(sq);
      h += `<img class="pc" data-sq="${sq}" src="${PIECES[p.color + p.type.toUpperCase()]}" style="left:${x * 12.5}%;top:${y * 12.5}%">`;
    }
    for (let i = 0; i < 8; i++) {
      const fileLab = this.orient === 'w' ? FILES[i] : FILES[7 - i], rankLab = this.orient === 'w' ? 8 - i : i + 1;
      h += `<div class="coord" style="left:${i * 12.5 + 10.6}%;top:${87.5 + 10.2}%;color:${(i + 7) % 2 ? 'var(--light)' : 'var(--dark)'}">${fileLab}</div>`;
      h += `<div class="coord" style="left:.6%;top:${i * 12.5 + .4}%;color:${i % 2 ? 'var(--light)' : 'var(--dark)'}">${rankLab}</div>`;
    }
    if (this.sel) for (const m of ch.moves({ square: this.sel, verbose: true })) { const [x, y] = this.xy(m.to); h += `<div class="dot ${m.captured ? 'cap' : ''}" style="left:${x * 12.5}%;top:${y * 12.5}%"></div>`; }
    if (o.badge) { const [x, y] = this.xy(o.badge.sq); h += `<div class="badge" style="left:${x * 12.5 + 9.4}%;top:${y * 12.5 - 2}%;background:${clsColor(o.badge.cls)};${y === 0 ? 'top:0.5%' : ''}${x === 7 ? ';left:' + (x * 12.5 + 7.6) + '%' : ''}">${CLS[o.badge.cls].sym === '👍' ? '👍' : CLS[o.badge.cls].sym === '📖' ? '📖' : CLS[o.badge.cls].sym}</div>`; }
    this.layer.innerHTML = h;
    // arrows
    let s = '<defs>';
    const arrows = o.arrows || [];
    arrows.forEach((a, i) => { s += `<marker id="ah${i}${this._uid()}" markerWidth="4" markerHeight="4" refX="2.05" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4 z" fill="${a.color}"/></marker>`; });
    s += '</defs>';
    arrows.forEach((a, i) => {
      const [x1, y1] = this.xy(a.u.slice(0, 2)), [x2, y2] = this.xy(a.u.slice(2, 4));
      const cx1 = x1 + .5, cy1 = y1 + .5, cx2 = x2 + .5, cy2 = y2 + .5; const dx = cx2 - cx1, dy = cy2 - cy1, L = Math.hypot(dx, dy);
      const ex = cx2 - dx / L * .32, ey = cy2 - dy / L * .32;
      s += `<line x1="${cx1}" y1="${cy1}" x2="${ex}" y2="${ey}" stroke="${a.color}" stroke-width="${a.w || .17}" stroke-linecap="round" opacity="${a.op || .8}" marker-end="url(#ah${i}${this._uidv})"/>`;
    });
    this.svg.innerHTML = s;
  }
  _uid() { this._uidv = this._uidv || Math.random().toString(36).slice(2, 7); return this._uidv; }
  _king(ch, col) { const B = ch.board(); for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) { const p = B[r][f]; if (p && p.type === 'k' && p.color === col) return FILES[f] + (8 - r); } }
  _idx(sq) { const [x, y] = this.xy(sq); return y * 8 + x; }
  _down(e) {
    if (e.button !== 0 || !this.fen) return;
    const sq = this.sqAt(e); if (!sq) return;
    const ch = this.ch; const p = ch.get(sq);
    if (this.sel && this.sel !== sq) {
      const ok = ch.moves({ square: this.sel, verbose: true }).some(m => m.to === sq);
      if (ok) { this._try(this.sel, sq); return; }
    }
    if (p && p.color === ch.turn() && this.canMove(ch.turn())) {
      this.sel = sq; this.render();
      const img = this.layer.querySelector(`img[data-sq="${sq}"]`);
      if (img) { this.drag = { img, from: sq, moved: false, x0: e.clientX, y0: e.clientY }; img.classList.add('drag'); }
      e.preventDefault();
    } else { this.sel = null; this.render(); }
  }
  _move(e) {
    const d = this.drag; if (!d) return;
    if (Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) > 4) d.moved = true;
    const b = this.el.getBoundingClientRect(); const s = b.width / 8;
    d.img.style.left = (e.clientX - b.left - s / 2) / b.width * 100 + '%'; d.img.style.top = (e.clientY - b.top - s / 2) / b.height * 100 + '%';
  }
  _up(e) {
    const d = this.drag; if (!d) return; this.drag = null;
    const sq = this.sqAt(e);
    if (d.moved && sq && sq !== d.from) { this._try(d.from, sq); return; }
    this.render();
  }
  _try(from, to) {
    const ch = this.ch; const ms = ch.moves({ square: from, verbose: true }).filter(m => m.to === to);
    this.sel = null;
    if (!ms.length) { this.render(); return; }
    if (ms[0].promotion) { this._promo(from, to, ch.turn()); return; }
    const ok = this.onMove(from + to);
    if (ok === false) this.render();
  }
  _promo(from, to, col) {
    const box = document.createElement('div'); box.className = 'promo';
    for (const p of ['q', 'r', 'b', 'n']) { const im = document.createElement('img'); im.src = PIECES[col + p.toUpperCase()]; im.onpointerdown = ev => { ev.stopPropagation(); box.remove(); const ok = this.onMove(from + to + p); if (ok === false) this.render(); }; box.appendChild(im); }
    box.onpointerdown = ev => { ev.stopPropagation(); box.remove(); this.render(); };
    this.el.appendChild(box);
  }
}
function evalBarSet(el, ev, orient) {
  const w = winW(ev);
  const fill = el.querySelector('.wfill'), txt = el.querySelector('.txt');
  el.style.transform = orient === 'b' ? 'rotate(180deg)' : '';
  fill.style.height = clamp(w, 3, 97) + '%';
  let t = ev ? (ev.mate != null ? (ev.mate === 0 ? '#' : 'M' + Math.abs(ev.mate)) : Math.abs(ev.cp / 100).toFixed(1)) : '';
  const whiteAhead = w >= 50;
  txt.textContent = t;
  txt.style.transform = orient === 'b' ? 'rotate(180deg)' : '';
  txt.style.color = whiteAhead ? '#333' : '#eee';
  if (whiteAhead) { txt.style.bottom = '3px'; txt.style.top = ''; } else { txt.style.top = '3px'; txt.style.bottom = ''; }
}
const EVALBAR_HTML = '<div class="evalbar"><div class="wfill"></div><div class="txt"></div></div>';
