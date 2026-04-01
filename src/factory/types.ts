/**
 * Types for the agent factory.
 */

export interface AgentDefinition {
  /** Unique agent name */
  name: string;
  /** What this agent does */
  description: string;
  /** System prompt slug on Echostash (or inline prompt for local dev) */
  systemPrompt: string;
  /** LLM model to use */
  model: string;
  /** Tool names this agent has access to */
  tools: string[];
  /** Custom rules/constraints for this agent */
  rules: string[];
  /** Max turns before stopping */
  maxTurns?: number;
}

export interface ToolDefinition {
  /** Unique tool name */
  name: string;
  /** What this tool does */
  description: string;
  /** Zod schema as a JSON object (for serialization) */
  parameters: Record<string, unknown>;
  /** The implementation code (stored as string, executed in sandbox) */
  implementation: string;
}

export interface SkillDefinition {
  /** Unique skill name */
  name: string;
  /** What this skill does */
  description: string;
  /** The prompt that guides skill execution */
  prompt: string;
  /** Tools available during skill execution */
  tools: string[];
}

export interface TaskforceState {
  /** All registered agents */
  agents: Map<string, AgentDefinition>;
  /** All registered custom tools */
  tools: Map<string, ToolDefinition>;
  /** All registered skills */
  skills: Map<string, SkillDefinition>;
}
