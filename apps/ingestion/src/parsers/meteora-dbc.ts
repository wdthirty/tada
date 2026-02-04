// Meteora DBC (Dynamic Bonding Curve) Parser
// Extracts events from inner instructions (CPI data), NOT from log messages.
// Based on every-aws approach: events are emitted as CPI inner instructions.

import type { DecodedEvent } from '@tada/shared';
import type { SubscribeUpdate } from 'helius-laserstream';
import { ProgramParser, toBase58, getAccountKeys, detectEventSource } from './types.js';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

const PROGRAM_ID = 'METEORA_DBC' as const;
const PROGRAM_ADDRESS = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN';
// Event discriminators (first 8 bytes of sha256("event:<EventName>"))
// Only EvtSwap2 supported - per Meteora dev, all new tokens emit v2 events
const EVT_SWAP2_DISC = Buffer.from([189, 66, 51, 168, 38, 80, 117, 153]);

// Instruction discriminators for identifying transaction type
const IX_INITIALIZE_POOL_SPL = Buffer.from([140, 85, 215, 176, 102, 54, 104, 79]);
const IX_INITIALIZE_POOL_TOKEN2022 = Buffer.from([169, 118, 51, 78, 145, 110, 220, 155]);
const IX_MIGRATION_DAMM_V2 = Buffer.from([156, 169, 230, 103, 53, 228, 80, 64]);

export class MeteoraDBCParser implements ProgramParser {
  programId = PROGRAM_ID;
  programAddress = PROGRAM_ADDRESS;

  parse(update: SubscribeUpdate): DecodedEvent[] {
    const tx = update.transaction!;
    const txData = tx.transaction;
    const meta = txData.meta;
    const message = txData.transaction.message;

    const accountKeys = getAccountKeys(message, meta);
    if (!accountKeys.includes(PROGRAM_ADDRESS)) return [];

    const signature = toBase58(txData.signature);
    const slot = Number(tx.slot);
    const blockTime = Number(tx.blockTime || meta.blockTime || Math.floor(Date.now() / 1000));
    const signer = toBase58(message.accountKeys[0]);
    const source = detectEventSource(accountKeys, message.instructions);

    const events: DecodedEvent[] = [];

    // Detect instruction type from outer instructions
    const txType = this.detectTransactionType(message.instructions, accountKeys, meta);

    // Extract events from inner instructions (CPI events)
    const cpiEvents = this.extractCPIEvents(meta, accountKeys);

    // Extract token mints from postTokenBalances to enrich swap events
    const tokenMints = this.extractTokenMints(meta);

    for (let i = 0; i < cpiEvents.length; i++) {
      const evt = cpiEvents[i];
      // Enrich swap events with token mint info
      if (evt.name === 'EvtSwap2' && tokenMints) {
        evt.data.token_mint = tokenMints.baseMint;
        evt.data.quote_mint = tokenMints.quoteMint;
      }
      events.push({
        id: `${signature}:${PROGRAM_ADDRESS}:${i}`,
        program: PROGRAM_ID,
        programAddress: PROGRAM_ADDRESS,
        name: evt.name,
        signature,
        slot,
        blockTime,
        signer,
        source,
        data: evt.data,
      });
    }

    // If we detected a pool init but no CPI events were found, emit a basic event
    if (events.length === 0 && txType) {
      events.push({
        id: `${signature}:${PROGRAM_ADDRESS}:0`,
        program: PROGRAM_ID,
        programAddress: PROGRAM_ADDRESS,
        name: txType.name,
        signature,
        slot,
        blockTime,
        signer,
        source,
        data: txType.data,
      });
    }

    return events;
  }

  /**
   * Detect transaction type from instruction discriminators (outer + inner)
   */
  private detectTransactionType(instructions: any[], accountKeys: string[], meta?: any): { name: string; data: Record<string, any> } | null {
    // Check outer instructions
    const result = this.matchInstructions(instructions, accountKeys, true);
    if (result) return result;

    // Check inner instructions (CPI calls to DBC, e.g. via another program)
    if (meta?.innerInstructions) {
      for (const innerIx of meta.innerInstructions) {
        if (!innerIx.instructions) continue;
        const result = this.matchInstructions(innerIx.instructions, accountKeys, false);
        if (result) return result;
      }
    }

    return null;
  }

  /**
   * Match DBC instructions by discriminator
   */
  private matchInstructions(instructions: any[], accountKeys: string[], hasAccounts: boolean): { name: string; data: Record<string, any> } | null {
    for (const ix of instructions) {
      const programId = accountKeys[ix.programIdIndex];
      if (programId !== PROGRAM_ADDRESS) continue;

      const ixData = this.getInstructionData(ix);
      if (!ixData || ixData.length < 8) continue;

      const disc = ixData.subarray(0, 8);

      if (disc.equals(IX_INITIALIZE_POOL_SPL) || disc.equals(IX_INITIALIZE_POOL_TOKEN2022)) {
        const metadata = this.extractMetadataFromIxData(ixData);
        const data: Record<string, any> = {
          type: disc.equals(IX_INITIALIZE_POOL_TOKEN2022) ? 'token2022' : 'spl',
          ...metadata,
        };
        if (hasAccounts && ix.accounts) {
          const ixAccounts = Array.from(ix.accounts).map((idx: any) => accountKeys[idx]);
          data.pool = ixAccounts[0] || null;
          data.creator = ixAccounts[1] || null;
          data.token_a_mint = ixAccounts[2] || null;
          data.token_b_mint = ixAccounts[3] || null;
        }
        return { name: 'EvtInitializePool', data };
      }

      if (disc.equals(IX_MIGRATION_DAMM_V2)) {
        const data: Record<string, any> = {};
        if (hasAccounts && ix.accounts) {
          const ixAccounts = Array.from(ix.accounts).map((idx: any) => accountKeys[idx]);
          data.pool = ixAccounts[0] || null;
        }
        return { name: 'EvtMigrationDAMMV2', data };
      }
    }

    return null;
  }

  /**
   * Extract CPI events from inner instructions
   * This is how Meteora DBC emits events - as CPI inner instructions, not log messages
   */
  private extractCPIEvents(meta: any, _accountKeys: string[]): { name: string; data: Record<string, any> }[] {
    const events: { name: string; data: Record<string, any> }[] = [];

    if (!meta.innerInstructions) return events;

    for (const innerIx of meta.innerInstructions) {
      if (!innerIx.instructions) continue;

      for (const instruction of innerIx.instructions) {
        const dataRaw = this.getInstructionData(instruction);
        if (!dataRaw || dataRaw.length < 16) continue;

        // Try to decode as event by discriminator - skip program ID check
        // since CPI events may come from self-invocation with varying account indices
        // First try without CPI wrapper
        let decoded = this.decodeEvent(dataRaw);

        // Then try skipping 8-byte CPI wrapper
        if (!decoded && dataRaw.length > 8) {
          decoded = this.decodeEvent(dataRaw.subarray(8));
        }

        if (decoded) {
          events.push(decoded);
        }
      }
    }

    return events;
  }

  /**
   * Decode event from raw binary data by checking discriminator
   */
  private decodeEvent(data: Buffer): { name: string; data: Record<string, any> } | null {
    if (data.length < 8) return null;

    const disc = data.subarray(0, 8);

    if (disc.equals(EVT_SWAP2_DISC)) {
      return this.decodeEvtSwap2(data);
    }

    return null;
  }

  /**
   * Decode EvtSwap2 from binary data
   * Layout: [disc 8][pool 32][config 32][tradeDir u8][hasReferral u8][swapParams][swapResult][reserves]
   */
  private decodeEvtSwap2(data: Buffer): { name: string; data: Record<string, any> } | null {
    try {
      let offset = 8; // skip discriminator

      const pool = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
      offset += 32;

      const config = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
      offset += 32;

      const tradeDirection = data.readUInt8(offset);
      offset += 1;

      const hasReferral = data.readUInt8(offset) !== 0;
      offset += 1;

      // SwapParameters2: amount0 (i64) + amount1 (i64) + swapMode (u8) = 17 bytes
      const amount0 = data.readBigUInt64LE(offset).toString();
      const amount1 = data.readBigUInt64LE(offset + 8).toString();
      const swapMode = data.readUInt8(offset + 16);
      offset += 17;

      // SwapResult2: multiple u64 + u128
      const includedFeeInputAmount = data.readBigUInt64LE(offset).toString();
      const excludedFeeInputAmount = data.readBigUInt64LE(offset + 8).toString();
      const amountLeft = data.readBigUInt64LE(offset + 16).toString();
      const outputAmount = data.readBigUInt64LE(offset + 24).toString();
      // nextSqrtPrice is u128 (16 bytes) - skip for now
      offset += 48; // 4 * u64 + u128
      const tradingFee = data.readBigUInt64LE(offset).toString();
      const protocolFee = data.readBigUInt64LE(offset + 8).toString();
      const referralFee = data.readBigUInt64LE(offset + 16).toString();
      offset += 24;

      // Remaining fields
      const quoteReserveAmount = offset + 8 <= data.length ? data.readBigUInt64LE(offset).toString() : '0';
      offset += 8;
      const migrationThreshold = offset + 8 <= data.length ? data.readBigUInt64LE(offset).toString() : '0';
      offset += 8;
      const currentTimestamp = offset + 8 <= data.length ? data.readBigUInt64LE(offset).toString() : '0';

      return {
        name: 'EvtSwap2',
        data: {
          pool,
          config,
          trade_direction: tradeDirection,
          is_buy: tradeDirection === 1,
          has_referral: hasReferral,
          amount0,
          amount1,
          swap_mode: swapMode,
          included_fee_input_amount: includedFeeInputAmount,
          excluded_fee_input_amount: excludedFeeInputAmount,
          amount_left: amountLeft,
          output_amount: outputAmount,
          trading_fee: tradingFee,
          protocol_fee: protocolFee,
          referral_fee: referralFee,
          quote_reserve_amount: quoteReserveAmount,
          migration_threshold: migrationThreshold,
          current_timestamp: currentTimestamp,
        },
      };
    } catch (error) {
      console.error('[MeteoraDB C] Failed to decode EvtSwap2:', error);
      return null;
    }
  }

  /**
   * Extract name, symbol, URI from DBC InitializePool instruction data
   * Layout after 8-byte discriminator: [u32 nameLen][name][u32 symbolLen][symbol][u32 uriLen][uri]...
   */
  private extractMetadataFromIxData(data: Buffer): { token_name?: string; token_symbol?: string; token_uri?: string } {
    try {
      let offset = 8; // skip discriminator

      // Read name
      if (offset + 4 > data.length) return {};
      const nameLen = data.readUInt32LE(offset);
      offset += 4;
      if (nameLen > 200 || offset + nameLen > data.length) return {};
      const token_name = data.subarray(offset, offset + nameLen).toString('utf8').trim();
      offset += nameLen;

      // Read symbol
      if (offset + 4 > data.length) return { token_name };
      const symbolLen = data.readUInt32LE(offset);
      offset += 4;
      if (symbolLen > 50 || offset + symbolLen > data.length) return { token_name };
      const token_symbol = data.subarray(offset, offset + symbolLen).toString('utf8').trim();
      offset += symbolLen;

      // Read URI
      if (offset + 4 > data.length) return { token_name, token_symbol };
      const uriLen = data.readUInt32LE(offset);
      offset += 4;
      if (uriLen > 500 || offset + uriLen > data.length) return { token_name, token_symbol };
      const token_uri = data.subarray(offset, offset + uriLen).toString('utf8').trim();

      return { token_name, token_symbol, token_uri };
    } catch {
      return {};
    }
  }

  /**
   * Extract token mints from postTokenBalances
   * Returns the base (non-SOL) mint and quote (SOL/WSOL) mint
   */
  private extractTokenMints(meta: any): { baseMint: string; quoteMint: string } | null {
    const WSOL = 'So11111111111111111111111111111111111111112';
    const postBalances = meta.postTokenBalances || [];
    if (postBalances.length === 0) return null;

    let quoteMint: string | null = null;
    const nonSolMints: string[] = [];

    for (const balance of postBalances) {
      const mint = balance.mint;
      if (!mint) continue;
      if (mint === WSOL) {
        quoteMint = mint;
      } else if (!nonSolMints.includes(mint)) {
        nonSolMints.push(mint);
      }
    }

    if (nonSolMints.length === 0) return null;

    return {
      baseMint: nonSolMints[0],
      quoteMint: quoteMint || WSOL,
    };
  }

  /**
   * Get instruction data as Buffer from various formats
   */
  private getInstructionData(instruction: any): Buffer | null {
    if (!instruction.data) return null;
    if (typeof instruction.data === 'string') {
      try {
        return Buffer.from(bs58.decode(instruction.data));
      } catch {
        return Buffer.from(instruction.data, 'base64');
      }
    }
    return Buffer.from(instruction.data);
  }
}

export const meteoraDBCParser = new MeteoraDBCParser();
