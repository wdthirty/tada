// Parser Router
// Routes transactions to the appropriate program-specific parser

import type { DecodedEvent } from '@tada/shared';
import type { SubscribeUpdate } from 'helius-laserstream';
import { ProgramParser, getAccountKeys } from './types.js';
import { pumpBondingCurveParser } from './pump-bonding-curve.js';
import { meteoraDBCParser } from './meteora-dbc.js';
import { pumpswapParser } from './pumpswap.js';
import { meteoraDAMMV2Parser } from './meteora-damm-v2.js';
import { meteoraDAMMV1Parser } from './meteora-damm-v1.js';
import { meteoraDLMMParser } from './meteora-dlmm.js';

// All available parsers
const PARSERS: ProgramParser[] = [
  pumpBondingCurveParser,
  meteoraDBCParser,
  pumpswapParser,
  meteoraDAMMV2Parser,
  meteoraDAMMV1Parser,
  meteoraDLMMParser,
];

// Map program addresses to parsers for fast lookup
const PARSER_MAP = new Map<string, ProgramParser>();
for (const parser of PARSERS) {
  PARSER_MAP.set(parser.programAddress, parser);
}

/**
 * Parse a Laserstream transaction update into DecodedEvents
 * Routes to the appropriate program-specific parser(s)
 *
 * A transaction can involve multiple programs, so we try all matching parsers
 */
export function parseTransaction(update: SubscribeUpdate): DecodedEvent[] {
  const tx = update.transaction;
  if (!tx) return [];

  const txData = tx.transaction;
  const meta = txData.meta;
  const message = txData.transaction.message;

  // Get all account keys to identify which programs are involved
  const accountKeys = getAccountKeys(message, meta);

  // Find all parsers for programs involved in this transaction
  const involvedParsers: ProgramParser[] = [];
  for (const accountKey of accountKeys) {
    const parser = PARSER_MAP.get(accountKey);
    if (parser && !involvedParsers.includes(parser)) {
      involvedParsers.push(parser);
    }
  }

  // If no parsers match, return empty array
  if (involvedParsers.length === 0) return [];

  // Parse with each involved parser
  const allEvents: DecodedEvent[] = [];
  for (const parser of involvedParsers) {
    try {
      const events = parser.parse(update);
      allEvents.push(...events);
    } catch (error) {
      console.error(`[Parser] Failed to parse with ${parser.programId}:`, error);
    }
  }

  return allEvents;
}

// Export individual parsers for testing
export {
  pumpBondingCurveParser,
  meteoraDBCParser,
  pumpswapParser,
  meteoraDAMMV2Parser,
  meteoraDAMMV1Parser,
  meteoraDLMMParser,
};
