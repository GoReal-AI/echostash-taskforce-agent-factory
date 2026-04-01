/**
 * Tool definition for the agent loop.
 */

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<string>;
}
