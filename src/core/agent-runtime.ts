/**
 * Agent Runtime — persistent agent lifecycle management.
 *
 * Agents are always-on entities with states:
 *   idle → busy | responding
 *   busy → idle (task complete)
 *   responding → idle | busy
 *   paused → idle (on resume)
 *   over-budget → paused (until HR approves)
 *
 * The Tick: autonomous idle loop that checks inbox, board, schedules.
 */

import type { Registry } from '../factory/registry.js';
import type { AgentState, InboxMessage } from '../factory/types.js';
import { events } from '../dashboard/events.js';

export class AgentRuntime {
  private _state: AgentState = 'idle';
  private _currentTask: string | null = null;
  private _currentThread: string | null = null;
  private maxAutonomousActions: number;

  constructor(
    public readonly name: string,
    private readonly registry: Registry,
    opts?: { maxAutonomousActions?: number },
  ) {
    this.maxAutonomousActions = opts?.maxAutonomousActions ?? 10;
    this.syncState();
  }

  get state(): AgentState { return this._state; }
  get currentTask(): string | null { return this._currentTask; }

  // --- State Transitions ---

  startTask(taskId: string): void {
    this._state = 'busy';
    this._currentTask = taskId;
    this.persist();
    events.log('system', this.name, 'status', 'State → busy', `Task: ${taskId}`);
  }

  startResponding(threadId: string): void {
    this._state = 'responding';
    this._currentThread = threadId;
    this.persist();
    events.log('system', this.name, 'status', 'State → responding', `Thread: ${threadId}`);
  }

  finishWork(): void {
    this._state = 'idle';
    this._currentTask = null;
    this._currentThread = null;
    this.persist();
    events.log('system', this.name, 'status', 'State → idle', '');
  }

  pause(reason: string): void {
    this._state = 'paused';
    this.persist();
    events.log('system', this.name, 'status', 'State → paused', reason);
  }

  resume(): void {
    this._state = 'idle';
    this.persist();
    events.log('system', this.name, 'status', 'State → idle (resumed)', '');
  }

  markOverBudget(): void {
    this._state = 'over-budget';
    this.persist();
    events.log('system', this.name, 'status', 'State → over-budget', '');
    // Notify HR
    this.registry.addInboxMessage('hr', {
      id: `budget-${Date.now()}`,
      from: `agent_${this.name}`,
      to: 'hr',
      thread: `budget-${this.name}`,
      priority: 1,
      kind: 'notification',
      content: `Agent ${this.name} has exceeded its token budget and is paused. Approve to continue.`,
      createdAt: Date.now(),
      readAt: null,
      status: 'new',
    });
  }

  // --- Inbox Priority ---

  /**
   * Get the next message to process from inbox, sorted by priority.
   * Returns null if inbox is empty.
   */
  getNextMessage(): InboxMessage | null {
    const unread = this.registry.getUnreadInbox(this.name);
    if (unread.length === 0) return null;
    // Sort: P0 (user) first, then P1 (HR), P2 (agent), P3 (system)
    const sorted = [...unread].sort((a, b) => a.priority - b.priority);
    return sorted[0] ?? null;
  }

  /**
   * Check if agent should process inbox items based on current state.
   * Returns true if there are items worth interrupting for.
   */
  hasUrgentInbox(): boolean {
    const unread = this.registry.getUnreadInbox(this.name);
    // P0 (user) messages are always urgent
    return unread.some((m) => m.priority === 0);
  }

  // --- Budget Check ---

  checkBudget(): boolean {
    const budget = this.registry.getBudget(this.name);
    if (!budget) return true; // no budget = unlimited
    if (budget.tier === 'paused') {
      if (this._state !== 'over-budget') this.markOverBudget();
      return false;
    }
    return true;
  }

  // --- The Tick (autonomous idle loop) ---

  /**
   * Run one tick of the autonomous loop.
   * Returns what action was taken, or null if nothing to do.
   */
  tick(): { action: string; detail: string } | null {
    if (this._state !== 'idle') return null;
    if (!this.checkBudget()) return null;

    // 1. Check inbox
    const nextMsg = this.getNextMessage();
    if (nextMsg) {
      return { action: 'inbox', detail: `Message from ${nextMsg.from}: ${nextMsg.content.slice(0, 100)}` };
    }

    // 2. Check mission board for unblocked tasks assigned to me
    const missions = this.registry.listMissions().filter((m) => m.status === 'active');
    for (const mission of missions) {
      const myTask = mission.tasks.find(
        (t) => t.assignedTo === this.name && (t.status === 'todo' || t.status === 'in-progress'),
      );
      if (myTask) {
        return { action: 'task', detail: `Task "${myTask.title}" in mission "${mission.name}" is ${myTask.status}` };
      }
    }

    // 3. Check scheduled tasks
    const due = this.registry.getDueSchedules().filter((s) => s.agentName === this.name);
    if (due.length > 0) {
      return { action: 'schedule', detail: `Scheduled: ${due[0]!.task}` };
    }

    return null;
  }

  // --- Persistence ---

  private persist(): void {
    this.registry.setRuntimeState({
      name: this.name,
      state: this._state,
      currentTask: this._currentTask,
      currentThread: this._currentThread,
      lastActiveAt: Date.now(),
    });
  }

  private syncState(): void {
    const saved = this.registry.getRuntimeState(this.name);
    if (saved) {
      this._state = saved.state;
      this._currentTask = saved.currentTask;
      this._currentThread = saved.currentThread;
    }
  }
}
