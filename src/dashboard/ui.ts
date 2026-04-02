/**
 * Dashboard HTML — real-time event viewer with context inspector and cost tracking.
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
  .stats { display: flex; gap: 16px; margin-left: auto; font-size: 12px; }
  .stat { color: #8b949e; }
  .stat b { color: #c9d1d9; }
  .stat .green { color: #3fb950; }
  .stat .yellow { color: #d29922; }

  /* Cost bar */
  .cost-bar {
    background: #161b22;
    border-bottom: 1px solid #30363d;
    padding: 8px 20px;
    display: flex;
    gap: 24px;
    font-size: 12px;
    position: sticky;
    top: 48px;
    z-index: 10;
  }
  .cost-item { color: #8b949e; }
  .cost-item b { color: #c9d1d9; }
  .cost-item .save { color: #3fb950; font-weight: 600; }

  .filters {
    background: #161b22;
    border-bottom: 1px solid #30363d;
    padding: 8px 20px;
    display: flex;
    gap: 8px;
    position: sticky;
    top: 88px;
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

  #events { padding: 12px 20px; display: flex; flex-direction: column; gap: 2px; }

  .event {
    display: grid;
    grid-template-columns: 90px 120px 80px 1fr;
    gap: 12px;
    padding: 6px 12px;
    border-radius: 6px;
    transition: background 0.15s;
    animation: fadeIn 0.3s ease;
  }
  .event:hover { background: #161b22; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; } }

  .event .time { color: #484f58; }
  .event .agent { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .event .level { font-size: 11px; padding: 1px 8px; border-radius: 10px; text-align: center; font-weight: 500; }
  .event .content { color: #c9d1d9; }
  .event .detail { color: #8b949e; font-size: 12px; margin-top: 2px; }

  .agent-hr { color: #bc8cff; }
  .agent-default { color: #58a6ff; }

  .level-info { background: #1f2937; color: #8b949e; }
  .level-action { background: #0d4429; color: #3fb950; }
  .level-tool { background: #2d1b00; color: #d29922; }
  .level-sub { background: #1b1340; color: #bc8cff; }
  .level-error { background: #3d1418; color: #f85149; }
  .level-status { background: #1b2a3d; color: #58a6ff; }

  .empty { text-align: center; padding: 60px 20px; color: #484f58; }

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
    max-height: 600px;
    overflow: auto;
  }
  .event.expanded .data-block { display: block; }

  /* Context viewer inside expanded sub events */
  .ctx-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  .ctx-table th { text-align: left; color: #58a6ff; padding: 4px 8px; border-bottom: 1px solid #30363d; font-size: 11px; }
  .ctx-table td { padding: 4px 8px; border-bottom: 1px solid #1b2030; vertical-align: top; font-size: 12px; }
  .ctx-table tr:hover { background: #161b22; }
  .ctx-content { max-width: 600px; white-space: pre-wrap; word-break: break-word; color: #c9d1d9; }
  .ctx-meta { color: #8b949e; font-size: 11px; }
  .ctx-badge { display: inline-block; padding: 0 6px; border-radius: 8px; font-size: 10px; margin-right: 4px; }
  .ctx-badge.user { background: #1b2a3d; color: #58a6ff; }
  .ctx-badge.assistant { background: #0d4429; color: #3fb950; }
  .ctx-badge.system { background: #2d1b00; color: #d29922; }
  .ctx-badge.tool { background: #1b1340; color: #bc8cff; }
  .ctx-badge.recalled { background: #3d1418; color: #f85149; }
  .ctx-badge.pinned { background: #d29922; color: #000; }
  .ctx-badge.compressed { background: #484f58; color: #c9d1d9; }

  .ctx-actions { margin-bottom: 8px; }
  .ctx-action { color: #8b949e; font-size: 12px; padding: 2px 0; }
  .ctx-action b { color: #bc8cff; }
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

<div class="cost-bar" id="costBar">
  <span class="cost-item">Curated: <b id="costCurated">0</b> tokens</span>
  <span class="cost-item">Raw would be: <b id="costRaw">0</b> tokens</span>
  <span class="cost-item">Saved: <b class="save" id="costSaved">0</b> tokens (<b class="save" id="costPct">0</b>%)</span>
  <span class="cost-item">Sub cost: <b id="costSub">0</b> tokens</span>
  <span class="cost-item">Net: <b class="save" id="costNet">0</b></span>
</div>

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

function matchesFilter(ds) {
  if (activeFilter === 'all') return true;
  if (activeFilter === 'hr') return ds.agent === 'hr';
  if (activeFilter === 'sub') return ds.level === 'sub';
  if (activeFilter === 'tool') return ds.level === 'tool';
  if (activeFilter === 'action') return ds.level === 'action';
  if (activeFilter === 'error') return ds.level === 'error';
  return true;
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function updateCosts(totals) {
  if (!totals) return;
  document.getElementById('costCurated').textContent = totals.curatedTokens?.toLocaleString() ?? '0';
  document.getElementById('costRaw').textContent = totals.rawTokens?.toLocaleString() ?? '0';
  document.getElementById('costSaved').textContent = totals.savedTokens?.toLocaleString() ?? '0';
  document.getElementById('costPct').textContent = totals.savingsPct ?? '0';
  document.getElementById('costSub').textContent = totals.subconsciousTokens?.toLocaleString() ?? '0';
  document.getElementById('costNet').textContent = (totals.netSavings > 0 ? '+' : '') + totals.netSavings?.toLocaleString();
}

function renderContextTable(data) {
  if (!data || !data.context) return escapeHtml(JSON.stringify(data, null, 2));

  let html = '';

  // Actions
  if (data.actions && data.actions.length) {
    html += '<div class="ctx-actions">';
    for (const a of data.actions) {
      html += '<div class="ctx-action"><b>[' + escapeHtml(a.type) + ']</b> ' + escapeHtml(a.detail) + '</div>';
    }
    html += '</div>';
  }

  // Summary
  if (data.summary) {
    html += '<div style="color:#d29922;margin-bottom:8px"><b>Summary:</b> ' + escapeHtml(data.summary) + '</div>';
  }

  // Context table
  html += '<table class="ctx-table"><thead><tr><th>#</th><th>Role</th><th>Meta</th><th>Content</th></tr></thead><tbody>';
  for (let i = 0; i < data.context.length; i++) {
    const m = data.context[i];
    const badges = [];
    badges.push('<span class="ctx-badge ' + m.role + '">' + m.role + '</span>');
    if (m.recalled) badges.push('<span class="ctx-badge recalled">recalled</span>');
    if (m.pinned) badges.push('<span class="ctx-badge pinned">pinned</span>');
    if (m.compressed) badges.push('<span class="ctx-badge compressed">compressed</span>');

    html += '<tr>';
    html += '<td class="ctx-meta">' + i + '</td>';
    html += '<td>' + badges.join('') + '</td>';
    html += '<td class="ctx-meta">t:' + m.turn + ' p:' + m.priority + ' r:' + m.relevancy + ' ' + m.tokens + 'tok</td>';
    html += '<td class="ctx-content">' + escapeHtml(m.content.slice(0, 500)) + (m.content.length > 500 ? '...' : '') + '</td>';
    html += '</tr>';
  }
  html += '</tbody></table>';

  if (data.recalled > 0) html += '<div style="color:#f85149;margin-top:4px">Recalled: ' + data.recalled + ' messages</div>';
  if (data.compressed > 0) html += '<div style="color:#484f58;margin-top:4px">Compressed: ' + data.compressed + ' messages</div>';

  return html;
}

function addEvent(ev) {
  // Update costs
  if (ev.agent === 'costs' && ev.data?.totals) {
    updateCosts(ev.data.totals);
    return; // don't render cost events as rows
  }

  if (emptyEl) emptyEl.remove();
  eventCount++;
  agentSet.add(ev.agent);
  countEl.textContent = eventCount;
  agentsEl.textContent = [...agentSet].filter(a => a !== 'costs' && a !== 'user').join(', ');

  const el = document.createElement('div');
  el.className = 'event' + (ev.data ? ' has-data' : '');
  el.dataset.agent = ev.agent;
  el.dataset.level = ev.level;
  el.dataset.source = ev.source;

  const agentClass = ev.agent === 'hr' ? 'agent-hr' : 'agent-default';
  el.style.display = matchesFilter(el.dataset) ? '' : 'none';

  let html = '<span class="time">' + formatTime(ev.timestamp) + '</span>';
  html += '<span class="agent ' + agentClass + '">' + escapeHtml(ev.agent) + '</span>';
  html += '<span class="level level-' + ev.level + '">' + ev.level + '</span>';
  html += '<span class="content">' + escapeHtml(ev.title);
  if (ev.detail) html += '<span class="detail"> — ' + escapeHtml(ev.detail) + '</span>';
  html += '</span>';

  if (ev.data) {
    const isContext = ev.level === 'sub' && ev.data.context;
    html += '<div class="data-block">' + (isContext ? renderContextTable(ev.data) : escapeHtml(JSON.stringify(ev.data, null, 2))) + '</div>';
    el.addEventListener('click', () => el.classList.toggle('expanded'));
  }

  el.innerHTML = html;
  eventsEl.appendChild(el);
  if (autoScroll) window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

window.addEventListener('scroll', () => {
  autoScroll = (window.innerHeight + window.scrollY) >= document.body.scrollHeight - 100;
});

const source = new EventSource('/events');
source.onmessage = (e) => { try { addEvent(JSON.parse(e.data)); } catch {} };
source.onerror = () => { setTimeout(() => location.reload(), 3000); };
</script>
</body>
</html>`;
