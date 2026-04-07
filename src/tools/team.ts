/**
 * Team tool — available to all agents for reading mission board details.
 *
 * Read-only. Agents can see task details on demand but cannot modify the board.
 */

import type { ToolDef } from '../core/tool-types.js';
import type { Registry } from '../factory/registry.js';

export function createTeamTool(registry: Registry): ToolDef {
  return {
    name: 'get_task_details',
    description: 'Get full details of a task from the mission board. Use when you need more context about a task beyond the status summary in your system message.',
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
          task: {
            ...task,
            ageMinutes: age,
            timeInProgressMinutes: timeInProgress,
          },
          dependencies,
          dependents,
        }, null, 2);
      }

      return `Task "${taskId}" not found on any mission board.`;
    },
  };
}
