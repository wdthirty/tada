// Meteora DLMM (Dynamic Liquidity Market Maker) Parser
// Parses swap events from Meteora DLMM

import type { DecodedEvent } from '@tada/shared';
import type { SubscribeUpdate } from 'helius-laserstream';
import { ProgramParser, toBase58, getAccountKeys, detectEventSource, convertEventData } from './types.js';
import { BorshCoder } from '@coral-xyz/anchor';
import bs58 from 'bs58';
import idl from '../../../../packages/shared/src/idls/meteora-dlmm.json' with { type: 'json' };

const PROGRAM_ID = 'METEORA_DLMM' as const;
const PROGRAM_ADDRESS = 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo';

export class MeteoraDLMMParser implements ProgramParser {
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

    // Check if this transaction involves our program
    const accountKeys = getAccountKeys(message, meta);
    const involvesMeteora = accountKeys.includes(PROGRAM_ADDRESS);
    if (!involvesMeteora) return [];

    const signature = toBase58(txData.signature);
    const slot = Number(tx.slot);
    // Use actual blockTime if available, otherwise use current timestamp
    const blockTime = Number(tx.blockTime || meta.blockTime || Math.floor(Date.now() / 1000));
    const signer = toBase58(message.accountKeys[0]);

    // Detect source
    const source = detectEventSource(accountKeys, message.instructions);

    // Parse events from inner instructions (DLMM uses emit_cpi!())
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
      console.error('[MeteoraDLMM] Failed to parse events:', error);
    }

    return events;
  }

  /**
   * Decode event from CPI instruction data
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

  /**
   * Extract and normalize event data
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

    // Find the meteora instruction to get account addresses
    for (const ix of message.instructions) {
      const ixProgramId = accountKeys[ix.programIdIndex];
      if (ixProgramId === PROGRAM_ADDRESS) {
        const ixAccounts = Array.from(ix.accounts);
        const accounts = ixAccounts.map((idx: any) => accountKeys[idx]);

        if (accounts.length >= 6) {
          result.lb_pair = accounts[0];
          result.user = accounts[1];
          result.token_x_reserve = accounts[2];
          result.token_y_reserve = accounts[3];
          result.token_x_mint = accounts[4];
          result.token_y_mint = accounts[5];
        }

        break;
      }
    }

    return result;
  }
}

export const meteoraDLMMParser = new MeteoraDLMMParser();
