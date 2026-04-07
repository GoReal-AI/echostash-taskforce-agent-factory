/**
 * Scheduler — background loop that processes due scheduled tasks,
 * inbox messages, and mission board items.
 *
 * Runs every TICK_INTERVAL_MS. For each agent:
 *   1. Check due schedules → spawn agent with task
 *   2. Check inbox → process highest priority unread
 *   3. Check mission board → pick up unblocked assigned tasks
 *
 * This is the "always-on" part of the Agent OS.
 */

import type { Registry } from '../factory/registry.js';
import type { ScheduledTask } from '../factory/types.js';
import { AgentRuntime } from './agent-runtime.js';
import { events } from '../dashboard/events.js';

const TICK_INTERVAL_MS = 30_000; // 30 seconds

export type AgentExecutor = (agentName: string, task: string) => Promise<string>;

export class Scheduler {
  private interval: ReturnType<typeof setInterval> | null = null;
  private runtimes = new Map<string, AgentRuntime>();
  private processing = false;

  constructor(
    private readonly registry: Registry,
    private readonly executeAgent: AgentExecutor,
  ) {}

  /** Start the background tick loop. */
  start(): void {
    if (this.interval) return;
    console.log(`[Scheduler] Started (tick every ${TICK_INTERVAL_MS / 1000}s)`);
    events.log('system', 'scheduler', 'status', 'Scheduler started', `Tick: ${TICK_INTERVAL_MS / 1000}s`);

    // Run immediately, then on interval
    void this.tick();
    this.interval = setInterval(() => void this.tick(), TICK_INTERVAL_MS);
  }

  /** Stop the background loop. */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log('[Scheduler] Stopped');
    }
  }

  /** Get or create a runtime for an agent. */
  private getRuntime(agentName: string): AgentRuntime {
    let rt = this.runtimes.get(agentName);
    if (!rt) {
      rt = new AgentRuntime(agentName, this.registry);
      this.runtimes.set(agentName, rt);
    }
    return rt;
  }

  /** One tick — process all agents. */
  private async tick(): Promise<void> {
    if (this.processing) return; // prevent overlapping ticks
    this.processing = true;

    try {
      // 1. Process due schedules
      await this.processDueSchedules();

      // 2. Process agent inboxes (idle agents only)
      await this.processInboxes();
    } catch (error: any) {
      events.log('system', 'scheduler', 'error', 'Tick failed', error.message);
    } finally {
      this.processing = false;
    }
  }

  /** Find and execute due scheduled tasks. */
  private async processDueSchedules(): Promise<void> {
    const due = this.registry.getDueSchedules();
    for (const sched of due) {
      const rt = this.getRuntime(sched.agentName);
      if (rt.state !== 'idle') continue; // agent is busy, skip this tick
      if (!rt.checkBudget()) continue; // over budget

      console.log(`\n[Scheduler] Running scheduled task for ${sched.agentName}: ${sched.task}`);
      events.log('system', 'scheduler', 'status', `Schedule triggered: ${sched.agentName}`, sched.task);

      rt.startTask(sched.id);
      try {
        const result = await this.executeAgent(sched.agentName, sched.task);

        // Calculate next run
        const nextRun = computeNextRun(sched);
        if (nextRun !== null) {
          this.registry.markScheduleRun(sched.id, nextRun);
        } else {
          // One-shot — disable after execution
          this.registry.markScheduleRun(sched.id, Number.MAX_SAFE_INTEGER);
        }

        // Deliver result to whoever cares (HR inbox)
        this.registry.addInboxMessage('hr', {
          id: `sched-result-${Date.now()}`,
          from: `agent_${sched.agentName}`,
          to: 'hr',
          thread: `sched-${sched.id}`,
          priority: 3,
          kind: 'status',
          content: `Scheduled task completed: "${sched.task}"\nResult: ${result.slice(0, 500)}`,
          createdAt: Date.now(),
          readAt: null,
          status: 'new',
        });
      } catch (error: any) {
        events.log('system', 'scheduler', 'error', `Schedule failed: ${sched.agentName}`, error.message);
      } finally {
        rt.finishWork();
      }
    }
  }

  /** Process inbox for idle agents. */
  private async processInboxes(): Promise<void> {
    for (const agent of this.registry.listAgents()) {
      const rt = this.getRuntime(agent.name);
      if (rt.state !== 'idle') continue;
      if (!rt.checkBudget()) continue;

      const nextMsg = rt.getNextMessage();
      if (!nextMsg) continue;

      console.log(`\n[Scheduler] ${agent.name} processing inbox message from ${nextMsg.from}`);
      events.log('system', 'scheduler', 'status', `Inbox: ${agent.name}`, `From ${nextMsg.from}: ${nextMsg.content.slice(0, 100)}`);

      this.registry.markRead(agent.name, nextMsg.id);
      rt.startResponding(nextMsg.thread);

      try {
        const task = `You received a message from ${nextMsg.from}:\n\n${nextMsg.content}\n\nRespond appropriately.`;
        const result = await this.executeAgent(agent.name, task);

        this.registry.markResponded(agent.name, nextMsg.id);

        // If the sender is another agent, deliver the response to their inbox
        if (nextMsg.from.startsWith('agent_')) {
          const senderName = nextMsg.from.replace('agent_', '');
          this.registry.addInboxMessage(senderName, {
            id: `reply-${Date.now()}`,
            from: `agent_${agent.name}`,
            to: senderName,
            thread: nextMsg.thread,
            priority: 2,
            kind: 'response',
            content: result.slice(0, 1000),
            createdAt: Date.now(),
            readAt: null,
            status: 'new',
          });
        }
      } catch (error: any) {
        events.log('system', 'scheduler', 'error', `Inbox processing failed: ${agent.name}`, error.message);
      } finally {
        rt.finishWork();
      }
    }
  }
}

/** Compute the next run time for a schedule. Returns null for one-shot tasks. */
function computeNextRun(sched: ScheduledTask): number | null {
  const schedule = sched.schedule.toLowerCase();

  // One-shot: "once in Xm/h" or "in Xm/h"
  if (schedule.startsWith('once') || schedule.startsWith('in ')) {
    return null; // don't repeat
  }

  // Recurring: "every Xm/h/d"
  const match = schedule.match(/every\s+(\d+)\s*(m|min|h|hr|hour|d|day)/i);
  if (match) {
    const val = parseInt(match[1]!);
    const unit = match[2]!.toLowerCase();
    let ms = val * 60_000;
    if (unit.startsWith('h')) ms = val * 3_600_000;
    if (unit.startsWith('d')) ms = val * 86_400_000;
    return Date.now() + ms;
  }

  // Daily at HH:MM
  const dailyMatch = schedule.match(/daily\s+at\s+(\d{1,2}):(\d{2})/);
  if (dailyMatch) {
    const now = new Date();
    const target = new Date();
    target.setHours(parseInt(dailyMatch[1]!), parseInt(dailyMatch[2]!), 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    return target.getTime();
  }

  // Default: 1 hour
  return Date.now() + 3_600_000;
}
