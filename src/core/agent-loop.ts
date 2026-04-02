/**
 * Lightweight agent loop — Think, Act, Observe, Repeat.
 *
 * Powered by Google Gemini. Every agent runs this loop
 * with the Subconscious managing context.
 */

import { GoogleGenerativeAI, type Part } from '@google/generative-ai';
import type { Subconscious } from '@echostash/subconscious';
import type { ToolDef } from './tool-types.js';
import { events } from '../dashboard/events.js';
import { costTracker } from '../dashboard/costs.js';

export interface AgentLoopConfig {
  /** Agent name (for logging) */
  agentName?: string;
  /** Google AI API key */
  apiKey: string;
  /** Model to use (e.g. gemini-3.1-pro-preview) */
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
  const { agentName: name = 'agent', apiKey, model, systemPrompt, tools, subconscious, maxTurns, onText, onToolUse, onStatus } = config;

  events.log('system', name, 'status', 'Agent loop started', `Model: ${model}, Max turns: ${maxTurns}, Tools: ${tools.length}`);

  const genAI = new GoogleGenerativeAI(apiKey);

  // Convert tools to Gemini function declarations
  const functionDeclarations = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.inputSchema,
  }));

  const geminiModel = genAI.getGenerativeModel({
    model,
    systemInstruction: systemPrompt,
    tools: functionDeclarations.length > 0
      ? [{ functionDeclarations } as any]
      : undefined,
  });

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

  // Log full context to dashboard — this is what the agent actually sees
  const contextSnapshot = prepared.messages.map((m) => ({
    role: m.role,
    source: m.meta?.source ?? m.role,
    turn: m.meta?.turn ?? '?',
    tokens: m.meta?.tokens ?? '?',
    priority: m.meta?.priority ?? '?',
    relevancy: typeof m.meta?.relevancy === 'number' ? m.meta.relevancy.toFixed(2) : '?',
    pinned: m.meta?.pinned ?? false,
    recalled: m.meta?.recalled ?? false,
    compressed: m.meta?.compressed ?? false,
    content: m.content,
  }));

  events.log('subconscious', name, 'sub',
    `Classify: ${prepared.classification}`,
    `${prepared.messages.length} msgs, ~${prepared.totalTokens} tokens`,
    {
      actions: prepared.actions,
      context: contextSnapshot,
      summary: prepared.summary,
      recalled: prepared.recalled,
      compressed: prepared.compressed,
    },
  );

  // Track cost: estimate raw history as accumulated total
  // The Subconscious's own getContext() length is the running total
  const rawEstimate = prepared.totalTokens + (prepared.compressed * 200); // rough: compressed msgs were ~200 tokens each
  costTracker.trackPrepare(name, prepared.messages.length, rawEstimate, prepared.totalTokens);

  // Start chat with history from Subconscious
  // Gemini requires: first content must be 'user', and user/model must alternate
  const nonSystem = prepared.messages
    .filter((m) => m.role !== 'system')
    .slice(0, -1) // exclude the last message (we'll send it as the first turn)
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' as const : 'user' as const,
      parts: [{ text: m.content }] as Part[],
    }));

  // Ensure first message is 'user' (Gemini requirement)
  while (nonSystem.length > 0 && nonSystem[0]!.role !== 'user') {
    nonSystem.shift();
  }

  // Merge consecutive same-role messages (Gemini requires alternation)
  const history: typeof nonSystem = [];
  for (const msg of nonSystem) {
    const last = history[history.length - 1];
    if (last && last.role === msg.role) {
      // Merge into previous
      last.parts.push(...msg.parts);
    } else {
      history.push(msg);
    }
  }

  const chat = geminiModel.startChat({ history });

  let turn = 0;
  let finalOutput = '';
  let pendingMessage = initialTask;

  while (turn < maxTurns) {
    turn++;
    onStatus?.(`Turn ${turn}/${maxTurns}`);

    // Send message
    const result = await chat.sendMessage(pendingMessage);
    const response = result.response;
    const parts = response.candidates?.[0]?.content?.parts ?? [];

    // Process response parts
    let hasToolCall = false;
    const functionResponses: Array<{ functionResponse: { name: string; response: { result: string } } }> = [];

    for (const part of parts) {
      if (part.text) {
        onText?.(part.text);
        finalOutput = part.text;
        events.log('agent', name, 'action', 'Response', part.text.slice(0, 200));

        await subconscious.ingest({
          id: `resp-${Date.now()}`,
          role: 'assistant',
          content: part.text,
          timestamp: Date.now(),
        });
      }

      if (part.functionCall) {
        hasToolCall = true;
        const toolName = part.functionCall.name;
        const toolInput = (part.functionCall.args ?? {}) as Record<string, unknown>;
        onToolUse?.(toolName, toolInput);
        events.log('tool', name, 'tool', `${toolName}()`, JSON.stringify(toolInput).slice(0, 200), { tool: toolName, input: toolInput });

        const tool = toolMap.get(toolName);
        let toolResult: string;
        if (tool) {
          try {
            toolResult = await tool.execute(toolInput);
            events.log('tool', name, 'info', `${toolName} result`, toolResult.slice(0, 300));
          } catch (error: any) {
            toolResult = `ERROR: ${error.message}`;
            events.log('tool', name, 'error', `${toolName} failed`, error.message);
          }
        } else {
          toolResult = `ERROR: Unknown tool "${toolName}"`;
          events.log('tool', name, 'error', `Unknown tool: ${toolName}`, '');
        }

        functionResponses.push({
          functionResponse: {
            name: toolName,
            response: { result: toolResult },
          },
        });

        // Store tool result in Subconscious (background)
        void subconscious.prepare({
          id: `tool-${Date.now()}`,
          role: 'tool',
          content: `[${toolName}] ${toolResult.slice(0, 2000)}`,
          timestamp: Date.now(),
          source: 'tool',
        });
      }
    }

    // If no tool calls, we're done
    if (!hasToolCall) break;

    // Send tool results back — Gemini expects functionResponse parts
    const toolResultMsg = await chat.sendMessage(functionResponses as any);
    const toolParts = toolResultMsg.response.candidates?.[0]?.content?.parts ?? [];

    // Process follow-up (might be text or more tool calls)
    let moreTools = false;
    const moreFunctionResponses: typeof functionResponses = [];

    for (const part of toolParts) {
      if (part.text) {
        onText?.(part.text);
        finalOutput = part.text;
        await subconscious.ingest({
          id: `resp-${Date.now()}`,
          role: 'assistant',
          content: part.text,
          timestamp: Date.now(),
        });
      }
      if (part.functionCall) {
        moreTools = true;
        const toolName = part.functionCall.name;
        const toolInput = (part.functionCall.args ?? {}) as Record<string, unknown>;
        onToolUse?.(toolName, toolInput);

        const tool = toolMap.get(toolName);
        let toolResult: string;
        if (tool) {
          try { toolResult = await tool.execute(toolInput); }
          catch (error: any) { toolResult = `ERROR: ${error.message}`; }
        } else {
          toolResult = `ERROR: Unknown tool "${toolName}"`;
        }

        moreFunctionResponses.push({
          functionResponse: { name: toolName, response: { result: toolResult } },
        });
      }
    }

    // If there were more tool calls, send those results as the next pendingMessage
    if (moreTools && moreFunctionResponses.length > 0) {
      const moreResult = await chat.sendMessage(moreFunctionResponses as any);
      const moreParts = moreResult.response.candidates?.[0]?.content?.parts ?? [];
      for (const part of moreParts) {
        if (part.text) {
          onText?.(part.text);
          finalOutput = part.text;
          await subconscious.ingest({
            id: `resp-${Date.now()}`,
            role: 'assistant',
            content: part.text,
            timestamp: Date.now(),
          });
        }
      }
    }

    void subconscious.flush();

    // Check if the model stopped generating (no more tool calls in last response)
    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason === 'STOP' && !hasToolCall) break;

    // If there were no more tool calls in the follow-up, we're done
    if (!moreTools) break;
  }

  return finalOutput;
}
