// ===== chart helpers =====
const TC_COLORS = { bullet: '#3987e5', blitz: '#d95926', rapid: '#199e70', daily: '#c98500', unknown: '#9085e9' };
function wdlCount(gs) { const c = { w: 0, d: 0, l: 0, n: gs.length }; for (const g of gs) c[g.result[0]]++; return c; }
function wdlRow(label, gs, sub = '', onclick = '') {
  const c = wdlCount(gs); if (!c.n) return '';
  const score = (c.w + c.d / 2) / c.n * 100;
  const tip = `<b>${esc(label)}</b><br>${c.n} games · score ${score.toFixed(0)}%<br>Won ${c.w} (${pct(c.w, c.n)}%) · Drew ${c.d} (${pct(c.d, c.n)}%) · Lost ${c.l} (${pct(c.l, c.n)}%)`;
  const seg = (k, v) => v ? `<i class="${k}" style="flex:${v}"></i>` : '';
  return `<div class="wdl-row" data-tip="${esc(tip)}" ${onclick ? `style="cursor:pointer" onclick="${onclick}"` : ''}><div class="lab">${esc(label)}${sub ? ` <small>${sub}</small>` : ''}</div><div class="wdl">${seg('w', c.w)}${seg('d', c.d)}${seg('l', c.l)}</div><div class="num">${pct(c.w, c.n)}% <span class="muted">· ${c.n}</span></div></div>`;
}
const WDL_LEGEND = '<div class="legend"><span><b style="background:var(--win)"></b>Win</span><span><b style="background:var(--draw)"></b>Draw</span><span><b style="background:var(--loss)"></b>Loss</span><span class="muted">· right: win % · games</span></div>';
function hbars(rows, color = '#3987e5', fmtv = v => v) {
  const mx = Math.max(1, ...rows.map(r => r[1]));
  return rows.map(([l, v, tip]) => `<div class="hbar" data-tip="${esc(tip || l + ': ' + fmtv(v))}"><div class="t2" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l)}</div><div><div class="b" style="width:${Math.max(1, v / mx * 100)}%;background:${color}"></div></div><div class="num">${fmtv(v)}</div></div>`).join('');
}
// line chart: series [{name,color,pts:[{x,y,tip}]}]
function lineChart(series, { h = 240, yfmt = v => Math.round(v), xfmt = x => fmtDate(x), ymin, ymax } = {}) {
  const id = 'lc' + Math.random().toString(36).slice(2, 8);
  const all = series.flatMap(s => s.pts); if (!all.length) return '<div class="empty">No data</div>';
  let x0 = Math.min(...all.map(p => p.x)), x1 = Math.max(...all.map(p => p.x)); if (x0 === x1) x1 = x0 + 1;
  let y0 = ymin ?? Math.min(...all.map(p => p.y)), y1 = ymax ?? Math.max(...all.map(p => p.y));
  const pad = (y1 - y0) * .08 || 10; if (ymin == null) y0 -= pad; if (ymax == null) y1 += pad;
  const W = 800, H = h, L = 50, R = 10, T = 10, B = 24;
  const X = x => L + (x - x0) / (x1 - x0) * (W - L - R), Y = y => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  let g = '';
  const ticks = 4; for (let i = 0; i <= ticks; i++) { const v = y0 + (y1 - y0) * i / ticks; g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#2f2f2b"/><text x="${L - 6}" y="${Y(v) + 4}" fill="#8f8e86" font-size="14" text-anchor="end">${yfmt(v)}</text>`; }
  for (let i = 0; i <= 4; i++) { const v = x0 + (x1 - x0) * i / 4; g += `<text x="${X(v)}" y="${H - 6}" fill="#8f8e86" font-size="14" text-anchor="${i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}">${xfmt(v)}</text>`; }
  for (const s of series) { if (!s.pts.length) continue; g += `<path d="${s.pts.map((p, i) => (i ? 'L' : 'M') + X(p.x).toFixed(1) + ',' + Y(p.y).toFixed(1)).join('')}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>`; }
  const svg = `<svg id="${id}" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">${g}<line class="xh" y1="${T}" y2="${H - B}" stroke="#8f8e86" stroke-dasharray="3 3" style="display:none"/><g class="dots"></g><rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" class="hit"/></svg>`;
  setTimeout(() => {
    const el = document.getElementById(id); if (!el) return;
    const hit = el.querySelector('.hit'), xh = el.querySelector('.xh'), dots = el.querySelector('.dots'), tip = document.getElementById('tip');
    hit.addEventListener('mousemove', e => {
      const b = el.getBoundingClientRect(); const mx = (e.clientX - b.left) / b.width * W; const xv = x0 + (mx - L) / (W - L - R) * (x1 - x0);
      let html = '', d = '';
      let bx = null;
      for (const s of series) { if (!s.pts.length) continue; let best = s.pts[0]; for (const p of s.pts) if (Math.abs(p.x - xv) < Math.abs(best.x - xv)) best = p; if (bx == null || Math.abs(best.x - xv) < Math.abs(bx - xv)) bx = best.x; }
      for (const s of series) { if (!s.pts.length) continue; let best = s.pts[0]; for (const p of s.pts) if (Math.abs(p.x - xv) < Math.abs(best.x - xv)) best = p; if (Math.abs(best.x - bx) > (x1 - x0) * .03) continue; d += `<circle cx="${X(best.x)}" cy="${Y(best.y)}" r="4.5" fill="${s.color}" stroke="#1c1c1a" stroke-width="2"/>`; html += `<div><b style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${s.color};margin-right:6px"></b>${esc(s.name)}: <b>${yfmt(best.y)}</b>${best.tip ? ' <span style="color:#aaa">' + best.tip + '</span>' : ''}</div>`; }
      xh.setAttribute('x1', X(bx)); xh.setAttribute('x2', X(bx)); xh.style.display = ''; dots.innerHTML = d;
      tip.innerHTML = `<div style="color:#aaa;margin-bottom:3px">${xfmt(bx)}</div>` + html; tip.style.display = 'block';
      tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8) + 'px'; tip.style.top = (e.clientY + 14) + 'px';
    });
    hit.addEventListener('mouseleave', () => { xh.style.display = 'none'; dots.innerHTML = ''; tip.style.display = 'none'; });
  });
  const leg = series.length > 1 ? `<div class="legend">${series.map(s => `<span><b style="background:${s.color}"></b>${esc(s.name)}</span>`).join('')}</div>` : '';
  return leg + svg;
}

// ===== stats view =====
VIEWS.stats = {
  show(m) {
    m.innerHTML = ''; m.appendChild(filtersBar(() => render()));
    const gs = filtered(); const c = wdlCount(gs);
    const box = document.createElement('div'); m.appendChild(box);
    if (!gs.length) { box.innerHTML = '<div class="card empty">No games match these filters.</div>'; return; }
    // streaks & sessions (chronological)
    const chron = [...gs].sort((a, b) => a.end - b.end);
    let ws = 0, ls = 0, bw = 0, bl = 0; for (const g of chron) { if (g.result === 'win') { ws++; ls = 0; } else if (g.result === 'loss') { ls++; ws = 0; } else { ws = 0; ls = 0; } bw = Math.max(bw, ws); bl = Math.max(bl, ls); }
    const bestWin = gs.filter(g => g.result === 'win' && g.rated).sort((a, b) => (b.opp.rating || 0) - (a.opp.rating || 0))[0];
    // ratings per tc
    const tcs = [...new Set(gs.map(g => g.tc))];
    const ratingSeries = tcs.map(tc => ({ name: tc[0].toUpperCase() + tc.slice(1), color: TC_COLORS[tc] || '#888', pts: chron.filter(g => g.tc === tc && g.rated && g.me.rating).map(g => ({ x: g.end, y: g.me.rating, tip: `${g.result === 'win' ? 'W' : g.result === 'loss' ? 'L' : 'D'} vs ${esc(g.opp.name)} (${g.opp.rating})` })) })).filter(s => s.pts.length);
    const curR = ratingSeries.map(s => { const last = s.pts[s.pts.length - 1].y; const peak = Math.max(...s.pts.map(p => p.y)); return `<div class="card tile"><div class="v">${last}</div><div class="l"><b style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${s.color};margin-right:5px"></b>${s.name} rating</div><div class="s">Peak ${peak}</div></div>`; }).join('');
    const accs = gs.map(myAcc).filter(x => x != null);
    // termination
    const howLabel = { checkmated: 'Checkmate', resigned: 'Resignation', timeout: 'Time', abandoned: 'Abandoned', agreed: 'Agreement', repetition: 'Repetition', stalemate: 'Stalemate', insufficient: 'Insufficient material', '50move': '50-move rule', timevsinsufficient: 'Timeout vs insufficient', other: 'Other' };
    const howRows = res => { const mp = {}; for (const g of gs) if (g.result === res) mp[g.how] = (mp[g.how] || 0) + 1; const n = gs.filter(g => g.result === res).length; return Object.entries(mp).sort((a, b) => b[1] - a[1]).map(([k, v]) => [howLabel[k] || k, v, `${howLabel[k] || k}: ${v} of ${n} (${pct(v, n)}%)`]); };
    // openings
    const openRows = col => { const mp = new Map(); for (const g of gs) if (g.color === col) { const k = g.family; if (!mp.has(k)) mp.set(k, []); mp.get(k).push(g); } return [...mp.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 12).map(([k, v]) => wdlRow(k, v, '', `go('openings',{color:'${col}',family:${esc(JSON.stringify(k))}})`)).join(''); };
    // rating diff buckets
    const diffB = [['Opp 200+ lower', d => d <= -200], ['100–199 lower', d => d > -200 && d <= -100], ['25–99 lower', d => d > -100 && d <= -25], ['Within 25', d => Math.abs(d) < 25], ['25–99 higher', d => d >= 25 && d < 100], ['100–199 higher', d => d >= 100 && d < 200], ['Opp 200+ higher', d => d >= 200]];
    const withR = gs.filter(g => g.opp.rating && g.me.rating);
    // time of day / weekday
    const hrs = [['Night (0–6)', 0, 6], ['Morning (6–12)', 6, 12], ['Afternoon (12–18)', 12, 18], ['Evening (18–24)', 18, 24]];
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    // length
    const lenB = [['Under 20 moves', 0, 20], ['20–29', 20, 30], ['30–39', 30, 40], ['40–59', 40, 60], ['60+', 60, 999]];
    // momentum
    const after = { win: [], loss: [], draw: [] }, sess = [[], [], [], []], after2L = [];
    for (let i = 1; i < chron.length; i++) {
      const p = chron[i - 1], g = chron[i];
      if (g.end - p.end < 3 * 3600e3) after[p.result].push(g);
      if (i > 1 && p.result === 'loss' && chron[i - 2].result === 'loss' && g.end - p.end < 3 * 3600e3) after2L.push(g);
    }
    let sIdx = 0; for (let i = 0; i < chron.length; i++) { if (i === 0 || chron[i].end - chron[i - 1].end > 45 * 60e3) sIdx = 0; else sIdx++; sess[Math.min(3, sIdx)].push(chron[i]); }
    // clock
    const clockG = gs.filter(g => g.base && g.clocks && g.clocks.some(x => x != null));
    const myClocks = g => g.clocks.filter((_, i) => (i % 2 === 0) === (g.color === 'w')).filter(x => x != null);
    const scramble = clockG.filter(g => myClocks(g).some(x => x < Math.min(30, g.base * 0.1)));
    const endLeft = res => { const a = clockG.filter(g => g.result === res).map(g => { const mc = myClocks(g); return mc.length ? mc[mc.length - 1] / g.base * 100 : null; }).filter(x => x != null); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };
    const lossOnTime = gs.filter(g => g.result === 'loss' && g.how === 'timeout').length, lossN = c.l;
    const winOnTime = gs.filter(g => g.result === 'win' && g.how === 'timeout').length;

    box.innerHTML = `
      <div class="grid g4" style="margin-bottom:14px">
        <div class="card tile"><div class="v">${c.n}</div><div class="l">Games</div><div class="s">${c.w} W · ${c.d} D · ${c.l} L</div></div>
        <div class="card tile"><div class="v">${pct(c.w, c.n)}%</div><div class="l">Win rate</div><div class="s">Score ${((c.w + c.d / 2) / c.n * 100).toFixed(1)}%</div></div>
        ${curR}
        <div class="card tile"><div class="v">${accs.length ? fmt1(accs.reduce((s, x) => s + x, 0) / accs.length) : '—'}</div><div class="l">Avg accuracy</div><div class="s">${accs.length} of ${c.n} games have accuracy${accs.length < c.n ? ` · <a href="#games">analyze more</a>` : ''}</div></div>
        <div class="card tile"><div class="v">${bw}</div><div class="l">Longest win streak</div><div class="s">Longest losing streak: ${bl}</div></div>
        ${bestWin ? `<div class="card tile" style="cursor:pointer" onclick="go('review','${esc(bestWin.id)}')"><div class="v">${bestWin.opp.rating}</div><div class="l">Best win</div><div class="s">vs ${esc(bestWin.opp.name)} · ${fmtDate(bestWin.end)}</div></div>` : ''}
      </div>
      <div class="card" style="margin-bottom:14px"><h3>Rating history</h3>${lineChart(ratingSeries, { h: 260 })}</div>
      <div class="grid g2">
        <div class="card"><h3>Results by color</h3>${WDL_LEGEND}${wdlRow('As White', gs.filter(g => g.color === 'w'))}${wdlRow('As Black', gs.filter(g => g.color === 'b'))}
          <h3 style="margin-top:16px">By time control</h3>${tcs.map(t => wdlRow(t[0].toUpperCase() + t.slice(1), gs.filter(g => g.tc === t))).join('')}</div>
        <div class="card"><h3>How your games end</h3>
          <div class="t2" style="font-weight:700;margin:6px 0 2px">Wins (${c.w})</div>${hbars(howRows('win'), 'var(--win)')}
          <div class="t2" style="font-weight:700;margin:10px 0 2px">Losses (${c.l})</div>${hbars(howRows('loss'), 'var(--loss)')}
          <div class="t2" style="font-weight:700;margin:10px 0 2px">Draws (${c.d})</div>${hbars(howRows('draw'), '#8f8e86')}</div>
        <div class="card"><h3>Openings as White</h3>${WDL_LEGEND}${openRows('w') || '<div class="muted">No games</div>'}<div class="note" style="margin-top:6px">Click an opening to explore your moves in it.</div></div>
        <div class="card"><h3>Openings as Black</h3>${WDL_LEGEND}${openRows('b') || '<div class="muted">No games</div>'}</div>
        <div class="card"><h3>Vs opponent rating</h3>${WDL_LEGEND}${diffB.map(([l, f]) => wdlRow(l, withR.filter(g => f(g.opp.rating - g.me.rating)))).join('')}</div>
        <div class="card"><h3>Momentum & tilt</h3>${WDL_LEGEND}
          ${wdlRow('After a win', after.win)}${wdlRow('After a loss', after.loss)}${wdlRow('After 2+ losses', after2L)}${wdlRow('After a draw', after.draw)}
          <h3 style="margin-top:14px">Game # in a session</h3>${['1st game', '2nd game', '3rd game', '4th game+'].map((l, i) => wdlRow(l, sess[i])).join('')}
          <div class="note">A session = games less than 45 minutes apart. "After" = the next game within 3 hours.</div></div>
        <div class="card"><h3>Time of day</h3>${WDL_LEGEND}${hrs.map(([l, a, b]) => wdlRow(l, gs.filter(g => { const h = new Date(g.end).getHours(); return h >= a && h < b; }))).join('')}
          <h3 style="margin-top:14px">Day of week</h3>${days.map((d, i) => wdlRow(d, gs.filter(g => (new Date(g.end).getDay() + 6) % 7 === i))).join('')}</div>
        <div class="card"><h3>Game length</h3>${WDL_LEGEND}${lenB.map(([l, a, b]) => wdlRow(l, gs.filter(g => g.moves >= a && g.moves < b))).join('')}
          <h3 style="margin-top:14px">Clock</h3>
          <div class="grid g3" style="grid-template-columns:repeat(3,1fr);gap:8px">
            <div><div class="kpi">${pct(lossOnTime, lossN)}%</div><div class="note">of losses were on time (${lossOnTime})</div></div>
            <div><div class="kpi">${winOnTime}</div><div class="note">wins on time</div></div>
            <div><div class="kpi">${pct(scramble.length, clockG.length)}%</div><div class="note">of games you fell under 10% of your clock</div></div>
          </div>
          ${scramble.length ? wdlRow('Time-scramble games', scramble) + wdlRow('No time scramble', clockG.filter(g => !scramble.includes(g))) : ''}
          <div class="note">Average clock left at the end: ${endLeft('win') != null ? Math.round(endLeft('win')) + '% in wins' : ''}${endLeft('loss') != null ? ', ' + Math.round(endLeft('loss')) + '% in losses' : ''}.</div></div>
      </div>
      <div id="anstats" style="margin-top:14px"></div>`;
    this.analysisStats(gs);
  },
  analysisStats(gs) {
    const box = $('#anstats'); if (!box) return;
    const an = gs.filter(g => isAnalysed(g.id));
    if (an.length < 1) { box.innerHTML = `<div class="card"><h3>Engine insights</h3><p class="t2">Analyze some games to unlock accuracy trends, accuracy by game phase, blunder patterns, conversion rate and more.</p><button class="btn primary" onclick="Q.add(filtered().filter(g=>!isAnalysed(g.id)).slice(0,30).map(g=>g.id));toast('Analyzing your 30 most recent games in the background')">Analyze 30 most recent games</button></div>`; return; }
    const A = analysisAgg(an);
    const chron = [...an].sort((a, b) => a.end - b.end);
    const accPts = chron.map(g => ({ x: g.end, y: myAcc(g), tip: `vs ${esc(g.opp.name)}` })).filter(p => p.y != null);
    // rolling average
    const roll = accPts.map((p, i) => { const w = accPts.slice(Math.max(0, i - 9), i + 1); return { x: p.x, y: w.reduce((s, q) => s + q.y, 0) / w.length }; });
    const phaseNames = { open: 'Opening', mid: 'Middlegame', end: 'Endgame' };
    box.innerHTML = `<div class="grid g2">
      <div class="card"><h3>Accuracy trend <span class="muted" style="text-transform:none;font-weight:400">· ${an.length} analyzed games</span></h3>${lineChart([{ name: 'Game accuracy', color: '#5598e7', pts: accPts }, { name: '10-game average', color: '#d95926', pts: roll }], { h: 220, yfmt: v => v.toFixed(0), ymin: Math.max(0, Math.min(...accPts.map(p => p.y)) - 5), ymax: 100 })}</div>
      <div class="card"><h3>Accuracy by phase</h3>${hbars(['open', 'mid', 'end'].filter(p => A.phaseAcc[p].n).map(p => [phaseNames[p], A.phaseAcc[p].avg, `${phaseNames[p]}: ${fmt1(A.phaseAcc[p].avg)}% avg move accuracy over ${A.phaseAcc[p].n} moves`]), '#5598e7', v => fmt1(v))}
        <h3 style="margin-top:14px">Mistakes per game, by phase</h3>${hbars(['open', 'mid', 'end'].map(p => [phaseNames[p], A.errPerGame[p], `${phaseNames[p]}: ${fmt1(A.errPerGame[p])} mistakes+blunders per game`]), 'var(--c-mistake)', v => fmt1(v))}
        <div class="note">Move accuracy uses the same win-chance math as the game review.</div></div>
      <div class="card"><h3>Your moves by classification</h3>${hbars(CLS_ORDER.map(k => [CLS[k].name, A.clsCount[k] || 0, `${CLS[k].name}: ${A.clsCount[k] || 0} moves (${fmt1((A.clsCount[k] || 0) / A.myMoves * 100)}%), ${fmt1((A.clsCount[k] || 0) / an.length)} per game`]).filter(r => r[1]), '#5598e7', v => v)}</div>
      <div class="card"><h3>Conversion & defence</h3>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
          <div><div class="kpi">${A.winning.n ? pct(A.winning.won, A.winning.n) + '%' : '—'}</div><div class="note">Winning positions converted (${A.winning.won}/${A.winning.n}). A game counts when you reached ≥85% win chance.</div></div>
          <div><div class="kpi">${A.losing.n ? pct(A.losing.saved, A.losing.n) + '%' : '—'}</div><div class="note">Lost positions saved (${A.losing.saved}/${A.losing.n}). You fell to ≤15% win chance but didn't lose.</div></div>
          <div><div class="kpi">${A.oppBlunders ? pct(A.punished, A.oppBlunders) + '%' : '—'}</div><div class="note">Opponent blunders you punished (${A.punished}/${A.oppBlunders}).</div></div>
          <div><div class="kpi">${fmt1(A.lowTime.rate)} vs ${fmt1(A.normalTime.rate)}</div><div class="note">Blunders per 100 moves when low on time vs normal.</div></div>
        </div>
        <h3 style="margin-top:14px">Which piece you blunder with</h3>${hbars(Object.entries(A.blunderPiece).sort((a, b) => b[1] - a[1]).map(([p, v]) => [{ p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' }[p], v]), 'var(--c-blunder)')}</div>
    </div>`;
  },
  onAnalysed() { if (!_refreshT) _refreshT = setTimeout(() => { _refreshT = null; if (CURVIEW === 'stats') this.analysisStats(filtered()); }, 3000); }
};

function analysisAgg(an) {
  const A = { phaseAcc: { open: { s: 0, n: 0 }, mid: { s: 0, n: 0 }, end: { s: 0, n: 0 } }, err: { open: 0, mid: 0, end: 0 }, clsCount: {}, myMoves: 0, winning: { n: 0, won: 0, games: [] }, losing: { n: 0, saved: 0 }, oppBlunders: 0, punished: 0, lowTime: { b: 0, n: 0 }, normalTime: { b: 0, n: 0 }, blunderPiece: {}, missed: 0, games: an.length };
  for (const g of an) {
    const a = S.analysis.get(g.id); const n = a.cls.length; const accM = a.acc[g.color + 'm'] || [];
    let k = 0; let maxW = 0, minW = 100, winPly = -1;
    for (let i = 0; i < n; i++) {
      const mine = (i % 2 === 0) === (g.color === 'w') !== !!(g.startFen && g.startFen.split(' ')[1] === 'b');
      const w = winFor(a.ev[i + 1], g.color);
      if (w > maxW) { maxW = w; if (w >= 85 && winPly < 0) winPly = i; } minW = Math.min(minW, w);
      if (!mine) { if (a.cls[i] === 'blunder' || a.cls[i] === 'mistake') { A.oppBlunders++; if (i + 1 < n && ['best', 'excellent', 'great', 'brilliant', 'good'].includes(a.cls[i + 1]) && winFor(a.ev[i + 2], g.color) >= 60) A.punished++; } continue; }
      const ph = a.phase[i]; const ma = accM[k++]; if (ma != null) { A.phaseAcc[ph].s += ma; A.phaseAcc[ph].n++; }
      const c = a.cls[i]; A.clsCount[c] = (A.clsCount[c] || 0) + 1; A.myMoves++;
      const bad = c === 'mistake' || c === 'blunder' || c === 'miss';
      if (bad) A.err[ph]++;
      if (c === 'miss') A.missed++;
      if (c === 'blunder') { const ch = new Chess(); const p = g.sans[i]; const pc = /^[NBRQK]/.test(p) ? p[0].toLowerCase() : p.startsWith('O-') ? 'k' : 'p'; A.blunderPiece[pc] = (A.blunderPiece[pc] || 0) + 1; }
      const clk = g.clocks && g.clocks[i - 1 >= 0 ? i : i];
      const myClkBefore = i >= 2 ? g.clocks[i - 2] : null;
      if (g.base && myClkBefore != null) { const low = myClkBefore < Math.min(30, g.base * 0.1); const T = low ? A.lowTime : A.normalTime; T.n++; if (c === 'blunder') T.b++; }
    }
    if (maxW >= 85) { A.winning.n++; if (g.result === 'win') A.winning.won++; else A.winning.games.push({ g, ply: winPly }); }
    if (minW <= 15) { A.losing.n++; if (g.result !== 'loss') A.losing.saved++; }
  }
  for (const p of ['open', 'mid', 'end']) A.phaseAcc[p].avg = A.phaseAcc[p].n ? A.phaseAcc[p].s / A.phaseAcc[p].n : 0;
  A.errPerGame = { open: A.err.open / an.length, mid: A.err.mid / an.length, end: A.err.end / an.length };
  A.lowTime.rate = A.lowTime.n ? A.lowTime.b / A.lowTime.n * 100 : 0; A.normalTime.rate = A.normalTime.n ? A.normalTime.b / A.normalTime.n * 100 : 0;
  return A;
}
