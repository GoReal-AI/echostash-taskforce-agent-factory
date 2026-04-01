/**
 * Lightweight agent loop — Think, Act, Observe, Repeat.
 *
 * Inspired by the existing Taskforce TAOR loop (~50 lines of core logic).
 * Every agent runs this loop with the Subconscious managing context.
 *
 * Flow:
 *   1. Subconscious prepares context (classify, recall, reshape)
 *   2. LLM sees curated context + tools
 *   3. LLM responds with text and/or tool calls
 *   4. Execute tools, collect results
 *   5. Subconscious ingests response
 *   6. Repeat until done
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Subconscious, EnrichedMessage } from '@echostash/subconscious';
import type { ToolDef } from './tool-types.js';

export interface AgentLoopConfig {
  /** Anthropic client */
  client: Anthropic;
  /** Model to use */
  model: string;
  /** System prompt */
  systemPrompt: string;
  /** Available tools */
  tools: ToolDef[];
  /** The Subconscious instance for this agent */
  subconscious: Subconscious;
  /** Max turns before stopping */
  maxTurns: number;
  /** Callback for text output */
  onText?: (text: string) => void;
  /** Callback for tool use */
  onToolUse?: (name: string, input: Record<string, unknown>) => void;
  /** Callback for status */
  onStatus?: (status: string) => void;
}

export async function runAgentLoop(
  config: AgentLoopConfig,
  initialTask: string,
): Promise<string> {
  const { client, model, systemPrompt, tools, subconscious, maxTurns, onText, onToolUse, onStatus } = config;

  // Convert tools to Anthropic format
  const anthropicTools: Anthropic.Messages.Tool[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Messages.Tool.InputSchema,
  }));

  // Build tool executor map
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  // Prepare initial message through Subconscious
  const prepared = await subconscious.prepare({
    id: `msg-${Date.now()}`,
    role: 'user',
    content: initialTask,
    timestamp: Date.now(),
  });

  onStatus?.(`Context: ${prepared.messages.length} msgs, ~${prepared.totalTokens} tokens [${prepared.classification}]`);

  // Convert enriched messages to Anthropic format
  let messages: Anthropic.Messages.MessageParam[] = prepared.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: m.content,
    }));

  // Extract system content from enriched messages
  const systemMessages = prepared.messages.filter((m) => m.role === 'system');
  const fullSystem = [systemPrompt, ...systemMessages.map((m) => m.content)]
    .filter(Boolean)
    .join('\n\n');

  let turn = 0;
  let finalOutput = '';

  while (turn < maxTurns) {
    turn++;
    onStatus?.(`Turn ${turn}/${maxTurns}`);

    // Call LLM
    const response = await client.messages.create({
      model,
      max_tokens: 8192,
      system: fullSystem,
      tools: anthropicTools.length > 0 ? anthropicTools : undefined,
      messages,
    });

    // Process response blocks
    const assistantContent: Anthropic.Messages.ContentBlockParam[] = [];
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
    let hasToolUse = false;

    for (const block of response.content) {
      if (block.type === 'text') {
        onText?.(block.text);
        finalOutput = block.text;
        assistantContent.push({ type: 'text', text: block.text });
      } else if (block.type === 'tool_use') {
        hasToolUse = true;
        onToolUse?.(block.name, block.input as Record<string, unknown>);
        assistantContent.push({
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });

        // Execute tool
        const tool = toolMap.get(block.name);
        let result: string;
        if (tool) {
          try {
            result = await tool.execute(block.input as Record<string, unknown>);
          } catch (error: any) {
            result = `ERROR: ${error.message}`;
          }
        } else {
          result = `ERROR: Unknown tool "${block.name}"`;
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result,
        });
      }
    }

    // Add assistant message
    messages.push({ role: 'assistant', content: assistantContent });

    // Ingest assistant response into Subconscious
    await subconscious.ingest({
      id: `resp-${Date.now()}`,
      role: 'assistant',
      content: finalOutput,
      timestamp: Date.now(),
    });

    // If no tool use, we're done
    if (!hasToolUse || response.stop_reason === 'end_turn') {
      break;
    }

    // Add tool results as user message
    messages.push({ role: 'user', content: toolResults });

    // Prepare tool results through Subconscious
    for (const tr of toolResults) {
      const content = typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content);
      await subconscious.prepare({
        id: `tool-${Date.now()}`,
        role: 'tool',
        content: content.slice(0, 2000), // Don't embed huge tool outputs
        timestamp: Date.now(),
        source: 'tool',
      });
    }

    void subconscious.flush();
  }

  return finalOutput;
}
