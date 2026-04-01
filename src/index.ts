/**
 * Echostash Taskforce Agent Factory
 *
 * The Factory is the main agent. It:
 * - Creates agents, tools, skills on demand
 * - Delegates tasks to the right agent
 * - Uses the Subconscious for its own context management
 *
 * Every agent it creates runs:
 * - A lightweight TAOR loop (Think, Act, Observe, Repeat)
 * - The Echostash Subconscious for context management
 * - Echostash for prompt management (when connected)
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... OPENAI_API_KEY=... npx tsx src/index.ts
 */

import Anthropic from '@anthropic-ai/sdk';
import { Subconscious, MemoryKVStore, MemoryVectorStore } from '@echostash/subconscious';
import { GoogleAdapter } from '@echostash/subconscious/llm/google';
import { Registry } from './factory/registry.js';
import { createFactoryTools } from './factory/factory-tools.js';
import { spawnAndRun } from './factory/agent-spawner.js';
import { bashTool } from './tools/bash.js';
import { readFileTool, writeFileTool } from './tools/files.js';
import { runAgentLoop } from './core/agent-loop.js';

// TODO: Replace with Echostash-managed prompt
const FACTORY_SYSTEM_PROMPT = `You are the Taskforce Factory — an AI agent that builds and manages other AI agents.

## What You Can Do

1. **Create agents** — Build specialized agents with custom system prompts, tools, and rules
2. **Create skills** — Build reusable prompt+tool combinations
3. **Delegate tasks** — Assign tasks to agents in your taskforce
4. **Use bash** — You have full shell access

## How to Create an Agent

When the user wants a new agent:
1. Understand what the agent should do
2. Write a clear, detailed system prompt
3. Choose tools (bash, read_file, write_file, or custom)
4. Set rules if needed
5. Use create_agent to register it

## How to Delegate

When the user wants something done:
1. Check if an existing agent handles it (list_agents)
2. If yes, delegate with delegate_task
3. If no, create the right agent first, then delegate

## Your Role

You are the factory — the boss. For actual tasks, delegate to the right agent.
Think: "Which agent should handle this? Do I need to create one?"`;

async function main(): Promise<void> {
  const client = new Anthropic();
  const subconsciousLLM = new GoogleAdapter();

  const sub = new Subconscious({
    vector: new MemoryVectorStore(),
    kv: new MemoryKVStore(),
    llm: subconsciousLLM,
    tokenBudget: 8000,
    onStatus: (event) => {
      console.log(`  [factory/sub] ${event.phase}: ${event.message}`);
    },
  });

  const registry = new Registry();
  const factoryTools = createFactoryTools(registry);

  console.log('=== Taskforce Agent Factory ===');
  console.log('Create agents, build tools, delegate tasks.');
  console.log('Type your request. Ctrl+C to exit.\n');

  const existing = registry.listAgents();
  if (existing.length > 0) {
    console.log(`Existing agents: ${existing.map((a) => a.name).join(', ')}\n`);
  }

  const readline = await import('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const prompt = (): void => {
    rl.question('You: ', async (input: string) => {
      if (!input.trim()) {
        prompt();
        return;
      }

      try {
        const result = await runAgentLoop(
          {
            client,
            model: 'claude-sonnet-4-5-20250929',
            systemPrompt: FACTORY_SYSTEM_PROMPT,
            tools: [...factoryTools, bashTool, readFileTool, writeFileTool],
            subconscious: sub,
            maxTurns: 20,
            onText: (text) => console.log(`\nFactory: ${text}`),
            onToolUse: (name, toolInput) => console.log(`  [tool] ${name}(${JSON.stringify(toolInput).slice(0, 100)})`),
            onStatus: (status) => console.log(`  ${status}`),
          },
          input,
        );

        // Check for delegation
        try {
          const parsed = JSON.parse(result);
          if (parsed._action === 'delegate') {
            await spawnAndRun(parsed.definition, parsed.task);
          }
        } catch {
          // Not a delegation — normal response
        }
      } catch (error: any) {
        console.error(`Error: ${error.message}\n`);
      }

      console.log('');
      prompt();
    });
  };

  prompt();
}

main().catch(console.error);
