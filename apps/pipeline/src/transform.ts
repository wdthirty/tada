// Transform Engine
// Applies template transforms to DecodedEvent
// MVP: Template-only (no code transforms)

import type { Transform, TransformTemplate, TransformField, TransformPipe, DecodedEvent, ProgramId } from '@tada/shared';
import { LAMPORTS_PER_SOL } from '@tada/shared';

/**
 * Transformed event output
 */
export interface TransformedEvent {
  // Always present
  id: string;
  pipelineId: string;
  program: ProgramId;
  timestamp: number;
  signature: string;

  // Transform-specific data
  data: Record<string, any>;
}

/**
 * Apply a transform to an event
 */
export function applyTransform(
  transform: Transform,
  event: DecodedEvent,
  pipelineId: string
): TransformedEvent {
  const base: TransformedEvent = {
    id: event.id,
    pipelineId,
    program: event.program,
    timestamp: event.blockTime * 1000, // Convert to milliseconds
    signature: event.signature,
    data: {},
  };

  switch (transform.mode) {
    case 'template':
      base.data = applyTemplate(transform.template || 'raw', event);
      break;

    case 'fields':
      base.data = applyFieldMapping(transform.fields || [], event);
      break;

    case 'code':
      // Code transforms deferred to post-MVP
      console.warn('[Transform] Code transforms not supported in MVP, using raw');
      base.data = applyTemplate('raw', event);
      break;

    default:
      base.data = applyTemplate('raw', event);
  }

  return base;
}

/**
 * Apply a template transform
 */
function applyTemplate(template: TransformTemplate, event: DecodedEvent): Record<string, any> {
  switch (template) {
    case 'trade':
      return extractTradeData(event);

    case 'transfer':
      return extractTransferData(event);

    case 'migration':
      return extractMigrationData(event);

    case 'raw':
    default:
      return {
        name: event.name,
        program: event.program,
        signer: event.signer,
        ...event.data,
      };
  }
}

/**
 * Extract trade-specific data from an event
 * Works for: TradeEvent, BuyEvent, SellEvent, Swap, EvtSwap2
 */
function extractTradeData(event: DecodedEvent): Record<string, any> {
  const d = event.data;
  const name = event.name.toLowerCase();

  // Common trade fields - try multiple patterns
  const result: Record<string, any> = {
    type: 'trade',
    eventName: event.name,
    trader: event.signer,
  };

  // Detect trade direction (try both snake_case and camelCase)
  const isBuy = d.is_buy !== undefined ? d.is_buy : d.isBuy;
  const tradeDirection = d.trade_direction !== undefined ? d.trade_direction : d.tradeDirection;

  if (name.includes('buy') || isBuy === true || tradeDirection === 0) {
    result.direction = 'buy';
  } else if (name.includes('sell') || isBuy === false || tradeDirection === 1) {
    result.direction = 'sell';
  } else {
    result.direction = 'swap';
  }

  // Extract token/mint (try both snake_case and camelCase)
  result.token = d.mint || d.token_mint || d.tokenMint || d.base_mint || d.baseMint || d.input_mint || d.inputMint || d.pool || null;

  // Extract amounts - try various field patterns (snake_case and camelCase)
  // SOL amount
  const solAmount = d.sol_amount || d.solAmount || d.quote_amount || d.quoteAmount || d.sol_reserve_amount || d.solReserveAmount;
  if (solAmount !== undefined) {
    result.solAmount = toNumber(solAmount) / LAMPORTS_PER_SOL;
  }

  // Token amount
  const tokenAmount = d.token_amount || d.tokenAmount || d.base_amount || d.baseAmount || d.amount;
  if (tokenAmount !== undefined) {
    result.tokenAmount = toNumber(tokenAmount);
  }

  // For swap events with input/output (snake_case and camelCase)
  const inputAmount = d.input_amount || d.inputAmount;
  const outputAmount = d.output_amount || d.outputAmount;

  if (inputAmount !== undefined) {
    result.inputAmount = toNumber(inputAmount);
  }
  if (outputAmount !== undefined) {
    result.outputAmount = toNumber(outputAmount);
  }

  // For EvtSwap2 with nested swapResult (snake_case and camelCase)
  const swapResult = d.swap_result || d.swapResult;
  if (swapResult) {
    result.inputAmount = toNumber(swapResult.included_fee_input_amount || swapResult.includedFeeInputAmount || swapResult.actual_input_amount || swapResult.actualInputAmount);
    result.outputAmount = toNumber(swapResult.output_amount || swapResult.outputAmount);
    result.tradingFee = toNumber(swapResult.trading_fee || swapResult.tradingFee);
  }

  // Price if available (snake_case and camelCase)
  const virtualSolReserves = d.virtual_sol_reserves || d.virtualSolReserves;
  const virtualTokenReserves = d.virtual_token_reserves || d.virtualTokenReserves;

  if (virtualSolReserves && virtualTokenReserves) {
    const solReserves = toNumber(virtualSolReserves);
    const tokenReserves = toNumber(virtualTokenReserves);
    if (tokenReserves > 0) {
      result.price = solReserves / tokenReserves;
    }
  }

  // Pool info
  result.pool = d.pool || null;

  return result;
}

/**
 * Extract transfer-specific data from an event
 */
function extractTransferData(event: DecodedEvent): Record<string, any> {
  const d = event.data;

  return {
    type: 'transfer',
    eventName: event.name,
    from: d.from || d.source || event.signer,
    to: d.to || d.destination,
    amount: toNumber(d.amount),
    mint: d.mint || null,
  };
}

/**
 * Extract migration-specific data from an event
 * For: CompleteEvent (pump.fun), EvtCurveComplete (meteora)
 */
function extractMigrationData(event: DecodedEvent): Record<string, any> {
  const d = event.data;

  // Try both snake_case and camelCase
  const virtualSolReserves = d.virtual_sol_reserves || d.virtualSolReserves;

  return {
    type: 'migration',
    eventName: event.name,
    token: d.mint || d.token_mint || d.tokenMint || d.base_mint || d.baseMint,
    pool: d.pool || d.amm || null,
    creator: d.user || event.signer,
    solRaised: virtualSolReserves ? toNumber(virtualSolReserves) / LAMPORTS_PER_SOL : null,
    timestamp: event.blockTime,
  };
}

/**
 * Apply field mapping transform
 */
function applyFieldMapping(
  fields: TransformField[],
  event: DecodedEvent
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const field of fields) {
    let value = getFieldValue(event, field.source);

    // Apply pipe if specified
    if (field.pipe && value !== undefined) {
      value = applyPipe(value, field.pipe);
    }

    result[field.target] = value;
  }

  return result;
}

/**
 * Get a field value using dot notation
 */
function getFieldValue(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

// Initial real token reserves for pump.fun bonding curve (793.1M tokens with 6 decimals)
const PUMP_INITIAL_REAL_TOKEN_RESERVES = 793_100_000_000_000;

/**
 * Apply a pipe transformation to a value
 */
function applyPipe(value: any, pipe: TransformPipe): any {
  switch (pipe) {
    case 'lamportsToSol':
      return toNumber(value) / LAMPORTS_PER_SOL;

    case 'base58':
      // Already base58 in most cases
      return String(value);

    case 'timestamp':
      // Convert unix seconds to ISO string
      const ts = toNumber(value);
      return new Date(ts * 1000).toISOString();

    case 'shorten':
      // Shorten addresses: abc...xyz
      const str = String(value);
      if (str.length > 12) {
        return `${str.slice(0, 4)}...${str.slice(-4)}`;
      }
      return str;

    case 'bondingCurveProgress':
      // Calculate bonding curve completion percentage
      // Progress = (initial - current) / initial * 100
      const currentReserves = toNumber(value);
      const progress = ((PUMP_INITIAL_REAL_TOKEN_RESERVES - currentReserves) / PUMP_INITIAL_REAL_TOKEN_RESERVES) * 100;
      // Clamp between 0 and 100, round to 2 decimal places
      return Math.round(Math.max(0, Math.min(100, progress)) * 100) / 100;

    default:
      return value;
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
