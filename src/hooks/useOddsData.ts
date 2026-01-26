'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useOddsStore } from '@/store/oddsStore';

// Python backend URL - uses local in dev, can be configured for production
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export function useOddsData() {
  const {
    selectedSports,
    selectedMarkets,
    valueThreshold,
    hotThreshold,
    setValueBets,
    setLoading,
    setError,
    autoRefresh,
    refreshInterval,
    isLoading,
  } = useOddsStore();

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async () => {
    if (selectedSports.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        sports: selectedSports.join(','),
        markets: selectedMarkets.join(','),
        min_edge: valueThreshold.toString(),
        hot_threshold: hotThreshold.toString(),
      });

      // Call Python backend for value bets (all stats calculated server-side)
      const response = await fetch(`${API_BASE_URL}/api/value-bets?${params}`);

      if (!response.ok) {
        throw new Error('Failed to fetch value bets from Python backend');
      }

      const result = await response.json();

      // Transform snake_case to camelCase for frontend
      const valueBets = (result.data || []).map((bet: any) => ({
        id: bet.id,
        gameId: bet.game_id,
        sportKey: bet.sport_key,
        sportTitle: bet.sport_title,
        homeTeam: bet.home_team,
        awayTeam: bet.away_team,
        commenceTime: bet.commence_time,
        market: bet.market,
        selection: bet.selection,
        point: bet.point,
        bookmaker: bet.bookmaker,
        bookmakerTitle: bet.bookmaker_title,
        odds: bet.odds,
        impliedProbability: bet.implied_probability,
        baselineOdds: bet.baseline_odds,
        baselineImpliedProbability: bet.baseline_implied_prob,
        edge: bet.edge_percentage / 100,
        edgePercentage: bet.edge_percentage,
        expectedValue: bet.expected_value,
        timestamp: bet.timestamp,
        isHot: bet.is_hot,
      }));

      setValueBets(valueBets);
    } catch (err) {
      // Fallback to Next.js API if Python backend is unavailable
      try {
        const params = new URLSearchParams({
          sports: selectedSports.join(','),
          markets: selectedMarkets.join(','),
        });
        const response = await fetch(`/api/odds?${params}`);
        if (response.ok) {
          const result = await response.json();
          // Use the store's recalculate method as fallback
          useOddsStore.getState().setGames(result.data || []);
        }
      } catch {
        setError(err instanceof Error ? err.message : 'Unable to connect to backend');
      }
    } finally {
      setLoading(false);
    }
  }, [selectedSports, selectedMarkets, valueThreshold, hotThreshold, setValueBets, setLoading, setError]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchData, refreshInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh, refreshInterval, fetchData]);

  return {
    refetch: fetchData,
    isLoading,
  };
}
