import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  ValueBet,
  Game,
  DashboardStats,
  MarketType,
  BASELINE_BOOKMAKERS,
  SupportedSport,
} from '@/types/odds';
import { findValueBets } from '@/services/oddsApi';

interface OddsState {
  // Data
  games: Game[];
  valueBets: ValueBet[];
  lastUpdated: string | null;
  isLoading: boolean;
  error: string | null;

  // Filters
  selectedSports: SupportedSport[];
  selectedMarkets: MarketType[];
  minEdge: number;
  showHotOnly: boolean;

  // Settings
  baselineBookmakers: string[];
  valueThreshold: number;
  hotThreshold: number;
  autoRefresh: boolean;
  refreshInterval: number;

  // Actions
  setGames: (games: Game[]) => void;
  setValueBets: (valueBets: ValueBet[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  recalculateValueBets: () => void;

  // Filter actions
  toggleSport: (sport: SupportedSport) => void;
  toggleMarket: (market: MarketType) => void;
  setMinEdge: (edge: number) => void;
  setShowHotOnly: (show: boolean) => void;

  // Settings actions
  setBaselineBookmakers: (bookmakers: string[]) => void;
  setValueThreshold: (threshold: number) => void;
  setHotThreshold: (threshold: number) => void;
  setAutoRefresh: (auto: boolean) => void;
  setRefreshInterval: (interval: number) => void;

  // Computed
  getFilteredValueBets: () => ValueBet[];
  getDashboardStats: () => DashboardStats;
}

export const useOddsStore = create<OddsState>()(
  persist(
    (set, get) => ({
      // Initial data state
      games: [],
      valueBets: [],
      lastUpdated: null,
      isLoading: false,
      error: null,

      // Initial filter state
      selectedSports: ['basketball_nba', 'americanfootball_nfl'],
      selectedMarkets: ['h2h', 'spreads', 'totals'],
      minEdge: 0,
      showHotOnly: false,

      // Initial settings
      baselineBookmakers: [...BASELINE_BOOKMAKERS],
      valueThreshold: 0,
      hotThreshold: 10,
      autoRefresh: true,
      refreshInterval: 60000,

      // Actions
      setGames: (games) => {
        set({ games, lastUpdated: new Date().toISOString() });
        get().recalculateValueBets();
      },

      // Direct setter for value bets from Python backend
      setValueBets: (valueBets) => {
        set({ valueBets, lastUpdated: new Date().toISOString() });
      },

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error }),

      recalculateValueBets: () => {
        const { games, baselineBookmakers, valueThreshold, hotThreshold } = get();
        const valueBets = findValueBets(games, baselineBookmakers, valueThreshold, hotThreshold);
        set({ valueBets });
      },

      // Filter actions
      toggleSport: (sport) => {
        const { selectedSports } = get();
        const newSports = selectedSports.includes(sport)
          ? selectedSports.filter((s) => s !== sport)
          : [...selectedSports, sport];
        set({ selectedSports: newSports });
      },

      toggleMarket: (market) => {
        const { selectedMarkets } = get();
        const newMarkets = selectedMarkets.includes(market)
          ? selectedMarkets.filter((m) => m !== market)
          : [...selectedMarkets, market];
        set({ selectedMarkets: newMarkets });
      },

      setMinEdge: (minEdge) => set({ minEdge }),

      setShowHotOnly: (showHotOnly) => set({ showHotOnly }),

      // Settings actions
      setBaselineBookmakers: (bookmakers) => {
        set({ baselineBookmakers: bookmakers });
        get().recalculateValueBets();
      },

      setValueThreshold: (threshold) => {
        set({ valueThreshold: threshold });
        get().recalculateValueBets();
      },

      setHotThreshold: (threshold) => {
        set({ hotThreshold: threshold });
        get().recalculateValueBets();
      },

      setAutoRefresh: (autoRefresh) => set({ autoRefresh }),

      setRefreshInterval: (refreshInterval) => set({ refreshInterval }),

      // Computed getters
      getFilteredValueBets: () => {
        const { valueBets, selectedSports, selectedMarkets, minEdge, showHotOnly } = get();

        return valueBets.filter((bet) => {
          if (!selectedSports.includes(bet.sportKey as SupportedSport)) return false;
          if (!selectedMarkets.includes(bet.market)) return false;
          if (bet.edgePercentage < minEdge) return false;
          if (showHotOnly && !bet.isHot) return false;
          return true;
        });
      },

      getDashboardStats: () => {
        const filteredBets = get().getFilteredValueBets();
        const { lastUpdated } = get();

        if (filteredBets.length === 0) {
          return {
            totalOpportunities: 0,
            hotOpportunities: 0,
            averageEdge: 0,
            bestEdge: 0,
            sportsWithValue: [],
            lastUpdated: lastUpdated || new Date().toISOString(),
          };
        }

        const hotBets = filteredBets.filter((b) => b.isHot);
        const totalEdge = filteredBets.reduce((sum, bet) => sum + bet.edgePercentage, 0);
        const uniqueSports = [...new Set(filteredBets.map((b) => b.sportTitle))];

        return {
          totalOpportunities: filteredBets.length,
          hotOpportunities: hotBets.length,
          averageEdge: totalEdge / filteredBets.length,
          bestEdge: Math.max(...filteredBets.map((b) => b.edgePercentage)),
          sportsWithValue: uniqueSports,
          lastUpdated: lastUpdated || new Date().toISOString(),
        };
      },
    }),
    {
      name: 'odds-store',
      partialize: (state) => ({
        selectedSports: state.selectedSports,
        selectedMarkets: state.selectedMarkets,
        minEdge: state.minEdge,
        showHotOnly: state.showHotOnly,
        baselineBookmakers: state.baselineBookmakers,
        valueThreshold: state.valueThreshold,
        hotThreshold: state.hotThreshold,
        autoRefresh: state.autoRefresh,
        refreshInterval: state.refreshInterval,
      }),
    }
  )
);
