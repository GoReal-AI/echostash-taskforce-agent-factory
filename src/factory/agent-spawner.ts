/**
 * Agent spawner — creates and runs agents from AgentDefinitions.
 *
 * IMPORTANT: Each agent gets ONE Subconscious that persists across
 * all delegations. The second time you delegate to the same agent,
 * it remembers everything from the first time.
 */

import { Subconscious, MemoryKVStore, MemoryVectorStore } from '@echostash/subconscious';
import { GoogleAdapter } from '@echostash/subconscious/llm/google';
import type { AgentDefinition } from './types.js';
import type { ToolDef } from '../core/tool-types.js';
import { runAgentLoop } from '../core/agent-loop.js';
import { bashTool } from '../tools/bash.js';
import { readFileTool, writeFileTool } from '../tools/files.js';
import { events } from '../dashboard/events.js';

const BUILT_IN_TOOLS: Record<string, ToolDef> = {
  bash: bashTool,
  read_file: readFileTool,
  write_file: writeFileTool,
};

const GOOGLE_API_KEY = process.env.GOOGLE_AI_API_KEY ?? process.env.VERTEX_AI_API_KEY ?? '';
const ECHOSTASH_API_KEY = process.env.ECHOSTASH_API_KEY ?? '';
const ECHOSTASH_BASE_URL = process.env.ECHOSTASH_BASE_URL ?? 'https://api.echostash.app';

/** Persistent Subconscious instances — one per agent, survives across spawns */
const agentMemory = new Map<string, Subconscious>();

function getOrCreateSubconscious(agentName: string): Subconscious {
  let sub = agentMemory.get(agentName);
  if (sub) {
    events.log('subconscious', agentName, 'sub', 'Reconnected', 'Reusing existing memory from previous tasks');
    return sub;
  }

  const subconsciousLLM = new GoogleAdapter({ apiKey: GOOGLE_API_KEY, model: 'gemini-3-flash-preview' });
  sub = new Subconscious({
    vector: new MemoryVectorStore(),
    kv: new MemoryKVStore(),
    llm: subconsciousLLM,
    sessionId: `agent-${agentName}`,
    tokenBudget: 8000,
    echostash: ECHOSTASH_API_KEY ? { baseUrl: ECHOSTASH_BASE_URL, apiKey: ECHOSTASH_API_KEY } : undefined,
    onStatus: (event) => {
      console.log(`  [${agentName}/sub] ${event.phase}: ${event.message}`);
      events.log('subconscious', agentName, 'sub', event.phase, event.message);
    },
  });

  agentMemory.set(agentName, sub);
  events.log('subconscious', agentName, 'sub', 'Created', 'New Subconscious instance');
  return sub;
}

export async function spawnAndRun(
  definition: AgentDefinition,
  task: string,
): Promise<string> {
  const sub = getOrCreateSubconscious(definition.name);

  const tools = definition.tools
    .map((name) => BUILT_IN_TOOLS[name])
    .filter((t): t is ToolDef => t !== undefined);

  let prompt = definition.systemPrompt;
  if (definition.rules.length > 0) {
    prompt += `\n\n## Rules\n${definition.rules.map((r) => `- ${r}`).join('\n')}`;
  }

  console.log(`\n--- Spawning agent: ${definition.name} ---`);
  console.log(`Model: ${definition.model}`);
  console.log(`Task: ${task}\n`);
  events.log('system', definition.name, 'status', 'Agent spawned', `Task: ${task.slice(0, 100)}`);

  const result = await runAgentLoop(
    {
      agentName: definition.name,
      apiKey: GOOGLE_API_KEY,
      model: definition.model,
      systemPrompt: prompt,
      tools,
      subconscious: sub,
      maxTurns: definition.maxTurns,
      onText: (text) => console.log(`[${definition.name}] ${text}`),
      onToolUse: (name) => console.log(`  [${definition.name}/tool] ${name}`),
      onStatus: (status) => console.log(`  [${definition.name}] ${status}`),
    },
    task,
  );

  console.log(`\n--- Agent ${definition.name} done ---\n`);
  return result;
}
