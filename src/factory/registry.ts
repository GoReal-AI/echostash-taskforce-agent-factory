/**
 * Registry — persists agents, tools, skills, and tool requests to disk.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type {
  AgentDefinition,
  ToolDefinition,
  SkillDefinition,
  ToolRequest,
  TaskforceState,
  OrgContext,
  Mission,
  MissionTask,
  UserProfile,
  AgentPermissions,
  RuleGuard,
  InboxMessage,
  AgentRuntimeState,
  AgentBudget,
  ScheduledTask,
  AuditEntry,
} from './types.js';

const DATA_DIR = process.env.TASKFORCE_DATA_DIR ?? '.taskforce/data';

export class Registry {
  private state: TaskforceState = {
    agents: new Map(),
    tools: new Map(),
    skills: new Map(),
    toolRequests: [],
    org: { name: 'Taskforce', purpose: '', workingAgreements: [], boundaries: [], updatedAt: Date.now() },
    missions: new Map(),
    users: new Map(),
    permissions: new Map(),
    ruleGuards: new Map(),
    inboxes: new Map(),
    runtimes: new Map(),
    budgets: new Map(),
    schedules: new Map(),
    audit: [],
  };

  constructor() {
    this.load();
  }

  // --- Agents ---
  registerAgent(def: AgentDefinition): void {
    this.state.agents.set(def.name, def);
    this.touchOrg();
    this.save();
  }
  getAgent(name: string): AgentDefinition | undefined {
    return this.state.agents.get(name);
  }
  listAgents(): AgentDefinition[] {
    return Array.from(this.state.agents.values());
  }
  removeAgent(name: string): boolean {
    const removed = this.state.agents.delete(name);
    if (removed) { this.touchOrg(); this.save(); }
    return removed;
  }
  updateAgent(name: string, updates: Partial<AgentDefinition>): boolean {
    const agent = this.state.agents.get(name);
    if (!agent) return false;
    Object.assign(agent, updates);
    this.save();
    return true;
  }

  // --- Tools ---
  registerTool(def: ToolDefinition): void {
    this.state.tools.set(def.name, def);
    this.save();
  }
  getTool(name: string): ToolDefinition | undefined {
    return this.state.tools.get(name);
  }
  listTools(): ToolDefinition[] {
    return Array.from(this.state.tools.values());
  }
  assignToolToAgent(toolName: string, agentName: string): boolean {
    const tool = this.state.tools.get(toolName);
    const agent = this.state.agents.get(agentName);
    if (!tool || !agent) return false;
    if (!tool.assignedTo.includes(agentName)) tool.assignedTo.push(agentName);
    if (!agent.tools.includes(toolName)) agent.tools.push(toolName);
    this.save();
    return true;
  }
  removeToolFromAgent(toolName: string, agentName: string): boolean {
    const tool = this.state.tools.get(toolName);
    const agent = this.state.agents.get(agentName);
    if (!tool || !agent) return false;
    tool.assignedTo = tool.assignedTo.filter((n) => n !== agentName);
    agent.tools = agent.tools.filter((n) => n !== toolName);
    this.save();
    return true;
  }

  // --- Skills ---
  registerSkill(def: SkillDefinition): void {
    this.state.skills.set(def.name, def);
    this.save();
  }
  getSkill(name: string): SkillDefinition | undefined {
    return this.state.skills.get(name);
  }
  listSkills(): SkillDefinition[] {
    return Array.from(this.state.skills.values());
  }

  // --- Tool Requests ---
  addToolRequest(request: ToolRequest): void {
    this.state.toolRequests.push(request);
    this.save();
  }
  getPendingRequests(): ToolRequest[] {
    return this.state.toolRequests.filter((r) => r.status === 'pending');
  }
  resolveRequest(index: number, status: 'approved' | 'declined', response: string): void {
    const req = this.state.toolRequests[index];
    if (req) {
      req.status = status;
      req.response = response;
      this.save();
    }
  }

  // --- Org ---
  getOrg(): OrgContext {
    return this.state.org;
  }
  updateOrg(updates: Partial<OrgContext>): void {
    Object.assign(this.state.org, updates, { updatedAt: Date.now() });
    this.save();
  }
  private touchOrg(): void {
    this.state.org.updatedAt = Date.now();
  }

  // --- Missions ---
  createMission(mission: Mission): void {
    this.state.missions.set(mission.id, mission);
    this.save();
  }
  getMission(id: string): Mission | undefined {
    return this.state.missions.get(id);
  }
  listMissions(): Mission[] {
    return Array.from(this.state.missions.values());
  }
  getActiveMission(): Mission | undefined {
    return this.listMissions().find((m) => m.status === 'active');
  }
  updateMission(id: string, updates: Partial<Omit<Mission, 'id' | 'tasks'>>): boolean {
    const mission = this.state.missions.get(id);
    if (!mission) return false;
    Object.assign(mission, updates, { updatedAt: Date.now() });
    this.save();
    return true;
  }

  // --- Mission Tasks ---
  addTask(missionId: string, task: MissionTask): boolean {
    const mission = this.state.missions.get(missionId);
    if (!mission) return false;
    mission.tasks.push(task);
    mission.updatedAt = Date.now();
    this.autoUnblock(mission);
    this.save();
    return true;
  }
  getTask(missionId: string, taskId: string): MissionTask | undefined {
    const mission = this.state.missions.get(missionId);
    return mission?.tasks.find((t) => t.id === taskId);
  }
  updateTask(missionId: string, taskId: string, updates: Partial<MissionTask>): boolean {
    const mission = this.state.missions.get(missionId);
    if (!mission) return false;
    const task = mission.tasks.find((t) => t.id === taskId);
    if (!task) return false;
    // Auto-set timestamps on status changes
    if (updates.status === 'in-progress' && !task.startedAt) {
      updates.startedAt = Date.now();
    }
    if (updates.status === 'done' && !task.completedAt) {
      updates.completedAt = Date.now();
    }
    Object.assign(task, updates);
    mission.updatedAt = Date.now();
    this.autoUnblock(mission);
    this.save();
    return true;
  }
  listTasks(missionId: string): MissionTask[] {
    return this.state.missions.get(missionId)?.tasks ?? [];
  }

  /** Auto-unblock tasks whose dependencies are all done. */
  private autoUnblock(mission: Mission): void {
    const doneIds = new Set(mission.tasks.filter((t) => t.status === 'done').map((t) => t.id));
    for (const task of mission.tasks) {
      if (task.status === 'blocked' && task.dependsOn.every((dep) => doneIds.has(dep))) {
        task.status = 'todo';
      }
    }
  }

  // --- Users ---
  setUser(user: UserProfile): void {
    this.state.users.set(user.id, user);
    this.save();
  }
  getUser(id: string): UserProfile | undefined {
    return this.state.users.get(id);
  }
  listUsers(): UserProfile[] {
    return Array.from(this.state.users.values());
  }
  canUserAccessAgent(userId: string, agentName: string): boolean {
    const user = this.state.users.get(userId);
    if (!user) return true; // unknown users get default access
    if (user.role === 'viewer') return false;
    if (user.agentAccess === 'all') return true;
    return user.agentAccess.includes(agentName);
  }
  userHasRole(userId: string, minRole: 'admin' | 'operator' | 'user'): boolean {
    const user = this.state.users.get(userId);
    if (!user) return minRole === 'user'; // unknown users are 'user' level
    const hierarchy = { admin: 3, operator: 2, user: 1, viewer: 0 };
    return hierarchy[user.role] >= hierarchy[minRole];
  }

  // --- Agent Permissions ---
  setPermissions(perms: AgentPermissions): void {
    this.state.permissions.set(perms.agentName, perms);
    this.save();
  }
  getPermissions(agentName: string): AgentPermissions | undefined {
    return this.state.permissions.get(agentName);
  }
  getActionGate(agentName: string, toolName: string): 'auto' | 'notify' | 'approve' | 'deny' {
    const perms = this.state.permissions.get(agentName);
    if (!perms) return 'auto'; // no permissions set = full auto
    return perms.actionGates[toolName] ?? 'auto';
  }

  // --- Rule Guards ---
  setRuleGuards(agentName: string, guards: RuleGuard[]): void {
    this.state.ruleGuards.set(agentName, guards);
    this.save();
  }
  addRuleGuard(agentName: string, guard: RuleGuard): void {
    const guards = this.state.ruleGuards.get(agentName) ?? [];
    guards.push(guard);
    this.state.ruleGuards.set(agentName, guards);
    this.save();
  }
  getRuleGuards(agentName: string): RuleGuard[] {
    return this.state.ruleGuards.get(agentName) ?? [];
  }

  // --- Inbox ---
  addInboxMessage(agentName: string, msg: InboxMessage): void {
    const inbox = this.state.inboxes.get(agentName) ?? [];
    inbox.push(msg);
    this.state.inboxes.set(agentName, inbox);
    this.save();
  }
  getInbox(agentName: string): InboxMessage[] {
    return this.state.inboxes.get(agentName) ?? [];
  }
  getUnreadInbox(agentName: string): InboxMessage[] {
    return this.getInbox(agentName).filter((m) => m.status === 'new');
  }
  markRead(agentName: string, messageId: string): void {
    const inbox = this.state.inboxes.get(agentName);
    const msg = inbox?.find((m) => m.id === messageId);
    if (msg) { msg.status = 'read'; msg.readAt = Date.now(); this.save(); }
  }
  markResponded(agentName: string, messageId: string): void {
    const inbox = this.state.inboxes.get(agentName);
    const msg = inbox?.find((m) => m.id === messageId);
    if (msg) { msg.status = 'responded'; this.save(); }
  }

  // --- Agent Runtime State ---
  setRuntimeState(state: AgentRuntimeState): void {
    this.state.runtimes.set(state.name, state);
    this.save();
  }
  getRuntimeState(agentName: string): AgentRuntimeState | undefined {
    return this.state.runtimes.get(agentName);
  }
  listRuntimeStates(): AgentRuntimeState[] {
    return Array.from(this.state.runtimes.values());
  }

  // --- Budget ---
  setBudget(budget: AgentBudget): void {
    this.state.budgets.set(budget.agentName, budget);
    this.save();
  }
  getBudget(agentName: string): AgentBudget | undefined {
    return this.state.budgets.get(agentName);
  }
  recordTokenUsage(agentName: string, tokens: number): void {
    let budget = this.state.budgets.get(agentName);
    if (!budget) return;
    const now = Date.now();
    // Roll windows
    if (now - budget.hourWindowStart > 3_600_000) {
      budget.currentHourUsage = 0;
      budget.hourWindowStart = now;
    }
    if (now - budget.dayWindowStart > 86_400_000) {
      budget.currentDayUsage = 0;
      budget.dayWindowStart = now;
    }
    budget.currentHourUsage += tokens;
    budget.currentDayUsage += tokens;
    // Update tier
    const hourPct = budget.currentHourUsage / budget.tokensPerHour;
    const dayPct = budget.currentDayUsage / budget.tokensPerDay;
    const maxPct = Math.max(hourPct, dayPct);
    if (maxPct >= 1.0) budget.tier = 'paused';
    else if (maxPct >= 0.95) budget.tier = 'throttle';
    else if (maxPct >= 0.80) budget.tier = 'warning';
    else budget.tier = 'normal';
    this.save();
  }

  // --- Schedules ---
  addSchedule(task: ScheduledTask): void {
    this.state.schedules.set(task.id, task);
    this.save();
  }
  getSchedule(id: string): ScheduledTask | undefined {
    return this.state.schedules.get(id);
  }
  listSchedules(agentName?: string): ScheduledTask[] {
    const all = Array.from(this.state.schedules.values());
    return agentName ? all.filter((s) => s.agentName === agentName) : all;
  }
  getDueSchedules(): ScheduledTask[] {
    const now = Date.now();
    return Array.from(this.state.schedules.values()).filter((s) => s.enabled && s.nextRun <= now);
  }
  markScheduleRun(id: string, nextRun: number): void {
    const task = this.state.schedules.get(id);
    if (task) { task.lastRun = Date.now(); task.nextRun = nextRun; this.save(); }
  }

  // --- Audit ---
  addAuditEntry(entry: AuditEntry): void {
    this.state.audit.push(entry);
    // Keep last 1000 entries
    if (this.state.audit.length > 1000) {
      this.state.audit = this.state.audit.slice(-1000);
    }
    this.save();
  }
  getAudit(agentName?: string, limit = 50): AuditEntry[] {
    const entries = agentName ? this.state.audit.filter((a) => a.agentName === agentName) : this.state.audit;
    return entries.slice(-limit);
  }
  getViolations(agentName?: string): AuditEntry[] {
    return this.getAudit(agentName, 1000).filter((a) => a.ruleViolation !== null);
  }

  // --- Persistence ---
  private save(): void {
    mkdirSync(DATA_DIR, { recursive: true });
    const data = {
      agents: Object.fromEntries(this.state.agents),
      tools: Object.fromEntries(this.state.tools),
      skills: Object.fromEntries(this.state.skills),
      toolRequests: this.state.toolRequests,
      org: this.state.org,
      missions: Object.fromEntries(this.state.missions),
      users: Object.fromEntries(this.state.users),
      permissions: Object.fromEntries(this.state.permissions),
      ruleGuards: Object.fromEntries(this.state.ruleGuards),
      inboxes: Object.fromEntries(this.state.inboxes),
      runtimes: Object.fromEntries(this.state.runtimes),
      budgets: Object.fromEntries(this.state.budgets),
      schedules: Object.fromEntries(this.state.schedules),
      audit: this.state.audit.slice(-1000),
    };
    writeFileSync(join(DATA_DIR, 'registry.json'), JSON.stringify(data, null, 2));
  }

  private load(): void {
    const path = join(DATA_DIR, 'registry.json');
    if (!existsSync(path)) return;
    try {
      const raw = JSON.parse(readFileSync(path, 'utf-8'));
      this.state.agents = new Map(Object.entries(raw.agents ?? {}));
      this.state.tools = new Map(Object.entries(raw.tools ?? {}));
      this.state.skills = new Map(Object.entries(raw.skills ?? {}));
      this.state.toolRequests = raw.toolRequests ?? [];
      this.state.org = raw.org ?? { name: 'Taskforce', purpose: '', workingAgreements: [], boundaries: [], updatedAt: Date.now() };
      this.state.missions = new Map(Object.entries(raw.missions ?? {}));
      this.state.users = new Map(Object.entries(raw.users ?? {}));
      this.state.permissions = new Map(Object.entries(raw.permissions ?? {}));
      this.state.ruleGuards = new Map(Object.entries(raw.ruleGuards ?? {}));
      this.state.inboxes = new Map(Object.entries(raw.inboxes ?? {}));
      this.state.runtimes = new Map(Object.entries(raw.runtimes ?? {}));
      this.state.budgets = new Map(Object.entries(raw.budgets ?? {}));
      this.state.schedules = new Map(Object.entries(raw.schedules ?? {}));
      this.state.audit = raw.audit ?? [];
    } catch {
      // corrupted — start fresh
    }
  }
}
