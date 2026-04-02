/**
 * CLI mode — talk to HR directly in the terminal.
 *
 * Usage:
 *   GOOGLE_AI_API_KEY=... npx tsx src/cli.ts
 */

import { Subconscious, MemoryKVStore, MemoryVectorStore } from '@echostash/subconscious';
import { GoogleAdapter } from '@echostash/subconscious/llm/google';
import { Registry } from './factory/registry.js';
import { createHRTools } from './factory/factory-tools.js';
import { buildHRSystemPrompt } from './hr/system-prompt.js';
import { bashTool } from './tools/bash.js';
import { readFileTool, writeFileTool } from './tools/files.js';
import { runAgentLoop } from './core/agent-loop.js';
import { spawnAndRun } from './factory/agent-spawner.js';
import type { AgentDefinition } from './factory/types.js';

const GOOGLE_API_KEY = process.env.GOOGLE_AI_API_KEY ?? process.env.VERTEX_AI_API_KEY ?? '';

async function main(): Promise<void> {
  if (!GOOGLE_API_KEY) {
    console.error('Required: GOOGLE_AI_API_KEY or VERTEX_AI_API_KEY');
    process.exit(1);
  }

  const subconsciousLLM = new GoogleAdapter({ apiKey: GOOGLE_API_KEY, model: 'gemini-3-flash-preview' });
  const registry = new Registry();
  const hrTools = createHRTools(registry);

  const hrSub = new Subconscious({
    vector: new MemoryVectorStore(),
    kv: new MemoryKVStore(),
    llm: subconsciousLLM,
    tokenBudget: 12000,
    onStatus: (event) => {
      console.log(`  [hr/sub] ${event.phase}: ${event.message}`);
    },
  });

  // Track pending delegations — intercepted from tool results
  let pendingDelegation: { agent: string; task: string; definition: AgentDefinition } | null = null;

  // Wrap delegate_task to capture the delegation before it goes back to Gemini
  const wrappedHRTools = hrTools.map((tool) => {
    if (tool.name !== 'delegate_task') return tool;
    return {
      ...tool,
      async execute(input: Record<string, unknown>): Promise<string> {
        const result = await tool.execute(input);
        try {
          const parsed = JSON.parse(result);
          if (parsed._action === 'delegate') {
            pendingDelegation = parsed;
          }
        } catch { /* not a delegation */ }
        return result;
      },
    };
  });

  console.log('=== HR — Taskforce Agent Factory (CLI) ===');
  console.log('Models: Gemini 3.1 Pro (HR) | Gemini 3 Flash (Subconscious)');
  console.log('Type "quit" to exit.\n');

  const existing = registry.listAgents();
  if (existing.length > 0) {
    console.log(`Existing agents: ${existing.map((a) => a.name).join(', ')}\n`);
  }

  const readline = await import('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  let closed = false;
  rl.on('close', () => { closed = true; });

  async function handleInput(input: string): Promise<void> {
    if (!input.trim()) return;
    if (input.trim() === 'quit') {
      console.log('Bye!');
      process.exit(0);
    }

    pendingDelegation = null;

    const systemPrompt = buildHRSystemPrompt(
      registry.listAgents(),
      registry.listTools(),
      registry.listSkills(),
    );

    try {
      await runAgentLoop(
        {
          apiKey: GOOGLE_API_KEY,
          model: 'gemini-3.1-pro-preview',
          systemPrompt,
          tools: [...wrappedHRTools, bashTool, readFileTool, writeFileTool],
          subconscious: hrSub,
          maxTurns: 15,
          onText: (text) => console.log(`\nHR: ${text}`),
          onToolUse: (name, toolInput) =>
            console.log(`  [tool] ${name}(${JSON.stringify(toolInput).slice(0, 120)})`),
          onStatus: (status) => console.log(`  ${status}`),
        },
        input,
      );

      // After HR finishes, check if a delegation was intercepted
      if (pendingDelegation) {
        const { agent, task, definition } = pendingDelegation;
        console.log(`\n${'='.repeat(60)}`);
        console.log(`  Spawning agent: ${agent}`);
        console.log(`  Task: ${task}`);
        console.log(`${'='.repeat(60)}\n`);
        await spawnAndRun(definition, task);
        console.log(`\n${'='.repeat(60)}`);
        console.log(`  Agent ${agent} finished.`);
        console.log(`${'='.repeat(60)}`);
        pendingDelegation = null;
      }
    } catch (error: any) {
      console.error(`\nError: ${error.message}`);
    }
  }

  const prompt = (): void => {
    if (closed) return;
    rl.question('\nYou: ', async (input: string) => {
      await handleInput(input);
      prompt();
    });
  };

  if (!process.stdin.isTTY) {
    const lines: string[] = [];
    rl.on('line', (line) => lines.push(line));
    rl.on('close', async () => {
      const fullInput = lines.join('\n').trim();
      if (fullInput) await handleInput(fullInput);
      process.exit(0);
    });
  } else {
    prompt();
  }
}

main().catch(console.error);
