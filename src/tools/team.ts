/**
 * Team tools — available to agents for coordination.
 *
 * - get_task_details: read-only deep dive into mission tasks
 * - request_agent: synchronous agent-to-agent delegation (requires canDelegate permission)
 */

import type { ToolDef } from '../core/tool-types.js';
import type { Registry } from '../factory/registry.js';
import { events } from '../dashboard/events.js';

type AgentExecutor = (agentName: string, task: string) => Promise<string>;

/**
 * Create team tools for a specific agent.
 * The executor is used for agent-to-agent delegation (request_agent).
 */
export function createTeamTools(
  registry: Registry,
  callerAgent: string,
  executor: AgentExecutor,
): ToolDef[] {
  const tools: ToolDef[] = [];

  // --- get_task_details: available to all agents ---
  tools.push({
    name: 'get_task_details',
    description: 'Get full details of a task from the mission board. Use when you need more context about a task beyond the status summary.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task ID (e.g. task-1712345678901)' },
      },
      required: ['taskId'],
    },
    async execute(input) {
      const taskId = input.taskId as string;

      for (const mission of registry.listMissions()) {
        const task = mission.tasks.find((t) => t.id === taskId);
        if (!task) continue;

        const age = Math.round((Date.now() - task.createdAt) / 60_000);
        const timeInProgress = task.startedAt ? Math.round((Date.now() - task.startedAt) / 60_000) : null;

        const dependencies = task.dependsOn.map((depId) => {
          const dep = mission.tasks.find((t) => t.id === depId);
          return dep
            ? { id: dep.id, title: dep.title, status: dep.status, assignedTo: dep.assignedTo }
            : { id: depId, title: 'unknown', status: 'unknown', assignedTo: null };
        });

        const dependents = mission.tasks
          .filter((t) => t.dependsOn.includes(taskId))
          .map((t) => ({ id: t.id, title: t.title, status: t.status, assignedTo: t.assignedTo }));

        return JSON.stringify({
          mission: { id: mission.id, name: mission.name, goal: mission.goal, status: mission.status, deadline: mission.deadline },
          task: { ...task, ageMinutes: age, timeInProgressMinutes: timeInProgress },
          dependencies,
          dependents,
        }, null, 2);
      }

      return `Task "${taskId}" not found on any mission board.`;
    },
  });

  // --- request_agent: synchronous agent-to-agent delegation ---
  // Only available if the caller has canDelegate permission
  const perms = registry.getPermissions(callerAgent);
  const canDelegate = perms?.communicationACL.canDelegate ?? false;

  if (canDelegate) {
    tools.push({
      name: 'request_agent',
      description: 'Ask another agent to do something and get the result back. Use this to delegate sub-tasks to specialized agents. The target agent runs synchronously and returns its output.',
      inputSchema: {
        type: 'object',
        properties: {
          agentName: { type: 'string', description: 'Which agent to ask (must be on the team roster)' },
          task: { type: 'string', description: 'What you need them to do — be specific' },
        },
        required: ['agentName', 'task'],
      },
      async execute(input) {
        const targetName = input.agentName as string;
        const task = input.task as string;

        // Verify target agent exists
        const target = registry.getAgent(targetName);
        if (!target) return `ERROR: Agent "${targetName}" not found on the team roster.`;

        // Check communication ACL — can this agent talk to the target?
        if (perms?.communicationACL.agents !== 'all') {
          const allowed = perms?.communicationACL.agents ?? [];
          if (Array.isArray(allowed) && !allowed.includes(targetName)) {
            return `ERROR: You don't have permission to communicate with "${targetName}". Ask HR to update your permissions.`;
          }
        }

        events.log('system', callerAgent, 'status', `Requesting ${targetName}`, task.slice(0, 100));
        console.log(`\n  [${callerAgent}] → requesting ${targetName}: ${task.slice(0, 100)}`);

        try {
          const result = await executor(targetName, task);
          events.log('system', callerAgent, 'status', `${targetName} responded`, result.slice(0, 100));
          console.log(`  [${callerAgent}] ← ${targetName} responded (${result.length} chars)`);
          return result;
        } catch (error: any) {
          return `ERROR: ${targetName} failed — ${error.message}`;
        }
      },
    });
  }

  return tools;
}

/** @deprecated Use createTeamTools instead */
export function createTeamTool(registry: Registry): ToolDef {
  return createTeamTools(registry, '', async () => '')[0]!;
}
