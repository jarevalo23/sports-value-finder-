// Odds calculation utilities for value betting

/**
 * Convert American odds to decimal odds
 */
export function americanToDecimal(americanOdds: number): number {
  if (americanOdds > 0) {
    return (americanOdds / 100) + 1;
  } else {
    return (100 / Math.abs(americanOdds)) + 1;
  }
}

/**
 * Convert decimal odds to American odds
 */
export function decimalToAmerican(decimalOdds: number): number {
  if (decimalOdds >= 2) {
    return Math.round((decimalOdds - 1) * 100);
  } else {
    return Math.round(-100 / (decimalOdds - 1));
  }
}

/**
 * Calculate implied probability from American odds
 * Returns a value between 0 and 1
 */
export function impliedProbability(americanOdds: number): number {
  if (americanOdds > 0) {
    return 100 / (americanOdds + 100);
  } else {
    return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  }
}

/**
 * Calculate American odds from implied probability
 */
export function probabilityToAmerican(probability: number): number {
  if (probability >= 0.5) {
    return Math.round(-100 * probability / (1 - probability));
  } else {
    return Math.round(100 * (1 - probability) / probability);
  }
}

/**
 * Calculate the edge percentage
 * Positive edge means the bookmaker odds are better than baseline
 */
export function calculateEdge(
  bookmakerOdds: number,
  baselineOdds: number
): number {
  const bookmakerProb = impliedProbability(bookmakerOdds);
  const baselineProb = impliedProbability(baselineOdds);

  // Edge is the difference in implied probability
  // Positive edge means lower implied probability (better odds) at the bookmaker
  return baselineProb - bookmakerProb;
}

/**
 * Calculate edge percentage for display
 */
export function calculateEdgePercentage(
  bookmakerOdds: number,
  baselineOdds: number
): number {
  const edge = calculateEdge(bookmakerOdds, baselineOdds);
  return edge * 100;
}

/**
 * Calculate expected value given edge and stake
 */
export function calculateExpectedValue(
  odds: number,
  trueProbability: number,
  stake: number = 100
): number {
  const decimalOdds = americanToDecimal(odds);
  const profit = stake * (decimalOdds - 1);
  const ev = (trueProbability * profit) - ((1 - trueProbability) * stake);
  return ev;
}

/**
 * Calculate average odds from multiple bookmakers
 * Uses median to be more robust against outliers
 */
export function calculateAverageOdds(oddsList: number[]): number {
  if (oddsList.length === 0) return 0;

  // Convert to decimal, calculate average, convert back to American
  const decimalOdds = oddsList.map(americanToDecimal);
  const sorted = [...decimalOdds].sort((a, b) => a - b);

  // Use median for robustness
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;

  return decimalToAmerican(median);
}

/**
 * Calculate consensus implied probability from baseline bookmakers
 */
export function calculateConsensusImpliedProbability(oddsList: number[]): number {
  if (oddsList.length === 0) return 0.5;

  const probabilities = oddsList.map(impliedProbability);
  const sum = probabilities.reduce((acc, p) => acc + p, 0);
  return sum / probabilities.length;
}

/**
 * Remove the bookmaker margin from a set of mutually exclusive outcome
 * probabilities (multiplicative / proportional method) so they sum to 1.
 * Raw implied probabilities from a 2-way market typically sum to ~1.04-1.05.
 */
export function devigMultiplicative(probabilities: number[]): number[] {
  const total = probabilities.reduce((acc, p) => acc + p, 0);
  if (total <= 0) return probabilities.map(() => 0);
  return probabilities.map((p) => p / total);
}

/**
 * Overround (book margin) of a market: sum of implied probabilities minus 1.
 */
export function overround(probabilities: number[]): number {
  return probabilities.reduce((acc, p) => acc + p, 0) - 1;
}

/**
 * Expected value per $1 staked at the given decimal odds when the true win
 * probability is `trueProbability`. 0.05 means +5% return on stake.
 */
export function evPerDollar(trueProbability: number, decimalOdds: number): number {
  return trueProbability * decimalOdds - 1;
}

/**
 * Expected value per $1 for a binary $1-payout contract bought at `cost`
 * (price plus fees, in dollars) when it pays out with probability `p`.
 */
export function contractEvPerDollar(p: number, cost: number): number {
  if (cost <= 0) return 0;
  return p / cost - 1;
}

/**
 * Format American odds for display
 */
export function formatAmericanOdds(odds: number): string {
  if (odds > 0) {
    return `+${odds}`;
  }
  return odds.toString();
}

/**
 * Format probability as percentage
 */
export function formatProbability(prob: number): string {
  return `${(prob * 100).toFixed(1)}%`;
}

/**
 * Format edge percentage for display
 */
export function formatEdge(edge: number): string {
  const prefix = edge > 0 ? '+' : '';
  return `${prefix}${edge.toFixed(1)}%`;
}

/**
 * Get color class based on edge value
 */
export function getEdgeColorClass(edgePercentage: number): string {
  if (edgePercentage >= 15) return 'text-amber-400'; // Hot
  if (edgePercentage >= 10) return 'text-emerald-400'; // Strong
  if (edgePercentage >= 5) return 'text-cyan-400'; // Good
  if (edgePercentage >= 0) return 'text-slate-400'; // Neutral
  return 'text-red-400'; // Negative
}

/**
 * Get background color class based on edge value
 */
export function getEdgeBgClass(edgePercentage: number): string {
  if (edgePercentage >= 15) return 'bg-amber-500/20 border-amber-500/30';
  if (edgePercentage >= 10) return 'bg-emerald-500/20 border-emerald-500/30';
  if (edgePercentage >= 5) return 'bg-cyan-500/20 border-cyan-500/30';
  return 'bg-slate-500/10 border-slate-500/20';
}

/**
 * Determine if a bet is "hot" (>15% edge)
 */
export function isHotBet(edgePercentage: number, threshold: number = 15): boolean {
  return edgePercentage >= threshold;
}

/**
 * Calculate Kelly Criterion bet size (fraction of bankroll)
 * Returns a value between 0 and 1
 */
export function kellyBetSize(
  odds: number,
  trueProbability: number,
  fraction: number = 0.25 // Quarter Kelly for safety
): number {
  const decimalOdds = americanToDecimal(odds);
  const b = decimalOdds - 1; // Net odds
  const p = trueProbability;
  const q = 1 - p;

  const kelly = (b * p - q) / b;

  // Apply fractional Kelly and cap at 25% of bankroll
  return Math.max(0, Math.min(kelly * fraction, 0.25));
}

/**
 * Get market display name
 */
export function getMarketDisplayName(market: string): string {
  const names: Record<string, string> = {
    h2h: 'Moneyline',
    spreads: 'Spread',
    totals: 'Totals',
  };
  return names[market] || market;
}

/**
 * Format point spread or total
 */
export function formatPoint(point: number | undefined, market: string): string {
  if (point === undefined) return '';

  if (market === 'spreads') {
    return point > 0 ? `+${point}` : point.toString();
  }

  if (market === 'totals') {
    return point.toString();
  }

  return '';
}
