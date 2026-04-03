# Echostash Taskforce Agent Factory

An AI agent that builds and manages other AI agents. Powered by [Echostash Subconscious](https://github.com/GoReal-AI/gra-echostash-subconscious) for context management and Google Gemini for reasoning.

## How It Works

**HR** is the factory agent. Users talk to HR to:

- **Create agents** with custom personality, role, system prompt, and rules
- **Build and assign tools** — only HR can create tools; agents request what they need
- **Delegate tasks** — HR routes work to the right agent, spawning it with its own context
- **Manage the team** — update rules, revoke tools, review tool requests

Every spawned agent gets its own [Subconscious](https://github.com/GoReal-AI/gra-echostash-subconscious) instance that persists across delegations — it remembers previous conversations and recalls context when needed.

```
You: "I need a weather bot"
HR:  Creates weather-bot with get_weather tool, rules, personality

You: "What's the weather in Tokyo?"
HR:  Delegates to weather-bot → agent runs in its own thread

You: "What city did I ask about earlier?"
HR:  Subconscious recalls → "Tokyo"
```

## Quick Start

```bash
git clone https://github.com/GoReal-AI/echostash-taskforce-agent-factory.git
cd echostash-taskforce-agent-factory
npm install
```

### CLI Mode (terminal)

```bash
GOOGLE_AI_API_KEY=... npx tsx src/cli.ts
```

### Discord Mode

```bash
GOOGLE_AI_API_KEY=... DISCORD_BOT_TOKEN=... HR_CHANNEL_ID=... npx tsx src/index.ts
```

### Live Dashboard

When running, open **http://localhost:3333** to see real-time events across all agents:

- Subconscious decisions (classify, recall, reshape)
- Tool calls with input/output
- Agent spawns and completions
- Cost tracking (curated vs raw tokens, savings %)

## Architecture

```
┌─────────────────────────────────────────────┐
│  HR Agent (Gemini 3.1 Pro)                   │
│  Creates agents, builds tools, delegates     │
│  ┌─────────────────────────────────────┐     │
│  │  Subconscious (Gemini 3 Flash)      │     │
│  │  Manages HR's own context           │     │
│  └─────────────────────────────────────┘     │
├──────────────┬──────────────┬────────────────┤
│ weather-bot  │ news-tracker │ your-agent     │
│ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐   │
│ │   Sub    │ │ │   Sub    │ │ │   Sub    │   │
│ └──────────┘ │ └──────────┘ │ └──────────┘   │
│ Persistent   │ Persistent   │ Persistent     │
│ across tasks │ across tasks │ across tasks   │
└──────────────┴──────────────┴────────────────┘
```

**Models:**
- HR + spawned agents: `gemini-3.1-pro-preview` (configurable per agent)
- All Subconscious instances: `gemini-3-flash-preview` (cheap, fast)
- Embeddings: `gemini-embedding-001`

**Cost:** Preview models are free on Google AI. Production Gemini pricing applies when using stable models.

## HR's Tools

| Tool | What |
|---|---|
| `create_agent` | Build agent with personality, role, prompt, rules, tools |
| `list_agents` | See the whole team |
| `update_agent_rules` | Change an agent's boundaries |
| `remove_agent` | Remove an agent |
| `create_tool` | Build a new tool (HR exclusive) |
| `assign_tool` | Give a tool to an agent |
| `revoke_tool` | Take a tool away |
| `list_tools` | See all tools and assignments |
| `review_tool_requests` | See what agents are asking for |
| `create_skill` | Build reusable prompt+tool combination |
| `delegate_task` | Spawn agent in its own thread |

Built-in tools available to all agents: `bash`, `read_file`, `write_file`.

## Project Structure

```
src/
├── index.ts                 # Discord mode entry point
├── cli.ts                   # CLI mode entry point
├── core/
│   ├── agent-loop.ts        # TAOR loop (Think, Act, Observe, Repeat)
│   └── tool-types.ts        # Tool interface
├── factory/
│   ├── types.ts             # AgentDefinition, ToolDefinition, SkillDefinition
│   ├── registry.ts          # Persists definitions to disk
│   ├── factory-tools.ts     # HR's 11 tools
│   └── agent-spawner.ts     # Spawns agents with persistent Subconscious
├── hr/
│   └── system-prompt.ts     # HR's system prompt
├── tools/
│   ├── bash.ts              # Unlimited shell access
│   ├── files.ts             # read_file, write_file
│   └── web.ts               # Web search and fetch
├── discord/
│   └── bot.ts               # Discord bot integration
└── dashboard/
    ├── events.ts            # Event bus for observability
    ├── costs.ts             # Token cost tracking
    ├── server.ts            # HTTP server + SSE
    └── ui.ts                # Dashboard HTML
```

## License

[MIT](LICENSE)

---

Built by [GoReal AI](https://github.com/GoReal-AI). Uses [@echostash/subconscious](https://github.com/GoReal-AI/gra-echostash-subconscious) for context management.
