import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Tests must never hit real upstreams or spend LLM tokens.
    env: { ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: '', KALSHI_SERIES_TICKER: '', POLYMARKET_LIVE: '', ODDS_API_KEY: '' },
  },
});
