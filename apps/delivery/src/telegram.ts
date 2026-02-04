// Telegram Destination
// Sends messages via Telegram Bot API

import type { TelegramDestination } from '@tada/shared';

/**
 * Send a message to Telegram
 */
export async function sendToTelegram(
  destination: TelegramDestination,
  data: Record<string, any>
): Promise<boolean> {
  if (!destination.enabled || !destination.botToken || !destination.chatId) {
    return false;
  }

  try {
    const text = formatTelegramMessage(data, destination.format || 'markdown');
    const parseMode = destination.format === 'html' ? 'HTML' : 'Markdown';

    const url = `https://api.telegram.org/bot${destination.botToken}/sendMessage`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: destination.chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[Telegram] Failed to send: ${response.status} ${error}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Telegram] Error:', error);
    return false;
  }
}

/**
 * Format data as Telegram message
 */
function formatTelegramMessage(
  data: Record<string, any>,
  format: 'markdown' | 'html' | 'text'
): string {
  const lines: string[] = [];

  // Trade format
  if (data.type === 'trade') {
    const direction = data.direction?.toUpperCase() || 'SWAP';
    const emoji = direction === 'BUY' ? '🟢' : direction === 'SELL' ? '🔴' : '🔄';

    if (format === 'html') {
      lines.push(`${emoji} <b>${direction}</b>`);
      if (data.token) lines.push(`Token: <code>${shortenAddress(data.token)}</code>`);
      if (data.solAmount !== undefined) lines.push(`SOL: ${data.solAmount.toFixed(4)}`);
      if (data.tokenAmount !== undefined) lines.push(`Amount: ${formatNumber(data.tokenAmount)}`);
      if (data.trader) lines.push(`Trader: <code>${shortenAddress(data.trader)}</code>`);
    } else if (format === 'markdown') {
      lines.push(`${emoji} *${direction}*`);
      if (data.token) lines.push(`Token: \`${shortenAddress(data.token)}\``);
      if (data.solAmount !== undefined) lines.push(`SOL: ${data.solAmount.toFixed(4)}`);
      if (data.tokenAmount !== undefined) lines.push(`Amount: ${formatNumber(data.tokenAmount)}`);
      if (data.trader) lines.push(`Trader: \`${shortenAddress(data.trader)}\``);
    } else {
      lines.push(`${emoji} ${direction}`);
      if (data.token) lines.push(`Token: ${shortenAddress(data.token)}`);
      if (data.solAmount !== undefined) lines.push(`SOL: ${data.solAmount.toFixed(4)}`);
      if (data.tokenAmount !== undefined) lines.push(`Amount: ${formatNumber(data.tokenAmount)}`);
      if (data.trader) lines.push(`Trader: ${shortenAddress(data.trader)}`);
    }
  }
  // Migration format
  else if (data.type === 'migration') {
    if (format === 'html') {
      lines.push(`🚀 <b>Migration Complete</b>`);
      if (data.token) lines.push(`Token: <code>${shortenAddress(data.token)}</code>`);
      if (data.pool) lines.push(`Pool: <code>${shortenAddress(data.pool)}</code>`);
      if (data.solRaised !== undefined) lines.push(`SOL Raised: ${data.solRaised.toFixed(4)}`);
    } else if (format === 'markdown') {
      lines.push(`🚀 *Migration Complete*`);
      if (data.token) lines.push(`Token: \`${shortenAddress(data.token)}\``);
      if (data.pool) lines.push(`Pool: \`${shortenAddress(data.pool)}\``);
      if (data.solRaised !== undefined) lines.push(`SOL Raised: ${data.solRaised.toFixed(4)}`);
    } else {
      lines.push(`🚀 Migration Complete`);
      if (data.token) lines.push(`Token: ${shortenAddress(data.token)}`);
      if (data.pool) lines.push(`Pool: ${shortenAddress(data.pool)}`);
      if (data.solRaised !== undefined) lines.push(`SOL Raised: ${data.solRaised.toFixed(4)}`);
    }
  }
  // Generic format
  else {
    const title = data.eventName || data.name || 'Event';

    if (format === 'html') {
      lines.push(`📌 <b>${title}</b>`);
      for (const [key, value] of Object.entries(data)) {
        if (key === 'type' || key === 'eventName' || key === 'name') continue;
        lines.push(`${key}: ${formatValue(value)}`);
      }
    } else if (format === 'markdown') {
      lines.push(`📌 *${escapeMarkdown(title)}*`);
      for (const [key, value] of Object.entries(data)) {
        if (key === 'type' || key === 'eventName' || key === 'name') continue;
        lines.push(`${escapeMarkdown(key)}: ${formatValue(value)}`);
      }
    } else {
      lines.push(`📌 ${title}`);
      for (const [key, value] of Object.entries(data)) {
        if (key === 'type' || key === 'eventName' || key === 'name') continue;
        lines.push(`${key}: ${formatValue(value)}`);
      }
    }
  }

  return lines.join('\n');
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

function escapeMarkdown(text: string): string {
  return text.replace(/([_*\[\]()~`>#+=|{}.!-])/g, '\\$1');
}
