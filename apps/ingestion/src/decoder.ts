// Instruction and Event Decoder
// Uses Anchor IDLs to decode binary instruction data and events
// Parses events from BOTH:
//   1. Program logs (emit!()) - via EventParser.parseLogs()
//   2. Inner instructions (emit_cpi!()) - via coder.events.decode()

import { PROGRAMS, IDL_MAP, AnchorIdl } from '@tada/shared';
import { EventParser, BorshCoder, Idl } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import * as borsh from '@coral-xyz/borsh';
import bs58 from 'bs58';

// Cache for discriminator lookups
const instructionDiscriminatorCache = new Map<string, Map<string, { name: string; layout: any; accounts: string[] }>>();
const eventDiscriminatorCache = new Map<string, Map<string, { name: string; layout: any }>>();

// Cache for Anchor event parsers (one per program)
const eventParserCache = new Map<string, EventParser>();

// Cache for Anchor BorshCoders (for innerInstruction event decoding)
const borshCoderCache = new Map<string, BorshCoder>();

// Get or create BorshCoder for a program
function getBorshCoder(programAddress: string): BorshCoder | null {
  if (borshCoderCache.has(programAddress)) {
    return borshCoderCache.get(programAddress)!;
  }

  const idl = IDL_MAP[programAddress];
  if (!idl) return null;

  try {
    const coder = new BorshCoder(idl as unknown as Idl);
    borshCoderCache.set(programAddress, coder);
    return coder;
  } catch (e) {
    return null;
  }
}

// Initialize event parser for a program using Anchor's EventParser
function getEventParser(programAddress: string): EventParser | null {
  if (eventParserCache.has(programAddress)) {
    return eventParserCache.get(programAddress)!;
  }

  const idl = IDL_MAP[programAddress];
  if (!idl) return null;

  try {
    const programId = new PublicKey(programAddress);
    const coder = new BorshCoder(idl as unknown as Idl);
    const parser = new EventParser(programId, coder);
    eventParserCache.set(programAddress, parser);
    return parser;
  } catch (e) {
    console.error(`[Decoder] Failed to create EventParser for ${programAddress}:`, e);
    return null;
  }
}

// Initialize caches for a program
function initializeCache(programAddress: string) {
  const idl = IDL_MAP[programAddress];
  if (!idl || instructionDiscriminatorCache.has(programAddress)) return;

  // Build instruction discriminator map
  const ixMap = new Map<string, { name: string; layout: any; accounts: string[] }>();
  for (const ix of idl.instructions || []) {
    const discriminator = Buffer.from(ix.discriminator).toString('hex');
    ixMap.set(discriminator, {
      name: ix.name,
      layout: buildLayout(ix.args, idl.types),
      accounts: ix.accounts.map((a: any) => a.name),
    });
  }
  instructionDiscriminatorCache.set(programAddress, ixMap);

  // Build event discriminator map
  const evtMap = new Map<string, { name: string; layout: any }>();
  for (const evt of idl.events || []) {
    const discriminator = Buffer.from(evt.discriminator).toString('hex');
    // Find type definition for this event
    const typeDef = idl.types?.find((t: any) => t.name === evt.name);
    evtMap.set(discriminator, {
      name: evt.name,
      layout: typeDef ? buildLayout(typeDef.type?.fields || [], idl.types) : null,
    });
  }
  eventDiscriminatorCache.set(programAddress, evtMap);
}

// Find which program (if any) owns this address
export function findProgramForAddress(address: string): typeof PROGRAMS[keyof typeof PROGRAMS] | undefined {
  return Object.values(PROGRAMS).find(p => p.address === address);
}

// Decode an instruction using the IDL
export function decodeInstruction(
  programId: string,
  data: string,
  accounts: string[]
): { name: string; args: Record<string, any>; namedAccounts: Record<string, string> } | null {
  initializeCache(programId);

  const ixMap = instructionDiscriminatorCache.get(programId);
  if (!ixMap) return null;

  try {
    const dataBuffer = bs58.decode(data);
    const discriminator = Buffer.from(dataBuffer.slice(0, 8)).toString('hex');

    const ixDef = ixMap.get(discriminator);
    if (!ixDef) return null;

    // Decode args
    let args: Record<string, any> = {};
    if (ixDef.layout && dataBuffer.length > 8) {
      try {
        args = ixDef.layout.decode(dataBuffer.slice(8));
      } catch (e) {
        // Failed to decode args, continue with empty args
      }
    }

    // Map accounts to names
    const namedAccounts: Record<string, string> = {};
    for (let i = 0; i < Math.min(accounts.length, ixDef.accounts.length); i++) {
      namedAccounts[ixDef.accounts[i]] = accounts[i];
    }

    return {
      name: ixDef.name,
      args: convertBigIntsToStrings(args),
      namedAccounts,
    };
  } catch (e) {
    return null;
  }
}

// Decode an event from base64 "Program data:" log
/**
 * Decode an event from base64 "Program data:" log (legacy method)
 * @deprecated Use parseEventsFromLogs() instead for proper Anchor event parsing
 */
export function decodeEvent(
  programId: string,
  base64Data: string
): { name: string; data: Record<string, any> } | null {
  initializeCache(programId);

  const evtMap = eventDiscriminatorCache.get(programId);
  if (!evtMap) return null;

  try {
    const dataBuffer = Buffer.from(base64Data, 'base64');
    const discriminator = dataBuffer.slice(0, 8).toString('hex');

    const evtDef = evtMap.get(discriminator);
    if (!evtDef) return null;

    let data: Record<string, any> = {};
    if (evtDef.layout && dataBuffer.length > 8) {
      try {
        data = evtDef.layout.decode(dataBuffer.slice(8));
      } catch (e) {
        // Failed to decode, continue with empty data
      }
    }

    return {
      name: evtDef.name,
      data: convertBigIntsToStrings(data),
    };
  } catch (e) {
    return null;
  }
}

/**
 * Parse events from log messages using Anchor's EventParser
 * This is the proper way to extract events from Anchor programs that use emit!()
 *
 * @param programAddress - The program address to parse events for
 * @param logs - The log messages from the transaction
 * @returns Array of parsed events with name and data
 */
export function parseEventsFromLogs(
  programAddress: string,
  logs: string[]
): Array<{ name: string; data: Record<string, any> }> {
  const parser = getEventParser(programAddress);
  if (!parser) return [];

  const events: Array<{ name: string; data: Record<string, any> }> = [];

  try {
    // Use Anchor's parseLogs generator - it handles the full log parsing
    const generator = parser.parseLogs(logs);

    for (const event of generator) {
      events.push({
        name: event.name,
        data: convertBigIntsToStrings(event.data),
      });
    }
  } catch (e) {
    // Silently ignore parsing errors
  }

  return events;
}

/**
 * Parse events from inner instructions using Anchor's coder.events.decode()
 * This handles programs that use emit_cpi!() instead of emit!()
 *
 * Inner instruction structure for CPI events:
 * - Some programs wrap events with an 8-byte CPI discriminator prefix
 * - The actual event data follows: [discriminator (8 bytes)][event data]
 * - Anchor's coder.events.decode() expects base64-encoded data
 *
 * @param programAddress - The program address to parse events for
 * @param innerInstructions - The inner instructions from transaction meta
 * @param accountKeys - All account keys (for resolving programIdIndex)
 * @returns Array of parsed events with name and data
 */
export function parseEventsFromInnerInstructions(
  programAddress: string,
  innerInstructions: any[],
  accountKeys: any[]
): Array<{ name: string; data: Record<string, any> }> {
  const coder = getBorshCoder(programAddress);
  if (!coder) return [];

  const events: Array<{ name: string; data: Record<string, any> }> = [];
  const programPubkey = new PublicKey(programAddress);

  for (const innerIx of innerInstructions) {
    if (!innerIx.instructions) continue;

    for (const ix of innerIx.instructions) {
      // Check if this instruction is from our program
      const programIdIndex = ix.programIdIndex;
      if (programIdIndex >= accountKeys.length) continue;

      const ixProgramId = toPublicKey(accountKeys[programIdIndex]);
      if (!ixProgramId || !ixProgramId.equals(programPubkey)) continue;

      // Get instruction data
      if (!ix.data) continue;
      const rawData = typeof ix.data === 'string'
        ? Buffer.from(bs58.decode(ix.data))
        : Buffer.from(ix.data);

      // Try to decode as event (with and without CPI wrapper)
      const decoded = tryDecodeEvent(coder, rawData);
      if (decoded) {
        events.push({
          name: decoded.name,
          data: convertBigIntsToStrings(decoded.data),
        });
      }
    }
  }

  return events;
}

/**
 * Try to decode event data with various offset strategies
 * Some CPI events have an 8-byte wrapper discriminator before the actual event
 */
function tryDecodeEvent(
  coder: BorshCoder,
  rawData: Buffer
): { name: string; data: any } | null {
  // Strategy 1: Direct decode (no wrapper)
  try {
    const base64Data = rawData.toString('base64');
    const decoded = (coder.events as any).decode(base64Data);
    if (decoded) {
      return decoded;
    }
  } catch (e) {
    // Continue to next strategy
  }

  // Strategy 2: Skip 8-byte CPI wrapper prefix
  if (rawData.length > 8) {
    try {
      const dataWithoutWrapper = rawData.subarray(8);
      const base64Data = dataWithoutWrapper.toString('base64');
      const decoded = (coder.events as any).decode(base64Data);
      if (decoded) {
        return decoded;
      }
    } catch (e) {
      // Continue
    }
  }

  return null;
}

/**
 * Convert account key to PublicKey
 */
function toPublicKey(key: any): PublicKey | null {
  try {
    if (key instanceof PublicKey) return key;
    if (Buffer.isBuffer(key) || key instanceof Uint8Array) {
      return new PublicKey(key);
    }
    if (typeof key === 'string') {
      return new PublicKey(key);
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Parse events from ALL supported programs in a transaction
 * This iterates through all program IDs and tries to parse events for each
 *
 * @param logs - The log messages from the transaction
 * @returns Map of program address to array of parsed events
 */
export function parseAllProgramEvents(
  logs: string[]
): Map<string, Array<{ name: string; data: Record<string, any> }>> {
  const results = new Map<string, Array<{ name: string; data: Record<string, any> }>>();

  for (const program of Object.values(PROGRAMS)) {
    const events = parseEventsFromLogs(program.address, logs);
    if (events.length > 0) {
      results.set(program.address, events);
    }
  }

  return results;
}

// Build a borsh layout from IDL type definitions
function buildLayout(fields: any[], types: any[]): any {
  if (!fields || fields.length === 0) return null;

  const layoutFields: any[] = [];

  for (const field of fields) {
    const layout = typeToLayout(field.type, types);
    if (layout) {
      layoutFields.push(layout(field.name));
    }
  }

  if (layoutFields.length === 0) return null;

  return borsh.struct(layoutFields);
}

// Convert IDL type to borsh layout
function typeToLayout(type: any, types: any[]): ((name: string) => any) | null {
  if (typeof type === 'string') {
    // Primitive types
    switch (type) {
      case 'bool': return (name: string) => borsh.bool(name);
      case 'u8': return (name: string) => borsh.u8(name);
      case 'i8': return (name: string) => borsh.i8(name);
      case 'u16': return (name: string) => borsh.u16(name);
      case 'i16': return (name: string) => borsh.i16(name);
      case 'u32': return (name: string) => borsh.u32(name);
      case 'i32': return (name: string) => borsh.i32(name);
      case 'u64': return (name: string) => borsh.u64(name);
      case 'i64': return (name: string) => borsh.i64(name);
      case 'u128': return (name: string) => borsh.u128(name);
      case 'i128': return (name: string) => borsh.i128(name);
      case 'f32': return (name: string) => borsh.f32(name);
      case 'f64': return (name: string) => borsh.f64(name);
      case 'string': return (name: string) => borsh.str(name);
      case 'publicKey':
      case 'pubkey': return (name: string) => borsh.publicKey(name);
      case 'bytes': return (name: string) => borsh.vecU8(name);
      default:
        // Could be a defined type
        const typeDef = types?.find((t: any) => t.name === type);
        if (typeDef && typeDef.type?.fields) {
          return (name: string) => borsh.struct(
            typeDef.type.fields
              .map((f: any) => typeToLayout(f.type, types)?.(f.name))
              .filter(Boolean),
            name
          );
        }
        return null;
    }
  }

  if (typeof type === 'object') {
    // Complex types
    if (type.array) {
      const [innerType, size] = type.array;
      const innerLayout = typeToLayout(innerType, types);
      if (innerLayout) {
        return (name: string) => borsh.array(innerLayout(''), size, name);
      }
    }

    if (type.vec) {
      const innerLayout = typeToLayout(type.vec, types);
      if (innerLayout) {
        return (name: string) => borsh.vec(innerLayout(''), name);
      }
    }

    if (type.option) {
      const innerLayout = typeToLayout(type.option, types);
      if (innerLayout) {
        return (name: string) => borsh.option(innerLayout(''), name);
      }
    }

    if (type.defined) {
      const typeDef = types?.find((t: any) => t.name === type.defined.name || t.name === type.defined);
      if (typeDef && typeDef.type?.fields) {
        return (name: string) => borsh.struct(
          typeDef.type.fields
            .map((f: any) => typeToLayout(f.type, types)?.(f.name))
            .filter(Boolean),
          name
        );
      }
    }
  }

  return null;
}

// Check if object is a BN (bn.js BigNumber)
function isBN(obj: any): boolean {
  return obj && typeof obj === 'object' && obj.constructor?.name === 'BN' && 'words' in obj;
}

// Check if object is a PublicKey from borsh (has _bn property)
function isPublicKey(obj: any): boolean {
  return obj && typeof obj === 'object' && '_bn' in obj && isBN(obj._bn);
}

// Convert a BN to base58 public key string
function bnToBase58(bn: any): string {
  // Convert BN to 32-byte buffer, then to base58
  const bytes = bn.toArray('le', 32);
  return bs58.encode(new Uint8Array(bytes));
}

// Convert BigInt, BN, and PublicKey values to strings for JSON serialization
function convertBigIntsToStrings(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return obj.toString();

  // Handle PublicKey objects (from borsh publicKey type)
  if (isPublicKey(obj)) {
    return bnToBase58(obj._bn);
  }

  // Handle BN (bn.js BigNumber) objects
  if (isBN(obj)) {
    return obj.toString();
  }
  if (Buffer.isBuffer(obj) || obj instanceof Uint8Array) {
    return bs58.encode(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(convertBigIntsToStrings);
  }
  if (typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = convertBigIntsToStrings(value);
    }
    return result;
  }
  return obj;
}
