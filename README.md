```
  ----++                                ----++                    ---+++     
  ---+++                                ---++                     ---++      
 ----+---     -----     ---------  --------++ ------     -----   ----++----- 
 ---------+ --------++----------++--------+++--------+ --------++---++---++++
 ---+++---++ ++++---++---+++---++---+++---++---+++---++---++---++------++++  
----++ ---++--------++---++----++---++ ---++---++ ---+---++     -------++    
----+----+---+++---++---++----++---++----++---++---+++--++ --------+---++   
---------++--------+++--------+++--------++ -------+++ -------++---++----++  
 +++++++++   +++++++++- +++---++   ++++++++    ++++++    ++++++  ++++  ++++  
                     --------+++                                             
                       +++++++                                               
```

# @bagdock/analytics

The official Bagdock Analytics SDK — lightweight client-side event tracking with automatic batching and deduplication.

[![npm version](https://img.shields.io/npm/v/@bagdock/analytics.svg)](https://www.npmjs.com/package/@bagdock/analytics)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Install

```bash
npm install @bagdock/analytics
```

```bash
yarn add @bagdock/analytics
```

```bash
pnpm add @bagdock/analytics
```

```bash
bun add @bagdock/analytics
```

## Quick start

```typescript
import { BagdockAnalytics } from '@bagdock/analytics'

const analytics = new BagdockAnalytics({
  writeKey: 'ak_live_...',
})

// Track a custom event
analytics.track('unit_viewed', {
  unitId: 'unit_abc123',
  unitSize: '10x10',
})

// Track a page view
analytics.page('/facilities/downtown')

// Flush immediately (e.g., before page unload)
await analytics.flush()
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `writeKey` | `string` | — | **Required.** Your Bagdock analytics write key |
| `baseUrl` | `string` | `https://api.bagdock.com` | API base URL |
| `flushInterval` | `number` | `5000` | Flush interval in milliseconds |
| `maxBatchSize` | `number` | `25` | Max events per batch |

## API

| Method | Description |
|--------|-------------|
| `track(event, properties?)` | Track a custom event |
| `page(path?, properties?)` | Track a page view |
| `identify(userId, traits?)` | Identify a user |
| `flush()` | Flush the event queue immediately |
| `reset()` | Clear user identity and queue |

## Zero dependencies

This SDK has no external runtime dependencies. It uses the native `fetch` API and is designed to be as lightweight as possible for client-side use.

## License

MIT
