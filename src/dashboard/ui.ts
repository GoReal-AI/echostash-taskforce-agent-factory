/**
 * Dashboard HTML — single-page real-time event viewer.
 */

export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Taskforce Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    background: #0d1117;
    color: #c9d1d9;
    font-size: 13px;
    line-height: 1.5;
  }
  header {
    background: #161b22;
    border-bottom: 1px solid #30363d;
    padding: 12px 20px;
    display: flex;
    align-items: center;
    gap: 16px;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  header h1 { font-size: 16px; color: #58a6ff; font-weight: 600; }
  .stats { display: flex; gap: 16px; margin-left: auto; }
  .stat { color: #8b949e; }
  .stat b { color: #c9d1d9; }

  .filters {
    background: #161b22;
    border-bottom: 1px solid #30363d;
    padding: 8px 20px;
    display: flex;
    gap: 8px;
    position: sticky;
    top: 48px;
    z-index: 9;
  }
  .filter-btn {
    background: #21262d;
    border: 1px solid #30363d;
    color: #8b949e;
    padding: 4px 12px;
    border-radius: 20px;
    cursor: pointer;
    font-size: 12px;
    font-family: inherit;
    transition: all 0.15s;
  }
  .filter-btn:hover { border-color: #58a6ff; color: #58a6ff; }
  .filter-btn.active { background: #1f6feb; border-color: #1f6feb; color: #fff; }

  #events {
    padding: 12px 20px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .event {
    display: grid;
    grid-template-columns: 90px 100px 80px 1fr;
    gap: 12px;
    padding: 6px 12px;
    border-radius: 6px;
    transition: background 0.15s;
    animation: fadeIn 0.3s ease;
  }
  .event:hover { background: #161b22; }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .event .time { color: #484f58; }
  .event .agent {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .event .level {
    font-size: 11px;
    padding: 1px 8px;
    border-radius: 10px;
    text-align: center;
    font-weight: 500;
  }
  .event .content { color: #c9d1d9; }
  .event .detail { color: #8b949e; font-size: 12px; margin-top: 2px; }

  /* Agent colors */
  .agent-hr { color: #bc8cff; }
  .agent-default { color: #58a6ff; }

  /* Level badges */
  .level-info { background: #1f2937; color: #8b949e; }
  .level-action { background: #0d4429; color: #3fb950; }
  .level-tool { background: #2d1b00; color: #d29922; }
  .level-sub { background: #1b1340; color: #bc8cff; }
  .level-error { background: #3d1418; color: #f85149; }
  .level-status { background: #1b2a3d; color: #58a6ff; }

  .empty {
    text-align: center;
    padding: 60px 20px;
    color: #484f58;
  }

  /* Sub event detail expansion */
  .event.has-data { cursor: pointer; }
  .event .data-block {
    display: none;
    grid-column: 1 / -1;
    background: #0d1117;
    border: 1px solid #21262d;
    border-radius: 4px;
    padding: 8px 12px;
    margin-top: 4px;
    font-size: 12px;
    white-space: pre-wrap;
    color: #8b949e;
    max-height: 200px;
    overflow: auto;
  }
  .event.expanded .data-block { display: block; }
</style>
</head>
<body>

<header>
  <h1>Taskforce Dashboard</h1>
  <div class="stats">
    <span class="stat">Events: <b id="count">0</b></span>
    <span class="stat">Agents: <b id="agents">-</b></span>
  </div>
</header>

<div class="filters">
  <button class="filter-btn active" data-filter="all">All</button>
  <button class="filter-btn" data-filter="hr">HR</button>
  <button class="filter-btn" data-filter="sub">Subconscious</button>
  <button class="filter-btn" data-filter="tool">Tools</button>
  <button class="filter-btn" data-filter="action">Actions</button>
  <button class="filter-btn" data-filter="error">Errors</button>
</div>

<div id="events">
  <div class="empty" id="empty">Waiting for events...</div>
</div>

<script>
const eventsEl = document.getElementById('events');
const countEl = document.getElementById('count');
const agentsEl = document.getElementById('agents');
const emptyEl = document.getElementById('empty');
let eventCount = 0;
const agentSet = new Set();
let activeFilter = 'all';
let autoScroll = true;

// Filters
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    document.querySelectorAll('.event').forEach(el => {
      el.style.display = matchesFilter(el.dataset) ? '' : 'none';
    });
  });
});

function matchesFilter(dataset) {
  if (activeFilter === 'all') return true;
  if (activeFilter === 'hr') return dataset.agent === 'hr';
  if (activeFilter === 'sub') return dataset.level === 'sub';
  if (activeFilter === 'tool') return dataset.level === 'tool';
  if (activeFilter === 'action') return dataset.level === 'action';
  if (activeFilter === 'error') return dataset.level === 'error';
  return true;
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function addEvent(ev) {
  if (emptyEl) emptyEl.remove();
  eventCount++;
  agentSet.add(ev.agent);
  countEl.textContent = eventCount;
  agentsEl.textContent = [...agentSet].join(', ');

  const el = document.createElement('div');
  el.className = 'event' + (ev.data ? ' has-data' : '');
  el.dataset.agent = ev.agent;
  el.dataset.level = ev.level;
  el.dataset.source = ev.source;

  const agentClass = ev.agent === 'hr' ? 'agent-hr' : 'agent-default';
  const display = matchesFilter(el.dataset) ? '' : 'none';
  el.style.display = display;

  let html = \`
    <span class="time">\${formatTime(ev.timestamp)}</span>
    <span class="agent \${agentClass}">\${ev.agent}</span>
    <span class="level level-\${ev.level}">\${ev.level}</span>
    <span class="content">\${escapeHtml(ev.title)}\${ev.detail ? '<span class="detail"> — ' + escapeHtml(ev.detail) + '</span>' : ''}</span>
  \`;

  if (ev.data) {
    html += \`<div class="data-block">\${escapeHtml(JSON.stringify(ev.data, null, 2))}</div>\`;
    el.addEventListener('click', () => el.classList.toggle('expanded'));
  }

  el.innerHTML = html;
  eventsEl.appendChild(el);

  if (autoScroll) {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Auto-scroll detection
window.addEventListener('scroll', () => {
  autoScroll = (window.innerHeight + window.scrollY) >= document.body.scrollHeight - 100;
});

// SSE connection
const source = new EventSource('/events');
source.onmessage = (e) => {
  try { addEvent(JSON.parse(e.data)); } catch {}
};
source.onerror = () => {
  setTimeout(() => location.reload(), 3000);
};
</script>
</body>
</html>`;
