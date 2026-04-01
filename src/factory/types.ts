/**
 * Types for the agent factory.
 */

export interface AgentDefinition {
  /** Unique agent name */
  name: string;
  /** What this agent does */
  description: string;
  /** System prompt (inline or Echostash slug) */
  systemPrompt: string;
  /** Personality traits */
  personality: string;
  /** LLM model to use */
  model: string;
  /** Tool names this agent has access to */
  tools: string[];
  /** Rules/constraints */
  rules: string[];
  /** Max turns before stopping */
  maxTurns: number;
  /** Discord thread ID where this agent operates */
  threadId?: string;
  /** Created by (user ID) */
  createdBy: string;
  /** Timestamp */
  createdAt: number;
}

export interface ToolDefinition {
  /** Unique tool name */
  name: string;
  /** What this tool does */
  description: string;
  /** Parameter schema as JSON Schema */
  parameters: Record<string, unknown>;
  /** Implementation code (TypeScript function body) */
  implementation: string;
  /** Which agents have this tool assigned */
  assignedTo: string[];
  /** Who created it */
  createdBy: string;
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

export interface ToolRequest {
  /** Which agent is requesting */
  agentName: string;
  /** What the agent needs */
  description: string;
  /** Why it needs it */
  reason: string;
  /** Status */
  status: 'pending' | 'approved' | 'declined';
  /** HR's response */
  response?: string;
  /** Timestamp */
  requestedAt: number;
}

export interface TaskforceState {
  agents: Map<string, AgentDefinition>;
  tools: Map<string, ToolDefinition>;
  skills: Map<string, SkillDefinition>;
  toolRequests: ToolRequest[];
}
