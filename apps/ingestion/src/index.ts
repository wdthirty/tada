// Tada Ingestion Service
// Connects to Helius Laserstream and streams transactions for all supported programs
// Events are extracted and optionally fed to the Pipeline Engine

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { subscribe, CommitmentLevel, LaserstreamConfig, SubscribeRequest, SubscribeUpdate } from 'helius-laserstream';
import { PROGRAMS, ProgramId, DecodedEvent } from '@tada/shared';
import { extractEvents } from './parser.js';
import { initPipelineLoader, shutdownPipelineLoader } from './pipeline-loader.js';

// Pipeline integration (optional - enable with ENABLE_PIPELINE=true)
let pipelineEngine: any = null;
const ENABLE_PIPELINE = process.env.ENABLE_PIPELINE === 'true';

// Configuration
const config: LaserstreamConfig = {
  apiKey: process.env.HELIUS_API_KEY || '',
  endpoint: process.env.HELIUS_ENDPOINT || 'https://laserstream-mainnet-ewr.helius-rpc.com',
};

// Get program(s) to subscribe to
// Use PROGRAM env var to select specific program(s), or 'all' for all programs
// Examples: PROGRAM=PUMPSWAP, PROGRAM=PUMP_BONDING_CURVE, PROGRAM=all
const programArg = process.env.PROGRAM || process.argv[2] || 'all';

function getSelectedPrograms(): string[] {
  if (programArg.toLowerCase() === 'all') {
    return Object.values(PROGRAMS).map(p => p.address);
  }

  // Support comma-separated list
  const programIds = programArg.split(',').map(p => p.trim().toUpperCase());
  const addresses: string[] = [];

  for (const id of programIds) {
    const program = PROGRAMS[id as ProgramId];
    if (!program) {
      console.error(`Unknown program: ${id}`);
      console.log('Available programs:');
      Object.entries(PROGRAMS).forEach(([key, p]) => {
        console.log(`  ${key} - ${p.name} (${p.address.slice(0, 8)}...)`);
      });
      process.exit(1);
    }
    addresses.push(program.address);
  }

  return addresses;
}

const PROGRAM_ADDRESSES = getSelectedPrograms();

async function main() {
  if (!config.apiKey) {
    console.error('HELIUS_API_KEY environment variable is required');
    process.exit(1);
  }

  // Initialize Pipeline Engine if enabled
  if (ENABLE_PIPELINE) {
    try {
      const { engine } = await import('@tada/pipeline');
      pipelineEngine = engine;
      await initPipelineLoader(pipelineEngine);
    } catch (error) {
      console.warn('[Ingestion] Pipeline Engine failed to load:', error);
    }
  }

  // Build subscription request for all programs
  const subscriptionRequest: SubscribeRequest = {
    transactions: {
      // Subscribe to transactions involving any of our programs
      'tada-programs': {
        accountInclude: PROGRAM_ADDRESSES,
        accountExclude: [],
        accountRequired: [],
        vote: false,
        failed: false, // Only successful transactions
      }
    },
    commitment: CommitmentLevel.CONFIRMED,
    accounts: {},
    slots: {},
    transactionsStatus: {},
    blocks: {},
    blocksMeta: {},
    entry: {},
    accountsDataSlice: [],
  };

  const stream = await subscribe(
    config,
    subscriptionRequest,
    handleUpdate,
    handleError
  );

  console.log('[Ingestion] Active');

  // Log stats every 5 minutes
  setInterval(() => {
    console.log(`[Ingestion] Parsed ${eventCount} events`);
  }, 5 * 60 * 1000);

  // Graceful shutdown
  process.on('SIGINT', () => {
    shutdownPipelineLoader();
    stream.cancel();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    shutdownPipelineLoader();
    stream.cancel();
    process.exit(0);
  });
}

// Track event count
let eventCount = 0;
let pipelineEventCount = 0;

// Handle incoming transaction updates
async function handleUpdate(update: SubscribeUpdate) {
  // Skip ping/heartbeat messages
  if (!update.transaction) {
    return;
  }

  try {
    // Extract events from the transaction (event-centric model)
    const events = extractEvents(update);

    // Skip transactions with no decoded events
    if (events.length === 0) {
      return;
    }

    // Log each event (only show key events we care about)
    const LOG_EVENTS = ['CreateEvent', 'CompleteEvent', 'CreatePoolEvent', 'EvtCurveComplete', 'EvtInitializePool', 'LbPairCreate', 'PoolCreated', 'EvtSwap2', 'EvtClaimTradingFee'];
    for (const event of events) {
      eventCount++;
      if (LOG_EVENTS.includes(event.name)) {
        logEvent(event);
      }
    }

    // Feed events to Pipeline Engine if enabled
    if (ENABLE_PIPELINE && pipelineEngine) {
      const transformed = pipelineEngine.processEvents(events);
      pipelineEventCount += transformed.length;
    }

    // TODO: Send events to Kinesis stream (for production)
    // for (const event of events) {
    //   await sendToKinesis(event);
    // }

  } catch (error) {
    console.error('[Ingestion] Failed to extract events:', error);
  }
}

// Log a decoded event in a readable format
function logEvent(event: DecodedEvent) {
  // Debug: Log full event details
  console.log('\n=== EVENT DEBUG ===');
  console.log('Program:', event.program);
  console.log('Event Name:', event.name);
  console.log('Signature:', event.signature.slice(0, 16));
  console.log('Event Data Keys:', Object.keys(event.data));
  console.log('Event Data:', JSON.stringify(event.data, null, 2));
  console.log('===================\n');
}

// Handle stream errors
async function handleError(error: Error) {
  console.error('[Ingestion] Stream error:', error);
  // Laserstream SDK handles reconnection automatically
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
