// Tada Shared Types
// Single source of truth for all type definitions

// ============================================
// PROGRAMS
// ============================================

export const PROGRAMS = {
  PUMP_BONDING_CURVE: {
    id: 'PUMP_BONDING_CURVE',
    address: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
    name: 'Pump.fun Bonding Curve',
    category: 'pre-migration' as const,
  },
  METEORA_DBC: {
    id: 'METEORA_DBC',
    address: 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN',
    name: 'Meteora DBC',
    category: 'pre-migration' as const,
  },
  PUMPSWAP: {
    id: 'PUMPSWAP',
    address: 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA',
    name: 'PumpSwap AMM',
    category: 'post-migration' as const,
  },
  METEORA_DAMM_V1: {
    id: 'METEORA_DAMM_V1',
    address: 'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB',
    name: 'Meteora DAMM v1',
    category: 'post-migration' as const,
  },
  METEORA_DAMM_V2: {
    id: 'METEORA_DAMM_V2',
    address: 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG',
    name: 'Meteora DAMM v2',
    category: 'post-migration' as const,
  },
  METEORA_DLMM: {
    id: 'METEORA_DLMM',
    address: 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',
    name: 'Meteora DLMM',
    category: 'post-migration' as const,
  },
} as const;

export type ProgramId = keyof typeof PROGRAMS;
export type Program = typeof PROGRAMS[ProgramId];

// Map program addresses to their IDs for quick lookup
export const PROGRAM_ADDRESS_TO_ID: Record<string, ProgramId> = Object.entries(PROGRAMS).reduce(
  (acc, [id, program]) => {
    acc[program.address] = id as ProgramId;
    return acc;
  },
  {} as Record<string, ProgramId>
);

// Known aggregator programs (for source detection)
export const KNOWN_AGGREGATORS: Record<string, string> = {
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': 'jupiter',
  'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB': 'jupiter',
  'JUP2jxvXaqu7NQY1GmNF4m1vodw12LVXYxbFL2uJvfo': 'jupiter',
  'jupoNjAxXgZ4rjzxzPMP4oxduvQsQtZzyknqvzYNrNu': 'jupiter',
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'raydium',
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK': 'raydium',
};

// ============================================
// FILTER TYPES
// ============================================

export type FilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'contains';

export interface FilterCondition {
  field: string;
  op: FilterOperator;
  value: any;
}

export interface Filter {
  // Declarative filters
  instructions?: string[];
  accounts?: {
    include?: string[];
    exclude?: string[];
  };
  conditions?: FilterCondition[];

  // Convenience filters (converted to conditions internally)
  mints?: string[];          // Filter by token mint addresses
  wallets?: string[];        // Filter by wallet addresses
  isBuy?: boolean;           // Filter by trade direction (true=buy, false=sell)
  solAmount?: {              // Filter by SOL amount range
    min?: number;
    max?: number;
  };
  tokenAmount?: {            // Filter by token amount range
    min?: number;
    max?: number;
  };

  // Logical operators for complex filters
  $and?: Filter[];
  $or?: Filter[];

  // Code escape hatch
  code?: string;
}

// ============================================
// TRANSFORM TYPES
// ============================================

export type TransformTemplate = 'trade' | 'transfer' | 'migration' | 'raw';
export type TransformPipe = 'lamportsToSol' | 'base58' | 'timestamp' | 'shorten' | 'bondingCurveProgress';

export interface TransformField {
  source: string;
  target: string;
  pipe?: TransformPipe;
}

export interface Transform {
  mode: 'template' | 'fields' | 'code';
  template?: TransformTemplate;
  fields?: TransformField[];
  code?: string;
}

// ============================================
// DESTINATION TYPES
// ============================================

export interface DiscordDestination {
  enabled: boolean;
  webhookUrl: string;
  format?: 'embed' | 'text';
}

export interface TelegramDestination {
  enabled: boolean;
  botToken: string;
  chatId: string;
  format?: 'markdown' | 'html' | 'text';
}

export interface WebSocketDestination {
  enabled: boolean;
  channelId?: string;
}

export interface WebhookDestination {
  enabled: boolean;
  url: string;
  method?: 'POST' | 'PUT';
  headers?: Record<string, string>;
  signing?: {
    secret: string;
    header?: string;
  };
  retry?: {
    attempts?: number;
    backoff?: 'exponential' | 'linear';
  };
}

export interface PostgresDestination {
  enabled: boolean;
  connectionString: string;
  table: string;
  onConflict?: 'ignore' | 'update';
}

export interface KafkaDestination {
  enabled: boolean;
  brokers: string[];
  topic: string;
  auth?: {
    username: string;
    password: string;
  };
}

export interface S3Destination {
  enabled: boolean;
  bucket: string;
  region: string;
  prefix?: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
}

export interface TadaStorageDestination {
  enabled: boolean;
}

export interface Destinations {
  discord?: DiscordDestination;
  telegram?: TelegramDestination;
  websocket?: WebSocketDestination;
  webhook?: WebhookDestination;
  postgres?: PostgresDestination;
  kafka?: KafkaDestination;
  s3?: S3Destination;
  tadaStorage?: TadaStorageDestination;
}

// ============================================
// PIPELINE
// ============================================

export type PipelineStatus = 'active' | 'paused' | 'error';

export interface PipelineMetrics {
  eventsPerSecond: number;
  totalEvents: number;
  errorCount: number;
  lastEventAt: Date | null;
  p99LatencyMs: number;
}

export interface Pipeline {
  id: string;
  name: string;
  apiKey: string;
  
  // Source
  programs: ProgramId[];
  
  // Processing
  filter: Filter;
  transform: Transform;
  
  // Output
  destinations: Destinations;
  
  // Metadata
  status: PipelineStatus;
  createdAt: Date;
  updatedAt: Date;
  
  // Computed
  metrics?: PipelineMetrics;
}

// ============================================
// API REQUEST/RESPONSE TYPES
// ============================================

export interface CreatePipelineRequest {
  name?: string;
  programs: ProgramId[];
  filter?: Filter;
  transform?: Transform;
  destinations: Destinations;
}

export interface UpdatePipelineRequest {
  name?: string;
  programs?: ProgramId[];
  filter?: Filter;
  transform?: Transform;
  destinations?: Destinations;
}

export interface PipelineResponse {
  pipeline: Pipeline;
}

export interface PipelinesListResponse {
  pipelines: Pipeline[];
}

// ============================================
// DECODED EVENT FORMAT (PRIMARY DATA MODEL)
// ============================================
// This is the primary format produced by the Ingestion Service.
// Events are the authoritative record of what happened on-chain.
// One transaction can emit multiple events (e.g., multi-hop swaps).

/**
 * Source context - how the event was triggered
 */
export type EventSourceType = 'direct' | 'jupiter' | 'raydium' | 'unknown';

export interface EventSource {
  type: EventSourceType;
  outerProgram?: string;  // If CPI, the program that called ours
}

/**
 * The primary data unit for Tada.
 * Each event represents a single action that occurred on-chain.
 * Events are decoded from program logs using Anchor IDLs.
 */
export interface DecodedEvent {
  // ─────────────────────────────────────────────────────────────
  // IDENTITY
  // ─────────────────────────────────────────────────────────────
  id: string;              // Unique ID: signature:programAddress:eventIndex

  // ─────────────────────────────────────────────────────────────
  // EVENT INFO
  // ─────────────────────────────────────────────────────────────
  program: ProgramId;       // PUMPSWAP, PUMP_BONDING_CURVE, etc.
  programAddress: string;   // Actual program address
  name: string;             // Event name: 'TradeEvent', 'SwapEvent', etc.

  // ─────────────────────────────────────────────────────────────
  // TRANSACTION CONTEXT
  // ─────────────────────────────────────────────────────────────
  signature: string;        // Transaction signature for linking
  slot: number;             // Slot number
  blockTime: number;        // Unix timestamp (seconds)

  // ─────────────────────────────────────────────────────────────
  // ACTOR
  // ─────────────────────────────────────────────────────────────
  signer: string;           // Who initiated (fee payer)

  // ─────────────────────────────────────────────────────────────
  // SOURCE CONTEXT
  // ─────────────────────────────────────────────────────────────
  source: EventSource;      // How the event was triggered

  // ─────────────────────────────────────────────────────────────
  // EVENT DATA
  // ─────────────────────────────────────────────────────────────
  data: Record<string, any>; // Decoded event fields from IDL
}

// ============================================
// LEGACY TYPES (kept for parser internals)
// ============================================

/**
 * Token balance change from a transaction
 */
export interface TokenTransfer {
  mint: string;           // Token mint address
  owner: string;          // Token account owner
  amount: bigint;         // Raw amount (with decimals)
  decimals: number;       // Token decimals
  uiAmount: number;       // Human-readable amount
}

/**
 * SOL balance change from a transaction
 */
export interface SolTransfer {
  account: string;        // Account address
  change: bigint;         // Change in lamports (can be negative)
  preBalance: bigint;     // Balance before tx
  postBalance: bigint;    // Balance after tx
}

/**
 * Decoded instruction from a transaction
 */
export interface ParsedInstruction {
  programId: string;      // Program that processed this instruction
  name: string;           // Instruction name (e.g., 'buy', 'sell', 'swap')
  args: Record<string, any>;  // Decoded instruction arguments
  accounts: Record<string, string>;  // Named accounts (e.g., { user: '...', mint: '...' })
  accountsList: string[]; // Ordered list of all accounts
  data: string;           // Raw instruction data (base58)
  index: number;          // Instruction index in transaction
}

/**
 * Inner instruction (CPI call)
 */
export interface InnerInstruction {
  programId: string;
  index: number;
  instructions: ParsedInstruction[];
}

/**
 * Parsed event from program logs (internal use).
 */
export interface ParsedEvent {
  name: string;                    // Event name (e.g., "TradeEvent", "EvtSwap")
  data: Record<string, any>;       // Decoded event fields
  programId: string;               // Program that emitted the event
  signature: string;               // Transaction signature (for reference)
  slot: number;                    // Slot number
  index: number;                   // Event index within transaction
}

/**
 * Internal parsed transaction format (used by parser).
 * Not the primary output - events are extracted from this.
 */
export interface ParsedTransaction {
  // ─────────────────────────────────────────────────────────────
  // IDENTITY
  // ─────────────────────────────────────────────────────────────
  signature: string;      // Transaction signature (base58)
  slot: number;           // Slot number
  blockTime: number;      // Unix timestamp (seconds)

  // ─────────────────────────────────────────────────────────────
  // STATUS
  // ─────────────────────────────────────────────────────────────
  success: boolean;       // Did the transaction succeed?
  error: string | null;   // Error message if failed

  // ─────────────────────────────────────────────────────────────
  // FEES & COMPUTE
  // ─────────────────────────────────────────────────────────────
  fee: bigint;            // Transaction fee in lamports
  computeUnits: number;   // Compute units consumed

  // ─────────────────────────────────────────────────────────────
  // ACCOUNTS
  // ─────────────────────────────────────────────────────────────
  accounts: string[];     // All accounts involved (ordered)
  signer: string;         // Primary signer (fee payer)

  // ─────────────────────────────────────────────────────────────
  // PROGRAMS
  // ─────────────────────────────────────────────────────────────
  programId: string;      // Primary program (the one we matched on)
  programIds: string[];   // All programs invoked

  // ─────────────────────────────────────────────────────────────
  // INSTRUCTIONS
  // ─────────────────────────────────────────────────────────────
  instruction: ParsedInstruction;   // Primary instruction (matched program)
  instructions: ParsedInstruction[]; // All top-level instructions
  innerInstructions: InnerInstruction[]; // CPI calls

  // ─────────────────────────────────────────────────────────────
  // BALANCE CHANGES
  // ─────────────────────────────────────────────────────────────
  solTransfers: SolTransfer[];      // SOL balance changes
  tokenTransfers: TokenTransfer[];  // Token balance changes

  // ─────────────────────────────────────────────────────────────
  // LOGS & EVENTS
  // ─────────────────────────────────────────────────────────────
  logs: string[];              // Raw program log messages
  events: ParsedEvent[];       // Decoded events from logs (using IDL)

  // ─────────────────────────────────────────────────────────────
  // RAW DATA
  // ─────────────────────────────────────────────────────────────
  raw: RawTransaction;    // Original Laserstream data (for escape hatch)
}

/**
 * Raw transaction data from Laserstream (Yellowstone format)
 * Kept for advanced users who need full access
 */
export interface RawTransaction {
  transaction: {
    message: {
      accountKeys: string[];
      instructions: Array<{
        programIdIndex: number;
        accounts: number[];
        data: string;
      }>;
      recentBlockhash: string;
      addressTableLookups?: Array<{
        accountKey: string;
        writableIndexes: number[];
        readonlyIndexes: number[];
      }>;
    };
    signatures: string[];
  };
  meta: {
    err: any;
    fee: number;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances: Array<{
      accountIndex: number;
      mint: string;
      owner: string;
      uiTokenAmount: {
        amount: string;
        decimals: number;
        uiAmount: number;
        uiAmountString: string;
      };
    }>;
    postTokenBalances: Array<{
      accountIndex: number;
      mint: string;
      owner: string;
      uiTokenAmount: {
        amount: string;
        decimals: number;
        uiAmount: number;
        uiAmountString: string;
      };
    }>;
    innerInstructions: Array<{
      index: number;
      instructions: Array<{
        programIdIndex: number;
        accounts: number[];
        data: string;
      }>;
    }>;
    logMessages: string[];
    computeUnitsConsumed?: number;
    // Resolved addresses from lookup tables (versioned transactions)
    loadedAddresses?: {
      writable: string[];
      readonly: string[];
    };
    // Data returned by program via sol_set_return_data
    returnData?: {
      programId: string;
      data: [string, string]; // [data, encoding]
    };
    // Rewards (usually empty for non-vote transactions)
    rewards?: Array<{
      pubkey: string;
      lamports: number;
      postBalance: number;
      rewardType: string;
    }>;
  };
}

// ============================================
// WEBSOCKET MESSAGE
// ============================================

export interface PipelineEvent {
  pipelineId: string;
  programId: ProgramId;
  timestamp: number;
  data: any;  // Shape defined by transform
}

// ============================================
// UTILITIES
// ============================================

export const LAMPORTS_PER_SOL = 1_000_000_000;

export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

export function solToLamports(sol: number): number {
  return sol * LAMPORTS_PER_SOL;
}
