/**
 * Agent, tool, and skill registry.
 *
 * The factory agent manages this registry. It creates, lists,
 * and retrieves agents/tools/skills. Persisted to disk as JSON.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { AgentDefinition, ToolDefinition, SkillDefinition, TaskforceState } from './types.js';

const DATA_DIR = process.env.TASKFORCE_DATA_DIR ?? '.taskforce/data';

export class Registry {
  private state: TaskforceState = {
    agents: new Map(),
    tools: new Map(),
    skills: new Map(),
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

  // --- Persistence ---

  private save(): void {
    mkdirSync(DATA_DIR, { recursive: true });

    const data = {
      agents: Object.fromEntries(this.state.agents),
      tools: Object.fromEntries(this.state.tools),
      skills: Object.fromEntries(this.state.skills),
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
    } catch {
      // Corrupted file — start fresh
    }
  }
}
