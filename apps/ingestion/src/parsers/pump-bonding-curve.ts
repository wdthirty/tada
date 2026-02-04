// Pump.fun Bonding Curve Parser
// Parses TradeEvent and CompleteEvent from Pump.fun bonding curve program

import type { DecodedEvent } from '@tada/shared';
import type { SubscribeUpdate } from 'helius-laserstream';
import { ProgramParser, toBase58, getAccountKeys, detectEventSource, convertEventData } from './types.js';
import { BorshCoder, EventParser } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import idl from '../../../../packages/shared/src/idls/pump-bonding-curve.json' with { type: 'json' };

const PROGRAM_ID = 'PUMP_BONDING_CURVE' as const;
const PROGRAM_ADDRESS = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

export class PumpBondingCurveParser implements ProgramParser {
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
    const involvesPump = accountKeys.includes(PROGRAM_ADDRESS);
    if (!involvesPump) return [];

    const signature = toBase58(txData.signature);
    const slot = Number(tx.slot);
    // Use actual blockTime if available, otherwise use current timestamp
    const blockTime = Number(tx.blockTime || meta.blockTime || Math.floor(Date.now() / 1000));
    const signer = toBase58(message.accountKeys[0]);
    const logs = meta.logMessages || [];

    // Detect source (direct vs aggregator)
    const source = detectEventSource(accountKeys, message.instructions);

    // Parse events from logs (Pump.fun uses emit!())
    const events: DecodedEvent[] = [];
    let eventIndex = 0;

    try {
      const parsedEvents = this.eventParser.parseLogs(logs);

      // Debug: only log non-trade events to reduce noise
      const nonTradeEvents = parsedEvents.filter(e => e.name !== 'TradeEvent');
      if (nonTradeEvents.length > 0) {
        console.log(`[PumpBondingCurve] Found ${parsedEvents.length} events:`, parsedEvents.map(e => e.name));
      }

      for (const evt of parsedEvents) {
        const eventData = this.extractEventData(evt.name, evt.data, accountKeys, message);

        // Debug CreateEvent specifically to compare with Jupiter
        if (evt.name === 'CreateEvent') {
          console.log(`[PumpBondingCurve] ✨ CreateEvent - Mint: ${eventData.mint}, Name: ${eventData.name}, Symbol: ${eventData.symbol}, Sig: ${signature.slice(0, 8)}`);
        }

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
          data: eventData,
        });
        eventIndex++;
      }
    } catch (error) {
      console.error('[PumpBondingCurve] Failed to parse events:', error);
    }

    return events;
  }

  /**
   * Extract and normalize event data
   * Adds instruction accounts and converts types
   */
  private extractEventData(eventName: string, data: any, accountKeys: string[], message: any): Record<string, any> {
    // Start with parsed event data and convert PublicKey/BN objects
    const result = convertEventData(data);

    // Find the pump instruction to get account addresses
    for (const ix of message.instructions) {
      const ixProgramId = accountKeys[ix.programIdIndex];
      if (ixProgramId === PROGRAM_ADDRESS) {
        // Extract instruction accounts - convert Buffer/Uint8Array to array of indices
        const ixAccounts = Array.from(ix.accounts);
        const accounts = ixAccounts.map((idx: number) => accountKeys[idx]);

        // For TradeEvent: add instruction accounts
        if (eventName === 'TradeEvent' && accounts.length >= 7) {
          result.global = accounts[0];
          result.fee_recipient = accounts[1];
          result.mint = accounts[2];
          result.bonding_curve = accounts[3];
          result.associated_bonding_curve = accounts[4];
          result.associated_user = accounts[5];
          result.user = accounts[6];
          if (accounts.length >= 8) result.system_program = accounts[7];
          if (accounts.length >= 9) result.token_program = accounts[8];
        }

        // For CompleteEvent: add instruction accounts
        if (eventName === 'CompleteEvent' && accounts.length >= 3) {
          result.user = accounts[0];
          result.mint = accounts[1];
          result.bonding_curve = accounts[2];
        }

        // For CreateEvent: add instruction accounts
        if (eventName === 'CreateEvent' && accounts.length >= 2) {
          result.mint = accounts[0];
          result.bonding_curve = accounts[1];
          if (accounts.length >= 3) result.user = accounts[2];
        }

        break;
      }
    }

    return result;
  }
}

export const pumpBondingCurveParser = new PumpBondingCurveParser();
