// Core types for The Odds API and value calculations

export interface Sport {
  key: string;
  group: string;
  title: string;
  description: string;
  active: boolean;
  has_outrights: boolean;
}

export interface Outcome {
  name: string;
  price: number;
  point?: number; // For spreads and totals
}

export interface Market {
  key: string;
  last_update: string;
  outcomes: Outcome[];
}

export interface Bookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: Market[];
}

export interface Game {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Bookmaker[];
}

export interface NormalizedOdds {
  gameId: string;
  sportKey: string;
  sportTitle: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  market: MarketType;
  selection: string;
  point?: number;
  bookmaker: string;
  bookmakerTitle: string;
  odds: number;
  impliedProbability: number;
  isBaseline: boolean;
}

export interface ValueBet {
  id: string;
  gameId: string;
  sportKey: string;
  sportTitle: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  market: MarketType;
  selection: string;
  point?: number;
  bookmaker: string;
  bookmakerTitle: string;
  odds: number;
  impliedProbability: number;
  baselineOdds: number;
  baselineImpliedProbability: number;
  edge: number;
  edgePercentage: number;
  expectedValue: number;
  timestamp: string;
  isHot: boolean;
}

export type MarketType = 'h2h' | 'spreads' | 'totals';

export interface BaselineConfig {
  bookmakers: string[];
  valueThreshold: number;
  hotThreshold: number;
}

export interface OddsComparison {
  gameId: string;
  sportKey: string;
  sportTitle: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  market: MarketType;
  selection: string;
  point?: number;
  baselineOdds: number;
  baselineImpliedProbability: number;
  bookmakerOdds: {
    bookmaker: string;
    bookmakerTitle: string;
    odds: number;
    impliedProbability: number;
    edge: number;
    edgePercentage: number;
    isBaseline: boolean;
  }[];
}

export interface DashboardStats {
  totalOpportunities: number;
  hotOpportunities: number;
  averageEdge: number;
  bestEdge: number;
  sportsWithValue: string[];
  lastUpdated: string;
}

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  remaining_requests?: number;
}

export const BASELINE_BOOKMAKERS = [
  'draftkings',
  'fanduel',
  'betmgm',
  'williamhill_us', // Caesars
  'betrivers',
] as const;

export const BOOKMAKER_DISPLAY_NAMES: Record<string, string> = {
  draftkings: 'DraftKings',
  fanduel: 'FanDuel',
  betmgm: 'BetMGM',
  williamhill_us: 'Caesars',
  betrivers: 'BetRivers',
  pointsbetus: 'PointsBet',
  unibet_us: 'Unibet',
  barstool: 'Barstool',
  twinspires: 'TwinSpires',
  betus: 'BetUS',
  bovada: 'Bovada',
  betonlineag: 'BetOnline',
  lowvig: 'LowVig',
  mybookieag: 'MyBookie',
  superbook: 'SuperBook',
  wynnbet: 'WynnBET',
  betfred: 'Betfred',
  circasports: 'Circa Sports',
  foxbet: 'FOX Bet',
  si_sportsbook: 'SI Sportsbook',
};

export const SUPPORTED_SPORTS = [
  { key: 'americanfootball_nfl', title: 'NFL', icon: '🏈' },
  { key: 'basketball_nba', title: 'NBA', icon: '🏀' },
  { key: 'baseball_mlb', title: 'MLB', icon: '⚾' },
  { key: 'soccer_usa_mls', title: 'MLS', icon: '⚽' },
  { key: 'soccer_epl', title: 'Premier League', icon: '⚽' },
  { key: 'icehockey_nhl', title: 'NHL', icon: '🏒' },
] as const;

export type SupportedSport = typeof SUPPORTED_SPORTS[number]['key'];
