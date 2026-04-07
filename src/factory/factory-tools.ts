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
  // Org Management
  // ---------------------------------------------------------------

  const updateOrg: ToolDef = {
    name: 'update_org',
    description: 'Update the team org context — name, purpose, working agreements, boundaries.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Team name' },
        purpose: { type: 'string', description: 'What this team does' },
        workingAgreements: { type: 'array', items: { type: 'string' }, description: 'How agents collaborate' },
        boundaries: { type: 'array', items: { type: 'string' }, description: 'Global rules/constraints' },
      },
    },
    async execute(input) {
      const updates: Record<string, unknown> = {};
      if (input.name) updates.name = input.name;
      if (input.purpose) updates.purpose = input.purpose;
      if (input.workingAgreements) updates.workingAgreements = input.workingAgreements;
      if (input.boundaries) updates.boundaries = input.boundaries;
      registry.updateOrg(updates);
      return 'Org context updated.';
    },
  };

  const viewOrg: ToolDef = {
    name: 'view_org',
    description: 'View the current org context — team info, roster, boundaries.',
    inputSchema: { type: 'object', properties: {} },
    async execute() {
      const org = registry.getOrg();
      const agents = registry.listAgents();
      const roster = agents.length > 0
        ? agents.map((a) => `  - ${a.name}: ${a.description}`).join('\n')
        : '  (no agents yet)';
      return `Team: ${org.name}\nPurpose: ${org.purpose || '(not set)'}\n\nRoster:\n${roster}\n\nWorking Agreements:\n${org.workingAgreements.map((w) => `  - ${w}`).join('\n') || '  (none)'}\n\nBoundaries:\n${org.boundaries.map((b) => `  - ${b}`).join('\n') || '  (none)'}`;
    },
  };

  // ---------------------------------------------------------------
  // Mission Management
  // ---------------------------------------------------------------

  const createMission: ToolDef = {
    name: 'create_mission',
    description: 'Create a new mission with a goal. Add tasks separately with add_task.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Mission name' },
        goal: { type: 'string', description: 'What this mission aims to achieve' },
        deadline: { type: 'string', description: 'ISO date string for deadline, or omit for no deadline' },
      },
      required: ['name', 'goal'],
    },
    async execute(input) {
      const id = `mission-${Date.now()}`;
      const deadline = input.deadline ? new Date(input.deadline as string).getTime() : null;
      registry.createMission({
        id,
        name: input.name as string,
        goal: input.goal as string,
        status: 'planning',
        deadline,
        tasks: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return `Mission "${input.name}" created (${id}). Status: planning. Use add_task to add tasks, then update_mission to set status to 'active'.`;
    },
  };

  const updateMission: ToolDef = {
    name: 'update_mission',
    description: 'Update a mission — change status, goal, or deadline.',
    inputSchema: {
      type: 'object',
      properties: {
        missionId: { type: 'string', description: 'Mission ID' },
        status: { type: 'string', description: 'New status: planning, active, completed, cancelled' },
        goal: { type: 'string', description: 'Updated goal' },
        deadline: { type: 'string', description: 'ISO date string for new deadline' },
      },
      required: ['missionId'],
    },
    async execute(input) {
      const updates: Record<string, unknown> = {};
      if (input.status) updates.status = input.status;
      if (input.goal) updates.goal = input.goal;
      if (input.deadline) updates.deadline = new Date(input.deadline as string).getTime();
      const ok = registry.updateMission(input.missionId as string, updates);
      return ok ? `Mission ${input.missionId} updated.` : `ERROR: Mission "${input.missionId}" not found.`;
    },
  };

  const addTask: ToolDef = {
    name: 'add_task',
    description: 'Add a task to a mission. Tasks can have dependencies on other tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        missionId: { type: 'string', description: 'Mission to add the task to' },
        title: { type: 'string', description: 'Short task title' },
        description: { type: 'string', description: 'Detailed task description' },
        assignedTo: { type: 'string', description: 'Agent name to assign to (optional)' },
        dependsOn: { type: 'array', items: { type: 'string' }, description: 'Task IDs this depends on (optional)' },
      },
      required: ['missionId', 'title', 'description'],
    },
    async execute(input) {
      const id = `task-${Date.now()}`;
      const deps = (input.dependsOn as string[]) ?? [];
      const status = deps.length > 0 ? 'blocked' as const : 'todo' as const;
      const ok = registry.addTask(input.missionId as string, {
        id,
        title: input.title as string,
        description: input.description as string,
        assignedTo: (input.assignedTo as string) ?? null,
        status,
        dependsOn: deps,
        createdAt: Date.now(),
        startedAt: null,
        completedAt: null,
      });
      if (!ok) return `ERROR: Mission "${input.missionId}" not found.`;
      return `Task "${input.title}" added (${id}). Status: ${status}. Assigned to: ${(input.assignedTo as string) || 'unassigned'}.`;
    },
  };

  const updateTaskStatus: ToolDef = {
    name: 'update_task_status',
    description: 'Update a task status. Timestamps are set automatically. Dependent tasks auto-unblock when this task is done.',
    inputSchema: {
      type: 'object',
      properties: {
        missionId: { type: 'string', description: 'Mission ID' },
        taskId: { type: 'string', description: 'Task ID' },
        status: { type: 'string', description: 'New status: todo, in-progress, blocked, done, failed' },
        assignedTo: { type: 'string', description: 'Reassign to a different agent (optional)' },
        result: { type: 'string', description: 'Result summary (when marking done)' },
      },
      required: ['missionId', 'taskId', 'status'],
    },
    async execute(input) {
      const updates: Record<string, unknown> = { status: input.status };
      if (input.assignedTo) updates.assignedTo = input.assignedTo;
      if (input.result) updates.result = input.result;
      const ok = registry.updateTask(input.missionId as string, input.taskId as string, updates);
      return ok ? `Task ${input.taskId} → ${input.status}.` : `ERROR: Mission or task not found.`;
    },
  };

  const viewMissionBoard: ToolDef = {
    name: 'view_mission_board',
    description: 'View the mission board — all missions or a specific one with task details.',
    inputSchema: {
      type: 'object',
      properties: {
        missionId: { type: 'string', description: 'Optional: specific mission ID. Omit for all.' },
      },
    },
    async execute(input) {
      const missions = input.missionId
        ? [registry.getMission(input.missionId as string)].filter(Boolean)
        : registry.listMissions();

      if (missions.length === 0) return 'No missions. Use create_mission to start one.';

      return missions.map((m) => {
        if (!m) return '';
        const taskLines = m.tasks.map((t) => {
          const assigned = t.assignedTo ? `@${t.assignedTo}` : 'unassigned';
          const deps = t.dependsOn.length > 0 ? ` | depends: ${t.dependsOn.join(', ')}` : '';
          const result = t.result ? ` | result: ${t.result.slice(0, 100)}` : '';
          return `  [${t.status}] ${t.id}: ${t.title} (${assigned}${deps}${result})`;
        }).join('\n');
        const done = m.tasks.filter((t) => t.status === 'done').length;
        const deadlineStr = m.deadline ? `Deadline: ${new Date(m.deadline).toISOString().split('T')[0]}` : 'No deadline';
        return `**${m.name}** [${m.status}] — ${m.id}\n  Goal: ${m.goal}\n  ${deadlineStr} | ${done}/${m.tasks.length} done\n${taskLines}`;
      }).join('\n\n');
    },
  };

  // ---------------------------------------------------------------
  // Task Delegation
  // ---------------------------------------------------------------

  const delegateTask: ToolDef = {
    name: 'delegate_task',
    description: 'Assign a task to an agent. Optionally link to a mission task to track status automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        agentName: { type: 'string', description: 'Agent to delegate to' },
        task: { type: 'string', description: 'Task description' },
        missionId: { type: 'string', description: 'Optional: mission ID to link this delegation to' },
        taskId: { type: 'string', description: 'Optional: task ID on the mission board to auto-track' },
      },
      required: ['agentName', 'task'],
    },
    async execute(input) {
      const agent = registry.getAgent(input.agentName as string);
      if (!agent) return `ERROR: Agent "${input.agentName}" not found. Use list_agents.`;

      const missionId = input.missionId as string | undefined;
      const taskId = input.taskId as string | undefined;

      // Auto-mark mission task as in-progress
      if (missionId && taskId) {
        registry.updateTask(missionId, taskId, {
          status: 'in-progress',
          assignedTo: input.agentName as string,
        });
      }

      return JSON.stringify({
        _action: 'delegate',
        agent: input.agentName,
        task: input.task,
        definition: agent,
        missionId: missionId ?? null,
        taskId: taskId ?? null,
      });
    },
  };

  // ---------------------------------------------------------------
  // User Roles & Permissions
  // ---------------------------------------------------------------

  const setUserRole: ToolDef = {
    name: 'set_user_role',
    description: 'Set a user role and agent access. Roles: admin, operator, user, viewer.',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID (e.g. Discord ID or user_name)' },
        name: { type: 'string', description: 'Display name' },
        role: { type: 'string', description: 'Role: admin, operator, user, viewer' },
        agentAccess: { description: 'Agent names array, or "all"' },
      },
      required: ['userId', 'name', 'role'],
    },
    async execute(input) {
      registry.setUser({
        id: input.userId as string,
        name: input.name as string,
        role: input.role as 'admin' | 'operator' | 'user' | 'viewer',
        agentAccess: (input.agentAccess as string[] | 'all') ?? 'all',
      });
      return `User "${input.name}" set to role "${input.role}".`;
    },
  };

  const setAgentPermissions: ToolDef = {
    name: 'set_agent_permissions',
    description: 'Set permissions for an agent — trust level, action gates, communication ACL.',
    inputSchema: {
      type: 'object',
      properties: {
        agentName: { type: 'string', description: 'Agent name' },
        trustLevel: { type: 'string', description: 'Trust level: restricted, standard, trusted' },
        actionGates: { type: 'object', description: 'Map of tool name → gate (auto/notify/approve/deny)' },
        canTalkToUsers: { description: 'User IDs array or "all"' },
        canTalkToAgents: { description: 'Agent names array, "all", or "none"' },
        canInitiate: { type: 'boolean', description: 'Can start conversations?' },
        canDelegate: { type: 'boolean', description: 'Can request delegation to other agents?' },
      },
      required: ['agentName', 'trustLevel'],
    },
    async execute(input) {
      registry.setPermissions({
        agentName: input.agentName as string,
        trustLevel: input.trustLevel as 'restricted' | 'standard' | 'trusted',
        actionGates: (input.actionGates as Record<string, 'auto' | 'notify' | 'approve' | 'deny'>) ?? {},
        communicationACL: {
          users: (input.canTalkToUsers as string[] | 'all') ?? 'all',
          agents: (input.canTalkToAgents as string[] | 'all' | 'none') ?? 'all',
          canInitiate: (input.canInitiate as boolean) ?? true,
          canDelegate: (input.canDelegate as boolean) ?? false,
        },
      });
      return `Permissions set for "${input.agentName}" (trust: ${input.trustLevel}).`;
    },
  };

  const addRuleGuard: ToolDef = {
    name: 'add_rule_guard',
    description: 'Add a pre-execution rule guard to an agent. Guards check tool inputs before execution.',
    inputSchema: {
      type: 'object',
      properties: {
        agentName: { type: 'string', description: 'Agent to add guard to' },
        tool: { type: 'string', description: 'Tool name the guard applies to (e.g. bash, write_file)' },
        check: { type: 'string', description: 'What to check: path, content, pattern' },
        condition: { type: 'string', description: 'The condition — regex pattern, path substring, etc.' },
        action: { type: 'string', description: 'What to do when triggered: block, approve, notify' },
        message: { type: 'string', description: 'Message shown to agent when triggered' },
      },
      required: ['agentName', 'tool', 'check', 'condition', 'action', 'message'],
    },
    async execute(input) {
      registry.addRuleGuard(input.agentName as string, {
        tool: input.tool as string,
        check: input.check as 'path' | 'content' | 'pattern',
        condition: input.condition as string,
        action: input.action as 'block' | 'approve' | 'notify',
        message: input.message as string,
      });
      return `Rule guard added: ${input.tool} → ${input.check}(${input.condition}) → ${input.action}.`;
    },
  };

  // ---------------------------------------------------------------
  // Inbox
  // ---------------------------------------------------------------

  const sendMessage: ToolDef = {
    name: 'send_message',
    description: 'Send a message to an agent inbox.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Agent name' },
        content: { type: 'string', description: 'Message content' },
        priority: { type: 'number', description: 'Priority: 0=user, 1=HR, 2=agent, 3=system. Default: 1' },
        kind: { type: 'string', description: 'Kind: request, response, status, notification. Default: notification' },
      },
      required: ['to', 'content'],
    },
    async execute(input) {
      registry.addInboxMessage(input.to as string, {
        id: `msg-${Date.now()}`,
        from: 'hr',
        to: input.to as string,
        thread: `hr-${Date.now()}`,
        priority: ((input.priority as number) ?? 1) as 0 | 1 | 2 | 3,
        kind: (input.kind as 'request' | 'response' | 'status' | 'notification') ?? 'notification',
        content: input.content as string,
        createdAt: Date.now(),
        readAt: null,
        status: 'new',
      });
      return `Message sent to ${input.to}.`;
    },
  };

  const viewAgentInbox: ToolDef = {
    name: 'view_agent_inbox',
    description: 'View an agent inbox — unread messages.',
    inputSchema: {
      type: 'object',
      properties: { agentName: { type: 'string', description: 'Agent name' } },
      required: ['agentName'],
    },
    async execute(input) {
      const msgs = registry.getUnreadInbox(input.agentName as string);
      if (msgs.length === 0) return `No unread messages for ${input.agentName}.`;
      return msgs.map((m) => `[P${m.priority}] ${m.from}: ${m.content.slice(0, 200)} (${m.kind})`).join('\n');
    },
  };

  // ---------------------------------------------------------------
  // Budget
  // ---------------------------------------------------------------

  const setAgentBudget: ToolDef = {
    name: 'set_agent_budget',
    description: 'Set token budget for an agent — hourly and daily limits.',
    inputSchema: {
      type: 'object',
      properties: {
        agentName: { type: 'string', description: 'Agent name' },
        tokensPerHour: { type: 'number', description: 'Hourly token ceiling' },
        tokensPerDay: { type: 'number', description: 'Daily token ceiling' },
      },
      required: ['agentName', 'tokensPerHour', 'tokensPerDay'],
    },
    async execute(input) {
      registry.setBudget({
        agentName: input.agentName as string,
        tokensPerHour: input.tokensPerHour as number,
        tokensPerDay: input.tokensPerDay as number,
        currentHourUsage: 0,
        currentDayUsage: 0,
        hourWindowStart: Date.now(),
        dayWindowStart: Date.now(),
        tier: 'normal',
      });
      return `Budget set for ${input.agentName}: ${input.tokensPerHour} tokens/hr, ${input.tokensPerDay} tokens/day.`;
    },
  };

  const viewBudgets: ToolDef = {
    name: 'view_budgets',
    description: 'View token budget status for all agents.',
    inputSchema: { type: 'object', properties: {} },
    async execute() {
      const agents = registry.listAgents();
      const lines = agents.map((a) => {
        const b = registry.getBudget(a.name);
        if (!b) return `- ${a.name}: no budget set`;
        const hourPct = Math.round((b.currentHourUsage / b.tokensPerHour) * 100);
        const dayPct = Math.round((b.currentDayUsage / b.tokensPerDay) * 100);
        return `- ${a.name}: [${b.tier}] hour: ${b.currentHourUsage}/${b.tokensPerHour} (${hourPct}%) | day: ${b.currentDayUsage}/${b.tokensPerDay} (${dayPct}%)`;
      });
      return lines.join('\n') || 'No agents.';
    },
  };

  // ---------------------------------------------------------------
  // Schedules
  // ---------------------------------------------------------------

  const addScheduledTask: ToolDef = {
    name: 'add_scheduled_task',
    description: 'Add a scheduled/recurring task for an agent (cron-like).',
    inputSchema: {
      type: 'object',
      properties: {
        agentName: { type: 'string', description: 'Agent to assign' },
        schedule: { type: 'string', description: 'Schedule: "every 30m", "every 1h", "daily at 09:00"' },
        task: { type: 'string', description: 'What the agent should do on schedule' },
      },
      required: ['agentName', 'schedule', 'task'],
    },
    async execute(input) {
      const id = `sched-${Date.now()}`;
      const intervalMs = parseScheduleToMs(input.schedule as string);
      registry.addSchedule({
        id,
        agentName: input.agentName as string,
        schedule: input.schedule as string,
        task: input.task as string,
        lastRun: null,
        nextRun: Date.now() + intervalMs,
        enabled: true,
      });
      return `Scheduled task ${id}: ${input.agentName} will "${input.task}" ${input.schedule}.`;
    },
  };

  // ---------------------------------------------------------------
  // Audit
  // ---------------------------------------------------------------

  const viewAudit: ToolDef = {
    name: 'view_audit',
    description: 'View audit trail — recent tool executions and rule violations.',
    inputSchema: {
      type: 'object',
      properties: {
        agentName: { type: 'string', description: 'Optional: filter by agent' },
        violationsOnly: { type: 'boolean', description: 'Only show rule violations' },
      },
    },
    async execute(input) {
      const entries = input.violationsOnly
        ? registry.getViolations(input.agentName as string | undefined)
        : registry.getAudit(input.agentName as string | undefined, 30);
      if (entries.length === 0) return 'No audit entries.';
      return entries.map((e) => {
        const violation = e.ruleViolation ? ` ⚠ VIOLATION: ${e.ruleViolation}` : '';
        return `[${new Date(e.timestamp).toISOString()}] ${e.agentName}/${e.tool}${violation}`;
      }).join('\n');
    },
  };

  return [
    createAgent, listAgents, updateAgentRules, removeAgent,
    createTool, assignTool, revokeTool, listTools,
    reviewToolRequests,
    createSkill,
    updateOrg, viewOrg,
    createMission, updateMission, addTask, updateTaskStatus, viewMissionBoard,
    setUserRole, setAgentPermissions, addRuleGuard,
    sendMessage, viewAgentInbox,
    setAgentBudget, viewBudgets,
    addScheduledTask,
    viewAudit,
    delegateTask,
  ];
}

/** Parse simple schedule strings to milliseconds. */
function parseScheduleToMs(schedule: string): number {
  const match = schedule.match(/every\s+(\d+)\s*(m|min|h|hr|hour|d|day)/i);
  if (match) {
    const val = parseInt(match[1]!);
    const unit = match[2]!.toLowerCase();
    if (unit.startsWith('m')) return val * 60_000;
    if (unit.startsWith('h')) return val * 3_600_000;
    if (unit.startsWith('d')) return val * 86_400_000;
  }
  // Default: 1 hour
  return 3_600_000;
}
