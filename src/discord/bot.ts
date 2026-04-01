/**
 * Discord bot — the interface for HR and all agents.
 *
 * HR lives in the main channel. Each spawned agent gets its own thread.
 * Users talk to HR to define agents, assign tasks, manage the taskforce.
 */

import {
  Client,
  GatewayIntentBits,
  type Message as DiscordMessage,
  type TextChannel,
  type ThreadChannel,
  EmbedBuilder,
} from 'discord.js';

export interface BotConfig {
  botToken: string;
  /** The main channel where HR listens */
  hrChannelId: string;
}

export type MessageHandler = (
  content: string,
  context: MessageContext,
) => Promise<void>;

export interface MessageContext {
  /** Discord channel/thread to respond in */
  channelId: string;
  /** The user who sent the message */
  userId: string;
  username: string;
  /** Whether this is in a thread (agent conversation) or main channel (HR) */
  isThread: boolean;
  /** Send a text reply */
  reply: (text: string) => Promise<void>;
  /** Send a rich embed reply */
  replyEmbed: (embed: EmbedOptions) => Promise<void>;
  /** Send a status/typing indicator */
  typing: () => Promise<void>;
  /** Create a new thread for an agent */
  createThread: (name: string) => Promise<string>;
  /** Send a message to a specific channel/thread */
  sendTo: (channelId: string, text: string) => Promise<void>;
}

export interface EmbedOptions {
  title: string;
  description: string;
  color?: 'info' | 'success' | 'warning' | 'error' | 'hr';
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}

const COLORS = {
  info: 0x3498db,
  success: 0x2ecc71,
  warning: 0xf39c12,
  error: 0xe74c3c,
  hr: 0x9b59b6, // purple for HR
};

export class DiscordBot {
  private client: Client;
  private config: BotConfig;
  private hrHandler: MessageHandler | null = null;
  private agentHandlers = new Map<string, MessageHandler>();

  constructor(config: BotConfig) {
    this.config = config;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    });

    this.client.on('messageCreate', (msg) => void this.handleMessage(msg));
  }

  /** Set the handler for HR (main channel) messages */
  onHRMessage(handler: MessageHandler): void {
    this.hrHandler = handler;
  }

  /** Set a handler for a specific agent thread */
  onAgentMessage(threadId: string, handler: MessageHandler): void {
    this.agentHandlers.set(threadId, handler);
  }

  async connect(): Promise<void> {
    await this.client.login(this.config.botToken);
    console.log(`[Discord] Connected as ${this.client.user?.tag}`);
  }

  async disconnect(): Promise<void> {
    this.client.destroy();
  }

  private async handleMessage(msg: DiscordMessage): Promise<void> {
    // Ignore bots
    if (msg.author.bot) return;

    const context = this.buildContext(msg);

    // Route to agent handler if in a thread
    if (msg.channel.isThread()) {
      const handler = this.agentHandlers.get(msg.channelId);
      if (handler) {
        await handler(msg.content, context);
        return;
      }
    }

    // Route to HR if in the HR channel
    if (msg.channelId === this.config.hrChannelId && this.hrHandler) {
      await this.hrHandler(msg.content, context);
    }
  }

  private buildContext(msg: DiscordMessage): MessageContext {
    const client = this.client;
    const channelId = msg.channelId;

    return {
      channelId,
      userId: msg.author.id,
      username: msg.author.username,
      isThread: msg.channel.isThread(),

      async reply(text: string) {
        const ch = msg.channel as TextChannel;
        const chunks = splitMessage(text, 1900);
        for (const chunk of chunks) {
          await ch.send(chunk);
        }
      },

      async replyEmbed(options: EmbedOptions) {
        const ch = msg.channel as TextChannel;
        const embed = new EmbedBuilder()
          .setTitle(options.title)
          .setDescription(options.description)
          .setColor(COLORS[options.color ?? 'info'])
          .setTimestamp();

        if (options.fields) {
          for (const f of options.fields) {
            embed.addFields({ name: f.name, value: f.value, inline: f.inline ?? false });
          }
        }

        await ch.send({ embeds: [embed] });
      },

      async typing() {
        const ch = msg.channel as TextChannel;
        await ch.sendTyping();
      },

      async createThread(name: string) {
        const channel = msg.channel as TextChannel;
        const thread = await channel.threads.create({
          name,
          autoArchiveDuration: 1440, // 24 hours
        });
        return thread.id;
      },

      async sendTo(targetChannelId: string, text: string) {
        const channel = await client.channels.fetch(targetChannelId);
        if (channel && 'send' in channel) {
          const chunks = splitMessage(text, 1900);
          for (const chunk of chunks) {
            await (channel as TextChannel | ThreadChannel).send(chunk);
          }
        }
      },
    };
  }
}

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    // Try to split at a newline
    let splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt < maxLen / 2) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  return chunks;
}
