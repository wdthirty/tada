// Transaction Parser
// Converts raw Laserstream transaction data to DecodedEvent format (event-centric model)

import { SubscribeUpdate } from 'helius-laserstream';
import bs58 from 'bs58';
import {
  DecodedEvent,
  EventSource,
  EventSourceType,
  ParsedTransaction,
  ParsedInstruction,
  InnerInstruction,
  SolTransfer,
  TokenTransfer,
  ParsedEvent,
  RawTransaction,
  PROGRAMS,
  PROGRAM_ADDRESS_TO_ID,
  KNOWN_AGGREGATORS,
  ProgramId,
} from '@tada/shared';
import { decodeInstruction, parseEventsFromLogs, parseEventsFromInnerInstructions, decodeEvent } from './decoder.js';

// Convert Buffer/Uint8Array to base58 string
function toBase58(data: Uint8Array | Buffer | string): string {
  if (typeof data === 'string') return data;
  return bs58.encode(data);
}

// Parse a raw Laserstream transaction update into our ParsedTransaction format
export function parseTransaction(update: SubscribeUpdate): ParsedTransaction {
  const tx = update.transaction!;
  const txData = tx.transaction;
  const meta = txData.meta;
  const message = txData.transaction.message;

  // blockTime can be on the update.transaction directly or in meta
  const blockTime = Number(tx.blockTime || meta.blockTime || 0);

  // Get signature
  const signature = toBase58(txData.signature);

  // Get all account keys (resolve lookup tables if present)
  const accountKeys = getAccountKeys(message, meta);

  // Find which of our programs is in this transaction
  const programIds = findInvolvedPrograms(accountKeys);
  const primaryProgramId = programIds[0] || accountKeys[0]; // First matched program

  // Parse instructions
  const instructions = parseInstructions(message.instructions, accountKeys, programIds);
  const innerInstructions = parseInnerInstructions(meta.innerInstructions || [], accountKeys);

  // Find primary instruction (first instruction to a program we care about)
  const primaryInstruction = findPrimaryInstruction(instructions, programIds) || instructions[0];

  // Parse balance changes
  const solTransfers = parseSolTransfers(accountKeys, meta.preBalances, meta.postBalances);
  const tokenTransfers = parseTokenTransfers(meta.preTokenBalances || [], meta.postTokenBalances || [], accountKeys);

  // Parse events from logs
  const events = parseEvents(meta.logMessages || [], signature, tx.slot, programIds);

  // Build raw transaction for escape hatch
  const raw = buildRawTransaction(txData, meta, accountKeys);

  return {
    // Identity
    signature,
    slot: Number(tx.slot),
    blockTime,

    // Status
    success: meta.err === null,
    error: meta.err ? JSON.stringify(meta.err) : null,

    // Fees & Compute
    fee: BigInt(meta.fee),
    computeUnits: Number(meta.computeUnitsConsumed || 0),

    // Accounts
    accounts: accountKeys,
    signer: accountKeys[0], // First account is fee payer/signer

    // Programs
    programId: primaryProgramId,
    programIds: programIds,

    // Instructions
    instruction: primaryInstruction,
    instructions: instructions,
    innerInstructions: innerInstructions,

    // Balance Changes
    solTransfers,
    tokenTransfers,

    // Logs & Events
    logs: meta.logMessages || [],
    events,

    // Raw
    raw,
  };
}

// Get all account keys, resolving lookup tables
function getAccountKeys(message: any, meta: any): string[] {
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

// Find which of our supported programs are involved in this transaction
function findInvolvedPrograms(accountKeys: string[]): string[] {
  const supportedAddresses = new Set<string>(Object.values(PROGRAMS).map(p => p.address));
  return accountKeys.filter(key => supportedAddresses.has(key));
}

// Parse top-level instructions
function parseInstructions(
  rawInstructions: any[],
  accountKeys: string[],
  programIds: string[]
): ParsedInstruction[] {
  return rawInstructions.map((ix, index) => {
    const programId = accountKeys[ix.programIdIndex];
    const accounts = ix.accounts.map((i: number) => accountKeys[i]);
    const data = toBase58(ix.data);

    // Try to decode if it's one of our programs
    const decoded = decodeInstruction(programId, data, accounts);

    return {
      programId,
      name: decoded?.name || 'unknown',
      args: decoded?.args || {},
      accounts: decoded?.namedAccounts || {},
      accountsList: accounts,
      data,
      index,
    };
  });
}

// Parse inner instructions (CPI calls)
function parseInnerInstructions(
  rawInner: any[],
  accountKeys: string[]
): InnerInstruction[] {
  return rawInner.map(inner => ({
    programId: accountKeys[inner.instructions[0]?.programIdIndex] || '',
    index: inner.index,
    instructions: inner.instructions.map((ix: any, i: number) => {
      const programId = accountKeys[ix.programIdIndex];
      const accounts = ix.accounts.map((idx: number) => accountKeys[idx]);
      const data = toBase58(ix.data);
      const decoded = decodeInstruction(programId, data, accounts);

      return {
        programId,
        name: decoded?.name || 'unknown',
        args: decoded?.args || {},
        accounts: decoded?.namedAccounts || {},
        accountsList: accounts,
        data,
        index: i,
      };
    }),
  }));
}

// Find the primary instruction (first instruction to a program we support)
function findPrimaryInstruction(
  instructions: ParsedInstruction[],
  programIds: string[]
): ParsedInstruction | undefined {
  const programSet = new Set(programIds);
  return instructions.find(ix => programSet.has(ix.programId));
}

// Parse SOL balance changes
function parseSolTransfers(
  accountKeys: string[],
  preBalances: number[],
  postBalances: number[]
): SolTransfer[] {
  const transfers: SolTransfer[] = [];

  for (let i = 0; i < accountKeys.length; i++) {
    const pre = BigInt(preBalances[i] || 0);
    const post = BigInt(postBalances[i] || 0);
    const change = post - pre;

    // Only include accounts with balance changes
    if (change !== BigInt(0)) {
      transfers.push({
        account: accountKeys[i],
        change,
        preBalance: pre,
        postBalance: post,
      });
    }
  }

  return transfers;
}

// Parse token balance changes
function parseTokenTransfers(
  preTokenBalances: any[],
  postTokenBalances: any[],
  accountKeys: string[]
): TokenTransfer[] {
  const transfers: TokenTransfer[] = [];
  const seen = new Set<string>();

  // Build a map of pre-balances
  const preMap = new Map<string, any>();
  for (const balance of preTokenBalances) {
    const key = `${balance.accountIndex}-${balance.mint}`;
    preMap.set(key, balance);
  }

  // Compare with post-balances
  for (const post of postTokenBalances) {
    const key = `${post.accountIndex}-${post.mint}`;
    const pre = preMap.get(key);

    const preAmount = BigInt(pre?.uiTokenAmount?.amount || '0');
    const postAmount = BigInt(post.uiTokenAmount?.amount || '0');

    if (preAmount !== postAmount) {
      transfers.push({
        mint: post.mint,
        owner: post.owner || accountKeys[post.accountIndex],
        amount: postAmount - preAmount,
        decimals: post.uiTokenAmount?.decimals || 0,
        uiAmount: (post.uiTokenAmount?.uiAmount || 0) - (pre?.uiTokenAmount?.uiAmount || 0),
      });
    }

    seen.add(key);
  }

  // Check for accounts that existed in pre but not post (closed accounts)
  for (const pre of preTokenBalances) {
    const key = `${pre.accountIndex}-${pre.mint}`;
    if (!seen.has(key)) {
      transfers.push({
        mint: pre.mint,
        owner: pre.owner || accountKeys[pre.accountIndex],
        amount: -BigInt(pre.uiTokenAmount?.amount || '0'),
        decimals: pre.uiTokenAmount?.decimals || 0,
        uiAmount: -(pre.uiTokenAmount?.uiAmount || 0),
      });
    }
  }

  return transfers;
}

// Parse events from program logs
function parseEvents(
  logs: string[],
  signature: string,
  slot: bigint | number,
  programIds: string[]
): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  let currentProgram: string | null = null;
  let eventIndex = 0;

  for (const log of logs) {
    // Track which program is currently executing
    const invokeMatch = log.match(/^Program (\w+) invoke/);
    if (invokeMatch) {
      currentProgram = invokeMatch[1];
      continue;
    }

    // Look for "Program data:" logs (Anchor events)
    if (log.startsWith('Program data:') && currentProgram) {
      const base64Data = log.slice('Program data: '.length);
      try {
        const decoded = decodeEvent(currentProgram, base64Data);
        if (decoded) {
          events.push({
            name: decoded.name,
            data: decoded.data,
            programId: currentProgram,
            signature,
            slot: Number(slot),
            index: eventIndex++,
          });
        }
      } catch (e) {
        // Ignore decode errors
      }
    }
  }

  return events;
}

// Build raw transaction object for escape hatch
function buildRawTransaction(txData: any, meta: any, accountKeys: string[]): RawTransaction {
  const message = txData.transaction.message;

  return {
    transaction: {
      message: {
        accountKeys,
        instructions: message.instructions.map((ix: any) => ({
          programIdIndex: ix.programIdIndex,
          accounts: Array.from(ix.accounts),
          data: toBase58(ix.data),
        })),
        recentBlockhash: toBase58(message.recentBlockhash),
        addressTableLookups: message.addressTableLookups?.map((lookup: any) => ({
          accountKey: toBase58(lookup.accountKey),
          writableIndexes: Array.from(lookup.writableIndexes || []),
          readonlyIndexes: Array.from(lookup.readonlyIndexes || []),
        })),
      },
      signatures: [toBase58(txData.signature)],
    },
    meta: {
      err: meta.err,
      fee: Number(meta.fee),
      preBalances: meta.preBalances.map(Number),
      postBalances: meta.postBalances.map(Number),
      preTokenBalances: meta.preTokenBalances || [],
      postTokenBalances: meta.postTokenBalances || [],
      innerInstructions: meta.innerInstructions || [],
      logMessages: meta.logMessages || [],
      computeUnitsConsumed: Number(meta.computeUnitsConsumed || 0),
      loadedAddresses: meta.loadedAddresses,
      returnData: meta.returnData,
      rewards: meta.rewards,
    },
  };
}

// ============================================
// EVENT-CENTRIC API (PRIMARY)
// ============================================

import { parseTransaction as parseWithProgramParsers } from './parsers/index.js';

/**
 * Extract decoded events from a Laserstream transaction update.
 * This is the primary API - returns an array of DecodedEvent objects.
 * One transaction can produce multiple events (e.g., multi-hop swaps).
 *
 * Uses program-specific parsers for accurate, tailored parsing.
 */
export function extractEvents(update: SubscribeUpdate): DecodedEvent[] {
  // Delegate to the new parser system
  return parseWithProgramParsers(update);
}
