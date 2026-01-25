'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useOddsStore } from '@/store/oddsStore';

export function useOddsData() {
  const {
    selectedSports,
    selectedMarkets,
    setGames,
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
      });

      const response = await fetch(`/api/odds?${params}`);

      if (!response.ok) {
        throw new Error('Failed to fetch odds');
      }

      const result = await response.json();
      setGames(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  }, [selectedSports, selectedMarkets, setGames, setLoading, setError]);

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
