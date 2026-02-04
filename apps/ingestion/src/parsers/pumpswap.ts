// PUMPSWAP AMM Parser
// Parses BuyEvent, SellEvent from PUMPSWAP post-migration AMM

import type { DecodedEvent } from '@tada/shared';
import type { SubscribeUpdate } from 'helius-laserstream';
import { ProgramParser, toBase58, getAccountKeys, detectEventSource, convertEventData } from './types.js';
import { BorshCoder, EventParser } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import idl from '../../../../packages/shared/src/idls/pumpswap.json' with { type: 'json' };

const PROGRAM_ID = 'PUMPSWAP' as const;
const PROGRAM_ADDRESS = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';

export class PumpswapParser implements ProgramParser {
  programId = PROGRAM_ID;
  programAddress = PROGRAM_ADDRESS;

  private coder: BorshCoder;
  private eventParser: EventParser;

  constructor() {
    this.coder = new BorshCoder(idl as any);
    this.eventParser = new EventParser(new PublicKey(PROGRAM_ADDRESS), this.coder);
  }

  parse(update: SubscribeUpdate): DecodedEvent[] {
    const tx = update.transaction!;
    const txData = tx.transaction;
    const meta = txData.meta;
    const message = txData.transaction.message;

    // Check if this transaction involves our program
    const accountKeys = getAccountKeys(message, meta);
    const involvesPumpswap = accountKeys.includes(PROGRAM_ADDRESS);
    if (!involvesPumpswap) return [];

    const signature = toBase58(txData.signature);
    const slot = Number(tx.slot);
    // Use actual blockTime if available, otherwise use current timestamp
    const blockTime = Number(tx.blockTime || meta.blockTime || Math.floor(Date.now() / 1000));
    const signer = toBase58(message.accountKeys[0]);
    const logs = meta.logMessages || [];

    // Detect source
    const source = detectEventSource(accountKeys, message.instructions);

    // Parse events from logs (PUMPSWAP uses emit!())
    const events: DecodedEvent[] = [];
    let eventIndex = 0;

    try {
      const parsedEvents = this.eventParser.parseLogs(logs);

      for (const evt of parsedEvents) {
        events.push({
          id: `${signature}:${PROGRAM_ADDRESS}:${eventIndex}`,
          program: PROGRAM_ID,
          programAddress: PROGRAM_ADDRESS,
          name: evt.name,
          signature,
          slot,
          blockTime,
          signer,
          source,
          data: this.extractEventData(evt.name, evt.data, accountKeys, message),
        });
        eventIndex++;
      }
    } catch (error) {
      console.error('[PUMPSWAP] Failed to parse events:', error);
    }

    return events;
  }

  /**
   * Extract and normalize event data
   * PUMPSWAP events already contain most data, but we add instruction accounts for completeness
   */
  private extractEventData(eventName: string, data: any, accountKeys: string[], message: any): Record<string, any> {
    const result = convertEventData(data);

    // Find the PUMPSWAP instruction to get account addresses
    for (const ix of message.instructions) {
      const ixProgramId = accountKeys[ix.programIdIndex];
      if (ixProgramId === PROGRAM_ADDRESS) {
        const ixAccounts = Array.from(ix.accounts);
        const accounts = ixAccounts.map((idx: number) => accountKeys[idx]);

        // For BuyEvent/SellEvent: add instruction accounts
        // Most fields are already in the event data as pubkeys, so we just add missing ones
        if ((eventName === 'BuyEvent' || eventName === 'SellEvent') && accounts.length >= 10) {
          // Add accounts that might not be in event data
          result.global_config = accounts[0];
          result.base_mint = accounts[1];
          result.quote_mint = accounts[2];
          result.pool_base_token_account = accounts[3];
          result.pool_quote_token_account = accounts[4];
          result.base_token_program = accounts[5];
          result.quote_token_program = accounts[6];
          result.system_program = accounts[7];
          result.associated_token_program = accounts[8];
          result.event_authority = accounts[9];
          result.program = accounts[10];
        }

        break;
      }
    }

    return result;
  }
}

export const pumpswapParser = new PumpswapParser();
