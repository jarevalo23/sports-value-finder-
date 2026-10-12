// Team-name normalization for matching the same event across venues.
//
// Kalshi, Polymarket and sportsbooks name teams differently ("Man City" vs
// "Manchester City FC", "USA" vs "United States"). Matching is deterministic:
// accent/punctuation stripping, filler-token removal, an alias table, then a
// token-overlap fallback. An event that can't be matched confidently is
// reported as unmatched rather than guessed.

const FILLER_TOKENS = new Set(['fc', 'cf', 'afc', 'sc', 'ac', 'the', 'club', 'de', 'cd', 'national', 'team']);

// Canonical name -> known variants (already lower-case, accent-free).
const ALIASES: Record<string, string[]> = {
  'manchester city': ['man city', 'mcfc', 'man c'],
  'manchester united': ['man united', 'man utd', 'man u', 'mufc'],
  'tottenham hotspur': ['tottenham', 'spurs'],
  'wolverhampton wanderers': ['wolves', 'wolverhampton'],
  'brighton and hove albion': ['brighton', 'brighton hove albion'],
  'newcastle united': ['newcastle'],
  'west ham united': ['west ham'],
  'nottingham forest': ['nottm forest', "nott'm forest", 'forest'],
  'paris saint germain': ['psg', 'paris sg', 'paris saint-germain'],
  'inter milan': ['inter', 'internazionale'],
  'united states': ['usa', 'us', 'usmnt', 'united states of america'],
  'south korea': ['korea republic', 'korea'],
  'ivory coast': ["cote d'ivoire", 'cote divoire'],
  'bosnia and herzegovina': ['bosnia', 'bosnia herzegovina'],
};

const ALIAS_LOOKUP: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [canonical, variants] of Object.entries(ALIASES)) {
    map.set(canonical, canonical);
    for (const v of variants) map.set(basicNormalize(v), canonical);
  }
  return map;
})();

function basicNormalize(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !FILLER_TOKENS.has(t))
    .join(' ');
}

/**
 * Canonical key for a team name, stable across venues.
 */
export function canonicalTeam(name: string): string {
  const base = basicNormalize(name);
  return ALIAS_LOOKUP.get(base) ?? base;
}

export function isDrawLabel(label: string): boolean {
  return /^(draw|tie|the draw|x)$/i.test(label.trim()) || /\b(draw|tie)\b/i.test(label);
}

/**
 * Token-overlap (Jaccard) similarity of two canonical team keys, 0-1.
 */
export function teamSimilarity(a: string, b: string): number {
  const ca = canonicalTeam(a);
  const cb = canonicalTeam(b);
  if (ca === cb) return 1;
  const ta = new Set(ca.split(' '));
  const tb = new Set(cb.split(' '));
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return union === 0 ? 0 : inter / union;
}

/**
 * Split an event title like "Brazil vs. Haiti" or "Man City @ Liverpool" into
 * its two team names. Returns null when the title isn't a head-to-head.
 */
export function splitMatchup(title: string): { home: string; away: string } | null {
  const cleaned = title.replace(/\s*(winner|result|match)\??$/i, '').trim();
  const match = cleaned.match(/^(.+?)\s+(?:vs\.?|v\.?|@|at|-)\s+(.+)$/i);
  if (!match) return null;
  return { home: match[1].trim(), away: match[2].trim() };
}
