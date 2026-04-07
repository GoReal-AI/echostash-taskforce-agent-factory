/**
 * Rule enforcement engine — pre-execution guards and post-execution audit.
 *
 * Three layers:
 *   1. Prompt rules (soft — in system prompt, agent should follow)
 *   2. Pre-execution guards (hard — blocks tool before it runs)
 *   3. Post-execution audit (detective — logs everything, flags violations)
 */

import type { Registry } from '../factory/registry.js';
import type { RuleGuard } from '../factory/types.js';

export interface GuardResult {
  allowed: boolean;
  guard?: RuleGuard;
  message?: string;
}

/**
 * Check pre-execution guards for a tool call.
 * Returns { allowed: true } if no guard blocks it.
 */
export function checkGuards(
  registry: Registry,
  agentName: string,
  toolName: string,
  input: Record<string, unknown>,
): GuardResult {
  const guards = registry.getRuleGuards(agentName);
  const toolGuards = guards.filter((g) => g.tool === toolName);

  for (const guard of toolGuards) {
    const inputStr = JSON.stringify(input);

    let triggered = false;
    switch (guard.check) {
      case 'path': {
        // Check if any string value in input contains the path
        const values = Object.values(input).filter((v) => typeof v === 'string') as string[];
        triggered = values.some((v) => v.includes(guard.condition));
        break;
      }
      case 'content': {
        triggered = inputStr.includes(guard.condition);
        break;
      }
      case 'pattern': {
        try {
          const regex = new RegExp(guard.condition, 'i');
          triggered = regex.test(inputStr);
        } catch {
          // invalid regex — skip
        }
        break;
      }
    }

    if (triggered) {
      if (guard.action === 'block') {
        return { allowed: false, guard, message: guard.message };
      }
      if (guard.action === 'notify') {
        // Notify HR but allow execution
        registry.addInboxMessage('hr', {
          id: `guard-${Date.now()}`,
          from: `agent_${agentName}`,
          to: 'hr',
          thread: `guard-${agentName}-${Date.now()}`,
          priority: 1,
          kind: 'notification',
          content: `⚠ Rule guard triggered: ${agentName}/${toolName} — ${guard.message}`,
          createdAt: Date.now(),
          readAt: null,
          status: 'new',
        });
        return { allowed: true, guard, message: guard.message };
      }
      if (guard.action === 'approve') {
        // For now, block and request approval (full approval flow in later phase)
        return { allowed: false, guard, message: `Approval required: ${guard.message}` };
      }
    }
  }

  return { allowed: true };
}

/**
 * Log a tool execution to the audit trail.
 */
export function auditToolExecution(
  registry: Registry,
  agentName: string,
  toolName: string,
  input: Record<string, unknown>,
  output: string,
  violation: string | null = null,
): void {
  registry.addAuditEntry({
    agentName,
    tool: toolName,
    input,
    output: output.slice(0, 500),
    ruleViolation: violation,
    timestamp: Date.now(),
  });
}
