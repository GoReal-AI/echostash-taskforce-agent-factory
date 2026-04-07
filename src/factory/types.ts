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

// ---------------------------------------------------------------------------
// Org Context (Layer 1 — static team identity)
// ---------------------------------------------------------------------------

export interface OrgContext {
  /** Team name */
  name: string;
  /** What this team does */
  purpose: string;
  /** How agents work together */
  workingAgreements: string[];
  /** Global boundaries / constraints */
  boundaries: string[];
  /** Auto-updated when roster changes */
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Missions & Tasks (Layer 2 — dynamic project state)
// ---------------------------------------------------------------------------

export type TaskStatus = 'todo' | 'in-progress' | 'blocked' | 'done' | 'failed';
export type MissionStatus = 'planning' | 'active' | 'completed' | 'cancelled';

export interface MissionTask {
  /** Unique task ID (e.g. "task-1712345678901") */
  id: string;
  /** Short title */
  title: string;
  /** Full description — the deep-dive detail agents pull on demand */
  description: string;
  /** Which agent is assigned (name, or null if unassigned) */
  assignedTo: string | null;
  /** Current status */
  status: TaskStatus;
  /** IDs of tasks this depends on */
  dependsOn: string[];
  /** Timestamps */
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  /** Result summary when done */
  result?: string;
}

export interface Mission {
  /** Unique mission ID (e.g. "mission-1712345678901") */
  id: string;
  /** Mission name */
  name: string;
  /** Goal / objective */
  goal: string;
  /** Current status */
  status: MissionStatus;
  /** Deadline (epoch ms, or null) */
  deadline: number | null;
  /** Tasks within this mission */
  tasks: MissionTask[];
  /** When this mission was created */
  createdAt: number;
  /** Last update */
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// User Roles & Permissions
// ---------------------------------------------------------------------------

export type UserRole = 'admin' | 'operator' | 'user' | 'viewer';

export interface UserProfile {
  /** User identifier (e.g. "user_avi", Discord ID) */
  id: string;
  /** Display name */
  name: string;
  /** Role in the system */
  role: UserRole;
  /** Which agents this user can talk to */
  agentAccess: string[] | 'all';
}

export type TrustLevel = 'restricted' | 'standard' | 'trusted';
export type ActionGate = 'auto' | 'notify' | 'approve' | 'deny';

export interface AgentPermissions {
  /** Agent name */
  agentName: string;
  /** Trust level — affects default gates and autonomous action limits */
  trustLevel: TrustLevel;
  /** Per-tool action gates */
  actionGates: Record<string, ActionGate>;
  /** Communication access control */
  communicationACL: {
    users: string[] | 'all';
    agents: string[] | 'all' | 'none';
    canInitiate: boolean;
    canDelegate: boolean;
  };
}

export interface RuleGuard {
  /** Which tool this guard applies to */
  tool: string;
  /** What to check: path, content pattern, or custom */
  check: 'path' | 'content' | 'pattern';
  /** The condition (regex pattern, path substring, etc.) */
  condition: string;
  /** What to do when triggered */
  action: 'block' | 'approve' | 'notify';
  /** Explanation shown to the agent */
  message: string;
}

// ---------------------------------------------------------------------------
// Agent Inbox
// ---------------------------------------------------------------------------

export interface InboxMessage {
  id: string;
  from: string;
  to: string;
  thread: string;
  priority: 0 | 1 | 2 | 3;
  kind: 'request' | 'response' | 'status' | 'notification';
  content: string;
  createdAt: number;
  readAt: number | null;
  status: 'new' | 'read' | 'responded';
}

// ---------------------------------------------------------------------------
// Agent Lifecycle
// ---------------------------------------------------------------------------

export type AgentState = 'idle' | 'busy' | 'responding' | 'paused' | 'over-budget';

export interface AgentRuntimeState {
  name: string;
  state: AgentState;
  currentTask: string | null;
  currentThread: string | null;
  lastActiveAt: number;
}

// ---------------------------------------------------------------------------
// Budget Control
// ---------------------------------------------------------------------------

export interface AgentBudget {
  agentName: string;
  tokensPerHour: number;
  tokensPerDay: number;
  currentHourUsage: number;
  currentDayUsage: number;
  hourWindowStart: number;
  dayWindowStart: number;
  tier: 'normal' | 'warning' | 'throttle' | 'paused';
}

// ---------------------------------------------------------------------------
// Scheduled Tasks
// ---------------------------------------------------------------------------

export interface ScheduledTask {
  id: string;
  agentName: string;
  schedule: string;
  task: string;
  lastRun: number | null;
  nextRun: number;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export interface AuditEntry {
  agentName: string;
  tool: string;
  input: Record<string, unknown>;
  output: string;
  ruleViolation: string | null;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface TaskforceState {
  agents: Map<string, AgentDefinition>;
  tools: Map<string, ToolDefinition>;
  skills: Map<string, SkillDefinition>;
  toolRequests: ToolRequest[];
  org: OrgContext;
  missions: Map<string, Mission>;
  users: Map<string, UserProfile>;
  permissions: Map<string, AgentPermissions>;
  ruleGuards: Map<string, RuleGuard[]>;
  inboxes: Map<string, InboxMessage[]>;
  runtimes: Map<string, AgentRuntimeState>;
  budgets: Map<string, AgentBudget>;
  schedules: Map<string, ScheduledTask>;
  audit: AuditEntry[];
}
