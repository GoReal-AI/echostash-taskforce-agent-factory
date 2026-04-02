/**
 * Event bus — captures everything that happens across HR, agents, and Subconscious.
 * Broadcasts to SSE clients for the live dashboard.
 */

import { EventEmitter } from 'events';

export type EventSource = 'hr' | 'subconscious' | 'agent' | 'tool' | 'system';
export type EventLevel = 'info' | 'action' | 'tool' | 'sub' | 'error' | 'status';

export interface DashboardEvent {
  id: number;
  timestamp: number;
  source: EventSource;
  /** Which agent (or 'hr') */
  agent: string;
  level: EventLevel;
  title: string;
  detail: string;
  /** Extra structured data */
  data?: Record<string, unknown>;
}

class EventBus extends EventEmitter {
  private counter = 0;
  private history: DashboardEvent[] = [];
  private maxHistory = 500;

  emit(event: 'event', data: DashboardEvent): boolean;
  emit(event: string, ...args: unknown[]): boolean {
    return super.emit(event, ...args);
  }

  log(
    source: EventSource,
    agent: string,
    level: EventLevel,
    title: string,
    detail: string,
    data?: Record<string, unknown>,
  ): void {
    const ev: DashboardEvent = {
      id: this.counter++,
      timestamp: Date.now(),
      source,
      agent,
      level,
      title,
      detail,
      data,
    };

    this.history.push(ev);
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }

    this.emit('event', ev);
  }

  getHistory(): DashboardEvent[] {
    return [...this.history];
  }
}

/** Singleton event bus */
export const events = new EventBus();
