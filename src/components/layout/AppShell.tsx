import type { ReactNode } from 'react';
import { BottomNav } from './BottomNav';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="relative min-h-[100dvh] bg-paper text-ink">
      <main
        className="relative"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 110px)' }}
      >
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
