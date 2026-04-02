/**
 * Cost tracker — tracks token usage and savings from the Subconscious.
 *
 * Compares:
 * - What the Subconscious costs (classify, summarize, compress calls)
 * - What it saves (curated context vs raw full history)
 */

import { events } from './events.js';

interface AgentCosts {
  /** Total messages ever sent to this agent */
  totalMessages: number;
  /** Total tokens in raw history (if we sent everything) */
  rawHistoryTokens: number;
  /** Total tokens actually sent (curated by Subconscious) */
  curatedTokens: number;
  /** Subconscious LLM calls (classify, summarize, etc.) */
  subconsciosusCalls: number;
  /** Estimated tokens used by Subconscious itself */
  subconsciousTokens: number;
}

class CostTracker {
  private agents = new Map<string, AgentCosts>();

  private getOrCreate(agent: string): AgentCosts {
    let costs = this.agents.get(agent);
    if (!costs) {
      costs = {
        totalMessages: 0,
        rawHistoryTokens: 0,
        curatedTokens: 0,
        subconsciosusCalls: 0,
        subconsciousTokens: 0,
      };
      this.agents.set(agent, costs);
    }
    return costs;
  }

  /** Called when Subconscious prepares context */
  trackPrepare(agent: string, rawMessages: number, rawTokens: number, curatedTokens: number): void {
    const costs = this.getOrCreate(agent);
    costs.totalMessages += 1;
    costs.rawHistoryTokens += rawTokens;
    costs.curatedTokens += curatedTokens;
    // Each prepare = 1 classify call (~500 tokens for the Subconscious)
    costs.subconsciosusCalls += 1;
    costs.subconsciousTokens += 500; // rough estimate per classify call

    this.emit();
  }

  /** Called when Subconscious does background work (summarize, compress) */
  trackBackground(agent: string, type: string): void {
    const costs = this.getOrCreate(agent);
    costs.subconsciosusCalls += 1;
    costs.subconsciousTokens += type === 'summarize' ? 800 : type === 'compress' ? 1000 : 300;
    this.emit();
  }

  getStats(): Record<string, unknown> {
    const allAgents: Record<string, unknown> = {};
    let totalRaw = 0;
    let totalCurated = 0;
    let totalSubCost = 0;

    for (const [name, costs] of this.agents) {
      const saved = costs.rawHistoryTokens - costs.curatedTokens;
      const savingsPct = costs.rawHistoryTokens > 0
        ? Math.round((saved / costs.rawHistoryTokens) * 100)
        : 0;

      allAgents[name] = {
        messages: costs.totalMessages,
        rawTokens: costs.rawHistoryTokens,
        curatedTokens: costs.curatedTokens,
        savedTokens: saved,
        savingsPct,
        subconsciousCalls: costs.subconsciosusCalls,
        subconsciousTokens: costs.subconsciousTokens,
      };

      totalRaw += costs.rawHistoryTokens;
      totalCurated += costs.curatedTokens;
      totalSubCost += costs.subconsciousTokens;
    }

    const totalSaved = totalRaw - totalCurated;
    const totalSavingsPct = totalRaw > 0 ? Math.round((totalSaved / totalRaw) * 100) : 0;

    return {
      agents: allAgents,
      totals: {
        rawTokens: totalRaw,
        curatedTokens: totalCurated,
        savedTokens: totalSaved,
        savingsPct: totalSavingsPct,
        subconsciousTokens: totalSubCost,
        netSavings: totalSaved - totalSubCost,
      },
    };
  }

  private emit(): void {
    events.log('system', 'costs', 'status', 'Cost update', '', this.getStats());
  }
}

export const costTracker = new CostTracker();
