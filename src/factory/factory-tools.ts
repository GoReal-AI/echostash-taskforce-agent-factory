/**
 * Tools that the Factory agent uses to create and manage other agents.
 * These are ONLY available to the factory agent (the boss).
 */

import type { ToolDef } from '../core/tool-types.js';
import { Registry } from './registry.js';

export function createFactoryTools(registry: Registry): ToolDef[] {
  const createAgent: ToolDef = {
    name: 'create_agent',
    description:
      'Create a new agent in the taskforce. Define its purpose, tools, and rules.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Unique agent name' },
        description: { type: 'string', description: 'What this agent does' },
        systemPrompt: { type: 'string', description: 'System prompt defining agent behavior' },
        model: { type: 'string', description: 'Model. Default: claude-sonnet-4-5-20250929' },
        tools: { type: 'array', items: { type: 'string' }, description: 'Tool names. Default: [bash, read_file, write_file]' },
        rules: { type: 'array', items: { type: 'string' }, description: 'Rules/constraints' },
        maxTurns: { type: 'number', description: 'Max turns. Default: 50' },
      },
      required: ['name', 'description', 'systemPrompt'],
    },
    async execute(input) {
      const name = input.name as string;
      const tools = (input.tools as string[]) ?? ['bash', 'read_file', 'write_file'];

      registry.registerAgent({
        name,
        description: input.description as string,
        systemPrompt: input.systemPrompt as string,
        model: (input.model as string) ?? 'claude-sonnet-4-5-20250929',
        tools,
        rules: (input.rules as string[]) ?? [],
        maxTurns: (input.maxTurns as number) ?? 50,
      });

      return `Agent "${name}" created.\n- Tools: ${tools.join(', ')}\n- Rules: ${((input.rules as string[]) ?? []).length}`;
    },
  };

  const listAgents: ToolDef = {
    name: 'list_agents',
    description: 'List all agents in the taskforce.',
    inputSchema: { type: 'object', properties: {} },
    async execute() {
      const agents = registry.listAgents();
      if (agents.length === 0) return 'No agents registered yet.';
      return agents
        .map((a) => `- ${a.name}: ${a.description} (model: ${a.model}, tools: ${a.tools.join(', ')})`)
        .join('\n');
    },
  };

  const createSkill: ToolDef = {
    name: 'create_skill',
    description: 'Create a reusable skill — a prompt + tool combination agents can execute.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Skill name' },
        description: { type: 'string', description: 'What this skill does' },
        prompt: { type: 'string', description: 'Skill prompt' },
        tools: { type: 'array', items: { type: 'string' }, description: 'Tools for this skill' },
      },
      required: ['name', 'description', 'prompt'],
    },
    async execute(input) {
      registry.registerSkill({
        name: input.name as string,
        description: input.description as string,
        prompt: input.prompt as string,
        tools: (input.tools as string[]) ?? [],
      });
      return `Skill "${input.name}" created.`;
    },
  };

  const delegateTask: ToolDef = {
    name: 'delegate_task',
    description: 'Assign a task to an existing agent. The agent will be spawned to handle it.',
    inputSchema: {
      type: 'object',
      properties: {
        agentName: { type: 'string', description: 'Agent to delegate to' },
        task: { type: 'string', description: 'Task description' },
      },
      required: ['agentName', 'task'],
    },
    async execute(input) {
      const agentName = input.agentName as string;
      const agent = registry.getAgent(agentName);
      if (!agent) return `ERROR: Agent "${agentName}" not found. Use list_agents.`;
      return JSON.stringify({ _action: 'delegate', agent: agentName, task: input.task, definition: agent });
    },
  };

  return [createAgent, listAgents, createSkill, delegateTask];
}
