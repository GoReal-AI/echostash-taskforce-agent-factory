/**
 * Agent spawner — creates agents from AgentDefinitions and runs them.
 *
 * Every spawned agent gets:
 * 1. Its own Subconscious instance (context management)
 * 2. The tools defined in its AgentDefinition
 * 3. The agent loop (TAOR)
 */

import Anthropic from '@anthropic-ai/sdk';
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

/**
 * Spawn and run an agent with a task.
 */
export async function spawnAndRun(
  definition: AgentDefinition,
  task: string,
): Promise<string> {
  const client = new Anthropic();
  const subconsciousLLM = new GoogleAdapter();

  const sub = new Subconscious({
    vector: new MemoryVectorStore(),
    kv: new MemoryKVStore(),
    llm: subconsciousLLM,
    tokenBudget: 8000,
    onStatus: (event) => {
      console.log(`  [${definition.name}/sub] ${event.phase}: ${event.message}`);
    },
  });

  // Resolve tools
  const tools = definition.tools
    .map((name) => BUILT_IN_TOOLS[name])
    .filter((t): t is ToolDef => t !== undefined);

  // Build prompt with rules
  let prompt = definition.systemPrompt;
  if (definition.rules.length > 0) {
    prompt += `\n\n## Rules\n${definition.rules.map((r) => `- ${r}`).join('\n')}`;
  }

  console.log(`\n--- Spawning agent: ${definition.name} ---`);
  console.log(`Task: ${task}\n`);

  const result = await runAgentLoop(
    {
      client,
      model: definition.model,
      systemPrompt: prompt,
      tools,
      subconscious: sub,
      maxTurns: definition.maxTurns ?? 50,
      onText: (text) => console.log(`[${definition.name}] ${text}`),
      onToolUse: (name, input) => console.log(`[${definition.name}] Tool: ${name}(${JSON.stringify(input).slice(0, 100)})`),
      onStatus: (status) => console.log(`  [${definition.name}] ${status}`),
    },
    task,
  );

  console.log(`\n--- Agent ${definition.name} done ---\n`);
  return result;
}
