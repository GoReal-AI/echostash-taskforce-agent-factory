/**
 * Lightweight agent loop — Think, Act, Observe, Repeat.
 *
 * Powered by Google Gemini. Every agent runs this loop
 * with the Subconscious managing context.
 */

import { GoogleGenerativeAI, type Part } from '@google/generative-ai';
import type { Subconscious } from '@echostash/subconscious';
import type { ToolDef } from './tool-types.js';

export interface AgentLoopConfig {
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
  const { apiKey, model, systemPrompt, tools, subconscious, maxTurns, onText, onToolUse, onStatus } = config;

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

  // Start chat with history from Subconscious
  const history = prepared.messages
    .filter((m) => m.role !== 'system')
    .slice(0, -1) // exclude the last message (we'll send it as the first turn)
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' as const : 'user' as const,
      parts: [{ text: m.content }] as Part[],
    }));

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

        // Ingest text response into Subconscious
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

        // Execute tool
        const tool = toolMap.get(toolName);
        let toolResult: string;
        if (tool) {
          try {
            toolResult = await tool.execute(toolInput);
          } catch (error: any) {
            toolResult = `ERROR: ${error.message}`;
          }
        } else {
          toolResult = `ERROR: Unknown tool "${toolName}"`;
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
