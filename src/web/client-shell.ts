// Inline placeholder page served by the web UI in the scaffold phase.
// Input: none. Output: a self-contained HTML string (no external assets).
// Invariant: this is a viewer over /api/state only. The interactive xterm.js
// client replaces this page once the browser build lands; nothing here writes state.

const PALETTE = {
  bg: '#15191f',
  panel: '#1b2129',
  border: '#3a4b5f',
  text: '#ece7dc',
  dim: '#b8b0a3',
  muted: '#817b70',
  accent: '#7eb8f5',
  ok: '#83a36f',
  warn: '#d7a84f',
  error: '#d56a60',
}

export function placeholderPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ReevesAgents Web</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    background: ${PALETTE.bg}; color: ${PALETTE.text};
  }
  header {
    padding: 16px 20px; border-bottom: 1px solid ${PALETTE.border};
    display: flex; align-items: baseline; gap: 12px;
  }
  header h1 { margin: 0; font-size: 16px; letter-spacing: 0.04em; }
  header .tag { color: ${PALETTE.muted}; font-size: 12px; }
  main { padding: 20px; max-width: 760px; }
  .run { margin-bottom: 24px; }
  .run-name { color: ${PALETTE.accent}; font-size: 13px; margin-bottom: 8px; }
  .run-meta { color: ${PALETTE.muted}; font-size: 12px; margin-left: 8px; }
  .card {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 12px; margin-bottom: 6px;
    background: ${PALETTE.panel}; border: 1px solid ${PALETTE.border}; border-radius: 6px;
  }
  .mono {
    width: 30px; height: 30px; flex: none; border-radius: 6px;
    display: grid; place-items: center; font-weight: 600; font-size: 12px;
    color: #15191f;
  }
  .card .name { font-size: 13px; }
  .card .sub { color: ${PALETTE.dim}; font-size: 12px; }
  .status { margin-left: auto; font-size: 12px; }
  .s-running, .s-working, .s-done { color: ${PALETTE.ok}; }
  .s-stale, .s-queued, .s-blocked { color: ${PALETTE.warn}; }
  .s-ended, .s-failed { color: ${PALETTE.error}; }
  .empty { color: ${PALETTE.muted}; }
</style>
</head>
<body>
<header>
  <h1>ReevesAgents</h1>
  <span class="tag">web ui (beta) · loopback only</span>
</header>
<main id="app"><p class="empty">Loading agents...</p></main>
<script>
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function statusClass(s) { return 's-' + String(s).replace(/[^a-z]/gi, ''); }
  async function load() {
    const app = document.getElementById('app');
    try {
      const res = await fetch('/api/state', { headers: { accept: 'application/json' } });
      const state = await res.json();
      if (!state.runs || state.runs.length === 0) {
        app.innerHTML = '<p class="empty">No runs yet. Start one with: reevesagents spawn</p>';
        return;
      }
      app.innerHTML = state.runs.map(run => {
        const cards = run.terminals.map(t =>
          '<div class="card">'
          + '<div class="mono" style="background:' + esc(t.color) + '">' + esc(t.monogram) + '</div>'
          + '<div><div class="name">' + esc(t.nickname) + '</div>'
          + '<div class="sub">' + esc(t.provider_label || t.provider) + (t.model ? ' · ' + esc(t.model) : '') + '</div></div>'
          + '<div class="status ' + statusClass(t.status) + '">' + esc(t.status) + '</div>'
          + '</div>'
        ).join('');
        return '<section class="run"><div class="run-name">' + esc(run.name)
          + '<span class="run-meta">' + esc(run.status) + ' · ' + esc(run.working_dir) + '</span></div>'
          + (cards || '<p class="empty">no agents</p>') + '</section>';
      }).join('');
    } catch (err) {
      app.innerHTML = '<p class="empty">Failed to load state: ' + esc(err && err.message || err) + '</p>';
    }
  }
  load();
  setInterval(load, 4000);
</script>
</body>
</html>`
}
