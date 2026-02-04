// Program IDLs
// These are the Anchor IDLs for all supported programs
// Used for decoding instructions and events from transactions

import { PROGRAMS } from '../types.js';
import { createRequire } from 'module';

// Use require for JSON imports in ESM
const require = createRequire(import.meta.url);

// Import IDL JSON files
const pumpBondingCurveIdl = require('./pump-bonding-curve.json');
const pumpswapIdl = require('./pumpswap.json');
const meteoraDbcIdl = require('./meteora-dbc.json');
const meteoraDammV1Idl = require('./meteora-damm-v1.json');
const meteoraDammV2Idl = require('./meteora-damm-v2.json');
const meteoraDlmmIdl = require('./meteora-dlmm.json');

// Type for Anchor IDL (simplified)
export interface AnchorIdl {
  address: string;
  metadata: {
    name: string;
    version: string;
    spec: string;
  };
  instructions: Array<{
    name: string;
    discriminator: number[];
    accounts: Array<{ name: string; [key: string]: any }>;
    args: Array<{ name: string; type: any }>;
  }>;
  accounts: Array<{
    name: string;
    discriminator: number[];
  }>;
  events: Array<{
    name: string;
    discriminator: number[];
  }>;
  types: Array<{
    name: string;
    type: any;
  }>;
}

// Map program IDs to their IDLs
export const IDL_MAP: Record<string, AnchorIdl> = {
  [PROGRAMS.PUMP_BONDING_CURVE.address]: pumpBondingCurveIdl as unknown as AnchorIdl,
  [PROGRAMS.PUMPSWAP.address]: pumpswapIdl as unknown as AnchorIdl,
  [PROGRAMS.METEORA_DBC.address]: meteoraDbcIdl as unknown as AnchorIdl,
  [PROGRAMS.METEORA_DAMM_V1.address]: meteoraDammV1Idl as unknown as AnchorIdl,
  [PROGRAMS.METEORA_DAMM_V2.address]: meteoraDammV2Idl as unknown as AnchorIdl,
  [PROGRAMS.METEORA_DLMM.address]: meteoraDlmmIdl as unknown as AnchorIdl,
};

// Export individual IDLs for direct access
export {
  pumpBondingCurveIdl,
  pumpswapIdl,
  meteoraDbcIdl,
  meteoraDammV1Idl,
  meteoraDammV2Idl,
  meteoraDlmmIdl,
};

// Helper to get IDL by program address
export function getIdlByAddress(address: string): AnchorIdl | undefined {
  return IDL_MAP[address];
}

// Helper to get event discriminator map for a program
export function getEventDiscriminators(idl: AnchorIdl): Map<string, string> {
  const map = new Map<string, string>();
  for (const event of idl.events || []) {
    // Discriminator is first 8 bytes of sha256("event:<EventName>")
    // Stored as array of numbers, convert to hex string for lookup
    const discriminatorHex = Buffer.from(event.discriminator).toString('hex');
    map.set(discriminatorHex, event.name);
  }
  return map;
}

// Helper to get instruction discriminator map for a program
export function getInstructionDiscriminators(idl: AnchorIdl): Map<string, string> {
  const map = new Map<string, string>();
  for (const instruction of idl.instructions || []) {
    const discriminatorHex = Buffer.from(instruction.discriminator).toString('hex');
    map.set(discriminatorHex, instruction.name);
  }
  return map;
}
