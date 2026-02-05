// Filter Engine
// Evaluates declarative filters against DecodedEvent
// MVP: Declarative-only (no code filters)

import type { Filter, FilterCondition, FilterOperator, DecodedEvent } from '@tada/shared';
import { LAMPORTS_PER_SOL } from '@tada/shared';

/**
 * Evaluate a filter against an event
 * Returns true if the event passes the filter
 */
export function evaluateFilter(filter: Filter, event: DecodedEvent): boolean {
  // Empty filter = pass everything
  if (!filter || Object.keys(filter).length === 0) {
    return true;
  }

  // Handle $and - all conditions must pass
  if (filter.$and && filter.$and.length > 0) {
    return filter.$and.every(f => evaluateFilter(f, event));
  }

  // Handle $or - at least one condition must pass
  if (filter.$or && filter.$or.length > 0) {
    return filter.$or.some(f => evaluateFilter(f, event));
  }

  // Check instructions filter (event name must match one of the listed names)
  if (filter.instructions && filter.instructions.length > 0) {
    if (!filter.instructions.includes(event.name)) {
      return false;
    }
  }

  // Check mints filter (convenience filter for token mint addresses)
  if (filter.mints && filter.mints.length > 0) {
    const eventMints = extractMints(event);
    const hasMatch = filter.mints.some(mint => eventMints.includes(mint));
    if (!hasMatch) {
      return false;
    }
  }

  // Check wallets filter (convenience filter for wallet addresses)
  if (filter.wallets && filter.wallets.length > 0) {
    const eventWallets = extractWallets(event);
    const hasMatch = filter.wallets.some(wallet => eventWallets.includes(wallet));
    if (!hasMatch) {
      return false;
    }
  }

  // Check isBuy filter (convenience filter for trade direction)
  if (filter.isBuy !== undefined) {
    const eventIsBuy = extractIsBuy(event);
    if (eventIsBuy !== null && eventIsBuy !== filter.isBuy) {
      return false;
    }
  }

  // Check SOL amount filter
  if (filter.solAmount) {
    const solAmount = extractSolAmount(event);
    if (solAmount !== null) {
      if (filter.solAmount.min !== undefined && solAmount < filter.solAmount.min) {
        return false;
      }
      if (filter.solAmount.max !== undefined && solAmount > filter.solAmount.max) {
        return false;
      }
    }
  }

  // Check token amount filter
  if (filter.tokenAmount) {
    const tokenAmount = extractTokenAmount(event);
    if (tokenAmount !== null) {
      if (filter.tokenAmount.min !== undefined && tokenAmount < filter.tokenAmount.min) {
        return false;
      }
      if (filter.tokenAmount.max !== undefined && tokenAmount > filter.tokenAmount.max) {
        return false;
      }
    }
  }

  // Check accounts filter
  if (filter.accounts) {
    const eventAccounts = extractAccounts(event);

    // Include filter - at least one account must be in the include list
    if (filter.accounts.include && filter.accounts.include.length > 0) {
      const hasMatch = filter.accounts.include.some(addr => eventAccounts.includes(addr));
      if (!hasMatch) {
        return false;
      }
    }

    // Exclude filter - none of the accounts should be in the exclude list
    if (filter.accounts.exclude && filter.accounts.exclude.length > 0) {
      const hasExcluded = filter.accounts.exclude.some(addr => eventAccounts.includes(addr));
      if (hasExcluded) {
        return false;
      }
    }
  }

  // Check conditions (field comparisons)
  if (filter.conditions && filter.conditions.length > 0) {
    for (const condition of filter.conditions) {
      if (!evaluateCondition(condition, event)) {
        return false;
      }
    }
  }

  // Code filters are deferred to post-MVP
  if (filter.code) {
    console.warn('[Filter] Code filters not supported in MVP, ignoring');
  }

  return true;
}

/**
 * Extract mint addresses from an event's data
 * Looks for common mint field names (snake_case from IDL)
 */
function extractMints(event: DecodedEvent): string[] {
  const mints: string[] = [];
  const d = event.data;

  // Common mint field names (snake_case as per IDL)
  const mintFields = [
    'mint',           // pump.fun bonding curve
    'base_mint',      // pumpswap, meteora
    'quote_mint',     // pumpswap, meteora
    'token_mint',     // meteora dbc
    'input_mint',     // swaps
    'output_mint',    // swaps
    // Also check camelCase for backwards compatibility
    'baseMint',
    'quoteMint',
    'tokenMint',
    'inputMint',
    'outputMint',
  ];

  for (const field of mintFields) {
    if (d[field] && typeof d[field] === 'string') {
      mints.push(d[field]);
    }
  }

  return mints;
}

/**
 * Extract wallet addresses from an event's data
 * Looks for user/trader field names
 */
function extractWallets(event: DecodedEvent): string[] {
  const wallets: string[] = [event.signer];
  const d = event.data;

  // Common wallet/user field names
  const walletFields = ['user', 'creator', 'trader', 'owner', 'authority', 'from'];

  for (const field of walletFields) {
    if (d[field] && typeof d[field] === 'string') {
      wallets.push(d[field]);
    }
  }

  return wallets;
}

/**
 * Extract trade direction (isBuy) from an event
 * Returns true for buy, false for sell, null if unknown
 */
function extractIsBuy(event: DecodedEvent): boolean | null {
  const d = event.data;
  const name = event.name.toLowerCase();

  // Check explicit is_buy field (pump.fun bonding curve)
  if (d.is_buy !== undefined) {
    return Boolean(d.is_buy);
  }
  if (d.isBuy !== undefined) {
    return Boolean(d.isBuy);
  }

  // Check trade_direction field (meteora dbc: 0=buy, 1=sell)
  if (d.trade_direction !== undefined) {
    return d.trade_direction === 0;
  }
  if (d.tradeDirection !== undefined) {
    return d.tradeDirection === 0;
  }

  // Infer from event name
  if (name.includes('buy')) return true;
  if (name.includes('sell')) return false;

  return null;
}

/**
 * Extract SOL amount from an event (in SOL, not lamports)
 * Returns null if no SOL amount found
 */
function extractSolAmount(event: DecodedEvent): number | null {
  const d = event.data;

  // Try various SOL amount fields (snake_case as per IDL)
  const solFields = [
    'sol_amount',           // pump.fun bonding curve
    'quote_amount_in',      // pumpswap buy
    'quote_amount_out',     // pumpswap sell
    'quote_amount',         // generic
    // camelCase for backwards compatibility
    'solAmount',
    'quoteAmountIn',
    'quoteAmountOut',
    'quoteAmount',
  ];

  for (const field of solFields) {
    if (d[field] !== undefined) {
      const value = toNumber(d[field]);
      // Convert lamports to SOL
      return value / LAMPORTS_PER_SOL;
    }
  }

  return null;
}

/**
 * Extract token amount from an event
 * Returns null if no token amount found
 */
function extractTokenAmount(event: DecodedEvent): number | null {
  const d = event.data;

  // Try various token amount fields (snake_case as per IDL)
  const tokenFields = [
    'token_amount',         // pump.fun bonding curve
    'base_amount_in',       // pumpswap sell
    'base_amount_out',      // pumpswap buy
    'base_amount',          // generic
    'amount',               // generic
    // camelCase for backwards compatibility
    'tokenAmount',
    'baseAmountIn',
    'baseAmountOut',
    'baseAmount',
  ];

  for (const field of tokenFields) {
    if (d[field] !== undefined) {
      return toNumber(d[field]);
    }
  }

  return null;
}

/**
 * Extract all account addresses from an event's data
 * Looks for common patterns: pool, user, mint, etc.
 */
function extractAccounts(event: DecodedEvent): string[] {
  const accounts: string[] = [event.signer];

  // Extract from event data recursively
  const extract = (obj: any): void => {
    if (!obj || typeof obj !== 'object') return;

    for (const [key, value] of Object.entries(obj)) {
      // Common account field names (both snake_case and camelCase)
      const isAccountField = [
        'pool', 'user', 'mint', 'creator', 'config', 'authority', 'owner', 'payer',
        // snake_case (IDL)
        'token_mint', 'base_mint', 'quote_mint', 'bonding_curve',
        'token_account', 'source_token_account', 'destination_token_account', 'fee_account',
        // camelCase (legacy)
        'tokenMint', 'baseMint', 'quoteMint', 'bondingCurve',
        'tokenAccount', 'sourceTokenAccount', 'destinationTokenAccount', 'feeAccount',
      ].includes(key);

      if (isAccountField && typeof value === 'string' && value.length >= 32) {
        accounts.push(value);
      }

      // Recurse into nested objects
      if (typeof value === 'object' && value !== null) {
        extract(value);
      }
    }
  };

  extract(event.data);
  return accounts;
}

/**
 * Evaluate a single condition against an event
 */
function evaluateCondition(condition: FilterCondition, event: DecodedEvent): boolean {
  const value = getFieldValue(event, condition.field);
  return compareValues(value, condition.op, condition.value);
}

/**
 * Get a field value from an event using dot notation
 * e.g., "data.amount" or "data.swapResult.outputAmount"
 */
function getFieldValue(event: DecodedEvent, field: string): any {
  const parts = field.split('.');
  let current: any = event;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

/**
 * Compare two values using the specified operator
 */
function compareValues(actual: any, op: FilterOperator, expected: any): boolean {
  // Handle undefined/null
  if (actual === undefined || actual === null) {
    if (op === 'eq') return expected === null || expected === undefined;
    if (op === 'neq') return expected !== null && expected !== undefined;
    return false;
  }

  // Convert strings that look like numbers for numeric comparisons
  const numActual = typeof actual === 'string' ? parseFloat(actual) : actual;
  const numExpected = typeof expected === 'string' ? parseFloat(expected) : expected;

  switch (op) {
    case 'eq':
      return actual === expected || String(actual) === String(expected);

    case 'neq':
      return actual !== expected && String(actual) !== String(expected);

    case 'gt':
      return !isNaN(numActual) && !isNaN(numExpected) && numActual > numExpected;

    case 'gte':
      return !isNaN(numActual) && !isNaN(numExpected) && numActual >= numExpected;

    case 'lt':
      return !isNaN(numActual) && !isNaN(numExpected) && numActual < numExpected;

    case 'lte':
      return !isNaN(numActual) && !isNaN(numExpected) && numActual <= numExpected;

    case 'in':
      if (!Array.isArray(expected)) return false;
      return expected.includes(actual) || expected.map(String).includes(String(actual));

    case 'nin':
      if (!Array.isArray(expected)) return true;
      return !expected.includes(actual) && !expected.map(String).includes(String(actual));

    case 'contains':
      if (typeof actual !== 'string') return false;
      return actual.toLowerCase().includes(String(expected).toLowerCase());

    default:
      console.warn(`[Filter] Unknown operator: ${op}`);
      return false;
  }
}

/**
 * Convert various numeric types to number
 */
function toNumber(value: any): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const n = parseFloat(value);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}
