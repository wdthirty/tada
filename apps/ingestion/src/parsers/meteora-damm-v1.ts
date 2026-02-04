// Meteora DAMM V1 Parser
// Parses swap events from Meteora Dynamic AMM V1
// Events are extracted from inner instructions (CPI data)

import type { DecodedEvent } from '@tada/shared';
import type { SubscribeUpdate } from 'helius-laserstream';
import { ProgramParser, toBase58, getAccountKeys, detectEventSource, convertEventData } from './types.js';
import { BorshCoder } from '@coral-xyz/anchor';
import bs58 from 'bs58';
import idl from '../../../../packages/shared/src/idls/meteora-damm-v1.json' with { type: 'json' };

const PROGRAM_ID = 'METEORA_DAMM_V1' as const;
const PROGRAM_ADDRESS = 'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB';

export class MeteoraDAMMV1Parser implements ProgramParser {
  programId = PROGRAM_ID;
  programAddress = PROGRAM_ADDRESS;

  private coder: BorshCoder;

  constructor() {
    this.coder = new BorshCoder(idl as any);
  }

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
    let eventIndex = 0;

    try {
      const innerInstructions = meta.innerInstructions || [];

      for (const inner of innerInstructions) {
        for (const ix of inner.instructions) {
          const dataRaw = this.getInstructionData(ix);
          if (!dataRaw || dataRaw.length < 16) continue;

          const eventData = this.decodeEvent(dataRaw);
          if (eventData) {
            events.push({
              id: `${signature}:${PROGRAM_ADDRESS}:${eventIndex}`,
              program: PROGRAM_ID,
              programAddress: PROGRAM_ADDRESS,
              name: eventData.name,
              signature,
              slot,
              blockTime,
              signer,
              source,
              data: this.extractEventData(eventData.name, eventData.data, accountKeys, message, meta),
            });
            eventIndex++;
          }
        }
      }
    } catch (error) {
      console.error('[MeteoraDAMMV1] Failed to parse events:', error);
    }

    return events;
  }

  /**
   * Decode event from CPI instruction data (Buffer)
   */
  private decodeEvent(data: Buffer): { name: string; data: any } | null {
    try {
      // Try direct decode
      const decoded = (this.coder.events as any).decode(Buffer.from(data).toString('base64'));
      if (decoded) {
        return { name: decoded.name, data: decoded.data };
      }

      // Try skipping 8-byte CPI wrapper
      if (data.length > 16) {
        const skipped = data.subarray(8);
        const decoded2 = (this.coder.events as any).decode(Buffer.from(skipped).toString('base64'));
        if (decoded2) {
          return { name: decoded2.name, data: decoded2.data };
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Extract and normalize event data, enrich with account info
   */
  private extractEventData(eventName: string, data: any, accountKeys: string[], message: any, meta: any): Record<string, any> {
    const result = convertEventData(data);

    // Extract token mints from postTokenBalances
    const WSOL = 'So11111111111111111111111111111111111111112';
    const postBalances = meta.postTokenBalances || [];
    const nonSolMints: string[] = [];
    let hasWsol = false;

    for (const balance of postBalances) {
      const mint = balance.mint;
      if (!mint) continue;
      if (mint === WSOL) {
        hasWsol = true;
      } else if (!nonSolMints.includes(mint)) {
        nonSolMints.push(mint);
      }
    }

    if (nonSolMints.length > 0) {
      result.token_mint = nonSolMints[0];
      result.quote_mint = hasWsol ? WSOL : nonSolMints[1] || null;
    }

    // Try to get pool/accounts from outer instruction
    for (const ix of message.instructions) {
      const ixProgramId = accountKeys[ix.programIdIndex];
      if (ixProgramId === PROGRAM_ADDRESS) {
        const ixAccounts = Array.from(ix.accounts);
        const accounts = ixAccounts.map((idx: any) => accountKeys[idx]);

        if (accounts.length >= 6) {
          result.pool = accounts[0];
          result.user = accounts[1];
          result.token_a_mint = accounts[4];
          result.token_b_mint = accounts[5];
        }

        break;
      }
    }

    return result;
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

export const meteoraDAMMV1Parser = new MeteoraDAMMV1Parser();
