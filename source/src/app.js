// ===== boot =====
const DEFAULT_USER = 'darthpotter007';
(async function boot() {
  await DB.open();
  try { const f = JSON.parse(localStorage.getItem('cl_filters') || 'null'); if (f) Object.assign(S.filters, f); } catch (e) { }
  await loadAll();
  userHdr();
  render();
  // warm the engines in the background
  setTimeout(() => { ENG_FG.init().catch(e => console.error(e)); }, 300);
})();

// ===== live-update check (hosted build only) =====
if (typeof BUILD_ID !== 'undefined' && location.protocol.startsWith('http')) {
  const check = async () => {
    try {
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); const v = await r.json();
      if (v.build && v.build !== BUILD_ID && !document.getElementById('updbar')) {
        const d = document.createElement('div'); d.id = 'updbar'; d.className = 'toast'; d.style.cssText += ';display:flex;gap:12px;align-items:center';
        d.innerHTML = `<span>✨ A new version of ChessLab is ready${v.note ? ': ' + esc(v.note) : ''}</span><button class="btn primary sm">Reload</button>`;
        d.querySelector('button').onclick = async () => { try { await fetch('index.html', { cache: 'reload' }); } catch (e) { } location.reload(); };
        document.body.appendChild(d);
      }
    } catch (e) { }
  };
  setTimeout(check, 5000); setInterval(check, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
}
