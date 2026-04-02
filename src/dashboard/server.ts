/**
 * Dashboard server — serves a live UI + SSE stream.
 *
 * Open http://localhost:3333 to see everything happening in real-time.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { events, type DashboardEvent } from './events.js';
import { DASHBOARD_HTML } from './ui.js';

export function startDashboard(port: number = 3333): void {
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

    // Dashboard UI
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(DASHBOARD_HTML);
  });

  server.listen(port, () => {
    console.log(`[Dashboard] http://localhost:${port}`);
  });
}
