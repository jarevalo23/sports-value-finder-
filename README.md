# ValueEdge - Sports Betting Intelligence Platform

A premium sports betting value finder application with a sophisticated Financial Terminal aesthetic. Built for identifying betting edges across multiple bookmakers in real-time.

## Features

### Core Functionality
- **Real-time Odds Comparison**: Fetches live odds from multiple bookmakers via The Odds API
- **Value Bet Detection**: Automatically identifies betting opportunities with positive expected value
- **Baseline Calculation**: Uses 5 major bookmakers (DraftKings, FanDuel, BetMGM, Caesars, BetRivers) to establish fair market odds
- **Edge Calculation**: Calculates percentage edge and expected value for each opportunity
- **Hot Bet Indicators**: Highlights exceptional opportunities with >15% edge

### Supported Sports
- NFL (American Football)
- NBA (Basketball)
- MLB (Baseball)
- NHL (Ice Hockey)
- MLS (Soccer)
- Premier League (Soccer)

### Market Types
- Moneyline (H2H)
- Point Spreads
- Totals (Over/Under)

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand with persistence
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Charts**: Recharts
- **Data**: The Odds API

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repo-url>
cd sports-value-finder
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.local.example .env.local
```

4. Get your API key from [The Odds API](https://the-odds-api.com/) and add it to `.env.local`:
```env
ODDS_API_KEY=your_api_key_here
```

5. Start the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Demo Mode

If no API key is configured, the app runs in demo mode with realistic mock data showcasing all features.

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ODDS_API_KEY` | Your Odds API key | `demo` |
| `BASELINE_BOOKS` | Comma-separated baseline bookmakers | `draftkings,fanduel,betmgm,williamhill_us,betrivers` |
| `VALUE_THRESHOLD` | Minimum edge % to display | `5` |
| `HOT_THRESHOLD` | Edge % to mark as "hot" | `15` |
| `REFRESH_INTERVAL` | Auto-refresh interval (ms) | `60000` |

### In-App Settings

Click the Settings icon to configure:
- Baseline bookmakers selection
- Value threshold slider
- Hot threshold slider
- Auto-refresh toggle and interval

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   └── odds/
│   │       └── route.ts      # API route for odds data
│   ├── globals.css           # Global styles and CSS variables
│   ├── layout.tsx            # Root layout
│   └── page.tsx              # Main page
├── components/
│   ├── dashboard/
│   │   └── Dashboard.tsx     # Main dashboard component
│   └── ui/
│       ├── EdgeSlider.tsx    # Edge filter slider
│       ├── Header.tsx        # App header with settings
│       ├── LiveIndicator.tsx # Real-time status indicator
│       ├── LoadingSkeleton.tsx # Loading states
│       ├── MarketFilter.tsx  # Market type filter
│       ├── SportFilter.tsx   # Sport selection filter
│       ├── StatCard.tsx      # Statistics cards
│       └── ValueBetCard.tsx  # Value bet display card
├── hooks/
│   └── useOddsData.ts        # Data fetching hook
├── services/
│   └── oddsApi.ts            # Odds API service layer
├── store/
│   └── oddsStore.ts          # Zustand state store
├── types/
│   └── odds.ts               # TypeScript interfaces
└── utils/
    └── oddsCalculations.ts   # Odds math utilities
```

## Value Calculation Logic

### How It Works

1. **Baseline Establishment**: Odds from 5 major bookmakers are averaged to establish "true" market odds
2. **Edge Calculation**: Compare each bookmaker's odds against the baseline
3. **Value Detection**: Flag opportunities where the edge exceeds the threshold

### Formulas

```typescript
// Implied Probability from American Odds
if (odds > 0) {
  impliedProb = 100 / (odds + 100)
} else {
  impliedProb = Math.abs(odds) / (Math.abs(odds) + 100)
}

// Edge Calculation
edge = baselineImpliedProb - bookmakerImpliedProb

// Expected Value (per $100 bet)
EV = (trueProbability * profit) - ((1 - trueProbability) * stake)
```

## Big Plays & Cross-Venue Reasoning

The **Big plays** page (`/plays`, API: `GET /api/plays`) finds large trades on Kalshi and Polymarket, compares each one against the other exchange and a devigged sportsbook consensus, and explains why it was most likely made.

### How it works

1. **Load venues**: Kalshi events, Polymarket (Gamma) events, and 3-way sportsbook odds, each normalized to one venue-neutral model (`src/types/market.ts`) with devigged fair probabilities.
2. **Match events across venues** (`src/services/eventMatcher.ts`): canonical team names and aliases ("Man City" = "Manchester City FC"), either home/away order, kickoff window. Events that can't be matched confidently are reported, never guessed.
3. **Detect big plays**: individual trades above `minNotional`.
4. **Signals** (`src/reasoning/signals.ts`): 17 deterministic measurements, e.g. EV at the time of the fill (no look-ahead), EV vs current consensus, price vs the other exchange, locked-in arbitrage margin, price moves before/after on both venues, same-direction clusters, opposite flow, timing vs kickoff, size vs typical flow.
5. **Hypotheses** (`src/reasoning/hypotheses.ts`): transparent rules score six explanations: value, arbitrage, hedge, informed flow, momentum chase, favourite backing.
6. **Explanation** (`src/reasoning/explainer.ts`): Claude writes the narrative with structured output. It can only pick from the six explanations and cite signals that exist, and it gets every number pre-computed. Results are checked against the rule scores, cached per evidence fingerprint, and fall back to a rules-based explanation on any failure (no key, refusal, timeout, rate limit).

`GET /api/plays?minNotional=10000&limit=10&explain=3&lookbackHours=24`. `explain` = how many top plays get an LLM explanation (0-5); the rest use rules. Requests with `explain>0` are rate-limited to 10/min per client.

### Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Enables Claude explanations (rules-only without it) | unset |
| `REASONING_MODEL` / `REASONING_EFFORT` | Model and effort for explanations | `claude-opus-5-5` / `medium` |
| `REASONING_LLM=off` | Force rules-only explanations | |
| `KALSHI_SERIES_TICKER` | Comma-separated Kalshi series to load live (demo when unset) | unset |
| `POLYMARKET_LIVE=true` | Load Polymarket live (demo otherwise) | unset |
| `POLYMARKET_TAG_SLUG` | Gamma tag to scan | `soccer` |
| `POLYMARKET_FEE_COEFFICIENT` | Taker fee × P(1−P); verify per market | `0` |
| `SOCCER_SPORT_KEYS` | Odds API soccer keys for the sportsbook consensus | `soccer_fifa_world_cup,soccer_epl` |
| `SPORTSBOOK_WEIGHTS` | Per-book consensus weights, e.g. `pinnacle:3,draftkings:1` | sharp books weighted up |

Demo data for all three venues is shaped exactly like the real API payloads and runs through the same validation and normalization. A venue that fails in live mode is dropped and reported in `meta.warnings`; it is never silently replaced with demo data.

### API practices

All upstream calls go through `src/lib/http.ts`: hard timeouts, retries with jittered exponential backoff that honour `Retry-After`, zod validation of every response (schema drift fails loudly), and API keys redacted from errors. Route query params are validated with zod and errors use one shape: `{ error: { code, message } }`. Caches are keyed on every parameter, with single-flight de-duplication.

### Tests

```bash
npm test
```

Covers the HTTP client, devig math, cross-venue matching, the full pipeline on demo data (each scripted play gets the expected explanation), and the Claude path against a mocked SDK (no tokens spent).

## API Rate Limiting

The Odds API free tier allows 500 requests/month. This app implements:
- 60-second server-side caching
- Client-side data persistence
- Configurable refresh intervals
- Demo mode fallback

## Disclaimer

This tool is for educational and informational purposes only. Sports betting involves risk. Please gamble responsibly and in accordance with local laws.

---

Built with Next.js, TypeScript, and Tailwind CSS
