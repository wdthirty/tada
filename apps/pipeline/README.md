# Pipeline Service

Processes events through user pipelines: Filter → Transform → Output

## Usage

```bash
# Install dependencies
npm install

# Build
npm run build

# Run standalone (for testing)
npm run dev
```

## Integration

The Pipeline Engine can be used standalone or integrated with the Ingestion Service:

```typescript
import { engine } from '@tada/pipeline';

// Register a pipeline
engine.upsertPipeline({
  id: 'my-pipeline',
  name: 'My Trade Tracker',
  programs: ['PUMPSWAP', 'PUMP_BONDING_CURVE'],
  filter: {
    instructions: ['TradeEvent', 'BuyEvent', 'SellEvent'],
  },
  transform: {
    mode: 'template',
    template: 'trade',
  },
  // ...
});

// Process events
const transformed = engine.processEvents(events);
```

## Filter Types

- `instructions`: Match by event name
- `accounts.include`: Match if any account is present
- `accounts.exclude`: Exclude if any account is present
- `conditions`: Field comparisons (eq, gt, lt, etc.)
- `$and`, `$or`: Logical operators

## Transform Templates

- `trade`: Extracts trade-specific data (direction, amounts, price)
- `transfer`: Extracts transfer data (from, to, amount)
- `migration`: Extracts migration data (token, pool, creator)
- `raw`: Passes through all event data
