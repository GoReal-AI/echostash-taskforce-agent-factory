/**
 * Agent spawner — creates and runs agents from AgentDefinitions.
 * All Gemini, no Anthropic.
 */

import { Subconscious, MemoryKVStore, MemoryVectorStore } from '@echostash/subconscious';
import { GoogleAdapter } from '@echostash/subconscious/llm/google';
import type { AgentDefinition } from './types.js';
import type { ToolDef } from '../core/tool-types.js';
import { runAgentLoop } from '../core/agent-loop.js';
import { bashTool } from '../tools/bash.js';
import { readFileTool, writeFileTool } from '../tools/files.js';

const BUILT_IN_TOOLS: Record<string, ToolDef> = {
  bash: bashTool,
  read_file: readFileTool,
  write_file: writeFileTool,
};

const GOOGLE_API_KEY = process.env.GOOGLE_AI_API_KEY ?? process.env.VERTEX_AI_API_KEY ?? '';

export async function spawnAndRun(
  definition: AgentDefinition,
  task: string,
): Promise<string> {
  const subconsciousLLM = new GoogleAdapter({ apiKey: GOOGLE_API_KEY, model: 'gemini-3-flash-preview' });

  const sub = new Subconscious({
    vector: new MemoryVectorStore(),
    kv: new MemoryKVStore(),
    llm: subconsciousLLM,
    tokenBudget: 8000,
    onStatus: (event) => {
      console.log(`  [${definition.name}/sub] ${event.phase}: ${event.message}`);
    },
  });

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

  const result = await runAgentLoop(
    {
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
