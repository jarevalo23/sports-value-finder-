'use client';

import { Header } from '@/components/ui/Header';
import { Dashboard } from '@/components/dashboard/Dashboard';

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--bg-primary)]">
      <Header />
      <Dashboard />
    </main>
  );
}
