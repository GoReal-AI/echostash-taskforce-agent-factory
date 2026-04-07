/**
 * Dashboard server — serves a live UI + SSE stream.
 *
 * Open http://localhost:3333 to see everything happening in real-time.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { events, type DashboardEvent } from './events.js';
import { DASHBOARD_HTML } from './ui.js';
import type { Registry } from '../factory/registry.js';

let registryRef: Registry | null = null;

export function startDashboard(port: number = 3333, registry?: Registry): void {
  if (registry) registryRef = registry;
  const clients = new Set<ServerResponse>();

  // Broadcast events to all SSE clients
  events.on('event', (ev: DashboardEvent) => {
    const data = `data: ${JSON.stringify(ev)}\n\n`;
    for (const client of clients) {
      client.write(data);
    }
  });

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    // SSE endpoint
    if (req.url === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      // Send history first
      for (const ev of events.getHistory()) {
        res.write(`data: ${JSON.stringify(ev)}\n\n`);
      }

      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    // API: full state snapshot (missions, agents, budgets, inboxes, audit)
    if (req.url === '/api/state' && registryRef) {
      const r = registryRef;
      const state = {
        org: r.getOrg(),
        agents: r.listAgents().map((a) => ({
          name: a.name,
          description: a.description,
          model: a.model,
          tools: a.tools,
          runtime: r.getRuntimeState(a.name),
          budget: r.getBudget(a.name),
          inboxUnread: r.getUnreadInbox(a.name).length,
          permissions: r.getPermissions(a.name),
        })),
        missions: r.listMissions(),
        users: r.listUsers(),
        violations: r.getViolations(undefined).slice(-20),
        schedules: r.listSchedules(),
      };
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(state, null, 2));
      return;
    }

    // Dashboard UI
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(DASHBOARD_HTML);
  });

  server.listen(port, () => {
    console.log(`[Dashboard] http://localhost:${port}`);
  });
}
