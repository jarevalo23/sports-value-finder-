// Coherent cross-venue demo data (Kalshi + Polymarket + sportsbooks).
//
// Everything here is shaped exactly like the raw upstream payloads, so demo
// mode runs through the same schema validation and normalization as live data.
// Timestamps are relative to `now`, and the scripted big plays are built to
// exercise each reasoning hypothesis:
//
//   Brazil  (Kalshi)      favorite backing — overpaid vs Polymarket, no edge
//   Draw ARG-MEX (Kalshi) value — bought well below cross-venue consensus
//   Liverpool (both)      arbitrage — Kalshi YES + Polymarket NO pair
//   Man City (Polymarket) informed flow — late, both venues followed
//   Argentina (Polymarket) momentum chase — bought after a run-up, reverted
//
// Numbers are illustrative, not real market data.

import type { Game } from '@/types/odds';

const MIN = 60_000;

interface DemoMatch {
  key: 'BRAHAI' | 'ARGMEX' | 'MCILIV';
  kickoffMin: number; // minutes from now
  kalshi: { eventTicker: string; title: string; labels: [string, string, string] };
  poly: { eventId: string; title: string; labels: [string, string, string] };
  books: { sportKey: string; sportTitle: string; home: string; away: string };
}

const MATCHES: DemoMatch[] = [
  {
    key: 'BRAHAI',
    kickoffMin: 360,
    kalshi: { eventTicker: 'KXWCGAME-BRAHAI', title: 'Brazil vs Haiti', labels: ['Brazil', 'Tie', 'Haiti'] },
    poly: { eventId: '90011', title: 'Brazil vs. Haiti', labels: ['Brazil', 'Draw', 'Haiti'] },
    books: { sportKey: 'soccer_fifa_world_cup', sportTitle: 'FIFA World Cup', home: 'Brazil', away: 'Haiti' },
  },
  {
    key: 'ARGMEX',
    kickoffMin: 540,
    kalshi: { eventTicker: 'KXWCGAME-ARGMEX', title: 'Argentina vs Mexico', labels: ['Argentina', 'Tie', 'Mexico'] },
    poly: { eventId: '90012', title: 'Argentina vs. Mexico', labels: ['Argentina', 'Draw', 'Mexico'] },
    books: { sportKey: 'soccer_fifa_world_cup', sportTitle: 'FIFA World Cup', home: 'Argentina', away: 'Mexico' },
  },
  {
    key: 'MCILIV',
    kickoffMin: 72,
    kalshi: { eventTicker: 'KXEPLGAME-MCILIV', title: 'Man City vs Liverpool', labels: ['Man City', 'Tie', 'Liverpool'] },
    poly: { eventId: '90013', title: 'Manchester City FC vs. Liverpool FC', labels: ['Manchester City FC', 'Draw', 'Liverpool FC'] },
    books: { sportKey: 'soccer_epl', sportTitle: 'EPL', home: 'Manchester City', away: 'Liverpool' },
  },
];

type Side = 0 | 1 | 2; // home, draw, away
type Keyframes = Array<[minutesFromNow: number, price: number]>;

// Price paths (YES probability) per venue/match/outcome. Flat unless listed.
const KALSHI_PATHS: Record<string, Keyframes[]> = {
  BRAHAI: [[[-400, 0.88]], [[-400, 0.09]], [[-400, 0.04]]],
  ARGMEX: [
    [[-400, 0.58], [0, 0.6]],
    [[-400, 0.22], [-90, 0.22], [-60, 0.24]],
    [[-400, 0.17], [0, 0.16]],
  ],
  MCILIV: [
    [[-400, 0.46], [-35, 0.46], [-25, 0.49], [0, 0.5]],
    [[-400, 0.26], [0, 0.25]],
    [[-400, 0.28], [-35, 0.28], [-25, 0.27], [0, 0.26]],
  ],
};

const POLY_PATHS: Record<string, Keyframes[]> = {
  BRAHAI: [[[-400, 0.86]], [[-400, 0.1]], [[-400, 0.04]]],
  ARGMEX: [
    [[-400, 0.55], [-180, 0.55], [-20, 0.61], [-10, 0.59], [0, 0.58]],
    [[-400, 0.27]],
    [[-400, 0.17], [0, 0.16]],
  ],
  MCILIV: [
    [[-400, 0.46], [-35, 0.47], [-20, 0.5], [0, 0.51]],
    [[-400, 0.25]],
    [[-400, 0.31], [-140, 0.31], [-60, 0.27], [-35, 0.27], [0, 0.25]],
  ],
};

function interpolate(frames: Keyframes, minute: number): number {
  if (minute <= frames[0][0]) return frames[0][1];
  for (let i = 1; i < frames.length; i++) {
    const [m1, p1] = frames[i];
    const [m0, p0] = frames[i - 1];
    if (minute <= m1) return p0 + ((p1 - p0) * (minute - m0)) / (m1 - m0);
  }
  return frames[frames.length - 1][1];
}

/** Deterministic PRNG so demo trade sizes are stable across reloads. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const iso = (now: number, minutesFromNow: number) => new Date(now + minutesFromNow * MIN).toISOString();
const kalshiTicker = (m: DemoMatch, side: Side) =>
  `${m.kalshi.eventTicker}-${['HOME', 'TIE', 'AWAY'][side]}`;
const polyConditionId = (m: DemoMatch, side: Side) =>
  `0x${m.key.toLowerCase()}${side}${'0'.repeat(56)}`.slice(0, 66);

// ---------------------------------------------------------------- Kalshi

const KALSHI_SPREAD_CENTS = 1;
const KALSHI_VOLUME: Record<string, [number, number, number]> = {
  BRAHAI: [412350, 54210, 38900],
  ARGMEX: [221400, 98600, 73400],
  MCILIV: [305700, 142900, 151200],
};

/** Raw Kalshi `/events?with_nested_markets=true` response. */
export function demoKalshiEventsResponse(now: number = Date.now()) {
  return {
    cursor: '',
    events: MATCHES.map((m) => ({
      event_ticker: m.kalshi.eventTicker,
      title: m.kalshi.title,
      sub_title: '',
      markets: ([0, 1, 2] as Side[]).map((side) => {
        const last = Math.round(interpolate(KALSHI_PATHS[m.key][side], 0) * 100);
        const volume = KALSHI_VOLUME[m.key][side];
        return {
          ticker: kalshiTicker(m, side),
          event_ticker: m.kalshi.eventTicker,
          title: `${m.kalshi.title} Winner?`,
          yes_sub_title: m.kalshi.labels[side],
          status: 'active',
          yes_bid: last - KALSHI_SPREAD_CENTS,
          yes_ask: last + KALSHI_SPREAD_CENTS,
          last_price: last,
          volume,
          volume_24h: Math.round(volume * 0.22),
          open_interest: Math.round(volume * 0.45),
          expected_expiration_time: iso(now, m.kickoffMin + 120),
        };
      }),
    })),
  };
}

interface KalshiTradeRow {
  trade_id: string;
  ticker: string;
  count: number;
  yes_price: number;
  no_price: number;
  taker_side: 'yes' | 'no';
  created_time: string;
}

// Scripted big Kalshi trades: [match, side, minutesFromNow, contracts, yesCents, takerSide]
const KALSHI_PLAYS: Array<[DemoMatch['key'], Side, number, number, number, 'yes' | 'no']> = [
  ['BRAHAI', 0, -20, 40000, 89, 'yes'],
  ['ARGMEX', 1, -90, 60000, 22, 'yes'],
  ['MCILIV', 2, -150, 50000, 28, 'yes'],
  ['MCILIV', 0, -30, 20000, 48, 'yes'],
];

/** Raw Kalshi `/markets/trades` response for one ticker. */
export function demoKalshiTradesResponse(ticker: string, now: number = Date.now()) {
  const trades: KalshiTradeRow[] = [];
  for (const m of MATCHES) {
    for (const side of [0, 1, 2] as Side[]) {
      if (kalshiTicker(m, side) !== ticker) continue;
      const rand = lcg(m.key.charCodeAt(0) * 31 + side * 7);
      for (let minute = -360; minute <= -5; minute += 20) {
        const yes = Math.round(interpolate(KALSHI_PATHS[m.key][side], minute) * 100);
        const taker = rand() < 0.55 ? 'yes' : 'no';
        trades.push({
          trade_id: `${ticker}-bg${minute}`,
          ticker,
          count: Math.round(300 + rand() * 3700),
          yes_price: yes,
          no_price: 100 - yes,
          taker_side: taker,
          created_time: iso(now, minute + rand() * 3),
        });
      }
      for (const [key, s, minute, count, yes, taker] of KALSHI_PLAYS) {
        if (key !== m.key || s !== side) continue;
        trades.push({
          trade_id: `${ticker}-play${minute}`,
          ticker,
          count,
          yes_price: yes,
          no_price: 100 - yes,
          taker_side: taker,
          created_time: iso(now, minute),
        });
      }
    }
  }
  trades.sort((a, b) => b.created_time.localeCompare(a.created_time)); // newest first, like the API
  return { cursor: '', trades };
}

// ------------------------------------------------------------ Polymarket

const POLY_HALF_SPREAD = 0.005;

/** Raw Polymarket Gamma `/events` response. */
export function demoPolymarketEventsResponse(now: number = Date.now()) {
  return MATCHES.map((m) => ({
    id: m.poly.eventId,
    slug: m.poly.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    title: m.poly.title,
    startTime: iso(now, m.kickoffMin),
    endDate: iso(now, m.kickoffMin + 120),
    markets: ([0, 1, 2] as Side[]).map((side) => {
      const mid = Number(interpolate(POLY_PATHS[m.key][side], 0).toFixed(3));
      const label = m.poly.labels[side];
      return {
        id: `${m.poly.eventId}${side}`,
        question: side === 1 ? `Will ${m.poly.title} end in a draw?` : `Will ${label} win?`,
        conditionId: polyConditionId(m, side),
        groupItemTitle: side === 1 ? 'Draw' : label,
        outcomes: '["Yes", "No"]',
        outcomePrices: JSON.stringify([mid.toFixed(3), (1 - mid).toFixed(3)]),
        bestBid: Number((mid - POLY_HALF_SPREAD).toFixed(3)),
        bestAsk: Number((mid + POLY_HALF_SPREAD).toFixed(3)),
        lastTradePrice: mid,
        volumeNum: [480000, 150000, 120000][side],
        gameStartTime: iso(now, m.kickoffMin),
        active: true,
        closed: false,
      };
    }),
  }));
}

interface PolyTradeRow {
  proxyWallet: string;
  side: 'BUY' | 'SELL';
  asset: string;
  conditionId: string;
  size: number;
  price: number;
  timestamp: number;
  outcome: 'Yes' | 'No';
  transactionHash: string;
}

// Scripted big Polymarket trades: [match, side, minutesFromNow, shares, tokenPrice, outcome, wallet]
const POLY_PLAYS: Array<[DemoMatch['key'], Side, number, number, number, 'Yes' | 'No', string]> = [
  ['MCILIV', 2, -149, 46000, 0.69, 'No', '0x7a3f00000000000000000000000000000000e21c'],
  ['MCILIV', 0, -35, 80000, 0.47, 'Yes', '0x91bd0000000000000000000000000000000004aa'],
  ['ARGMEX', 0, -15, 50000, 0.62, 'Yes', '0x2c6e00000000000000000000000000000000b913'],
];

/** Raw Polymarket data-api `/trades?market=<conditionId>` response. */
export function demoPolymarketTradesResponse(conditionId: string, now: number = Date.now()): PolyTradeRow[] {
  const trades: PolyTradeRow[] = [];
  for (const m of MATCHES) {
    for (const side of [0, 1, 2] as Side[]) {
      if (polyConditionId(m, side) !== conditionId) continue;
      const rand = lcg(m.key.charCodeAt(1) * 17 + side * 13);
      for (let minute = -360; minute <= -5; minute += 20) {
        const yes = Number(interpolate(POLY_PATHS[m.key][side], minute).toFixed(3));
        const buyYes = rand() < 0.6;
        trades.push({
          proxyWallet: `0xbg${Math.floor(rand() * 1e8).toString(16).padStart(36, '0')}`,
          side: 'BUY',
          asset: `${conditionId}-${buyYes ? 'yes' : 'no'}`,
          conditionId,
          size: Math.round(400 + rand() * 4000),
          price: buyYes ? yes : Number((1 - yes).toFixed(3)),
          timestamp: Math.floor((now + (minute + rand() * 3) * MIN) / 1000),
          outcome: buyYes ? 'Yes' : 'No',
          transactionHash: `0xtx${m.key}${side}${minute}`,
        });
      }
      for (const [key, s, minute, size, price, outcome, wallet] of POLY_PLAYS) {
        if (key !== m.key || s !== side) continue;
        trades.push({
          proxyWallet: wallet,
          side: 'BUY',
          asset: `${conditionId}-${outcome.toLowerCase()}`,
          conditionId,
          size,
          price,
          timestamp: Math.floor((now + minute * MIN) / 1000),
          outcome,
          transactionHash: `0xplay${m.key}${side}${minute}`,
        });
      }
    }
  }
  return trades.sort((a, b) => b.timestamp - a.timestamp);
}

// ------------------------------------------------------------ Sportsbooks

// American odds per book: [home, draw, away]. ~4-5% overround, like real books.
const BOOK_ODDS: Record<DemoMatch['key'], Record<string, [number, number, number]>> = {
  BRAHAI: { draftkings: [-850, 900, 2000], fanduel: [-800, 850, 1900], betmgm: [-833, 850, 2000] },
  ARGMEX: { draftkings: [-150, 260, 550], fanduel: [-155, 255, 560], betmgm: [-154, 260, 525] },
  MCILIV: { draftkings: [-110, 290, 280], fanduel: [-112, 285, 285], betmgm: [-108, 290, 275] },
};

/** Odds API-shaped soccer games (3-way h2h) for the demo matches. */
export function demoSportsbookGames(sportKey: string, now: number = Date.now()): Game[] {
  return MATCHES.filter((m) => m.books.sportKey === sportKey).map((m) => ({
    id: `book-${m.key}`,
    sport_key: m.books.sportKey,
    sport_title: m.books.sportTitle,
    commence_time: iso(now, m.kickoffMin),
    home_team: m.books.home,
    away_team: m.books.away,
    bookmakers: Object.entries(BOOK_ODDS[m.key]).map(([key, [h, d, a]]) => ({
      key,
      title: key,
      last_update: iso(now, -2),
      markets: [
        {
          key: 'h2h',
          last_update: iso(now, -2),
          outcomes: [
            { name: m.books.home, price: h },
            { name: 'Draw', price: d },
            { name: m.books.away, price: a },
          ],
        },
      ],
    })),
  }));
}

export const DEMO_SPORTSBOOK_SPORTS = [...new Set(MATCHES.map((m) => m.books.sportKey))];
