// Discord Destination
// Sends messages to Discord via webhook

import type { DiscordDestination } from '@tada/shared';

export interface DiscordMessage {
  content?: string;
  embeds?: DiscordEmbed[];
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  timestamp?: string;
}

/**
 * Send a message to Discord webhook
 */
export async function sendToDiscord(
  destination: DiscordDestination,
  data: Record<string, any>
): Promise<boolean> {
  if (!destination.enabled || !destination.webhookUrl) {
    return false;
  }

  try {
    const message = formatDiscordMessage(data, destination.format || 'embed');

    const response = await fetch(destination.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      console.error(`[Discord] Failed to send: ${response.status} ${response.statusText}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Discord] Error:', error);
    return false;
  }
}

/**
 * Format data as Discord message
 */
function formatDiscordMessage(
  data: Record<string, any>,
  format: 'embed' | 'text'
): DiscordMessage {
  if (format === 'text') {
    return {
      content: formatAsText(data),
    };
  }

  // Default: embed format
  return {
    embeds: [formatAsEmbed(data)],
  };
}

/**
 * Format as plain text
 */
function formatAsText(data: Record<string, any>): string {
  const lines: string[] = [];

  // Trade format
  if (data.type === 'trade') {
    const direction = data.direction?.toUpperCase() || 'SWAP';
    const emoji = direction === 'BUY' ? '🟢' : direction === 'SELL' ? '🔴' : '🔄';
    lines.push(`${emoji} **${direction}**`);

    if (data.token) {
      lines.push(`Token: \`${shortenAddress(data.token)}\``);
    }
    if (data.solAmount !== undefined) {
      lines.push(`SOL: ${data.solAmount.toFixed(4)}`);
    }
    if (data.tokenAmount !== undefined) {
      lines.push(`Amount: ${formatNumber(data.tokenAmount)}`);
    }
    if (data.trader) {
      lines.push(`Trader: \`${shortenAddress(data.trader)}\``);
    }
  } else {
    // Generic format
    lines.push(`**${data.eventName || data.name || 'Event'}**`);
    for (const [key, value] of Object.entries(data)) {
      if (key === 'type' || key === 'eventName' || key === 'name') continue;
      lines.push(`${key}: ${formatValue(value)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format as Discord embed
 */
function formatAsEmbed(data: Record<string, any>): DiscordEmbed {
  const embed: DiscordEmbed = {
    timestamp: new Date().toISOString(),
  };

  // Trade format
  if (data.type === 'trade') {
    const direction = data.direction?.toUpperCase() || 'SWAP';
    const emoji = direction === 'BUY' ? '🟢' : direction === 'SELL' ? '🔴' : '🔄';

    embed.title = `${emoji} ${direction}`;
    embed.color = direction === 'BUY' ? 0x00ff00 : direction === 'SELL' ? 0xff0000 : 0x0099ff;

    const fields: { name: string; value: string; inline?: boolean }[] = [];

    if (data.token) {
      fields.push({ name: 'Token', value: `\`${shortenAddress(data.token)}\``, inline: true });
    }
    if (data.pool) {
      fields.push({ name: 'Pool', value: `\`${shortenAddress(data.pool)}\``, inline: true });
    }
    if (data.solAmount !== undefined) {
      fields.push({ name: 'SOL', value: data.solAmount.toFixed(4), inline: true });
    }
    if (data.tokenAmount !== undefined) {
      fields.push({ name: 'Amount', value: formatNumber(data.tokenAmount), inline: true });
    }
    if (data.inputAmount !== undefined) {
      fields.push({ name: 'Input', value: formatNumber(data.inputAmount), inline: true });
    }
    if (data.outputAmount !== undefined) {
      fields.push({ name: 'Output', value: formatNumber(data.outputAmount), inline: true });
    }
    if (data.price !== undefined) {
      fields.push({ name: 'Price', value: data.price.toExponential(4), inline: true });
    }
    if (data.trader) {
      fields.push({ name: 'Trader', value: `\`${shortenAddress(data.trader)}\``, inline: true });
    }

    embed.fields = fields;
  }
  // Migration format
  else if (data.type === 'migration') {
    embed.title = '🚀 Migration Complete';
    embed.color = 0xffff00;

    const fields: { name: string; value: string; inline?: boolean }[] = [];

    if (data.token) {
      fields.push({ name: 'Token', value: `\`${shortenAddress(data.token)}\``, inline: true });
    }
    if (data.pool) {
      fields.push({ name: 'Pool', value: `\`${shortenAddress(data.pool)}\``, inline: true });
    }
    if (data.solRaised !== undefined) {
      fields.push({ name: 'SOL Raised', value: data.solRaised.toFixed(4), inline: true });
    }
    if (data.creator) {
      fields.push({ name: 'Creator', value: `\`${shortenAddress(data.creator)}\``, inline: true });
    }

    embed.fields = fields;
  }
  // Generic format
  else {
    embed.title = data.eventName || data.name || 'Event';
    embed.color = 0x0099ff;

    const fields: { name: string; value: string; inline?: boolean }[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (key === 'type' || key === 'eventName' || key === 'name') continue;
      fields.push({
        name: key,
        value: formatValue(value),
        inline: true,
      });
    }

    embed.fields = fields.slice(0, 25); // Discord limit
  }

  return embed;
}

function shortenAddress(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  if (n < 0.0001) return n.toExponential(2);
  return n.toFixed(4);
}

function formatValue(value: any): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'string' && value.length > 20) return shortenAddress(value);
  return String(value);
}
