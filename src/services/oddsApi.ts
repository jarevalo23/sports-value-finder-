// The Odds API service layer

import {
  Game,
  Sport,
  NormalizedOdds,
  ValueBet,
  OddsComparison,
  MarketType,
  BASELINE_BOOKMAKERS,
  BOOKMAKER_DISPLAY_NAMES,
} from '@/types/odds';
import {
  impliedProbability,
  calculateAverageOdds,
  calculateEdge,
  calculateEdgePercentage,
  calculateExpectedValue,
  isHotBet,
} from '@/utils/oddsCalculations';

const API_BASE_URL = 'https://api.the-odds-api.com/v4';

interface OddsApiConfig {
  apiKey: string;
  regions?: string;
  markets?: MarketType[];
  oddsFormat?: 'american' | 'decimal';
}

// Use demo data when no API key is set
const USE_DEMO_DATA = !process.env.ODDS_API_KEY || process.env.ODDS_API_KEY === 'demo';

/**
 * Fetch available sports
 */
export async function fetchSports(config: OddsApiConfig): Promise<Sport[]> {
  if (USE_DEMO_DATA) {
    return getDemoSports();
  }

  const response = await fetch(
    `${API_BASE_URL}/sports?apiKey=${config.apiKey}`,
    { next: { revalidate: 3600 } } // Cache for 1 hour
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch sports: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch odds for a specific sport
 */
export async function fetchOdds(
  sportKey: string,
  config: OddsApiConfig
): Promise<Game[]> {
  if (USE_DEMO_DATA) {
    return getDemoOdds(sportKey);
  }

  const markets = config.markets?.join(',') || 'h2h,spreads,totals';
  const regions = config.regions || 'us';
  const oddsFormat = config.oddsFormat || 'american';

  const url = `${API_BASE_URL}/sports/${sportKey}/odds?apiKey=${config.apiKey}&regions=${regions}&markets=${markets}&oddsFormat=${oddsFormat}`;

  const response = await fetch(url, {
    next: { revalidate: 60 }, // Cache for 1 minute
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch odds: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Process odds data into normalized format
 */
export function normalizeOdds(
  games: Game[],
  baselineBooks: string[] = [...BASELINE_BOOKMAKERS]
): NormalizedOdds[] {
  const normalized: NormalizedOdds[] = [];

  for (const game of games) {
    for (const bookmaker of game.bookmakers) {
      for (const market of bookmaker.markets) {
        for (const outcome of market.outcomes) {
          normalized.push({
            gameId: game.id,
            sportKey: game.sport_key,
            sportTitle: game.sport_title,
            homeTeam: game.home_team,
            awayTeam: game.away_team,
            commenceTime: game.commence_time,
            market: market.key as MarketType,
            selection: outcome.name,
            point: outcome.point,
            bookmaker: bookmaker.key,
            bookmakerTitle: BOOKMAKER_DISPLAY_NAMES[bookmaker.key] || bookmaker.title,
            odds: outcome.price,
            impliedProbability: impliedProbability(outcome.price),
            isBaseline: baselineBooks.includes(bookmaker.key),
          });
        }
      }
    }
  }

  return normalized;
}

/**
 * Group odds by game, market, and selection
 */
export function groupOdds(normalizedOdds: NormalizedOdds[]): Map<string, NormalizedOdds[]> {
  const grouped = new Map<string, NormalizedOdds[]>();

  for (const odds of normalizedOdds) {
    const key = `${odds.gameId}-${odds.market}-${odds.selection}-${odds.point ?? 'null'}`;

    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(odds);
  }

  return grouped;
}

/**
 * Calculate value bets from odds data
 */
export function findValueBets(
  games: Game[],
  baselineBooks: string[] = [...BASELINE_BOOKMAKERS],
  valueThreshold: number = 5,
  hotThreshold: number = 15
): ValueBet[] {
  const normalized = normalizeOdds(games, baselineBooks);
  const grouped = groupOdds(normalized);
  const valueBets: ValueBet[] = [];

  for (const [, oddsGroup] of grouped) {
    // Get baseline odds
    const baselineOddsList = oddsGroup
      .filter((o) => o.isBaseline)
      .map((o) => o.odds);

    if (baselineOddsList.length === 0) continue;

    const baselineOdds = calculateAverageOdds(baselineOddsList);
    const baselineProb = impliedProbability(baselineOdds);

    // Compare non-baseline bookmakers
    const nonBaseline = oddsGroup.filter((o) => !o.isBaseline);

    for (const odds of nonBaseline) {
      const edgePercentage = calculateEdgePercentage(odds.odds, baselineOdds);

      if (edgePercentage >= valueThreshold) {
        valueBets.push({
          id: `${odds.gameId}-${odds.market}-${odds.selection}-${odds.bookmaker}`,
          gameId: odds.gameId,
          sportKey: odds.sportKey,
          sportTitle: odds.sportTitle,
          homeTeam: odds.homeTeam,
          awayTeam: odds.awayTeam,
          commenceTime: odds.commenceTime,
          market: odds.market,
          selection: odds.selection,
          point: odds.point,
          bookmaker: odds.bookmaker,
          bookmakerTitle: odds.bookmakerTitle,
          odds: odds.odds,
          impliedProbability: odds.impliedProbability,
          baselineOdds,
          baselineImpliedProbability: baselineProb,
          edge: calculateEdge(odds.odds, baselineOdds),
          edgePercentage,
          expectedValue: calculateExpectedValue(odds.odds, baselineProb),
          timestamp: new Date().toISOString(),
          isHot: isHotBet(edgePercentage, hotThreshold),
        });
      }
    }
  }

  // Sort by edge descending
  return valueBets.sort((a, b) => b.edgePercentage - a.edgePercentage);
}

/**
 * Build odds comparison data for display
 */
export function buildOddsComparison(
  games: Game[],
  baselineBooks: string[] = [...BASELINE_BOOKMAKERS]
): OddsComparison[] {
  const normalized = normalizeOdds(games, baselineBooks);
  const grouped = groupOdds(normalized);
  const comparisons: OddsComparison[] = [];

  for (const [, oddsGroup] of grouped) {
    if (oddsGroup.length === 0) continue;

    const sample = oddsGroup[0];

    // Get baseline odds
    const baselineOddsList = oddsGroup
      .filter((o) => o.isBaseline)
      .map((o) => o.odds);

    if (baselineOddsList.length === 0) continue;

    const baselineOdds = calculateAverageOdds(baselineOddsList);
    const baselineProb = impliedProbability(baselineOdds);

    comparisons.push({
      gameId: sample.gameId,
      sportKey: sample.sportKey,
      sportTitle: sample.sportTitle,
      homeTeam: sample.homeTeam,
      awayTeam: sample.awayTeam,
      commenceTime: sample.commenceTime,
      market: sample.market,
      selection: sample.selection,
      point: sample.point,
      baselineOdds,
      baselineImpliedProbability: baselineProb,
      bookmakerOdds: oddsGroup.map((o) => ({
        bookmaker: o.bookmaker,
        bookmakerTitle: o.bookmakerTitle,
        odds: o.odds,
        impliedProbability: o.impliedProbability,
        edge: calculateEdge(o.odds, baselineOdds),
        edgePercentage: calculateEdgePercentage(o.odds, baselineOdds),
        isBaseline: o.isBaseline,
      })),
    });
  }

  return comparisons;
}

// ============== DEMO DATA ==============
// Used when no API key is configured

function getDemoSports(): Sport[] {
  return [
    {
      key: 'basketball_nba',
      group: 'Basketball',
      title: 'NBA',
      description: 'US Basketball',
      active: true,
      has_outrights: false,
    },
    {
      key: 'americanfootball_nfl',
      group: 'American Football',
      title: 'NFL',
      description: 'US Football',
      active: true,
      has_outrights: true,
    },
    {
      key: 'baseball_mlb',
      group: 'Baseball',
      title: 'MLB',
      description: 'US Baseball',
      active: true,
      has_outrights: true,
    },
    {
      key: 'icehockey_nhl',
      group: 'Ice Hockey',
      title: 'NHL',
      description: 'US Ice Hockey',
      active: true,
      has_outrights: false,
    },
  ];
}

function getDemoOdds(sportKey: string): Game[] {
  const now = new Date();
  const games: Record<string, Game[]> = {
    basketball_nba: [
      {
        id: 'nba-game-1',
        sport_key: 'basketball_nba',
        sport_title: 'NBA',
        commence_time: new Date(now.getTime() + 3600000).toISOString(),
        home_team: 'Los Angeles Lakers',
        away_team: 'Golden State Warriors',
        bookmakers: [
          {
            key: 'draftkings',
            title: 'DraftKings',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Los Angeles Lakers', price: -145 },
                  { name: 'Golden State Warriors', price: 125 },
                ],
              },
              {
                key: 'spreads',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Los Angeles Lakers', price: -110, point: -3.5 },
                  { name: 'Golden State Warriors', price: -110, point: 3.5 },
                ],
              },
              {
                key: 'totals',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Over', price: -110, point: 228.5 },
                  { name: 'Under', price: -110, point: 228.5 },
                ],
              },
            ],
          },
          {
            key: 'fanduel',
            title: 'FanDuel',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Los Angeles Lakers', price: -150 },
                  { name: 'Golden State Warriors', price: 128 },
                ],
              },
              {
                key: 'spreads',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Los Angeles Lakers', price: -108, point: -3.5 },
                  { name: 'Golden State Warriors', price: -112, point: 3.5 },
                ],
              },
              {
                key: 'totals',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Over', price: -108, point: 228.5 },
                  { name: 'Under', price: -112, point: 228.5 },
                ],
              },
            ],
          },
          {
            key: 'betmgm',
            title: 'BetMGM',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Los Angeles Lakers', price: -140 },
                  { name: 'Golden State Warriors', price: 120 },
                ],
              },
              {
                key: 'spreads',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Los Angeles Lakers', price: -110, point: -3 },
                  { name: 'Golden State Warriors', price: -110, point: 3 },
                ],
              },
              {
                key: 'totals',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Over', price: -110, point: 229 },
                  { name: 'Under', price: -110, point: 229 },
                ],
              },
            ],
          },
          {
            key: 'williamhill_us',
            title: 'Caesars',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Los Angeles Lakers', price: -148 },
                  { name: 'Golden State Warriors', price: 126 },
                ],
              },
              {
                key: 'spreads',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Los Angeles Lakers', price: -110, point: -3.5 },
                  { name: 'Golden State Warriors', price: -110, point: 3.5 },
                ],
              },
              {
                key: 'totals',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Over', price: -110, point: 228.5 },
                  { name: 'Under', price: -110, point: 228.5 },
                ],
              },
            ],
          },
          {
            key: 'betrivers',
            title: 'BetRivers',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Los Angeles Lakers', price: -142 },
                  { name: 'Golden State Warriors', price: 122 },
                ],
              },
            ],
          },
          // Non-baseline bookmaker with VALUE
          {
            key: 'betonlineag',
            title: 'BetOnline',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Los Angeles Lakers', price: -120 }, // VALUE!
                  { name: 'Golden State Warriors', price: 155 }, // VALUE!
                ],
              },
              {
                key: 'spreads',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Los Angeles Lakers', price: 105, point: -3.5 }, // VALUE!
                  { name: 'Golden State Warriors', price: -105, point: 3.5 },
                ],
              },
              {
                key: 'totals',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Over', price: 100, point: 228.5 }, // VALUE!
                  { name: 'Under', price: -105, point: 228.5 },
                ],
              },
            ],
          },
          {
            key: 'bovada',
            title: 'Bovada',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Los Angeles Lakers', price: -135 },
                  { name: 'Golden State Warriors', price: 165 }, // BIG VALUE!
                ],
              },
            ],
          },
          {
            key: 'mybookieag',
            title: 'MyBookie',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Los Angeles Lakers', price: -115 }, // VALUE!
                  { name: 'Golden State Warriors', price: 140 },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'nba-game-2',
        sport_key: 'basketball_nba',
        sport_title: 'NBA',
        commence_time: new Date(now.getTime() + 7200000).toISOString(),
        home_team: 'Boston Celtics',
        away_team: 'Miami Heat',
        bookmakers: [
          {
            key: 'draftkings',
            title: 'DraftKings',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Boston Celtics', price: -180 },
                  { name: 'Miami Heat', price: 155 },
                ],
              },
              {
                key: 'spreads',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Boston Celtics', price: -110, point: -4.5 },
                  { name: 'Miami Heat', price: -110, point: 4.5 },
                ],
              },
            ],
          },
          {
            key: 'fanduel',
            title: 'FanDuel',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Boston Celtics', price: -175 },
                  { name: 'Miami Heat', price: 150 },
                ],
              },
            ],
          },
          {
            key: 'betmgm',
            title: 'BetMGM',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Boston Celtics', price: -185 },
                  { name: 'Miami Heat', price: 160 },
                ],
              },
            ],
          },
          {
            key: 'williamhill_us',
            title: 'Caesars',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Boston Celtics', price: -178 },
                  { name: 'Miami Heat', price: 152 },
                ],
              },
            ],
          },
          {
            key: 'betrivers',
            title: 'BetRivers',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Boston Celtics', price: -172 },
                  { name: 'Miami Heat', price: 148 },
                ],
              },
            ],
          },
          {
            key: 'betonlineag',
            title: 'BetOnline',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Boston Celtics', price: -155 }, // VALUE!
                  { name: 'Miami Heat', price: 190 }, // BIG VALUE!
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'nba-game-3',
        sport_key: 'basketball_nba',
        sport_title: 'NBA',
        commence_time: new Date(now.getTime() + 10800000).toISOString(),
        home_team: 'Phoenix Suns',
        away_team: 'Denver Nuggets',
        bookmakers: [
          {
            key: 'draftkings',
            title: 'DraftKings',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Phoenix Suns', price: 115 },
                  { name: 'Denver Nuggets', price: -135 },
                ],
              },
            ],
          },
          {
            key: 'fanduel',
            title: 'FanDuel',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Phoenix Suns', price: 118 },
                  { name: 'Denver Nuggets', price: -138 },
                ],
              },
            ],
          },
          {
            key: 'betmgm',
            title: 'BetMGM',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Phoenix Suns', price: 112 },
                  { name: 'Denver Nuggets', price: -132 },
                ],
              },
            ],
          },
          {
            key: 'williamhill_us',
            title: 'Caesars',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Phoenix Suns', price: 116 },
                  { name: 'Denver Nuggets', price: -136 },
                ],
              },
            ],
          },
          {
            key: 'betrivers',
            title: 'BetRivers',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Phoenix Suns', price: 114 },
                  { name: 'Denver Nuggets', price: -134 },
                ],
              },
            ],
          },
          {
            key: 'bovada',
            title: 'Bovada',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Phoenix Suns', price: 145 }, // BIG VALUE!
                  { name: 'Denver Nuggets', price: -120 }, // VALUE!
                ],
              },
            ],
          },
        ],
      },
    ],
    americanfootball_nfl: [
      {
        id: 'nfl-game-1',
        sport_key: 'americanfootball_nfl',
        sport_title: 'NFL',
        commence_time: new Date(now.getTime() + 86400000).toISOString(),
        home_team: 'Kansas City Chiefs',
        away_team: 'Buffalo Bills',
        bookmakers: [
          {
            key: 'draftkings',
            title: 'DraftKings',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Kansas City Chiefs', price: -165 },
                  { name: 'Buffalo Bills', price: 142 },
                ],
              },
              {
                key: 'spreads',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Kansas City Chiefs', price: -110, point: -3.5 },
                  { name: 'Buffalo Bills', price: -110, point: 3.5 },
                ],
              },
              {
                key: 'totals',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Over', price: -110, point: 51.5 },
                  { name: 'Under', price: -110, point: 51.5 },
                ],
              },
            ],
          },
          {
            key: 'fanduel',
            title: 'FanDuel',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Kansas City Chiefs', price: -160 },
                  { name: 'Buffalo Bills', price: 138 },
                ],
              },
            ],
          },
          {
            key: 'betmgm',
            title: 'BetMGM',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Kansas City Chiefs', price: -162 },
                  { name: 'Buffalo Bills', price: 140 },
                ],
              },
            ],
          },
          {
            key: 'williamhill_us',
            title: 'Caesars',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Kansas City Chiefs', price: -168 },
                  { name: 'Buffalo Bills', price: 145 },
                ],
              },
            ],
          },
          {
            key: 'betrivers',
            title: 'BetRivers',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Kansas City Chiefs', price: -158 },
                  { name: 'Buffalo Bills', price: 136 },
                ],
              },
            ],
          },
          {
            key: 'betonlineag',
            title: 'BetOnline',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Kansas City Chiefs', price: -140 }, // VALUE!
                  { name: 'Buffalo Bills', price: 175 }, // BIG VALUE!
                ],
              },
              {
                key: 'spreads',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Kansas City Chiefs', price: -105, point: -3 }, // VALUE!
                  { name: 'Buffalo Bills', price: -105, point: 3 },
                ],
              },
            ],
          },
        ],
      },
    ],
    baseball_mlb: [
      {
        id: 'mlb-game-1',
        sport_key: 'baseball_mlb',
        sport_title: 'MLB',
        commence_time: new Date(now.getTime() + 14400000).toISOString(),
        home_team: 'New York Yankees',
        away_team: 'Boston Red Sox',
        bookmakers: [
          {
            key: 'draftkings',
            title: 'DraftKings',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'New York Yankees', price: -130 },
                  { name: 'Boston Red Sox', price: 110 },
                ],
              },
            ],
          },
          {
            key: 'fanduel',
            title: 'FanDuel',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'New York Yankees', price: -128 },
                  { name: 'Boston Red Sox', price: 108 },
                ],
              },
            ],
          },
          {
            key: 'betmgm',
            title: 'BetMGM',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'New York Yankees', price: -132 },
                  { name: 'Boston Red Sox', price: 112 },
                ],
              },
            ],
          },
          {
            key: 'williamhill_us',
            title: 'Caesars',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'New York Yankees', price: -126 },
                  { name: 'Boston Red Sox', price: 106 },
                ],
              },
            ],
          },
          {
            key: 'betrivers',
            title: 'BetRivers',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'New York Yankees', price: -125 },
                  { name: 'Boston Red Sox', price: 105 },
                ],
              },
            ],
          },
          {
            key: 'mybookieag',
            title: 'MyBookie',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'New York Yankees', price: -105 }, // BIG VALUE!
                  { name: 'Boston Red Sox', price: 145 }, // BIG VALUE!
                ],
              },
            ],
          },
        ],
      },
    ],
    icehockey_nhl: [
      {
        id: 'nhl-game-1',
        sport_key: 'icehockey_nhl',
        sport_title: 'NHL',
        commence_time: new Date(now.getTime() + 18000000).toISOString(),
        home_team: 'Toronto Maple Leafs',
        away_team: 'Montreal Canadiens',
        bookmakers: [
          {
            key: 'draftkings',
            title: 'DraftKings',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Toronto Maple Leafs', price: -155 },
                  { name: 'Montreal Canadiens', price: 132 },
                ],
              },
            ],
          },
          {
            key: 'fanduel',
            title: 'FanDuel',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Toronto Maple Leafs', price: -150 },
                  { name: 'Montreal Canadiens', price: 128 },
                ],
              },
            ],
          },
          {
            key: 'betmgm',
            title: 'BetMGM',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Toronto Maple Leafs', price: -152 },
                  { name: 'Montreal Canadiens', price: 130 },
                ],
              },
            ],
          },
          {
            key: 'williamhill_us',
            title: 'Caesars',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Toronto Maple Leafs', price: -158 },
                  { name: 'Montreal Canadiens', price: 135 },
                ],
              },
            ],
          },
          {
            key: 'betrivers',
            title: 'BetRivers',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Toronto Maple Leafs', price: -148 },
                  { name: 'Montreal Canadiens', price: 126 },
                ],
              },
            ],
          },
          {
            key: 'bovada',
            title: 'Bovada',
            last_update: now.toISOString(),
            markets: [
              {
                key: 'h2h',
                last_update: now.toISOString(),
                outcomes: [
                  { name: 'Toronto Maple Leafs', price: -125 }, // VALUE!
                  { name: 'Montreal Canadiens', price: 165 }, // BIG VALUE!
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  return games[sportKey] || [];
}
