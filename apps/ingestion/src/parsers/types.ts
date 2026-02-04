// Parser Types
// Common types and interfaces for program-specific parsers

import type { DecodedEvent, ProgramId } from '@tada/shared';
import type { SubscribeUpdate } from 'helius-laserstream';
import bs58 from 'bs58';

/**
 * Program-specific parser interface
 * Each program implements this to parse its transactions into DecodedEvents
 */
export interface ProgramParser {
  programId: ProgramId;
  programAddress: string;

  /**
   * Parse a Laserstream transaction update into DecodedEvents
   * Returns empty array if transaction doesn't involve this program
   */
  parse(update: SubscribeUpdate): DecodedEvent[];
}

/**
 * Helper to convert Uint8Array/Buffer to base58 string
 */
export function toBase58(data: Uint8Array | Buffer | string): string {
  if (typeof data === 'string') return data;
  return bs58.encode(data);
}

/**
 * Convert PublicKey objects and BN objects in event data to strings
 * Recursively processes nested objects and arrays
 */
export function convertEventData(data: any): any {
  if (data === null || data === undefined) return data;

  // Handle PublicKey objects (they have toBase58 method)
  if (data && typeof data === 'object' && typeof data.toBase58 === 'function') {
    return data.toBase58();
  }

  // Handle BN objects (they have toNumber method)
  if (data && typeof data === 'object' && typeof data.toNumber === 'function') {
    try {
      return data.toString();
    } catch {
      return data.toNumber();
    }
  }

  // Handle BigInt
  if (typeof data === 'bigint') {
    return data.toString();
  }

  // Handle Buffer/Uint8Array
  if (Buffer.isBuffer(data) || data instanceof Uint8Array) {
    return bs58.encode(data);
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(convertEventData);
  }

  // Handle objects
  if (typeof data === 'object') {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = convertEventData(value);
    }
    return result;
  }

  return data;
}

/**
 * Get all account keys from a transaction, including lookup table addresses
 */
export function getAccountKeys(message: any, meta: any): string[] {
  const keys: string[] = [];

  // Static account keys from message
  if (message.accountKeys) {
    for (const key of message.accountKeys) {
      keys.push(toBase58(key));
    }
  }

  // Add loaded addresses from lookup tables (versioned transactions)
  if (meta.loadedAddresses) {
    if (meta.loadedAddresses.writable) {
      for (const key of meta.loadedAddresses.writable) {
        keys.push(toBase58(key));
      }
    }
    if (meta.loadedAddresses.readonly) {
      for (const key of meta.loadedAddresses.readonly) {
        keys.push(toBase58(key));
      }
    }
  }

  return keys;
}

/**
 * Detect if transaction was called directly or via aggregator
 */
export type EventSourceType = 'direct' | 'jupiter' | 'raydium' | 'unknown';

export interface EventSource {
  type: EventSourceType;
  outerProgram?: string;
}

const KNOWN_AGGREGATORS: Record<string, EventSourceType> = {
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': 'jupiter',
  'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB': 'jupiter',
  'JUP2jxvXaqu7NQY1GmNF4m1vodw12LVXYxbFL2uJvfo': 'jupiter',
  'jupoNjAxXgZ4rjzxzPMP4oxduvQsQtZzyknqvzYNrNu': 'jupiter',
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'raydium',
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK': 'raydium',
};

export function detectEventSource(accountKeys: string[], instructions: any[]): EventSource {
  // Check if any aggregator programs are involved
  for (const key of accountKeys) {
    if (KNOWN_AGGREGATORS[key]) {
      return {
        type: KNOWN_AGGREGATORS[key],
        outerProgram: key,
      };
    }
  }

  return { type: 'direct' };
}
