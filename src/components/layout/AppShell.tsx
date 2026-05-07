import type { ReactNode } from 'react';
import { BottomNav } from './BottomNav';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="relative min-h-[100dvh] bg-paper text-ink">
      <main className="relative pb-32">{children}</main>
      <BottomNav />
    </div>
  );
}
