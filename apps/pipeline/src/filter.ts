// Filter Engine
// Evaluates declarative filters against DecodedEvent
// MVP: Declarative-only (no code filters)

import type { Filter, FilterCondition, FilterOperator, DecodedEvent } from '@tada/shared';

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
 * Extract all account addresses from an event's data
 * Looks for common patterns: pool, user, mint, etc.
 */
function extractAccounts(event: DecodedEvent): string[] {
  const accounts: string[] = [event.signer];

  // Extract from event data recursively
  const extract = (obj: any): void => {
    if (!obj || typeof obj !== 'object') return;

    for (const [key, value] of Object.entries(obj)) {
      // Common account field names
      const isAccountField = [
        'pool', 'user', 'mint', 'tokenMint', 'baseMint', 'quoteMint',
        'authority', 'owner', 'payer', 'creator', 'config', 'tokenAccount',
        'sourceTokenAccount', 'destinationTokenAccount', 'feeAccount'
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
