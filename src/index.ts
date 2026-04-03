/**
 * Echostash Taskforce Agent Factory — HR (Discord mode)
 *
 * Usage:
 *   GOOGLE_AI_API_KEY=... DISCORD_BOT_TOKEN=... HR_CHANNEL_ID=... npx tsx src/index.ts
 */

import { Subconscious, MemoryKVStore, MemoryVectorStore } from '@echostash/subconscious';
import { GoogleAdapter } from '@echostash/subconscious/llm/google';
import { DiscordBot } from './discord/bot.js';
import { Registry } from './factory/registry.js';
import { createHRTools } from './factory/factory-tools.js';
import { buildHRSystemPrompt } from './hr/system-prompt.js';
import { bashTool } from './tools/bash.js';
import { readFileTool, writeFileTool } from './tools/files.js';
import { runAgentLoop } from './core/agent-loop.js';

const GOOGLE_API_KEY = process.env.GOOGLE_AI_API_KEY ?? process.env.VERTEX_AI_API_KEY ?? '';
const ECHOSTASH_API_KEY = process.env.ECHOSTASH_API_KEY ?? '';
const ECHOSTASH_BASE_URL = process.env.ECHOSTASH_BASE_URL ?? 'https://api.echostash.app';

async function main(): Promise<void> {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const hrChannelId = process.env.HR_CHANNEL_ID;

  if (!botToken || !hrChannelId || !GOOGLE_API_KEY) {
    console.error('Required: GOOGLE_AI_API_KEY, DISCORD_BOT_TOKEN, HR_CHANNEL_ID');
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
    echostash: ECHOSTASH_API_KEY ? { baseUrl: ECHOSTASH_BASE_URL, apiKey: ECHOSTASH_API_KEY } : undefined,
    onStatus: (event) => {
      console.log(`  [hr/sub] ${event.phase}: ${event.message}`);
    },
  });

  const bot = new DiscordBot({ botToken, hrChannelId });

  bot.onHRMessage(async (content, ctx) => {
    console.log(`[${ctx.username}] ${content}`);
    await ctx.typing();

    const systemPrompt = await buildHRSystemPrompt(
      registry.listAgents(),
      registry.listTools(),
      registry.listSkills(),
    );

    try {
      const result = await runAgentLoop(
        {
          apiKey: GOOGLE_API_KEY,
          model: 'gemini-3.1-pro-preview',
          systemPrompt,
          tools: [...hrTools, bashTool, readFileTool, writeFileTool],
          subconscious: hrSub,
          maxTurns: 15,
          onText: async (text) => { await ctx.reply(text); },
          onToolUse: (name, input) => {
            console.log(`  [hr/tool] ${name}(${JSON.stringify(input).slice(0, 100)})`);
          },
          onStatus: (status) => console.log(`  [hr] ${status}`),
        },
        content,
      );

      // Handle delegation
      try {
        const parsed = JSON.parse(result);
        if (parsed._action === 'delegate' && parsed.definition) {
          const threadId = await ctx.createThread(`${parsed.agent}: ${(parsed.task as string).slice(0, 80)}`);
          registry.updateAgent(parsed.agent, { threadId });

          await ctx.replyEmbed({
            title: `Task delegated to ${parsed.agent}`,
            description: parsed.task,
            color: 'success',
            fields: [{ name: 'Thread', value: `<#${threadId}>` }],
          });

          const agentSub = new Subconscious({
            vector: new MemoryVectorStore(),
            kv: new MemoryKVStore(),
            llm: subconsciousLLM,
            tokenBudget: 8000,
          });

          bot.onAgentMessage(threadId, async (agentContent, agentCtx) => {
            await agentCtx.typing();
            try {
              await runAgentLoop(
                {
                  apiKey: GOOGLE_API_KEY,
                  model: parsed.definition.model,
                  systemPrompt: parsed.definition.systemPrompt +
                    (parsed.definition.rules.length > 0
                      ? `\n\n## Rules\n${parsed.definition.rules.map((r: string) => `- ${r}`).join('\n')}`
                      : ''),
                  tools: [bashTool, readFileTool, writeFileTool],
                  subconscious: agentSub,
                  maxTurns: parsed.definition.maxTurns ?? 50,
                  onText: async (text) => { await agentCtx.reply(text); },
                  onToolUse: (name) => console.log(`  [${parsed.agent}/tool] ${name}`),
                },
                agentContent,
              );
            } catch (error: any) {
              await agentCtx.reply(`Error: ${error.message}`);
            }
          });

          // Run initial task
          await runAgentLoop(
            {
              apiKey: GOOGLE_API_KEY,
              model: parsed.definition.model,
              systemPrompt: parsed.definition.systemPrompt,
              tools: [bashTool, readFileTool, writeFileTool],
              subconscious: agentSub,
              maxTurns: parsed.definition.maxTurns ?? 50,
              onText: async (text) => { await ctx.sendTo(threadId, text); },
              onToolUse: (name) => console.log(`  [${parsed.agent}/tool] ${name}`),
            },
            parsed.task,
          );

          await ctx.sendTo(threadId, '--- Task complete ---');
        }
      } catch {
        // normal response
      }
    } catch (error: any) {
      await ctx.replyEmbed({ title: 'Error', description: error.message, color: 'error' });
    }
  });

  await bot.connect();

  console.log('=== HR Agent Factory (Discord) ===');
  console.log('Models: Gemini 3.1 Pro (HR) | Gemini 3 Flash (Subconscious)');
  console.log(`Channel: ${hrChannelId}`);
  console.log(`Agents: ${registry.listAgents().length}`);
  console.log('Ready.\n');

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
