/**
 * Echostash Taskforce Agent Factory — HR
 *
 * The HR agent lives on Discord. Users talk to it to:
 * - Create agents with personality, role, rules
 * - Build and assign tools
 * - Delegate tasks to agents
 * - Manage the entire taskforce
 *
 * Every agent gets its own Discord thread + Subconscious instance.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... GOOGLE_AI_API_KEY=... DISCORD_BOT_TOKEN=... HR_CHANNEL_ID=... npx tsx src/index.ts
 */

import Anthropic from '@anthropic-ai/sdk';
import { Subconscious, MemoryKVStore, MemoryVectorStore } from '@echostash/subconscious';
import { GoogleAdapter } from '@echostash/subconscious/llm/google';
import { DiscordBot } from './discord/bot.js';
import { Registry } from './factory/registry.js';
import { createHRTools } from './factory/factory-tools.js';
import { buildHRSystemPrompt } from './hr/system-prompt.js';
import { spawnAndRun } from './factory/agent-spawner.js';
import { bashTool } from './tools/bash.js';
import { readFileTool, writeFileTool } from './tools/files.js';
import { runAgentLoop } from './core/agent-loop.js';

async function main(): Promise<void> {
  // --- Config ---
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const hrChannelId = process.env.HR_CHANNEL_ID;

  if (!botToken || !hrChannelId) {
    console.error('Required: DISCORD_BOT_TOKEN and HR_CHANNEL_ID');
    process.exit(1);
  }

  // --- Initialize ---
  const client = new Anthropic();
  const subconsciousLLM = new GoogleAdapter(); // free tier
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

  // --- Discord Bot ---
  const bot = new DiscordBot({ botToken, hrChannelId });

  bot.onHRMessage(async (content, ctx) => {
    console.log(`[${ctx.username}] ${content}`);
    await ctx.typing();

    // Build dynamic system prompt with current taskforce state
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
          onText: async (text) => {
            await ctx.reply(text);
          },
          onToolUse: (name, input) => {
            console.log(`  [hr/tool] ${name}(${JSON.stringify(input).slice(0, 100)})`);
          },
          onStatus: (status) => {
            console.log(`  [hr] ${status}`);
          },
        },
        content,
      );

      // Check for delegation
      try {
        const parsed = JSON.parse(result);
        if (parsed._action === 'delegate' && parsed.definition) {
          // Create a thread for the agent
          const threadId = await ctx.createThread(`${parsed.agent}: ${(parsed.task as string).slice(0, 80)}`);

          // Update agent with thread ID
          registry.updateAgent(parsed.agent, { threadId });

          await ctx.replyEmbed({
            title: `Task delegated to ${parsed.agent}`,
            description: parsed.task,
            color: 'success',
            fields: [{ name: 'Thread', value: `<#${threadId}>` }],
          });

          // Spawn agent in thread
          const agentSub = new Subconscious({
            vector: new MemoryVectorStore(),
            kv: new MemoryKVStore(),
            llm: subconsciousLLM,
            tokenBudget: 8000,
            onStatus: (event) => {
              console.log(`  [${parsed.agent}/sub] ${event.phase}: ${event.message}`);
            },
          });

          // Set up agent message handler for the thread
          bot.onAgentMessage(threadId, async (agentContent, agentCtx) => {
            await agentCtx.typing();
            try {
              await runAgentLoop(
                {
                  client,
                  model: parsed.definition.model,
                  systemPrompt: parsed.definition.systemPrompt +
                    (parsed.definition.rules.length > 0
                      ? `\n\n## Rules\n${parsed.definition.rules.map((r: string) => `- ${r}`).join('\n')}`
                      : ''),
                  tools: [bashTool, readFileTool, writeFileTool], // TODO: resolve custom tools
                  subconscious: agentSub,
                  maxTurns: parsed.definition.maxTurns ?? 50,
                  onText: async (text) => {
                    await agentCtx.reply(text);
                  },
                  onToolUse: (name) => {
                    console.log(`  [${parsed.agent}/tool] ${name}`);
                  },
                },
                agentContent,
              );
            } catch (error: any) {
              await agentCtx.reply(`Error: ${error.message}`);
            }
          });

          // Run the initial task
          await runAgentLoop(
            {
              client,
              model: parsed.definition.model,
              systemPrompt: parsed.definition.systemPrompt +
                (parsed.definition.rules.length > 0
                  ? `\n\n## Rules\n${parsed.definition.rules.map((r: string) => `- ${r}`).join('\n')}`
                  : ''),
              tools: [bashTool, readFileTool, writeFileTool],
              subconscious: agentSub,
              maxTurns: parsed.definition.maxTurns ?? 50,
              onText: async (text) => {
                await ctx.sendTo(threadId, text);
              },
              onToolUse: (name) => {
                console.log(`  [${parsed.agent}/tool] ${name}`);
              },
            },
            parsed.task,
          );

          await ctx.sendTo(threadId, '--- Task complete ---');
        }
      } catch {
        // Not a delegation — normal HR response, already sent via onText
      }
    } catch (error: any) {
      await ctx.replyEmbed({
        title: 'Error',
        description: error.message,
        color: 'error',
      });
      console.error('[hr] Error:', error.message);
    }
  });

  // --- Start ---
  await bot.connect();

  console.log('=== HR Agent Factory ===');
  console.log(`Listening in channel: ${hrChannelId}`);
  console.log(`Agents: ${registry.listAgents().length}`);
  console.log(`Tools: ${registry.listTools().length}`);
  console.log('Ready.\n');

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await bot.disconnect();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal:', error);
  process.exit(1);
});
