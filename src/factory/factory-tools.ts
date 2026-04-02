/**
 * HR's tools — the full suite for managing the taskforce.
 *
 * Only HR has these. Agents never get access to factory tools.
 */

import type { ToolDef } from '../core/tool-types.js';
import { Registry } from './registry.js';

export function createHRTools(registry: Registry): ToolDef[] {
  // ---------------------------------------------------------------
  // Agent Management
  // ---------------------------------------------------------------

  const createAgent: ToolDef = {
    name: 'create_agent',
    description: 'Create a new agent in the taskforce with personality, role, tools, and rules.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Unique agent name (lowercase, hyphens)' },
        description: { type: 'string', description: 'What this agent does' },
        personality: { type: 'string', description: 'Personality traits (e.g. "professional, concise, technical")' },
        systemPrompt: { type: 'string', description: 'Detailed system prompt defining agent behavior, role, and expertise' },
        model: { type: 'string', description: 'Model. Default: gemini-3.1-pro-preview' },
        tools: { type: 'array', items: { type: 'string' }, description: 'Tool names. Always includes: bash, read_file, write_file' },
        rules: { type: 'array', items: { type: 'string' }, description: 'Rules and constraints' },
        maxTurns: { type: 'number', description: 'Max turns. Default: 50' },
      },
      required: ['name', 'description', 'personality', 'systemPrompt'],
    },
    async execute(input) {
      const name = input.name as string;
      const baseTools = ['bash', 'read_file', 'write_file'];
      const extraTools = (input.tools as string[]) ?? [];
      const allTools = [...new Set([...baseTools, ...extraTools])];

      registry.registerAgent({
        name,
        description: input.description as string,
        personality: input.personality as string,
        systemPrompt: input.systemPrompt as string,
        model: (input.model as string) ?? 'gemini-3.1-pro-preview',
        tools: allTools,
        rules: (input.rules as string[]) ?? [],
        maxTurns: (input.maxTurns as number) ?? 50,
        createdBy: 'hr',
        createdAt: Date.now(),
      });

      return `Agent "${name}" created successfully.\n\nProfile:\n- Personality: ${input.personality}\n- Tools: ${allTools.join(', ')}\n- Rules: ${((input.rules as string[]) ?? []).length} rules\n- Model: ${(input.model as string) ?? 'claude-sonnet-4-5'}`;
    },
  };

  const listAgents: ToolDef = {
    name: 'list_agents',
    description: 'List all agents in the taskforce with their roles and tools.',
    inputSchema: { type: 'object', properties: {} },
    async execute() {
      const agents = registry.listAgents();
      if (agents.length === 0) return 'No agents in the taskforce yet.';
      return agents.map((a) =>
        `**${a.name}**\n  Role: ${a.description}\n  Personality: ${a.personality}\n  Tools: ${a.tools.join(', ')}\n  Rules: ${a.rules.length}\n  Model: ${a.model}`
      ).join('\n\n');
    },
  };

  const updateAgentRules: ToolDef = {
    name: 'update_agent_rules',
    description: 'Update the rules for an existing agent.',
    inputSchema: {
      type: 'object',
      properties: {
        agentName: { type: 'string', description: 'Agent name' },
        rules: { type: 'array', items: { type: 'string' }, description: 'New rules (replaces existing)' },
      },
      required: ['agentName', 'rules'],
    },
    async execute(input) {
      const ok = registry.updateAgent(input.agentName as string, { rules: input.rules as string[] });
      if (!ok) return `ERROR: Agent "${input.agentName}" not found.`;
      return `Rules updated for "${input.agentName}". ${(input.rules as string[]).length} rules set.`;
    },
  };

  const removeAgent: ToolDef = {
    name: 'remove_agent',
    description: 'Remove an agent from the taskforce.',
    inputSchema: {
      type: 'object',
      properties: { agentName: { type: 'string', description: 'Agent name to remove' } },
      required: ['agentName'],
    },
    async execute(input) {
      const ok = registry.removeAgent(input.agentName as string);
      return ok ? `Agent "${input.agentName}" removed.` : `ERROR: Agent "${input.agentName}" not found.`;
    },
  };

  // ---------------------------------------------------------------
  // Tool Management (HR exclusive)
  // ---------------------------------------------------------------

  const createTool: ToolDef = {
    name: 'create_tool',
    description: 'Create a new custom tool. Only HR can do this. The tool can then be assigned to agents.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Unique tool name' },
        description: { type: 'string', description: 'What this tool does' },
        parameters: { type: 'object', description: 'JSON Schema for the tool parameters' },
        implementation: { type: 'string', description: 'TypeScript async function body. Receives `input` object. Must return a string.' },
      },
      required: ['name', 'description', 'parameters', 'implementation'],
    },
    async execute(input) {
      registry.registerTool({
        name: input.name as string,
        description: input.description as string,
        parameters: input.parameters as Record<string, unknown>,
        implementation: input.implementation as string,
        assignedTo: [],
        createdBy: 'hr',
      });
      return `Tool "${input.name}" created. Not yet assigned to any agent. Use assign_tool to give it to an agent.`;
    },
  };

  const assignTool: ToolDef = {
    name: 'assign_tool',
    description: 'Assign a tool to an agent. Only HR can do this.',
    inputSchema: {
      type: 'object',
      properties: {
        toolName: { type: 'string', description: 'Tool to assign' },
        agentName: { type: 'string', description: 'Agent to receive the tool' },
      },
      required: ['toolName', 'agentName'],
    },
    async execute(input) {
      const ok = registry.assignToolToAgent(input.toolName as string, input.agentName as string);
      if (!ok) return `ERROR: Tool "${input.toolName}" or agent "${input.agentName}" not found.`;
      return `Tool "${input.toolName}" assigned to agent "${input.agentName}".`;
    },
  };

  const revokeTool: ToolDef = {
    name: 'revoke_tool',
    description: 'Remove a tool from an agent.',
    inputSchema: {
      type: 'object',
      properties: {
        toolName: { type: 'string', description: 'Tool to revoke' },
        agentName: { type: 'string', description: 'Agent to revoke from' },
      },
      required: ['toolName', 'agentName'],
    },
    async execute(input) {
      const ok = registry.removeToolFromAgent(input.toolName as string, input.agentName as string);
      if (!ok) return `ERROR: Tool or agent not found.`;
      return `Tool "${input.toolName}" revoked from "${input.agentName}".`;
    },
  };

  const listTools: ToolDef = {
    name: 'list_tools',
    description: 'List all custom tools and their assignments.',
    inputSchema: { type: 'object', properties: {} },
    async execute() {
      const tools = registry.listTools();
      if (tools.length === 0) return 'No custom tools yet. Built-in tools: bash, read_file, write_file.';
      return 'Built-in: bash, read_file, write_file\n\nCustom:\n' +
        tools.map((t) => `- **${t.name}**: ${t.description} (assigned to: ${t.assignedTo.join(', ') || 'nobody'})`).join('\n');
    },
  };

  // ---------------------------------------------------------------
  // Tool Requests (from agents)
  // ---------------------------------------------------------------

  const reviewToolRequests: ToolDef = {
    name: 'review_tool_requests',
    description: 'Review pending tool requests from agents.',
    inputSchema: { type: 'object', properties: {} },
    async execute() {
      const pending = registry.getPendingRequests();
      if (pending.length === 0) return 'No pending tool requests.';
      return pending.map((r, i) =>
        `[${i}] Agent "${r.agentName}" requests: ${r.description}\n    Reason: ${r.reason}`
      ).join('\n\n');
    },
  };

  // ---------------------------------------------------------------
  // Skills
  // ---------------------------------------------------------------

  const createSkill: ToolDef = {
    name: 'create_skill',
    description: 'Create a reusable skill agents can execute.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Skill name' },
        description: { type: 'string', description: 'What this skill does' },
        prompt: { type: 'string', description: 'Skill execution prompt' },
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

  // ---------------------------------------------------------------
  // Task Delegation
  // ---------------------------------------------------------------

  const delegateTask: ToolDef = {
    name: 'delegate_task',
    description: 'Assign a task to an agent. The agent will be spawned in its own thread.',
    inputSchema: {
      type: 'object',
      properties: {
        agentName: { type: 'string', description: 'Agent to delegate to' },
        task: { type: 'string', description: 'Task description' },
      },
      required: ['agentName', 'task'],
    },
    async execute(input) {
      const agent = registry.getAgent(input.agentName as string);
      if (!agent) return `ERROR: Agent "${input.agentName}" not found. Use list_agents.`;
      return JSON.stringify({
        _action: 'delegate',
        agent: input.agentName,
        task: input.task,
        definition: agent,
      });
    },
  };

  return [
    createAgent, listAgents, updateAgentRules, removeAgent,
    createTool, assignTool, revokeTool, listTools,
    reviewToolRequests,
    createSkill,
    delegateTask,
  ];
}
