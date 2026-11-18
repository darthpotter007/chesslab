// ===== Sounds (synthesized with Web Audio: wooden move/capture clicks, castle, check, promote, end, right/wrong) =====
const SND = {
  ctx: null, noise: null,
  get on() { try { return localStorage.getItem('cl_sound') !== '0'; } catch (e) { return true; } },
  set on(v) { try { localStorage.setItem('cl_sound', v ? '1' : '0'); } catch (e) { } },
  init() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; } }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (!this.noise) { const n = this.ctx.sampleRate * 0.3; const b = this.ctx.createBuffer(1, n, this.ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; this.noise = b; }
  },
  ready() { if (!this.on) return false; this.init(); return this.ctx && this.ctx.state === 'running'; },
  // short filtered noise burst = a piece knocking on a wooden board
  knock(t, { freq = 1700, q = 1.2, gain = .5, dur = .06, low = 0 } = {}) {
    const c = this.ctx; const src = c.createBufferSource(); src.buffer = this.noise;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bp).connect(g).connect(c.destination); src.start(t); src.stop(t + dur + .02);
    if (low) { const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(low, t); o.frequency.exponentialRampToValueAtTime(low * .6, t + .08); const og = c.createGain(); og.gain.setValueAtTime(gain * .7, t); og.gain.exponentialRampToValueAtTime(0.001, t + .09); o.connect(og).connect(c.destination); o.start(t); o.stop(t + .1); }
  },
  tone(t, f, dur = .15, gain = .12, type = 'sine', f2) {
    const c = this.ctx; const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + .01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + .02);
  },
  play(kind) {
    if (!this.ready()) return; const t = this.ctx.currentTime + .005;
    switch (kind) {
      case 'move': this.knock(t, { freq: 1500, q: 1.4, gain: .55, dur: .055, low: 190 }); break;
      case 'capture': this.knock(t, { freq: 2300, q: .9, gain: .8, dur: .07, low: 150 }); this.knock(t + .018, { freq: 900, q: 2, gain: .35, dur: .06 }); break;
      case 'castle': this.knock(t, { freq: 1500, q: 1.4, gain: .5, dur: .05, low: 190 }); this.knock(t + .11, { freq: 1350, q: 1.4, gain: .5, dur: .05, low: 170 }); break;
      case 'check': this.knock(t, { freq: 1600, q: 1.4, gain: .5, dur: .05, low: 190 }); this.tone(t + .02, 988, .16, .09, 'triangle'); this.tone(t + .02, 1480, .12, .04, 'sine'); break;
      case 'promote': this.knock(t, { freq: 1500, q: 1.4, gain: .5, dur: .05, low: 190 }); this.tone(t + .03, 660, .22, .08, 'triangle', 1320); break;
      case 'end': this.tone(t, 523, .25, .1, 'triangle'); this.tone(t + .16, 659, .25, .1, 'triangle'); this.tone(t + .32, 784, .4, .1, 'triangle'); break;
      case 'correct': this.tone(t, 1046, .12, .08, 'sine'); this.tone(t + .09, 1568, .18, .08, 'sine'); break;
      case 'wrong': this.tone(t, 220, .2, .1, 'square', 160); break;
    }
  },
  // pick the right sound for a move object from chess.js (after the move was made on `ch`)
  forMove(m, ch) {
    if (!m) return;
    if (ch && ch.in_checkmate()) { this.play(m.captured ? 'capture' : 'move'); setTimeout(() => this.play('end'), 160); return; }
    if (ch && ch.in_check()) return this.play('check');
    if (m.promotion) return this.play('promote');
    if (m.flags.includes('k') || m.flags.includes('q')) return this.play('castle');
    this.play(m.captured ? 'capture' : 'move');
  }
};
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { if (SND.on) SND.init(); }, { capture: true }));
function soundToggleHtml() { return `<a href="#" id="sndtog" title="Sounds on/off" style="color:var(--t3);text-decoration:none;font-size:15px">${SND.on ? '🔊' : '🔇'}</a>`; }
function wireSoundToggle() { const a = $('#sndtog'); if (!a) return; a.onclick = e => { e.preventDefault(); SND.on = !SND.on; a.textContent = SND.on ? '🔊' : '🔇'; if (SND.on) SND.play('move'); }; }
