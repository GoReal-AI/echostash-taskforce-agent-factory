/**
 * CLI mode — talk to HR directly in the terminal.
 *
 * Same HR agent, same tools, same Subconscious. No Discord needed.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... GOOGLE_AI_API_KEY=... npx tsx src/cli.ts
 */

import Anthropic from '@anthropic-ai/sdk';
import { Subconscious, MemoryKVStore, MemoryVectorStore } from '@echostash/subconscious';
import { GoogleAdapter } from '@echostash/subconscious/llm/google';
import { Registry } from './factory/registry.js';
import { createHRTools } from './factory/factory-tools.js';
import { buildHRSystemPrompt } from './hr/system-prompt.js';
import { bashTool } from './tools/bash.js';
import { readFileTool, writeFileTool } from './tools/files.js';
import { runAgentLoop } from './core/agent-loop.js';
import { spawnAndRun } from './factory/agent-spawner.js';

async function main(): Promise<void> {
  const client = new Anthropic();
  const subconsciousLLM = new GoogleAdapter({
    apiKey: process.env.GOOGLE_AI_API_KEY ?? process.env.VERTEX_AI_API_KEY,
  });
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

  console.log('=== HR — Taskforce Agent Factory (CLI) ===');
  console.log('Create agents, build tools, delegate tasks.');
  console.log('Type "quit" to exit.\n');

  const existing = registry.listAgents();
  if (existing.length > 0) {
    console.log(`Existing agents: ${existing.map((a) => a.name).join(', ')}\n`);
  }

  const readline = await import('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  // Handle piped input (stdin closes after last line)
  let closed = false;
  rl.on('close', () => { closed = true; });

  async function handleInput(input: string): Promise<void> {
    if (!input.trim()) return;
    if (input.trim() === 'quit') {
      console.log('Bye!');
      process.exit(0);
    }

    const systemPrompt = buildHRSystemPrompt(
      registry.listAgents(),
      registry.listTools(),
      registry.listSkills(),
    );

    try {
      const result = await runAgentLoop(
        {
          client,
          model: 'claude-sonnet-4-5-20250929',
          systemPrompt,
          tools: [...hrTools, bashTool, readFileTool, writeFileTool],
          subconscious: hrSub,
          maxTurns: 15,
          onText: (text) => console.log(`\nHR: ${text}`),
          onToolUse: (name, toolInput) =>
            console.log(`  [tool] ${name}(${JSON.stringify(toolInput).slice(0, 120)})`),
          onStatus: (status) => console.log(`  ${status}`),
        },
        input,
      );

      // Handle delegation
      try {
        const parsed = JSON.parse(result);
        if (parsed._action === 'delegate' && parsed.definition) {
          console.log(`\n--- Delegating to ${parsed.agent} ---\n`);
          await spawnAndRun(parsed.definition, parsed.task);
        }
      } catch {
        // normal response
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

  // Support piped input: read all lines, process sequentially
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
