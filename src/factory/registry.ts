/**
 * Registry — persists agents, tools, skills, and tool requests to disk.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { AgentDefinition, ToolDefinition, SkillDefinition, ToolRequest, TaskforceState } from './types.js';

const DATA_DIR = process.env.TASKFORCE_DATA_DIR ?? '.taskforce/data';

export class Registry {
  private state: TaskforceState = {
    agents: new Map(),
    tools: new Map(),
    skills: new Map(),
    toolRequests: [],
  };

  constructor() {
    this.load();
  }

  // --- Agents ---
  registerAgent(def: AgentDefinition): void {
    this.state.agents.set(def.name, def);
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
    if (removed) this.save();
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

  // --- Persistence ---
  private save(): void {
    mkdirSync(DATA_DIR, { recursive: true });
    const data = {
      agents: Object.fromEntries(this.state.agents),
      tools: Object.fromEntries(this.state.tools),
      skills: Object.fromEntries(this.state.skills),
      toolRequests: this.state.toolRequests,
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
    } catch {
      // corrupted — start fresh
    }
  }
}
