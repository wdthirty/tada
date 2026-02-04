# Ingestion Service

Connects to Helius Laserstream and streams real-time transactions for all supported programs.

## Setup

```bash
# From project root
npm install

# Set environment variables
export HELIUS_API_KEY=your-api-key
export HELIUS_ENDPOINT=https://laserstream-mainnet-ewr.helius-rpc.com
```

## Running

```bash
# Development (with hot reload)
npm run dev:ingestion

# Or directly
cd apps/ingestion
npm run dev
```

## Output

Logs parsed transactions to console:
```
[2025-01-13T12:00:00.000Z] 6EF8rrec... | buy | 3xK8f7gN...
[2025-01-13T12:00:00.050Z] pAMMBay6... | sell | 7mP2kLq9...
```

## Programs Supported

- Pump.fun Bonding Curve (`6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`)
- PumpSwap AMM (`pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA`)
- Meteora DBC (`dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`)
- Meteora DAMM v1 (`Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB`)
- Meteora DAMM v2 (`cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`)
- Meteora DLMM (`LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo`)
