/**
 * Team context builders — generate system message blocks
 * injected into every agent's context each turn.
 *
 * Two layers:
 *   1. Org context (static) — who we are, roster, boundaries
 *   2. Mission context (dynamic) — current missions, tasks, status, time
 */

import type { Registry } from './registry.js';
import type { InboxMessage } from './types.js';

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

function relativeTime(timestamp: number): string {
  const delta = Date.now() - timestamp;
  const mins = Math.floor(delta / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function timeUntil(timestamp: number): string {
  const delta = timestamp - Date.now();
  if (delta < 0) return `overdue by ${relativeTime(timestamp).replace(' ago', '')}`;
  const mins = Math.floor(delta / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  return `in ${days}d`;
}

// ---------------------------------------------------------------------------
// Layer 1: Org Context
// ---------------------------------------------------------------------------

export function buildOrgContextBlock(registry: Registry): string {
  const org = registry.getOrg();
  const agents = registry.listAgents();

  const lines: string[] = [];
  lines.push(`## Team: ${org.name}`);
  if (org.purpose) lines.push(`Purpose: ${org.purpose}`);

  if (agents.length > 0) {
    lines.push('');
    lines.push('### Roster');
    for (const a of agents) {
      lines.push(`- **${a.name}**: ${a.description} | Tools: ${a.tools.join(', ')}`);
    }
  }

  if (org.workingAgreements.length > 0) {
    lines.push('');
    lines.push('### Working Agreements');
    for (const wa of org.workingAgreements) lines.push(`- ${wa}`);
  }

  if (org.boundaries.length > 0) {
    lines.push('');
    lines.push('### Boundaries');
    for (const b of org.boundaries) lines.push(`- ${b}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Layer 2: Mission Context
// ---------------------------------------------------------------------------

export function buildMissionContextBlock(registry: Registry, agentName?: string): string {
  const missions = registry.listMissions().filter((m) => m.status === 'active' || m.status === 'planning');

  if (missions.length === 0) return '';

  const lines: string[] = ['## Active Missions'];

  for (const mission of missions) {
    const done = mission.tasks.filter((t) => t.status === 'done').length;
    const total = mission.tasks.length;
    const deadlineStr = mission.deadline ? ` | Due ${timeUntil(mission.deadline)}` : '';
    lines.push(`- **${mission.name}** [${mission.status}]: ${mission.goal} (${done}/${total} tasks done${deadlineStr})`);
  }

  // If agent-specific, show their open tasks
  if (agentName) {
    const myTasks = missions.flatMap((m) =>
      m.tasks
        .filter((t) => t.assignedTo === agentName && t.status !== 'done' && t.status !== 'failed')
        .map((t) => ({ mission: m.name, task: t })),
    );

    if (myTasks.length > 0) {
      lines.push('');
      lines.push('### My Open Tasks');
      for (const { mission, task } of myTasks) {
        const started = task.startedAt ? ` | started ${relativeTime(task.startedAt)}` : '';
        const deps = task.dependsOn.length > 0 ? ` | depends on: ${task.dependsOn.join(', ')}` : '';
        lines.push(`- [${mission}] **${task.title}** [${task.status}]${started}${deps}`);
      }
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Layer 3: Inbox Summary (for agent-specific context)
// ---------------------------------------------------------------------------

export function buildInboxSummaryBlock(registry: Registry, agentName: string): string {
  const unread = registry.getUnreadInbox(agentName);
  if (unread.length === 0) return '';

  // Sort by priority (lowest number = highest priority)
  const sorted = [...unread].sort((a, b) => a.priority - b.priority);

  const lines: string[] = ['### Requests and DMs'];
  for (const msg of sorted.slice(0, 10)) { // cap at 10 in context
    const source = formatSource(msg);
    const age = relativeTime(msg.createdAt);
    lines.push(`- [${source}]: ${msg.content.slice(0, 120)} (${age})`);
  }
  if (unread.length > 10) {
    lines.push(`... and ${unread.length - 10} more`);
  }
  return lines.join('\n');
}

function formatSource(msg: InboxMessage): string {
  if (msg.from === 'hr') return 'HR';
  if (msg.from.startsWith('agent_')) return msg.from;
  if (msg.from.startsWith('user_')) return msg.from;
  return msg.from;
}

// ---------------------------------------------------------------------------
// Budget Summary (for agent-specific context)
// ---------------------------------------------------------------------------

export function buildBudgetBlock(registry: Registry, agentName: string): string {
  const budget = registry.getBudget(agentName);
  if (!budget || budget.tier === 'normal') return '';

  const hourPct = Math.round((budget.currentHourUsage / budget.tokensPerHour) * 100);
  return `### Budget: [${budget.tier.toUpperCase()}] ${hourPct}% of hourly limit used`;
}

// ---------------------------------------------------------------------------
// Combined
// ---------------------------------------------------------------------------

export function buildTeamAwarenessBlock(registry: Registry, agentName?: string): string {
  const org = buildOrgContextBlock(registry);
  const mission = buildMissionContextBlock(registry, agentName);

  const parts = [org];
  if (mission) parts.push(mission);

  if (agentName) {
    const inbox = buildInboxSummaryBlock(registry, agentName);
    if (inbox) parts.push(inbox);
    const budget = buildBudgetBlock(registry, agentName);
    if (budget) parts.push(budget);
  }

  return parts.join('\n\n');
}
